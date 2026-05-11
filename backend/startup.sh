#!/bin/bash
# startup.sh - Tối ưu cho Render Free Tier
# Chạy từ WORKDIR /app (xem Dockerfile)
#
# QUAN TRỌNG: Không tải model từ Google Drive ở đây vì Render Free Tier
# (512MB RAM) sẽ bị crash/OOM khi dùng gdown. Model best9.onnx đã được
# COPY vào Docker image qua Dockerfile (COPY models/ ./models/).

set -e

# ── Suppress noisy ML library warnings ──────────────────────────────────
export TF_CPP_MIN_LOG_LEVEL=3
export TF_ENABLE_ONEDNN_OPTS=0
export MPLBACKEND=Agg
export MPLCONFIGDIR=/tmp/matplotlib
export TF_CPP_MIN_VLOG_LEVEL=0
export KMP_WARNINGS=0
export GRPC_VERBOSITY=ERROR
export PYTHONWARNINGS=ignore

# Đường dẫn model (tính từ /app)
MODEL_DIR="./models/detectors"
MODEL_PATH="$MODEL_DIR/best9.onnx"

# Tạo thư mục nếu chưa có
mkdir -p "$MODEL_DIR"
mkdir -p "./models/classifiers"
mkdir -p "./data"
mkdir -p "./logs"

# Tạo matplotlib cache directory để tránh regenerating font cache mỗi lần
mkdir -p /tmp/matplotlib

# Kiểm tra model đã tồn tại trong image chưa
if [ ! -f "$MODEL_PATH" ]; then
    echo "!!! CẢNH BÁO: Không tìm thấy $MODEL_PATH trong Docker image !!!"
    echo "!!! Tạo file model rỗng để tránh crash khi import module..."
    touch "$MODEL_PATH"
fi

echo "--- Starting HemaVision Backend on Port ${PORT:-10000} ---"

# Chạy uvicorn từ /app (thư mục gốc chứa backend package)
# --workers 1 để tiết kiệm RAM trên gói Free (512MB)
exec uvicorn backend.app.main:app --host 0.0.0.0 --port "${PORT:-10000}" --workers 1
