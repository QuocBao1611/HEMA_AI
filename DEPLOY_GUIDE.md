# Hướng Dẫn Triển Khai HemaVision AI

## Tổng quan

HemaVision AI gồm 3 thành phần chính cần triển khai:

| Thành phần | Công nghệ | Cổng mặc định |
|---|---|---|
| Backend API | FastAPI + Uvicorn | `8000` |
| Frontend | Next.js 15 | `3000` |
| Cơ sở dữ liệu | SQLite mặc định dev, MySQL tùy chọn production | file / `3306` |

---

## 1. Yêu cầu hệ thống

### Phần mềm

- Python >= 3.10 (khuyến nghị 3.11+)
- Node.js >= 18 (khuyến nghị 20 LTS)
- SQLite có sẵn qua Python cho dev/local
- MySQL >= 8.0 nếu triển khai production bằng MySQL
- Git

### Phần cứng tối thiểu

- RAM: 4 GB (8 GB nếu chạy model AI lớn)
- Ổ cứng: 2 GB trống cho code + model
- CPU: 2 cores trở lên

---

## 2. Cài đặt

### 2.1. Clone repo

```bash
git clone <repo-url> testModel
cd testModel
```

### 2.2. Cài đặt Backend

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux/macOS
source .venv/bin/activate

pip install -r requirements.txt
```

### 2.3. Cài đặt Frontend

```bash
cd frontend-next
npm install
cd ..
```

### 2.4. Khởi tạo cơ sở dữ liệu

Dev/local mặc định dùng SQLite, backend sẽ tự tạo file `data/hemavision.sqlite3`.

Nếu dùng MySQL:

```bash
mysql -u root < database/init_mysql.sql
```

---

## 3. Cấu hình biến môi trường

### 3.1. Backend — `.env`

Sao chép từ `.env.example` và chỉnh theo môi trường:

```env
# === Ứng dụng ===
APP_NAME=HemaVision AI

# === CORS ===
# Dev:
CORS_ALLOW_ORIGINS=http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:8000,http://localhost:8000
# Production (thay bằng domain thật):
# CORS_ALLOW_ORIGINS=https://hema.yourdomain.com

# === Cơ sở dữ liệu ===
DATABASE_URL=sqlite:///./data/hemavision.sqlite3
DATABASE_ECHO=false
DATABASE_AUTO_CREATE=true

# === Phân trang ===
HISTORY_PAGE_SIZE=20

# === Giới hạn tần suất ===
INFERENCE_RATE_LIMIT=10/minute

# === Bảo mật (BẮT BUỘC đổi trong production!) ===
SECRET_KEY=thay-bang-chuoi-ngau-nhien-dai-64-ky-tu
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

> **⚠️ QUAN TRỌNG:** Luôn đổi `SECRET_KEY` thành chuỗi ngẫu nhiên dài khi chạy production.

### 3.2. Frontend — `frontend-next/.env.local`

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

Trong production, đổi thành URL API thật:

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

---

## 4. Chạy ứng dụng

### 4.1. Môi trường phát triển (Development)

**Terminal 1 — Backend:**

```bash
# Windows
start_server.bat

# Hoặc chạy trực tiếp:
.venv\Scripts\python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 — Frontend:**

```bash
cd frontend-next
npm run dev
```

Truy cập:
- Frontend: http://127.0.0.1:3000
- Backend API: http://127.0.0.1:8000
- API docs: http://127.0.0.1:8000/docs

### 4.2. Môi trường Production

**Backend:**

```bash
.venv/bin/python -m uvicorn backend.app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 4 \
  --no-access-log
```

Hoặc dùng `gunicorn` (Linux):

```bash
.venv/bin/gunicorn backend.app.main:app \
  -w 4 \
  -k uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000
```

**Frontend:**

```bash
cd frontend-next
npm run build
npm start
```

---

## 5. Reverse Proxy (Tuỳ chọn)

Để gộp Backend và Frontend vào cùng một domain, dùng Nginx hoặc Apache làm reverse proxy.

### Nginx mẫu

```nginx
server {
    listen 80;
    server_name hema.yourdomain.com;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api/ {
        rewrite ^/api/(.*) /$1 break;
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Apache (XAMPP) mẫu

```apache
<VirtualHost *:80>
    ServerName hema.local

    # Frontend
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/

    # Backend API
    ProxyPass /api http://127.0.0.1:8000
    ProxyPassReverse /api http://127.0.0.1:8000
</VirtualHost>
```

---

## 6. Tài khoản mặc định

| Vai trò | Tên đăng nhập | Mật khẩu |
|---|---|---|
| Admin | `admin` | `admin123` |

> **⚠️** Đổi mật khẩu admin ngay sau lần đăng nhập đầu tiên trong production.

---

## 7. Kiểm tra sau triển khai

```bash
# Kiểm tra backend
curl http://127.0.0.1:8000/health

# Kiểm tra frontend (mở trình duyệt)
# http://127.0.0.1:3000

# Chạy test suite
.venv\Scripts\python -m pytest -q

# Kiểm tra frontend build
cd frontend-next
npm run lint
npm run typecheck
npm run build
```

---

## 8. Cấu trúc thư mục Model AI

Đặt file model vào thư mục `models/` và đăng ký trong `config/model_manifest.json`:

```json
{
  "models": [
    {
      "model_id": "mobilenetv2_blood",
      "display_name": "MobileNetV2 Blood Cell",
      "filename": "mobilenetv2_blood.pt",
      "framework": "pytorch"
    }
  ]
}
```

---

## 9. Xử lý sự cố thường gặp

| Vấn đề | Nguyên nhân | Giải pháp |
|---|---|---|
| CORS bị chặn | `CORS_ALLOW_ORIGINS` chưa đúng | Thêm origin frontend vào `.env` |
| DB không kết nối | MySQL chưa chạy hoặc sai `DATABASE_URL` | Kiểm tra MySQL service và chuỗi kết nối |
| Model không tải | File `.pt` thiếu hoặc sai đường dẫn | Kiểm tra `models/` và `model_manifest.json` |
| Frontend 500 | `NEXT_PUBLIC_API_URL` sai | Đảm bảo URL trỏ đúng backend |
| JWT hết hạn | Token quá `ACCESS_TOKEN_EXPIRE_MINUTES` | Đăng nhập lại hoặc tăng thời gian |
