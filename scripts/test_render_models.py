# -*- coding: utf-8 -*-
"""Test Render API returns all 3 models."""
import urllib.request
import json
import time

print("Waiting 2 minutes for Render build...")
time.sleep(120)

r = urllib.request.urlopen('https://hmai-backend.onrender.com/api/v1/health', timeout=120)
d = json.loads(r.read())
models = d.get('available_models', [])
print(f"Found {len(models)} models:")
for m in models:
    print(f"  - {m['model_id']}: {m['display_name']} ({m.get('model_path', 'N/A')})")
    print(f"    preprocessing: {m.get('preprocessing')}, num_classes: {m.get('num_classes')}")
