import { apiPostForm } from "@/lib/api/client";

/**
 * Kết quả trả về từ API XAI (EigenCAM)
 */
export type XAIResult = {
  success: boolean;
  top_class: string;
  confidence: number;
  calibrated_probs: Record<string, number>;
  /** Heatmap dạng ảnh base64 (chỉ vùng màu) */
  heatmap_b64: string;
  /** Ảnh overlay sẵn giữa heatmap và ảnh gốc */
  overlay_b64: string;
  /** Thông báo lỗi nếu có */
  error?: string;
};

/**
 * Gọi API backend để lấy thông tin giải thích (heatmap) cho một tế bào.
 * 
 * @param imageBlob Blob của ảnh tế bào (thường được crop từ canvas)
 * @param classIdx Index lớp muốn giải thích (mặc định AI tự chọn lớp cao nhất)
 * @returns Kết quả heatmap và xác suất
 */
export async function fetchGradCAM(
  imageBlob: Blob,
  classIdx?: number,
  modelId?: string,
  boxW?: number,
  boxH?: number,
  x1?: number,
  y1?: number,
  x2?: number,
  y2?: number,
  imageWidth?: number,
  imageHeight?: number,
  classLabel?: string,
): Promise<XAIResult> {
  const formData = new FormData();
  formData.set("file", imageBlob, "cell.jpg");
  
  if (classIdx !== undefined) {
    formData.set("class_idx", String(classIdx));
  }
  if (classLabel) {
    formData.set("class_label", classLabel);
  }
  if (modelId) {
    formData.set("model_id", modelId);
  }
  if (boxW !== undefined) {
    formData.set("box_w", String(boxW));
  }
  if (boxH !== undefined) {
    formData.set("box_h", String(boxH));
  }
  if (x1 !== undefined) {
    formData.set("x1", String(x1));
  }
  if (y1 !== undefined) {
    formData.set("y1", String(y1));
  }
  if (x2 !== undefined) {
    formData.set("x2", String(x2));
  }
  if (y2 !== undefined) {
    formData.set("y2", String(y2));
  }
  if (imageWidth !== undefined) {
    formData.set("image_width", String(imageWidth));
  }
  if (imageHeight !== undefined) {
    formData.set("image_height", String(imageHeight));
  }
  
  return apiPostForm<XAIResult>("/xai/gradcam", formData);
}
