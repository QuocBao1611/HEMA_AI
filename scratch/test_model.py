"""Quick test to check the YOLO model type and behavior."""
import sys
sys.path.insert(0, ".")

from ultralytics import YOLO

model_path = "models/classifiers/best (9).pt"
print(f"Loading model: {model_path}")
m = YOLO(model_path)
print(f"Model type: {type(m.model)}")
print(f"Task: {m.task}")
print(f"Model class name: {m.model.__class__.__name__}")

# Check if it has names (class names mapping)
if hasattr(m.model, 'names'):
    print(f"Model names: {m.model.names}")
    print(f"Number of classes: {len(m.model.names)}")

# Try to see the model architecture info
print(f"Model args: {getattr(m.model, 'args', 'N/A')}")
