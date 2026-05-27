import numpy as np
import onnxruntime as ort
from pathlib import Path

MODELS_DIR = Path("models/classifiers")
model_path = MODELS_DIR / "mobilenetv2_final.onnx"
if not model_path.exists(): model_path = MODELS_DIR / "MobilenetV2.onnx"

session = ort.InferenceSession(str(model_path))
input_name = session.get_inputs()[0].name

# Tạo ảnh giả lập (trắng)
img_norm = np.random.uniform(-1, 1, (1, 224, 224, 3)).astype(np.float32)

outputs = session.run(None, {input_name: img_norm})
logits = outputs[0]

print(f"Output Name: {session.get_outputs()[0].name}")
print(f"Logits shape: {logits.shape}")
print(f"Logits raw values: {logits[0]}")

def softmax(x):
    e = np.exp(x - np.max(x))
    return e / e.sum()

probs = softmax(logits[0])
print(f"Probs: {probs}")
