from pathlib import Path
from typing import Any

import cv2
import numpy as np
import onnxruntime as ort
from fastapi import HTTPException
from PIL import Image


from backend.app.core.paths import DETECTOR_MODELS_DIR, YOLO_MODEL_PATH
from backend.app.services.classifier_service import (
    LoadedClassifier,
    apply_model_preprocessing,
    image_to_array,
    vector_to_prediction_items,
)
from backend.app.services.analysis_onnx_service import Best9ONNXService

DEFAULT_CONFIDENCE_THRESHOLD = 0.5
BEST9_CONFIDENCE_THRESHOLD   = 0.25   # WBC hiếm (EO/ERB/MO) cần ngưỡng thấp hơn
DEFAULT_OVERLAP_RATIO = 0.25
DEFAULT_MAX_REGIONS = 64   # Reduced from 144 to save RAM on Render Free Tier (512MB)
DEFAULT_PADDING_RATIO = 0.0
DEFAULT_MIN_COMPONENT_AREA = 100  # ~18x18px — loại artifact bụi nhỏ, giữ PLT thật (~20-35px)
DEFAULT_MAX_DETECTIONS = 300  # Increased for improved detector (Monitor RAM on Render Free Tier)
DETECTION_MAX_DIMENSION = 2048  # Tăng từ 1536 để cải thiện detection PLT nhỏ trên ảnh hi-res
MIN_COMPONENT_SIDE = 18  # PLT thật ≥ 20px/chiều; bụi artifact ≤ 12px

DIAGNOSTIC_GROUP_BY_LABEL = {
    "BA": "BA",
    "BNE": "NE",
    "EO": "EO",
    "ERB": "ERB",
    "IG": "IG",
    "LY": "LY",
    "MMY": "IG",
    "MO": "MO",
    "MY": "IG",
    "MYO": "IG",
    "PLT": "PLT",
    "PMY": "IG",
    "RBC": "RBC",
    "SNE": "NE",
}
WBC_DIFFERENTIAL_LABELS = {"BA", "EO", "IG", "LY", "MO", "NE"}
RESAMPLING = getattr(Image, "Resampling", Image)

# ONNX Runtime sessions for YOLO detectors (lazy-loaded)
_YOLO_ONNX_SESSIONS: dict[str, ort.InferenceSession] = {}

# Class names embedded in best (9).pt (from pt['model'].names)
BEST9_CLASS_NAMES: dict[int, str] = {
    0: "BA", 1: "BNE", 2: "EO", 3: "ERB", 4: "LY",
    5: "MMY", 6: "MO", 7: "MY", 8: "PLT", 9: "PMY",
    10: "RBC", 11: "SNE", 12: "IG", 13: "MYO",
}
BEST9_CLASS_LIST: list[str] = [BEST9_CLASS_NAMES[i] for i in sorted(BEST9_CLASS_NAMES)]


def slugify_detector_id(path: Path) -> str:
    return path.stem.lower().replace(" ", "_").replace("(", "").replace(")", "")


def compute_adaptive_padding(box_w: int, box_h: int) -> float:
    """Tính padding ratio thích nghi theo kích thước tế bào, ôm sát biên để tránh nhiễu tế bào lân cận.

    Nguyên tắc:
    - Tế bào nhỏ (PLT ~20-35px): cần nhiều padding một chút để có ngữ cảnh nền.
    - Tế bào lớn (WBC ~100-150px): ôm sát cực độ (2%) tránh viền tế bào hồng cầu bên cạnh lọt vào.
    """
    cell_size = max(box_w, box_h)
    if cell_size < 35:   return 0.15   # PLT / hạt bào cực nhỏ (giảm từ 0.35 xuống 0.15)
    if cell_size < 60:   return 0.10   # ERB, LY nhỏ, PLT lớn (giảm từ 0.22 xuống 0.10)
    if cell_size < 100:  return 0.05   # LY trung bình, MO nhỏ (giảm từ 0.15 xuống 0.05)
    return 0.02                         # WBC lớn (BNE, SNE, MO lớn) (giảm từ 0.10 xuống 0.02)


def discover_detector_paths() -> list[Path]:
    """Chỉ scan .onnx files — không còn hỗ trợ .pt (ultralytics)."""
    paths = sorted(DETECTOR_MODELS_DIR.glob("*.onnx"))
    return paths



def is_unified_detector(detector_id: str) -> bool:
    """Return True for YOLO models that also carry 14-class cell labels (detect+classify in one pass)."""
    return detector_id in ("best_9", "best9")


def list_detector_models() -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for path in discover_detector_paths():
        detector_id = slugify_detector_id(path)
        if detector_id in ("best_9", "best9"):
            display_name = "YOLOv13"
        elif detector_id == "blood_cell_best":
            display_name = "Blood Cell Detector (Improved)"
        else:
            display_name = path.stem.replace("-", " ").replace("_", " ").title()
        items.append(
            {
                "detector_model_id": detector_id,
                "display_name": display_name,
                "model_path": path.name,
                "unified": is_unified_detector(detector_id),
            }
        )
    return items


def resolve_detector_path(detector_model_id: str | None = None) -> Path:
    paths = discover_detector_paths()
    if not paths:
        raise RuntimeError("Không tìm thấy file detector .onnx trong thư mục models/detectors.")

    registry = {slugify_detector_id(path): path for path in paths}
    default_id = slugify_detector_id(YOLO_MODEL_PATH) if YOLO_MODEL_PATH.exists() else slugify_detector_id(paths[0])
    selected_id = str(detector_model_id or default_id).strip() or default_id
    path = registry.get(selected_id)
    if path is None:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy detector_model_id '{selected_id}'.")
    return path


def _make_onnx_session_opts() -> ort.SessionOptions:
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 1
    opts.inter_op_num_threads = 1
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    return opts


def _yolo_preprocess(image: np.ndarray, imgsz: int = 640):
    """YOLO preprocessing: letterbox resize + normalize + NCHW."""
    h0, w0 = image.shape[:2]
    scale = imgsz / max(h0, w0)
    nh, nw = int(h0 * scale), int(w0 * scale)

    # Dùng INTER_CUBIC để giữ độ sắc nét biên tế bào tốt hơn
    resized = cv2.resize(image, (nw, nh), interpolation=cv2.INTER_CUBIC)
    canvas = np.full((imgsz, imgsz, 3), 114, dtype=np.uint8)
    pt = (imgsz - nh) // 2
    pl = (imgsz - nw) // 2
    canvas[pt:pt+nh, pl:pl+nw] = resized

    tensor = canvas.astype(np.float32) / 255.0
    tensor = np.transpose(tensor, (2, 0, 1))[np.newaxis]  # NCHW

    meta = {"scale": scale, "pad_top": pt, "pad_left": pl,
            "orig_h": h0, "orig_w": w0}
    return tensor, meta


