"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings2, ShieldAlert, Tags, WandSparkles } from "lucide-react";
import { toast } from "sonner";

import {
  getAdminClinicalFlags,
  getAdminLabels,
  getAdminOverview,
  updateAdminClinicalFlags,
  updateAdminLabels,
  updateDefaultModel,
} from "@/lib/api/admin";
import type { ClinicalFlagRule } from "@/types/api";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { SurfaceCard } from "@/components/ui/surface-card";

function SectionTitle({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="inline-flex rounded-2xl border border-white/10 bg-white/8 p-3 text-orange-300">
        {icon}
      </div>
      <div>
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <p className="text-sm leading-7 text-slate-300/72">{description}</p>
      </div>
    </div>
  );
}

export function AdminWorkspace() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [labelDraft, setLabelDraft] = useState<string[] | null>(null);
  const [rulesDraft, setRulesDraft] = useState<ClinicalFlagRule[] | null>(null);

  const overviewQuery = useQuery({
    queryKey: ["admin-overview"],
    queryFn: getAdminOverview,
  });
  const defaultModelId = overviewQuery.data?.default_model_id ?? "";
  const activeModelId = selectedModelId || defaultModelId;

  const labelsQuery = useQuery({
    queryKey: ["admin-labels", activeModelId],
    queryFn: () => getAdminLabels(activeModelId),
    enabled: Boolean(activeModelId),
  });

  const rulesQuery = useQuery({
    queryKey: ["admin-clinical-flags"],
    queryFn: getAdminClinicalFlags,
  });

  const defaultModelMutation = useMutation({
    mutationFn: updateDefaultModel,
    onSuccess: async (payload) => {
      toast.success(payload.message);
      await queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["system-info"] });
      window.dispatchEvent(new Event("workspace:data-changed"));
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
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể lưu clinical flags.");
    },
  });

  const models = useMemo(
    () => overviewQuery.data?.models ?? [],
    [overviewQuery.data?.models],
  );
  const labelValues = labelDraft ?? labelsQuery.data?.class_names ?? [];
  const rules = rulesDraft ?? rulesQuery.data?.rules ?? [];
  const isBusy =
    overviewQuery.isLoading ||
    labelsQuery.isLoading ||
    rulesQuery.isLoading;

  const selectedModelName = useMemo(
    () => models.find((model) => model.model_id === activeModelId)?.display_name ?? "-",
    [activeModelId, models],
  );

  if (user?.role !== "admin") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <SurfaceCard className="w-full max-w-2xl p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-orange-200/72">
            Restricted
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white">
            Khu admin chỉ mở cho tài khoản admin.
          </h1>
          <p className="mt-4 text-sm leading-7 text-slate-300/78">
            Đăng nhập bằng tài khoản có quyền quản trị để thay đổi model mặc định,
            labels và các ngưỡng cảnh báo lâm sàng.
          </p>
        </SurfaceCard>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <SurfaceCard className="p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-orange-200/72">
            Admin Console
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
            Cấu Hình Hệ Thống
          </h1>
        </SurfaceCard>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <SurfaceCard className="p-6">
            <SectionTitle
              icon={<Settings2 className="h-5 w-5" />}
              title="Default model"
              description="Lựa chọn model mặc định cho workspace và lưu trạng thái vào database."
            />

            <div className="space-y-4">
              <select
                value={defaultModelId}
                onChange={(event) => {
                  void defaultModelMutation.mutateAsync(event.target.value);
                }}
                className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white outline-none transition focus:border-orange-300/60"
                disabled={overviewQuery.isLoading || defaultModelMutation.isPending}
              >
                {models.map((model) => (
                  <option key={model.model_id} value={model.model_id}>
                    {model.display_name}
                  </option>
                ))}
              </select>

              <div className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4 text-sm leading-7 text-slate-300/76">
                Model đang dùng: <span className="font-semibold text-white">{models.find((model) => model.model_id === defaultModelId)?.display_name ?? "-"}</span>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-6">
            <SectionTitle
              icon={<ShieldAlert className="h-5 w-5" />}
              title="Clinical flags"
              description="Bật tắt và canh ngưỡng các cảnh báo lâm sàng được hiện ở workspace."
            />

            <div className="space-y-3">
              {rules.map((rule, index) => (
                <div
                  key={rule.key}
                  className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4"
                >
                  <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr_0.8fr]">
                    <input
                      value={rule.title}
                      onChange={(event) => {
                        const next = [...rules];
                        next[index] = { ...rule, title: event.target.value };
                        setRulesDraft(next);
                      }}
                      className="h-11 rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={rule.threshold}
                      onChange={(event) => {
                        const next = [...rules];
                        next[index] = { ...rule, threshold: Number(event.target.value) };
                        setRulesDraft(next);
                      }}
                      className="h-11 rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white"
                    />
                    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(event) => {
                        const next = [...rules];
                        next[index] = { ...rule, enabled: event.target.checked };
                        setRulesDraft(next);
                      }}
                      />
                      Bật rule
                    </label>
                  </div>
                  <textarea
                    value={rule.action}
                    onChange={(event) => {
                      const next = [...rules];
                      next[index] = { ...rule, action: event.target.value };
                      setRulesDraft(next);
                    }}
                    rows={2}
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white"
                  />
                  <p className="mt-2 text-xs uppercase tracking-[0.28em] text-slate-500">
                    {rule.source} / {rule.label} / {rule.field}
                  </p>
                </div>
              ))}

              <Button
                onClick={() => void rulesMutation.mutateAsync(rules)}
                disabled={rulesMutation.isPending || !rules.length}
              >
                <WandSparkles className="mr-2 h-4 w-4" />
                Lưu clinical flags
              </Button>
            </div>
          </SurfaceCard>
        </div>

        <SurfaceCard className="p-6">
          <SectionTitle
            icon={<Tags className="h-5 w-5" />}
            title="Labels theo model"
            description="Chọn model và cập nhật tên lớp để dashboard, report và workspace đọc dữ liệu đúng nghĩa vụ."
          />

          <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
            <div className="space-y-3">
              <select
                value={activeModelId}
                onChange={(event) => {
                  setSelectedModelId(event.target.value);
                  setLabelDraft(null);
                }}
                className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white outline-none transition focus:border-orange-300/60"
              >
                {models.map((model) => (
                  <option key={model.model_id} value={model.model_id}>
                    {model.display_name}
                  </option>
                ))}
              </select>

              <div className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4 text-sm leading-7 text-slate-300/76">
                Đang sửa labels cho <span className="font-semibold text-white">{selectedModelName}</span>.
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {labelValues.map((value, index) => (
                <label
                    key={`${activeModelId}-${index}`}
                  className="block rounded-[22px] border border-white/8 bg-white/[0.04] p-4"
                >
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.28em] text-slate-400">
                    Lớp {index + 1}
                  </span>
                  <input
                    value={value}
                    onChange={(event) => {
                      const next = [...labelValues];
                      next[index] = event.target.value;
                      setLabelDraft(next);
                    }}
                    className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <Button
              onClick={() => void labelsMutation.mutateAsync(labelValues)}
              disabled={!activeModelId || labelsMutation.isPending || isBusy}
            >
              Lưu labels cho model này
            </Button>
          </div>
        </SurfaceCard>
      </div>
    </main>
  );
}
