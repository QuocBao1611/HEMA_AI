"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { CheckCircle2, Microscope, Scissors, BarChart3 } from "lucide-react";

type Stage = {
  label: string;
  hint: string;
  Icon: React.ElementType;
  color: string;
  target: number;   // progress % this stage aims to reach
  tickMs: number;   // interval between ticks (ms) — lower = faster
  increment: number; // progress added per tick
};

const DEFAULT_STAGES: Stage[] = [
  {
    label: "Đang phát hiện tế bào...",
    hint: "YOLO đang quét toàn bộ slide",
    Icon: Microscope,
    color: "from-violet-500 to-purple-500",
    target: 32,
    tickMs: 40,
    increment: 0.55,
  },
  {
    label: "Đang cắt và phân loại...",
    hint: "MobileNet đang nhận diện từng tế bào",
    Icon: Scissors,
    color: "from-red-500 to-rose-500",
    target: 78,
    tickMs: 55,
    increment: 0.45,
  },
  {
    label: "Hoàn thiện kết quả...",
    hint: "Tổng hợp WBC differential và cảnh báo",
    Icon: BarChart3,
    color: "from-amber-500 to-orange-500",
    target: 93,
    tickMs: 90,
    increment: 0.28,
  },
];

const UNIFIED_STAGES: Stage[] = [
  {
    label: "Đang phân tích tế bào...",
    hint: "YOLO đang quét và phân loại đồng thời",
    Icon: Microscope,
    color: "from-violet-500 to-purple-500",
    target: 65,
    tickMs: 40,
    increment: 0.55,
  },
  {
    label: "Hoàn thiện kết quả...",
    hint: "Tổng hợp WBC differential và cảnh báo",
    Icon: BarChart3,
    color: "from-amber-500 to-orange-500",
    target: 93,
    tickMs: 90,
    increment: 0.28,
  },
];

type Props = {
  isPending: boolean;
  isUnified?: boolean;
  modelName?: string;
};

export function AnalysisProgressBar({ isPending, isUnified = false, modelName }: Props) {
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stageIdx, setStageIdx] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef(0);
  const stageIdxRef = useRef(0);

  const activeStages = useMemo(() => {
    const stages = isUnified ? UNIFIED_STAGES : DEFAULT_STAGES;
    if (!modelName) return stages;
    return stages.map(stage => {
      let hint = stage.hint;
      if (hint.includes("MobileNet")) {
        hint = hint.replace("MobileNet", modelName);
      } else if (hint.includes("YOLO")) {
        hint = hint.replace("YOLO", modelName);
      }
      return {
        ...stage,
        hint
      };
    });
  }, [isUnified, modelName]);

  const clearTick = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startTick = (sIdx: number) => {
    clearTick();
    const stage = activeStages[sIdx];
    if (!stage) return;

    intervalRef.current = setInterval(() => {
      progressRef.current = Math.min(
        progressRef.current + stage.increment,
        stage.target,
      );
      setProgress(progressRef.current);

      // Advance to next stage when target reached
      if (progressRef.current >= stage.target) {
        clearTick();
        const next = sIdx + 1;
        if (next < activeStages.length) {
          stageIdxRef.current = next;
          setStageIdx(next);
          startTick(next);
        }
        // else: stay at max until isPending resolves
      }
    }, stage.tickMs);
  };

  useEffect(() => {
    if (isPending) {
      // Reset and start fresh
      clearTick();
      progressRef.current = 0;
      stageIdxRef.current = 0;
      setProgress(0);
      setStageIdx(0);
      setDone(false);
      setVisible(true);
      startTick(0);
    } else if (visible) {
      // Analysis finished — complete the bar
      clearTick();
      setProgress(100);
      setDone(true);

      const hideTimeout = setTimeout(() => {
        setVisible(false);
        setDone(false);
        setProgress(0);
      }, 1000);

      return () => clearTimeout(hideTimeout);
    }

    return clearTick;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending]);

  if (!visible) return null;

  const stage = activeStages[Math.min(stageIdx, activeStages.length - 1)];
  const StageIcon = done ? CheckCircle2 : stage.Icon;
  const barColor = done
    ? "from-emerald-500 to-green-400"
    : stage.color;

  return (
    <div
      className={`mt-5 overflow-hidden rounded-2xl border transition-all duration-500 ${
        done
          ? "border-emerald-500/30 bg-emerald-500/8"
          : "border-white/10 bg-slate-900/60"
      } backdrop-blur-sm`}
      style={{
        animation: "fadeSlideIn 0.3s ease-out",
      }}
    >
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="px-5 py-4">
        {/* Stage label */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-xl ${
                done
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-white/8 text-slate-300"
              }`}
            >
              <StageIcon className={`h-4 w-4 ${done ? "" : "animate-pulse"}`} />
            </div>
            <div>
              <p
                className={`text-sm font-semibold transition-all duration-300 ${
                  done ? "text-emerald-400" : "text-white"
                }`}
              >
                {done ? "Phân tích hoàn tất!" : stage.label}
              </p>
              {!done && (
                <p className="text-[11px] text-slate-400">{stage.hint}</p>
              )}
            </div>
          </div>

          <span
            className={`text-sm font-bold tabular-nums transition-colors duration-300 ${
              done ? "text-emerald-400" : "text-slate-300"
            }`}
          >
            {Math.round(progress)}%
          </span>
        </div>

        {/* Progress track */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/8">
          <div
            className={`h-full rounded-full bg-gradient-to-r transition-all duration-300 ${barColor}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Stage dots */}
        {!done && (
          <div className="mt-3 flex items-center gap-1.5">
            {activeStages.map((s, i) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    i < stageIdx
                      ? "w-6 bg-emerald-500"
                      : i === stageIdx
                      ? "w-6 bg-white/60"
                      : "w-3 bg-white/20"
                  }`}
                />
              </div>
            ))}
            <span className="ml-1 text-[10px] font-medium text-slate-500">
              Bước {stageIdx + 1}/{activeStages.length}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
