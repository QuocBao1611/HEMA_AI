"use client";

import Image from "next/image";
import Link from "next/link";
import type { ElementType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useThemeStore } from "@/stores/theme-store";
import { useMutation } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { useDropzone } from "react-dropzone";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  ChevronDown,
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
import { CellReviewGallery, type CellCorrection } from "@/components/analysis/cell-review-gallery";
import { AnalysisProgressBar } from "@/components/analysis/analysis-progress-bar";
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

const DIAGNOSTIC_GROUP_BY_LABEL: Record<string, string> = {
  BA: "BA", BNE: "NE", EO: "EO", ERB: "ERB", IG: "IG",
  LY: "LY", MMY: "IG", MO: "MO", MY: "IG", MYO: "IG",
  PLT: "PLT", PMY: "IG", RBC: "RBC", SNE: "NE",
};
const WBC_DIFFERENTIAL_LABELS = new Set(["BA", "EO", "IG", "LY", "MO", "NE"]);

function recomputeCounts(
  result: AnalyzeResponse,
  corrections: Map<number, CellCorrection>,
): { estimated_counts: CountRow[]; grouped_counts: CountRow[]; wbc_differential: CountRow[]; total_classified: number; total_detected: number; average_confidence: number } {
  const regions = result.region_predictions ?? [];
  const threshold = result.confidence_threshold ?? 0;

  const rawBuckets = new Map<string, { count: number; confSum: number; maxConf: number }>();
  const groupedBuckets = new Map<string, { count: number; confSum: number; maxConf: number; members: Set<string> }>();

  for (const rp of regions) {
    if (rp.confidence < threshold) continue;
    const correction = corrections.get(rp.region_id);
    const label = correction ? correction.newLabel : rp.label;
    const groupLabel = DIAGNOSTIC_GROUP_BY_LABEL[label] ?? label;

    // Raw counts
    const rb = rawBuckets.get(label) ?? { count: 0, confSum: 0, maxConf: 0 };
    rb.count += 1;
    rb.confSum += rp.confidence;
    rb.maxConf = Math.max(rb.maxConf, rp.confidence);
    rawBuckets.set(label, rb);

    // Grouped counts
    const gb = groupedBuckets.get(groupLabel) ?? { count: 0, confSum: 0, maxConf: 0, members: new Set() };
    gb.count += 1;
    gb.confSum += rp.confidence;
    gb.maxConf = Math.max(gb.maxConf, rp.confidence);
    gb.members.add(label);
    groupedBuckets.set(groupLabel, gb);
  }

  const totalClassified = Array.from(rawBuckets.values()).reduce((s, b) => s + b.count, 0);

  const estimated_counts: CountRow[] = Array.from(rawBuckets.entries())
    .map(([label, b]) => ({
      label,
      count: b.count,
      ratio: totalClassified ? b.count / totalClassified : 0,
      average_confidence: b.count ? b.confSum / b.count : 0,
      max_confidence: b.maxConf,
    }))
    .sort((a, b) => b.count - a.count || b.average_confidence! - a.average_confidence!);

  const grouped_counts: CountRow[] = Array.from(groupedBuckets.entries())
    .map(([label, b]) => ({
      label,
      count: b.count,
      ratio: totalClassified ? b.count / totalClassified : 0,
      average_confidence: b.count ? b.confSum / b.count : 0,
      max_confidence: b.maxConf,
      member_labels: Array.from(b.members).sort(),
    }))
    .sort((a, b) => b.count - a.count || b.average_confidence! - a.average_confidence!);

  const totalWbc = Array.from(groupedBuckets.entries())
    .filter(([l]) => WBC_DIFFERENTIAL_LABELS.has(l))
    .reduce((s, [, b]) => s + b.count, 0);

  const wbc_differential: CountRow[] = Array.from(groupedBuckets.entries())
    .filter(([l]) => WBC_DIFFERENTIAL_LABELS.has(l))
    .map(([label, b]) => ({
      label,
      count: b.count,
      ratio: totalWbc ? b.count / totalWbc : 0,
      average_confidence: b.count ? b.confSum / b.count : 0,
      max_confidence: b.maxConf,
      member_labels: Array.from(b.members).sort(),
    }))
    .sort((a, b) => b.count - a.count || b.average_confidence! - a.average_confidence!);

  const totalDetected = regions.length;
  const avgConf = totalClassified > 0
    ? Array.from(rawBuckets.values()).reduce((s, b) => s + b.confSum, 0) / totalClassified
    : 0;

  return { estimated_counts, grouped_counts, wbc_differential, total_classified: totalClassified, total_detected: totalDetected, average_confidence: avgConf };
}

