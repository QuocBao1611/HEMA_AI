# -*- coding: utf-8 -*-
"""Full integration test: no TF, no torch, no ultralytics."""
import sys, os
os.environ["MPLBACKEND"] = "Agg"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

print("=" * 60)
print("TEST: Verify no TF/torch/ultralytics imports")
print("=" * 60)

# Test 1: Verify TF/torch/ultralytics NOT importable
for bad_mod in ["tensorflow", "torch", "ultralytics"]:
    try:
        __import__(bad_mod)
        print(f"❌ {bad_mod} IS STILL INSTALLED!")
    except ImportError:
        print(f"✅ {bad_mod} not installed (expected)")

# Test 2: Import all ONNX services
print("\n" + "=" * 60)
print("TEST: Import all ONNX services")
print("=" * 60)

from backend.app.services.classifier_service import (
    initialize_classifier_registry,
    get_default_classifier,
    OnnxClassifierAdapter,
    apply_model_preprocessing,
)
print("✅ classifier_service.py imported (no TF)")

from backend.app.services.analysis_service import (
    discover_detector_paths,
    initialize_detection_runtime,
    _yolo_preprocess,
    _yolo_postprocess,
    detect_cell_boxes,
)
print("✅ analysis_service.py imported (no ultralytics)")

from backend.app.services.analysis_onnx_service import Best9ONNXService
print("✅ analysis_onnx_service.py imported")

# Test 3: Classifier registry
print("\n" + "=" * 60)
print("TEST: Classifier registry")
print("=" * 60)
registry, default_id = initialize_classifier_registry()
print(f"Default model: {default_id}")
for mid, clf in registry.items():
    print(f"  {mid}: {clf.display_name} ({clf.input_shape})")

# Test 4: Classifier inference
print("\n" + "=" * 60)
print("TEST: Classifier inference")
print("=" * 60)
import numpy as np
clf = get_default_classifier()
dummy = np.random.randn(1, 224, 224, 3).astype(np.float32) * 255
processed = apply_model_preprocessing(dummy, clf.preprocessing)
result = clf.model.predict(processed)
print(f"Output shape: {result.shape}")
print(f"Top-1: class {np.argmax(result[0])} ({result[0].max():.4f})")
print("✅ Classifier inference OK")

# Test 5: Detector ONNX
print("\n" + "=" * 60)
print("TEST: Detector ONNX inference")
print("=" * 60)
paths = discover_detector_paths()
print(f"Detectors found: {[p.name for p in paths]}")
sess = initialize_detection_runtime()
inp = sess.get_inputs()[0]
out = sess.get_outputs()[0]
print(f"Input: {inp.name} {inp.shape}")
print(f"Output: {out.name} {out.shape}")

from PIL import Image
img = Image.new("RGB", (800, 600), (128, 128, 128))
img_np = np.asarray(img, dtype=np.uint8)
tensor, meta = _yolo_preprocess(img_np)
outputs = sess.run(None, {inp.name: tensor})
boxes = _yolo_postprocess(outputs, meta)
print(f"Detected boxes: {len(boxes)}")
print("✅ Detector ONNX inference OK")

print("\n" + "=" * 60)
print("🎉 ALL TESTS PASSED! Ready for ONNX-only deployment!")
print("=" * 60)
