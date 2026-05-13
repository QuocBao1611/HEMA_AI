# -*- coding: utf-8 -*-
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
"""
convert_to_onnx.py
==================
Chạy OFFLINE trên máy local (cần đủ RAM và đã cài tensorflow + ultralytics).

Cách dùng:
    # 1. Tạo venv riêng (không ảnh hưởng production deps)
    python -m venv .venv_convert
    .venv_convert\\Scripts\\activate          # Windows
    # source .venv_convert/bin/activate     # Linux/Mac

    # 2. Cài công cụ convert
    pip install tf2onnx tensorflow ultralytics onnxruntime onnx numpy pillow

    # 3. Chạy script từ thư mục gốc dự án
    python scripts/convert_to_onnx.py

Output:
    models/classifiers/mobilenetv2_phase2_best.onnx
    models/classifiers/best_model_v2.onnx
    models/detectors/yolov8n-bccd.onnx
"""

import sys
import time
from pathlib import Path

import numpy as np

# ── Đường dẫn tính từ PROJECT_ROOT ──────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
CLASSIFIERS_DIR = PROJECT_ROOT / "models" / "classifiers"
DETECTORS_DIR   = PROJECT_ROOT / "models" / "detectors"

# ── Màu terminal ─────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

def info(msg):  print(f"{CYAN}[INFO] {msg}{RESET}")
def ok(msg):    print(f"{GREEN}[OK]   {msg}{RESET}")
def warn(msg):  print(f"{YELLOW}[WARN] {msg}{RESET}")
def error(msg): print(f"{RED}[ERR]  {msg}{RESET}")
def step(msg):  print(f"\n{BOLD}{CYAN}{'='*60}\n{msg}\n{'='*60}{RESET}")


# ============================================================================
# BUOC 1: Convert TF/Keras -> ONNX
# ============================================================================

def convert_keras_to_onnx(src_path: Path, dst_path: Path, opset: int = 13) -> bool:
    """Convert .h5 hoac .keras sang .onnx dung tf2onnx."""
    try:
        import tensorflow as tf
        import tf2onnx
        import onnx
    except ImportError as e:
        error(f"Thieu thu vien: {e}")
        error("Chay: pip install tf2onnx tensorflow onnx")
        return False

    info(f"Loading {src_path.name} ...")
    t0 = time.time()

    try:
        # Suppress TF warnings
        import os
        os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
        tf.get_logger().setLevel("ERROR")

        model = tf.keras.models.load_model(str(src_path))
    except Exception as e:
        error(f"Khong load duoc model: {e}")
        return False

    info(f"  Input shape : {model.input_shape}")
    info(f"  Output shape: {model.output_shape}")
    num_classes = model.output_shape[-1]
    input_shape = model.input_shape  # e.g. (None, 224, 224, 3)

    # Build input spec — giữ nguyên None cho batch dim để hỗ trợ dynamic batch size
    # Điều này rất quan trọng để có thể classify nhiều cropped cells cùng lúc!
    dynamic_shape = [None if d is None else d for d in input_shape]
    input_spec = (tf.TensorSpec(dynamic_shape, tf.float32, name="input"),)

    info("Converting voi tf2onnx ...")
    try:
        onnx_model, _ = tf2onnx.convert.from_keras(
            model,
            input_signature=input_spec,
            opset=opset,
            output_path=str(dst_path),
        )
    except Exception as e:
        error(f"Convert that bai: {e}")
        return False

    elapsed = time.time() - t0
    size_mb = dst_path.stat().st_size / 1024**2
    ok(f"Saved: {dst_path.name}  ({size_mb:.1f} MB)  [{elapsed:.1f}s]")
    return True, num_classes, [d for d in model.input_shape[1:] if d is not None]


# ============================================================================
# BUOC 2: Convert YOLO .pt -> ONNX
# ============================================================================

