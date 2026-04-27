# HemaVision AI

HemaVision AI la web app phan tich blood smear voi pipeline `detect -> crop -> classify`.

He thong hien tai gom:

- `FastAPI` backend cho inference, auth, history, admin va system APIs
- `Next.js` frontend tai `frontend-next/`
- `SQLite` mac dinh cho dev/local, van ho tro `MySQL` khi can production/XAMPP
- bo test backend bang `pytest`

## Kien truc chinh

```text
testModel/
├── backend/                          # Backend FastAPI (chỉ phục vụ API)
│   └── app/
│       ├── api/
│       │   └── routes/
│       │       ├── admin.py          # Quản trị: model, labels, flags
│       │       ├── analysis.py       # Phân tích: predict, analyze, diagnose, compare
│       │       ├── auth.py           # Xác thực: đăng nhập JWT, lấy thông tin user
│       │       └── system.py         # Hệ thống: health, info, labels, lịch sử, cài đặt
│       ├── core/
│       │   ├── auth_utils.py         # Hàm hỗ trợ xử lý token
│       │   ├── config.py             # Cấu hình hệ thống (đọc từ .env)
│       │   ├── logging.py            # Ghi log có cấu trúc
│       │   ├── paths.py              # Quản lý đường dẫn model/config
│       │   ├── rate_limit.py         # Giới hạn tần suất gọi API
│       │   └── security.py           # Mã hoá mật khẩu, tạo/giải mã JWT
│       ├── db/
│       │   ├── base.py               # Lớp cơ sở ORM (SQLAlchemy)
│       │   ├── models.py             # Bảng ORM: User, ModelCatalog, AnalysisRecord...
│       │   └── session.py            # Khởi tạo engine & phiên kết nối DB
│       ├── models/                   # Xuất lại các Pydantic model (nếu cần)
│       ├── schemas/
│       │   └── labels.py             # Schema request/response cho labels
│       ├── services/
│       │   ├── analysis_service.py   # Luồng xử lý: phát hiện → cắt → phân loại
│       │   ├── classifier_service.py # Nạp model, dự đoán, so sánh
│       │   └── persistence_service.py# Đọc/ghi lịch sử & cài đặt quản trị
│       └── main.py                   # Điểm khởi chạy Uvicorn, gắn router
│
├── frontend-next/                    # Giao diện Next.js 15
│   ├── public/                       # Tài nguyên tĩnh (favicon, hình ảnh)
│   └── src/
│       ├── app/                      # Bộ định tuyến (App Router)
│       │   ├── layout.tsx            # Bố cục gốc (<html>, providers)
│       │   ├── globals.css           # Biến CSS & kiểu nền tảng
│       │   ├── login/                # Trang đăng nhập (/login)
│       │   ├── admin/                # Trang quản trị (/admin)
│       │   └── (workspace)/          # Nhóm bố cục (sidebar + header)
│       │       ├── layout.tsx        # Khung workspace chung
│       │       ├── page.tsx          # / → Trang phân tích chính
│       │       ├── compare/          # Trang so sánh model (/compare)
│       │       ├── dashboard/        # Trang lịch sử & thống kê (/dashboard)
│       │       └── guide/            # Trang hướng dẫn sử dụng (/guide)
│       ├── components/
│       │   ├── admin/                # Giao diện quản trị hệ thống
│       │   ├── analysis/             # Giao diện phân tích, bảng kết quả, cờ lâm sàng
│       │   ├── compare/              # Giao diện so sánh model
│       │   ├── dashboard/            # Giao diện lịch sử & biểu đồ
│       │   ├── guide/                # Giao diện hướng dẫn
│       │   ├── layout/               # Sidebar, Header, Navbar tự ẩn/hiện
│       │   └── ui/                   # Thành phần giao diện cơ bản (Button, Card)
│       ├── hooks/                    # Hook tuỳ chỉnh (thông tin hệ thống, dữ liệu dashboard)
│       ├── lib/
│       │   ├── api/                  # Module gọi API (client, phân tích, xác thực...)
│       │   ├── constants/            # Hằng số điều hướng (navigation.ts)
│       │   ├── reports/              # Xuất báo cáo PDF
│       │   ├── utils/                # Hàm tiện ích (className, định dạng số)
│       │   └── validators/           # Kiểm tra file upload
│       ├── providers/                # Nhà cung cấp React (Auth, Query, App)
│       ├── schemas/                  # Schema xác thực dữ liệu (Zod)
│       ├── stores/                   # Quản lý trạng thái (Zustand auth-store)
│       └── types/                    # Định nghĩa kiểu TypeScript
│
├── config/
│   ├── class_names.json              # Tên lớp tế bào mặc định
│   └── model_manifest.json           # Danh sách model & siêu dữ liệu
│
├── database/
│   └── init_mysql.sql                # Script khởi tạo cấu trúc bảng
│
├── models/                           # Thư mục chứa file model (.pt / .onnx)
├── samples/                          # Ảnh smear mẫu để kiểm thử
├── data/                             # Dữ liệu runtime (crops, cache)
├── logs/                             # File nhật ký hệ thống
├── notebooks/                        # Jupyter notebooks (thử nghiệm)
├── scripts/
│   └── start_server.bat              # Script khởi động backend
├── tests/
│   ├── conftest.py                   # Cấu hình fixture & test client
│   └── test_phase3_security.py       # Kiểm thử: xác thực, quản trị, giới hạn, CORS
│
├── .env / .env.example               # Biến môi trường backend
├── app.py                            # Điểm khởi chạy tắt
├── requirements.txt                  # Danh sách thư viện Python
├── start_server.bat                  # Lệnh khởi động nhanh
├── NEXTJS_UPGRADE_PLAN.md            # Kế hoạch chuyển đổi chi tiết
├── NEXTJS_PHASE2_BACKLOG.md          # Danh sách công việc Phase 2
├── CODEX_HANDOFF.md                  # Tài liệu bàn giao dự án
└── README.md                         # ← File này
```

