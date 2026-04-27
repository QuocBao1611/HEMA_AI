import {
  adminModelsResponseSchema,
  adminOverviewResponseSchema,
  clinicalFlagSettingsSchema,
  defaultModelUpdateResponseSchema,
  labelInfoSchema,
  labelsUpdateResponseSchema,
} from "@/schemas/api";
import { apiGet, apiPostJson, apiPutJson } from "@/lib/api/client";
import type {
  AdminModelsResponse,
  AdminOverviewResponse,
  ClinicalFlagRule,
  ClinicalFlagSettingsResponse,
  DefaultModelUpdateResponse,
  LabelInfoResponse,
  LabelsUpdateResponse,
} from "@/types/api";

export function getAdminOverview() {
  return apiGet<AdminOverviewResponse>("/admin/overview", adminOverviewResponseSchema);
}

export function getAdminModels() {
  return apiGet<AdminModelsResponse>("/admin/models", adminModelsResponseSchema);
}

export function updateDefaultModel(modelId: string) {
  return apiPostJson<DefaultModelUpdateResponse>(
    "/admin/models/default",
    { model_id: modelId },
    defaultModelUpdateResponseSchema,
  );
}

export function getAdminLabels(modelId: string) {
  return apiGet<LabelInfoResponse>(
    `/admin/labels?model_id=${encodeURIComponent(modelId)}`,
    labelInfoSchema,
  );
}

export function updateAdminLabels(modelId: string, classNames: string[]) {
  return apiPutJson<LabelsUpdateResponse>(
    `/admin/labels?model_id=${encodeURIComponent(modelId)}`,
    { class_names: classNames },
    labelsUpdateResponseSchema,
  );
}

export function getAdminClinicalFlags() {
  return apiGet<ClinicalFlagSettingsResponse>(
    "/admin/clinical-flags",
    clinicalFlagSettingsSchema,
  );
}

export function updateAdminClinicalFlags(rules: ClinicalFlagRule[]) {
  return apiPutJson<ClinicalFlagSettingsResponse>(
    "/admin/clinical-flags",
    { rules },
    clinicalFlagSettingsSchema,
  );
}