def _yolo_postprocess(outputs: list, meta: dict, conf_thres: float = 0.20, iou_thres: float = 0.45):
    """YOLOv8 ONNX postprocessing: extract boxes, NMS, return xyxy list."""
    pred = outputs[0]
    if pred.ndim == 3 and pred.shape[1] < pred.shape[2]:
        pred = np.transpose(pred, (0, 2, 1))
    pred = pred[0]

    scale = meta["scale"]
    pl, pt = meta["pad_left"], meta["pad_top"]
    ow, oh = meta["orig_w"], meta["orig_h"]

    # YOLOv8: [cx, cy, w, h, cls1, cls2, ...]
    num_classes = pred.shape[1] - 4
    raw_boxes, raw_scores = [], []

    for det in pred:
        cx, cy, w, h = det[:4]
        cls_scores = det[4:]
        conf = cls_scores.max()
        if conf < conf_thres:
            continue

        # Tính toán tọa độ float chính xác cao
        x1 = (cx - w/2 - pl) / scale
        y1 = (cy - h/2 - pt) / scale
        x2 = (cx + w/2 - pl) / scale
        y2 = (cy + h/2 - pt) / scale
        
        # Clip về giới hạn ảnh gốc
        x1, x2 = np.clip([x1, x2], 0, ow)
        y1, y2 = np.clip([y1, y2], 0, oh)

        raw_boxes.append([x1, y1, x2 - x1, y2 - y1])
        raw_scores.append(float(conf))

    if not raw_boxes:
        return []

    indices = cv2.dnn.NMSBoxes(raw_boxes, raw_scores, conf_thres, iou_thres)
    kept = []
    for i in (indices.flatten() if len(indices) else []):
        x, y, w, h = raw_boxes[i]
        kept.append({
            "x1": int(round(x)),
            "y1": int(round(y)),
            "x2": int(round(x + w)),
            "y2": int(round(y + h)),
            "score": float(raw_scores[i]),
        })
    return kept


def initialize_detection_runtime(detector_model_id: str | None = None) -> ort.InferenceSession:
    """Initialize YOLO ONNX detection runtime (no ultralytics needed)."""
    global _YOLO_ONNX_SESSIONS
    detector_path = resolve_detector_path(detector_model_id)
    detector_id = slugify_detector_id(detector_path)

    if detector_id not in _YOLO_ONNX_SESSIONS:
        if not detector_path.exists() or detector_path.stat().st_size == 0:
            raise RuntimeError(f"Detector ONNX file not found or empty: {detector_path}")
        import logging
        logging.getLogger(__name__).info(f"🚀 LOADING DETECTOR: {detector_path}")
        _YOLO_ONNX_SESSIONS[detector_id] = ort.InferenceSession(
            str(detector_path),
            sess_options=_make_onnx_session_opts(),
            providers=["CPUExecutionProvider"],
        )
    return _YOLO_ONNX_SESSIONS[detector_id]



def normalize_probability_value(value: float, field_name: str) -> float:
    numeric_value = float(value)
    if 0 <= numeric_value <= 1:
        return numeric_value
    if 1 < numeric_value <= 100:
        return numeric_value / 100
    raise HTTPException(status_code=400, detail=f"{field_name} phải nằm trong khoảng 0-1 hoặc 0-100.")


def normalize_positive_int(value: int, field_name: str, *, minimum: int, maximum: int) -> int:
    numeric_value = int(value)
    if minimum <= numeric_value <= maximum:
        return numeric_value
    raise HTTPException(status_code=400, detail=f"{field_name} phải nằm trong khoảng {minimum}-{maximum}.")


def compute_positions(length: int, window: int, stride: int) -> list[int]:
    if length <= window:
        return [0]

    positions = list(range(0, max(length - window, 0) + 1, max(stride, 1)))
    last_position = max(length - window, 0)
    if not positions or positions[-1] != last_position:
        positions.append(last_position)
    return positions


