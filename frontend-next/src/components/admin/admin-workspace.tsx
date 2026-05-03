"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  CircleAlert,
  Cpu,
  Database,
  FlaskConical,
  Layers,
  Lock,
  RefreshCw,
  Save,
  Settings2,
  ShieldAlert,
  Tags,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { toast } from "sonner";

import {
  getAdminClinicalFlags,
  getAdminLabels,
  getAdminOverview,
  updateAdminClinicalFlags,
  updateAdminLabels,
  updateDefaultModel,
} from "@/lib/api/admin";
import type { ClinicalFlagRule, ModelSummary } from "@/types/api";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";

// ─── Types ──────────────────────────────────────────────────────────────────
type Tab = "models" | "labels" | "flags";

// ─── Helpers ────────────────────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "models", label: "Mô hình AI", icon: Cpu },
  { id: "labels", label: "Nhãn phân loại", icon: Tags },
  { id: "flags", label: "Cảnh báo lâm sàng", icon: ShieldAlert },
];

function Badge({ children, variant = "neutral" }: { children: React.ReactNode; variant?: "neutral" | "success" | "warning" | "danger" }) {
  const cls = {
    neutral: "bg-white/8 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10",
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    danger: "bg-red-500/10 text-red-400 border-red-500/20",
  }[variant];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {children}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 dark:border-white/8 bg-white/80 dark:bg-white/[0.03] px-5 py-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/6 text-slate-700 dark:text-slate-300">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">{label}</span>
        <span className="mt-0.5 block truncate text-base font-semibold text-slate-900 dark:text-white">{value}</span>
        {sub && <span className="block text-xs text-slate-500">{sub}</span>}
      </div>
    </div>
  );
}

