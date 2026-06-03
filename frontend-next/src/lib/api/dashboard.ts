import {
  healthResponseSchema,
  historyDetailSchema,
  historyResponseSchema,
} from "@/schemas/api";
import { apiGet, apiPutJson } from "@/lib/api/client";
import type {
  HealthResponse,
  HistoryDetailResponse,
  HistoryResponse,
} from "@/types/api";

export function getHealth() {
  return apiGet<HealthResponse>("/health", healthResponseSchema);
}

export type HistoryQueryOptions = {
  limit?: number;
  modelId?: string;
  mode?: string;
  sinceDays?: number;
};

export function getHistory(options: HistoryQueryOptions = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? 24));
  if (options.modelId) {
    params.set("model_id", options.modelId);
  }
  if (options.mode) {
    params.set("mode", options.mode);
  }
  if (options.sinceDays) {
    params.set("since_days", String(options.sinceDays));
  }

  return apiGet<HistoryResponse>(`/history?${params.toString()}`, historyResponseSchema);
}

export function getHistoryDetail(recordId: number) {
  return apiGet<HistoryDetailResponse>(`/history/${recordId}`, historyDetailSchema);
}

export function updateHistoryRecord(recordId: number, resultPayload: Record<string, any>) {
  return apiPutJson<{ status: string; message: string }>(`/history/${recordId}`, resultPayload);
}

export async function getDashboardSnapshot(options: HistoryQueryOptions = {}) {
  const [health, history] = await Promise.all([getHealth(), getHistory(options)]);

  return {
    health,
    history,
  };
}