def build_region_grid(
    image_size: tuple[int, int],
    window_size: tuple[int, int],
    overlap_ratio: float,
    max_regions: int,
) -> tuple[list[int], list[int], float]:
    width, height = image_size
    window_width, window_height = window_size
    stride_x = max(1, int(window_width * (1 - overlap_ratio)))
    stride_y = max(1, int(window_height * (1 - overlap_ratio)))

    positions_x = compute_positions(width, window_width, stride_x)
    positions_y = compute_positions(height, window_height, stride_y)

    while len(positions_x) * len(positions_y) > max_regions and (stride_x < window_width or stride_y < window_height):
        stride_x = min(window_width, stride_x + max(8, window_width // 8))
        stride_y = min(window_height, stride_y + max(8, window_height // 8))
        positions_x = compute_positions(width, window_width, stride_x)
        positions_y = compute_positions(height, window_height, stride_y)

    effective_overlap = max(0.0, 1 - min(stride_x / window_width, stride_y / window_height))
    return positions_x, positions_y, round(effective_overlap, 4)


def build_analysis_batch(
    image: Image.Image,
    overlap_ratio: float,
    max_regions: int,
    classifier: LoadedClassifier,
) -> tuple[np.ndarray, list[dict[str, int]], float]:
    positions_x, positions_y, effective_overlap = build_region_grid(
        image.size,
        (classifier.input_width, classifier.input_height),
        overlap_ratio,
        max_regions,
    )
    patches: list[np.ndarray] = []
    regions: list[dict[str, int]] = []

    for y in positions_y:
        for x in positions_x:
            right = min(x + classifier.input_width, image.width)
            bottom = min(y + classifier.input_height, image.height)
            patch = image.crop((x, y, right, bottom))
            patches.append(image_to_array(patch, classifier=classifier))
            regions.append({"x": int(x), "y": int(y), "width": int(right - x), "height": int(bottom - y)})

    batch = np.stack(patches, axis=0)
    return apply_model_preprocessing(batch, classifier.preprocessing), regions, effective_overlap


def summarize_grid_analysis(
    predictions: np.ndarray,
    regions: list[dict[str, int]],
    confidence_threshold: float,
    classifier: LoadedClassifier,
) -> dict[str, Any]:
    region_predictions: list[dict[str, Any]] = []
    aggregate: dict[int, dict[str, Any]] = {}

    for region_index, (vector, region) in enumerate(zip(predictions, regions, strict=False), start=1):
        ranked = vector_to_prediction_items(vector, classifier.class_names)
        best = ranked[0]
        # Temperature Scaling đã được áp dụng trong OnnxClassifierAdapter.predict()
        region_result = {
            "region_id": region_index,
            "box": region,
            "label": best["label"],
            "class_index": best["index"],
            "confidence": best["confidence"],
        }
        region_predictions.append(region_result)

        if best["confidence"] < confidence_threshold:
            continue

        bucket = aggregate.setdefault(
            best["index"],
            {
                "label": best["label"],
                "class_index": best["index"],
                "count": 0,
                "confidence_sum": 0.0,
                "max_confidence": 0.0,
            },
        )
        bucket["count"] += 1
        bucket["confidence_sum"] += best["confidence"]
        bucket["max_confidence"] = max(bucket["max_confidence"], best["confidence"])

    detected_region_count = sum(item["count"] for item in aggregate.values())
    estimated_counts = sorted(
        (
            {
                "label": item["label"],
                "class_index": item["class_index"],
                "count": item["count"],
                "ratio": (item["count"] / detected_region_count) if detected_region_count else 0.0,
                "average_confidence": (item["confidence_sum"] / item["count"]) if item["count"] else 0.0,
                "max_confidence": item["max_confidence"],
            }
            for item in aggregate.values()
        ),
        key=lambda item: (-item["count"], -item["average_confidence"], item["label"]),
    )

    dominant_cell_type = estimated_counts[0] if estimated_counts else None
    # average_confidence: tính từ tất cả regions (kể cả dưới threshold)
    all_confidences = [item["confidence"] for item in region_predictions]

    return {
        "analyzed_region_count": len(region_predictions),
        "detected_region_count": detected_region_count,
        "estimated_total_cells": detected_region_count,
        "average_confidence": float(np.mean(all_confidences)) if all_confidences else 0.0,
        "average_region_confidence": float(np.mean(all_confidences)) if all_confidences else 0.0,

        "dominant_cell_type": dominant_cell_type,
        "estimated_counts": estimated_counts,
        "region_predictions": region_predictions,
    }


def image_to_rgb_array(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("RGB"), dtype=np.uint8)


def resize_for_detection(image: Image.Image) -> tuple[Image.Image, float]:
    max_dimension = max(image.width, image.height)
    if max_dimension <= DETECTION_MAX_DIMENSION:
        return image, 1.0

    scale = DETECTION_MAX_DIMENSION / float(max_dimension)
    resized = image.resize(
        (max(1, int(round(image.width * scale))), max(1, int(round(image.height * scale)))),
        RESAMPLING.BILINEAR,
    )
    return resized, scale


def build_candidate_mask(image_array: np.ndarray) -> np.ndarray:
    gray = image_array.mean(axis=2).astype(np.float32)
    c_max = image_array.max(axis=2).astype(np.float32)
    c_min = image_array.min(axis=2).astype(np.float32)
    channel_delta = c_max - c_min

    bright_reference = float(np.percentile(gray, 90))
    dark_reference = float(np.percentile(gray, 15))
    dynamic_range = max(bright_reference - dark_reference, 18.0)
    brightness_threshold = bright_reference - max(10.0, dynamic_range * 0.28)

    mask_dark = gray <= brightness_threshold
    mask_color = (channel_delta >= max(12.0, dynamic_range * 0.14)) & (gray <= bright_reference - 4.0)
    mask = np.logical_or(mask_dark, mask_color).astype(np.uint8) * 255

    kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel_close)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel_open)
    return mask


def estimate_slide_background_color(image: Image.Image) -> tuple[int, int, int]:
    """Ước lượng màu nền của slide ảnh bằng cách lấy trung vị của các pixel sáng nhất."""
    small_img = image.resize((100, 100))
    arr = np.array(small_img)
    gray = arr.mean(axis=-1)
    threshold = np.percentile(gray, 90)
    bg_pixels = arr[gray >= threshold]
    if len(bg_pixels) > 0:
        median_color = np.median(bg_pixels, axis=0)
        return tuple(map(int, median_color))
    return (114, 114, 114)


def tighten_box_to_cell(image: Image.Image, box: dict[str, Any]) -> dict[str, Any]:
    """Co khít khung YOLO vào sát tế bào đích ở tâm bằng cách phân tích thành phần liên thông.
    
    Giúp loại bỏ viền của các hồng cầu lân cận ở bốn góc và khoảng trắng dư thừa.
    """
    x1, y1, x2, y2 = int(box["x1"]), int(box["y1"]), int(box["x2"]), int(box["y2"])
    w = x2 - x1
    h = y2 - y1
    if w <= 20 or h <= 20:
        return box

    crop = image.crop((x1, y1, x2, y2))
    crop_np = np.array(crop)
    mask = build_candidate_mask(crop_np)

    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask)
    if num_labels <= 1:
        return box

    cx, cy = w / 2, h / 2
    best_idx = -1
    min_dist = float("inf")

    for i in range(1, num_labels):
        stat = stats[i]
        if stat[cv2.CC_STAT_AREA] < max(100, int(w * h * 0.05)):
            continue

        bx1 = stat[cv2.CC_STAT_LEFT]
        by1 = stat[cv2.CC_STAT_TOP]
        bw = stat[cv2.CC_STAT_WIDTH]
        bh = stat[cv2.CC_STAT_HEIGHT]
        bx2 = bx1 + bw
        by2 = by1 + bh

        centroid = centroids[i]
        dist = np.sqrt((centroid[0] - cx)**2 + (centroid[1] - cy)**2)

        is_containing_center = (bx1 <= cx <= bx2) and (by1 <= cy <= by2)
        if is_containing_center:
            dist = dist * 0.1

        if dist < min_dist:
            min_dist = dist
            best_idx = i

    if best_idx != -1:
        stat = stats[best_idx]
        bx1 = stat[cv2.CC_STAT_LEFT]
        by1 = stat[cv2.CC_STAT_TOP]
        bw = stat[cv2.CC_STAT_WIDTH]
        bh = stat[cv2.CC_STAT_HEIGHT]

        if bw > int(w * 0.40) and bh > int(h * 0.40):
            new_x1 = max(0, x1 + bx1)
            new_y1 = max(0, y1 + by1)
            new_x2 = min(image.width, x1 + bx1 + bw)
            new_y2 = min(image.height, y1 + by1 + bh)

            if (new_x2 - new_x1) * (new_y2 - new_y1) < w * h:
                return {
                    **box,
                    "x1": new_x1,
                    "y1": new_y1,
                    "x2": new_x2,
                    "y2": new_y2,
                }

    return box


def extract_connected_components(mask: np.ndarray) -> list[dict[str, int]]:
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    components: list[dict[str, int]] = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        rect_area = w * h
        if rect_area > 0:
            components.append(
                {
                    "x1": int(x),
                    "y1": int(y),
                    "x2": int(x + w),
                    "y2": int(y + h),
                    "width": int(w),
                    "height": int(h),
                    "area": int(cv2.contourArea(contour)),
                    "rect_area": int(rect_area),
                }
            )
    return components


def expand_box_xyxy(
    box: tuple[int, int, int, int],
    padding_ratio: float,
    image_size: tuple[int, int],
) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = box
    width = x2 - x1
    height = y2 - y1
    pad_x = max(1, int(round(width * padding_ratio)))
    pad_y = max(1, int(round(height * padding_ratio)))

    image_width, image_height = image_size
    return (
        max(0, x1 - pad_x),
        max(0, y1 - pad_y),
        min(image_width, x2 + pad_x),
        min(image_height, y2 + pad_y),
    )


def crop_with_symmetrical_padding(
    image: Image.Image,
    box: tuple[int, int, int, int],
    padding_ratio: float,
    fill_color: tuple[int, int, int] = (114, 114, 114),
) -> Image.Image:
    """Cắt ảnh tế bào với padding đối xứng.
    Nếu tế bào ở biên bị cắt (out-of-bounds), phần bị thiếu sẽ được đệm thêm màu xám trung tính 114
    để giữ tế bào luôn nằm chính giữa khung hình, tránh làm lệch tâm tế bào khi đưa vào model phân loại.
    """
    x1, y1, x2, y2 = box
    width = x2 - x1
    height = y2 - y1
    pad_x = max(1, int(round(width * padding_ratio)))
    pad_y = max(1, int(round(height * padding_ratio)))

    # Tọa độ lý thuyết (có thể vượt biên ảnh)
    tx1 = x1 - pad_x
    ty1 = y1 - pad_y
    tx2 = x2 + pad_x
    ty2 = y2 + pad_y

    # Tọa độ thực tế nằm trong biên ảnh
    cx1 = max(0, tx1)
    cy1 = max(0, ty1)
    cx2 = min(image.width, tx2)
    cy2 = min(image.height, ty2)

    # Cắt phần hợp lệ
    cropped = image.crop((cx1, cy1, cx2, cy2))

    # Tính toán khoảng cần bù thêm do vượt biên
    pad_left = cx1 - tx1
    pad_top = cy1 - ty1
    pad_right = tx2 - cx2
    pad_bottom = ty2 - cy2

    if pad_left > 0 or pad_top > 0 or pad_right > 0 or pad_bottom > 0:
        # Tạo canvas mới kích thước lý thuyết và dán ảnh crop vào
        target_w = tx2 - tx1
        target_h = ty2 - ty1
        canvas = Image.new("RGB", (target_w, target_h), fill_color)
        canvas.paste(cropped, (pad_left, pad_top))
        return canvas

    return cropped


def box_to_xywh(box: dict[str, int]) -> dict[str, int]:
    return {
        "x": int(box["x1"]),
        "y": int(box["y1"]),
        "width": int(box["x2"] - box["x1"]),
        "height": int(box["y2"] - box["y1"]),
    }


def compute_iou(box1: dict[str, int], box2: dict[str, int]) -> float:
    x1 = max(box1["x1"], box2["x1"])
    y1 = max(box1["y1"], box2["y1"])
    x2 = min(box1["x2"], box2["x2"])
    y2 = min(box1["y2"], box2["y2"])
    inter_area = max(0, x2 - x1) * max(0, y2 - y1)
    if inter_area == 0:
        return 0.0
    area1 = (box1["x2"] - box1["x1"]) * (box1["y2"] - box1["y1"])
    area2 = (box2["x2"] - box2["x1"]) * (box2["y2"] - box2["y1"])
    return inter_area / float(area1 + area2 - inter_area)


def detect_cell_boxes(
    image: Image.Image,
    *,
    min_component_area: int,
    max_detections: int,
    confidence_threshold: float = 0.25,
    detector_model_id: str | None = None,
) -> list[dict[str, int]]:
    import time
    t0 = time.perf_counter()
    raw_boxes: list[dict[str, int]] = []

    # Bước 1: Resize 1 lần duy nhất, dùng lại cho cả mask và YOLO
    detection_image, scale = resize_for_detection(image)
    image_array = image_to_rgb_array(detection_image)
    total_pixels = detection_image.width * detection_image.height
    total_img_pixels = image.width * image.height  # tính sẵn ra ngoài vòng lặp

    # Bước 2: YOLO ONNX inference trên ảnh đã resize trước tiên
    yolo_session = initialize_detection_runtime(detector_model_id)
    image_np = image_to_rgb_array(detection_image)
    tensor, meta = _yolo_preprocess(image_np, imgsz=640)
    input_name = yolo_session.get_inputs()[0].name
    outputs = yolo_session.run(None, {input_name: tensor})
    # Ngưỡng 0.20 để align với NMS score_threshold=0.25, giảm false positive từ ảnh nhiễu
    # (Trước đây 0.15 tạo nhiều box rác phải lọc lại ở NMS, ảnh hưởng hiệu suất và chính xác)
    yolo_conf_threshold = 0.20
    yolo_boxes = _yolo_postprocess(outputs, meta, conf_thres=yolo_conf_threshold, iou_thres=0.45)

    for box in yolo_boxes:
        area = (box["x2"] - box["x1"]) * (box["y2"] - box["y1"])
        if area < min_component_area:
            continue
        # Cho ảnh nhỏ (<= 640px), cho phép box chiếm tới 90% ảnh
        # Cho ảnh lớn, giới hạn 25% để tránh box quá to
        if max(detection_image.width, detection_image.height) <= 640:
            max_yolo_area = int(total_pixels * 0.90)
        else:
            max_yolo_area = int(total_pixels * 0.25)
        if area > max_yolo_area:
            continue
        # Scale bbox từ detection_image (resize) về kích thước ảnh gốc
        raw_boxes.append(
            {
                "x1": int(round(box["x1"] / scale)),
                "y1": int(round(box["y1"] / scale)),
                "x2": int(round(box["x2"] / scale)),
                "y2": int(round(box["y2"] / scale)),
                "score": box["score"],  # Dùng score thực tế từ YOLO
            }
        )

    # Co khít toàn bộ hộp thô phát hiện được để bám sát tế bào thực tế
    raw_boxes = [tighten_box_to_cell(image, b) for b in raw_boxes]

    t1 = time.perf_counter()

    # Bước 3: Contour detection làm fallback (chỉ chạy khi YOLO không detect được hộp nào)
    if not raw_boxes:
        mask = build_candidate_mask(image_array)
        components = extract_connected_components(mask)

        adaptive_min_area = max(int(min_component_area), max(300, int(total_pixels * 0.0004)))
        # Cho ảnh nhỏ (<= 640px), cho phép box chiếm tới 90% ảnh
        # Cho ảnh lớn, giới hạn 25% để tránh box quá to
        if max(detection_image.width, detection_image.height) <= 640:
            adaptive_max_area = int(total_pixels * 0.90)
        else:
            adaptive_max_area = int(total_pixels * 0.25)

        for component in components:
            rect_area = component.get("rect_area", component["area"])
            if rect_area < adaptive_min_area or rect_area > adaptive_max_area:
                continue
            if component["width"] < MIN_COMPONENT_SIDE or component["height"] < MIN_COMPONENT_SIDE:
                continue
            aspect_ratio = max(
                component["width"] / float(component["height"]),
                component["height"] / float(component["width"]),
            )
            if aspect_ratio > 4.5:
                continue

            raw_boxes.append(
                {
                    "x1": int(round(component["x1"] / scale)),
                    "y1": int(round(component["y1"] / scale)),
                    "x2": int(round(component["x2"] / scale)),
                    "y2": int(round(component["y2"] / scale)),
                    "score": 0.4,  # Điểm tin cậy thấp cho thuật toán truyền thống
                }
            )

    t2 = time.perf_counter()

    for box in raw_boxes:
        box["area"] = (box["x2"] - box["x1"]) * (box["y2"] - box["y1"])

    # Bước 4: NMS với cv2 (DÙNG SCORE THAY VÌ DIỆN TÍCH)
    if raw_boxes:
        nms_input_boxes = [
            [b["x1"], b["y1"], b["x2"] - b["x1"], b["y2"] - b["y1"]] for b in raw_boxes
        ]
        nms_scores = [float(b["score"]) for b in raw_boxes]  # Score chuẩn từ model
        # IoU threshold 0.40 (tăng từ 0.30): tránh merge WBC chạm nhau trên slide dày đặc
        # (Hai WBC chạm nhau thường có IoU=0.35-0.45, dưới 0.30 chúng bị merge thành 1 box)
        indices = cv2.dnn.NMSBoxes(nms_input_boxes, nms_scores, score_threshold=0.25, nms_threshold=0.40)
        kept_boxes = [raw_boxes[i] for i in (indices.flatten() if len(indices) else [])]
    else:
        kept_boxes = []

    t3 = time.perf_counter()

    # Bước 5: Giữ hộp KHÍT cho UI (không padding ở bước này)
    boxes: list[dict[str, int]] = []
    for kept in kept_boxes:
        x1, y1, x2, y2 = kept["x1"], kept["y1"], kept["x2"], kept["y2"]
        boxes.append(
            {
                "x1": int(x1),
                "y1": int(y1),
                "x2": int(x2),
                "y2": int(y2),
                "area": int((x2 - x1) * (y2 - y1)),
            }
        )

    boxes.sort(key=lambda item: (-item["area"], item["y1"], item["x1"]))
    boxes = boxes[:max_detections]
    boxes.sort(key=lambda item: (item["y1"], item["x1"]))

    t4 = time.perf_counter()
    import logging
    logger = logging.getLogger(__name__)
    logger.info(
        f"detect_cell_boxes | contour={1000*(t1-t0):.0f}ms "
        f"yolo={1000*(t2-t1):.0f}ms "
        f"nms={1000*(t3-t2):.0f}ms "
        f"total={1000*(t4-t0):.0f}ms "
        f"boxes={len(boxes)}"
    )
    return boxes


def run_batch_prediction(crops: list[Image.Image], classifier: LoadedClassifier) -> np.ndarray:
    if not crops:
        return np.empty((0, classifier.num_classes), dtype=np.float32)

    batch = np.stack([image_to_array(crop, classifier=classifier) for crop in crops], axis=0)
    preprocessed = apply_model_preprocessing(batch, classifier.preprocessing)
    raw = classifier.model.predict(preprocessed, verbose=0)
    # YoloClassificationAdapter already returns np.ndarray; TF models return TF tensors
    return np.asarray(raw, dtype=np.float32)


def aggregate_prediction_buckets(buckets: dict[Any, dict[str, Any]], total_count: int) -> list[dict[str, Any]]:
    aggregated = []
    for bucket in buckets.values():
        count = int(bucket["count"])
        item = {
            "label": bucket["label"],
            "count": count,
            "ratio": (count / total_count) if total_count else 0.0,
            "average_confidence": (bucket["confidence_sum"] / count) if count else 0.0,
            "max_confidence": bucket["max_confidence"],
        }
        if "class_index" in bucket:
            item["class_index"] = bucket["class_index"]
        if "member_labels" in bucket:
            item["member_labels"] = sorted(bucket["member_labels"])
        aggregated.append(item)

    aggregated.sort(key=lambda item: (-item["count"], -item["average_confidence"], item["label"]))
    return aggregated


# ── Model calibration ────────────────────────────────────────────────────────
# KHÔNG CÒN BUFF THỦ CÔNG.
# Temperature Scaling (T=0.511) được áp dụng tự động trong
# OnnxClassifierAdapter.predict() cho model blood_cell_final.
# Xem classifier_service.py _TEMPERATURE_MAP và _apply_temperature_scaling.
def check_crop_has_nucleus(crop: Image.Image) -> bool:
    """Kiểm tra xem ảnh crop tế bào có chứa nhân (vùng sẫm màu) hay không.
    Mặc định, nhân tế bào bạch cầu/hồng cầu non (ERB) nhuộm màu tím sẫm (mật độ màu tối).
    Hồng cầu trưởng thành (RBC) không nhân và chỉ có màu hồng sáng.
    """
    arr = np.array(crop.convert("RGB"))
    # Loại bỏ vùng đệm màu xám YOLO (114, 114, 114) nếu có
    is_pad = (arr[:, :, 0] == 114) & (arr[:, :, 1] == 114) & (arr[:, :, 2] == 114)
    cell_pixels = arr[~is_pad]
    
    if cell_pixels.size == 0:
        return False
        
    gray = cell_pixels.mean(axis=-1)
    p5 = np.percentile(gray, 5)
    return p5 < 115.0


def summarize_slide_count(
    predictions: np.ndarray,
    boxes: list[dict[str, int]],
    confidence_threshold: float,
    classifier: LoadedClassifier,
    image_width: int,
    image_height: int,
    crops: list[Image.Image] | None = None,
) -> dict[str, Any]:
    cells: list[dict[str, Any]] = []
    raw_buckets: dict[int, dict[str, Any]] = {}
    grouped_buckets: dict[str, dict[str, Any]] = {}

    cell_id_counter = 1
    for idx, (vector, box) in enumerate(zip(predictions, boxes, strict=False)):
        ranked = vector_to_prediction_items(vector, classifier.class_names)
        best = ranked[0]
        
        # Nếu phân loại thành bạch cầu hoặc hồng cầu non nhưng ảnh crop không chứa nhân sẫm màu
        if crops and idx < len(crops) and best["raw_label"] in {"BA", "BNE", "EO", "ERB", "IG", "LY", "MMY", "MO", "MY", "MYO", "PMY", "SNE"}:
            if not check_crop_has_nucleus(crops[idx]):
                rbc_item = next((item for item in ranked if item["raw_label"] == "RBC"), None)
                if rbc_item:
                    best = rbc_item.copy()
                    best["confidence"] = max(ranked[0]["confidence"], 0.75)
        
        # Lọc tế bào chạm biên nếu đoán thành WBC/ERB -> chuyển sang RBC (tránh tự tin ảo ở rìa ảnh)
        # Chỉ áp dụng nếu ảnh đủ lớn (không phải ảnh test đã crop sẵn) và kích thước box nhỏ (không phải WBC thật)
        is_border = (
            box["x1"] <= 3 or 
            box["y1"] <= 3 or 
            box["x2"] >= image_width - 3 or 
            box["y2"] >= image_height - 3
        )
        box_w = box["x2"] - box["x1"]
        box_h = box["y2"] - box["y1"]
        # Threshold 40px: chỉ PLT/hạt thực sự nhỏ bị force RBC ở biên.
        # 75px cũ quá rộng: LY (50-80px), MO (60-100px) bị sai lầm chuyển thành RBC.
        is_small_cell = (box_w <= 40 and box_h <= 40)
        is_real_slide = (image_width > 350 and image_height > 350)
        
        if is_border and is_real_slide and is_small_cell and best["raw_label"] in {"BA", "BNE", "EO", "ERB", "IG", "LY", "MMY", "MO", "MY", "MYO", "PMY", "SNE"}:
            rbc_item = next((item for item in ranked if item["raw_label"] == "RBC"), None)
            if rbc_item:
                best = rbc_item.copy()
                best["confidence"] = max(ranked[0]["confidence"], 0.51)  # Giữ độ tự tin cao để ko bị lọc dưới threshold
            
        # Temperature Scaling đã được áp dụng trong OnnxClassifierAdapter.predict()
        grouped_label = DIAGNOSTIC_GROUP_BY_LABEL.get(best["raw_label"], best["raw_label"])
        counted = best["confidence"] >= confidence_threshold

        cell_item = {
            "cell_id": cell_id_counter,
            "box": box_to_xywh(box),
            "crop_size": {"width": int(box["x2"] - box["x1"]), "height": int(box["y2"] - box["y1"])},
            "label": best["label"],
            "raw_label": best["raw_label"],
            "group_label": grouped_label,
            "class_index": best["index"],
            "confidence": best["confidence"],
            "counted": counted,
            "top_predictions": ranked[:3],
        }
        cells.append(cell_item)
        cell_id_counter += 1

        if not counted:
            continue

        raw_bucket = raw_buckets.setdefault(
            best["index"],
            {
                "label": best["label"],
                "class_index": best["index"],
                "count": 0,
                "confidence_sum": 0.0,
                "max_confidence": 0.0,
            },
        )
        raw_bucket["count"] += 1
        raw_bucket["confidence_sum"] += best["confidence"]
        raw_bucket["max_confidence"] = max(raw_bucket["max_confidence"], best["confidence"])

        grouped_bucket = grouped_buckets.setdefault(
            grouped_label,
            {
                "label": grouped_label,
                "count": 0,
                "confidence_sum": 0.0,
                "max_confidence": 0.0,
                "member_labels": set(),
            },
        )
        grouped_bucket["count"] += 1
        grouped_bucket["confidence_sum"] += best["confidence"]
        grouped_bucket["max_confidence"] = max(grouped_bucket["max_confidence"], best["confidence"])
        grouped_bucket["member_labels"].add(best["raw_label"])

    classified_cell_count = sum(bucket["count"] for bucket in raw_buckets.values())
    estimated_counts = aggregate_prediction_buckets(raw_buckets, classified_cell_count)
    grouped_counts = aggregate_prediction_buckets(grouped_buckets, classified_cell_count)

    wbc_buckets = {label: bucket for label, bucket in grouped_buckets.items() if label in WBC_DIFFERENTIAL_LABELS}
    total_wbc_count = sum(bucket["count"] for bucket in wbc_buckets.values())
    wbc_differential = aggregate_prediction_buckets(wbc_buckets, total_wbc_count)

    dominant_cell_type = estimated_counts[0] if estimated_counts else None
    # average_confidence: tính từ tất cả cells (kể cả dưới threshold) để phản ánh đúng độ tin cậy tổng thể
    average_confidence = float(np.mean([item["confidence"] for item in cells])) if cells else 0.0
    average_region_confidence = average_confidence  # same value, different name for backward compat


    return {
        "analyzed_region_count": len(cells),
        "detected_region_count": classified_cell_count,
        "detected_cell_count": len(cells),
        "classified_cell_count": classified_cell_count,
        "estimated_total_cells": classified_cell_count,
        "average_confidence": average_confidence,
        "average_region_confidence": average_region_confidence,
        "dominant_cell_type": dominant_cell_type,
        "estimated_counts": estimated_counts,
        "grouped_counts": grouped_counts,
        "wbc_differential": wbc_differential,
        "region_predictions": [
            {
                "region_id": item["cell_id"],
                "box": item["box"],
                "label": item["label"],
                "class_index": item["class_index"],
                "confidence": item["confidence"],
            }
            for item in cells
        ],
        "cells": cells,
    }


def prepare_slide_count_candidates(
    image: Image.Image,
    *,
    padding_ratio: float,
    min_component_area: int,
    max_detections: int,
    confidence_threshold: float,
    detector_model_id: str | None = None,
    classifier: LoadedClassifier | None = None,
) -> tuple[list[dict[str, int]], list[Image.Image], bool]:
    fallback_used = False
    
    # Nếu ảnh nhỏ (<= 300px ở cả 2 chiều) → bỏ qua detection, đưa thẳng cho classifier
    # Vì ảnh nhỏ thường là ảnh đã crop sẵn 1 tế bào, detection chỉ gây nhiễu
    if image.width <= 300 and image.height <= 300:
        boxes = [{"x1": 0, "y1": 0, "x2": image.width, "y2": image.height, "area": image.width * image.height}]
        fallback_used = True
    else:
        boxes = detect_cell_boxes(
            image,
            min_component_area=min_component_area,
            max_detections=max_detections,
            confidence_threshold=confidence_threshold,
            detector_model_id=detector_model_id,
        )
        # Nếu detection không tìm thấy box nào → coi cả ảnh là 1 candidate duy nhất
        if not boxes:
            boxes = [{"x1": 0, "y1": 0, "x2": image.width, "y2": image.height, "area": image.width * image.height}]
            fallback_used = True

    crops = []
    kept_boxes = []
    
    from backend.app.services.classifier_service import is_background_crop
    
    # Ước lượng màu nền của slide ảnh thực tế
    slide_bg_color = estimate_slide_background_color(image)
    
    for box in boxes:
        # Adaptive padding: tế bào nhỏ (PLT) cần nhiều context hơn tế bào lớn (WBC)
        box_w = box["x2"] - box["x1"]
        box_h = box["y2"] - box["y1"]
        # Cho phép người dùng ghi đè hoàn toàn tỷ lệ padding nếu được đặt cụ thể (> 0.0)
        effective_padding = padding_ratio if padding_ratio > 0.0 else compute_adaptive_padding(box_w, box_h)
        crop = crop_with_symmetrical_padding(
            image, 
            (box["x1"], box["y1"], box["x2"], box["y2"]), 
            effective_padding,
            fill_color=slide_bg_color
        )

        # Bỏ qua các khung rác hoặc mảnh viền tế bào quá nhỏ (chỉ chứa trên 95% nền trắng)
        # Giữ các tế bào nằm một phần lớn ở biên
        if not is_background_crop(crop):
            crops.append(crop)
            kept_boxes.append(box)

    return kept_boxes, crops, fallback_used


def run_slide_count_analysis(
    image: Image.Image,
    *,
    filename: str | None,
    classifier: LoadedClassifier,
    confidence_threshold: float,
    padding_ratio: float,
    min_component_area: int,
    max_detections: int,
    detector_model_id: str | None = None,
) -> dict[str, Any]:
    boxes, crops, fallback_used = prepare_slide_count_candidates(
        image,
        padding_ratio=padding_ratio,
        min_component_area=min_component_area,
        max_detections=max_detections,
        confidence_threshold=confidence_threshold,
        detector_model_id=detector_model_id,
        classifier=classifier,
    )
    predictions = run_batch_prediction(crops, classifier)
    summary = summarize_slide_count(
        predictions, boxes, confidence_threshold, classifier,
        image_width=image.width, image_height=image.height,
        crops=crops
    )

    return {
        "mode": "analyze",
        "analysis_mode": "slide_count",
        "selected_model_id": classifier.model_id,
        "selected_model_name": classifier.display_name,
        "input_shape": classifier.input_shape,
        "preprocessing": classifier.preprocessing,
        "filename": filename,
        "image_size": {"width": image.width, "height": image.height},
        "confidence_threshold": confidence_threshold,
        "padding_ratio": padding_ratio,
        "min_component_area": min_component_area,
        "max_detections": max_detections,
        "fallback_used": fallback_used,
        "analysis_method": "Detect, crop with padding, then classify with the selected model",
        "count_unit": "detected cells",
        "note": (
            f"This result uses the '{classifier.display_name}' model with a detect-then-classify pipeline. "
            + (
                "Detector fallback used the whole image as one candidate because no cell box was found. "
                if fallback_used
                else ""
            )
            + "Counts come from isolated cell candidates, not from a sliding grid."
        ),
        **summary,
    }


def build_comparison_entry(result: dict[str, Any]) -> dict[str, Any]:
    dominant = result.get("dominant_cell_type")
    dominant_label = dominant.get("label") if isinstance(dominant, dict) else dominant
    grouped_counts = result.get("grouped_counts") or []
    return {
        "model_id": result["selected_model_id"],
        "display_name": result["selected_model_name"],
        "input_shape": result["input_shape"],
        "preprocessing": result["preprocessing"],
        "detected_cell_count": result.get("detected_cell_count", 0),
        "classified_cell_count": result.get("classified_cell_count", 0),
        "estimated_total_cells": result.get("estimated_total_cells", 0),
        "average_confidence": result.get("average_confidence", 0.0),
        "average_region_confidence": result.get("average_region_confidence", 0.0),
        "dominant_label": dominant_label or "Không rõ",
        "top_group_label": grouped_counts[0].get("label") if grouped_counts else None,
        "top_group_count": grouped_counts[0].get("count") if grouped_counts else 0,
        "fallback_used": result.get("fallback_used", False),
        "execution_time_ms": result.get("execution_time_ms", 0.0),
    }


def run_model_comparison(
    image: Image.Image,
    *,
    filename: str | None,
    model_ids: list[str],
    confidence_threshold: float,
    padding_ratio: float,
    min_component_area: int,
    max_detections: int,
    detector_model_id: str | None = None,
) -> dict[str, Any]:
    """
    So sánh các model theo thứ tự (load → chạy → giải phóng từng model một).
    Giữ RAM trong giới hạn 512MB Render Free bằng cách không giữ 2+ model trong bộ nhớ cùng lúc.
    """
    import gc
    from backend.app.services.classifier_service import get_classifier, evict_classifier

    # Bước 1: Phát hiện tế bào trước (không cần classifier, chỉ dùng contour+YOLO-detector)
    boxes, crops, fallback_used = prepare_slide_count_candidates(
        image,
        padding_ratio=padding_ratio,
        min_component_area=min_component_area,
        max_detections=max_detections,
        confidence_threshold=confidence_threshold,
        detector_model_id=detector_model_id,
        classifier=None,
    )

    # Bước 2: Chạy từng model tuần tự, giải phóng RAM giữa các lượt
    model_results: list[dict[str, Any]] = []
    comparison_rows: list[dict[str, Any]] = []

    import time

    for model_id in model_ids:
        t_model_start = time.perf_counter()
        try:
            classifier = get_classifier(model_id)

            if classifier.unified or classifier.model_id == "best9":
                result = run_yolo_unified_analysis(
                    image,
                    filename=filename,
                    confidence_threshold=confidence_threshold,
                    max_detections=max_detections,
                )
                result["note"] = "Unified model uses its own built-in detection and classification."
            else:
                predictions = run_batch_prediction(crops, classifier)
                summary = summarize_slide_count(
                    predictions, boxes, confidence_threshold, classifier,
                    image_width=image.width, image_height=image.height,
                    crops=crops
                )
                result = {
                    "mode": "analyze",
                    "analysis_mode": "slide_count",
                    "selected_model_id": classifier.model_id,
                    "selected_model_name": classifier.display_name,
                    "input_shape": classifier.input_shape,
                    "preprocessing": classifier.preprocessing,
                    "filename": filename,
                    "image_size": {"width": image.width, "height": image.height},
                    "confidence_threshold": confidence_threshold,
                    "padding_ratio": padding_ratio,
                    "min_component_area": min_component_area,
                    "max_detections": max_detections,
                    "fallback_used": fallback_used,
                    "analysis_method": "Detect once, classify shared crops across multiple models",
                    "count_unit": "detected cells",
                    "note": "All compared models use the same detected boxes and crops for a fair comparison.",
                    **summary,
                }

            # Lưu tốc độ chạy của model này (ms)
            result["execution_time_ms"] = (time.perf_counter() - t_model_start) * 1000
            model_results.append(result)
            comparison_rows.append(build_comparison_entry(result))

        finally:
            # Giải phóng ONNX session của model này trước khi load model tiếp theo
            evict_classifier(model_id)
            gc.collect()

    best_by_average_confidence = max(comparison_rows, key=lambda item: item["average_confidence"], default=None)
    best_by_detected_cells = max(comparison_rows, key=lambda item: item["detected_cell_count"], default=None)

    return {
        "mode": "compare_models",
        "analysis_mode": "slide_count",
        "filename": filename,
        "image_size": {"width": image.width, "height": image.height},
        "confidence_threshold": confidence_threshold,
        "padding_ratio": padding_ratio,
        "min_component_area": min_component_area,
        "max_detections": max_detections,
        "shared_detection": {
            "box_count": len(boxes),
            "fallback_used": fallback_used,
            "boxes": boxes,
        },
        "models": model_results,
        "comparison_rows": comparison_rows,
        "best_by_average_confidence": best_by_average_confidence,
        "best_by_detected_cells": best_by_detected_cells,
        "note": "So sánh này chạy tuần tự từng model (load→chạy→giải phóng) để tiết kiệm RAM.",
    }


# ---------------------------------------------------------------------------
# Best9 unified analysis (YOLO detection model with built-in 14-class labels)
# ---------------------------------------------------------------------------

def _build_best9_prob_vector(boxes_data: Any, nc: int) -> np.ndarray:
    """Convert YOLO detection rows [x1,y1,x2,y2,conf,cls] to a soft prob vector."""
    scores = np.zeros(nc, dtype=np.float32)
    if boxes_data is not None and len(boxes_data) > 0:
        arr = np.asarray(boxes_data)
        for row in arr:
            cls = int(row[5]) if row.shape[0] > 5 else 0
            conf = float(row[4]) if row.shape[0] > 4 else 0.0
            if 0 <= cls < nc:
                scores[cls] = max(scores[cls], conf)
    total = float(scores.sum())
    return scores / total if total > 0 else np.ones(nc, dtype=np.float32) / nc


def run_yolo_unified_analysis(
    image: Image.Image,
    *,
    filename: str | None,
    confidence_threshold: float,
    max_detections: int,
) -> dict[str, Any]:
    """Run best (9).pt as a unified detect+classify model.

    Each YOLO bounding box already carries a class index (0-13) and a
    confidence score, so no separate classifier is required.  The output
    shape is compatible with the standard ``slide_count`` response.
    """
    # nc = len(BEST9_CLASS_LIST)  # Already defined in module
    class_names = BEST9_CLASS_LIST
    nc = len(class_names)

    # Use ONNX Service for inference (YOLOv13 compatibility)
    svc = Best9ONNXService.get_instance(conf_thres=max(0.01, BEST9_CONFIDENCE_THRESHOLD * 0.5))
    
    # Tiling strategy for high-res images
    width, height = image.size
    window_size = 640
    if width <= 1024 and height <= 1024:
        image_np = np.array(image.convert("RGB"))
        onnx_result = svc.analyze(image_np)
        if not onnx_result["success"]:
            from fastapi import HTTPException as _H
            raise _H(status_code=500, detail=f"Lỗi Inference Best9 ONNX: {onnx_result.get('error')}")
    else:
        # Large image: Sliding window (Tiling)
        overlap = 0.25
        pos_x, pos_y, _ = build_region_grid(image.size, (window_size, window_size), overlap, 1000)
        
        raw_boxes, raw_scores, raw_cls, raw_probs = [], [], [], []
        for y in pos_y:
            for x in pos_x:
                patch = image.crop((x, y, min(x + window_size, width), min(y + window_size, height)))
                res = svc.analyze(np.array(patch.convert("RGB")))
                if res["success"]:
                    for d in res["detections"]:
                        bx1, by1, bx2, by2 = d["bbox"]
                        gx1, gy1, gx2, gy2 = bx1 + x, by1 + y, bx2 + x, by2 + y
                        raw_boxes.append([gx1, gy1, gx2 - gx1, gy2 - gy1])
                        raw_scores.append(d["score"])
                        raw_cls.append(d["class_id"])
                        raw_probs.append(d["probs"])
        
        # Global NMS to merge overlapping patches
        indices = cv2.dnn.NMSBoxes(raw_boxes, raw_scores, confidence_threshold * 0.5, 0.45)
        final_detections = []
        for i in (indices.flatten() if len(indices) else []):
            bx, by, bw, bh = raw_boxes[i]
            final_detections.append({
                "bbox": [bx, by, bx + bw, by + bh],
                "score": raw_scores[i],
                "class_id": raw_cls[i],
                "probs": raw_probs[i]
            })
        onnx_result = {"success": True, "detections": final_detections}

    # Convert detections logic removed as we iterate directly over onnx_result["detections"]

    cells: list[dict[str, Any]] = []
    raw_buckets: dict[int, dict[str, Any]] = {}
    grouped_buckets: dict[int, dict[str, Any]] = {}

    cell_id_counter = 1
    for d in onnx_result["detections"]:
        x1, y1, x2, y2 = d["bbox"]
        
        # Kiểm tra xem vùng tế bào có bị cắt góc nghiêm trọng (trở thành nền trống) hay không
        crop = image.crop((int(x1), int(y1), int(x2), int(y2)))
        from backend.app.services.classifier_service import is_background_crop
        if is_background_crop(crop):
            continue

        conf = d["score"]
        cls = d["class_id"]
        probs = d["probs"]

        if not (0 <= cls < nc):
            continue

        raw_label = class_names[cls]
        
        # Nếu được nhận diện là bạch cầu hoặc hồng cầu non nhưng crop không hề chứa nhân tế bào sẫm màu
        if raw_label in {"BA", "BNE", "EO", "ERB", "IG", "LY", "MMY", "MO", "MY", "MYO", "PMY", "SNE"}:
            if not check_crop_has_nucleus(crop):
                rbc_cls = class_names.index("RBC")
                cls = rbc_cls
                raw_label = "RBC"
                conf = max(conf, 0.75)
                new_probs = np.zeros(nc, dtype=np.float32)
                new_probs[rbc_cls] = conf
                probs = new_probs
        
        # Kiểm tra chạm biên đối với model unified YOLO -> chuyển sang RBC (tránh tự tin ảo ở rìa ảnh)
        # Chỉ áp dụng nếu ảnh đủ lớn (không phải ảnh test đã crop sẵn) và kích thước box nhỏ (không phải WBC thật)
        is_border = (
            x1 <= 3 or 
            y1 <= 3 or 
            x2 >= image.width - 3 or 
            y2 >= image.height - 3
        )
        box_w = x2 - x1
        box_h = y2 - y1
        # Đồng bộ với summarize_slide_count: chỉ force RBC cho PLT thực sự nhỏ (≤40px)
        is_small_cell = (box_w <= 40 and box_h <= 40)
        is_real_slide = (image.width > 350 and image.height > 350)
        
        if is_border and is_real_slide and is_small_cell and raw_label in {"BA", "BNE", "EO", "ERB", "IG", "LY", "MMY", "MO", "MY", "MYO", "PMY", "SNE"}:
            rbc_cls = class_names.index("RBC")
            cls = rbc_cls
            raw_label = "RBC"
            conf = max(conf, 0.51)
            # Tạo vector xác suất mới có RBC chiếm ưu thế
            new_probs = np.zeros(nc, dtype=np.float32)
            new_probs[rbc_cls] = conf
            probs = new_probs
            
        grouped_label = DIAGNOSTIC_GROUP_BY_LABEL.get(raw_label, raw_label)
        _count_thresh = BEST9_CONFIDENCE_THRESHOLD if confidence_threshold <= 0.0 else confidence_threshold
        counted = conf >= _count_thresh

        # Use the actual probability vector from ONNX
        ranked = vector_to_prediction_items(np.array(probs), class_names)

        cell_item = {
            "cell_id": cell_id_counter,
            "box": {"x": int(x1), "y": int(y1), "width": max(1, int(x2 - x1)), "height": max(1, int(y2 - y1))},
            "crop_size": {"width": max(1, int(x2 - x1)), "height": max(1, int(y2 - y1))},
            "label": raw_label,
            "raw_label": raw_label,
            "group_label": grouped_label,
            "class_index": cls,
            "confidence": conf,
            "counted": counted,
            "top_predictions": ranked[:3],
        }
        cells.append(cell_item)
        cell_id_counter += 1

        if not counted:
            continue

        rb = raw_buckets.setdefault(
            cls,
            {"label": raw_label, "class_index": cls, "count": 0, "confidence_sum": 0.0, "max_confidence": 0.0},
        )
        rb["count"] += 1
        rb["confidence_sum"] += conf
        rb["max_confidence"] = max(rb["max_confidence"], conf)

        gb = grouped_buckets.setdefault(
            grouped_label,
            {"label": grouped_label, "count": 0, "confidence_sum": 0.0, "max_confidence": 0.0, "member_labels": set()},
        )
        gb["count"] += 1
        gb["confidence_sum"] += conf
        gb["max_confidence"] = max(gb["max_confidence"], conf)
        gb["member_labels"].add(raw_label)

    classified_cell_count = sum(b["count"] for b in raw_buckets.values())
    estimated_counts = aggregate_prediction_buckets(raw_buckets, classified_cell_count)
    grouped_counts = aggregate_prediction_buckets(grouped_buckets, classified_cell_count)

    wbc_buckets = {lbl: b for lbl, b in grouped_buckets.items() if lbl in WBC_DIFFERENTIAL_LABELS}
    total_wbc = sum(b["count"] for b in wbc_buckets.values())
    wbc_differential = aggregate_prediction_buckets(wbc_buckets, total_wbc)

    dominant_cell_type = estimated_counts[0] if estimated_counts else None
    # average_confidence: tính từ tất cả cells (kể cả dưới threshold) để phản ánh đúng độ tin cậy tổng thể
    avg_conf = float(np.mean([c["confidence"] for c in cells])) if cells else 0.0
    avg_region_conf = avg_conf  # same value, different name for backward compat


    return {
        "mode": "analyze",
        "analysis_mode": "slide_count",
        "selected_model_id": "best9",
        "selected_model_name": "YOLOv13",
        "input_shape": [640, 640, 3],
        "preprocessing": "yolo_detect",
        "filename": filename,
        "image_size": {"width": image.width, "height": image.height},
        "confidence_threshold": confidence_threshold,
        "padding_ratio": 0.0,
        "min_component_area": 0,
        "max_detections": max_detections,
        "fallback_used": False,
        "analysis_method": "Single-pass YOLO detection with built-in 14-class cell labels",
        "count_unit": "detected cells",
        "note": "YOLOv13 phát hiện và phân loại tế bào trong một lần chạy duy nhất (unified detect+classify).",
        "analyzed_region_count": len(cells),
        "detected_region_count": classified_cell_count,
        "detected_cell_count": len(cells),
        "classified_cell_count": classified_cell_count,
        "estimated_total_cells": classified_cell_count,
        "average_confidence": avg_conf,
        "average_region_confidence": avg_region_conf,
        "dominant_cell_type": dominant_cell_type,
        "estimated_counts": estimated_counts,
        "grouped_counts": grouped_counts,
        "wbc_differential": wbc_differential,
        "region_predictions": [
            {
                "region_id": c["cell_id"],
                "box": c["box"],
                "label": c["label"],
                "class_index": c["class_index"],
                "confidence": c["confidence"],
            }
            for c in cells
        ],
        "cells": cells,
    }