// ─── Section: Default Model ──────────────────────────────────────────────────
function ModelSection({
  models,
  defaultModelId,
  isPending,
  onChangeDefault,
}: {
  models: ModelSummary[];
  defaultModelId: string;
  isPending: boolean;
  onChangeDefault: (id: string) => void;
}) {
  const activeModel = models.find((m) => m.model_id === defaultModelId);

  return (
    <div className="space-y-6">
      {/* Model picker */}
      <div className="space-y-3">
        <span className="block text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Model mặc định hệ thống</span>
        <div className="relative">
          <select
            value={defaultModelId}
            disabled={isPending || models.length === 0}
            onChange={(e) => onChangeDefault(e.target.value)}
            className="h-12 w-full appearance-none rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950/60 pl-4 pr-10 text-sm font-medium text-slate-900 dark:text-white outline-none transition hover:border-slate-300 dark:hover:border-white/20 focus:border-slate-400 dark:focus:border-white/30 disabled:opacity-50 cursor-pointer"
          >
            {models.map((m) => (
              <option key={m.model_id} value={m.model_id}>{m.display_name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
        </div>
      </div>

      {/* Active model detail */}
      {activeModel && (
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard icon={Layers} label="Cấu trúc đầu vào" value={activeModel.input_shape.join(" × ")} />
          <StatCard icon={FlaskConical} label="Số lượng lớp" value={activeModel.num_classes} />
          <StatCard icon={Settings2} label="Tiền xử lý" value={activeModel.preprocessing || "—"} />
          <StatCard icon={Database} label="Mã Model" value={activeModel.model_id} />
        </div>
      )}

      {/* Model list table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/8 bg-white/80 dark:bg-white/[0.03]">
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Tên Model</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Số lớp</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {models.map((m) => (
              <tr key={m.model_id} className="transition hover:bg-white/70 dark:bg-white/[0.025]">
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{m.display_name}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{m.num_classes}</td>
                <td className="px-4 py-3">
                  {m.model_id === defaultModelId ? (
                    <Badge variant="success"><Check className="mr-1 h-3 w-3" />Mặc định</Badge>
                  ) : (
                    <Badge>Dự phòng</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Section: Labels ─────────────────────────────────────────────────────────
function LabelsSection({
  models,
  activeModelId,
  onSelectModel,
  labelValues,
  onChangeLabel,
  onSave,
  isSaving,
  isLoading,
}: {
  models: ModelSummary[];
  activeModelId: string;
  onSelectModel: (id: string) => void;
  labelValues: string[];
  onChangeLabel: (index: number, value: string) => void;
  onSave: () => void;
  isSaving: boolean;
  isLoading: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* Model selector */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <select
            value={activeModelId}
            onChange={(e) => onSelectModel(e.target.value)}
            className="h-12 w-full appearance-none rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950/60 pl-4 pr-10 text-sm font-medium text-slate-900 dark:text-white outline-none transition hover:border-slate-300 dark:hover:border-white/20 focus:border-slate-400 dark:focus:border-white/30 cursor-pointer"
          >
            {models.map((m) => (
              <option key={m.model_id} value={m.model_id}>{m.display_name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
        </div>
        <Badge variant={labelValues.length > 0 ? "success" : "warning"}>
          {labelValues.length} nhãn
        </Badge>
      </div>

      {/* Labels grid */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-2xl border border-slate-200 dark:border-white/6 bg-white/80 dark:bg-white/[0.03]" />
          ))}
        </div>
      ) : labelValues.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 dark:border-white/12 py-16 text-center">
          <Tags className="h-8 w-8 text-slate-600" />
          <span className="text-sm font-medium text-slate-500">Chưa có label nào cho model này</span>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {labelValues.map((value, index) => (
            <div key={`${activeModelId}-${index}`} className="rounded-2xl border border-slate-200 dark:border-white/8 bg-white/80 dark:bg-white/[0.03] px-4 py-3">
              <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.24em] text-slate-600">
                Nhãn {index}
              </span>
              <input
                value={value}
                onChange={(e) => onChangeLabel(index, e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950/60 px-3 text-sm font-medium text-slate-900 dark:text-white outline-none transition focus:border-slate-400 dark:focus:border-white/30"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          onClick={onSave}
          disabled={!activeModelId || isSaving || labelValues.length === 0}
        >
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? "Đang lưu…" : "Lưu Nhãn"}
        </Button>
      </div>
    </div>
  );
}

// ─── Section: Clinical Flags ──────────────────────────────────────────────────
function FlagsSection({
  rules,
  onChangeRule,
  onSave,
  isSaving,
}: {
  rules: ClinicalFlagRule[];
  onChangeRule: (index: number, rule: ClinicalFlagRule) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const severityBadge: Record<string, "danger" | "warning"> = {
    critical: "danger",
    warning: "warning",
  };

  return (
    <div className="space-y-4">
      {rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 dark:border-white/12 py-16 text-center">
          <ShieldAlert className="h-8 w-8 text-slate-600" />
          <span className="text-sm font-medium text-slate-500">Không có clinical flag nào</span>
        </div>
      ) : (
        rules.map((rule, index) => (
          <div
            key={rule.key}
            className={`rounded-2xl border bg-white/80 dark:bg-white/[0.03] px-5 py-4 transition ${
              rule.enabled ? "border-slate-200 dark:border-white/10" : "border-slate-200 dark:border-white/5 opacity-60"
            }`}
          >
            {/* Header row */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {rule.severity === "critical" ? (
                  <CircleAlert className="h-4 w-4 text-red-400" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                )}
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{rule.key}</span>
                <Badge variant={severityBadge[rule.severity] ?? "neutral"}>
                  {rule.severity === "critical" ? "Nghiêm trọng" : rule.severity === "warning" ? "Cảnh báo" : rule.severity}
                </Badge>
              </div>
              <button
                type="button"
                onClick={() => onChangeRule(index, { ...rule, enabled: !rule.enabled })}
                className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100/50 dark:bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 transition hover:border-slate-300 dark:hover:border-white/20"
              >
                {rule.enabled ? (
                  <><ToggleRight className="h-4 w-4 text-emerald-400" />Bật</>
                ) : (
                  <><ToggleLeft className="h-4 w-4 text-slate-500" />Tắt</>
                )}
              </button>
            </div>

            {/* Fields grid */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600">Tiêu đề</span>
                <input
                  value={rule.title}
                  onChange={(e) => onChangeRule(index, { ...rule, title: e.target.value })}
                  className="h-10 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950/60 px-3 text-sm text-slate-900 dark:text-white outline-none transition focus:border-slate-400 dark:focus:border-white/30"
                />
              </div>
              <div className="space-y-1.5">
                <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600">Ngưỡng</span>
                <input
                  type="number"
                  step="0.01"
                  value={rule.threshold}
                  onChange={(e) => onChangeRule(index, { ...rule, threshold: Number(e.target.value) })}
                  className="h-10 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950/60 px-3 text-sm text-slate-900 dark:text-white outline-none transition focus:border-slate-400 dark:focus:border-white/30"
                />
              </div>
              <div className="space-y-1.5">
                <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600">Nhãn gốc</span>
                <input
                  readOnly
                  value={rule.label}
                  className="h-10 w-full rounded-xl border border-slate-200 dark:border-white/6 bg-slate-100 dark:bg-white/[0.02] px-3 text-sm text-slate-600 dark:text-slate-400 cursor-default"
                />
              </div>
              <div className="space-y-1.5">
                <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600">Nguồn / Trường</span>
                <div className="flex h-10 items-center rounded-xl border border-slate-200 dark:border-white/6 bg-slate-100 dark:bg-white/[0.02] px-3 text-xs text-slate-600 dark:text-slate-400">
                  {rule.source === "estimated_counts" ? "Số lượng ước tính" : rule.source === "grouped_counts" ? "Số lượng nhóm" : rule.source === "wbc_differential" ? "Công thức bạch cầu" : rule.source} · {rule.field === "count" ? "Số lượng" : rule.field === "ratio" ? "Tỷ lệ" : rule.field}
                </div>
              </div>
            </div>

            {/* Action */}
            <div className="mt-3 space-y-1.5">
              <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600">Hành động / Gợi ý</span>
              <textarea
                value={rule.action}
                onChange={(e) => onChangeRule(index, { ...rule, action: e.target.value })}
                rows={2}
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950/60 px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none transition focus:border-slate-400 dark:focus:border-white/30 resize-none"
              />
            </div>
          </div>
        ))
      )}

      <div className="flex justify-end">
        <Button
          onClick={onSave}
          disabled={isSaving || rules.length === 0}
        >
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? "Đang lưu…" : "Lưu Cấu hình"}
        </Button>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export function AdminWorkspace() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [activeTab, setActiveTab] = useState<Tab>("models");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [labelDraft, setLabelDraft] = useState<string[] | null>(null);
  const [rulesDraft, setRulesDraft] = useState<ClinicalFlagRule[] | null>(null);

  // Queries
  const overviewQuery = useQuery({ queryKey: ["admin-overview"], queryFn: getAdminOverview });
  const defaultModelId = overviewQuery.data?.default_model_id ?? "";
  const activeModelId = selectedModelId || defaultModelId;

  const labelsQuery = useQuery({
    queryKey: ["admin-labels", activeModelId],
    queryFn: () => getAdminLabels(activeModelId),
    enabled: Boolean(activeModelId),
  });
  const rulesQuery = useQuery({ queryKey: ["admin-clinical-flags"], queryFn: getAdminClinicalFlags });

  // Mutations
  const defaultModelMutation = useMutation({
    mutationFn: updateDefaultModel,
    onSuccess: async (payload) => {
      toast.success(payload.message);
      await queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["system-info"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể đổi model mặc định.");
    },
  });

  const labelsMutation = useMutation({
    mutationFn: (classNames: string[]) => updateAdminLabels(activeModelId, classNames),
    onSuccess: async (payload) => {
      toast.success(payload.message);
      await queryClient.invalidateQueries({ queryKey: ["admin-labels", activeModelId] });
      await queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["system-info"] });
      setLabelDraft(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể lưu labels.");
    },
  });

  const rulesMutation = useMutation({
    mutationFn: updateAdminClinicalFlags,
    onSuccess: async () => {
      toast.success("Đã cập nhật clinical flags.");
      await queryClient.invalidateQueries({ queryKey: ["admin-clinical-flags"] });
      await queryClient.invalidateQueries({ queryKey: ["system-info"] });
      setRulesDraft(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể lưu clinical flags.");
    },
  });

  const models = useMemo(() => overviewQuery.data?.models ?? [], [overviewQuery.data?.models]);
  const labelValues = labelDraft ?? labelsQuery.data?.class_names ?? [];
  const rules = rulesDraft ?? rulesQuery.data?.rules ?? [];

  // Access denied
  if (user?.role !== "admin") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#000000] px-4 pt-24">
        <div className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-white/8 bg-white dark:bg-white/[0.04] p-10 text-center backdrop-blur-xl">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
            <Lock className="h-6 w-6 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Truy cập bị từ chối</h1>
          <span className="mt-3 block text-sm text-slate-600 dark:text-slate-400">
            Chỉ tài khoản có quyền <span className="font-semibold text-slate-900 dark:text-white">admin</span> mới được vào khu vực này.
          </span>
        </div>
      </main>
    );
  }

  const enabledFlags = rules.filter((r) => r.enabled).length;
  const criticalFlags = rules.filter((r) => r.severity === "critical" && r.enabled).length;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#000000] pt-24 pb-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">

        {/* ── Header ── */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="block text-[11px] font-bold uppercase tracking-[0.32em] text-slate-600">HEMA-AI · Bảng điều khiển Quản trị</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">Cấu Hình Hệ Thống</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
              void queryClient.invalidateQueries({ queryKey: ["admin-clinical-flags"] });
              void queryClient.invalidateQueries({ queryKey: ["admin-labels", activeModelId] });
              toast.success("Đã làm mới dữ liệu.");
            }}
            className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-200 dark:hover:bg-white/[0.07]"
          >
            <RefreshCw className="h-4 w-4" />
            Làm mới
          </button>
        </div>

        {/* ── Summary bar ── */}
        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Cpu}
            label="Tổng Models"
            value={overviewQuery.isLoading ? "…" : models.length}
            sub="Đã nạp vào hệ thống"
          />
          <StatCard
            icon={Database}
            label="Model Mặc định"
            value={overviewQuery.isLoading ? "…" : models.find((m) => m.model_id === defaultModelId)?.display_name ?? "—"}
          />
          <StatCard
            icon={Activity}
            label="Flags đang bật"
            value={rulesQuery.isLoading ? "…" : `${enabledFlags} / ${rules.length}`}
            sub="Clinical flag rules"
          />
          <StatCard
            icon={ShieldAlert}
            label="Cảnh báo Nghiêm trọng"
            value={rulesQuery.isLoading ? "…" : criticalFlags}
            sub="Mức độ nghiêm trọng cao"
          />
        </div>

        {/* ── Tab bar + content ── */}
        <div className="overflow-hidden rounded-3xl border border-slate-200 dark:border-white/8 bg-white/70 dark:bg-white/[0.025] backdrop-blur-xl">
          {/* Tabs */}
          <div className="flex border-b border-slate-200 dark:border-white/8">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-1 items-center justify-center gap-2.5 px-5 py-4 text-sm font-semibold transition ${
                    isActive
                      ? "border-b-2 border-slate-900 dark:border-white text-slate-900 dark:text-white"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:block">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Panel content */}
          <div className="p-6 sm:p-8">
            {activeTab === "models" && (
              <ModelSection
                models={models}
                defaultModelId={defaultModelId}
                isPending={overviewQuery.isLoading || defaultModelMutation.isPending}
                onChangeDefault={(id) => void defaultModelMutation.mutateAsync(id)}
              />
            )}
            {activeTab === "labels" && (
              <LabelsSection
                models={models}
                activeModelId={activeModelId}
                onSelectModel={(id) => { setSelectedModelId(id); setLabelDraft(null); }}
                labelValues={labelValues}
                onChangeLabel={(index, value) => {
                  const next = [...labelValues];
                  next[index] = value;
                  setLabelDraft(next);
                }}
                onSave={() => void labelsMutation.mutateAsync(labelValues)}
                isSaving={labelsMutation.isPending}
                isLoading={labelsQuery.isLoading}
              />
            )}
            {activeTab === "flags" && (
              <FlagsSection
                rules={rules}
                onChangeRule={(index, rule) => {
                  const next = [...rules];
                  next[index] = rule;
                  setRulesDraft(next);
                }}
                onSave={() => void rulesMutation.mutateAsync(rules)}
                isSaving={rulesMutation.isPending}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
