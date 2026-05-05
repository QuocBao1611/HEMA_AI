# CODEX_HANDOFF.md

## 1. Tổng quan dự án

`HemaVision AI` là web app phân tích ảnh blood smear dùng pipeline `detect -> crop -> classify`.

- Backend: `FastAPI`, TensorFlow/Keras, YOLO, SQLAlchemy
- Frontend: static HTML/CSS/JS phục vụ trực tiếp từ backend
- Persistence: MySQL cho catalog model, label config, history phân tích
- Testing: `pytest` cho backend

## 2. Kiến trúc & File map

Root:

- `C:\xampp\htdocs\testModel\app.py`
- `C:\xampp\htdocs\testModel\README.md`
- `C:\xampp\htdocs\testModel\CODEX_HANDOFF.md`
- `C:\xampp\htdocs\testModel\requirements.txt`
- `C:\xampp\htdocs\testModel\.env.example`
- `C:\xampp\htdocs\testModel\start_server.bat`
- `C:\xampp\htdocs\testModel\scripts\start_server.bat`

Backend:

- `C:\xampp\htdocs\testModel\backend\app\main.py`
- `C:\xampp\htdocs\testModel\backend\app\api\routes\analysis.py`
- `C:\xampp\htdocs\testModel\backend\app\api\routes\system.py`
- `C:\xampp\htdocs\testModel\backend\app\api\routes\pages.py`
- `C:\xampp\htdocs\testModel\backend\app\core\config.py`
- `C:\xampp\htdocs\testModel\backend\app\core\logging.py`
- `C:\xampp\htdocs\testModel\backend\app\core\paths.py`
- `C:\xampp\htdocs\testModel\backend\app\core\security.py`
- `C:\xampp\htdocs\testModel\backend\app\core\rate_limit.py`
- `C:\xampp\htdocs\testModel\backend\app\db\base.py`
- `C:\xampp\htdocs\testModel\backend\app\db\models.py`
- `C:\xampp\htdocs\testModel\backend\app\db\session.py`
- `C:\xampp\htdocs\testModel\backend\app\services\classifier_service.py`
- `C:\xampp\htdocs\testModel\backend\app\services\analysis_service.py`
- `C:\xampp\htdocs\testModel\backend\app\services\persistence_service.py`

Frontend:

- `C:\xampp\htdocs\testModel\frontend\index.html`
- `C:\xampp\htdocs\testModel\frontend\compare.html`
- `C:\xampp\htdocs\testModel\frontend\dashboard.html`
- `C:\xampp\htdocs\testModel\frontend\guide.html`
- `C:\xampp\htdocs\testModel\frontend\assets\js\api-client.js`
- `C:\xampp\htdocs\testModel\frontend\assets\js\home-page.js`
- `C:\xampp\htdocs\testModel\frontend\assets\js\compare-page.js`
- `C:\xampp\htdocs\testModel\frontend\assets\js\dashboard-page.js`
- `C:\xampp\htdocs\testModel\frontend\assets\js\guide-page.js`
- `C:\xampp\htdocs\testModel\frontend\assets\js\shared-layout.js`
- `C:\xampp\htdocs\testModel\frontend\assets\js\floating-menu.js`
- `C:\xampp\htdocs\testModel\frontend\assets\css\tokens.css`
- `C:\xampp\htdocs\testModel\frontend\assets\css\home.css`
- `C:\xampp\htdocs\testModel\frontend\assets\css\compare.css`
- `C:\xampp\htdocs\testModel\frontend\assets\css\dashboard.css`
- `C:\xampp\htdocs\testModel\frontend\assets\css\guide.css`

Config / DB / models:

- `C:\xampp\htdocs\testModel\config\class_names.json`
- `C:\xampp\htdocs\testModel\config\model_manifest.json`
- `C:\xampp\htdocs\testModel\database\init_mysql.sql`
- `C:\xampp\htdocs\testModel\models\detectors\yolov8n-bccd.pt`
- `C:\xampp\htdocs\testModel\models\classifiers\mobilenetv2_final_finetuned.h5`
- `C:\xampp\htdocs\testModel\models\classifiers\mobilenetv2_phase2_best.h5`
- `C:\xampp\htdocs\testModel\models\classifiers\best_model_v2.keras`

Tests:

- `C:\xampp\htdocs\testModel\tests\conftest.py`
- `C:\xampp\htdocs\testModel\tests\test_phase3_security.py`

## 3. Cách chạy project

Python dependencies:

```powershell
.venv\Scripts\python -m pip install -r requirements.txt
```

Database:

```powershell
mysql -u root < database/init_mysql.sql
```

Run app:

```powershell
.venv\Scripts\python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

Hoặc:

```bat
start_server.bat
```

## 4. Trạng thái hiện tại

- `Phase 1` đã hoàn thành
- `Phase 2` đã hoàn thành
- `Phase 3` đã hoàn thành

Những gì Phase 3 hiện đã có thật trong repo:

- magic-bytes validation bằng Pillow verify
- rate limiting `10/minute` với `slowapi`
- unit/integration tests với `pytest + httpx + fixtures`
- error messages tiếng Việt ở các path quan trọng
- CORS lockdown qua `.env.example` và config
- logging/persistence error handling an toàn hơn

## 5. 6 task cụ thể của Phase 3

### 3.1 Magic bytes validation

Đã hoàn thành.

- Helper: `backend/app/core/security.py`
- Route upload dùng chung: `validate_image_upload(...)`

### 3.2 Rate limiting với slowapi (10 req/min)

Đã hoàn thành.

- Config: `backend/app/core/rate_limit.py`
- Gắn vào app: `backend/app/main.py`
- Áp trên routes inference: `backend/app/api/routes/analysis.py`

### 3.3 Unit tests đầy đủ (pytest + httpx + fixtures)

Đã hoàn thành ở mức Phase 3.

- `tests/conftest.py`
- `tests/test_phase3_security.py`
- Hiện có `8` tests pass

### 3.4 Sửa tiếng Việt thiếu dấu trong error messages

Đã hoàn thành cho các thông báo backend/user-facing quan trọng trong scope Phase 3.

### 3.5 CORS lockdown + .env.example update

Đã hoàn thành.

- `.env.example` không còn wildcard
- `config.py` parse origin cụ thể

### 3.6 Logging audit loại bỏ thông tin nhạy cảm

Đã hoàn thành ở mức thực dụng cho phase này.

- sanitize filename trước khi log
- không log raw upload payload
- không trả raw DB error string ra ngoài như trước

## 6. Thứ tự ưu tiên tiếp theo

Sau Phase 3, các việc nên làm tiếp:

1. Thêm CI chạy `pytest`
2. Tăng coverage test cho `history`, `labels` và các edge case upload
3. Dọn các text/frontend copy còn chưa đồng nhất hoàn toàn
4. Bổ sung smoke test thủ công có checklist rõ ràng cho các luồng chính

## 7. Pattern & convention

Logger:

- dùng `get_logger(...)`
- chỉ log method/path/status/duration hoặc metadata an toàn

Config:

- thêm biến môi trường ở `backend/app/core/config.py`

Validation:

- upload validation tập trung ở `backend/app/core/security.py`

HTTP errors:

- ưu tiên `HTTPException(..., detail="...")`
- message ngắn, rõ

Paths:

- dùng constants trong `backend/app/core/paths.py`

Tests:

- backend: `pytest`

## 8. Danh sách KHÔNG được thay đổi

- AI pipeline `detect -> crop -> classify`
- logic `estimated_counts`, `grouped_counts`, `wbc_differential`
- DB schema:
  - `model_catalog`
  - `label_configurations`
  - `analysis_records`
- visual direction chính của frontend nếu không có yêu cầu redesign

## 9. Definition of Done

Phase 3 hiện đã đạt DoD:

- [x] Upload ảnh được validate cả content type, size, magic bytes
- [x] Route inference có rate limiting `10 req/min`
- [x] Có thư mục `tests/` và test chạy được bằng `pytest`
- [x] Có test cho các validation/security path chính
- [x] Có test cho `/analyze-grid`
- [x] Error messages backend quan trọng đã được chuẩn hóa
- [x] `.env.example` không còn wildcard CORS mặc định
- [x] Logging/persistence handling giảm rò rỉ thông tin nhạy cảm
- [x] Không làm thay đổi AI pipeline hiện có
- [x] Không thay đổi DB schema hiện có
- [x] Không phá vỡ frontend hiện tại
