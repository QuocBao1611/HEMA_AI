export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

export const analysisDefaults = {
  // Thông số mặc định = tối ưu cho MobileNetV2 (model mặc định)
  confidence_threshold: 0.25,
  max_detections: 128,
  padding_ratio: 0.10,
  min_component_area: 120,
};

export type ResultTabKey = "counts" | "groups" | "wbc";
