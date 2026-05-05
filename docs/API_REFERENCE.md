# Tài liệu HemaVision API Reference

Tất cả các API được host tại `http://localhost:8000`. Chi tiết Swagger UI và OpenAPI Schema có thể xem tương tác tại:
- **Swagger Docs:** `http://localhost:8000/docs`
- **ReDoc:** `http://localhost:8000/redoc`

## 1. System & Health
- `GET /` — Chào mừng và trạng thái API.
- `GET /health` — Kiểm tra sức khỏe hệ thống (Database, Disk, Memory).
- `GET /info` — Trả về thông tin hệ thống, class names, và benchmark các model.
- `GET /settings/clinical-flags` — Lấy cấu hình các quy tắc cảnh báo lâm sàng.

## 2. Authentication
- `POST /auth/login` — Gửi `{username, password}` để nhận JWT Access Token.
- `GET /auth/me` — Lấy thông tin người dùng đang đăng nhập (Yêu cầu Header `Authorization: Bearer <token>`).
- `POST /auth/change-password` — Đổi mật khẩu.
- `POST /auth/logout` — Thu hồi Token hiện tại.

## 3. Analysis & Prediction
- `POST /predict` — Chạy một mô hình phân loại trên một bức ảnh duy nhất (Nhận FormData: `file`, `model_id`). Trả về `{label, confidence, prediction_time}`.
- `POST /analyze` — Chạy luồng phân tích toàn diện (Detect → Crop → Classify) trên một bức ảnh lớn (Blood smear slide). 
- `POST /analyze-grid` — Hỗ trợ chia lưới ảnh lớn (nếu cần thiết).
- `POST /compare-models` — Nhận danh sách các `model_ids` và ảnh để chạy so sánh song song.

## 4. History Dashboard
- `GET /history` — Phân trang lấy danh sách lịch sử phân tích (Hỗ trợ filter, sắp xếp).
- `GET /history/{id}` — Xem chi tiết một bản ghi lịch sử cùng với các cells được detect.
- `DELETE /history/{id}` — (Admin) Xóa bản ghi lịch sử.

## 5. Admin Console (Yêu cầu Admin Token)
- `GET /admin/overview` — Tổng quan hệ thống (số lượng user, model, record).
- `GET /admin/models` — Quản lý metadata mô hình AI.
- `POST /admin/models/default` — Thiết lập mô hình AI mặc định.
- `GET /admin/labels` & `PUT /admin/labels` — Xem và cập nhật danh sách nhãn tế bào (Tên viết tắt → Tên đầy đủ).
- `GET /admin/clinical-flags` & `PUT /admin/clinical-flags` — Quản lý hệ thống cảnh báo y khoa.
