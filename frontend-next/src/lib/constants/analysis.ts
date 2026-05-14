export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

export const analysisDefaults = {
  // Thông số mặc định chuẩn cho model detector mới
  confidence_threshold: 0.25,
  max_detections: 300,
  padding_ratio: 0.10,
  min_component_area: 100,
};

export type ResultTabKey = "counts" | "groups" | "wbc";