const OPTIMAL_PARAMS: Record<string, Partial<AnalysisFormValues>> = {
  // MobileNet (model tự train, 2 bước: detect rồi crop + classify)
  // Cần confidence cao hơn để lọc FP, padding lớn hơn để crop đủ ngữ cảnh
  blood_cell_v4: {
    confidence_threshold: 0.25,
    max_detections: 300,
    padding_ratio: 0.0,
    min_component_area: 100,
  },

  mobilenet_blood_cell: {
    confidence_threshold: 0.35,
    max_detections: 300,
    padding_ratio: 0.12,
    min_component_area: 100,
  },
  mobilenetv2_phase2_best: {
    confidence_threshold: 0.25,
    max_detections: 300,
    padding_ratio: 0.10,
    min_component_area: 100,
  },
  mobilenetv2_final_finetuned: {
    confidence_threshold: 0.30,
    max_detections: 150,
    padding_ratio: 0.12,
    min_component_area: 100,
  },
  best9: {
    confidence_threshold: 0.20,
    max_detections: 300,
    padding_ratio: 0.05,
    min_component_area: 80,
  },
  best_model_v2: {
    confidence_threshold: 0.25,
    max_detections: 300,
    padding_ratio: 0.10,
    min_component_area: 100,
  },
};

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
    <div className="rounded-[22px] border border-black/5 dark:border-white/8 bg-slate-50 dark:bg-white/[0.04] px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{value}</p>
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
    <article className="group relative overflow-hidden rounded-lg border border-black/10 dark:border-white/10 bg-white/50 dark:bg-white/[0.055] p-5 backdrop-blur-md transition hover:border-slate-400/35 dark:hover:border-white/20">
      <div className="absolute right-0 top-0 h-24 w-24 bg-slate-500/0 dark:bg-white/5 blur-3xl transition group-hover:bg-slate-500/5 dark:group-hover:bg-white/10" />
      <div className="relative">
        <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-md border border-black/10 dark:border-white/10 bg-slate-50 dark:bg-white/8 text-slate-700 dark:text-zinc-300 transition group-hover:text-red-600 dark:group-hover:text-red-200">
          <Icon className="h-5 w-5" />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-900 dark:text-white">
          {label}
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-zinc-400">{value}</p>
        {loading ? (
          <div className="mt-5 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/8">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-red-500/70" />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function CustomModelSelect({ availableModels, form }: { availableModels: any[], form: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedModelId = useWatch({ control: form.control, name: "model_id" });
  const selectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedModel = availableModels.find((m) => m.model_id === selectedModelId);

  return (
    <div className="relative" ref={selectRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-12 w-full items-center justify-between rounded-2xl border bg-slate-50 dark:bg-slate-950/60 px-4 text-sm font-medium text-slate-900 dark:text-white shadow-sm transition-all cursor-pointer ${isOpen ? "border-slate-500 ring-2 ring-slate-500/10 dark:border-white/40" : "border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20"
          }`}
      >
        <span className="truncate">{selectedModel ? selectedModel.display_name : "Chọn mô hình..."}</span>
        <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f0f16] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="max-h-60 overflow-auto py-1 custom-scrollbar">
            {availableModels.map((model) => (
              <div
                key={model.model_id}
                onClick={() => {
                  form.setValue("model_id", model.model_id);
                  setIsOpen(false);
                }}
                className={`flex items-center px-4 py-3 text-sm cursor-pointer transition-colors ${selectedModelId === model.model_id
                  ? "bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white font-bold"
                  : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                  }`}
              >
                {model.display_name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AnalysisWorkspace() {
  const { data: systemInfo, isLoading: isSystemLoading, isError, error } = useSystemInfo();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTabKey>("counts");
  const [corrections, setCorrections] = useState<Map<number, CellCorrection>>(new Map());
  const [highlightedIds, setHighlightedIds] = useState<Set<number>>(new Set());

  const handleCorrect = useCallback((regionId: number, newLabel: string) => {
    if (!result || result.mode !== "analyze") return;
    const rp = result.region_predictions?.find((r) => r.region_id === regionId);
    if (!rp) return;
    setCorrections((prev) => {
      const next = new Map(prev);
      next.set(regionId, { regionId, originalLabel: rp.label, newLabel });
      return next;
    });
    toast.success(`Đã chỉnh: vùng #${regionId} → ${newLabel}`);
  }, [result]);

  const handleUndoCorrect = useCallback((regionId: number) => {
    setCorrections((prev) => {
      const next = new Map(prev);
      next.delete(regionId);
      return next;
    });
  }, []);

  const handleFlagClick = useCallback((ids: Set<number>) => {
    setHighlightedIds(ids);
    setTimeout(() => {
      document.getElementById("detection-map")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
  }, []);

  const correctedResult = useMemo(() => {
    if (!result || result.mode !== "analyze") return null;
    return recomputeCounts(result, corrections);
  }, [result, corrections]);

  function getCorrectedRowsForTab(tab: ResultTabKey): CountRow[] {
    if (!result || result.mode !== "analyze") return [];
    const source = correctedResult ?? result;
    if (tab === "groups") return source.grouped_counts ?? [];
    if (tab === "wbc") return source.wbc_differential ?? [];
    return source.estimated_counts ?? [];
  }

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
      setTimeout(() => {
        document.getElementById("analysis-results")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 150);
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

  const handleAddDetection = useCallback(async (box: { x: number; y: number; width: number; height: number }) => {
    if (!previewUrl || !selectedModel) return;

    const toastId = toast.loading("Đang nhận diện tế bào vừa vẽ...");

    try {
      // 1. Crop the original image
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.src = previewUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement("canvas");
      canvas.width = box.width;
      canvas.height = box.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context failed");

      ctx.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
      if (!blob) throw new Error("Canvas toBlob failed");

      // 2. Send to backend for single prediction
      const file = new File([blob], "crop.jpg", { type: "image/jpeg" });
      const payload = {
        file,
        model_id: selectedModel,
        confidence_threshold: 0,
        max_detections: 1,
        padding_ratio: 0,
        min_component_area: 0,
      };

      const prediction = await predictImage(payload);

      // 3. Update UI state with actual label
      setResult((prev) => {
        if (!prev || prev.mode !== "analyze" || !prev.region_predictions) return prev;

        const currentIds = prev.region_predictions.map(rp => rp.region_id).filter(id => id !== undefined) as number[];
        const nextId = currentIds.length > 0 ? Math.max(...currentIds) + 1 : 1;

        const newDetection = {
          region_id: nextId,
          box: box,
          label: prediction.label,
          confidence: prediction.confidence,
          class_index: 0,
        };

        return {
          ...prev,
          region_predictions: [...prev.region_predictions, newDetection],
        };
      });

      toast.success(`Đã nhận diện: ${prediction.label} (${(prediction.confidence * 100).toFixed(0)}%)`, { id: toastId });
    } catch (e) {
      console.error("Auto-predict failed:", e);
      // Fallback
      setResult((prev) => {
        if (!prev || prev.mode !== "analyze" || !prev.region_predictions) return prev;
        const currentIds = prev.region_predictions.map(rp => rp.region_id).filter(id => id !== undefined) as number[];
        const nextId = currentIds.length > 0 ? Math.max(...currentIds) + 1 : 1;
        return {
          ...prev,
          region_predictions: [...prev.region_predictions, { region_id: nextId, box: box, label: "RBC", confidence: 1.0, class_index: 0 }],
        };
      });
      toast.error("Không thể nhận diện tự động, đã gán nhãn mặc định là RBC", { id: toastId });
    }
  }, [previewUrl, selectedModel]);

  const handleDeleteDetection = useCallback((regionId: number) => {
    setResult((prev) => {
      if (!prev || prev.mode !== "analyze" || !prev.region_predictions) return prev;
      return {
        ...prev,
        region_predictions: prev.region_predictions.filter(rp => rp.region_id !== regionId),
      };
    });
    setCorrections((prev) => {
      if (prev.has(regionId)) {
        const next = new Map(prev);
        next.delete(regionId);
        return next;
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    if (selectedModel || !availableModels.length) {
      return;
    }

    form.setValue(
      "model_id",
      systemInfo?.default_model_id ?? availableModels[0].model_id,
    );
  }, [availableModels, form, selectedModel, systemInfo?.default_model_id]);

  // Auto-apply optimal params when model changes
  useEffect(() => {
    if (!selectedModel) return;

    // Find matching optimal config
    const optimal = Object.entries(OPTIMAL_PARAMS).find(([key]) => selectedModel.includes(key));
    if (optimal) {
      const params = optimal[1];
      if (params.confidence_threshold !== undefined) form.setValue("confidence_threshold", params.confidence_threshold);
      if (params.max_detections !== undefined) form.setValue("max_detections", params.max_detections);
      if (params.padding_ratio !== undefined) form.setValue("padding_ratio", params.padding_ratio);
      if (params.min_component_area !== undefined) form.setValue("min_component_area", params.min_component_area);
    }
  }, [selectedModel, form]);

  const currentValues = useWatch({ control: form.control });
  const currentOptimal = useMemo(() => {
    if (!selectedModel) return null;
    const match = Object.entries(OPTIMAL_PARAMS).find(([key]) => selectedModel.includes(key));
    return match ? match[1] : null;
  }, [selectedModel]);

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

  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";

  return (
    <div className="bg-[linear-gradient(180deg,rgba(241,245,249,0)_0%,#f1f5f9_100%)] dark:bg-[linear-gradient(180deg,rgba(0,0,0,0.2),rgba(0,0,0,0.95)_34%,#000000_100%)] transition-colors duration-500">
      <section className="relative min-h-[70vh] md:min-h-screen overflow-hidden border-b border-black/8 dark:border-white/8 transition-colors duration-500">
        <Image
          src={isDark ? "/images/hero-doctor-lab.png" : "/images/hero-doctor-lab-light.png"}
          alt="Bác sĩ huyết học trong phòng xét nghiệm hiện đại"
          fill
          priority
          sizes="100vw"
          className={`object-cover transition-opacity duration-500 ${isDark ? "opacity-35 object-[75%_center] md:object-right-top" : "opacity-55 object-[75%_center] md:object-[right_28%]"
            } md:opacity-100`}
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.75)_0%,rgba(255,255,255,0.4)_38%,transparent_65%),linear-gradient(180deg,transparent_70%,rgba(241,245,249,0.95)_95%,#f1f5f9)] dark:bg-[linear-gradient(90deg,rgba(0,0,0,0.92),rgba(0,0,0,0.6)_46%,rgba(0,0,0,0.1)),linear-gradient(180deg,transparent_60%,rgba(0,0,0,0.8)_90%,#000000)] transition-colors duration-500 pointer-events-none" />

        <div className="relative flex min-h-[70vh] md:min-h-screen items-center px-6 py-20 sm:px-10 lg:px-14">
          <div className="max-w-2xl">
            <div className="mb-5 flex items-center gap-3 text-sm font-bold uppercase tracking-[0.18em] text-red-600 dark:text-red-200 transition-colors duration-500">
              <span className="h-px w-9 bg-red-500/70 dark:bg-red-400/70 transition-colors duration-500" />
              AI Huyết Học
            </div>
            <h1 className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl text-slate-900 dark:text-white transition-colors duration-500">
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
                className="inline-flex h-11 items-center justify-center rounded-md border px-6 text-sm font-semibold backdrop-blur-md transition border-slate-300 bg-white/60 text-slate-800 hover:bg-white/80 dark:border-white/22 dark:bg-black/18 dark:text-white dark:hover:bg-white/10"
              >
                So sánh mô hình
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-12 px-6 py-12 sm:px-10 lg:px-14">
        <section>
          <h2 className="mb-6 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.16em] text-slate-800 dark:text-zinc-200">
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
              <div className="inline-flex rounded-2xl border border-slate-400/20 bg-slate-50 dark:bg-white/10 p-3 text-slate-600 dark:text-slate-100">
                <UploadCloud className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Nạp ảnh smear</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300/72">
                  JPG, PNG, TIFF. Giới hạn 10MB.
                </p>
              </div>
            </div>

            <div
              {...getRootProps()}
              className={`relative rounded-[28px] border-2 border-dashed p-6 transition ${isDragActive
                  ? "border-blue-400 bg-blue-50/50 dark:border-blue-500 dark:bg-white/10"
                  : "border-slate-300 dark:border-white/20 bg-slate-50 dark:bg-slate-950/36 hover:border-blue-300 dark:hover:border-white/30 hover:bg-slate-100 dark:hover:bg-white/[0.04]"
                }`}
            >
              <input {...getInputProps()} />

              {previewUrl ? (
                <div className="relative mx-auto max-w-[620px] overflow-hidden rounded-[24px] border border-black/10 dark:border-white/10 bg-slate-50 dark:bg-slate-950/50">
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
                    className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/14 bg-slate-50 dark:bg-slate-950/70 text-slate-900 dark:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
                  <div className="mb-4 inline-flex rounded-3xl border border-slate-400/20 bg-slate-50 dark:bg-white/10 p-4 text-slate-600 dark:text-slate-100">
                    <FileImage className="h-7 w-7" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                    Kéo thả ảnh vào đây hoặc nhấn để chọn
                  </h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Chọn ảnh để mở khóa phân tích slide và dự đoán nhanh.
                  </p>
                </div>
              )}
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="inline-flex rounded-2xl border border-slate-400/20 bg-slate-50 dark:bg-white/10 p-3 text-slate-600 dark:text-slate-100">
                <FlaskConical className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-black dark:text-white">Thông số phân tích</h2>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block space-y-2 relative z-20">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Mô hình AI</span>
                <CustomModelSelect availableModels={availableModels} form={form} />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Ngưỡng tin cậy
                </span>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  className="h-12 w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950/60 px-4 text-sm font-medium text-slate-900 dark:text-white shadow-sm outline-none transition-all hover:border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:hover:border-white/20 dark:focus:border-red-400"
                  {...form.register("confidence_threshold", { valueAsNumber: true })}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Giới hạn phát hiện
                </span>
                <input
                  type="number"
                  min="1"
                  max="2000"
                  className="h-12 w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950/60 px-4 text-sm font-medium text-slate-900 dark:text-white shadow-sm outline-none transition-all hover:border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:hover:border-white/20 dark:focus:border-red-400"
                  {...form.register("max_detections", { valueAsNumber: true })}
                />
              </label>

              {/* Ẩn tỷ lệ viền đệm để tinh giản UI, giá trị mặc định được tự động đồng bộ */}
              <input
                type="hidden"
                {...form.register("padding_ratio", { valueAsNumber: true })}
              />

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Kích thước tối thiểu (Lọc bụi)
                </span>
                <input
                  type="number"
                  min="16"
                  max="200000"
                  className="h-12 w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950/60 px-4 text-sm font-medium text-slate-900 dark:text-white shadow-sm outline-none transition-all hover:border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:hover:border-white/20 dark:focus:border-red-400"
                  {...form.register("min_component_area", { valueAsNumber: true })}
                />
              </label>
            </div>

            <div className="mt-6">
              <Button
                onClick={() => void submit("analyze")}
                disabled={isSubmitting || !selectedFile}
                className="w-full h-14 text-base relative overflow-hidden transition-all duration-300 shadow-md hover:shadow-lg"
              >
                {analyzeMutation.isPending && (
                  <div className="absolute inset-0 bg-white/20 dark:bg-black/20 animate-pulse" />
                )}
                <div className="relative flex items-center justify-center">
                  {analyzeMutation.isPending ? (
                    <>
                      <LoaderCircle className="mr-2 h-6 w-6 animate-spin" />
                      <span className="font-bold tracking-wide">Đang phân tích...</span>
                    </>
                  ) : (
                    <>
                      <Microscope className="mr-2 h-6 w-6" />
                      <span className="font-bold tracking-wide">Bắt đầu Phân tích</span>
                    </>
                  )}
                </div>
              </Button>
            </div>

            {/* Real-time progress bar */}
            <AnalysisProgressBar 
              isPending={analyzeMutation.isPending} 
              isUnified={availableModels.find((m) => m.model_id === selectedModel)?.unified ?? false}
              modelName={currentModelName}
            />
            {!selectedFile ? (
              <p className="mt-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                Chọn ảnh để bật các nút phân tích.
              </p>
            ) : null}

            <div className="hidden">
              Đang chạy với <span className="font-semibold text-slate-900 dark:text-white">{currentModelName}</span>.
            </div>
          </SurfaceCard>
        </section>

        {result ? (
          <section className="space-y-6" id="analysis-results">
            <SurfaceCard className="p-6">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-black dark:text-white/60">
                    Kết quả phân tích
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-black dark:text-white">
                    {result.mode === "predict"
                      ? `Dự đoán nhanh: ${result.label}`
                      : `${formatCount(correctedResult?.total_classified ?? result.classified_cell_count)} tế bào được tính`}
                  </h2>
                </div>
                <div className="rounded-full border border-black/10 dark:border-white/10 bg-slate-50 dark:bg-white/6 px-4 py-2 text-sm text-slate-700 dark:text-slate-100">
                  {result.selected_model_name}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricChip label="Mô hình" value={result.selected_model_name} />
                <MetricChip
                  label="Phát hiện"
                  value={
                    result.mode === "analyze"
                      ? formatCount(correctedResult?.total_detected ?? result.detected_cell_count)
                      : "1"
                  }
                />
                <MetricChip
                  label="Phân loại"
                  value={
                    result.mode === "analyze"
                      ? formatCount(correctedResult?.total_classified ?? result.classified_cell_count)
                      : "1"
                  }
                />
                <MetricChip
                  label="Tin cậy TB"
                  value={
                    result.mode === "analyze"
                      ? formatPercent(correctedResult?.average_confidence ?? result.average_confidence)
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
              <SurfaceCard className="p-6" id="detection-map">
                <div className="mb-5 flex items-center gap-3">
                  <div className="inline-flex rounded-2xl border border-red-400/20 bg-red-50 dark:bg-red-500/10 p-3 text-red-600 dark:text-red-100">
                    <Microscope className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-black dark:text-white">Bản đồ phát hiện tế bào</h2>
                    <p className="text-sm text-slate-600 dark:text-slate-300/72">
                      Hộp phát hiện và nhãn phân loại trên ảnh gốc.
                    </p>
                  </div>
                </div>
                <DetectionOverlay
                  imageSrc={previewUrl}
                  detections={result.region_predictions.map((rp: { region_id: number; box: { x: number; y: number; width: number; height: number }; label: string; confidence: number }) => ({
                    region_id: rp.region_id,
                    box: rp.box,
                    label: rp.label,
                    confidence: rp.confidence,
                  }))}
                  onAddDetection={handleAddDetection}
                  onDeleteDetection={handleDeleteDetection}
                  highlightedIds={highlightedIds}
                  onClearHighlight={() => setHighlightedIds(new Set())}
                />
              </SurfaceCard>
            ) : null}

            {/* Cell Review Gallery — Human-in-the-Loop */}
            {result.mode === "analyze" && previewUrl && result.region_predictions?.length ? (
              <SurfaceCard className="p-6 relative z-20">
                <CellReviewGallery
                  imageSrc={previewUrl}
                  detections={result.region_predictions}
                  classNames={systemInfo?.class_names ?? []}
                  corrections={corrections}
                  onCorrect={handleCorrect}
                  onUndoCorrect={handleUndoCorrect}
                  onDelete={handleDeleteDetection}
                  modelId={result.selected_model_id}
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
                    <h2 className="text-xl font-bold text-black dark:text-white">Top dự đoán</h2>
                    <p className="text-sm text-slate-600 dark:text-slate-300/72">
                      Xếp hạng độ tin cậy từ backend `/predict`.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3">
                  {result.predictions.map((prediction) => (
                    <div
                      key={`${prediction.index}-${prediction.label}`}
                      className="flex items-center justify-between rounded-[22px] border border-black/5 dark:border-white/8 bg-slate-50 dark:bg-white/[0.04] px-4 py-4"
                    >
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{prediction.label}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{prediction.raw_label}</p>
                      </div>
                      <div className="text-sm font-semibold text-red-100">
                        {formatPercent(prediction.confidence)}
                      </div>
                    </div>
                  ))}
                </div>
              </SurfaceCard>
            ) : (
              <SurfaceCard className="p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-black dark:text-white">
                      Bảng kết quả {corrections.size > 0 && <span className="ml-2 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-600 dark:text-amber-400">Đã chỉnh sửa</span>}
                    </h2>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {([
                      { key: "counts", label: "Theo nhãn" },
                    ] as Array<{ key: ResultTabKey; label: string }>).map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeTab === tab.key
                          ? "bg-[linear-gradient(135deg,#be123c,#ef4444)] text-slate-900 dark:text-white"
                          : "border border-black/10 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.08]"
                          }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <ResultTable
                  rows={getCorrectedRowsForTab(activeTab)}
                  emptyMessage="Không có dữ liệu cho mục này."
                />

                <div className="mt-6">
                  <ClinicalFlags
                    result={{ ...result, ...(correctedResult || {}) }}
                    rules={clinicalFlagRules}
                    corrections={corrections}
                    onFlagClick={handleFlagClick}
                  />
                </div>
              </SurfaceCard>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
