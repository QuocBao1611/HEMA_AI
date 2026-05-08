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
RUN pip install --no-cache-dir -r requirements.txt

# Copy toàn bộ mã nguồn (bao gồm thư mục models/ vì đã xóa khỏi .dockerignore)
COPY . .

# Render inject $PORT tự động.
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT --workers 1"]
