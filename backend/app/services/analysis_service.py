from pathlib import Path
from typing import Any

import cv2
import numpy as np
from fastapi import HTTPException
from PIL import Image
from ultralytics import YOLO

from backend.app.core.paths import DETECTOR_MODELS_DIR, YOLO_MODEL_PATH
from backend.app.services.classifier_service import (
    LoadedClassifier,
    apply_model_preprocessing,
    get_classifier_registry,
    image_to_array,
    vector_to_prediction_items,
)


DEFAULT_CONFIDENCE_THRESHOLD = 0.5
DEFAULT_OVERLAP_RATIO = 0.25
DEFAULT_MAX_REGIONS = 144
DEFAULT_PADDING_RATIO = 0.10
DEFAULT_MIN_COMPONENT_AREA = 80
DEFAULT_MAX_DETECTIONS = 256
DETECTION_MAX_DIMENSION = 1536
MIN_COMPONENT_SIDE = 10

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

_YOLO_MODEL: YOLO | None = None
_YOLO_MODELS: dict[str, YOLO] = {}


def slugify_detector_id(path: Path) -> str:
    return path.stem.lower().replace(" ", "_").replace("(", "").replace(")", "")


def discover_detector_paths() -> list[Path]:
    paths = sorted(DETECTOR_MODELS_DIR.glob("*.pt"))
    if YOLO_MODEL_PATH.exists() and YOLO_MODEL_PATH not in paths:
        paths.insert(0, YOLO_MODEL_PATH)
    return paths


def list_detector_models() -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for path in discover_detector_paths():
        detector_id = slugify_detector_id(path)
        display_name = "Best9 YOLO" if detector_id == "best9" else path.stem.replace("-", " ").replace("_", " ").title()
        items.append(
            {
                "detector_model_id": detector_id,
                "display_name": display_name,
                "model_path": path.name,
            }
        )
    return items


def resolve_detector_path(detector_model_id: str | None = None) -> Path:
    paths = discover_detector_paths()
    if not paths:
        raise RuntimeError("Không tìm thấy file detector .pt trong thư mục models/detectors.")

    registry = {slugify_detector_id(path): path for path in paths}
    default_id = slugify_detector_id(YOLO_MODEL_PATH) if YOLO_MODEL_PATH.exists() else slugify_detector_id(paths[0])
    selected_id = str(detector_model_id or default_id).strip() or default_id
    path = registry.get(selected_id)
    if path is None:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy detector_model_id '{selected_id}'.")
    return path


def initialize_detection_runtime(detector_model_id: str | None = None) -> YOLO:
    global _YOLO_MODEL
    detector_path = resolve_detector_path(detector_model_id)
    detector_id = slugify_detector_id(detector_path)
    if detector_model_id is None and _YOLO_MODEL is not None and detector_id == slugify_detector_id(YOLO_MODEL_PATH):
        return _YOLO_MODEL
    if detector_id not in _YOLO_MODELS:
        _YOLO_MODELS[detector_id] = YOLO(detector_path)
    if detector_id == slugify_detector_id(YOLO_MODEL_PATH):
        _YOLO_MODEL = _YOLO_MODELS[detector_id]
    return _YOLO_MODELS[detector_id]


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

    all_best_confidences = [item["confidence"] for item in region_predictions]
    detected_confidences = [item["average_confidence"] for item in estimated_counts for _ in range(item["count"])]
    dominant_cell_type = estimated_counts[0] if estimated_counts else None

    return {
        "analyzed_region_count": len(region_predictions),
        "detected_region_count": detected_region_count,
        "estimated_total_cells": detected_region_count,
        "average_confidence": float(np.mean(detected_confidences)) if detected_confidences else 0.0,
        "average_region_confidence": float(np.mean(all_best_confidences)) if all_best_confidences else 0.0,
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
    padding_ratio: float,
    min_component_area: int,
    max_detections: int,
    detector_model_id: str | None = None,
) -> list[dict[str, int]]:
    raw_boxes: list[dict[str, int]] = []

    detection_image, scale = resize_for_detection(image)
    image_array = image_to_rgb_array(detection_image)
    mask = build_candidate_mask(image_array)
    components = extract_connected_components(mask)

    total_pixels = detection_image.width * detection_image.height
    adaptive_min_area = max(int(min_component_area), max(20, int(total_pixels * 0.0001)))
    adaptive_max_area = int(total_pixels * 1.0)

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
            }
        )

    yolo_model = initialize_detection_runtime(detector_model_id)
    results = yolo_model(image, conf=0.15, verbose=False)
    boxes_result = results[0].boxes.data.cpu().numpy()

    for row in boxes_result:
        x1_raw, y1_raw, x2_raw, y2_raw, _conf, _cls = row
        area = (x2_raw - x1_raw) * (y2_raw - y1_raw)
        if area < min_component_area:
            continue
        raw_boxes.append(
            {
                "x1": int(round(x1_raw)),
                "y1": int(round(y1_raw)),
                "x2": int(round(x2_raw)),
                "y2": int(round(y2_raw)),
            }
        )

    for box in raw_boxes:
        box["area"] = (box["x2"] - box["x1"]) * (box["y2"] - box["y1"])

    raw_boxes.sort(key=lambda item: item["area"], reverse=True)
    kept_boxes: list[dict[str, int]] = []
    for box in raw_boxes:
        overlap = False
        for kept in kept_boxes:
            if compute_iou(box, kept) > 0.4:
                overlap = True
                break
        if not overlap:
            kept_boxes.append(box)

    boxes: list[dict[str, int]] = []
    for kept in kept_boxes:
        expanded_box = expand_box_xyxy((kept["x1"], kept["y1"], kept["x2"], kept["y2"]), padding_ratio, image.size)
        x1, y1, x2, y2 = expanded_box
        boxes.append(
            {
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "area": int((x2 - x1) * (y2 - y1)),
            }
        )

    boxes.sort(key=lambda item: (-item["area"], item["y1"], item["x1"]))
    boxes = boxes[:max_detections]
    boxes.sort(key=lambda item: (item["y1"], item["x1"]))
    return boxes


