"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import { useForm } from "react-hook-form";
import {
  CheckCircle2,
  GitCompareArrows,
  LoaderCircle,
  Radar,
  UploadCloud,
  X,
  Trophy,
  Target,
  Layers,
  Sparkles,
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
import { DetectionOverlay } from "@/components/analysis/detection-overlay";

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
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon?: React.ReactNode;
}) {
  return (
    <article className="group relative overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] p-6 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_8px_32px_-8px_rgba(255,150,50,0.15)] hover:border-orange-500/30">
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-orange-500/10 blur-[40px] transition-all duration-500 group-hover:bg-orange-500/20" />
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400 group-hover:text-orange-200/80 transition-colors">
          {label}
        </p>
        {icon && <div className="text-orange-400/70">{icon}</div>}
      </div>
      <p className="mt-4 text-2xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">{value}</p>
      <p className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-400">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
        {hint}
      </p>
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
      toast.success("Đã hoàn tất so sánh model.");
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Không thể chạy so sánh model.",
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
    toast.success(`Đã chọn ảnh so sánh: ${file.name}`);
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
      return "Chọn ảnh và ít nhất 2 model để bắt đầu so sánh.";
    }

    if (effectiveSelectedModelIds.length < 2) {
      return "Cần chọn thêm model để đủ điều kiện so sánh.";
    }

    return `Sẵn sàng so sánh với ${effectiveSelectedModelIds.length} model.`;
  }, [effectiveSelectedModelIds.length, selectedFile]);

  const runCompare = async () => {
    const validationError = validateImageFile(selectedFile);
    if (validationError || !selectedFile) {
      toast.error(validationError || "Vui lòng chọn ảnh hợp lệ.");
      return;
    }

    if (effectiveSelectedModelIds.length < 2) {
      toast.error("Hãy chọn ít nhất 2 model để so sánh.");
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
        <div className="flex flex-wrap items-start justify-between gap-4 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 mb-4 shadow-[0_0_15px_rgba(249,115,22,0.15)]">
              <Sparkles className="h-3.5 w-3.5 text-orange-400" />
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-300">
                AI Compare Module
              </p>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-orange-100 to-orange-300 sm:text-5xl drop-shadow-sm">
              Flow so sánh model AI
            </h1>
            <p className="mt-5 text-base leading-8 text-slate-300 max-w-2xl">
              Chọn một ảnh smear và nhiều model để đối chiếu kết quả.
              Hệ thống sử dụng chung một bộ crop và vùng phát hiện để đảm bảo tính công bằng tuyệt đối.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-5 py-2.5 text-sm font-medium text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.1)] backdrop-blur-md">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Workspace Active
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
              Điều khiển phiên so sánh
            </h2>
          </div>

          <div className="space-y-4">
            <label className="group block space-y-2">
              <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Ngưỡng tin cậy</span>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white shadow-inner outline-none transition-all duration-300 hover:border-white/20 focus:border-orange-400 focus:bg-orange-400/5 focus:ring-4 focus:ring-orange-400/10"
                {...form.register("confidence_threshold", { valueAsNumber: true })}
              />
            </label>

            {/* Ẩn tỷ lệ viền đệm để tinh giản UI, giá trị mặc định được tự động đồng bộ */}
            <input
              type="hidden"
              {...form.register("padding_ratio", { valueAsNumber: true })}
            />

            <label className="group block space-y-2">
              <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Min component area</span>
              <input
                type="number"
                min="16"
                max="200000"
                className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white shadow-inner outline-none transition-all duration-300 hover:border-white/20 focus:border-orange-400 focus:bg-orange-400/5 focus:ring-4 focus:ring-orange-400/10"
                {...form.register("min_component_area", { valueAsNumber: true })}
              />
            </label>

            <label className="group block space-y-2">
              <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Max detections</span>
              <input
                type="number"
                min="1"
                max="2000"
                className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white shadow-inner outline-none transition-all duration-300 hover:border-white/20 focus:border-orange-400 focus:bg-orange-400/5 focus:ring-4 focus:ring-orange-400/10"
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
            className="mt-6 w-full h-14 rounded-2xl text-base font-bold bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-400 hover:to-rose-400 shadow-[0_0_30px_rgba(249,115,22,0.3)] transition-all duration-300 hover:shadow-[0_0_40px_rgba(249,115,22,0.5)] hover:-translate-y-1"
            disabled={
              !selectedFile ||
              effectiveSelectedModelIds.length < 2 ||
              compareMutation.isPending
            }
            onClick={() => void runCompare()}
          >
            {compareMutation.isPending ? (
              <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <GitCompareArrows className="mr-2 h-5 w-5" />
            )}
            Chạy so sánh
          </Button>
        </SurfaceCard>

        <div className="space-y-6">
          <SurfaceCard className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="inline-flex rounded-2xl border border-white/10 bg-white/8 p-3 text-orange-300">
                <UploadCloud className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Ảnh đầu vào</h2>
                <p className="text-sm text-slate-300/72">
                  Preview ảnh được dùng cho toàn bộ model.
                </p>
              </div>
            </div>

            <div
              {...getRootProps()}
              className={`relative rounded-[28px] border-2 border-dashed p-6 transition-all duration-300 group cursor-pointer ${
                isDragActive
                  ? "border-orange-400 bg-orange-400/10 scale-[1.02] shadow-[0_0_30px_rgba(249,115,22,0.15)]"
                  : "border-white/10 bg-white/[0.02] hover:border-orange-500/50 hover:bg-orange-500/5 hover:shadow-[0_0_20px_rgba(249,115,22,0.1)]"
              }`}
            >
              <input {...getInputProps()} />

              {previewUrl ? (
                <div className="relative overflow-hidden rounded-[24px] border border-white/10 group/preview shadow-2xl">
                  <div className="relative h-[320px] w-full bg-black/50 overflow-hidden">
                    {result?.shared_detection?.boxes ? (
                      <DetectionOverlay
                        imageSrc={previewUrl}
                        detections={result.shared_detection.boxes.map((b, i) => ({
                          region_id: i,
                          box: { x: b.x1, y: b.y1, width: b.x2 - b.x1, height: b.y2 - b.y1 },
                          label: "SHARED",
                          confidence: 1,
                        }))}
                      />
                    ) : (
                      <Image
                        src={previewUrl}
                        alt="Preview compare input"
                        fill
                        unoptimized
                        className="object-contain transition-transform duration-700 group-hover/preview:scale-105"
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      clearFile();
                    }}
                    className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur-md transition-all hover:bg-red-500 hover:border-red-500 hover:scale-110"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <div className="absolute inset-0 pointer-events-none rounded-[24px] ring-1 ring-inset ring-white/10" />
                </div>
              ) : (
                <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
                  <div className="mb-6 inline-flex rounded-full border-4 border-orange-500/10 bg-orange-500/10 p-5 text-orange-400 transition-transform duration-500 group-hover:scale-110 group-hover:bg-orange-500/20 group-hover:border-orange-500/20">
                    <UploadCloud className="h-10 w-10" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">
                    Kéo thả hoặc click để chọn ảnh
                  </h3>
                  <p className="max-w-md text-sm text-slate-400">
                    Tất cả model sẽ dùng chung một bộ crop để so sánh công bằng. 
                    Hỗ trợ PNG, JPG, WEBP.
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
                  Chọn ít nhất 2 model
                </h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-slate-200">
                {effectiveSelectedModelIds.length} đã chọn
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
                  : "Không thể tải danh sách model để so sánh."}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {models.map((model) => {
                  const active = effectiveSelectedModelIds.includes(model.model_id);
                  return (
                    <button
                      key={model.model_id}
                      type="button"
                      onClick={() => toggleModel(model.model_id)}
                      className={`group relative overflow-hidden rounded-[24px] border p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                        active
                          ? "border-orange-500/50 bg-gradient-to-br from-orange-500/10 to-transparent shadow-[0_0_20px_rgba(249,115,22,0.1)]"
                          : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                      }`}
                    >
                      {active && <div className="absolute inset-0 bg-gradient-to-r from-orange-500/0 via-orange-500/5 to-orange-500/0" />}
                      <div className="relative flex items-center justify-between gap-3 z-10">
                        <div>
                          <p className={`font-bold transition-colors ${active ? "text-orange-100" : "text-slate-200 group-hover:text-white"}`}>
                            {model.display_name}
                          </p>
                          <p className={`mt-1.5 text-xs font-medium tracking-wide uppercase transition-colors ${active ? "text-orange-300/70" : "text-slate-500"}`}>
                            {model.preprocessing}
                          </p>
                        </div>
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${active ? "bg-orange-500 border-orange-400 text-white shadow-[0_0_15px_rgba(249,115,22,0.5)]" : "border-white/10 bg-black/20 text-transparent group-hover:border-white/20"}`}>
                          <CheckCircle2 className="h-5 w-5" />
                        </div>
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
                  Kết quả đối chiếu trên cùng một bộ crop
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
                label="Tin cậy cao nhất"
                icon={<Trophy className="h-5 w-5" />}
                value={result.best_by_average_confidence?.display_name ?? "Chưa có"}
                hint={
                  result.best_by_average_confidence
                    ? `Độ tin cậy: ${formatPercent(result.best_by_average_confidence.average_confidence)}`
                    : "-"
                }
              />
              <HighlightCard
                label="Đếm nhiều nhất"
                icon={<Target className="h-5 w-5" />}
                value={result.best_by_detected_cells?.display_name ?? "Chưa có"}
                hint={
                  result.best_by_detected_cells
                    ? `Phát hiện: ${formatCount(result.best_by_detected_cells.detected_cell_count)} tế bào`
                    : "-"
                }
              />
              <HighlightCard
                label="Shared detection"
                icon={<Layers className="h-5 w-5" />}
                value={`${formatCount(result.shared_detection?.box_count ?? 0)} vùng cắt`}
                hint={
                  result.shared_detection?.fallback_used
                    ? "Đã dùng cơ chế dự phòng"
                    : "Phát hiện chuẩn"
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
                So sánh model trên cùng ảnh
              </h2>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-white/8">
              <div className="grid grid-cols-[minmax(0,1.5fr)_120px_140px_150px_140px] gap-4 border-b border-white/8 bg-white/[0.04] px-4 py-3 text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
                <span>Model</span>
                <span>Phát hiện</span>
                <span>Tin cậy TB</span>
                <span>Nhãn trội</span>
                <span>Nhóm trội</span>
              </div>

              <div className="divide-y divide-white/5 bg-black/20">
                {result.comparison_rows.map((row) => {
                  const isBestConfidence = row.model_id === result.best_by_average_confidence?.model_id;
                  
                  return (
                    <div
                      key={row.model_id}
                      className="group grid grid-cols-[minmax(0,1.5fr)_120px_140px_150px_140px] gap-4 px-4 py-5 text-sm transition-colors hover:bg-white/[0.03]"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${isBestConfidence ? 'text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-rose-400 drop-shadow-sm' : 'text-slate-100'}`}>
                            {row.display_name}
                          </span>
                          {isBestConfidence && <Trophy className="h-3 w-3 text-orange-400" />}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 text-xs font-medium text-slate-500">
                          <span className="truncate max-w-[120px]" title={row.model_id}>{row.model_id}</span>
                          <span className="h-1 w-1 rounded-full bg-slate-700" />
                          <span className="uppercase tracking-wider">{row.preprocessing}</span>
                        </div>
                      </div>
                      <div className="flex items-center font-medium text-slate-300">
                        <div className="rounded-full bg-white/5 px-2.5 py-1 border border-white/10">
                          {formatCount(row.detected_cell_count)}
                        </div>
                      </div>
                      <div className="flex items-center">
                        <span className={`font-mono font-medium ${isBestConfidence ? 'text-orange-400' : 'text-slate-300'}`}>
                          {formatPercent(row.average_confidence)}
                        </span>
                      </div>
                      <div className="flex items-center font-medium text-slate-200">
                        {row.dominant_label || "-"}
                      </div>
                      <div className="flex items-center">
                        <span className="inline-flex rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-xs font-semibold text-indigo-300">
                          {row.top_group_label || "-"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </SurfaceCard>
        </section>
      ) : null}
    </div>
  );
}
