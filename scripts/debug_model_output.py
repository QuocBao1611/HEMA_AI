# -*- coding: utf-8 -*-
"""
Debug script: So sánh output thực tế giữa các model
- Raw ONNX output vs sau Temperature Scaling
- Trên ảnh thật (nếu có) và random noise
- Phân tích phân phối confidence
"""
import sys, os, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.path.insert(0, 'C:/xampp/htdocs/HEMA_AI')

import numpy as np
import onnxruntime as ort
from pathlib import Path
import json

MODELS_DIR = Path("models/classifiers")
SAMPLE_DIR = Path("samples")

# ── Temperature Scaling (copy từ classifier_service để tránh lỗi import) ─────
_TEMPERATURE_MAP: dict[str, float] = {
    "mobilenet_phase9": 0.5204,
    "mobilenet_final": 0.5204,
    "mobilenet_blood_cell": 0.5204,
    "mobilenet_blood_cell_v2": 0.5204,
    "mobilenetv2_blood_cell_final": 0.5204,
}

def _apply_temperature_scaling(probs: np.ndarray, model_id: str) -> np.ndarray:
    T = _TEMPERATURE_MAP.get(model_id)
    if T is None or T <= 0:
        return probs
    eps = 1e-7
    logits = np.log(np.clip(probs, eps, 1.0))
    scaled_logits = logits / T
    scaled_logits -= np.max(scaled_logits, axis=-1, keepdims=True)
    exp_s = np.exp(scaled_logits)
    calibrated = exp_s / np.sum(exp_s, axis=-1, keepdims=True)
    return calibrated.astype(np.float32)

# ── Các model cần debug ──────────────────────────────────────────────────────
model_files = {
    "mobilenetv2_final (MỚI)": MODELS_DIR / "mobilenetv2_final.onnx",
    "blood_cell_v2": MODELS_DIR / "mobilenetv2_blood_cell_v2.onnx",
}

# Thêm các model khác nếu có
for f in MODELS_DIR.glob("*.onnx"):
    if f.name not in [p.name for p in model_files.values()]:
        model_files[f"other_{f.stem}"] = f

# ── Load model manifest để lấy model_id cho temperature scaling ──────────────
with open("config/model_manifest.json", "r") as f:
    manifest = json.load(f)
models_manifest = manifest.get("models", manifest)

# Map filename -> model_id
filename_to_model_id = {}
for fname, entry in models_manifest.items():
    if isinstance(entry, dict) and "model_id" in entry:
        filename_to_model_id[fname] = entry["model_id"]

print("=" * 80)
print("DEBUG: KIEM TRA OUTPUT MODEL TREN RANDOM NOISE")
print("=" * 80)

# ── Tạo test samples ─────────────────────────────────────────────────────────
np.random.seed(42)
test_samples = [np.random.randn(1, 224, 224, 3).astype(np.float32) for _ in range(50)]

# ── Load từng model và kiểm tra ──────────────────────────────────────────────
for name, path in model_files.items():
    if not path.exists():
        print(f"\n  [SKIP] {name}: File not found at {path}")
        continue
    
    size_mb = path.stat().st_size / 1024**2
    sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0]
    out = sess.get_outputs()[0]
    
    print(f"\n{'='*60}")
    print(f"  MODEL: {name}")
    print(f"  File: {path.name} ({size_mb:.1f}MB)")
    print(f"  Input shape: {inp.shape} -> Output shape: {out.shape}")
    print(f"{'='*60}")
    
    # Lấy model_id cho temperature scaling
    model_id = filename_to_model_id.get(path.name, "")
    print(f"  Model ID (for temp scaling): {model_id!r}")
    
    T = _TEMPERATURE_MAP.get(model_id)
    print(f"  Temperature T: {T}")
    
    # Test trên random noise
    raw_outputs = []
    processed_outputs = []
    
    for i, sample in enumerate(test_samples[:10]):  # Chỉ 10 mẫu để debug
        raw = sess.run(None, {inp.name: sample})[0]
        raw_probs = np.asarray(raw, dtype=np.float32)
        
        # Kiểm tra xem output đã là softmax chưa
        row_sum = raw_probs[0].sum()
        is_softmax = abs(row_sum - 1.0) < 0.01
        
        # Nếu chưa là softmax, áp dụng softmax
        if not is_softmax:
            # Raw logits -> softmax
            e_x = np.exp(raw_probs - np.max(raw_probs, axis=-1, keepdims=True))
            softmax_probs = e_x / np.sum(e_x, axis=-1, keepdims=True)
        else:
            softmax_probs = raw_probs
        
        # Áp dụng temperature scaling
        calibrated = _apply_temperature_scaling(softmax_probs, model_id)
        
        raw_outputs.append(softmax_probs)
        processed_outputs.append(calibrated)
    
    # Phân tích
    raw_confs = [p[0].max() for p in raw_outputs]
    cal_confs = [p[0].max() for p in processed_outputs]
    raw_argmaxes = [p[0].argmax() for p in raw_outputs]
    cal_argmaxes = [p[0].argmax() for p in processed_outputs]
    
    print(f"\n  --- RAW Softmax Output ---")
    print(f"    Confidence: mean={np.mean(raw_confs):.6f} +- {np.std(raw_confs):.6f}")
    print(f"    Range: [{np.min(raw_confs):.6f} - {np.max(raw_confs):.6f}]")
    print(f"    Argmax distribution: {np.bincount(raw_argmaxes, minlength=14).tolist()}")
    print(f"    Sum check (should be ~1.0): {raw_outputs[0][0].sum():.6f}")
    
    print(f"\n  --- After Temperature Scaling (T={T}) ---")
    print(f"    Confidence: mean={np.mean(cal_confs):.6f} +- {np.std(cal_confs):.6f}")
    print(f"    Range: [{np.min(cal_confs):.6f} - {np.max(cal_confs):.6f}]")
    print(f"    Argmax distribution: {np.bincount(cal_argmaxes, minlength=14).tolist()}")
    print(f"    Sum check: {processed_outputs[0][0].sum():.6f}")
    
    # So sánh
    diff = np.mean(cal_confs) - np.mean(raw_confs)
    print(f"\n  --- TÁC ĐỘNG CỦA TEMPERATURE SCALING ---")
    print(f"    Mean confidence BEFORE: {np.mean(raw_confs):.6f}")
    print(f"    Mean confidence AFTER:  {np.mean(cal_confs):.6f}")
    print(f"    Delta: {diff:+.6f} ({diff/np.mean(raw_confs)*100:+.2f}%)")
    
    # Kiểm tra argmax có thay đổi không
    changes = sum(1 for a, b in zip(raw_argmaxes, cal_argmaxes) if a != b)
    print(f"    Argmax changes: {changes}/{len(raw_argmaxes)}")
    
    # In top-3 classes cho mẫu đầu tiên
    print(f"\n  --- Top-3 classes (sample 0) ---")
    print(f"    RAW: {np.argsort(raw_outputs[0][0])[::-1][:3].tolist()} "
          f"confs={np.sort(raw_outputs[0][0])[::-1][:3].tolist()}")
    print(f"    CAL: {np.argsort(processed_outputs[0][0])[::-1][:3].tolist()} "
          f"confs={np.sort(processed_outputs[0][0])[::-1][:3].tolist()}")

