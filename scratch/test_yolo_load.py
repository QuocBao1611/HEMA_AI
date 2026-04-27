import sys
from pathlib import Path
import torch.nn as nn

# Add project root to path
sys.path.append(str(Path.cwd()))

import ultralytics.nn.modules.block as block
import ultralytics.nn.modules.conv as conv
from ultralytics import YOLO

# Generic Custom Layer
class GenericCustomLayer(nn.Module):
    def __init__(self, *args, **kwargs):
        super().__init__()
    def forward(self, x, *args, **kwargs):
        if isinstance(x, (list, tuple)): return x[0]
        return x

class ModuleWrapper:
    def __init__(self, original):
        self.original = original
        self.__name__ = original.__name__
        self.__file__ = getattr(original, "__file__", "")
    def __getattr__(self, name):
        if hasattr(self.original, name):
            return getattr(self.original, name)
        if name and name[0].isupper():
            print(f"Dynamically providing layer: {name}")
            return GenericCustomLayer
        raise AttributeError(f"module {self.original.__name__} has no attribute {name}")

# Inject wrappers
sys.modules['ultralytics.nn.modules.block'] = ModuleWrapper(block)
sys.modules['ultralytics.nn.modules.conv'] = ModuleWrapper(conv)

print("Module wrappers injected.")

try:
    model_path = Path("models/classifiers/best (9).pt")
    if not model_path.exists():
        print(f"Model not found at {model_path}")
    else:
        print(f"Attempting to load {model_path}...")
        model = YOLO(model_path)
        print("Success! Model loaded.")
        print(f"Model task: {model.task}")
except Exception as e:
    print(f"Error loading model: {e}")
    import traceback
    traceback.print_exc()
