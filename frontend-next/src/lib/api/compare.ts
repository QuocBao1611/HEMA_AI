import { compareModelsResponseSchema } from "@/schemas/api";
import { apiPostForm } from "@/lib/api/client";
import type { CompareModelsResponse } from "@/types/api";

export type CompareFormPayload = {
  file: File;
  model_ids: string[];
  confidence_threshold: number;
  padding_ratio: number;
  min_component_area: number;
  max_detections: number;
};

export function compareModels(payload: CompareFormPayload) {
  const formData = new FormData();
  formData.set("file", payload.file);
  formData.set("model_ids_json", JSON.stringify(payload.model_ids));
  formData.set("confidence_threshold", String(payload.confidence_threshold));
  formData.set("padding_ratio", String(payload.padding_ratio));
  formData.set("min_component_area", String(payload.min_component_area));
  formData.set("max_detections", String(payload.max_detections));

  return apiPostForm<CompareModelsResponse>(
    "/compare-models",
    formData,
    compareModelsResponseSchema,
  );
}
