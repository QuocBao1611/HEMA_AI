"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Database,
  Download,
  Filter,
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
import { useThemeStore } from "@/stores/theme-store";

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
  icon: Icon,
  colorClass = "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-500/10",
}: {
  label: string;
  value: string;
  hint: string;
  icon: any;
  colorClass?: string;
}) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-black/5 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5 transition-shadow hover:shadow-md dark:hover:shadow-red-500/5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <div className={`p-2 rounded-xl ${colorClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="text-3xl font-bold text-slate-900 dark:text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 truncate">{hint}</p>
    </article>
  );
}

function buildChartData(items: HistoryItem[]) {
  return [...items]
    .reverse()
    .slice(-12)
    .map((item, index) => {
      const date = new Date(item.created_at);
      return {
        id: `point-${index}-${item.id}`,
        confidence: Number(item.average_confidence || 0) * 100,
        classified: Number(item.classified_cell_count || 0),
        label: date.toLocaleDateString("vi-VN", {
          day: "2-digit",
          month: "2-digit",
        }),
        fullTime: date.toLocaleString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit",
        }),
      };
    });
}

export function DashboardWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDark = useThemeStore((s) => s.theme) === "dark";

  const [modelFilter, setModelFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [sinceDays, setSinceDays] = useState("30");

  const dashboardQuery = useDashboardData({
    limit: 30,
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
    if (!dashboardQuery.isError) return;
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
    if (!historyItems.length) return "0.0%";
    const total = historyItems.reduce((sum, item) => sum + Number(item.average_confidence || 0), 0);
    return formatPercent(total / historyItems.length);
  }, [historyItems]);

  const lastSynced = useMemo(() => {
    if (!dashboardQuery.dataUpdatedAt) return "-";
    return new Date(dashboardQuery.dataUpdatedAt).toLocaleTimeString("vi-VN");
  }, [dashboardQuery.dataUpdatedAt]);

  const clinicalFlagRules = useMemo<ClinicalFlagRule[]>(
    () => systemInfoQuery.data?.clinical_flag_rules ?? [],
    [systemInfoQuery.data?.clinical_flag_rules],
  );

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-[#000000] pt-32 pb-20 px-6 sm:px-10 lg:px-14 transition-colors duration-500">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="h-px w-8 bg-red-500/70"></span>
              <span className="text-xs font-bold uppercase tracking-widest text-red-600 dark:text-red-400">
                Operations & Logs
              </span>
            </div>
            <h1 className="text-4xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
              Lịch Sử Hệ Thống
            </h1>

            <div className="mt-3 flex items-center gap-2">
              {dashboardQuery.isLoading ? (
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
                  <RefreshCcw className="w-4 h-4 animate-spin" /> Đang tải dữ liệu...
                </span>
              ) : dashboardQuery.isError ? (
                <span className="flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400">
                  <AlertCircle className="w-4 h-4" /> Không thể kết nối máy chủ
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-500">
                  <CheckCircle2 className="w-4 h-4" /> Đã đồng bộ lúc {lastSynced}
                </span>
              )}
            </div>
          </div>

          <Button
            variant="outline"
            className="bg-white dark:bg-white/5 border-slate-200 dark:border-white/10"
            onClick={() => void dashboardQuery.refetch()}
            disabled={dashboardQuery.isFetching}
          >
            <RefreshCcw className={`mr-2 h-4 w-4 ${dashboardQuery.isFetching ? "animate-spin" : ""}`} />
            Làm mới dữ liệu
          </Button>
        </div>

        {/* 4 Summary Cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="Bản ghi đã lọc"
            value={formatCount(historyItems.length)}
            hint="Tổng số bản ghi theo bộ lọc"
            icon={History}
            colorClass="text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-500/10"
          />
          <SummaryCard
            label="Model mặc định"
            value={health?.default_model_name ?? "-"}
            hint={health?.default_model_id ?? "Chưa có model"}
            icon={ServerCog}
            colorClass="text-emerald-600 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/10"
          />
          <SummaryCard
            label="Cơ sở dữ liệu"
            value={health?.database?.ready ? "Sẵn sàng" : "Mất kết nối"}
            hint={health?.database?.ready ? "Hệ thống lưu trữ đang chạy" : "Vui lòng kiểm tra lại backend"}
            icon={Database}
            colorClass={health?.database?.ready ? "text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-500/10" : "text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-500/10"}
          />
          <SummaryCard
            label="Tin cậy TB"
            value={averageConfidence}
            hint="Trung bình độ tin cậy AI"
            icon={Activity}
          />
        </section>

        {/* Filters & Chart Row */}
        <section className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* Filters */}
          <div className="space-y-6">
            <SurfaceCard className="p-6 h-full border-none shadow-sm dark:shadow-none ring-1 ring-black/5 dark:ring-white/10">
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-xl bg-red-100 dark:bg-red-500/10 p-2.5 text-red-600 dark:text-red-400">
                  <Filter className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Bộ lọc dữ liệu</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Thu hẹp phạm vi tìm kiếm</p>
                </div>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Mô hình phân tích (Model)</label>
                  <div className="relative">
                    <select
                      value={modelFilter}
                      onChange={(e) => setModelFilter(e.target.value)}
                      className="w-full appearance-none rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 px-4 py-3 text-sm font-medium text-slate-900 dark:text-white focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 transition-colors"
                    >
                      <option value="">Tất cả model</option>
                      {(health?.available_models ?? []).map((model) => (
                        <option key={model.model_id} value={model.model_id}>{model.display_name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Chế độ chạy (Mode)</label>
                  <div className="relative">
                    <select
                      value={modeFilter}
                      onChange={(e) => setModeFilter(e.target.value)}
                      className="w-full appearance-none rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 px-4 py-3 text-sm font-medium text-slate-900 dark:text-white focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 transition-colors"
                    >
                      <option value="">Tất cả chế độ</option>
                      <option value="predict">Dự đoán nhanh (Predict)</option>
                      <option value="analyze">Phân tích toàn diện (Analyze)</option>
                      <option value="compare_models">So sánh (Compare)</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Thời gian (Time)</label>
                  <div className="relative">
                    <select
                      value={sinceDays}
                      onChange={(e) => setSinceDays(e.target.value)}
                      className="w-full appearance-none rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 px-4 py-3 text-sm font-medium text-slate-900 dark:text-white focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 transition-colors"
                    >
                      <option value="7">Trong 7 ngày qua</option>
                      <option value="30">Trong 30 ngày qua</option>
                      <option value="90">Trong 90 ngày qua</option>
                      <option value="180">Trong 6 tháng qua</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>
            </SurfaceCard>
          </div>

          {/* Chart */}
          <SurfaceCard className="p-6 border-none shadow-sm dark:shadow-none ring-1 ring-black/5 dark:ring-white/10 flex flex-col">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-3">
                  Biến động độ tin cậy
                  <span id="hovered-confidence-badge" className="hidden text-red-500 font-mono bg-red-50 dark:bg-red-500/10 px-2 py-0.5 rounded-md text-sm animate-in fade-in zoom-in duration-200">
                  </span>
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Theo dõi độ ổn định của AI qua các ca phân tích (12 ca gần nhất)</p>
              </div>
              <div className="rounded-xl bg-slate-100 dark:bg-white/5 p-2.5 text-slate-600 dark:text-slate-400">
                <LineChart className="h-5 w-5" />
              </div>
            </div>

            <div className="flex-1 min-h-[300px] w-full">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart 
                    data={chartData} 
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="confidenceFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} vertical={false} />
                    <XAxis
                      dataKey="id"
                      tickFormatter={(value) => {
                        const point = chartData.find(d => d.id === value);
                        return point ? point.label : "";
                      }}
                      tick={{ fill: isDark ? "#64748b" : "#94a3b8", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      dy={10}
                    />
                    <YAxis
                      tick={{ fill: isDark ? "#64748b" : "#94a3b8", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      domain={[0, 100]}
                      dx={-10}
                    />
                    <Tooltip
                      content={({ active, payload, label }: any) => {
                        // Cập nhật DOM badge trên Title đồng thời với Tooltip
                        if (typeof document !== 'undefined') {
                          const badge = document.getElementById('hovered-confidence-badge');
                          if (badge) {
                            if (active && payload && payload.length > 0) {
                              badge.innerText = `${Number(payload[0].value).toFixed(1)}%`;
                              badge.classList.remove('hidden');
                            } else {
                              badge.classList.add('hidden');
                            }
                          }
                        }

                        if (active && payload && payload.length > 0) {
                          const pointData = payload[0].payload; // Access the actual data object
                          return (
                            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 p-3 shadow-lg backdrop-blur-md">
                              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{pointData.fullTime}</p>
                              <p className="text-sm font-bold text-red-500">
                                Độ tin cậy: {Number(payload[0].value).toFixed(1)}%
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area type="monotone" dataKey="confidence" stroke="#ef4444" strokeWidth={3} fill="url(#confidenceFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-white/20 rounded-2xl text-slate-400">
                  <LineChart className="h-8 w-8 mb-3 opacity-50" />
                  <p className="text-sm font-medium">Chưa có đủ dữ liệu để vẽ biểu đồ.</p>
                </div>
              )}
            </div>
          </SurfaceCard>
        </section>

        {/* History List Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Danh sách bản ghi</h2>
            <span className="text-sm font-semibold text-slate-500 bg-slate-200/50 dark:bg-white/10 px-3 py-1 rounded-full">
              {formatCount(historyItems.length)} kết quả
            </span>
          </div>

          {historyItems.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f0f16] shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                  <thead className="bg-blue-600 dark:bg-blue-700 text-xs uppercase tracking-wider font-bold text-white border-b border-blue-700 dark:border-blue-800">
                    <tr>
                      <th className="px-6 py-4">Tệp phân tích</th>
                      <th className="px-6 py-4">Model sử dụng</th>
                      <th className="px-6 py-4 text-center">Chế độ</th>
                      <th className="px-6 py-4 text-center">Tế bào (Phát hiện)</th>
                      <th className="px-6 py-4 text-center">Độ tin cậy</th>
                      <th className="px-6 py-4 text-right">Thời gian</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {historyItems.map((item) => {
                      const isSelected = selectedRecordId === item.id;
                      return (
                        <tr 
                          key={item.id}
                          onClick={() => {
                            const params = new URLSearchParams(searchParams.toString());
                            params.set("record", String(item.id));
                            router.replace(`/dashboard?${params.toString()}`, { scroll: false });
                          }}
                          className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.02] ${isSelected ? "bg-red-50/50 dark:bg-red-500/5" : ""}`}
                        >
                          <td className="px-6 py-4 whitespace-nowrap font-bold text-slate-900 dark:text-white">
                            {item.filename || "Không có tên file"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <ServerCog className="w-4 h-4 text-slate-400" />
                              {item.model_name || item.model_id || "Không rõ model"}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className="rounded-lg bg-slate-100 dark:bg-white/5 px-2.5 py-1 text-[10px] font-bold tracking-widest text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10">
                              {item.mode?.toUpperCase() || "-"}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className="font-semibold text-blue-600 dark:text-blue-400">
                              {formatCount(item.detected_cell_count)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {formatPercent(item.average_confidence || 0)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-slate-500">
                            {new Date(item.created_at).toLocaleString("vi-VN", { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-white/20 bg-slate-50 dark:bg-slate-900/20 px-6 py-20 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center">
              <SearchCheck className="w-10 h-10 mb-4 opacity-50" />
              <p className="text-lg font-medium">Không tìm thấy dữ liệu phù hợp</p>
              <p className="text-sm mt-1">Hãy thử thay đổi tiêu chí bộ lọc ở trên.</p>
            </div>
          )}
        </section>

        {/* Detail Modal Overlay */}
        {selectedRecordId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 lg:p-8">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.delete("record");
                router.replace(`/dashboard?${params.toString()}`, { scroll: false });
              }}
            />
            
            {/* Modal Content */}
            <div className="relative w-full max-w-4xl max-h-full overflow-y-auto rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f0f16] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col">
              {/* Modal Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 dark:border-white/10 bg-white/80 dark:bg-[#0f0f16]/80 px-6 py-4 backdrop-blur-md">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Bản ghi chi tiết
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                    #{selectedRecordId}
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  {detailQuery.data && (
                    <Button
                      variant="default"
                      className="bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-500/20"
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
                      <Download className="mr-2 h-4 w-4" /> Export PDF
                    </Button>
                  )}
                  <button 
                    onClick={() => {
                      const params = new URLSearchParams(searchParams.toString());
                      params.delete("record");
                      router.replace(`/dashboard?${params.toString()}`, { scroll: false });
                    }}
                    className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  >
                    <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6">
                {detailQuery.isLoading ? (
                  <div className="space-y-4">
                    <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />
                    <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />
                  </div>
                ) : detailQuery.isError ? (
                  <div className="rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    {detailQuery.error instanceof Error ? detailQuery.error.message : "Lỗi khi tải chi tiết."}
                  </div>
                ) : detailQuery.data ? (
                  <div className="space-y-6">
                    {/* Quick Stats Grid inside Detail */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5">
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Phát hiện</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{formatCount(detailQuery.data.detected_cell_count)}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5">
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Độ tin cậy</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{formatPercent(detailQuery.data.average_confidence || 0)}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 md:col-span-2 flex justify-between items-center">
                        <div>
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Nhóm trội</p>
                          <p className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">{detailQuery.data.dominant_label || "Chưa xác định"}</p>
                        </div>
                        <Activity className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                      </div>
                    </div>

                    {/* Payloads */}
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                          <Database className="w-4 h-4" /> Request Payload
                        </h3>
                        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-900 p-4 shadow-inner max-h-[400px] overflow-auto custom-scrollbar">
                          <pre className="text-xs leading-relaxed text-emerald-400 font-mono">
                            {JSON.stringify(detailQuery.data.request_payload, null, 2)}
                          </pre>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                          <Activity className="w-4 h-4" /> Result Payload
                        </h3>
                        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-900 p-4 shadow-inner max-h-[400px] overflow-auto custom-scrollbar">
                          <pre className="text-xs leading-relaxed text-blue-400 font-mono">
                            {JSON.stringify(detailQuery.data.result_payload, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
