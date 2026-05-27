# -*- coding: utf-8 -*-
"""
Debug: Kiểm tra detection pipeline trên ảnh ERB đơn lẻ
- Contour detection có hoạt động không?
- YOLO có detect được không?
- Fallback có được kích hoạt không?
"""
import sys, os, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.path.insert(0, 'C:/xampp/htdocs/HEMA_AI')

import numpy as np
import cv2
from PIL import Image
from pathlib import Path

# Import các hàm từ analysis_service
from backend.app.services.analysis_service import (
    build_candidate_mask,
    extract_connected_components,
    resize_for_detection,
    image_to_rgb_array,
    _yolo_preprocess,
    _yolo_postprocess,
    initialize_detection_runtime,
    detect_cell_boxes,
    prepare_slide_count_candidates,
    MIN_COMPONENT_SIDE,
)

IMAGE_PATH = "ERB_59475_cell_0.jpg"

print("=" * 80)
print(f"DEBUG DETECTION: {IMAGE_PATH}")
print("=" * 80)

# Load ảnh
image = Image.open(IMAGE_PATH).convert("RGB")
print(f"\n📐 Image size: {image.size}")
print(f"📦 Image mode: {image.mode}")

# ── Bước 1: Resize cho detection ──────────────────────────────────────────
detection_image, scale = resize_for_detection(image)
print(f"\n{'='*60}")
print(f"BƯỚC 1: Resize cho detection")
print(f"{'='*60}")
print(f"  Scale: {scale}")
print(f"  Detection image size: {detection_image.size}")

# ── Bước 2: Contour detection ────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"BƯỚC 2: Contour detection")
print(f"{'='*60}")

image_array = image_to_rgb_array(detection_image)
print(f"  Image array shape: {image_array.shape}")
print(f"  Image array dtype: {image_array.dtype}")
print(f"  Pixel range: [{image_array.min()}, {image_array.max()}]")

mask = build_candidate_mask(image_array)
print(f"  Mask shape: {mask.shape}")
print(f"  Mask dtype: {mask.dtype}")
print(f"  Mask unique values: {np.unique(mask)}")
print(f"  Mask non-zero pixels: {np.count_nonzero(mask)} / {mask.size} ({np.count_nonzero(mask)/mask.size*100:.1f}%)")

components = extract_connected_components(mask)
print(f"  Components found: {len(components)}")
for i, comp in enumerate(components):
    print(f"    [{i}] x1={comp['x1']} y1={comp['y1']} x2={comp['x2']} y2={comp['y2']} "
          f"w={comp['width']} h={comp['height']} area={comp['area']} rect_area={comp['rect_area']}")

# Kiểm tra adaptive_min_area
total_pixels = detection_image.width * detection_image.height
adaptive_min_area = max(100, max(300, int(total_pixels * 0.0004)))
adaptive_max_area = int(total_pixels * 0.25)
print(f"\n  Adaptive min_area: {adaptive_min_area}")
print(f"  Adaptive max_area: {adaptive_max_area}")
print(f"  MIN_COMPONENT_SIDE: {MIN_COMPONENT_SIDE}")

# Lọc components
filtered = []
for comp in components:
    rect_area = comp.get("rect_area", comp["area"])
    if rect_area < adaptive_min_area or rect_area > adaptive_max_area:
        print(f"    ❌ SKIP area: {comp['width']}x{comp['height']} area={rect_area} (outside [{adaptive_min_area}, {adaptive_max_area}])")
        continue
    if comp["width"] < MIN_COMPONENT_SIDE or comp["height"] < MIN_COMPONENT_SIDE:
        print(f"    ❌ SKIP side: {comp['width']}x{comp['height']} < {MIN_COMPONENT_SIDE}")
        continue
    aspect_ratio = max(comp["width"] / float(comp["height"]), comp["height"] / float(comp["width"]))
    if aspect_ratio > 4.5:
        print(f"    ❌ SKIP aspect: {aspect_ratio:.2f} > 4.5")
        continue
    filtered.append(comp)
    print(f"    ✅ KEPT: {comp['width']}x{comp['height']} area={rect_area}")

