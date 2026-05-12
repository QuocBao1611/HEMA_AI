# -*- coding: utf-8 -*-
import sys, os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
print(f"Python: {sys.executable}")
print(f"Python version: {sys.version}")
try:
    import tf2onnx
    print(f"tf2onnx version: {tf2onnx.__version__}")
except ImportError as e:
    print(f"tf2onnx import error: {e}")
try:
    import tensorflow as tf
    print(f"TensorFlow version: {tf.__version__}")
except ImportError as e:
    print(f"TensorFlow import error: {e}")
try:
    import onnxruntime as ort
    print(f"ONNX Runtime version: {ort.__version__}")
except ImportError as e:
    print(f"ONNX Runtime import error: {e}")
