"""Check remaining custom layers: HyperACE, DownsampleConv, FuseModule, C3AH."""
import sys, re
sys.path.insert(0, ".")
import torch
import torch.nn as nn
import ultralytics.nn.modules.block as block_mod
import ultralytics.nn.modules.conv as conv_mod

for attempt in range(30):
    try:
        ckpt = torch.load("models/classifiers/best (9).pt", map_location="cpu", weights_only=False)
        break
    except AttributeError as e:
        match = re.search(r"Can't get attribute '(\w+)' on <module '([^']+)'", str(e))
        if match:
            cls_name, mod_path = match.group(1), match.group(2)
            stub = type(cls_name, (nn.Module,), {
                '__init__': lambda self, *a, **kw: nn.Module.__init__(self),
                'forward': lambda self, x, *a, **kw: x[0] if isinstance(x, (list, tuple)) else x,
            })
            if 'block' in mod_path: setattr(block_mod, cls_name, stub)
            elif 'conv' in mod_path: setattr(conv_mod, cls_name, stub)

model = ckpt['model']

# Focus on: HyperACE, DownsampleConv, FuseModule, C3AH
targets = {'HyperACE', 'DownsampleConv', 'FuseModule', 'C3AH', 'AdaHGComputation', 'AdaHGConv', 'AdaHyperedgeGen'}

for name, module in model.named_modules():
    cls_name = module.__class__.__name__
    if cls_name in targets and name.count('.') <= 1:  # only top-level or 1-deep
        print(f"\n=== {name}: {cls_name} ===")
        # Show non-underscore attrs
        for attr_name in sorted(vars(module).keys()):
            if attr_name.startswith('_'): continue
            val = getattr(module, attr_name)
            if isinstance(val, torch.Tensor):
                print(f"  {attr_name}: Tensor {val.shape} {val.dtype}")
            elif isinstance(val, nn.Module):
                print(f"  {attr_name}: {val.__class__.__name__}")
            else:
                print(f"  {attr_name}: {val}")
        children = list(module.named_children())
        if children:
            print(f"  CHILDREN: {[(n, c.__class__.__name__) for n, c in children]}")
        params = list(module.named_parameters(recurse=False))
        if params:
            print(f"  PARAMS: {[(n, p.shape) for n, p in params]}")
        print(f"  _modules keys: {list(module._modules.keys())}")
        
        # One level deeper for complex modules
        for cname, child in children:
            sub_children = list(child.named_children())
            sub_params = list(child.named_parameters(recurse=False))
            if sub_children:
                print(f"    {cname}: {child.__class__.__name__} -> {[(n,c.__class__.__name__) for n,c in sub_children]}")
            if sub_params:
                print(f"    {cname} params: {[(n,p.shape) for n,p in sub_params]}")