print(f"\n  Filtered components: {len(filtered)}/{len(components)}")

# ── Bước 3: YOLO detection ───────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"BƯỚC 3: YOLO detection")
print(f"{'='*60}")

try:
    yolo_session = initialize_detection_runtime(None)
    image_np = image_to_rgb_array(detection_image)
    tensor, meta = _yolo_preprocess(image_np, imgsz=640)
    input_name = yolo_session.get_inputs()[0].name
    outputs = yolo_session.run(None, {input_name: tensor})
    
    print(f"  YOLO output shape: {outputs[0].shape}")
    
    # Thử với các threshold khác nhau
    for conf_thr in [0.25, 0.20, 0.15, 0.10, 0.05]:
        yolo_boxes = _yolo_postprocess(outputs, meta, conf_thres=conf_thr, iou_thres=0.45)
        print(f"  conf_threshold={conf_thr:.2f}: {len(yolo_boxes)} boxes")
        for b in yolo_boxes:
            area = (b["x2"] - b["x1"]) * (b["y2"] - b["y1"])
            print(f"    box: ({b['x1']},{b['y1']})-({b['x2']},{b['y2']}) area={area} score={b['score']:.4f}")
except Exception as e:
    print(f"  ❌ YOLO error: {e}")

# ── Bước 4: detect_cell_boxes (full pipeline) ────────────────────────────
print(f"\n{'='*60}")
print(f"BƯỚC 4: detect_cell_boxes (full pipeline)")
print(f"{'='*60}")

boxes = detect_cell_boxes(
    image,
    min_component_area=100,
    max_detections=300,
    confidence_threshold=0.25,
    detector_model_id=None,
)
print(f"  Boxes found: {len(boxes)}")
for i, b in enumerate(boxes):
    print(f"    [{i}] ({b['x1']},{b['y1']})-({b['x2']},{b['y2']}) area={b['area']}")

# ── Bước 5: prepare_slide_count_candidates ───────────────────────────────
print(f"\n{'='*60}")
print(f"BƯỚC 5: prepare_slide_count_candidates")
print(f"{'='*60}")

from backend.app.services.classifier_service import get_classifier
classifier = get_classifier("mobilenet_blood_cell_v2")

boxes2, crops, fallback = prepare_slide_count_candidates(
    image,
    padding_ratio=0.10,
    min_component_area=100,
    max_detections=300,
    confidence_threshold=0.25,
    classifier=classifier,
)
print(f"  Boxes: {len(boxes2)}")
print(f"  Crops: {len(crops)}")
print(f"  Fallback used: {fallback}")

if crops:
    for i, crop in enumerate(crops):
        print(f"    Crop [{i}]: {crop.size}")
else:
    print(f"  ❌ KHÔNG CÓ CROP NÀO! Model phân loại sẽ không có gì để xử lý.")

# ── Kết luận ─────────────────────────────────────────────────────────────
print(f"\n{'='*80}")
print("KẾT LUẬN")
print(f"{'='*80}")
if not boxes2:
    print("❌ Detection KHÔNG tìm thấy box nào → model phân loại không có gì để xử lý")
    print("   Nguyên nhân có thể:")
    print("   - Ảnh quá nhỏ (139x138) → contour/YOLO không bắt được")
    print("   - Mask không tạo được do ảnh có nền sáng đồng nhất")
    print("   - YOLO không detect được tế bào ERB riêng lẻ")
elif fallback:
    print("⚠️  Fallback được dùng: dùng cả ảnh làm 1 candidate")
    print("   → Model phân loại sẽ chạy trên ảnh gốc (không crop)")
else:
    print(f"✅ Detection OK: {len(boxes2)} boxes, {len(crops)} crops")
