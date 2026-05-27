# -*- coding: utf-8 -*-
"""
Debug độc lập: Kiểm tra detection pipeline trên ảnh ERB đơn lẻ
Không phụ thuộc vào fastapi
"""
import sys, os, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import numpy as np
import cv2
from PIL import Image

IMAGE_PATH = "ERB_59475_cell_0.jpg"

# ── Copy các hàm cần thiết từ analysis_service ──────────────────────────────
MIN_COMPONENT_SIDE = 18
DETECTION_MAX_DIMENSION = 1536

def image_to_rgb_array(image):
    return np.asarray(image.convert("RGB"), dtype=np.uint8)

def resize_for_detection(image):
    max_dimension = max(image.width, image.height)
    if max_dimension <= DETECTION_MAX_DIMENSION:
        return image, 1.0
    scale = DETECTION_MAX_DIMENSION / float(max_dimension)
    resized = image.resize(
        (max(1, int(round(image.width * scale))), max(1, int(round(image.height * scale)))),
        Image.BILINEAR,
    )
    return resized, scale

def build_candidate_mask(image_array):
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

def extract_connected_components(mask):
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    components = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        rect_area = w * h
        if rect_area > 0:
            components.append({
                "x1": int(x), "y1": int(y), "x2": int(x + w), "y2": int(y + h),
                "width": int(w), "height": int(h),
                "area": int(cv2.contourArea(contour)),
                "rect_area": int(rect_area),
            })
    return components

def _yolo_preprocess(image, imgsz=640):
    h0, w0 = image.shape[:2]
    scale = imgsz / max(h0, w0)
    nh, nw = int(h0 * scale), int(w0 * scale)
    resized = cv2.resize(image, (nw, nh), interpolation=cv2.INTER_CUBIC)
    canvas = np.full((imgsz, imgsz, 3), 114, dtype=np.uint8)
    pt = (imgsz - nh) // 2
    pl = (imgsz - nw) // 2
    canvas[pt:pt+nh, pl:pl+nw] = resized
    tensor = canvas.astype(np.float32) / 255.0
    tensor = np.transpose(tensor, (2, 0, 1))[np.newaxis]
    meta = {"scale": scale, "pad_top": pt, "pad_left": pl, "orig_h": h0, "orig_w": w0}
    return tensor, meta

def _yolo_postprocess(outputs, meta, conf_thres=0.20, iou_thres=0.45):
    pred = outputs[0]
    if pred.ndim == 3 and pred.shape[1] < pred.shape[2]:
        pred = np.transpose(pred, (0, 2, 1))
    pred = pred[0]
    scale = meta["scale"]
    pl, pt = meta["pad_left"], meta["pad_top"]
    ow, oh = meta["orig_w"], meta["orig_h"]
    raw_boxes, raw_scores = [], []
    for det in pred:
        cx, cy, w, h = det[:4]
        cls_scores = det[4:]
        conf = cls_scores.max()
        if conf < conf_thres:
            continue
        x1 = (cx - w/2 - pl) / scale
        y1 = (cy - h/2 - pt) / scale
        x2 = (cx + w/2 - pl) / scale
        y2 = (cy + h/2 - pt) / scale
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
            "x1": int(round(x)), "y1": int(round(y)),
            "x2": int(round(x + w)), "y2": int(round(y + h)),
            "score": float(raw_scores[i]),
        })
    return kept

print("=" * 80)
print(f"DEBUG DETECTION: {IMAGE_PATH}")
print("=" * 80)

# Load ảnh
image = Image.open(IMAGE_PATH).convert("RGB")
print(f"\n📐 Image size: {image.size}")

# ── Bước 1: Resize ──────────────────────────────────────────────────────────
detection_image, scale = resize_for_detection(image)
print(f"\n{'='*60}")
print(f"BƯỚC 1: Resize (scale={scale})")
print(f"{'='*60}")
print(f"  Detection image size: {detection_image.size}")

# ── Bước 2: Contour detection ───────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"BƯỚC 2: Contour detection")
print(f"{'='*60}")

image_array = image_to_rgb_array(detection_image)
print(f"  Image array: {image_array.shape}, range [{image_array.min()}, {image_array.max()}]")

mask = build_candidate_mask(image_array)
nonzero = np.count_nonzero(mask)
print(f"  Mask: {mask.shape}, non-zero: {nonzero}/{mask.size} ({nonzero/mask.size*100:.1f}%)")

