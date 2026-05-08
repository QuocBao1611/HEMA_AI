#!/bin/bash
# startup.sh - Tối ưu cho Render Free Tier

# Đường dẫn model
MODEL_DIR="./models/detectors"
MODEL_PATH="$MODEL_DIR/best9.onnx"

# Tạo thư mục nếu chưa có
mkdir -p "$MODEL_DIR"
mkdir -p "./models/classifiers"
mkdir -p "./database"
mkdir -p "./logs"

# Tải model từ Google Drive nếu chưa tồn tại (Dùng gdown)
# Lưu ý: Thay YOUR_FILE_ID_HERE bằng ID thực tế của bạn
if [ ! -f "$MODEL_PATH" ]; then
    echo "--- Model not found. Downloading from Google Drive... ---"
    # Cài gdown nếu chưa có (thường đã có trong requirements.txt)
    pip install gdown -q
    
    # ID file best9.onnx trên Google Drive (Công khai hoặc có quyền truy cập)
    GDRIVE_ID="${MODEL_GDRIVE_ID:-YOUR_FILE_ID_HERE}"
    
    if [ "$GDRIVE_ID" != "YOUR_FILE_ID_HERE" ]; then
        gdown "https://drive.google.com/uc?id=$GDRIVE_ID" -O "$MODEL_PATH"
    else
        echo "!!! CẢNH BÁO: Chưa cấu hình MODEL_GDRIVE_ID. Hệ thống có thể lỗi khi chạy inference !!!"
    fi
fi

echo "--- Starting HemaVision Backend on Port $PORT ---"

# Chạy uvicorn. 
# --workers 1 để tiết kiệm RAM trên gói Free (512MB)
exec uvicorn backend.app.main:app --host 0.0.0.0 --port "$PORT" --workers 1
