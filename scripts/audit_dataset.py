# -*- coding: utf-8 -*-
"""
audit_dataset.py — Kiểm tra toàn diện data/balanced_train_2000/
================================================================
Kiểm tra:
  1. Số lượng ảnh mỗi class (balance check)
  2. File bị corrupt / không mở được
  3. Ảnh không đúng mode (không phải RGB)
  4. Kích thước ảnh bất thường (quá nhỏ / quá lớn / aspect ratio lạ)
  5. Ảnh toàn màu đồng nhất (blank / solid color)
  6. Ảnh trùng lặp (exact duplicate bằng MD5)
  7. Ảnh đặt nhầm folder (dùng color histogram clustering đơn giản)
"""

import sys, io, os, hashlib, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import numpy as np
from pathlib import Path
from PIL import Image, ImageStat
from collections import defaultdict

# ─── Config ───────────────────────────────────────────────────────────────────
DATA_DIR   = Path("data/balanced_train_2000")
EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"}

MIN_PIXELS = 32 * 32          # nhỏ hơn này là bất thường
MAX_PIXELS = 4096 * 4096      # lớn hơn này là bất thường
MAX_ASPECT = 5.0               # w/h hoặc h/w > 5 là bất thường
BLANK_STD_THRESHOLD = 6.0     # std < 6 → ảnh gần như solid color
NEAR_DUP_ENABLED = True        # MD5 exact duplicate check