def convert_yolo_to_onnx(src_path: Path, dst_path: Path) -> bool:
    """Convert YOLOv8 .pt sang .onnx dung ultralytics export."""
    try:
        from ultralytics import YOLO
    except ImportError as e:
        error(f"Thieu thu vien: {e}")
        error("Chay: pip install ultralytics")
        return False

    info(f"Loading {src_path.name} ...")
    t0 = time.time()

    try:
        model = YOLO(str(src_path))
    except Exception as e:
        error(f"Khong load duoc YOLO model: {e}")
        return False

    info("Exporting sang ONNX (dynamic=False, simplify=True) ...")
    try:
        export_result = model.export(
            format="onnx",
            dynamic=False,
            simplify=True,
            imgsz=640,
            opset=12,
        )
        # ultralytics tu dat ten file canh .pt, move neu can
        auto_output = Path(str(src_path).replace(".pt", ".onnx"))
        if auto_output.exists() and auto_output != dst_path:
            auto_output.rename(dst_path)
            info(f"  Da move {auto_output.name} -> {dst_path.name}")
    except Exception as e:
        error(f"Export that bai: {e}")
        return False

    elapsed = time.time() - t0
    size_mb = dst_path.stat().st_size / 1024**2
    ok(f"Saved: {dst_path.name}  ({size_mb:.1f} MB)  [{elapsed:.1f}s]")
    return True


# ============================================================================
# BUOC 3: Verify tat ca .onnx sau convert
# ============================================================================

def verify_onnx_model(onnx_path: Path, input_shape_nhwc: list[int]) -> bool:
    """
    Chay inference thu voi dummy input de verify model khong bi corrupt.

    Args:
        onnx_path: duong dan toi .onnx
        input_shape_nhwc: [H, W, C] — shape input (khong ke batch)
    """
    try:
        import onnxruntime as ort
    except ImportError:
        warn("onnxruntime chua cai, bo qua verify")
        return True

    try:
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 1
        sess = ort.InferenceSession(str(onnx_path), sess_options=opts,
                                    providers=["CPUExecutionProvider"])

        inp = sess.get_inputs()[0]
        out = sess.get_outputs()[0]

        info(f"  Input  node: '{inp.name}'  shape={inp.shape}  dtype={inp.type}")
        info(f"  Output node: '{out.name}'  shape={out.shape}  dtype={out.type}")

        # Tao dummy input phu hop voi shape
        raw_shape = inp.shape          # co the la ['batch', H, W, C] hoac [1, C, H, W]
        dummy_shape = [1 if (s is None or isinstance(s, str)) else s for s in raw_shape]
        dummy = np.random.randn(*dummy_shape).astype(np.float32)

        result = sess.run(None, {inp.name: dummy})
        info(f"  Output shape: {result[0].shape}")

        ok(f"Verify OK: {onnx_path.name}")
        return True

    except Exception as e:
        error(f"Verify FAIL: {onnx_path.name} — {e}")
        return False


def verify_onnx_yolo(onnx_path: Path) -> bool:
    """Verify YOLO ONNX (input NCHW: [1, 3, 640, 640])."""
    try:
        import onnxruntime as ort
    except ImportError:
        warn("onnxruntime chua cai, bo qua verify")
        return True

    try:
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 1
        sess = ort.InferenceSession(str(onnx_path), sess_options=opts,
                                    providers=["CPUExecutionProvider"])

        inp = sess.get_inputs()[0]
        out = sess.get_outputs()[0]

        info(f"  Input  node: '{inp.name}'  shape={inp.shape}")
        info(f"  Output node: '{out.name}'  shape={out.shape}")

        dummy = np.random.randn(1, 3, 640, 640).astype(np.float32)
        result = sess.run(None, {inp.name: dummy})
        info(f"  Output shape: {result[0].shape}")

        ok(f"Verify OK: {onnx_path.name}")
        return True

    except Exception as e:
        error(f"Verify FAIL: {onnx_path.name} — {e}")
        return False


# ============================================================================
# BUOC 4: In manifest snippet de cap nhat model_manifest.json
# ============================================================================

def print_manifest_snippet(results: list[dict]) -> None:
    """In ra JSON snippet de copy vao config/model_manifest.json."""
    step("Copy snippet nay vao config/model_manifest.json")
    print('{\n  "models": {')
    for r in results:
        print(f'    "{r["filename"]}": {{')
        print(f'      "model_id": "{r["model_id"]}",')
        print(f'      "display_name": "{r["display_name"]}",')
        print(f'      "preprocessing": "{r["preprocessing"]}",')
        print(f'      "input_shape": {r["input_shape"]},')
        print(f'      "num_classes": {r["num_classes"]}')
        print('    },')
    print("  }\n}")


