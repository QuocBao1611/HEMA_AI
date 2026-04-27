"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  Database,
  Download,
  History,
  LineChart,
  RefreshCcw,
  SearchCheck,
  ServerCog,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SurfaceCard } from "@/components/ui/surface-card";
import { useDashboardData, useHistoryDetail } from "@/hooks/use-dashboard-data";
import { useSystemInfo } from "@/hooks/use-system-info";
import { exportAnalysisReport } from "@/lib/reports/export-analysis-report";
import { formatCount, formatPercent } from "@/lib/utils/format";
import type { ClinicalFlagRule, HistoryItem } from "@/types/api";

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <article className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm leading-7 text-slate-300/76">{hint}</p>
    </article>
  );
}

function buildChartData(items: HistoryItem[]) {
  return [...items]
    .reverse()
    .slice(-8)
    .map((item, index) => ({
      index: index + 1,
      confidence: Number(item.average_confidence || 0) * 100,
      classified: Number(item.classified_cell_count || 0),
      label: new Date(item.created_at).toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
      }),
    }));
}

export function DashboardWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [modelFilter, setModelFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [sinceDays, setSinceDays] = useState("30");

  const dashboardQuery = useDashboardData({
    limit: 24,
    modelId: modelFilter || undefined,
    mode: modeFilter || undefined,
    sinceDays: sinceDays ? Number(sinceDays) : undefined,
  });

  const selectedRecordId = Number(searchParams.get("record") || "") || null;
  const detailQuery = useHistoryDetail(selectedRecordId);
  const systemInfoQuery = useSystemInfo();

  useEffect(() => {
    const handler = () => {
      void dashboardQuery.refetch();
    };

    window.addEventListener("workspace:data-changed", handler);
    return () => {
      window.removeEventListener("workspace:data-changed", handler);
    };
  }, [dashboardQuery]);

  useEffect(() => {
    if (!dashboardQuery.isError) {
      return;
    }

    toast.error(
      dashboardQuery.error instanceof Error
        ? dashboardQuery.error.message
        : "Không thể tải dữ liệu từ backend.",
    );
  }, [dashboardQuery.error, dashboardQuery.isError]);

  const health = dashboardQuery.data?.health;
  const historyItems = useMemo(
    () => dashboardQuery.data?.history.items ?? [],
    [dashboardQuery.data?.history.items],
  );
  const chartData = useMemo(() => buildChartData(historyItems), [historyItems]);
  const averageConfidence = useMemo(() => {
    if (!historyItems.length) {
      return "0.0%";
    }
    const total = historyItems.reduce(
      (sum, item) => sum + Number(item.average_confidence || 0),
      0,
    );
    return formatPercent(total / historyItems.length);
  }, [historyItems]);
  const lastSynced = useMemo(() => {
    if (!dashboardQuery.dataUpdatedAt) {
      return "-";
    }
    return new Date(dashboardQuery.dataUpdatedAt).toLocaleTimeString("vi-VN");
  }, [dashboardQuery.dataUpdatedAt]);
  const clinicalFlagRules = useMemo<ClinicalFlagRule[]>(
    () => systemInfoQuery.data?.clinical_flag_rules ?? [],
    [systemInfoQuery.data?.clinical_flag_rules],
  );

  return (
    <div className="space-y-6">
      <SurfaceCard className="p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-orange-200/72">
              Operations Dashboard
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
              Lịch Sử Hệ Thống
            </h1>
          </div>

          <Button
            variant="secondary"
            onClick={() => void dashboardQuery.refetch()}
            disabled={dashboardQuery.isFetching}
          >
            <RefreshCcw
              className={`mr-2 h-4 w-4 ${dashboardQuery.isFetching ? "animate-spin" : ""}`}
            />
            Làm mới
          </Button>
        </div>
      </SurfaceCard>

      <SurfaceCard className="p-5">
        <div
          className={`rounded-[22px] border px-4 py-4 text-sm leading-7 ${
            dashboardQuery.isError
              ? "border-red-400/20 bg-red-500/10 text-red-100"
              : health?.database?.ready
                ? "border-emerald-400/18 bg-emerald-500/10 text-emerald-50"
                : "border-orange-300/18 bg-orange-400/10 text-orange-50"
          }`}
        >
          {dashboardQuery.isLoading
            ? "Đang tải lịch sử phân tích và trạng thái hệ thống..."
            : dashboardQuery.isError
              ? dashboardQuery.error instanceof Error
                ? dashboardQuery.error.message
                : "Không thể tải dữ liệu."
              : dashboardQuery.isFetching
                ? "Đang đồng bộ với dữ liệu mới..."
                : `Đã tải xong dữ liệu. Lần đồng bộ cuối: ${lastSynced}`}
        </div>
      </SurfaceCard>

      <SurfaceCard className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="inline-flex rounded-2xl border border-white/10 bg-white/8 p-3 text-orange-300">
            <SearchCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Bộ lọc lịch sử</h2>
            <p className="text-sm text-slate-300/72">
              Lọc nhanh theo model, mode và khoảng thời gian.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <select
            value={modelFilter}
            onChange={(event) => setModelFilter(event.target.value)}
            className="h-12 rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white"
          >
            <option value="">Tất cả model</option>
            {(health?.available_models ?? []).map((model) => (
              <option key={model.model_id} value={model.model_id}>
                {model.display_name}
              </option>
            ))}
          </select>

          <select
            value={modeFilter}
            onChange={(event) => setModeFilter(event.target.value)}
            className="h-12 rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white"
          >
            <option value="">Tất cả mode</option>
            <option value="predict">predict</option>
            <option value="analyze">analyze</option>
            <option value="compare_models">compare_models</option>
          </select>

          <select
            value={sinceDays}
            onChange={(event) => setSinceDays(event.target.value)}
            className="h-12 rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white"
          >
            <option value="7">7 ngày</option>
            <option value="30">30 ngày</option>
            <option value="90">90 ngày</option>
            <option value="180">180 ngày</option>
          </select>
        </div>
      </SurfaceCard>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Bản ghi gần đây"
          value={formatCount(historyItems.length)}
          hint="Sau khi áp dụng bộ lọc hiện tại."
        />
        <SummaryCard
          label="Model mặc định"
          value={health?.default_model_name ?? "-"}
          hint={health?.default_model_id ?? "-"}
        />
        <SummaryCard
          label="Cơ sở dữ liệu"
          value={health?.database?.ready ? "Sẵn sàng" : "Chưa kết nối"}
          hint={
            health?.database?.ready
              ? "Có thể ghi lịch sử và cấu hình."
              : health?.database?.last_error ?? "Đang chờ backend."
          }
        />
        <SummaryCard
          label="Tin cậy TB"
          value={averageConfidence}
          hint="Tính trên danh sách bản ghi đang hiện."
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_400px]">
        <SurfaceCard className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="inline-flex rounded-2xl border border-white/10 bg-white/8 p-3 text-orange-300">
              <LineChart className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Biểu đồ độ tin cậy</h2>
              <p className="text-sm text-slate-300/72">
                Xu hướng tin cậy trung bình của các ca sau khi lọc.
              </p>
            </div>
          </div>

          {chartData.length ? (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="confidenceFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#fb7185" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="#fb923c" stopOpacity={0.08} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 18,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(2,6,23,0.94)",
                      color: "#f8fafc",
                    }}
                    formatter={(value) => [
                      `${Number(value || 0).toFixed(1)}%`,
                      "Tin cậy",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="confidence"
                    stroke="#fb7185"
                    strokeWidth={3}
                    fill="url(#confidenceFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="rounded-[22px] border border-dashed border-white/10 bg-slate-950/30 px-4 py-16 text-center text-sm text-slate-400">
              Chưa có dữ liệu lịch sử để vẽ biểu đồ sau khi lọc.
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="inline-flex rounded-2xl border border-white/10 bg-white/8 p-3 text-orange-300">
              <ServerCog className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Trạng thái hệ thống</h2>
              <p className="text-sm text-slate-300/72">
                Thông số tổng quan của backend hiện tại.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {[
              {
                icon: Activity,
                label: "Status",
                value: health?.status ?? (dashboardQuery.isLoading ? "Đang tải" : "-"),
              },
              {
                icon: Database,
                label: "Database",
                value: health?.database?.ready ? "Ready" : "Not ready",
              },
              {
                icon: History,
                label: "Analysis mode",
                value: health?.analysis_mode ?? "-",
              },
              {
                icon: ServerCog,
                label: "Preprocessing",
                value: health?.preprocessing ?? "-",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-[22px] border border-white/8 bg-white/[0.04] px-4 py-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="inline-flex rounded-2xl border border-white/10 bg-white/8 p-2 text-orange-300">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-medium text-slate-200">
                      {item.label}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-white">{item.value}</span>
                </div>
              );
            })}
          </div>
        </SurfaceCard>
      </section>

      <SurfaceCard className="p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">
              History Feed
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Các ca phân tích gần đây
            </h2>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-slate-200">
            {formatCount(historyItems.length)} bản ghi
          </div>
        </div>

        {historyItems.length ? (
          <div className="grid gap-3">
            {historyItems.map((item) => (
              <article
                key={item.id}
                className={`rounded-[24px] border p-5 transition ${
                  selectedRecordId === item.id
                    ? "border-orange-300/30 bg-orange-400/8"
                    : "border-white/8 bg-white/[0.04]"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        const params = new URLSearchParams(searchParams.toString());
                        params.set("record", String(item.id));
                        router.replace(`/dashboard?${params.toString()}`);
                      }}
                      className="truncate text-left text-base font-semibold text-white"
                    >
                      {item.filename || "Không có tên file"}
                    </button>
                    <p className="mt-1 text-sm text-slate-400">
                      {item.model_name || item.model_id || "Không rõ model"}
                    </p>
                  </div>
                  <time className="text-sm text-slate-400">
                    {new Date(item.created_at).toLocaleString("vi-VN")}
                  </time>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    item.mode || "-",
                    `${formatCount(item.detected_cell_count)} phát hiện`,
                    `${formatCount(item.classified_cell_count)} được tính`,
                    formatPercent(item.average_confidence || 0),
                    item.dominant_label || "Chưa rõ",
                  ].map((chip) => (
                    <span
                      key={`${item.id}-${chip}`}
                      className="rounded-full border border-white/8 bg-slate-950/48 px-3 py-1.5 text-xs font-medium text-slate-200"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-white/10 bg-slate-950/30 px-4 py-16 text-center text-sm text-slate-400">
            Chưa có lịch sử sau khi áp dụng bộ lọc hiện tại.
          </div>
        )}
      </SurfaceCard>

      {selectedRecordId ? (
        <SurfaceCard className="p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">
                History Detail
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Chi tiết bản ghi #{selectedRecordId}
              </h2>
            </div>
            {detailQuery.data ? (
              <Button
                variant="secondary"
                onClick={() =>
                  exportAnalysisReport({
                    title: "HemaVision History Report",
                    filename: `${detailQuery.data.filename || "history"}-${detailQuery.data.id}`,
                    createdAt: detailQuery.data.created_at,
                    result: detailQuery.data.result_payload,
                    rules: clinicalFlagRules,
                  })
                }
              >
                <Download className="mr-2 h-4 w-4" />
                Xuất PDF
              </Button>
            ) : null}
          </div>

          {detailQuery.isLoading ? (
            <div className="h-32 animate-pulse rounded-[22px] bg-white/6" />
          ) : detailQuery.isError ? (
            <div className="rounded-[22px] border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
              {detailQuery.error instanceof Error
                ? detailQuery.error.message
                : "Không thể tải chi tiết lịch sử."}
            </div>
          ) : detailQuery.data ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                  label="Mode"
                  value={detailQuery.data.mode}
                  hint={detailQuery.data.analysis_mode || "-"}
                />
                <SummaryCard
                  label="Model"
                  value={detailQuery.data.model_name || detailQuery.data.model_id || "-"}
                  hint="Bản ghi đã lưu"
                />
                <SummaryCard
                  label="Detected"
                  value={formatCount(detailQuery.data.detected_cell_count)}
                  hint="Số cell/region phát hiện"
                />
                <SummaryCard
                  label="Avg confidence"
                  value={formatPercent(detailQuery.data.average_confidence || 0)}
                  hint={detailQuery.data.dominant_label || "-"}
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4">
                  <h3 className="mb-3 text-lg font-semibold text-white">Request payload</h3>
                  <pre className="overflow-x-auto text-xs leading-6 text-slate-300">
                    {JSON.stringify(detailQuery.data.request_payload, null, 2)}
                  </pre>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4">
                  <h3 className="mb-3 text-lg font-semibold text-white">Result payload</h3>
                  <pre className="overflow-x-auto text-xs leading-6 text-slate-300">
                    {JSON.stringify(detailQuery.data.result_payload, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          ) : null}
        </SurfaceCard>
      ) : null}
    </div>
  );
}
