# -*- coding: utf-8 -*-
"""Test classifier_service.py with the new ONNX model."""
import sys, os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app.services.classifier_service import (
    initialize_classifier_registry,
    get_default_classifier,
    get_classifier_registry,
    preprocess_image,
    apply_model_preprocessing,
)

# Test 1: Initialize registry
print("=" * 60)
print("Test 1: Initialize classifier registry")
print("=" * 60)
registry, default_id = initialize_classifier_registry()
print(f"Default model ID: {default_id}")
print(f"Registry keys: {list(registry.keys())}")

for mid, clf in registry.items():
    print(f"\n  Model: {mid}")
    print(f"    Display: {clf.display_name}")
    print(f"    Input shape: {clf.input_shape}")
    print(f"    Num classes: {clf.num_classes}")
    print(f"    Preprocessing: {clf.preprocessing}")
    print(f"    Source: {clf.source_path.name}")
    print(f"    Unified: {clf.unified}")

# Test 2: Get default classifier
print("\n" + "=" * 60)
print("Test 2: Get default classifier")
print("=" * 60)
clf = get_default_classifier()
print(f"Default: {clf.model_id} — {clf.display_name}")

# Test 3: Preprocessing
print("\n" + "=" * 60)
print("Test 3: Preprocessing")
print("=" * 60)
import numpy as np
dummy_batch = np.random.randn(1, 224, 224, 3).astype(np.float32) * 255
processed = apply_model_preprocessing(dummy_batch, clf.preprocessing)
print(f"Input range: [{dummy_batch.min():.1f}, {dummy_batch.max():.1f}]")
print(f"Processed range: [{processed.min():.4f}, {processed.max():.4f}]")
print(f"Processed dtype: {processed.dtype}")
print(f"Processed shape: {processed.shape}")

# Test 4: Inference
print("\n" + "=" * 60)
print("Test 4: Inference with dummy data")
print("=" * 60)
result = clf.model.predict(processed)
print(f"Output shape: {result.shape}")
print(f"Output dtype: {result.dtype}")
print(f"Output range: [{result.min():.4f}, {result.max():.4f}]")
print(f"Top-3 indices: {np.argsort(result[0])[::-1][:3]}")
print(f"Top-3 confidences: {np.sort(result[0])[::-1][:3]}")

print("\n" + "=" * 60)
print("✅ ALL TESTS PASSED!")
print("=" * 60)
