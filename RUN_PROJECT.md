# Chạy dự án HemaVision AI

## ▶️ Cách chạy nhanh nhất (Khuyến nghị)

Double-click vào file:

```
start_app.bat
```

Script tự động làm tất cả:
1. Kiểm tra `.venv` — tạo nếu chưa có
2. Cài Python dependencies (`requirements.txt`) nếu thiếu
3. Cài Node.js dependencies (`npm install`) nếu thiếu
4. Chạy Alembic database migrations
5. Giải phóng port 8000 và 3000 nếu đang bị chiếm
6. Khởi động **Backend** trong cửa sổ riêng (xanh)
7. Khởi động **Frontend** trong cửa sổ riêng (vàng)
8. Tự mở trình duyệt tại `http://localhost:3000`

---

## 🔗 Địa chỉ truy cập

| Dịch vụ | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://127.0.0.1:8000 |
| API Docs (Swagger) | http://127.0.0.1:8000/docs |

**Tài khoản mặc định:** `admin` / `admin123`

---

## 🛠️ Chạy từng phần (nếu cần debug riêng)

**Backend:**
```bat
start_server.bat
```

**Frontend:**
```bat
start_frontend.bat
```

---

## 📦 Chuẩn bị thủ công (lần đầu tiên)

Nếu `start_app.bat` báo lỗi, chuẩn bị thủ công:

```powershell
# 1. Tạo virtual environment
python -m venv .venv

# 2. Cài Python packages
.venv\Scripts\python -m pip install -r requirements.txt

# 3. Cài Node packages
cd frontend-next
npm install
cd ..

# 4. Chạy database migrations
.venv\Scripts\alembic upgrade head
```

---

## ✅ Kiểm tra hệ thống

```powershell
# Backend tests (phải pass >= 27 tests)
.venv\Scripts\python -m pytest -q

# Frontend lint + typecheck
cd frontend-next
npm.cmd run lint
npm.cmd run typecheck
```

---

## 🗄️ Database

Mặc định dùng **SQLite** — không cần cài MySQL hay XAMPP.

Database file: `data/hemavision.sqlite3` (tự tạo khi khởi động lần đầu)

Nếu muốn dùng MySQL:
```env
# Thay dòng này trong .env
DATABASE_URL=mysql+pymysql://root:@127.0.0.1:3306/hemavision?charset=utf8mb4
```