components = extract_connected_components(mask)
print(f"  Components found: {len(components)}")
for i, comp in enumerate(components):
    print(f"    [{i}] ({comp['x1']},{comp['y1']})-({comp['x2']},{comp['y2']}) "
          f"w={comp['width']} h={comp['height']} area={comp['area']} rect={comp['rect_area']}")

# Lọc
total_pixels = detection_image.width * detection_image.height
adaptive_min_area = max(100, max(300, int(total_pixels * 0.0004)))
adaptive_max_area = int(total_pixels * 0.25)
print(f"\n  Filters: min_area={adaptive_min_area}, max_area={adaptive_max_area}, min_side={MIN_COMPONENT_SIDE}")

filtered = []
for comp in components:
    rect_area = comp.get("rect_area", comp["area"])
    reason = None
    if rect_area < adaptive_min_area:
        reason = f"area {rect_area} < min {adaptive_min_area}"
    elif rect_area > adaptive_max_area:
        reason = f"area {rect_area} > max {adaptive_max_area}"
    elif comp["width"] < MIN_COMPONENT_SIDE or comp["height"] < MIN_COMPONENT_SIDE:
        reason = f"side {comp['width']}x{comp['height']} < {MIN_COMPONENT_SIDE}"
    else:
        aspect = max(comp["width"]/comp["height"], comp["height"]/comp["width"])
        if aspect > 4.5:
            reason = f"aspect {aspect:.2f} > 4.5"
    if reason:
        print(f"    ❌ {reason}")
    else:
        filtered.append(comp)
        print(f"    ✅ KEPT: {comp['width']}x{comp['height']}")

print(f"\n  Filtered: {len(filtered)}/{len(components)}")

# ── Bước 3: YOLO detection ──────────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"BƯỚC 3: YOLO detection")
print(f"{'='*60}")

try:
    import onnxruntime as ort
    from pathlib import Path
    
    models_dir = Path("models/detectors")
    onnx_files = list(models_dir.glob("*.onnx"))
    print(f"  Detector files found: {[f.name for f in onnx_files]}")
    
    if onnx_files:
        detector_path = onnx_files[0]
        print(f"  Using: {detector_path}")
        sess = ort.InferenceSession(str(detector_path), providers=["CPUExecutionProvider"])
        
        image_np = image_to_rgb_array(detection_image)
        tensor, meta = _yolo_preprocess(image_np, imgsz=640)
        input_name = sess.get_inputs()[0].name
        outputs = sess.run(None, {input_name: tensor})
        
        print(f"  YOLO output shape: {outputs[0].shape}")
        
        for conf_thr in [0.25, 0.20, 0.15, 0.10, 0.05, 0.01]:
            yolo_boxes = _yolo_postprocess(outputs, meta, conf_thres=conf_thr, iou_thres=0.45)
            print(f"  conf={conf_thr:.2f}: {len(yolo_boxes)} boxes")
            for b in yolo_boxes:
                area = (b["x2"] - b["x1"]) * (b["y2"] - b["y1"])
                print(f"    ({b['x1']},{b['y1']})-({b['x2']},{b['y2']}) area={area} score={b['score']:.4f}")
    else:
        print("  ❌ Không tìm thấy detector ONNX nào!")
except Exception as e:
    print(f"  ❌ YOLO error: {e}")
    import traceback
    traceback.print_exc()

# ── Kết luận ────────────────────────────────────────────────────────────────
print(f"\n{'='*80}")
print("KẾT LUẬN")
print(f"{'='*80}")
print(f"  Ảnh gốc: {image.size}")
print(f"  Contour components: {len(components)}")
print(f"  Contour sau lọc: {len(filtered)}")
print(f"\n  Nếu contour KHÔNG bắt được component nào:")
print("    → Ảnh ERB có nền quá sáng/đồng nhất, mask không tạo được")
print("    → Cần giảm brightness_threshold hoặc tăng channel_delta threshold")
print(f"\n  Nếu contour bắt được nhưng YOLO không detect:")
print("    → YOLO không được train trên ảnh ERB riêng lẻ (chỉ train trên ảnh full slide)")
print("    → Contour detection là fallback chính")
print(f"\n  Nếu cả 2 đều không có box nào:")
print("    → Fallback 'dùng cả ảnh' sẽ được kích hoạt (nếu ảnh <= 1.5x classifier input)")
print("    → Model phân loại vẫn chạy được trên ảnh gốc")
