import os
import sys
import io
import json
import time
from pathlib import Path

# Ensure UTF-8 output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

def convert_v5():
    PROJECT_ROOT = Path(__file__).resolve().parents[1]
    CLASSIFIERS_DIR = PROJECT_ROOT / "models" / "classifiers"
    MANIFEST_PATH = PROJECT_ROOT / "config" / "model_manifest.json"
    
    src = CLASSIFIERS_DIR / "mobilenetv2_blood_cell_final_v5_calibrated.keras"
    dst = CLASSIFIERS_DIR / "blood_cell_model_v5.onnx"

    print("=" * 60)
    print("CONVERTING BLOOD CELL MODEL V5 TO ONNX")
    print("=" * 60)
    print(f"Source file: {src}")
    print(f"Destination: {dst}")

    if not src.exists():
        print(f"[ERR] Keras model file not found: {src}")
        return False

    try:
        import tensorflow as tf
        import tf2onnx
        import onnx
    except ImportError as e:
        print(f"[ERR] Missing libraries for conversion: {e}")
        print("Please run: pip install tf2onnx tensorflow onnx")
        return False

    print("Loading Keras .keras model using Keras 3...")
    t0 = time.time()
    try:
        import keras
        # Patch Layer.from_config to handle serialization incompatibility (e.g. quantization_config)
        original_from_config = keras.layers.Layer.from_config
        @classmethod
        def patched_from_config(cls, config):
            config.pop("quantization_config", None)
            return original_from_config.__func__(cls, config)
        keras.layers.Layer.from_config = patched_from_config

        model = keras.models.load_model(str(src))
    except Exception as e:
        print(f"[ERR] Failed to load model: {e}")
        return False

    print(f"Model loaded. Input shape: {model.input_shape}, Output shape: {model.output_shape}")
    
    # Wrap model call in a tf.function for Keras 3 to ONNX conversion via concrete function
    @tf.function(input_signature=[tf.TensorSpec([None, 224, 224, 3], tf.float32, name="input")])
    def model_func(input_tensor):
        return model(input_tensor, training=False)

    print("Converting with tf2onnx from_function...")
    try:
        onnx_model, _ = tf2onnx.convert.from_function(
            model_func,
            input_signature=[tf.TensorSpec([None, 224, 224, 3], tf.float32, name="input")],
            opset=13,
            output_path=str(dst),
        )
    except Exception as e:
        print(f"[ERR] Conversion failed: {e}")
        return False

    elapsed = time.time() - t0
    size_mb = dst.stat().st_size / 1024**2
    print(f"[OK] Saved: {dst.name} ({size_mb:.1f} MB) in {elapsed:.1f}s")

    # Verify ONNX model
    print("\nVerifying ONNX model inference...")
    try:
        import onnxruntime as ort
        import numpy as np
        
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 1
        sess = ort.InferenceSession(str(dst), sess_options=opts, providers=["CPUExecutionProvider"])
        
        inp = sess.get_inputs()[0]
        out = sess.get_outputs()[0]
        
        print(f"  Input node: '{inp.name}' shape={inp.shape}")
        print(f"  Output node: '{out.name}' shape={out.shape}")
        
        dummy_shape = [1 if (s is None or isinstance(s, str)) else s for s in inp.shape]
        dummy = np.random.randn(*dummy_shape).astype(np.float32)
        res = sess.run(None, {inp.name: dummy})
        print(f"  Dummy prediction success! Output shape: {res[0].shape}")
        print("[OK] ONNX Verification successful!")
    except Exception as e:
        print(f"[WARN] Verification failed or skipped: {e}")

    # Register in manifest
    print(f"\nRegistering model in manifest: {MANIFEST_PATH}")
    try:
        if MANIFEST_PATH.exists():
            with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                manifest = json.load(f)
        else:
            manifest = {"models": {}}

        if "models" not in manifest:
            manifest["models"] = {}

        manifest["models"]["blood_cell_model_v5.onnx"] = {
            "display_name": "Blood Cell Model V5",
            "preprocessing": "mobilenet_v2",
            "model_id": "blood_cell_v5",
            "num_classes": 14,
            "input_shape": [224, 224, 3]
        }

        with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print("[OK] Manifest updated successfully!")
    except Exception as e:
        print(f"[ERR] Failed to update manifest: {e}")
        return False

    return True

if __name__ == "__main__":
    convert_v5()