## Yeu cau

- Python virtual environment tai `.venv`
- SQLite mac dinh, khong can MySQL/XAMPP de chay local
- Node.js de chay `frontend-next`

## Cai dat

```powershell
.venv\Scripts\python -m pip install -r requirements.txt
cd frontend-next
npm install
```

## Cau hinh moi truong

Tao `.env` tu `.env.example` neu can:

```env
APP_NAME=TestModel Web System
CORS_ALLOW_ORIGINS=http://127.0.0.1,http://localhost,http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:8000,http://localhost:8000,http://127.0.0.1:5500,http://localhost:5500
DATABASE_URL=sqlite:///./data/hemavision.sqlite3
DATABASE_ECHO=false
DATABASE_AUTO_CREATE=true
HISTORY_PAGE_SIZE=20
INFERENCE_RATE_LIMIT=10/minute
SECRET_KEY=hema_vision_super_secret_key_change_in_prod
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

Frontend env:

File `frontend-next/.env.local`

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

## Khoi tao database

Mac dinh khong can chay lenh rieng. Backend se tu tao SQLite database tai `data/hemavision.sqlite3`.

Neu muon dung MySQL, doi `DATABASE_URL` ve `mysql+pymysql://...` va chay:

```powershell
mysql -u root < database/init_mysql.sql
```

## Chay ung dung

### 0. Chay nhanh ca Backend va Frontend

```bat
start_app.bat
```

### 1. Chay Backend

Nhanh nhat:

```bat
start_server.bat
```

Lenh nay goi sang `scripts/start_server.bat`, ben trong chay:

```powershell
.venv\Scripts\python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Chay Frontend

Mo terminal moi:

```powershell
cd frontend-next
npm run dev
```

Frontend dev mac dinh o `http://127.0.0.1:3000`.

## Tinh nang hien tai

### Cap nhat moi nhat

- Da them `Best9 YOLO` vao danh sach `Model AI` chung voi MobileNet/ResNet.
- `Best9 YOLO` dung file `models/classifiers/best (9).pt` va duoc dang ky trong `config/model_manifest.json` voi `model_id: best9`.
- `Best9 YOLO` la model phan loai te bao kien truc YOLO, khong phai detector dung de dong bounding box.
- Detector mac dinh cua pipeline van la `models/detectors/yolov8n-bccd.pt`.
- UI trang phan tich da duoc chinh nhe: banner bac si, icon do/trang, preview anh gon hon, detection overlay khong phong qua lon, va cac text ket qua/chuan doan co tieng Viet co dau hon.
- Luu y: `Best9 YOLO` hien load lazy khi chon model. Neu checkpoint bao thieu custom layer nhu `DSC3k2`, can bo sung custom module tu code train hoac export lai model tu moi truong Ultralytics tuong thich.

### Workspace

- Upload anh smear
- `predict` nhanh
- `analyze` slide day du
- Clinical flags theo rule co cau hinh
- PDF export ngay tu ket qua

### Compare

- So sanh nhieu model tren cung mot anh
- Shared detection summary
- Comparison rows va highlight model tot nhat

### Dashboard

- Health snapshot
- History feed
- Filter theo model, mode, khoang ngay
- Deep-link theo `?record=<id>`
- History detail va PDF export

### Auth va Admin

- JWT login
- Session persistence o frontend
- Route protection
- Admin console cho:
  - doi default model
  - cap nhat labels theo model
  - cap nhat clinical flag rules

Tai khoan mac dinh:

- `admin / admin123`

## API chinh

### System

- `GET /`
- `GET /health`
- `GET /info`
- `GET /labels`
- `POST /labels`
- `GET /settings/clinical-flags`
- `GET /history`
- `GET /history/{id}`

### Analysis

- `POST /predict`
- `POST /analyze`
- `POST /diagnose`
- `POST /analyze-grid`
- `POST /compare-models`

### Auth

- `POST /auth/login`
- `GET /auth/me`

### Admin

- `GET /admin/overview`
- `GET /admin/models`
- `POST /admin/models/default`
- `GET /admin/labels`
- `PUT /admin/labels`
- `GET /admin/clinical-flags`
- `PUT /admin/clinical-flags`

## Testing

Chay toan bo test backend:

```powershell
.venv\Scripts\python -m pytest -q
```

Trang thai hien tai:

- `16` tests dang pass
- da cover predict, rate limit, CORS, auth, admin, history detail va system info
- Kiem tra gan nhat: `pytest -q` pass `16`, `frontend-next` `typecheck` pass, `lint` pass voi 2 warning layout cu.

Kiem tra frontend:

```powershell
cd frontend-next
npm run lint
npm run typecheck
npm run build
```

## Trang thai du an

- `Phase 1-4`: da dua app sang kien truc `Next.js + FastAPI`
- `Phase 2`: da hoan thien auth, admin, reporting, dashboard filters va history detail
- Backend hien dong vai tro API-only
- Frontend chinh nam o `frontend-next/`

## Luu y pham vi

Khong nen thay doi neu chua co yeu cau rieng:

- AI pipeline `detect -> crop -> classify`
- DB schema nghiep vu hien tai
- logic `estimated_counts`, `grouped_counts`, `wbc_differential`
- visual direction do-den cua Hema AI
