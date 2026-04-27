import { analyzeResponseSchema, predictResponseSchema } from "@/schemas/api";
import { apiPostForm } from "@/lib/api/client";
import type { AnalyzeResponse, PredictResponse } from "@/types/api";

export type AnalysisFormPayload = {
  file: File;
  model_id?: string;
  confidence_threshold: number;
  max_detections: number;
  padding_ratio: number;
  min_component_area: number;
};

function buildAnalysisFormData(payload: AnalysisFormPayload) {
  const formData = new FormData();
  formData.set("file", payload.file);
  if (payload.model_id) {
    formData.set("model_id", payload.model_id);
  }
  formData.set("confidence_threshold", String(payload.confidence_threshold));
  formData.set("max_detections", String(payload.max_detections));
  formData.set("padding_ratio", String(payload.padding_ratio));
  formData.set("min_component_area", String(payload.min_component_area));
  return formData;
}

export function predictImage(payload: AnalysisFormPayload) {
  const formData = buildAnalysisFormData(payload);
  return apiPostForm<PredictResponse>("/predict", formData, predictResponseSchema);
}

export function analyzeImage(payload: AnalysisFormPayload) {
  const formData = buildAnalysisFormData(payload);
  return apiPostForm<AnalyzeResponse>("/analyze", formData, analyzeResponseSchema);
}
