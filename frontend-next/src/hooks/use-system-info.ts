import { useQuery } from "@tanstack/react-query";

import { getSystemInfo } from "@/lib/api/system";

export function useSystemInfo() {
  return useQuery({
    queryKey: ["system-info"],
    queryFn: getSystemInfo,
  });
}
