import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/constants/analysis";

export function validateImageFile(file: File | null | undefined) {
  if (!file) {
    return "Vui long chon anh truoc khi phan tich.";
  }

  if (!file.type.startsWith("image/")) {
    return "Chi ho tro file anh JPG, PNG, JPEG hoac dinh dang image hop le.";
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return "Tep vuot qua gioi han 10MB.";
  }

  return null;
}
