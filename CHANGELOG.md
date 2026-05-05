# Changelog

Tất cả các thay đổi nổi bật của dự án HemaVision AI sẽ được ghi chú tại đây.

## [1.0.0] - 2026-05-05

Đây là phiên bản phát hành chính thức đầu tiên (Production-ready) của HemaVision AI. Hệ thống đã hoàn thiện toàn bộ các luồng chức năng phân tích máu và quản trị hệ thống.

### ✨ Tính năng mới (Features)
- **Pipeline AI Hoàn Chỉnh:** Quy trình phân tích 3 bước tự động: Phát hiện tế bào (YOLO) → Cắt ảnh (Crop) → Phân loại tế bào (CNN).
- **Hỗ trợ Đa Mô hình (Multi-Model):** Tích hợp 3 mô hình phân loại chính: MobileNetV2, ResNet50 (Best Model V2) và Best9 YOLO.
- **So sánh Mô hình (Compare Workspace):**
  - Cho phép chọn tối đa 3 mô hình để chạy phân tích đồng thời trên cùng một bức ảnh.
  - Trình bày kết quả trực quan qua Radar Chart và Bar Chart.
  - Tự động phân tích và đưa ra tư vấn chọn mô hình tốt nhất dựa trên Benchmark và Confidence.
- **Human-in-the-Loop (Hệ thống tương tác người dùng):**
  - Giao diện xem lại chi tiết từng tế bào (Cell Review Gallery).
  - Cho phép người dùng xóa các tế bào bị AI nhận diện sai.
  - Kết quả đếm (Cell Counts) và Cảnh báo lâm sàng (Clinical Flags) tự động cập nhật ngay lập tức sau mỗi chỉnh sửa.
- **Cảnh báo Lâm sàng (Clinical Flags):** Tự động phát hiện các chỉ số bất thường dựa trên quy tắc (rules) có thể cấu hình được. Chia làm 3 mức: Thông tin (Xanh), Cảnh báo (Vàng), Nguy hiểm (Đỏ).
- **Xuất báo cáo PDF:** Tự động tạo và tải xuống báo cáo kết quả y tế định dạng PDF chuyên nghiệp.
- **Dashboard & Lịch sử:**
  - Bảng thống kê tình trạng sức khỏe tổng quan của hệ thống.
  - Lịch sử phân tích lưu trữ chi tiết, hỗ trợ bộ lọc và xem lại.
- **Xác thực & Phân quyền:**
  - Hệ thống đăng nhập bảo mật bằng JWT.
  - Giao diện Admin cho phép quản lý Danh sách Model, Tên Lớp tế bào (Labels), và Các quy tắc cảnh báo.
- **Giao diện người dùng (UI/UX):**
  - Chế độ Dark Mode / Light Mode hoàn chỉnh.
  - Hoạt ảnh phản hồi mượt mà (Framer Motion / CSS Animations).
  - Thanh Tiến trình phân tích thời gian thực (Progress Bar).

### 🛠 Kỹ thuật & Tối ưu (Technical & Optimization)
- Refactor hoàn toàn sang kiến trúc Frontend tách rời: FastAPI (Backend) và Next.js 16 (Frontend).
- Ứng dụng Tailwind CSS v4 cho toàn bộ UI.
- Viết Test coverage cho Backend (Pytest).
- Script khởi động tự động một chạm (`start_app.bat`).
- Loại bỏ hoàn toàn mã thừa, chuẩn hóa kiến trúc thư mục.
