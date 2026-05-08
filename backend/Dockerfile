# Dùng slim để tiết kiệm RAM tối đa cho gói Render Free (512MB)
FROM python:3.10-slim

WORKDIR /app

# Cài system deps tối thiểu cho opencv-headless và xử lý ảnh
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements trước để tận dụng Docker layer cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy toàn bộ mã nguồn
COPY . .

# Phân quyền cho script startup
RUN chmod +x backend/startup.sh

# Render inject $PORT tự động. Chạy qua startup.sh để download model nếu cần.
CMD ["./backend/startup.sh"]
