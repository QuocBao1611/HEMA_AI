import { Suspense } from "react";

import { DashboardWorkspace } from "@/components/dashboard/dashboard-workspace";

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardWorkspace />
    </Suspense>
  );
}