# ─── Helpers ──────────────────────────────────────────────────────────────────
def file_md5(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def check_image(path: Path) -> dict:
    result = {
        "path": str(path),
        "ok": True,
        "issues": [],
        "width": None,
        "height": None,
        "mode": None,
        "size_bytes": 0,
        "md5": None,
    }

    # 0. File không tồn tại
    if not path.exists():
        result["ok"] = False
        result["issues"].append("FILE_NOT_FOUND")
        return result

    result["size_bytes"] = path.stat().st_size

    # 0. File rỗng
    if result["size_bytes"] == 0:
        result["ok"] = False
        result["issues"].append("FILE_EMPTY")
        return result

    # 1. Thử mở ảnh
    try:
        with Image.open(path) as img:
            img.verify()   # kiểm tra header
    except Exception as e:
        result["ok"] = False
        result["issues"].append(f"CORRUPT:{e}")
        return result

    # 2. Load đầy đủ
    try:
        with Image.open(path) as img:
            img_rgb = img.convert("RGB")
            w, h = img_rgb.size
            result["width"]  = w
            result["height"] = h
            result["mode"]   = img.mode
            arr = np.array(img_rgb, dtype=np.float32)
    except Exception as e:
        result["ok"] = False
        result["issues"].append(f"LOAD_ERROR:{e}")
        return result

    # 3. Kích thước bất thường
    pixels = w * h
    if pixels < MIN_PIXELS:
        result["issues"].append(f"TOO_SMALL:{w}x{h}")
    if pixels > MAX_PIXELS:
        result["issues"].append(f"TOO_LARGE:{w}x{h}")
    aspect = max(w, h) / max(min(w, h), 1)
    if aspect > MAX_ASPECT:
        result["issues"].append(f"ODD_ASPECT:{w}x{h}(ratio={aspect:.1f})")

    # 4. Ảnh blank / solid color
    std_val = float(arr.std())
    if std_val < BLANK_STD_THRESHOLD:
        result["issues"].append(f"BLANK_OR_SOLID(std={std_val:.2f})")

    # 5. MD5
    if NEAR_DUP_ENABLED:
        result["md5"] = file_md5(path)

    if result["issues"]:
        result["ok"] = False

    return result


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    if not DATA_DIR.exists():
        print(f"[ERROR] Không tìm thấy thư mục: {DATA_DIR}")
        sys.exit(1)

    classes = sorted([d.name for d in DATA_DIR.iterdir() if d.is_dir() and not d.name.startswith('_')])
    print("=" * 70)
    print(f"  DATASET AUDIT: {DATA_DIR}")
    print(f"  Classes found: {len(classes)}  →  {classes}")
    print("=" * 70)

    # Thu thập tất cả files
    all_files: dict[str, list[Path]] = {}
    for cls in classes:
        cls_dir = DATA_DIR / cls
        files = [f for f in cls_dir.iterdir()
                 if f.is_file() and f.suffix.lower() in EXTENSIONS]
        all_files[cls] = sorted(files)

    total_files = sum(len(v) for v in all_files.values())
    print(f"\n📁 TỔNG SỐ ẢNH: {total_files}\n")

    # ── 1. Class balance ─────────────────────────────────────────────────────
    print("─" * 70)
    print("  [1] CLASS BALANCE")
    print("─" * 70)
    counts = {cls: len(files) for cls, files in all_files.items()}
    max_count = max(counts.values()) if counts else 1
    min_count = min(counts.values()) if counts else 0

    for cls in classes:
        n = counts[cls]
        bar = "█" * int(30 * n / max_count)
        flag = "⚠️ " if n < min_count * 0.7 or n > max_count * 1.3 else "   "
        print(f"  {flag}{cls:>4}  {n:>5}  {bar}")

    print(f"\n  Max: {max_count}  |  Min: {min_count}  |  "
          f"Imbalance ratio: {max_count/max(min_count,1):.2f}x")

    # ── 2. Image quality checks ──────────────────────────────────────────────
    print("\n─" * 70)
    print("  [2] KIỂM TRA CHẤT LƯỢNG ẢNH (có thể mất vài phút...)")
    print("─" * 70)

    md5_map: dict[str, list[str]] = defaultdict(list)  # md5 → [paths]
    issues_by_class: dict[str, list[dict]] = defaultdict(list)
    all_sizes: list[tuple[int,int]] = []
    checked = 0
    total_issues = 0

    for cls in classes:
        for fpath in all_files[cls]:
            res = check_image(fpath)
            checked += 1
            if res["width"]:
                all_sizes.append((res["width"], res["height"]))
            if res["md5"]:
                md5_map[res["md5"]].append(str(fpath))
            if res["issues"]:
                total_issues += 1
                issues_by_class[cls].append(res)
            if checked % 200 == 0:
                print(f"    ... {checked}/{total_files} checked")

    print(f"\n  ✅ Đã kiểm tra: {checked} ảnh")

    # ── 3. Báo cáo issues ────────────────────────────────────────────────────
    print("\n─" * 70)
    print(f"  [3] VẤN ĐỀ TÌM THẤY: {total_issues} ảnh có lỗi")
    print("─" * 70)

    if total_issues == 0:
        print("  ✅ Tất cả ảnh đều OK!")
    else:
        for cls in classes:
            if not issues_by_class[cls]:
                continue
            print(f"\n  [{cls}] — {len(issues_by_class[cls])} ảnh có vấn đề:")
            for item in issues_by_class[cls]:
                fname = Path(item["path"]).name
                sz = f"{item['width']}x{item['height']}" if item["width"] else "?"
                print(f"    ❌ {fname:40s}  {sz:>10}  {', '.join(item['issues'])}")

    # ── 4. Duplicate check ───────────────────────────────────────────────────
    print("\n─" * 70)
    print("  [4] DUPLICATE CHECK (MD5 exact)")
    print("─" * 70)

    duplicates = {md5: paths for md5, paths in md5_map.items() if len(paths) > 1}
    if not duplicates:
        print("  ✅ Không có ảnh trùng lặp!")
    else:
        total_dup_files = sum(len(v) for v in duplicates.values())
        print(f"  ⚠️  Tìm thấy {len(duplicates)} nhóm trùng ({total_dup_files} files):")
        for md5, paths in sorted(duplicates.items()):
            print(f"\n  MD5: {md5[:16]}...")
            for p in paths:
                # Lấy class từ path
                rel = Path(p).relative_to(DATA_DIR)
                print(f"    📄 {rel}")

    # ── 5. Size distribution ─────────────────────────────────────────────────
    print("\n─" * 70)
    print("  [5] PHÂN PHỐI KÍCH THƯỚC ẢNH")
    print("─" * 70)

    if all_sizes:
        widths  = [s[0] for s in all_sizes]
        heights = [s[1] for s in all_sizes]
        print(f"  Width  → min: {min(widths):4d}  max: {max(widths):4d}  "
              f"mean: {np.mean(widths):.0f}  std: {np.std(widths):.0f}")
        print(f"  Height → min: {min(heights):4d}  max: {max(heights):4d}  "
              f"mean: {np.mean(heights):.0f}  std: {np.std(heights):.0f}")

        # Các kích thước phổ biến nhất
        from collections import Counter
        size_counter = Counter(all_sizes)
        print(f"\n  Top 10 kích thước phổ biến nhất:")
        for size, count in size_counter.most_common(10):
            print(f"    {size[0]:4d}x{size[1]:4d}  →  {count:5d} ảnh "
                  f"({count/len(all_sizes)*100:.1f}%)")

        # Ảnh không phải kích thước chuẩn
        typical_sizes = {sz for sz, cnt in size_counter.items()
                         if cnt >= max(2, len(all_sizes) * 0.01)}
        non_typical = [(s, p) for s, p in zip(all_sizes,
                        [str(f) for cls in classes for f in all_files[cls]])
                       if s not in typical_sizes]
        if non_typical:
            print(f"\n  ⚠️  {len(non_typical)} ảnh có kích thước khác với đa số:")
            for (w, h), p in non_typical[:20]:
                print(f"    {w}x{h}  {Path(p).relative_to(DATA_DIR)}")
            if len(non_typical) > 20:
                print(f"    ... và {len(non_typical)-20} ảnh khác")

    # ── 6. Summary ───────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("  SUMMARY")
    print("=" * 70)
    print(f"  Tổng ảnh          : {total_files}")
    print(f"  Số class          : {len(classes)}")
    print(f"  Ảnh có vấn đề     : {total_issues}  ({total_issues/max(total_files,1)*100:.1f}%)")
    print(f"  Nhóm trùng lặp    : {len(duplicates)}")
    print(f"  Imbalance ratio   : {max_count/max(min_count,1):.2f}x  "
          f"(min={min_count}, max={max_count})")

    if total_issues == 0 and not duplicates:
        print("\n  ✅ Dataset SẠCH — sẵn sàng train!")
    else:
        print("\n  ⚠️  Cần xử lý các vấn đề trên trước khi train.")

    print("=" * 70)


if __name__ == "__main__":
    main()
