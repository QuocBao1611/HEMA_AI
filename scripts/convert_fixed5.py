# -*- coding: utf-8 -*-
"""MobileNetV2 .h5 -> .onnx - uses tf2onnx CLI via subprocess."""
import sys, os, time, logging, shutil, subprocess
from pathlib import Path

log_path = Path(__file__).resolve().parent.parent / "convert_log.txt"
logging.basicConfig(
    filename=str(log_path), level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s", force=True,
)
logger = logging.getLogger(__name__)
console = logging.StreamHandler(sys.stdout)
console.setLevel(logging.DEBUG)
logger.addHandler(console)

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

logger.info("=" * 60)
logger.info("MobileNetV2 .h5 -> .onnx (CLI method)")
logger.info("=" * 60)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
src = PROJECT_ROOT / "models" / "classifiers" / "mobilenetv2_phase2_best.h5"
dst = PROJECT_ROOT / "models" / "classifiers" / "mobilenetv2_phase2_best.onnx"
savedmodel_dir = PROJECT_ROOT / "models" / "classifiers" / "mobilenetv2_savedmodel_tmp"

logger.info(f"Source: {src}")
logger.info(f"Dest:   {dst}")

if not src.exists():
    logger.error(f"Source not found: {src}")
    sys.exit(1)

if dst.exists():
    dst.unlink()
if savedmodel_dir.exists():
    shutil.rmtree(savedmodel_dir)

# Step 1: Patch Keras 3 and export to SavedModel
import tensorflow as tf
from keras.src.layers.core.dense import Dense
from keras.src.layers.layer import Layer

original_init = Dense.__init__
def patched_init(self, *args, **kwargs):
    kwargs.pop("quantization_config", None)
    original_init(self, *args, **kwargs)
Dense.__init__ = patched_init

original_layer_init = Layer.__init__
def patched_layer_init(self, *args, **kwargs):
    kwargs.pop("quantization_config", None)
    original_layer_init(self, *args, **kwargs)
Layer.__init__ = patched_layer_init

logger.info("Patched Keras 3")
logger.info("Loading model...")
t0 = time.time()

try:
    tf.get_logger().setLevel("ERROR")
    model = tf.keras.models.load_model(str(src), compile=False)
    
    logger.info(f"  Input shape : {model.input_shape}")
    logger.info(f"  Output shape: {model.output_shape}")
    
    logger.info("Exporting to SavedModel...")
    model.export(str(savedmodel_dir))
    logger.info(f"  SavedModel saved")
    
except Exception as e:
    logger.error(f"Export failed: {e}", exc_info=True)
    sys.exit(1)

# Step 2: Use tf2onnx CLI tool
logger.info("Converting SavedModel -> ONNX via CLI...")
try:
    cmd = [
        sys.executable, "-m", "tf2onnx.convert",
        "--saved-model", str(savedmodel_dir),
        "--output", str(dst),
        "--opset", "13",
        "--inputs-as-nchw", "",
        "--tag", "serve",
    ]
    logger.info(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    logger.info(f"stdout: {result.stdout}")
    if result.stderr:
        logger.warning(f"stderr: {result.stderr}")
    if result.returncode != 0:
        logger.error(f"CLI failed with code {result.returncode}")
        raise RuntimeError(f"CLI failed: {result.stderr}")
    
    elapsed = time.time() - t0
    size_mb = dst.stat().st_size / 1024**2
    logger.info(f"Done in {elapsed:.1f}s, size={size_mb:.1f}MB")
    
except Exception as e:
    logger.error(f"Conversion failed: {e}", exc_info=True)
    if savedmodel_dir.exists():
        shutil.rmtree(savedmodel_dir)
    sys.exit(1)

# Clean up
if savedmodel_dir.exists():
    shutil.rmtree(savedmodel_dir)

# Step 3: Verify
logger.info("Verifying ONNX model...")
try:
    import onnxruntime as ort
    import numpy as np
    
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 1
    sess = ort.InferenceSession(str(dst), sess_options=opts, providers=["CPUExecutionProvider"])
    
    inp = sess.get_inputs()[0]
    out = sess.get_outputs()[0]
    
    logger.info(f"  Input  node: '{inp.name}'  shape={inp.shape}  dtype={inp.type}")
    logger.info(f"  Output node: '{out.name}'  shape={out.shape}  dtype={out.type}")
    
    raw_shape = inp.shape
    dummy_shape = [1 if (s is None or isinstance(s, str)) else s for s in raw_shape]
    dummy = np.random.randn(*dummy_shape).astype(np.float32)
    result = sess.run(None, {inp.name: dummy})
    logger.info(f"  Output shape: {result[0].shape}")
    logger.info("✅ VERIFY OK")
    
except Exception as e:
    logger.error(f"Verify failed: {e}", exc_info=True)
    sys.exit(1)

logger.info("=" * 60)
logger.info("✅ SUCCESS!")
logger.info("=" * 60)
