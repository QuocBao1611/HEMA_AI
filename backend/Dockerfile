# Dùng slim để tiết kiệm RAM tối đa cho gói Render Free (512MB)
FROM python:3.10-slim

WORKDIR /app

# ── Suppress noisy ML library warnings ──────────────────────────────────
ENV MPLBACKEND=Agg
ENV MPLCONFIGDIR=/tmp/matplotlib
ENV PYTHONWARNINGS=ignore

# Cài system deps tối thiểu cho opencv-headless và xử lý ảnh
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements trước để tận dụng Docker layer cache
COPY requirements.txt .

# Cài đặt dependencies:
# - Không cần --extra-index-url cho PyTorch nữa (đã bỏ torch/ultralytics)
# - Dùng --no-cache-dir để giảm dung lượng image
RUN pip install --no-cache-dir -r requirements.txt

# Copy mã nguồn backend và các thư mục cần thiết
COPY backend/ ./backend/
COPY config/ ./config/
COPY models/ ./models/
COPY data/ ./data/
COPY database/ ./database/

# Tạo các thư mục cần thiết (nếu chưa có)
RUN mkdir -p /app/logs

# Render inject $PORT tự động.
CMD ["bash", "backend/startup.sh"]
