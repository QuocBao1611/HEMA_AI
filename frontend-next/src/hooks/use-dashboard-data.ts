import { useQuery } from "@tanstack/react-query";

import {
  getDashboardSnapshot,
  getHistoryDetail,
  type HistoryQueryOptions,
} from "@/lib/api/dashboard";

export function useDashboardData(options: HistoryQueryOptions = {}) {
  return useQuery({
    queryKey: ["dashboard-snapshot", options],
    queryFn: () => getDashboardSnapshot(options),
  });
}

export function useHistoryDetail(recordId: number | null) {
  return useQuery({
    queryKey: ["history-detail", recordId],
    queryFn: () => getHistoryDetail(recordId as number),
    enabled: recordId !== null,
  });
}