# ── KIỂM TRA TRÊN ẢNH THẬT (nếu có) ─────────────────────────────────────────
print("\n" + "=" * 80)
print("DEBUG: KIEM TRA TREN ANH THAT (NEU CO)")
print("=" * 80)

sample_images = list(SAMPLE_DIR.glob("*.*")) if SAMPLE_DIR.exists() else []
if sample_images:
    from PIL import Image
    
    for img_path in sample_images[:3]:  # Tối đa 3 ảnh
        print(f"\n  --- Image: {img_path.name} ---")
        try:
            img = Image.open(img_path).convert("RGB").resize((224, 224))
            batch = np.expand_dims(np.asarray(img, dtype=np.float32), axis=0)
            # mobilenet_v2 preprocessing
            preprocessed = (batch / 127.5) - 1.0
            
            for name, path in model_files.items():
                if not path.exists():
                    continue
                sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
                inp = sess.get_inputs()[0]
                raw = sess.run(None, {inp.name: preprocessed})[0]
                raw_probs = np.asarray(raw, dtype=np.float32)
                
                # Softmax nếu cần
                if abs(raw_probs[0].sum() - 1.0) > 0.01:
                    e_x = np.exp(raw_probs - np.max(raw_probs, axis=-1, keepdims=True))
                    raw_probs = e_x / np.sum(e_x, axis=-1, keepdims=True)
                
                model_id = filename_to_model_id.get(path.name, "")
                calibrated = _apply_temperature_scaling(raw_probs, model_id)
                
                print(f"    {name}:")
                print(f"      Raw top-1: {raw_probs[0].argmax()} conf={raw_probs[0].max():.4f}")
                print(f"      Cal top-1: {calibrated[0].argmax()} conf={calibrated[0].max():.4f}")
        except Exception as e:
            print(f"    Error: {e}")
else:
    print("\n  [INFO] Không tìm thấy ảnh mẫu trong thư mục samples/")
    print("  [INFO] Đang tạo ảnh synthetic để test...")
    
    # Tạo ảnh synthetic
    from PIL import Image, ImageDraw
    synthetic = Image.new("RGB", (224, 224), color=(200, 200, 200))
    draw = ImageDraw.Draw(synthetic)
    draw.ellipse([50, 50, 174, 174], fill=(100, 100, 200), outline=(50, 50, 150))
    
    batch = np.expand_dims(np.asarray(synthetic, dtype=np.float32), axis=0)
    preprocessed = (batch / 127.5) - 1.0
    
    print("\n  --- Synthetic image (gray circle on gray bg) ---")
    for name, path in model_files.items():
        if not path.exists():
            continue
        sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        inp = sess.get_inputs()[0]
        raw = sess.run(None, {inp.name: preprocessed})[0]
        raw_probs = np.asarray(raw, dtype=np.float32)
        
        if abs(raw_probs[0].sum() - 1.0) > 0.01:
            e_x = np.exp(raw_probs - np.max(raw_probs, axis=-1, keepdims=True))
            raw_probs = e_x / np.sum(e_x, axis=-1, keepdims=True)
        
        model_id = filename_to_model_id.get(path.name, "")
        calibrated = _apply_temperature_scaling(raw_probs, model_id)
        
        print(f"    {name}:")
        print(f"      Raw top-3: {np.argsort(raw_probs[0])[::-1][:3].tolist()}")
        print(f"      Raw confs: {np.sort(raw_probs[0])[::-1][:3].tolist()}")
        print(f"      Cal top-3: {np.argsort(calibrated[0])[::-1][:3].tolist()}")
        print(f"      Cal confs: {np.sort(calibrated[0])[::-1][:3].tolist()}")

print("\n" + "=" * 80)
print("DEBUG HOAN TAT")
print("=" * 80)
