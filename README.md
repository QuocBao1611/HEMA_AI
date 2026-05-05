# 🔬 HemaVision AI

![HemaVision Banner](https://img.shields.io/badge/HemaVision-AI_Diagnostics-blue?style=for-the-badge&logo=react)
![Version](https://img.shields.io/badge/version-1.0.0-success?style=for-the-badge)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![Next.js](https://img.shields.io/badge/Next.js-black?style=for-the-badge&logo=next.js)

**HemaVision AI** là hệ thống Web Application phân tích tiêu bản máu (Blood Smear) hỗ trợ chuẩn đoán lâm sàng, ứng dụng công nghệ Trí tuệ Nhân tạo thông qua quy trình: **Phát hiện (Detect) → Cắt (Crop) → Phân loại (Classify)**.

Hệ thống được thiết kế dành cho các phòng xét nghiệm và bệnh viện, với giao diện hiện đại, tính năng đa dạng, và hỗ trợ "Human-in-the-Loop" (con người kiểm duyệt kết quả AI).

---

## ✨ Tính năng nổi bật (Version 1.0.0)

- **🧠 Pipeline AI Chuẩn Xác:** Sử dụng mô hình YOLO (như YOLOv8n) để phát hiện tế bào và các mô hình học sâu chuyên sâu (MobileNetV2, ResNet50, Best9) để phân loại chính xác từng tế bào.
- **🧑‍⚕️ Cảnh Báo Lâm Sàng (Clinical Flags):** Tự động phát hiện bất thường trong tỷ lệ tế bào (Bạch cầu, Hồng cầu, Tiểu cầu) và đưa ra cảnh báo 3 cấp độ (Bình thường, Cảnh báo, Nguy hiểm).
- **⚖️ So Sánh Đa Mô Hình (Multi-Model Compare):** Phân tích 1 mẫu máu đồng thời bằng 3 mô hình AI khác nhau. Cung cấp biểu đồ Radar, biểu đồ cột và hệ thống tư vấn (Advice) chọn mô hình tốt nhất.
- **✍️ Human-in-the-Loop:** Bác sĩ có thể xóa các tế bào bị AI nhận diện nhầm, vẽ thêm bounding box trực tiếp trên ảnh. Kết quả và cảnh báo sẽ lập tức được tính toán lại (Real-time).
- **📊 Quản Lý & Xuất Báo Cáo:** Lưu trữ lịch sử phân tích vào cơ sở dữ liệu. Xuất báo cáo y tế dạng PDF đầy đủ chi tiết với 1 cú click.
- **🛡️ Admin & Bảo Mật:** Xác thực người dùng bằng JWT. Admin panel cho phép điều chỉnh cấu hình hệ thống, ngưỡng cảnh báo, và quản lý các mô hình AI trực tiếp.
- **⚡ Triển Khai Dễ Dàng:** Tích hợp `One-click Launcher` để khởi động cả Frontend (Next.js) và Backend (FastAPI) chỉ bằng 1 cú đúp chuột.

---

## 🛠 Tech Stack

- **Backend:** Python 3.10+, FastAPI, SQLAlchemy, SQLite (có hỗ trợ MySQL).
- **Frontend:** Next.js 16 (App Router), React 19, TailwindCSS v4, Zustand.
- **AI / ML:** Ultralytics (YOLO), TensorFlow / Keras (ResNet, MobileNet), ONNX Runtime.

---

## 🚀 Hướng Dẫn Cài Đặt Nhanh

### 1. Yêu cầu hệ thống
- Python 3.10 trở lên
- Node.js 20 trở lên
- Git

### 2. Cài đặt Dependencies
Mở Terminal / PowerShell:
```powershell
# 1. Tạo môi trường ảo và cài Python packages
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt

# 2. Cài đặt Frontend packages
cd frontend-next
npm install
```

### 3. Khởi chạy Hệ thống (One-Click)
Đơn giản nhất, bạn chỉ cần click đúp vào file `start_app.bat` ở thư mục gốc. Hệ thống sẽ:
1. Kiểm tra môi trường.
2. Chạy Database Migrations tự động.
3. Khởi động Backend tại `http://127.0.0.1:8000`
4. Khởi động Frontend tại `http://localhost:3000`

Tài khoản mặc định: `admin` / mật khẩu: `admin123`

---

## 📂 Cấu Trúc Thư Mục

```text
HemaVision-AI/
├── backend/            # API, Services, DB Models (FastAPI)
├── frontend-next/      # UI Components, Pages, Stores (Next.js)
├── config/             # Cấu hình Model, Benchmarks, Class Names
├── database/           # Scripts tạo DB nếu dùng MySQL
├── models/             # Thư mục chứa file trọng số AI (Detectors & Classifiers)
├── docs/               # Tài liệu kỹ thuật chi tiết
├── requirements.txt    # Danh sách thư viện Python
└── start_app.bat       # Script khởi động tự động
```

> **⚠️ Lưu ý:** Các file mô hình AI (`.pt`, `.h5`, `.keras`, `.onnx`) do kích thước lớn nên cần tải riêng và đặt vào thư mục `models/` (Xem hướng dẫn tại `docs/MODELS.md`).

---

## 📄 Tài liệu chi tiết
Xem thêm các tài liệu thiết kế và kỹ thuật trong thư mục `docs/`:
- [Kiến trúc hệ thống](docs/ARCHITECTURE.md)
- [Tài liệu API](docs/API_REFERENCE.md)
- [Cấu hình AI Models](docs/MODELS.md)

---
*Phát triển bởi đội ngũ HemaVision AI - 2026*
