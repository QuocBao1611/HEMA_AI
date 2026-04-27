"""Check what attributes DSConv and other custom layers actually have in the checkpoint."""
import sys, re
sys.path.insert(0, ".")
import torch
import torch.nn as nn
import ultralytics.nn.modules.block as block_mod
import ultralytics.nn.modules.conv as conv_mod

# Register stub classes
stubs_registered = []
for attempt in range(30):
    try:
        ckpt = torch.load("models/classifiers/best (9).pt", map_location="cpu", weights_only=False)
        break
    except AttributeError as e:
        match = re.search(r"Can't get attribute '(\w+)' on <module '([^']+)'", str(e))
        if match:
            cls_name, mod_path = match.group(1), match.group(2)
            stubs_registered.append(cls_name)
            stub = type(cls_name, (nn.Module,), {
                '__init__': lambda self, *a, **kw: nn.Module.__init__(self),
                'forward': lambda self, x, *a, **kw: x[0] if isinstance(x, (list, tuple)) else x,
            })
            if 'block' in mod_path:
                setattr(block_mod, cls_name, stub)
            elif 'conv' in mod_path:
                setattr(conv_mod, cls_name, stub)
        else:
            break

print(f"Registered {len(stubs_registered)} stubs: {stubs_registered}")

model = ckpt['model']
print(f"\nModel type: {type(model)}")

# Inspect each module to see what custom layers look like
print("\n=== Inspecting custom layer attributes ===")
for name, module in model.named_modules():
    cls_name = module.__class__.__name__
    if cls_name in stubs_registered:
        print(f"\n--- {name}: {cls_name} ---")
        # Show all attributes
        for attr_name in sorted(vars(module).keys()):
            val = getattr(module, attr_name)
            if isinstance(val, torch.Tensor):
                print(f"  {attr_name}: Tensor {val.shape}")
            elif isinstance(val, nn.Module):
                print(f"  {attr_name}: {val.__class__.__name__}")
            elif isinstance(val, nn.ModuleList):
                print(f"  {attr_name}: ModuleList[{len(val)}]")
            elif isinstance(val, dict) and len(str(val)) > 200:
                print(f"  {attr_name}: dict({len(val)} items)")
            else:
                print(f"  {attr_name}: {val}")
        # Also show named children
        children = list(module.named_children())
        if children:
            print(f"  Children: {[(n, c.__class__.__name__) for n, c in children]}")
        # Show named parameters (non-recursive)
        params = list(module.named_parameters(recurse=False))
        if params:
            print(f"  Direct params: {[(n, p.shape) for n, p in params]}")
        # Show _modules
        if hasattr(module, '_modules') and module._modules:
            print(f"  _modules keys: {list(module._modules.keys())}")
            for k, v in module._modules.items():
                print(f"    {k}: {v.__class__.__name__} -> ", end="")
                sub_children = list(v.named_children()) if hasattr(v, 'named_children') else []
                if sub_children:
                    print(f"children={[(n,c.__class__.__name__) for n,c in sub_children]}")
                else:
                    print(f"(leaf)")
