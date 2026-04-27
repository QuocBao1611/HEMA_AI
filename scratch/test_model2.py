"""Test model loading WITH the main.py patches applied."""
import sys
sys.path.insert(0, ".")

# Apply the patches from main.py first
import torch
import torch.nn as nn
import torch.nn.functional as F

class AdaHGConv(nn.Module):
    def __init__(self, c1, c2, k=1, s=1, p=None, g=1, act=True):
        super().__init__()
        self.conv = nn.Conv2d(c1, c2, k, s, p or (k//2), groups=1, bias=False)
        self.bn = nn.BatchNorm2d(c2)
        self.act = nn.SiLU() if act is True else (act if isinstance(act, nn.Module) else nn.Identity())
    def forward(self, x):
        if x.shape[1] != self.conv.in_channels:
            if x.shape[1] < self.conv.in_channels:
                pad = torch.zeros(x.shape[0], self.conv.in_channels - x.shape[1], x.shape[2], x.shape[3], device=x.device)
                x = torch.cat([x, pad], dim=1)
            else:
                x = x[:, :self.conv.in_channels, :, :]
        return self.act(self.bn(self.conv(x)))

class HyperACE(nn.Module):
    def __init__(self, c1, c2, k=1, s=1, p=None, g=1, act=True):
        super().__init__()
        self.conv = AdaHGConv(c1, c2, k, s, p, g, act)
    def forward(self, x):
        return self.conv(x)

class AdaHGComputation(nn.Module):
    def __init__(self, c1, c2, *args, **kwargs):
        super().__init__()
        self.conv = AdaHGConv(c1, c2)
    def forward(self, x):
        return self.conv(x)

class GenericYOLOv13Layer(nn.Module):
    def __init__(self, *args, **kwargs):
        super().__init__()
        if len(args) > 0: self.c1 = args[0]
        if len(args) > 1: self.c2 = args[1]
        c1, c2 = getattr(self, 'c1', None), getattr(self, 'c2', None)
        if c1 and c2 and c1 != c2:
            self.conv = nn.Conv2d(c1, c2, 1, bias=False)
            self.bn = nn.BatchNorm2d(c2)

    def forward(self, x, *args, **kwargs):
        try:
            if isinstance(x, (list, tuple)): x = x[0]
            conv = getattr(self, 'conv', None)
            bn = getattr(self, 'bn', None)
            c2 = getattr(self, 'c2', None)
            if conv:
                if x.shape[1] != conv.in_channels:
                    if x.shape[1] < conv.in_channels:
                        pad = torch.zeros(x.shape[0], conv.in_channels - x.shape[1], x.shape[2], x.shape[3], device=x.device)
                        x = torch.cat([x, pad], dim=1)
                    else:
                        x = x[:, :conv.in_channels, :, :]
                x = conv(x)
                if bn: x = bn(x)
                return x
            if c2 and x.shape[1] != c2:
                if x.shape[1] < c2:
                    pad = torch.zeros(x.shape[0], c2 - x.shape[1], x.shape[2], x.shape[3], device=x.device)
                    return torch.cat([x, pad], dim=1)
                else:
                    return x[:, :c2, :, :]
            return x
        except Exception:
            return x

class ModuleWrapper:
    def __init__(self, original):
        self.original = original
        self.__name__ = original.__name__
        self.__file__ = getattr(original, "__file__", "")
    def __getattr__(self, name):
        if hasattr(self.original, name):
            return getattr(self.original, name)
        mappings = {
            "AdaHGConv": AdaHGConv,
            "HyperACE": HyperACE,
            "AdaHGComputation": AdaHGComputation,
            "AdaHyperedgeGen": GenericYOLOv13Layer,
            "FullPAD_Tunnel": GenericYOLOv13Layer,
            "FuseModule": GenericYOLOv13Layer,
        }
        if name in mappings: return mappings[name]
        if name and name[0].isupper():
            if name.startswith("DSC3"): return getattr(self.original, "C3k2", getattr(self.original, "C2f"))
            return GenericYOLOv13Layer
        raise AttributeError(f"module {self.original.__name__} has no attribute {name}")

try:
    import ultralytics.nn.modules.block as block
    import ultralytics.nn.modules.conv as conv
    sys.modules['ultralytics.nn.modules.block'] = ModuleWrapper(block)
    sys.modules['ultralytics.nn.modules.conv'] = ModuleWrapper(conv)
except ImportError:
    pass

# NOW try loading the model
from ultralytics import YOLO
import numpy as np
from PIL import Image

model_path = "models/classifiers/best (9).pt"
print(f"Loading model: {model_path}")
m = YOLO(model_path)
print(f"Model type: {type(m.model)}")
print(f"Task: {m.task}")
print(f"Model class name: {m.model.__class__.__name__}")

if hasattr(m.model, 'names'):
    print(f"Model names: {m.model.names}")
    print(f"Number of classes: {len(m.model.names)}")

# Create a dummy image and run prediction
dummy = Image.new("RGB", (224, 224), color=(128, 128, 128))
print("\nRunning prediction on dummy image...")
try:
    results = m.predict(dummy, verbose=False)
    r = results[0]
    print(f"Result type: {type(r)}")
    print(f"Has probs: {r.probs is not None}")
    print(f"Has boxes: {r.boxes is not None}")
    if r.probs is not None:
        print(f"Probs shape: {r.probs.data.shape}")
        print(f"Probs: {r.probs.data}")
    if r.boxes is not None:
        print(f"Boxes shape: {r.boxes.data.shape}")
        print(f"Boxes: {r.boxes.data}")
except Exception as e:
    print(f"Prediction error: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
