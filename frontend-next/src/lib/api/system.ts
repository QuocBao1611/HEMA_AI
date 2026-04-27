import { systemInfoSchema } from "@/schemas/api";
import { apiGet } from "@/lib/api/client";
import type { SystemInfoResponse } from "@/types/api";

export function getSystemInfo() {
  return apiGet<SystemInfoResponse>("/info", systemInfoSchema);
}
