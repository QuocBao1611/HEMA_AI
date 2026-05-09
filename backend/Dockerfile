# Dùng slim để tiết kiệm RAM tối đa cho gói Render Free (512MB)
FROM python:3.10-slim

WORKDIR /app

# Cài system deps tối thiểu cho opencv-headless và xử lý ảnh
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements trước để tận dụng Docker layer cache
COPY requirements.txt .

# Cài đặt dependencies:
# - Dùng --extra-index-url để ưu tiên PyTorch CPU (tránh kéo CUDA ~2GB)
# - Dùng --no-cache-dir để giảm dung lượng image
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu \
    -r requirements.txt

# Copy mã nguồn backend và các thư mục cần thiết
# Chỉ copy những gì cần cho backend, tránh copy frontend-next, node_modules, v.v.
COPY backend/ ./backend/
COPY config/ ./config/
COPY models/ ./models/
COPY data/ ./data/
COPY database/ ./database/

# Tạo các thư mục cần thiết (nếu chưa có)
RUN mkdir -p /app/logs

# Render inject $PORT tự động.
# Sử dụng startup.sh để có thể tải model từ Google Drive nếu cần
CMD ["bash", "backend/startup.sh"]
