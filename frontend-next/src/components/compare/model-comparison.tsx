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
import type { CompareModelsResponse, CompareRow, CountRow } from "@/types/api";
import { ResultTable } from "@/components/analysis/result-table";

Chart.register(...registerables);

// ─── Types ───────────────────────────────────────────────────────────────────

interface Metric {
  label: string;
  values: number[];
  displayValues?: string[];
  unit?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MODEL_COLORS = ["#378ADD", "#1D9E75", "#E8590C"];
const COLOR_A = MODEL_COLORS[0];
const COLOR_B = MODEL_COLORS[1];
const COLOR_C = MODEL_COLORS[2];
const RADAR_LABELS = ["Độ tự tin (Avg)", "Tỷ lệ nhận diện tin cậy", "Tốc độ (Speed)"];

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
      className={`relative cursor-pointer rounded-xl p-5 transition-all ${selected
        ? "border-2 border-blue-500 bg-background"
        : "border border-slate-200 dark:border-border bg-background opacity-60"
        }`}
    >
      {/* Checkmark */}
      <div
        className={`absolute right-3.5 top-3.5 flex h-5 w-5 items-center justify-center rounded-full text-xs transition-all ${selected
          ? "border border-blue-400 bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300"
          : "border border-slate-200 dark:border-border"
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

function SummaryCard({ label, values, names }: { label: string; values: string[]; names: string[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm dark:border-white/5 dark:bg-muted/50 dark:shadow-none">
      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-foreground/40">{label}</p>
      <div className="flex flex-col gap-2">
        {values.map((v, i) => (
          <div key={names[i]} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: MODEL_COLORS[i] }} />
              <span className="text-xs font-medium text-slate-600 dark:text-foreground/60 truncate">{names[i]}</span>
            </div>
            <span className="text-base font-bold text-foreground">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarComparison({ metrics, names }: { metrics: Metric[]; names: string[] }) {
  return (
    <div className="flex flex-col gap-3">
      {metrics.map((m) => (
        <div key={m.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-foreground/60">{m.label}</span>
            <div className="flex gap-3">
              {m.values.map((v, i) => (
                <span key={names[i]} style={{ color: MODEL_COLORS[i] }}>
                  {m.displayValues ? m.displayValues[i] : `${v}${m.unit || ""}`}
                </span>
              ))}
            </div>
          </div>
          {m.values.map((v, i) => (
            <div key={names[i]} className={`relative ${i > 0 ? 'mt-1' : ''} h-1.5 overflow-hidden rounded-full bg-muted`}>
              <div
                className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
                style={{ width: `${v}%`, background: MODEL_COLORS[i], opacity: 1 }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
// ─── Analysis Progress Panel ──────────────────────────────────────────────────

const ANALYSIS_STEPS_BASE = [
  { id: "upload", label: "Tải ảnh lên máy chủ", duration: 600 },
  { id: "detect", label: "Phát hiện vùng tế bào (YOLO)", duration: 3500 },
];

const ANALYSIS_STEP_CLASSIFY = (name: string, dur: number) => ({
  id: `class_${name}`, label: `Phân loại bằng ${name}`, duration: dur,
});

const ANALYSIS_STEP_FINAL = { id: "analyze", label: "Tổng hợp và xử lý kết quả", duration: 1500 };

type StepStatus = "waiting" | "running" | "done";

function AnalysisProgress({ modelNames }: { modelNames: string[] }) {
  const steps = useMemo(() => [
    ...ANALYSIS_STEPS_BASE,
    ...modelNames.map((n, i) => ANALYSIS_STEP_CLASSIFY(n || `Model ${i + 1}`, 3500 + i * 500)),
    ANALYSIS_STEP_FINAL,
  ], [modelNames]);

  const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>({});
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setStepStatuses(Object.fromEntries(steps.map((s) => [s.id, "waiting"])));
  }, [steps]);

  useEffect(() => {
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    let accumulated = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    steps.forEach((step, idx) => {
      const t1 = setTimeout(() => {
        setStepStatuses((prev) => ({ ...prev, [step.id]: "running" }));
      }, accumulated);
      timers.push(t1);
      accumulated += step.duration;
      const t2 = setTimeout(() => {
        setStepStatuses((prev) => ({ ...prev, [step.id]: "done" }));
        setProgress(Math.round(((idx + 1) / steps.length) * 100));
      }, accumulated);
      timers.push(t2);
    });
    return () => timers.forEach(clearTimeout);
  }, [steps]);

  useEffect(() => {
    const runningIdx = steps.findIndex((s) => stepStatuses[s.id] === "running");
    if (runningIdx === -1) return;
    const baseProgress = Math.round((runningIdx / steps.length) * 100);
    const targetProgress = Math.round(((runningIdx + 1) / steps.length) * 100);
    const duration = steps[runningIdx].duration;
    const start = Date.now();
    const raf = setInterval(() => {
      const pct = Math.min(1, (Date.now() - start) / duration);
      setProgress(Math.round(baseProgress + (targetProgress - baseProgress) * pct));
    }, 60);
    return () => clearInterval(raf);
  }, [stepStatuses, steps]);

  return (
    <div className="mb-12 overflow-hidden rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/30">
      <div className="flex items-center justify-between border-b border-blue-200/70 dark:border-blue-900/40 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500" />
          </span>
          <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Đang phân tích {modelNames.length} model...</span>
        </div>
        <span className="text-xs font-mono text-blue-500 dark:text-blue-400">{elapsed}s</span>
      </div>
      <div className="px-6 pt-4 pb-1">
        <div className="relative h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/50">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-300 ease-linear" style={{ width: `${progress}%` }} />
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
      <div className="px-6 pb-5 pt-3 flex flex-col gap-2">
        {steps.map((step) => {
          const status = stepStatuses[step.id] ?? "waiting";
          return (
            <div key={step.id} className={`flex items-center gap-3 text-sm transition-all duration-300 ${status === "done" ? "opacity-100" : status === "running" ? "opacity-100" : "opacity-35"
              }`}>
              <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] transition-all ${status === "done" ? "bg-emerald-500 text-white" : status === "running" ? "bg-blue-500 text-white" : "bg-blue-100 dark:bg-blue-900/40 text-blue-400"
                }`}>
                {status === "done" ? (
                  <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                ) : status === "running" ? (
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </div>
              <span className={`font-medium ${status === "done" ? "text-emerald-700 dark:text-emerald-400" : status === "running" ? "text-blue-700 dark:text-blue-300" : "text-blue-400 dark:text-blue-600"
                }`}>{step.label}</span>
              {status === "running" && <span className="ml-auto text-[11px] text-blue-400 dark:text-blue-500 animate-pulse">Đang chạy...</span>}
              {status === "done" && <span className="ml-auto text-[11px] text-emerald-500">Xong ✓</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function RadarChart({ datasets, names }: { datasets: number[][]; names: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const bgAlphas = ["rgba(55,138,221,0.12)", "rgba(29,158,117,0.12)", "rgba(232,89,12,0.12)"];

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    chartRef.current = new Chart(canvasRef.current, {
      type: "radar",
      data: {
        labels: RADAR_LABELS,
        datasets: datasets.map((data, i) => ({
          label: names[i],
          data,
          borderColor: MODEL_COLORS[i],
          backgroundColor: bgAlphas[i] ?? "rgba(128,128,128,0.1)",
          pointBackgroundColor: MODEL_COLORS[i],
          pointRadius: 4,
          borderWidth: 2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0, max: 100,
            ticks: { display: false, stepSize: 20 },
            grid: { color: "rgba(128,128,128,0.12)" },
            angleLines: { color: "rgba(128,128,128,0.12)" },
            pointLabels: { font: { size: 10 }, color: "#888780" },
          },
        },
      },
    });
    return () => { chartRef.current?.destroy(); };
  }, [datasets, names]);

  return (
    <div className="relative h-56 w-full">
      <canvas ref={canvasRef} role="img" aria-label={`Radar chart so sánh ${names.length} model AI huyết học`} />
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
  const resultsRef = useRef<HTMLDivElement>(null);

  const [config, setConfig] = useState({
    confidence_threshold: 0.25,
    overlap_ratio: 0.45,
    max_detections: 80,
  });

  const models = useMemo(() => systemInfo?.available_models ?? [], [systemInfo]);

  useEffect(() => {
    if (models.length > 0 && selectedModelIds.length === 0) {
      setSelectedModelIds(models.slice(0, 3).map(m => m.model_id));
    }
  }, [models, selectedModelIds]);

  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    setSelectedFile(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setShowResults(false);
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
    compareMutation.mutate({
      file: selectedFile,
      model_ids: selectedModelIds,
      confidence_threshold: config.confidence_threshold,
      padding_ratio: 0.0,
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
      if (prev.length >= 3) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  const resultData = compareMutation.data;

  const uniqueLabels = useMemo(() => {
    if (!resultData || !resultData.models) return [];
    const labelsSet = new Set<string>();
    resultData.models.forEach(modelResult => {
      const rows = modelResult.estimated_counts ?? [];
      rows.forEach(row => {
        labelsSet.add(row.label);
      });
    });
    return Array.from(labelsSet).sort();
  }, [resultData]);

  const mappedResults = useMemo(() => {
    if (!resultData || resultData.comparison_rows.length < 2) return null;
    const rows = resultData.comparison_rows;
    const allBenchmarks = systemInfo?.model_benchmarks || {};
    const fallback = { accuracy: 90, weighted_precision: 89, weighted_recall: 89, weighted_f1: 89, inference_speed_score: 85, stability_score: 85 };

    const benchmarks = rows.map(r => allBenchmarks[r.model_id]?.metrics || fallback);
    const names = rows.map(r => r.display_name);

    // Tính tốc độ thực tế và chuẩn hóa tốc độ cho thanh tiến trình (càng nhanh thanh càng dài)
    const executionTimes = rows.map(r => r.execution_time_ms || 0);
    const validTimes = executionTimes.filter(t => t > 0);
    const minTime = validTimes.length > 0 ? Math.min(...validTimes) : 0;

    const speedBarValues = executionTimes.map(t => {
      if (t <= 0 || minTime <= 0) return 0;
      return Number(((minTime / t) * 100).toFixed(1));
    });

    const speedDisplayValues = rows.map(r => {
      const ms = r.execution_time_ms;
      if (!ms) return "N/A";
      return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
    });

    const radarDatasets = rows.map((row, i) => {
      const reliableRate = row.detected_cell_count > 0
        ? (row.classified_cell_count / row.detected_cell_count) * 100
        : 0;
      return [
        row.average_confidence * 100,
        reliableRate,
        speedBarValues[i],
      ];
    });

    const summaryCards = [
      { label: "Số tế bào (Cells)", values: rows.map(r => formatCount(r.classified_cell_count)) },
      { label: "Độ tự tin (Avg)", values: rows.map(r => formatPercent(r.average_confidence)) },
      { label: "Tốc độ phân tích", values: speedDisplayValues },
    ];

    const barMetrics: Metric[] = [
      {
        label: "Độ tự tin trung bình (Thực tế)",
        values: rows.map(r => Number((r.average_confidence * 100).toFixed(1))),
        unit: "%"
      },
      {
        label: "Tỷ lệ nhận diện tin cậy",
        values: rows.map(r => r.detected_cell_count > 0 ? Number(((r.classified_cell_count / r.detected_cell_count) * 100).toFixed(1)) : 0),
        unit: "%"
      },
      {
        label: "Tốc độ suy luận (Thực tế)",
        values: speedBarValues,
        displayValues: speedDisplayValues
      },
    ];

    return { rows, names, radarDatasets, summaryCards, barMetrics };
  }, [resultData, systemInfo]);

  const selectedModelNames = useMemo(() => {
    return selectedModelIds.map(id => models.find(m => m.model_id === id)?.display_name ?? "");
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
            className={`cursor-pointer rounded-xl border-2 border-dashed text-center transition-all flex flex-col items-center justify-center overflow-hidden ${previewUrl ? "p-0" : "p-10"
              } ${isDragActive
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
          Chọn model (tối đa 3)
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
      {showResults && mappedResults && (() => {
        const { rows, names, radarDatasets, summaryCards, barMetrics } = mappedResults;

        return (
          <div ref={resultsRef} className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <hr className="mb-6 border-border" />

            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Kết quả so sánh</h2>
              <span className="rounded-md bg-emerald-100 px-2.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                {rows.length} model · 1 ảnh phân tích
              </span>
            </div>

            {/* Cell Type Comparison Table */}
            <div className="mb-8">
              {uniqueLabels.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-border bg-background shadow-sm">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-border bg-slate-50 dark:bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <th className="px-6 py-4">Loại tế bào</th>
                        {names.map((name, i) => (
                          <th key={name} className="px-6 py-4">
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: MODEL_COLORS[i] }} />
                              {name}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-border">
                      {uniqueLabels.map(label => (
                        <tr key={label} className="hover:bg-slate-50/50 dark:hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-4 font-semibold text-foreground text-base">{label}</td>
                          {resultData?.models?.map((modelResult, i) => {
                            const modelRows = modelResult.estimated_counts ?? [];
                            const match = modelRows.find(r => r.label === label);
                            return (
                              <td key={modelResult.selected_model_id || i} className="px-6 py-4">
                                {match ? (
                                  <div className="font-semibold text-foreground text-base">
                                    {formatCount(match.count)}
                                    {match.average_confidence !== undefined && (
                                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                                        (Độ tin cậy: {formatPercent(match.average_confidence)})
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground/40 text-base">-</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-foreground/50">Không có dữ liệu phân loại.</div>
              )}
            </div>

            {/* Summary cards */}
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {summaryCards.map((c) => (
                <SummaryCard key={c.label} label={c.label} values={c.values} names={names} />
              ))}
            </div>

            {/* Charts */}
            <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Radar */}
              <div className="rounded-xl border border-slate-200 dark:border-border bg-background p-6 shadow-sm dark:shadow-none">
                <p className="mb-0.5 text-base font-semibold text-foreground">Radar đa chỉ số</p>
                <p className="mb-3 text-xs text-foreground/40">Cấu hình hiệu năng thực tế</p>
                <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
                  {names.map((name, i) => (
                    <div key={name} className="flex items-center gap-1.5 text-[10px] text-foreground/60">
                      <div className="h-2 w-2 rounded-full" style={{ background: MODEL_COLORS[i] }} />
                      {name}
                    </div>
                  ))}
                </div>
                <RadarChart datasets={radarDatasets} names={names} />
              </div>

              {/* Bar */}
              <div className="rounded-xl border border-slate-200 dark:border-border bg-background p-6 shadow-sm dark:shadow-none">
                <p className="mb-0.5 text-base font-semibold text-foreground">Chi tiết từng metric</p>
                <p className="mb-3 text-xs text-foreground/40">So sánh song song</p>
                <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
                  {names.map((name, i) => (
                    <div key={name} className="flex items-center gap-1.5 text-[10px] text-foreground/60">
                      <div className="h-2 w-2 rounded-full" style={{ background: MODEL_COLORS[i] }} />
                      {name}
                    </div>
                  ))}
                </div>
                <BarComparison metrics={barMetrics} names={names} />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
