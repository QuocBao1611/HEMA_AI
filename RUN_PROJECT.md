# Chạy dự án HemaVision AI

Tài liệu này là đường chạy gọn cho máy dev Windows. Mặc định dự án dùng SQLite nên không cần mở XAMPP/MySQL.

## 1. Chuẩn bị một lần

Backend:

```powershell
.venv\Scripts\python -m pip install -r requirements.txt
```

Frontend:

```powershell
cd frontend-next
npm install
cd ..
```

File `.env` mặc định:

```env
DATABASE_URL=sqlite:///./data/hemavision.sqlite3
DATABASE_AUTO_CREATE=true
```

Khi backend khởi động, file database sẽ tự được tạo ở:

```text
data/hemavision.sqlite3
```

## 2. Chạy nhanh toàn bộ app

Từ thư mục gốc dự án:

```bat
start_app.bat
```

Script này mở 2 cửa sổ:

- Backend: http://127.0.0.1:8000
- Frontend: http://127.0.0.1:3000

Tài khoản mặc định:

```text
admin / admin123
```

## 3. Chạy từng phần

Backend:

```bat
start_server.bat
```

Frontend:

```bat
start_frontend.bat
```

Nếu PowerShell chặn `npm`, dùng trực tiếp:

```powershell
cd frontend-next
npm.cmd run dev
```

## 4. Kiểm tra nhanh

Backend tests:

```powershell
.venv\Scripts\python -m pytest -q
```

Frontend:

```powershell
cd frontend-next
npm.cmd run lint
npm.cmd run typecheck
```

## 5. Nếu muốn dùng MySQL lại

Đổi dòng này trong `.env`:

```env
DATABASE_URL=mysql+pymysql://root:@127.0.0.1:3306/testmodel_web?charset=utf8mb4
```

Sau đó khởi tạo database:

```powershell
mysql -u root < database/init_mysql.sql
```

SQLite phù hợp để chạy nhanh khi dev/demo. MySQL vẫn phù hợp hơn nếu cần nhiều máy cùng truy cập hoặc triển khai production lâu dài.
