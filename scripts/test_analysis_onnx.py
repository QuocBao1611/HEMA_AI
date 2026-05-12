# -*- coding: utf-8 -*-
"""Test analysis_service.py imports and basic functions."""
import sys, os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

print("=" * 60)
print("Test: Import analysis_service.py (no ultralytics)")
print("=" * 60)

# Test 1: Import module
from backend.app.services.analysis_service import (
    discover_detector_paths,
    list_detector_models,
    initialize_detection_runtime,
    slugify_detector_id,
    _yolo_preprocess,
    _yolo_postprocess,
    detect_cell_boxes,
    run_slide_count_analysis,
    run_yolo_unified_analysis,
    DEFAULT_CONFIDENCE_THRESHOLD,
)
print("✅ Import successful (no ultralytics)")

# Test 2: Discover detectors
print("\n" + "=" * 60)
print("Test 2: Discover detector paths")
print("=" * 60)
paths = discover_detector_paths()
print(f"Found {len(paths)} detector(s):")
for p in paths:
    print(f"  - {p.name} ({p.stat().st_size / 1024**2:.1f} MB)")

# Test 3: List detector models
print("\n" + "=" * 60)
print("Test 3: List detector models")
print("=" * 60)
models = list_detector_models()
for m in models:
    print(f"  - {m['detector_model_id']}: {m['display_name']} (unified={m['unified']})")

# Test 4: Initialize ONNX runtime
print("\n" + "=" * 60)
print("Test 4: Initialize ONNX detection runtime")
print("=" * 60)
sess = initialize_detection_runtime()
inp = sess.get_inputs()[0]
out = sess.get_outputs()[0]
print(f"  Input:  '{inp.name}' shape={inp.shape}")
print(f"  Output: '{out.name}' shape={out.shape}")
print(f"  Provider: {sess.get_providers()[0]}")

# Test 5: YOLO preprocess + postprocess
print("\n" + "=" * 60)
print("Test 5: YOLO preprocess + postprocess")
print("=" * 60)
import numpy as np
from PIL import Image

dummy_img = Image.new("RGB", (800, 600), color=(128, 128, 128))
img_np = np.asarray(dummy_img, dtype=np.uint8)
tensor, meta = _yolo_preprocess(img_np, imgsz=640)
print(f"  Tensor shape: {tensor.shape} (expected: 1x3x640x640)")
print(f"  Meta: scale={meta['scale']:.3f}, pad=({meta['pad_top']},{meta['pad_left']})")

# Dummy inference
input_name = sess.get_inputs()[0].name
outputs = sess.run(None, {input_name: tensor})
boxes = _yolo_postprocess(outputs, meta, conf_thres=0.20)
print(f"  Detected boxes: {len(boxes)}")

print("\n" + "=" * 60)
print("✅ ALL TESTS PASSED!")
print("=" * 60)
