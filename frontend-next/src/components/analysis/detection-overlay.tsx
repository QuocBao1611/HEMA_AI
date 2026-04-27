"use client";

import { useEffect, useRef, useState } from "react";

type Detection = {
  box: { x: number; y: number; width: number; height: number };
  label: string;
  confidence: number;
  counted?: boolean;
};

type DetectionOverlayProps = {
  imageSrc: string;
  detections: Detection[];
};

const LABEL_COLORS: Record<string, string> = {
  RBC: "#22d3ee",
  WBC: "#a78bfa",
  SNE: "#facc15",
  BNE: "#facc15",
  LY: "#34d399",
  MO: "#f472b6",
  EO: "#ef4444",
  BA: "#c084fc",
  PLT: "#94a3b8",
  IG: "#f87171",
  MMY: "#f87171",
  MY: "#f87171",
  MYO: "#f87171",
  PMY: "#f87171",
  ERB: "#ef4444",
};

const DEFAULT_COLOR = "#22d3ee";

function getColor(label: string): string {
  const key = label.toUpperCase().replace(/\s+/g, "");
  return LABEL_COLORS[key] ?? DEFAULT_COLOR;
}

export function DetectionOverlay({ imageSrc, detections }: DetectionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const containerWidth = container.clientWidth;
      const maxDisplayWidth = Math.min(containerWidth, 920);
      const maxDisplayHeight = 520;
      const maxUpscale = 1.6;
      const scale = Math.min(
        maxDisplayWidth / img.width,
        maxDisplayHeight / img.height,
        maxUpscale,
      );
      const displayWidth = Math.round(img.width * scale);
      const displayHeight = Math.round(img.height * scale);

      canvas.width = displayWidth;
      canvas.height = displayHeight;
      setDimensions({ width: displayWidth, height: displayHeight });

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, displayWidth, displayHeight);

      for (const det of detections) {
        const color = getColor(det.label);
        const x = det.box.x * scale;
        const y = det.box.y * scale;
        const w = det.box.width * scale;
        const h = det.box.height * scale;

        ctx.strokeStyle = color;
        ctx.lineWidth = Math.min(5, Math.max(2, Math.round(2.5 * scale)));
        ctx.strokeRect(x, y, w, h);

        const text = `${det.label} ${(det.confidence * 100).toFixed(0)}%`;
        const fontSize = Math.min(18, Math.max(11, Math.round(13 * scale)));
        ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
        const metrics = ctx.measureText(text);
        const textHeight = fontSize + 4;
        const padding = Math.min(8, Math.max(4, Math.round(4 * scale)));

        const labelX = x;
        const labelY = y - textHeight - padding > 0 ? y - textHeight - padding : y;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(
          labelX,
          labelY,
          metrics.width + padding * 2,
          textHeight + padding,
          Math.min(6, Math.max(3, Math.round(3 * scale))),
        );
        ctx.fill();

        ctx.fillStyle = "#000000";
        ctx.fillText(text, labelX + padding, labelY + textHeight - 2);
      }
    };
    img.src = imageSrc;
  }, [imageSrc, detections]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-[24px] border border-white/10 bg-slate-950/45 p-3"
    >
      <canvas
        ref={canvasRef}
        className="mx-auto block max-w-full rounded-[18px]"
        style={{
          width: dimensions.width || "100%",
          height: dimensions.height || "auto",
        }}
      />
      <div className="absolute bottom-3 right-3 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-md">
        {detections.length} tế bào phát hiện
      </div>
    </div>
  );
}
