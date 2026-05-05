# Hướng dẫn chạy HemaVision AI

Dự án có 2 thành phần chính: Backend (FastAPI) và Frontend (Next.js). Dưới đây là các cách để khởi động.

---

## ⚡ Cách 1: Nhanh nhất (One-Click)

Click đúp vào file `start_app.bat` tại thư mục gốc.

Hệ thống sẽ tự động:
1. Kích hoạt môi trường ảo Python.
2. Kiểm tra/cài đặt Node.js packages.
3. Chạy lệnh tắt các Port bị kẹt.
4. Mở cửa sổ chạy Backend (Port 8000).
5. Mở cửa sổ chạy Frontend (Port 3000).
6. Tự động mở trình duyệt.

> Để dừng hệ thống, bạn chỉ cần đóng 2 cửa sổ Console màu đen sinh ra.

---

## 🛠 Cách 2: Chạy riêng lẻ (Dành cho Dev)

Bạn cần mở 2 cửa sổ Terminal (hoặc PowerShell).

### 1. Chạy Backend (Cửa sổ 1)
Khởi động Backend FastAPI:
```powershell
# Chạy file batch dựng sẵn
start_server.bat
```
Hoặc chạy lệnh thủ công:
```powershell
.venv\Scripts\python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Chạy Frontend (Cửa sổ 2)
```powershell
cd frontend-next
npm run dev
```

---

## 🔑 Tài khoản đăng nhập
- Tên đăng nhập mặc định: `admin`
- Mật khẩu mặc định: `admin123`

---

## 📂 Lưu ý về Model AI
Hệ thống cần các file mô hình nhận diện trong thư mục `models/` để hoạt động đúng. Đảm bảo bạn đã tải và giải nén các file mô hình vào:
- `models/detectors/` (chứa `best9.onnx`, `yolov8n-bccd.pt`)
- `models/classifiers/` (chứa `best_model_v2.keras`, v.v.)
