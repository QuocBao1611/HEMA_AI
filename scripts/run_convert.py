# -*- coding: utf-8 -*-
"""Simple script to run MobileNetV2 conversion and capture output."""
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

import time
from pathlib import Path

# Use absolute path since __file__ may not be defined
_SCRIPT_DIR = Path(os.path.abspath(os.path.dirname(__file__))) if '__file__' in dir() else Path.cwd()
sys.path.insert(0, str(_SCRIPT_DIR.parent))

from scripts.convert_to_onnx import convert_keras_to_onnx, verify_onnx_model

src = Path("models/classifiers/mobilenetv2_phase2_best.h5")
dst = Path("models/classifiers/mobilenetv2_phase2_best.onnx")

print("=" * 60)
print("Starting MobileNetV2 .h5 -> .onnx conversion...")
print("=" * 60)
print(f"Source: {src} ({src.stat().st_size / 1024**2:.1f} MB)")
print(f"Dest:   {dst}")
print()

t0 = time.time()
ret = convert_keras_to_onnx(src, dst)
elapsed = time.time() - t0

if ret:
    print(f"\nConversion completed in {elapsed:.1f}s")
    if dst.exists():
        print(f"Output size: {dst.stat().st_size / 1024**2:.1f} MB")
        print("\n--- Verifying ONNX model ---")
        verify_onnx_model(dst, [224, 224, 3])
    print("\n✅ SUCCESS: MobileNetV2 converted to ONNX!")
else:
    print(f"\n❌ FAILED: Conversion error after {elapsed:.1f}s")
    sys.exit(1)
