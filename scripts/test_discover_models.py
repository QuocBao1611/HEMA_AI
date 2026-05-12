# -*- coding: utf-8 -*-
"""Test discover_model_paths returns all .onnx files."""
import sys, os
sys.path.insert(0, 'C:/xampp/htdocs/HEMA_AI')
os.environ['MPLBACKEND'] = 'Agg'

from backend.app.api.routes.system import _build_lightweight_model_list

models = _build_lightweight_model_list()
print(f"Found {len(models)} models:")
for m in models:
    print(f"  - {m['model_id']}: {m['display_name']} ({m['model_path']})")
    print(f"    preprocessing: {m['preprocessing']}, num_classes: {m['num_classes']}")
