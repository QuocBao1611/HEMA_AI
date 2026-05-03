"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Chart, registerables } from "chart.js";
import { useDropzone } from "react-dropzone";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import Image from "next/image";

import { compareModels } from "@/lib/api/compare";
import { useSystemInfo } from "@/hooks/use-system-info";
import { formatCount, formatPercent } from "@/lib/utils/format";
import type { CompareModelsResponse, CompareRow } from "@/types/api";

Chart.register(...registerables);

// ─── Types ───────────────────────────────────────────────────────────────────

interface Metric {
  label: string;
  a: number;
  b: number;
  unit?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COLOR_A = "#378ADD";
const COLOR_B = "#1D9E75";
const RADAR_LABELS = ["Độ tự tin (Thực tế)", "Độ chính xác", "Độ chuẩn xác", "Độ bao phủ", "Điểm F1", "Tốc độ", "Độ ổn định"];

// ─── Sub-components ──────────────────────────────────────────────────────────

function SliderField({
  label,
  min,
  max,
  value,
  onChange,
  format,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground/80">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={max > 1 ? 1 : 0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-500"
      />
      <div className="flex justify-between text-xs text-foreground/50">
        <span>{format(min)}</span>
        <span className="font-semibold text-foreground">{format(value)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

function ModelCard({
  id,
  badge,
  badgeVariant,
  name,
  description,
  selected,
  onToggle,
}: {
  id: string;
  badge?: string;
  badgeVariant?: "info" | "success";
  name: string;
  description: string;
  selected: boolean;
  onToggle: () => void;
}) {
  const badgeClass =
    badgeVariant === "info"
      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";

  return (
    <div
      onClick={onToggle}
      className={`relative cursor-pointer rounded-xl p-5 transition-all ${
        selected
          ? "border-2 border-blue-500 bg-background"
          : "border border-border bg-background opacity-60"
      }`}
    >
      {/* Checkmark */}
      <div
        className={`absolute right-3.5 top-3.5 flex h-5 w-5 items-center justify-center rounded-full text-xs transition-all ${
          selected
            ? "border border-blue-400 bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300"
            : "border border-border"
        }`}
      >
        {selected && "✓"}
      </div>

      {badge && (
        <span className={`mb-2 inline-block rounded-md px-2 py-0.5 text-xs ${badgeClass}`}>
          {badge}
        </span>
      )}
      <p className="mb-1.5 text-base font-semibold text-foreground">{name}</p>
      <p className="text-sm leading-relaxed text-foreground/60 line-clamp-2">{description}</p>
    </div>
  );
}

function SummaryCard({ label, a, b, nameA, nameB }: { label: string; a: string; b: string; nameA: string; nameB: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground/40">{label}</p>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR_A }} />
            <span className="text-xs text-foreground/60 truncate">{nameA}</span>
          </div>
          <span className="text-base font-bold text-foreground">{a}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR_B }} />
            <span className="text-xs text-foreground/60 truncate">{nameB}</span>
          </div>
          <span className="text-base font-bold text-foreground">{b}</span>
        </div>
      </div>
    </div>
  );
}

function BarComparison({ metrics, nameA, nameB }: { metrics: Metric[]; nameA: string; nameB: string }) {
  return (
    <div className="flex flex-col gap-3">
      {metrics.map((m) => (
        <div key={m.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-foreground/60">{m.label}</span>
            <div className="flex gap-3">
              <span style={{ color: COLOR_A }}>{m.a}{m.unit}</span>
              <span style={{ color: COLOR_B }}>{m.b}{m.unit}</span>
            </div>
          </div>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
              style={{ width: `${m.a}%`, background: COLOR_A }}
            />
          </div>
          <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
              style={{ width: `${m.b}%`, background: COLOR_B, opacity: 0.8 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
// ─── Analysis Progress Panel ──────────────────────────────────────────────────

const ANALYSIS_STEPS = [
  { id: "upload",   label: "Tải ảnh lên máy chủ",         duration: 600  },
  { id: "detect",  label: "Phát hiện vùng tế bào (YOLO)",  duration: 3500 },
  { id: "classA",  label: "Phân loại bằng Model A",          duration: 4000 },
  { id: "classB",  label: "Phân loại bằng Model B",          duration: 3500 },
  { id: "analyze", label: "Tổng hợp và xử lý kết quả",     duration: 1500 },
];

type StepStatus = "waiting" | "running" | "done";

function AnalysisProgress({ modelNames }: { modelNames: [string, string] }) {
  const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>(
    Object.fromEntries(ANALYSIS_STEPS.map((s) => [s.id, "waiting"]))
  );
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick elapsed time
  useEffect(() => {
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Simulate step progression
  useEffect(() => {
    let accumulated = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    ANALYSIS_STEPS.forEach((step, idx) => {
      // Start running
      const t1 = setTimeout(() => {
        setStepStatuses((prev) => ({ ...prev, [step.id]: "running" }));
      }, accumulated);
      timers.push(t1);

      accumulated += step.duration;

      // Mark done
      const t2 = setTimeout(() => {
        setStepStatuses((prev) => ({ ...prev, [step.id]: "done" }));
        setProgress(Math.round(((idx + 1) / ANALYSIS_STEPS.length) * 100));
      }, accumulated);
      timers.push(t2);
    });

    return () => timers.forEach(clearTimeout);
  }, []);

  // Smooth progress bar fill while a step is running
  useEffect(() => {
    const runningIdx = ANALYSIS_STEPS.findIndex((s) => stepStatuses[s.id] === "running");
    if (runningIdx === -1) return;
    const baseProgress = Math.round((runningIdx / ANALYSIS_STEPS.length) * 100);
    const targetProgress = Math.round(((runningIdx + 1) / ANALYSIS_STEPS.length) * 100);
    const duration = ANALYSIS_STEPS[runningIdx].duration;
    const start = Date.now();
    const raf = setInterval(() => {
      const pct = Math.min(1, (Date.now() - start) / duration);
      setProgress(Math.round(baseProgress + (targetProgress - baseProgress) * pct));
    }, 60);
    return () => clearInterval(raf);
  }, [stepStatuses]);

  const labels = {
    classA: modelNames[0] ? `Phân loại bằng ${modelNames[0]}` : ANALYSIS_STEPS[2].label,
    classB: modelNames[1] ? `Phân loại bằng ${modelNames[1]}` : ANALYSIS_STEPS[3].label,
  };

  return (
    <div className="mb-12 overflow-hidden rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/30">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-blue-200/70 dark:border-blue-900/40 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500" />
          </span>
          <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Đang phân tích...</span>
        </div>
        <span className="text-xs font-mono text-blue-500 dark:text-blue-400">{elapsed}s</span>
      </div>

      {/* Progress bar */}
      <div className="px-6 pt-4 pb-1">
        <div className="relative h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/50">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-300 ease-linear"
            style={{ width: `${progress}%` }}
          />
          {/* Shimmer overlay */}
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <div className="h-full w-1/3 animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          </div>
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-blue-500/70 dark:text-blue-400/60">
          <span>0%</span>
          <span className="font-semibold text-blue-600 dark:text-blue-300">{progress}%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Steps */}
      <div className="px-6 pb-5 pt-3 flex flex-col gap-2">
        {ANALYSIS_STEPS.map((step) => {
          const status = stepStatuses[step.id];
          const displayLabel =
            step.id === "classA" ? labels.classA :
            step.id === "classB" ? labels.classB :
            step.label;
          return (
            <div key={step.id} className={`flex items-center gap-3 text-sm transition-all duration-300 ${
              status === "done" ? "opacity-100" :
              status === "running" ? "opacity-100" :
              "opacity-35"
            }`}>
              {/* Icon */}
              <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] transition-all ${
                status === "done"
                  ? "bg-emerald-500 text-white"
                  : status === "running"
                  ? "bg-blue-500 text-white"
                  : "bg-blue-100 dark:bg-blue-900/40 text-blue-400"
              }`}>
                {status === "done" ? (
                  <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : status === "running" ? (
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </div>
              {/* Label */}
              <span className={`font-medium ${
                status === "done" ? "text-emerald-700 dark:text-emerald-400" :
                status === "running" ? "text-blue-700 dark:text-blue-300" :
                "text-blue-400 dark:text-blue-600"
              }`}>
                {displayLabel}
              </span>
              {status === "running" && (
                <span className="ml-auto text-[11px] text-blue-400 dark:text-blue-500 animate-pulse">Đang chạy...</span>
              )}
              {status === "done" && (
                <span className="ml-auto text-[11px] text-emerald-500">Xong ✓</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function RadarChart({ dataA, dataB, nameA, nameB }: { dataA: number[]; dataB: number[]; nameA: string; nameB: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: "radar",
      data: {
        labels: RADAR_LABELS,
        datasets: [
          {
            label: nameA,
            data: dataA,
            borderColor: COLOR_A,
            backgroundColor: "rgba(55,138,221,0.12)",
            pointBackgroundColor: COLOR_A,
            pointRadius: 4,
            borderWidth: 2,
          },
          {
            label: nameB,
            data: dataB,
            borderColor: COLOR_B,
            backgroundColor: "rgba(29,158,117,0.12)",
            pointBackgroundColor: COLOR_B,
            pointRadius: 4,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { display: false, stepSize: 20 },
            grid: { color: "rgba(128,128,128,0.12)" },
            angleLines: { color: "rgba(128,128,128,0.12)" },
            pointLabels: { font: { size: 10 }, color: "#888780" },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
    };
  }, [dataA, dataB, nameA, nameB]);

  return (
    <div className="relative h-56 w-full">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Radar chart so sánh 6 chỉ số của 2 model AI huyết học"
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ModelComparison() {
  const { data: systemInfo } = useSystemInfo();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<"explain" | "advice" | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const [config, setConfig] = useState({
    confidence_threshold: 0.25,
    overlap_ratio: 0.45,
    max_detections: 80,
  });

  const models = useMemo(() => systemInfo?.available_models ?? [], [systemInfo]);

  useEffect(() => {
    if (models.length > 0 && selectedModelIds.length === 0) {
      setSelectedModelIds(models.slice(0, 2).map(m => m.model_id));
    }
  }, [models, selectedModelIds]);

  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    setSelectedFile(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setShowResults(false);
    setActiveTab(null);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp"] },
  });

  const compareMutation = useMutation({
    mutationFn: compareModels,
    onSuccess: () => {
      // Give progress UI a moment to show 100% before switching to results
      setTimeout(() => {
        setIsAnalyzing(false);
        setShowResults(true);
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
        toast.success("Đã hoàn tất so sánh model.");
      }, 800);
    },
    onError: (err) => {
      setIsAnalyzing(false);
      toast.error(err instanceof Error ? err.message : "Lỗi khi chạy so sánh.");
    }
  });

  const runComparison = useCallback(() => {
    if (!selectedFile) { toast.error("Vui lòng chọn ảnh trước."); return; }
    if (selectedModelIds.length < 2) { toast.error("Hãy chọn ít nhất 2 model để so sánh."); return; }
    setIsAnalyzing(true);
    setShowResults(false);
    setActiveTab(null);
    compareMutation.mutate({
      file: selectedFile,
      model_ids: selectedModelIds,
      confidence_threshold: config.confidence_threshold,
      padding_ratio: 0.1,
      min_component_area: 80,
      max_detections: config.max_detections,
    });
  }, [selectedFile, selectedModelIds, config, compareMutation]);

  const toggleModel = (id: string) => {
    setSelectedModelIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter((m) => m !== id);
      }
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  // ─── Data Mapping ─────────────────────────────────────────────────────────
  
  const resultData = compareMutation.data;
  
  const mappedResults = useMemo(() => {
    if (!resultData || resultData.comparison_rows.length < 2) return null;
    const [rowA, rowB] = resultData.comparison_rows;
    
    // Get actual benchmarks from system config (which loaded from notebooks)
    const allBenchmarks = systemInfo?.model_benchmarks || {};
    const benchA = allBenchmarks[rowA.model_id]?.metrics;
    const benchB = allBenchmarks[rowB.model_id]?.metrics;

    // Default benchmarks if not found in JSON (fallback mock)
    const fallbackA = { accuracy: 90, weighted_precision: 89, weighted_recall: 89, weighted_f1: 89, inference_speed_score: 85, stability_score: 85 };
    const fallbackB = { accuracy: 90, weighted_precision: 89, weighted_recall: 89, weighted_f1: 89, inference_speed_score: 85, stability_score: 85 };

    const mA = benchA || fallbackA;
    const mB = benchB || fallbackB;

    // Radar metrics map to: ["Confidence", "Accuracy", "Precision", "Recall", "F1-Score", "Speed", "Stability"]
    const slideMetricsA = [
      rowA.average_confidence * 100,
      mA.accuracy,
      mA.weighted_precision || mA.accuracy,
      mA.weighted_recall || mA.accuracy,
      mA.weighted_f1 || mA.accuracy,
      mA.inference_speed_score || 85,
      mA.stability_score || 85
    ];
    
    const slideMetricsB = [
      rowB.average_confidence * 100,
      mB.accuracy,
      mB.weighted_precision || mB.accuracy,
      mB.weighted_recall || mB.accuracy,
      mB.weighted_f1 || mB.accuracy,
      mB.inference_speed_score || 85,
      mB.stability_score || 85
    ];

    const summaryCards = [
      { label: "Độ tự tin (Avg)", a: formatPercent(rowA.average_confidence), b: formatPercent(rowB.average_confidence) },
      { label: "Phát hiện (Cells)", a: formatCount(rowA.detected_cell_count), b: formatCount(rowB.detected_cell_count) },
      { label: "Phân loại (Cells)", a: formatCount(rowA.classified_cell_count), b: formatCount(rowB.classified_cell_count) },
      { label: "Chiếm đa số", a: rowA.dominant_label, b: rowB.dominant_label },
    ];

    const barMetrics: Metric[] = [
      { label: "Độ tự tin trung bình (Thực tế)", a: Math.round(rowA.average_confidence * 100), b: Math.round(rowB.average_confidence * 100), unit: "%" },
      { label: "Độ chính xác tổng thể (Accuracy)", a: Math.round(mA.accuracy), b: Math.round(mB.accuracy), unit: "%" },
      { label: "Độ chuẩn xác (Precision)", a: Math.round(mA.weighted_precision || mA.accuracy), b: Math.round(mB.weighted_precision || mB.accuracy), unit: "%" },
      { label: "Độ bao phủ (Recall)", a: Math.round(mA.weighted_recall || mA.accuracy), b: Math.round(mB.weighted_recall || mB.accuracy), unit: "%" },
      { label: "Điểm F1 (F1-Score)", a: Math.round(mA.weighted_f1 || mA.accuracy), b: Math.round(mB.weighted_f1 || mB.accuracy), unit: "%" },
      { label: "Tốc độ suy luận (Speed)", a: Math.round(mA.inference_speed_score || 85), b: Math.round(mB.inference_speed_score || 85), unit: "%" },
      { label: "Độ ổn định (Stability)", a: Math.round(mA.stability_score || 85), b: Math.round(mB.stability_score || 85), unit: "%" },
    ];

    return { rowA, rowB, slideMetricsA, slideMetricsB, summaryCards, barMetrics };
  }, [resultData, systemInfo]);

  const selectedModelNames = useMemo(() => {
    const m0 = models.find(m => m.model_id === selectedModelIds[0])?.display_name ?? "";
    const m1 = models.find(m => m.model_id === selectedModelIds[1])?.display_name ?? "";
    return [m0, m1] as [string, string];
  }, [models, selectedModelIds]);

  return (
    <div className="mx-auto max-w-7xl px-6 pt-20 pb-10">
      {/* Config + Upload — 2 column on wide screens */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Cấu hình
        </h2>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          {/* Sliders */}
          <div className="flex flex-col justify-between lg:h-72 py-1">
            <SliderField
              label="Ngưỡng tin cậy (Confidence)"
              min={0}
              max={100}
              value={config.confidence_threshold * 100}
              onChange={(v) => setConfig(prev => ({ ...prev, confidence_threshold: v / 100 }))}
              format={(v) => `${Math.round(v)}%`}
            />
            <SliderField
              label="Tỷ lệ trùng lặp (NMS Overlap)"
              min={0}
              max={100}
              value={config.overlap_ratio * 100}
              onChange={(v) => setConfig(prev => ({ ...prev, overlap_ratio: v / 100 }))}
              format={(v) => (v / 100).toFixed(2)}
            />
            <SliderField
              label="Số lượng tối đa"
              min={10}
              max={200}
              value={config.max_detections}
              onChange={(v) => setConfig(prev => ({ ...prev, max_detections: v }))}
              format={(v) => String(v)}
            />
          </div>

          {/* Upload zone */}
          <div
            {...getRootProps()}
            className={`cursor-pointer rounded-xl border-2 border-dashed text-center transition-all flex flex-col items-center justify-center overflow-hidden ${
              previewUrl ? "p-0" : "p-10"
            } ${
              isDragActive
                ? "border-blue-400 bg-blue-50/60 dark:bg-blue-900/15 dark:border-blue-500"
                : "border-slate-300 dark:border-white/20 bg-background hover:border-blue-300 hover:bg-slate-50 dark:hover:border-white/30 dark:hover:bg-white/[0.04]"
            } lg:h-72`}
          >
            <input {...getInputProps()} />
            {previewUrl ? (
              <div className="relative h-full w-full">
                <Image src={previewUrl} alt="Preview" fill className="object-contain" />
              </div>
            ) : (
              <>
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-muted/60 text-foreground/50 text-lg">
                  ↑
                </div>
                <p className="text-base font-medium text-foreground/70">Kéo thả ảnh vào đây hoặc click để chọn</p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Model selection */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Chọn model (tối đa 2)
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((m) => (
            <ModelCard
              key={m.model_id}
              id={m.model_id}
              name={m.display_name}
              description={m.preprocessing}
              selected={selectedModelIds.includes(m.model_id)}
              onToggle={() => toggleModel(m.model_id)}
            />
          ))}
        </div>
      </section>

      {/* Run button OR Progress Panel */}
      {isAnalyzing ? (
        <AnalysisProgress key={String(compareMutation.submittedAt)} modelNames={selectedModelNames} />
      ) : (
        <button
          onClick={runComparison}
          disabled={!selectedFile || selectedModelIds.length < 2}
          className="mb-12 w-full rounded-xl border-2 border-blue-400 bg-blue-50 py-4 text-base font-semibold text-blue-700 transition-all hover:bg-blue-100 hover:border-blue-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
        >
          {showResults ? "↺ Chạy lại" : "▶ Chạy so sánh"}
        </button>
      )}

      {/* Results */}
      {showResults && mappedResults && (
        <div ref={resultsRef} className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <hr className="mb-6 border-border" />

          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Kết quả so sánh</h2>
            <span className="rounded-md bg-emerald-100 px-2.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              {selectedModelIds.length} model · 1 ảnh phân tích
            </span>
          </div>

          {/* Summary cards */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {mappedResults.summaryCards.map((c) => (
              <SummaryCard key={c.label} {...c} nameA={mappedResults.rowA.display_name} nameB={mappedResults.rowB.display_name} />
            ))}
          </div>

          {/* Charts — full width 2-col */}
          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Radar */}
            <div className="rounded-xl border border-border bg-background p-6">
              <p className="mb-0.5 text-base font-semibold text-foreground">Radar đa chỉ số</p>
              <p className="mb-3 text-xs text-foreground/40">Cấu hình hiệu năng thực tế</p>
              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
                <div className="flex items-center gap-1.5 text-[10px] text-foreground/60">
                  <div className="h-2 w-2 rounded-full" style={{ background: COLOR_A }} />
                  {mappedResults.rowA.display_name}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-foreground/60">
                  <div className="h-2 w-2 rounded-full" style={{ background: COLOR_B }} />
                  {mappedResults.rowB.display_name}
                </div>
              </div>
              <RadarChart
                dataA={mappedResults.slideMetricsA}
                dataB={mappedResults.slideMetricsB}
                nameA={mappedResults.rowA.display_name}
                nameB={mappedResults.rowB.display_name}
              />
            </div>

            {/* Bar */}
            <div className="rounded-xl border border-border bg-background p-6">
              <p className="mb-0.5 text-base font-semibold text-foreground">Chi tiết từng metric</p>
              <p className="mb-3 text-xs text-foreground/40">So sánh song song</p>
              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
                <div className="flex items-center gap-1.5 text-[10px] text-foreground/60">
                  <div className="h-2 w-2 rounded-full" style={{ background: COLOR_A }} />
                  {mappedResults.rowA.display_name}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-foreground/60">
                  <div className="h-2 w-2 rounded-full" style={{ background: COLOR_B }} />
                  {mappedResults.rowB.display_name}
                </div>
              </div>
              <BarComparison metrics={mappedResults.barMetrics} nameA={mappedResults.rowA.display_name} nameB={mappedResults.rowB.display_name} />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setActiveTab(prev => prev === "explain" ? null : "explain")}
              className={`flex-1 rounded-lg border py-2 text-xs font-medium transition ${
                activeTab === "explain" 
                  ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "border-border bg-background text-foreground/80 hover:bg-muted/50"
              }`}
            >
              Giải thích kết quả {activeTab === "explain" ? "↓" : "↗"}
            </button>
            <button
              onClick={() => setActiveTab(prev => prev === "advice" ? null : "advice")}
              className={`flex-1 rounded-lg border py-2 text-xs font-medium transition ${
                activeTab === "advice" 
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "border-border bg-background text-foreground/80 hover:bg-muted/50"
              }`}
            >
              Tư vấn chọn model {activeTab === "advice" ? "↓" : "↗"}
            </button>
          </div>

          {/* Expandable Insights */}
          {activeTab === "explain" && (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/50 p-5 text-sm leading-relaxed text-blue-900 dark:border-blue-800/50 dark:bg-blue-900/10 dark:text-blue-100 animate-in fade-in slide-in-from-top-2">
              <h4 className="mb-2 font-semibold">🔍 Phân tích chi tiết</h4>
              <ul className="list-inside list-disc space-y-1.5 opacity-90">
                <li>
                  <strong>{mappedResults.rowA.display_name}</strong> phát hiện được <strong>{mappedResults.rowA.detected_cell_count}</strong> tế bào với độ tự tin trung bình là <strong>{formatPercent(mappedResults.rowA.average_confidence)}</strong>.
                </li>
                <li>
                  <strong>{mappedResults.rowB.display_name}</strong> phát hiện được <strong>{mappedResults.rowB.detected_cell_count}</strong> tế bào với độ tự tin trung bình là <strong>{formatPercent(mappedResults.rowB.average_confidence)}</strong>.
                </li>
                {mappedResults.rowA.dominant_label !== mappedResults.rowB.dominant_label ? (
                  <li>Hai model <strong>bất đồng</strong> về loại tế bào chiếm đa số (<strong>{mappedResults.rowA.dominant_label}</strong> vs <strong>{mappedResults.rowB.dominant_label}</strong>), cho thấy ảnh này có thể chứa các tế bào khó phân biệt ở ngưỡng viền.</li>
                ) : (
                  <li>Hai model <strong>đồng thuận</strong> về loại tế bào chiếm đa số là <strong>{mappedResults.rowA.dominant_label}</strong>.</li>
                )}
                <li>
                  Sự chênh lệch về độ tự tin {(Math.abs(mappedResults.rowA.average_confidence - mappedResults.rowB.average_confidence) * 100).toFixed(1)}% cho thấy {mappedResults.rowA.average_confidence > mappedResults.rowB.average_confidence ? mappedResults.rowA.display_name : mappedResults.rowB.display_name} bắt đặc trưng của bức ảnh này tốt hơn.
                </li>
              </ul>
            </div>
          )}

          {activeTab === "advice" && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 text-sm leading-relaxed text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-900/10 dark:text-emerald-100 animate-in fade-in slide-in-from-top-2">
              <h4 className="mb-2 font-semibold">💡 Khuyến nghị</h4>
              <p className="mb-3 opacity-90">
                Dựa trên cả số liệu benchmark lịch sử và kết quả thực tế trên bức ảnh này:
              </p>
              <div className="rounded-lg bg-emerald-100/50 p-3 dark:bg-emerald-800/20 mb-3 border border-emerald-200 dark:border-emerald-800/50">
                <p className="font-medium">
                  Nên sử dụng: <strong>{
                    (mappedResults.barMetrics[1].a > mappedResults.barMetrics[1].b) || 
                    (mappedResults.barMetrics[1].a === mappedResults.barMetrics[1].b && mappedResults.rowA.average_confidence > mappedResults.rowB.average_confidence) 
                      ? mappedResults.rowA.display_name 
                      : mappedResults.rowB.display_name
                  }</strong>
                </p>
              </div>
              <ul className="list-inside list-disc space-y-1.5 opacity-90">
                <li>Ưu tiên model có <strong>Độ chính xác (Accuracy)</strong> cao hơn trên radar chart vì nó đã được huấn luyện tốt hơn để phân biệt các trường hợp gây nhầm lẫn.</li>
                <li>Nếu hai model có Benchmark tương đương, hãy chọn model có <strong>Độ tự tin trung bình</strong> trên ảnh thực tế cao hơn.</li>
                <li>Đối với các mẫu máu hiếm hoặc bất thường, bạn nên tham khảo ý kiến của bác sĩ huyết học thay vì hoàn toàn phụ thuộc vào một model.</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
