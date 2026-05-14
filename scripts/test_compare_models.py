# -*- coding: utf-8 -*-
"""So sánh mobilenetv2_final.onnx (mới) vs mobilenetv2_blood_cell_final.onnx (cũ)."""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import numpy as np
import onnxruntime as ort
from pathlib import Path

MODELS_DIR = Path(__file__).resolve().parent.parent / "models" / "classifiers"

models = {
    "blood_cell_final (cũ)": MODELS_DIR / "mobilenetv2_blood_cell_final.onnx",
    "mobilenetv2_final (MỚI)": MODELS_DIR / "mobilenetv2_final.onnx",
}

# Load models
sessions = {}
for name, path in models.items():
    if not path.exists():
        print(f"  [KHONG TIM THAY] {name}: {path}")
        continue
    size_mb = path.stat().st_size / 1024**2
    sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0]
    out = sess.get_outputs()[0]
    sessions[name] = sess
    print(f"  [OK] {name}: {size_mb:.1f}MB | {inp.shape} -> {out.shape}")

if len(sessions) < 2:
    print("\nCan du 2 model de so sanh!")
    sys.exit(1)

# Generate 100 test samples
np.random.seed(42)
test_samples = [np.random.randn(1, 224, 224, 3).astype(np.float32) for _ in range(100)]

print("\n" + "=" * 70)
print("KET QUA SO SANH 2 MODEL TREN 100 MAU TEST")
print("=" * 70)

# Individual stats
for name, sess in sessions.items():
    confs = []
    argmaxes = []
    for sample in test_samples:
        raw = sess.run(None, {sess.get_inputs()[0].name: sample})[0]
        probs = np.asarray(raw, dtype=np.float32)
        confs.append(probs[0].max())
        argmaxes.append(probs[0].argmax())

    unique, counts = np.unique(argmaxes, return_counts=True)
    dist = dict(zip(unique.astype(int).tolist(), counts.tolist()))

    print(f"\n  {name}:")
    print(f"    Confidence: mean={np.mean(confs):.4f} +- {np.std(confs):.4f}")
    print(f"    Range: [{np.min(confs):.4f} - {np.max(confs):.4f}]")
    print(f"    Argmax distribution: {dist}")

# Pairwise comparison
names = list(sessions.keys())
n1, n2 = names[0], names[1]

agreement = 0
conf_diffs = []
same_conf = 0

for sample in test_samples:
    r1 = sessions[n1].run(None, {sessions[n1].get_inputs()[0].name: sample})[0]
    r2 = sessions[n2].run(None, {sessions[n2].get_inputs()[0].name: sample})[0]
    p1 = np.asarray(r1, dtype=np.float32)
    p2 = np.asarray(r2, dtype=np.float32)

    if p1[0].argmax() == p2[0].argmax():
        agreement += 1
    conf_diffs.append(abs(p1[0].max() - p2[0].max()))
    if abs(p1[0].max() - p2[0].max()) < 0.01:
        same_conf += 1

print("\n" + "=" * 70)
print("SO SANH TRUC TIEP")
print("=" * 70)
print(f"  Argmax agreement: {agreement}/100 ({agreement}%)")
print(f"  Confidence diff:  mean={np.mean(conf_diffs):.4f} +- {np.std(conf_diffs):.4f}")
print(f"  Confidence diff:  [{np.min(conf_diffs):.4f} - {np.max(conf_diffs):.4f}]")
print(f"  Same confidence (<0.01 diff): {same_conf}/100")

# Conclusion
print("\n" + "=" * 70)
if agreement >= 95:
    print("KET LUAN: 2 model GAN NHU GIONG HET nhau ve argmax")
    if np.mean(conf_diffs) < 0.05:
        print("  => Confidence cung rat gan nhau => co the cung 1 model goc")
    else:
        print(f"  => Confidence khac nhau (mean diff={np.mean(conf_diffs):.4f})")
        print("  => Model moi da duoc recalibrate / retrain nhe")
elif agreement >= 70:
    print("KET LUAN: 2 model KHA GIONG nhau nhung co khac biet")
else:
    print("KET LUAN: 2 model RAT KHAC nhau - model moi hoan toan khac!")
print("=" * 70)
