# AI Models cho HemaVision

Do các file mô hình có kích thước lớn (hàng trăm MB), chúng tôi không đưa vào source code trực tiếp để tránh phình to Repository.

Để hệ thống hoạt động, bạn cần tải về các file mô hình tương ứng và đặt đúng vào cấu trúc thư mục sau:

## 1. Classifiers (models/classifiers/)
- `best_model_v2.keras` (~229MB)
- `mobilenetv2_phase2_best.h5` (~32MB)

## 2. Detectors (models/detectors/)
- `best9.onnx` (~40MB)
- `yolov8n-bccd.pt` (~6MB)

*(Lưu ý: Nếu bạn sử dụng bản đóng gói `-models.zip` đi kèm bản Release, chỉ cần giải nén đè thư mục này lên thư mục `models/` gốc là xong).*