# ============================================================================
# MAIN
# ============================================================================

def main():
    step("HemaVision -- Convert Models to ONNX")
    info(f"PROJECT_ROOT: {PROJECT_ROOT}")

    results = []
    all_ok  = True

    # -- 1. MobileNetV2 .h5 -> ONNX ------------------------------------------
    step("1/3 -- MobileNetV2 Phase2 Best (.h5 -> .onnx)")
    src = CLASSIFIERS_DIR / "mobilenetv2_phase2_best.h5"
    dst = CLASSIFIERS_DIR / "mobilenetv2_phase2_best.onnx"

    if not src.exists():
        error(f"Khong tim thay: {src}")
        all_ok = False
    elif dst.exists():
        warn(f"Da ton tai: {dst.name} -- bo qua convert (xoa file neu muon convert lai)")
    else:
        ret = convert_keras_to_onnx(src, dst)
        if not ret:
            all_ok = False

    if dst.exists():
        ok_verify = verify_onnx_model(dst, [224, 224, 3])
        all_ok = all_ok and ok_verify
        results.append({
            "filename": dst.name,
            "model_id": "mobilenetv2_phase2_best",
            "display_name": "MobileNetV2 Phase2 Best",
            "preprocessing": "mobilenet_v2",
            "input_shape": [224, 224, 3],
            "num_classes": 14,
        })

    # -- 2. ResNet50 / best_model_v2 .keras -> ONNX --------------------------
    step("2/3 -- Best Model V2 ResNet50 (.keras -> .onnx)")
    src = CLASSIFIERS_DIR / "best_model_v2.keras"
    dst = CLASSIFIERS_DIR / "best_model_v2.onnx"

    if not src.exists():
        error(f"Khong tim thay: {src}")
        all_ok = False
    elif dst.exists():
        warn(f"Da ton tai: {dst.name} -- bo qua convert")
    else:
        ret = convert_keras_to_onnx(src, dst)
        if not ret:
            all_ok = False

    if dst.exists():
        ok_verify = verify_onnx_model(dst, [224, 224, 3])
        all_ok = all_ok and ok_verify
        results.append({
            "filename": dst.name,
            "model_id": "best_model_v2",
            "display_name": "Best Model V2 (ResNet50)",
            "preprocessing": "resnet50",
            "input_shape": [224, 224, 3],
            "num_classes": 14,
        })

    # -- 3. YOLOv8n-bccd .pt -> ONNX -----------------------------------------
    step("3/3 -- YOLOv8n-BCCD (.pt -> .onnx)")
    src = DETECTORS_DIR / "yolov8n-bccd.pt"
    dst = DETECTORS_DIR / "yolov8n-bccd.onnx"

    if not src.exists():
        error(f"Khong tim thay: {src}")
        all_ok = False
    elif dst.exists():
        warn(f"Da ton tai: {dst.name} -- bo qua convert")
    else:
        ret = convert_yolo_to_onnx(src, dst)
        if not ret:
            all_ok = False

    if dst.exists():
        ok_verify = verify_onnx_yolo(dst)
        all_ok = all_ok and ok_verify
        results.append({
            "filename": dst.name,
            "model_id": "yolov8n_bccd",
            "display_name": "YOLOv8n BCCD Detector",
            "preprocessing": "yolo_detect",
            "input_shape": [640, 640, 3],
            "num_classes": 3,   # BCCD: RBC, WBC, Platelets
        })

    # -- Ket qua tong --------------------------------------------------------
    step("KET QUA TONG")
    if all_ok:
        ok("Tat ca models da convert va verify thanh cong!")
    else:
        error("Mot so models gap loi — kiem tra output phia tren.")
        sys.exit(1)

    # In manifest snippet
    if results:
        print_manifest_snippet(results)

    step("XONG! Cac buoc tiep theo:")
    print("  1. Cap nhat config/model_manifest.json voi snippet o tren")
    print("  2. Them .onnx vao git: git add models/")
    print("  3. Tiep tuc sua classifier_service.py va analysis_service.py")


if __name__ == "__main__":
    main()
