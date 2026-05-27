import onnx
import onnxruntime as ort
from pathlib import Path

MODELS_DIR = Path("models/classifiers")
model_path = MODELS_DIR / "mobilenetv2_final.onnx"

if not model_path.exists():
    model_path = MODELS_DIR / "MobilenetV2.onnx"

print(f"Checking model: {model_path}")
model = onnx.load(str(model_path))

# In các output hiện có
print("\n--- Current Outputs ---")
for o in model.graph.output:
    print(f"Name: {o.name}")

# Tìm các node Conv cuối cùng
print("\n--- Potential Target Layers (Last Conv/Relu nodes) ---")
nodes = []
for node in model.graph.node:
    if node.op_type in ["Conv", "Relu", "Clip", "BatchNormalization"]:
        nodes.append(node)

# In 10 node cuối cùng
for node in nodes[-10:]:
    print(f"Op: {node.op_type}, Name: {node.name}, Output: {node.output}")

# Chạy thử một lượt inference để xem shape
session = ort.InferenceSession(str(model_path))
input_name = session.get_inputs()[0].name
input_shape = session.get_inputs()[0].shape
print(f"\nInput Name: {input_name}, Shape: {input_shape}")
