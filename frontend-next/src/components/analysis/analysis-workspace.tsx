"use client";

import Image from "next/image";
import Link from "next/link";
import type { ElementType } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { useDropzone } from "react-dropzone";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  Cpu,
  Database,
  Download,
  FileImage,
  FlaskConical,
  LoaderCircle,
  Settings,
  Microscope,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { analyzeImage, predictImage } from "@/lib/api/analysis";
import { analysisDefaults, type ResultTabKey } from "@/lib/constants/analysis";
import { formatCount, formatPercent } from "@/lib/utils/format";
import { validateImageFile } from "@/lib/validators/upload";
import { useSystemInfo } from "@/hooks/use-system-info";
import type { AnalyzeResponse, CountRow, PredictResponse } from "@/types/api";
import { Button } from "@/components/ui/button";
import { SurfaceCard } from "@/components/ui/surface-card";
import { ClinicalFlags } from "@/components/analysis/clinical-flags";
import { DetectionOverlay } from "@/components/analysis/detection-overlay";
import { ResultTable } from "@/components/analysis/result-table";
import { exportAnalysisReport } from "@/lib/reports/export-analysis-report";

type AnalysisFormValues = {
  model_id: string;
  confidence_threshold: number;
  max_detections: number;
  padding_ratio: number;
  min_component_area: number;
};

type AnalysisMode = "predict" | "analyze";
type AnalysisResult = PredictResponse | AnalyzeResponse;

function getRowsForTab(result: AnalyzeResponse, tab: ResultTabKey): CountRow[] {
  if (tab === "groups") {
    return result.grouped_counts ?? [];
  }

  if (tab === "wbc") {
    return result.wbc_differential ?? [];
  }

  return result.estimated_counts ?? [];
}

function MetricChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/8 bg-white/[0.04] px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: ElementType;
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <article className="group relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.055] p-5 backdrop-blur-md transition hover:border-red-400/35">
      <div className="absolute right-0 top-0 h-24 w-24 bg-red-500/10 blur-3xl transition group-hover:bg-red-500/18" />
      <div className="relative">
        <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/8 text-zinc-300 transition group-hover:text-red-200">
          <Icon className="h-5 w-5" />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-white">
          {label}
        </p>
        <p className="mt-1 text-sm leading-6 text-zinc-400">{value}</p>
        {loading ? (
          <div className="mt-5 h-1 overflow-hidden rounded-full bg-white/8">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-red-500/70" />
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function AnalysisWorkspace() {
  const { data: systemInfo, isLoading: isSystemLoading, isError, error } = useSystemInfo();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTabKey>("counts");

  const form = useForm<AnalysisFormValues>({
    defaultValues: {
      model_id: "",
      confidence_threshold: analysisDefaults.confidence_threshold,
      max_detections: analysisDefaults.max_detections,
      padding_ratio: analysisDefaults.padding_ratio,
      min_component_area: analysisDefaults.min_component_area,
    },
  });

  const predictMutation = useMutation({
    mutationFn: predictImage,
    onSuccess: (data) => {
      setResult(data);
      toast.success("Đã hoàn tất dự đoán nhanh.");
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Không thể dự đoán ảnh này.",
      );
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: analyzeImage,
    onSuccess: (data) => {
      setResult(data);
      setActiveTab("counts");
      toast.success("Đã hoàn tất phân tích slide.");
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Không thể phân tích ảnh này.",
      );
    },
  });

  const isSubmitting = predictMutation.isPending || analyzeMutation.isPending;

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
    toast.success(`Đã chọn ảnh: ${file.name}`);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    multiple: false,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp"],
    },
  });

  const removeFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(null);
    setPreviewUrl(null);
    setResult(null);
  };

  const availableModels = useMemo(
    () => systemInfo?.available_models ?? [],
    [systemInfo?.available_models],
  );
  const clinicalFlagRules = useMemo(
    () => systemInfo?.clinical_flag_rules ?? [],
    [systemInfo?.clinical_flag_rules],
  );
  const selectedModel = useWatch({
    control: form.control,
    name: "model_id",
  });

  useEffect(() => {
    if (selectedModel || !availableModels.length) {
      return;
    }

    form.setValue(
      "model_id",
      systemInfo?.default_model_id ?? availableModels[0].model_id,
    );
  }, [availableModels, form, selectedModel, systemInfo?.default_model_id]);

  const currentModelName = useMemo(() => {
    return (
      availableModels.find((model) => model.model_id === selectedModel)?.display_name ??
      systemInfo?.default_model_name ??
      "-"
    );
  }, [availableModels, selectedModel, systemInfo?.default_model_name]);

  const submit = async (mode: AnalysisMode) => {
    const validationError = validateImageFile(selectedFile);
    if (validationError || !selectedFile) {
      toast.error(validationError || "Vui lòng chọn ảnh hợp lệ.");
      return;
    }

    const values = form.getValues();
    const payload = {
      ...values,
      file: selectedFile,
    };

    if (mode === "predict") {
      await predictMutation.mutateAsync(payload);
      return;
    }

    await analyzeMutation.mutateAsync(payload);
  };

  return (
    <div className="bg-[linear-gradient(180deg,rgba(35,4,7,0.4),rgba(8,1,2,0.95)_34%,#070101_100%)]">
      <section className="relative min-h-[100svh] overflow-hidden border-b border-white/8">
        <Image
          src="/images/hero-doctor-lab.png"
          alt="Bac si huyet hoc trong phong xet nghiem hien dai"
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-95"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.88),rgba(0,0,0,0.48)_46%,rgba(0,0,0,0.12)),linear-gradient(180deg,rgba(0,0,0,0.04),rgba(7,1,2,0.56)_72%,#120304)]" />

        <div className="relative flex min-h-[100svh] items-center px-6 py-20 sm:px-10 lg:px-14">
          <div className="max-w-2xl">
            <div className="mb-5 flex items-center gap-3 text-sm font-bold uppercase tracking-[0.18em] text-red-200">
              <span className="h-px w-9 bg-red-400/70" />
              AI Huyết Học
            </div>
            <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              Hệ thống Phân tích Huyết học AI thế hệ mới
            </h1>


            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#analysis-workbench"
                className="inline-flex h-11 items-center justify-center rounded-md bg-red-600 px-6 text-sm font-semibold text-white shadow-[0_18px_38px_rgba(190,18,60,0.32)] transition hover:bg-red-500"
              >
                Bắt đầu ngay
              </a>
              <Link
                href="/compare"
                className="inline-flex h-11 items-center justify-center rounded-md border border-white/22 bg-black/18 px-6 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/10"
              >
                So sánh mô hình
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-12 px-6 py-12 sm:px-10 lg:px-14">
        <section>
          <h2 className="mb-6 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.16em] text-zinc-200">
            <ArrowRight className="h-4 w-4 text-red-300" />
            Ca phân tích
          </h2>
          {isError ? (
            <div className="rounded-lg border border-red-400/20 bg-red-500/10 p-4 text-sm leading-7 text-red-100">
              {error instanceof Error
                ? error.message
                : "Không thể tải thông tin hệ thống từ backend."}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatusCard
                icon={Cpu}
                label="Mô hình sẵn sàng"
                value={isSystemLoading ? "Đang tải" : String(availableModels.length)}
                loading={isSystemLoading}
              />
              <StatusCard
                icon={Settings}
                label="Mặc định"
                value={isSystemLoading ? "Đang tải" : currentModelName}
                loading={isSystemLoading}
              />
              <StatusCard
                icon={Database}
                label="Cơ sở dữ liệu"
                value={
                  isSystemLoading
                    ? "Đang tải"
                    : systemInfo?.database?.ready
                      ? "Đã kết nối"
                      : "Chưa sẵn sàng"
                }
                loading={isSystemLoading}
              />
              <StatusCard
                icon={Activity}
                label="Chế độ"
                value="Đếm tiêu bản, Detect -> Crop -> Classify"
              />
            </div>
          )}
        </section>

        <section
          id="analysis-workbench"
          className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_420px]"
        >
          <SurfaceCard className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="inline-flex rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-red-100">
                <UploadCloud className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Nạp ảnh smear</h2>
                <p className="text-sm text-slate-300/72">
                  JPG, PNG, TIFF. Giới hạn 10MB.
                </p>
              </div>
            </div>

            <div
              {...getRootProps()}
              className={`relative rounded-[28px] border border-dashed p-6 transition ${isDragActive
                  ? "border-red-300/70 bg-red-500/10"
                  : "border-white/12 bg-slate-950/36 hover:border-red-200/35 hover:bg-white/[0.04]"
                }`}
            >
              <input {...getInputProps()} />

              {previewUrl ? (
                <div className="relative mx-auto max-w-[620px] overflow-hidden rounded-[24px] border border-white/10 bg-slate-950/50">
                  <div className="relative aspect-square w-full p-2">
                    <Image
                      src={previewUrl}
                      alt="Preview smear"
                      fill
                      unoptimized
                      className="object-cover p-2"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeFile();
                    }}
                    className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/14 bg-slate-950/70 text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
                  <div className="mb-4 inline-flex rounded-3xl border border-red-400/20 bg-red-500/10 p-4 text-red-100">
                    <FileImage className="h-7 w-7" />
                  </div>
                  <h3 className="text-xl font-semibold text-white">
                    Kéo thả ảnh vào đây hoặc nhấn để chọn
                  </h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
                    Chọn ảnh để mở khóa phân tích slide và dự đoán nhanh.
                  </p>
                </div>
              )}
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="inline-flex rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-red-100">
                <FlaskConical className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Thông số phân tích</h2>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Model AI</span>
                <select
                  className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white outline-none transition focus:border-red-300/70"
                  {...form.register("model_id")}
                >
                  {availableModels.map((model) => (
                    <option key={model.model_id} value={model.model_id}>
                      {model.display_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Ngưỡng tin cậy</span>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white outline-none transition focus:border-red-300/70"
                  {...form.register("confidence_threshold", { valueAsNumber: true })}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Giới hạn phát hiện</span>
                <input
                  type="number"
                  min="1"
                  max="2000"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white outline-none transition focus:border-red-300/70"
                  {...form.register("max_detections", { valueAsNumber: true })}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Padding ratio</span>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white outline-none transition focus:border-red-300/70"
                  {...form.register("padding_ratio", { valueAsNumber: true })}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Min component area</span>
                <input
                  type="number"
                  min="16"
                  max="200000"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white outline-none transition focus:border-red-300/70"
                  {...form.register("min_component_area", { valueAsNumber: true })}
                />
              </label>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Button
                onClick={() => void submit("analyze")}
                disabled={isSubmitting || !selectedFile}
                className="w-full"
              >
                {analyzeMutation.isPending ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Microscope className="mr-2 h-4 w-4" />
                )}
                Phân tích slide
              </Button>

              <Button
                variant="secondary"
                onClick={() => void submit("predict")}
                disabled={isSubmitting || !selectedFile}
                className="w-full"
              >
                {predictMutation.isPending ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <BrainCircuit className="mr-2 h-4 w-4" />
                )}
                Dự đoán nhanh
              </Button>
            </div>
            {!selectedFile ? (
              <p className="mt-3 text-center text-xs font-medium text-slate-400">
                Chọn ảnh để bật các nút phân tích.
              </p>
            ) : null}

            <div className="hidden">
              Đang chạy với <span className="font-semibold text-white">{currentModelName}</span>.
            </div>
          </SurfaceCard>
        </section>

        {result ? (
          <section className="space-y-6">
            <SurfaceCard className="p-6">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-red-200/72">
                    Bảng kết quả
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">
                    {result.mode === "predict"
                      ? `Dự đoán nhanh: ${result.label}`
                      : `${formatCount(result.classified_cell_count)} tế bào được tính`}
                  </h2>
                </div>
                <div className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm text-slate-100">
                  {result.selected_model_name}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricChip label="Mô hình" value={result.selected_model_name} />
                <MetricChip
                  label="Phát hiện"
                  value={
                    result.mode === "analyze"
                      ? formatCount(result.detected_cell_count)
                      : "1"
                  }
                />
                <MetricChip
                  label="Phân loại"
                  value={
                    result.mode === "analyze"
                      ? formatCount(result.classified_cell_count)
                      : "1"
                  }
                />
                <MetricChip
                  label="Tin cậy TB"
                  value={
                    result.mode === "analyze"
                      ? formatPercent(result.average_confidence)
                      : formatPercent(result.confidence)
                  }
                />
              </div>

              <div className="mt-5">
                <Button
                  variant="secondary"
                  onClick={() =>
                    exportAnalysisReport({
                      title: "HemaVision Analysis Report",
                      filename: `${result.filename || "analysis"}-${result.mode}`,
                      result,
                      rules: result.mode === "analyze" ? clinicalFlagRules : undefined,
                    })
                  }
                >
                  <Download className="mr-2 h-4 w-4" />
                  Xuất PDF report
                </Button>
              </div>
            </SurfaceCard>

            {result.mode === "analyze" && previewUrl && result.region_predictions?.length ? (
              <SurfaceCard className="p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="inline-flex rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-red-100">
                    <Microscope className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Bản đồ phát hiện tế bào</h2>
                    <p className="text-sm text-slate-300/72">
                      Hộp phát hiện và nhãn phân loại trên ảnh gốc.
                    </p>
                  </div>
                </div>
                <DetectionOverlay
                  imageSrc={previewUrl}
                  detections={result.region_predictions.map((rp: { box: { x: number; y: number; width: number; height: number }; label: string; confidence: number }) => ({
                    box: rp.box,
                    label: rp.label,
                    confidence: rp.confidence,
                  }))}
                />
              </SurfaceCard>
            ) : null}

            {result.mode === "predict" ? (
              <SurfaceCard className="p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="inline-flex rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-red-100">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Top dự đoán</h2>
                    <p className="text-sm text-slate-300/72">
                      Xếp hạng độ tin cậy từ backend `/predict`.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3">
                  {result.predictions.map((prediction) => (
                    <div
                      key={`${prediction.index}-${prediction.label}`}
                      className="flex items-center justify-between rounded-[22px] border border-white/8 bg-white/[0.04] px-4 py-4"
                    >
                      <div>
                        <p className="font-semibold text-white">{prediction.label}</p>
                        <p className="text-sm text-slate-400">{prediction.raw_label}</p>
                      </div>
                      <div className="text-sm font-semibold text-red-100">
                        {formatPercent(prediction.confidence)}
                      </div>
                    </div>
                  ))}
                </div>
              </SurfaceCard>
            ) : (
              <>
                <SurfaceCard className="p-6">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-white">Bảng kết quả</h2>
                      <p className="text-sm text-slate-300/72">
                        Cùng một kết quả, nhiều góc nhìn: nhãn, nhóm và WBC differential.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {([
                        { key: "counts", label: "Theo nhãn" },
                        { key: "groups", label: "Nhóm chẩn đoán" },
                        { key: "wbc", label: "Tỷ lệ WBC" },
                      ] as Array<{ key: ResultTabKey; label: string }>).map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setActiveTab(tab.key)}
                          className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeTab === tab.key
                              ? "bg-[linear-gradient(135deg,#be123c,#ef4444)] text-white"
                              : "border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
                            }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <ResultTable
                    rows={getRowsForTab(result, activeTab)}
                    emptyMessage="Không có dữ liệu cho mục này."
                  />
                </SurfaceCard>

                <ClinicalFlags result={result} rules={clinicalFlagRules} />
              </>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
