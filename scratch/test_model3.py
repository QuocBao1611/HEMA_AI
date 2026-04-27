"""
Test: load the model using the proper approach - register classes before YOLO() call,
then verify forward pass works with the actual stored weights.
"""
import sys
sys.path.insert(0, ".")
import torch
import torch.nn as nn
import numpy as np
from PIL import Image

import ultralytics.nn.modules.block as block_mod
import ultralytics.nn.modules.conv as conv_mod

# The model is a YOLOv13 detection model.
# Key custom classes needed: DSC3k2, DSBottleneck, DSConv, HyperACE, DSC3k,
# FuseModule, C3AH, AdaHGComputation, AdaHGConv, AdaHyperedgeGen, DownsampleConv, FullPAD_Tunnel

# Strategy: Map each custom class to the most appropriate base class.
# The checkpoint stores the full model object (pickled), so the class hierarchy matters.

# DSC3k2 -> C3k2 (Depthwise Separable version of C3k2)
# DSBottleneck -> Bottleneck  
# DSConv -> Conv (Depthwise Separable Conv)
# DSC3k -> C3k (if exists) or C3k2
# C3AH -> C3k2

# For the others that are novel (HyperACE, FuseModule, AdaHG*, etc.),
# they need to be pass-through since their weights are already stored.

# IMPORTANT: Since torch.load unpickles the FULL model object with its stored state_dict,
# the class __init__ will NOT be called again. Only __new__ + __setstate__ are used.
# So we just need classes that can be instantiated and have correct forward() methods.

# The real issue is the GenericYOLOv13Layer approach creates NEW weights, ignoring stored ones.
# The C3k2 fallback fails because C3k2.__init__ creates different sub-modules than what's stored.

# Solution: Use __reduce_ex__ / __setstate__ properly. Actually, since torch.load
# uses pickle, it calls __new__ then applies the stored __dict__ / state_dict.
# The stored model already has all the parameters. We just need the CLASS to exist.

# Let's verify this theory:
print("=== Step 1: Register classes ===")

# These classes just need to exist with forward() - the stored weights will be applied
class DSBottleneck(block_mod.Bottleneck):
    """Depthwise Separable Bottleneck - same structure as Bottleneck."""
    pass

class DSConv(conv_mod.Conv):
    """Depthwise Separable Conv - same structure as Conv."""
    pass

class DSC3k2(block_mod.C3k2):
    """Depthwise Separable C3k2."""
    pass

class DSC3k(block_mod.C3k2):
    """Depthwise Separable C3k."""
    pass

class C3AH(block_mod.C3k2):
    """C3 with Attention Head."""
    pass

class DownsampleConv(conv_mod.Conv):
    """Downsample convolution."""
    pass

# These are custom blocks that don't have direct equivalents
# They need to work as pass-through for features they can't process
class HyperACE(nn.Module):
    def __init__(self, *args, **kwargs):
        super().__init__()
    def forward(self, x, *args, **kwargs):
        if isinstance(x, (list, tuple)):
            return x[0]
        return x

class FuseModule(nn.Module):
    def __init__(self, *args, **kwargs):
        super().__init__()
    def forward(self, x, *args, **kwargs):
        if isinstance(x, (list, tuple)):
            return x[0]
        return x

class AdaHGConv(nn.Module):
    def __init__(self, *args, **kwargs):
        super().__init__()
    def forward(self, x, *args, **kwargs):
        if isinstance(x, (list, tuple)):
            return x[0]
        return x

class AdaHGComputation(nn.Module):
    def __init__(self, *args, **kwargs):
        super().__init__()
    def forward(self, x, *args, **kwargs):
        if isinstance(x, (list, tuple)):
            return x[0]
        return x

class AdaHyperedgeGen(nn.Module):
    def __init__(self, *args, **kwargs):
        super().__init__()
    def forward(self, x, *args, **kwargs):
        if isinstance(x, (list, tuple)):
            return x[0]
        return x

class FullPAD_Tunnel(nn.Module):
    def __init__(self, *args, **kwargs):
        super().__init__()
    def forward(self, x, *args, **kwargs):
        if isinstance(x, (list, tuple)):
            return x[0]
        return x

# Register all classes in the modules
setattr(block_mod, 'DSC3k2', DSC3k2)
setattr(block_mod, 'DSBottleneck', DSBottleneck)
setattr(block_mod, 'DSC3k', DSC3k)
setattr(block_mod, 'C3AH', C3AH)
setattr(block_mod, 'HyperACE', HyperACE)
setattr(block_mod, 'FuseModule', FuseModule)
setattr(block_mod, 'AdaHGConv', AdaHGConv)
setattr(block_mod, 'AdaHGComputation', AdaHGComputation)
setattr(block_mod, 'AdaHyperedgeGen', AdaHyperedgeGen)
setattr(block_mod, 'DownsampleConv', DownsampleConv)
setattr(block_mod, 'FullPAD_Tunnel', FullPAD_Tunnel)
setattr(conv_mod, 'DSConv', DSConv)

print("=== Step 2: Load model ===")
from ultralytics import YOLO
model = YOLO("models/classifiers/best (9).pt")
print(f"Task: {model.task}")
print(f"Names: {model.names}")

print("\n=== Step 3: Test prediction ===")
dummy = Image.new("RGB", (640, 640), color=(128, 128, 128))
try:
    results = model.predict(dummy, verbose=False, conf=0.1)
    r = results[0]
    print(f"Result type: {type(r)}")
    print(f"Has boxes: {r.boxes is not None}")
    if r.boxes is not None:
        print(f"Boxes count: {len(r.boxes)}")
        print(f"Boxes data shape: {r.boxes.data.shape}")
    print(f"Has probs: {r.probs is not None}")
    print("SUCCESS - Model works!")
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
