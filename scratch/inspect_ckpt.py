"""Inspect the model checkpoint structure to understand custom layers."""
import sys
sys.path.insert(0, ".")
import torch
import torch.nn as nn

# We need to patch the modules before torch.load
# The simplest approach: add DSC3k2 etc. directly to the ultralytics modules
import ultralytics.nn.modules.block as block_mod
import ultralytics.nn.modules.conv as conv_mod

# Check what custom classes are needed by trying to load
# First, let's see what classes exist in block
existing_block_classes = [x for x in dir(block_mod) if x[0].isupper()]
print("Existing block classes (first 20):", existing_block_classes[:20])

existing_conv_classes = [x for x in dir(conv_mod) if x[0].isupper()]
print("Existing conv classes:", existing_conv_classes)

# Check if C3k2 exists
print(f"\nC3k2 exists: {hasattr(block_mod, 'C3k2')}")
print(f"C2f exists: {hasattr(block_mod, 'C2f')}")

# Let's check the C3k2 class if it exists
if hasattr(block_mod, 'C3k2'):
    C3k2 = block_mod.C3k2
    print(f"C3k2 class: {C3k2}")
    print(f"C3k2 MRO: {[c.__name__ for c in C3k2.__mro__]}")

# Now create a proper DSC3k2 that inherits from C3k2
# DSC3k2 = Depthwise Separable C3k2
if hasattr(block_mod, 'C3k2'):
    # Create DSC3k2 as alias of C3k2
    block_mod.DSC3k2 = block_mod.C3k2
    print("Set DSC3k2 = C3k2")

# Now add other missing classes
class Stub(nn.Module):
    def __init__(self, *args, **kwargs):
        super().__init__()
    def forward(self, x, *args, **kwargs):
        if isinstance(x, (list, tuple)):
            x = x[0]
        return x

for name in ['AdaHGConv', 'HyperACE', 'AdaHGComputation', 'AdaHyperedgeGen', 'FullPAD_Tunnel', 'FuseModule']:
    if not hasattr(block_mod, name):
        setattr(block_mod, name, Stub)
    if not hasattr(conv_mod, name):
        setattr(conv_mod, name, Stub)

print("\nNow trying to load checkpoint...")
ckpt = torch.load("models/classifiers/best (9).pt", map_location="cpu", weights_only=False)
print("Checkpoint keys:", list(ckpt.keys()))

if 'model' in ckpt:
    model = ckpt['model']
    print(f"\nModel type: {type(model)}")
    
    if hasattr(model, 'yaml'):
        print(f"\nModel YAML:\n{model.yaml}")
    if hasattr(model, 'yaml_file'):
        print(f"\nModel YAML file: {model.yaml_file}")
    if hasattr(model, 'args'):
        print(f"\nModel args: {dict(model.args) if hasattr(model.args, '__iter__') else model.args}")
    
    # Print all module names and types to find custom layers
    print("\n=== All model modules (custom ones only) ===")
    standard_prefixes = ('Conv', 'BatchNorm', 'SiLU', 'Sequential', 'Module', 'Linear', 'Pool', 
                         'Dropout', 'Upsample', 'SPPF', 'Detect', 'DFL', 'Identity', 'ReLU')
    for name, module in model.named_modules():
        class_name = module.__class__.__name__
        if not class_name.startswith(standard_prefixes) and name:
            print(f"  {name}: {class_name}")
