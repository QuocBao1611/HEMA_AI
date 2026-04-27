"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import { useForm } from "react-hook-form";
import {
  ArrowRightLeft,
  CheckCircle2,
  Eye,
  GitCompareArrows,
  LoaderCircle,
  Radar,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SurfaceCard } from "@/components/ui/surface-card";
import { useSystemInfo } from "@/hooks/use-system-info";
import { compareModels } from "@/lib/api/compare";
import { analysisDefaults } from "@/lib/constants/analysis";
import { formatCount, formatPercent } from "@/lib/utils/format";
import { validateImageFile } from "@/lib/validators/upload";
import type { CompareModelsResponse } from "@/types/api";

type CompareFormValues = {
  confidence_threshold: number;
  padding_ratio: number;
  min_component_area: number;
  max_detections: number;
};

function HighlightCard({
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
      <p className="mt-3 text-lg font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm leading-7 text-slate-300/76">{hint}</p>
    </article>
  );
}

export function CompareWorkspace() {
  const { data: systemInfo, isLoading, isError, error } = useSystemInfo();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedModelIds, setSelectedModelIds] = useState<string[] | null>(null);
  const [result, setResult] = useState<CompareModelsResponse | null>(null);

  const form = useForm<CompareFormValues>({
    defaultValues: {
      confidence_threshold: analysisDefaults.confidence_threshold,
      padding_ratio: analysisDefaults.padding_ratio,
      min_component_area: analysisDefaults.min_component_area,
      max_detections: analysisDefaults.max_detections,
    },
  });

  const models = useMemo(
    () => systemInfo?.available_models ?? [],
    [systemInfo?.available_models],
  );

  const defaultSelectedModelIds = useMemo(() => {
    const defaultId = systemInfo?.default_model_id;
    const seedIds = models
      .map((model) => model.model_id)
      .filter((modelId, index) => modelId === defaultId || index < 2);
    return [...new Set(seedIds)].slice(0, Math.min(models.length, 2));
  }, [models, systemInfo?.default_model_id]);

  const effectiveSelectedModelIds = selectedModelIds ?? defaultSelectedModelIds;

  const compareMutation = useMutation({
    mutationFn: compareModels,
    onSuccess: (data) => {
      setResult(data);
      window.dispatchEvent(
        new CustomEvent("workspace:data-changed", {
          detail: {
            source: "compare",
            result: data,
          },
        }),
      );
      toast.success("Da hoan tat so sanh model.");
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Khong the chay so sanh model.",
      );
    },
  });

  const toggleModel = (modelId: string) => {
    setSelectedModelIds((current) => {
      const base = current ?? defaultSelectedModelIds;

      if (base.includes(modelId)) {
        return base.filter((id) => id !== modelId);
      }
      return [...base, modelId];
    });
  };

  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    const validationError = validateImageFile(file);

    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSelectedFile(file);
    setResult(null);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(URL.createObjectURL(file));
    toast.success(`Da chon anh so sanh: ${file.name}`);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    multiple: false,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp"],
    },
  });

  const clearFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(null);
    setPreviewUrl(null);
    setResult(null);
  };

  const statusMessage = useMemo(() => {
    if (!selectedFile) {
      return "Chon anh va it nhat 2 model de bat dau so sanh.";
    }

    if (effectiveSelectedModelIds.length < 2) {
      return "Can chon them model de du dieu kien so sanh.";
    }

    return `San sang so sanh voi ${effectiveSelectedModelIds.length} model.`;
  }, [effectiveSelectedModelIds.length, selectedFile]);

  const runCompare = async () => {
    const validationError = validateImageFile(selectedFile);
    if (validationError || !selectedFile) {
      toast.error(validationError || "Vui long chon anh hop le.");
      return;
    }

    if (effectiveSelectedModelIds.length < 2) {
      toast.error("Hay chon it nhat 2 model de so sanh.");
      return;
    }

    const values = form.getValues();
    await compareMutation.mutateAsync({
      file: selectedFile,
      model_ids: effectiveSelectedModelIds,
      confidence_threshold: values.confidence_threshold,
      padding_ratio: values.padding_ratio,
      min_component_area: values.min_component_area,
      max_detections: values.max_detections,
    });
  };

  return (
    <div className="space-y-6">
      <SurfaceCard className="p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-orange-200/72">
              Compare Module
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
              Flow so sanh model da duoc migrate vao app moi.
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate-300/78 sm:text-base">
              Chon mot anh smear, chon nhieu model, giu cung bo crop va doi chieu
              ket qua tren mot workspace co typed API thay vi script DOM cu.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-orange-300/20 bg-orange-400/10 px-4 py-2 text-sm text-orange-100">
            <GitCompareArrows className="h-4 w-4" />
            Compare live
          </div>
        </div>
      </SurfaceCard>

      <section className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <SurfaceCard className="p-6">
          <div className="mb-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">
              Setup
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Dieu khien phien so sanh
            </h2>
          </div>

          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-200">Nguong tin cay</span>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white outline-none transition focus:border-orange-300/60"
                {...form.register("confidence_threshold", { valueAsNumber: true })}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-200">Padding ratio</span>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white outline-none transition focus:border-orange-300/60"
                {...form.register("padding_ratio", { valueAsNumber: true })}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-200">Min component area</span>
              <input
                type="number"
                min="16"
                max="200000"
                className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white outline-none transition focus:border-orange-300/60"
                {...form.register("min_component_area", { valueAsNumber: true })}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-200">Max detections</span>
              <input
                type="number"
                min="1"
                max="2000"
                className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white outline-none transition focus:border-orange-300/60"
                {...form.register("max_detections", { valueAsNumber: true })}
              />
            </label>
          </div>

          <div className="mt-6 rounded-[24px] border border-white/8 bg-white/[0.04] p-4">
            <div className="mb-3 flex items-center gap-2 text-slate-100">
              <Radar className="h-4 w-4 text-orange-300" />
              <span className="text-sm font-semibold">Status</span>
            </div>
            <p className="text-sm leading-7 text-slate-300/76">{statusMessage}</p>
          </div>

          <Button
            className="mt-6 w-full"
            disabled={
              !selectedFile ||
              effectiveSelectedModelIds.length < 2 ||
              compareMutation.isPending
            }
            onClick={() => void runCompare()}
          >
            {compareMutation.isPending ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ArrowRightLeft className="mr-2 h-4 w-4" />
            )}
            Chay so sanh
          </Button>
        </SurfaceCard>

        <div className="space-y-6">
          <SurfaceCard className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="inline-flex rounded-2xl border border-white/10 bg-white/8 p-3 text-orange-300">
                <UploadCloud className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Anh dau vao</h2>
                <p className="text-sm text-slate-300/72">
                  Preview anh duoc dung cho toan bo model.
                </p>
              </div>
            </div>

            <div
              {...getRootProps()}
              className={`relative rounded-[28px] border border-dashed p-6 transition ${
                isDragActive
                  ? "border-orange-300/60 bg-orange-400/10"
                  : "border-white/12 bg-slate-950/36 hover:border-white/20 hover:bg-white/[0.04]"
              }`}
            >
              <input {...getInputProps()} />

              {previewUrl ? (
                <div className="relative overflow-hidden rounded-[24px] border border-white/10">
                  <div className="relative h-[320px] w-full">
                    <Image
                      src={previewUrl}
                      alt="Preview compare input"
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      clearFile();
                    }}
                    className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/14 bg-slate-950/70 text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
                  <div className="mb-4 inline-flex rounded-3xl border border-white/10 bg-white/8 p-4 text-orange-300">
                    <Eye className="h-7 w-7" />
                  </div>
                  <h3 className="text-xl font-semibold text-white">
                    Chon anh smear de doi chieu
                  </h3>
                  <p className="mt-3 max-w-md text-sm leading-7 text-slate-300/78">
                    Tat ca model se dung chung mot bo crop va vung phat hien de so
                    sanh cong bang.
                  </p>
                </div>
              )}
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">
                  Model Selection
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  Chon it nhat 2 model
                </h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-slate-200">
                {effectiveSelectedModelIds.length} da chon
              </div>
            </div>

            {isLoading ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="h-24 animate-pulse rounded-[22px] bg-white/6" />
                <div className="h-24 animate-pulse rounded-[22px] bg-white/6" />
                <div className="h-24 animate-pulse rounded-[22px] bg-white/6" />
              </div>
            ) : isError ? (
              <div className="rounded-[22px] border border-red-400/20 bg-red-500/10 p-4 text-sm leading-7 text-red-100">
                {error instanceof Error
                  ? error.message
                  : "Khong the tai danh sach model de so sanh."}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {models.map((model) => {
                  const active = effectiveSelectedModelIds.includes(model.model_id);
                  return (
                    <button
                      key={model.model_id}
                      type="button"
                      onClick={() => toggleModel(model.model_id)}
                      className={`rounded-[22px] border p-4 text-left transition ${
                        active
                          ? "border-orange-300/40 bg-orange-400/10"
                          : "border-white/8 bg-white/[0.03] hover:border-white/14 hover:bg-white/[0.06]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">
                            {model.display_name}
                          </p>
                          <p className="mt-1 text-sm text-slate-400">
                            {model.preprocessing}
                          </p>
                        </div>
                        {active ? (
                          <CheckCircle2 className="h-5 w-5 text-orange-200" />
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </SurfaceCard>
        </div>
      </section>

      {result ? (
        <section className="space-y-6">
          <SurfaceCard className="p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-orange-200/72">
                  Compare Summary
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Ket qua doi chieu tren cung mot bo crop
                </h2>
                <p className="mt-2 text-sm leading-7 text-slate-300/76">
                  {result.note}
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-slate-200">
                {result.comparison_rows.length} model
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <HighlightCard
                label="Tin cay cao nhat"
                value={result.best_by_average_confidence?.display_name ?? "Chua co"}
                hint={
                  result.best_by_average_confidence
                    ? formatPercent(result.best_by_average_confidence.average_confidence)
                    : "-"
                }
              />
              <HighlightCard
                label="Dem nhieu nhat"
                value={result.best_by_detected_cells?.display_name ?? "Chua co"}
                hint={
                  result.best_by_detected_cells
                    ? `${formatCount(result.best_by_detected_cells.detected_cell_count)} te bao`
                    : "-"
                }
              />
              <HighlightCard
                label="Shared detection"
                value={`${formatCount(result.shared_detection?.box_count ?? 0)} vung cat`}
                hint={
                  result.shared_detection?.fallback_used
                    ? "Da dung co che du phong"
                    : "Phat hien chuan"
                }
              />
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-6">
            <div className="mb-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">
                Detail Table
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                So sanh model tren cung anh
              </h2>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-white/8">
              <div className="grid grid-cols-[minmax(0,1.5fr)_120px_140px_150px_140px] gap-4 border-b border-white/8 bg-white/[0.04] px-4 py-3 text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
                <span>Model</span>
                <span>Phat hien</span>
                <span>Tin cay TB</span>
                <span>Nhan troi</span>
                <span>Nhom troi</span>
              </div>

              <div className="divide-y divide-white/8 bg-slate-950/28">
                {result.comparison_rows.map((row) => (
                  <div
                    key={row.model_id}
                    className="grid grid-cols-[minmax(0,1.5fr)_120px_140px_150px_140px] gap-4 px-4 py-4 text-sm text-slate-200"
                  >
                    <div>
                      <div className="font-semibold text-white">{row.display_name}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {row.model_id} • {row.preprocessing}
                      </div>
                    </div>
                    <div>{formatCount(row.detected_cell_count)}</div>
                    <div>{formatPercent(row.average_confidence)}</div>
                    <div>{row.dominant_label || "-"}</div>
                    <div>{row.top_group_label || "-"}</div>
                  </div>
                ))}
              </div>
            </div>
          </SurfaceCard>
        </section>
      ) : null}
    </div>
  );
}
