# Cấu hình AI Models của HemaVision

Hệ thống hoạt động với 2 loại mô hình: **Detectors** (tìm kiếm và bao khoanh vùng tế bào) và **Classifiers** (phân loại tế bào thu được).

## 1. Cấu trúc thư mục

Tất cả mô hình phải được đặt trong:
```text
models/
├── detectors/
│   ├── best9.onnx
│   └── yolov8n-bccd.pt
└── classifiers/
    ├── best_model_v2.keras
    └── mobilenetv2_phase2_best.h5
```

## 2. Mô tả các Models

### 2.1. YoloV8 Nano (yolov8n-bccd.pt)
- **Loại:** Detector.
- **Nhiệm vụ:** Phát hiện nhanh các tế bào máu.
- **Tốc độ:** Rất nhanh (phù hợp chạy CPU cục bộ).

### 2.2. ResNet50 (best_model_v2.keras)
- **Loại:** Classifier.
- **Nhiệm vụ:** Phân loại 8 nhóm tế bào máu khác nhau.
- **Đặc điểm:** Độ chính xác tổng thể (Accuracy) 85%. Độ tự tin trên tập thực tế cao. Dung lượng lớn (~229MB).

### 2.3. MobileNetV2 (mobilenetv2_phase2_best.h5)
- **Loại:** Classifier.
- **Nhiệm vụ:** Phân loại tế bào.
- **Đặc điểm:** Tốc độ suy luận (Inference Speed) cực cao. Benchmark lý thuyết trên tập test đạt Accuracy 93%. Dung lượng tối ưu (~32MB).

### 2.4. Blood Cell Model V4 (blood_cell_model_v4.onnx)
- **Loại:** Classifier.
- **Nhiệm vụ:** Phân loại 14 nhóm tế bào máu. Phiên bản V4 cải tiến với kiến trúc tốt hơn, generalization mạnh hơn và độ chính xác cao nhất.
- **Đặc điểm:** Input 224x224 RGB, preprocessing MobileNetV2 (x/127.5 - 1.0), 14 classes output. Độ chính xác ~98.8%. Đây là model mặc định mới nhất của hệ thống.

### 2.5. MobileNetV2 Blood Cell V2 (mobilenetv2_blood_cell_v2.onnx)
- **Loại:** Classifier.
- **Nhiệm vụ:** Phân loại 14 nhóm tế bào máu. Phiên bản V2 cải tiến với kiến trúc tốt hơn, generalization mạnh hơn.
- **Đặc điểm:** Input 224x224 RGB, preprocessing MobileNetV2 (x/127.5 - 1.0), 14 classes output. Độ chính xác ~98.6%.

### 2.6. Best9 YOLO (best9.onnx / best (9).pt)

- **Loại:** Classifier (sử dụng kiến trúc YOLO nhưng phục vụ bài toán Phân loại).
- **Nhiệm vụ:** Chuyên gia trong việc nhận diện các mẫu tế bào mờ hoặc đặc thù. Độ chính xác lý thuyết đạt 90%.

---

## 3. Cấu hình Manifest
File `config/model_manifest.json` và `config/model_benchmarks.json` điều khiển cách hệ thống nhận dạng các file mô hình này. Nếu bạn thêm một mô hình mới, bạn cần cập nhật cả file cứng và thư mục `models/` tương ứng.
