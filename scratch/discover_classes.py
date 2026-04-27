"""Iteratively discover all missing custom classes in the YOLO checkpoint."""
import sys
import re
sys.path.insert(0, ".")
import torch
import torch.nn as nn
import ultralytics.nn.modules.block as block_mod
import ultralytics.nn.modules.conv as conv_mod

C3k2 = block_mod.C3k2
C2f = block_mod.C2f
Bottleneck = block_mod.Bottleneck
Conv = conv_mod.Conv

missing_classes = []
max_attempts = 30

for attempt in range(max_attempts):
    try:
        ckpt = torch.load("models/classifiers/best (9).pt", map_location="cpu", weights_only=False)
        print(f"\nSUCCESS after {len(missing_classes)} patches:")
        for c in missing_classes:
            print(f"  - {c}")
        
        if 'model' in ckpt:
            model = ckpt['model']
            print(f"\nModel type: {type(model)}")
            if hasattr(model, 'names'):
                print(f"Names: {model.names}")
            if hasattr(model, 'yaml'):
                print(f"\nYAML:\n{model.yaml}")
        break
    except AttributeError as e:
        msg = str(e)
        # Use regex to extract class name
        match = re.search(r"Can't get attribute '(\w+)' on <module '([^']+)'", msg)
        if match:
            cls_name = match.group(1)
            module_path = match.group(2)
            print(f"#{attempt+1}: Need '{cls_name}' in '{module_path}'")
            missing_classes.append((cls_name, module_path))
            
            if 'Bottleneck' in cls_name:
                fallback = Bottleneck
            elif 'C3' in cls_name or 'C2' in cls_name:
                fallback = C3k2
            elif 'Conv' in cls_name:
                fallback = Conv
            else:
                fallback = type(cls_name, (nn.Module,), {
                    '__init__': lambda self, *a, **kw: nn.Module.__init__(self),
                    'forward': lambda self, x, *a, **kw: x[0] if isinstance(x, (list, tuple)) else x,
                })

            if 'block' in module_path:
                setattr(block_mod, cls_name, fallback)
            elif 'conv' in module_path:
                setattr(conv_mod, cls_name, fallback)
            else:
                setattr(block_mod, cls_name, fallback)
                setattr(conv_mod, cls_name, fallback)
        else:
            print(f"Unmatched error: {msg}")
            break
    except Exception as e:
        print(f"Error: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        break