def run_batch_prediction(crops: list[Image.Image], classifier: LoadedClassifier) -> np.ndarray:
    if not crops:
        return np.empty((0, classifier.num_classes), dtype=np.float32)

    batch = np.stack([image_to_array(crop, classifier=classifier) for crop in crops], axis=0)
    predictions = classifier.model.predict(apply_model_preprocessing(batch, classifier.preprocessing), verbose=0)
    return np.asarray(predictions, dtype=np.float32)


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


def summarize_slide_count(
    predictions: np.ndarray,
    boxes: list[dict[str, int]],
    confidence_threshold: float,
    classifier: LoadedClassifier,
) -> dict[str, Any]:
    cells: list[dict[str, Any]] = []
    raw_buckets: dict[int, dict[str, Any]] = {}
    grouped_buckets: dict[str, dict[str, Any]] = {}

    for cell_index, (vector, box) in enumerate(zip(predictions, boxes, strict=False), start=1):
        ranked = vector_to_prediction_items(vector, classifier.class_names)
        best = ranked[0]
        grouped_label = DIAGNOSTIC_GROUP_BY_LABEL.get(best["raw_label"], best["raw_label"])
        counted = best["confidence"] >= confidence_threshold

        cell_item = {
            "cell_id": cell_index,
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
    average_confidence = (
        float(np.mean([item["average_confidence"] for item in estimated_counts for _ in range(item["count"])]))
        if estimated_counts
        else 0.0
    )
    average_region_confidence = float(np.mean([item["confidence"] for item in cells])) if cells else 0.0

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
    detector_model_id: str | None = None,
) -> tuple[list[dict[str, int]], list[Image.Image], bool]:
    boxes = detect_cell_boxes(
        image,
        padding_ratio=padding_ratio,
        min_component_area=min_component_area,
        max_detections=max_detections,
        detector_model_id=detector_model_id,
    )
    fallback_used = False
    max_width = max(classifier.input_width for classifier in get_classifier_registry().values())
    max_height = max(classifier.input_height for classifier in get_classifier_registry().values())
    if not boxes and image.width <= int(max_width * 1.5) and image.height <= int(max_height * 1.5):
        boxes = [{"x1": 0, "y1": 0, "x2": image.width, "y2": image.height, "area": image.width * image.height}]
        fallback_used = True

    crops = [image.crop((box["x1"], box["y1"], box["x2"], box["y2"])) for box in boxes]
    return boxes, crops, fallback_used


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
        detector_model_id=detector_model_id,
    )
    predictions = run_batch_prediction(crops, classifier)
    summary = summarize_slide_count(predictions, boxes, confidence_threshold, classifier)

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
    }


def run_model_comparison(
    image: Image.Image,
    *,
    filename: str | None,
    classifiers: list[LoadedClassifier],
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
        detector_model_id=detector_model_id,
    )

    model_results: list[dict[str, Any]] = []
    comparison_rows: list[dict[str, Any]] = []
    for classifier in classifiers:
        predictions = run_batch_prediction(crops, classifier)
        summary = summarize_slide_count(predictions, boxes, confidence_threshold, classifier)
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
        model_results.append(result)
        comparison_rows.append(build_comparison_entry(result))

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
        },
        "models": model_results,
        "comparison_rows": comparison_rows,
        "best_by_average_confidence": best_by_average_confidence,
        "best_by_detected_cells": best_by_detected_cells,
        "note": "So sánh này dùng cùng một bộ frame crop cho tất cả model để tránh chênh lệch do detector.",
    }
