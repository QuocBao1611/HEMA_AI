import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/constants/analysis";

export function validateImageFile(file: File | null | undefined) {
  if (!file) {
    return "Vui lòng chọn ảnh trước khi phân tích.";
  }

  if (!file.type.startsWith("image/")) {
    return "Chỉ hỗ trợ file ảnh JPG, PNG, JPEG hoặc định dạng ảnh hợp lệ.";
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return "Tệp vượt quá giới hạn 10MB.";
  }

  return null;
}
