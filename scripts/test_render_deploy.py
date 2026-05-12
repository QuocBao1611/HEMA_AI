# -*- coding: utf-8 -*-
"""Test Render deployment after ONNX-only push."""
import urllib.request
import json
import sys

BASE_URL = "https://hmai-backend.onrender.com/api/v1"

def test(endpoint, label):
    url = f"{BASE_URL}/{endpoint}"
    print(f"\n{'='*60}")
    print(f"Testing: GET {url}")
    print(f"{'='*60}")
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode())
            print(f"Status: {resp.status}")
            print(json.dumps(data, indent=2, ensure_ascii=False))
        return True
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

# Test 1: Health
ok1 = test("health", "Health Check")

# Test 2: Models info
ok2 = test("models", "Models Info")

# Test 3: System info
ok3 = test("system/info", "System Info")

print(f"\n{'='*60}")
if ok1 and ok2 and ok3:
    print("✅ DEPLOY TEST PASSED! Backend ONNX-only running on Render!")
else:
    print("⚠️  Some tests failed. Render may still be building.")
    print("   Wait 2-3 minutes and try again.")
print(f"{'='*60}")
