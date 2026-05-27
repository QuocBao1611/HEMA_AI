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
): Promise<XAIResult> {
  const formData = new FormData();
  formData.set("file", imageBlob, "cell.jpg");
  
  if (classIdx !== undefined) {
    formData.set("class_idx", String(classIdx));
  }
  
  return apiPostForm<XAIResult>("/xai/gradcam", formData);
}
