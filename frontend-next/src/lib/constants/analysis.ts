export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

export const analysisDefaults = {
  confidence_threshold: 0.5,
  max_detections: 256,
  padding_ratio: 0.1,
  min_component_area: 80,
};

export type ResultTabKey = "counts" | "groups" | "wbc";
