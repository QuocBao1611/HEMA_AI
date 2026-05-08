#!/bin/bash
# startup.sh - Tối ưu cho Render Free Tier
# Chạy từ WORKDIR /app (xem Dockerfile)

set -e

# Đường dẫn model (tính từ /app)
MODEL_DIR="./models/detectors"
MODEL_PATH="$MODEL_DIR/best9.onnx"

# Tạo thư mục nếu chưa có
mkdir -p "$MODEL_DIR"
mkdir -p "./models/classifiers"
mkdir -p "./data"
mkdir -p "./logs"

# Tải model từ Google Drive nếu chưa tồn tại (Dùng gdown)
if [ ! -f "$MODEL_PATH" ]; then
    echo "--- Model not found. Downloading from Google Drive... ---"
    # Cài gdown nếu chưa có
    pip install gdown -q 2>/dev/null || true
    
    # ID file best9.onnx trên Google Drive (Công khai hoặc có quyền truy cập)
    GDRIVE_ID="${MODEL_GDRIVE_ID:-}"
    
    if [ -n "$GDRIVE_ID" ]; then
        echo "Downloading best9.onnx from Google Drive (ID: $GDRIVE_ID)..."
        gdown "https://drive.google.com/uc?id=$GDRIVE_ID" -O "$MODEL_PATH" || {
            echo "!!! WARNING: Failed to download model from Google Drive !!!"
        }
    else
        echo "!!! CẢNH BÁO: Chưa cấu hình MODEL_GDRIVE_ID. Hệ thống có thể lỗi khi chạy inference best9 !!!"
        echo "!!! Tạo file model rỗng để tránh crash khi import module..."
        # Tạo file rỗng để tránh lỗi FileNotFoundError khi import module
        touch "$MODEL_PATH"
    fi
fi

echo "--- Starting HemaVision Backend on Port ${PORT:-10000} ---"

# Chạy uvicorn từ /app (thư mục gốc chứa backend package)
# --workers 1 để tiết kiệm RAM trên gói Free (512MB)
cd /app
exec uvicorn backend.app.main:app --host 0.0.0.0 --port "${PORT:-10000}" --workers 1
