"use client";

import { useEffect, useRef, useState, MouseEvent as ReactMouseEvent, WheelEvent as ReactWheelEvent, useCallback } from "react";
import { ZoomIn, Move, SquarePen, Trash2, X } from "lucide-react";

type Detection = {
  region_id?: number;
  box: { x: number; y: number; width: number; height: number };
  label: string;
  confidence: number;
  counted?: boolean;
};

type ToolMode = "pan" | "draw" | "delete";

type DetectionOverlayProps = {
  imageSrc: string;
  detections: Detection[];
  onAddDetection?: (box: { x: number; y: number; width: number; height: number }) => void;
  onDeleteDetection?: (regionId: number) => void;
  highlightedIds?: Set<number>;
  onClearHighlight?: () => void;
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
  MANUAL: "#10b981",
};

const DEFAULT_COLOR = "#22d3ee";

function getColor(label: string): string {
  const key = label.toUpperCase().replace(/\s+/g, "");
  return LABEL_COLORS[key] ?? DEFAULT_COLOR;
}

/** Find which detection (if any) contains the given image-space point */
function hitTest(detections: Detection[], imgX: number, imgY: number): Detection | null {
  // Iterate in reverse so topmost-drawn box gets priority
  for (let i = detections.length - 1; i >= 0; i--) {
    const det = detections[i];
    const { x, y, width, height } = det.box;
    if (imgX >= x && imgX <= x + width && imgY >= y && imgY <= y + height) {
      return det;
    }
  }
  return null;
}

export function DetectionOverlay({
  imageSrc,
  detections,
  onAddDetection,
  onDeleteDetection,
  highlightedIds,
  onClearHighlight,
}: DetectionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [baseScale, setBaseScale] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const [toolMode, setToolMode] = useState<ToolMode>("pan");
  const [draftBox, setDraftBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [hoveredDetection, setHoveredDetection] = useState<Detection | null>(null);

  const animFrameRef = useRef<number>(0);
  const pulsePhaseRef = useRef<number>(0);

  // Derived helpers
  const isDrawingMode = toolMode === "draw";
  const isDeleteMode = toolMode === "delete";

  // Load image once and set initial fit scale
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      const container = containerRef.current;
      if (!container) return;

      const containerWidth = container.clientWidth;
      const maxDisplayWidth = Math.min(containerWidth, 920);
      const maxDisplayHeight = 520;
      const maxUpscale = 1.6;

      const fitScale = Math.min(
        maxDisplayWidth / img.width,
        maxDisplayHeight / img.height,
        maxUpscale,
      );

      const width = Math.round(img.width * fitScale);
      const height = Math.round(img.height * fitScale);

      setBaseScale(fitScale);
      setCanvasSize({ width, height });
      setTransform({ x: 0, y: 0, scale: 1 });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Main drawing function
  const draw = useCallback(
    (pulseAlpha = 0.85) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const img = imageRef.current;
      if (!canvas || !ctx || !img) return;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const finalScale = baseScale * transform.scale;

      // Background
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Image
      ctx.drawImage(img, 0, 0, img.width, img.height, transform.x, transform.y, img.width * finalScale, img.height * finalScale);

      const lineWidth = Math.min(5, Math.max(2, Math.round(2.5 * baseScale)));
      const fontSize = Math.min(18, Math.max(11, Math.round(13 * baseScale)));
      const padding = Math.min(8, Math.max(4, Math.round(4 * baseScale)));
      ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;

      // Draw each detection
      for (const det of detections) {
        const x = det.box.x * finalScale + transform.x;
        const y = det.box.y * finalScale + transform.y;
        const w = det.box.width * finalScale;
        const h = det.box.height * finalScale;

        if (x + w < 0 || y + h < 0 || x > canvas.width || y > canvas.height) continue;

        const isHighlighted = det.region_id !== undefined && highlightedIds?.has(det.region_id);
        const isHovered = isDeleteMode && hoveredDetection?.region_id === det.region_id;

        // Dimming logic
        if (highlightedIds && highlightedIds.size > 0 && !isHighlighted) {
          ctx.globalAlpha = 0.25;
        } else if (isDeleteMode && hoveredDetection && !isHovered) {
          ctx.globalAlpha = 0.45;
        } else {
          ctx.globalAlpha = 1;
        }

        // Box color & stroke
        const color = isHovered ? "#ef4444" : isHighlighted ? "#ef4444" : getColor(det.label);
        ctx.strokeStyle = color;
        ctx.lineWidth = (isHighlighted || isHovered) ? lineWidth * 2.5 : lineWidth;
        ctx.strokeRect(x, y, w, h);

        // Hovered delete overlay — red fill + ✕ badge
        if (isHovered) {
          ctx.save();
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(x, y, w, h);
          ctx.restore();

          // Draw ✕ circle in center
          const cx = x + w / 2;
          const cy = y + h / 2;
          const r = Math.min(w, h) * 0.22;
          ctx.save();
          ctx.globalAlpha = 0.92;
          ctx.fillStyle = "#ef4444";
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = Math.max(1.5, r * 0.18);
          const arm = r * 0.52;
          ctx.beginPath();
          ctx.moveTo(cx - arm, cy - arm);
          ctx.lineTo(cx + arm, cy + arm);
          ctx.moveTo(cx + arm, cy - arm);
          ctx.lineTo(cx - arm, cy + arm);
          ctx.stroke();
          ctx.restore();
          ctx.globalAlpha = 1;
        }

        // Pulsing glow ring for highlighted cells
        if (isHighlighted && !isHovered) {
          ctx.save();
          ctx.globalAlpha = pulseAlpha * 0.45;
          ctx.strokeStyle = "#fca5a5";
          ctx.lineWidth = lineWidth * 5;
          ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
          ctx.restore();
          ctx.globalAlpha = 1;
        }

        // Label tag
        const text = det.region_id
          ? `#${det.region_id} ${det.label} ${(det.confidence * 100).toFixed(0)}%`
          : `${det.label} ${(det.confidence * 100).toFixed(0)}%`;

        const metrics = ctx.measureText(text);
        const textHeight = fontSize + 4;
        const labelX = x;
        const labelY = y - textHeight - padding > 0 ? y - textHeight - padding : y;

        const tagColor = isHovered ? "#ef4444" : color;
        ctx.globalAlpha = isDeleteMode && hoveredDetection && !isHovered ? 0.45 : 1;
        ctx.fillStyle = tagColor;
        ctx.beginPath();
        ctx.roundRect(labelX, labelY, metrics.width + padding * 2, textHeight + padding, Math.min(6, Math.max(3, Math.round(3 * baseScale))));
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, labelX + padding, labelY + textHeight - 2);
      }

      ctx.globalAlpha = 1;

      // Draft box (draw mode)
      if (draftBox) {
        const finalX = draftBox.w < 0 ? draftBox.x + draftBox.w : draftBox.x;
        const finalY = draftBox.h < 0 ? draftBox.y + draftBox.h : draftBox.y;
        const finalW = Math.abs(draftBox.w);
        const finalH = Math.abs(draftBox.h);
        const sx = finalX * finalScale + transform.x;
        const sy = finalY * finalScale + transform.y;
        const sw = finalW * finalScale;
        const sh = finalH * finalScale;

        ctx.strokeStyle = "#10b981";
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.setLineDash([]);
        ctx.fillStyle = "#10b981";
        ctx.fillRect(sx, sy - fontSize - padding, ctx.measureText("Vẽ...").width + padding * 2, fontSize + padding);
        ctx.fillStyle = "#ffffff";
        ctx.fillText("Vẽ...", sx + padding, sy - 2);
      }
    },
    [baseScale, transform, detections, draftBox, highlightedIds, isDeleteMode, hoveredDetection],
  );

  // Animation loop / static draw
  useEffect(() => {
    const needsLoop = (highlightedIds && highlightedIds.size > 0);

    if (!needsLoop) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
      draw(0.85);
      return;
    }

    let running = true;
    const animate = () => {
      if (!running) return;
      pulsePhaseRef.current += 0.05;
      const alpha = 0.55 + 0.45 * Math.sin(pulsePhaseRef.current);
      draw(alpha);
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw, canvasSize, highlightedIds]);

  // Prevent page scroll on wheel over canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preventScroll = (e: WheelEvent) => e.preventDefault();
    canvas.addEventListener("wheel", preventScroll, { passive: false });
    return () => canvas.removeEventListener("wheel", preventScroll);
  }, []);

  /** Convert screen coords → image-space coords */
  const toImageCoords = useCallback(
    (screenX: number, screenY: number) => {
      const finalScale = baseScale * transform.scale;
      return {
        imgX: (screenX - transform.x) / finalScale,
        imgY: (screenY - transform.y) / finalScale,
      };
    },
    [baseScale, transform],
  );

  // ── Event Handlers ──────────────────────────────────────────────────────
  const handleWheel = (e: ReactWheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const scaleAdjust = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(1, Math.min(transform.scale * scaleAdjust, 10));
    if (newScale !== transform.scale) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const newX = mouseX - (mouseX - transform.x) * (newScale / transform.scale);
      const newY = mouseY - (mouseY - transform.y) * (newScale / transform.scale);
      setTransform({ x: newX, y: newY, scale: newScale });
    }
  };

  const handleMouseDown = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    if (isDeleteMode) {
      const { imgX, imgY } = toImageCoords(screenX, screenY);
      const hit = hitTest(detections, imgX, imgY);
      if (hit && hit.region_id !== undefined && onDeleteDetection) {
        onDeleteDetection(hit.region_id);
        setHoveredDetection(null);
      }
      return;
    }

    if (isDrawingMode) {
      const { imgX, imgY } = toImageCoords(screenX, screenY);
      setDraftBox({ x: imgX, y: imgY, w: 0, h: 0 });
      setIsDragging(true);
    } else {
      setIsDragging(true);
      setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
  };

  const handleMouseMove = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Delete mode: update hover
    if (isDeleteMode) {
      const { imgX, imgY } = toImageCoords(screenX, screenY);
      const hit = hitTest(detections, imgX, imgY);
      setHoveredDetection(hit);
      return;
    }

    if (!isDragging) return;

    if (isDrawingMode && draftBox) {
      const { imgX, imgY } = toImageCoords(screenX, screenY);
      setDraftBox((prev) => (prev ? { ...prev, w: imgX - prev.x, h: imgY - prev.y } : null));
    } else {
      setTransform((prev) => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      }));
    }
  };

  const handleMouseUp = () => {
    if (isDragging && isDrawingMode && draftBox) {
      const finalX = draftBox.w < 0 ? draftBox.x + draftBox.w : draftBox.x;
      const finalY = draftBox.h < 0 ? draftBox.y + draftBox.h : draftBox.y;
      const finalW = Math.abs(draftBox.w);
      const finalH = Math.abs(draftBox.h);
      if (finalW > 10 && finalH > 10 && onAddDetection) {
        onAddDetection({
          x: Math.round(finalX),
          y: Math.round(finalY),
          width: Math.round(finalW),
          height: Math.round(finalH),
        });
      }
      setDraftBox(null);
    }
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    handleMouseUp();
    setHoveredDetection(null);
  };

  const handleResetZoom = () => setTransform({ x: 0, y: 0, scale: 1 });

  // Cursor style
  const cursorClass = isDeleteMode
    ? hoveredDetection
      ? "cursor-pointer"
      : "cursor-crosshair"
    : isDrawingMode
    ? "cursor-crosshair"
    : transform.scale > 1
    ? "cursor-grab active:cursor-grabbing"
    : "";

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-[24px] border border-white/10 bg-slate-950/45 p-3 group select-none"
    >
      {/* Toolbar */}
      <div className="absolute left-4 top-4 z-10 flex items-center gap-1 rounded-xl bg-black/60 p-1 backdrop-blur-md opacity-50 transition-opacity hover:opacity-100 focus-within:opacity-100 group-hover:opacity-100">
        <button
          onClick={() => { setToolMode("pan"); setHoveredDetection(null); }}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
            toolMode === "pan"
              ? "bg-slate-800 text-white shadow-sm"
              : "text-slate-300 hover:bg-white/10 hover:text-white"
          }`}
          title="Kéo thả & Phóng to"
        >
          <Move className="h-3.5 w-3.5" />
          Kéo thả
        </button>

        <button
          onClick={() => { setToolMode("draw"); setHoveredDetection(null); }}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
            toolMode === "draw"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-slate-300 hover:bg-white/10 hover:text-white"
          }`}
          title="Vẽ thêm tế bào bị sót"
        >
          <SquarePen className="h-3.5 w-3.5" />
          Vẽ thêm
        </button>

        <button
          onClick={() => { setToolMode("delete"); setDraftBox(null); }}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
            toolMode === "delete"
              ? "bg-red-600 text-white shadow-sm"
              : "text-slate-300 hover:bg-white/10 hover:text-white"
          }`}
          title="Click vào tế bào để xóa"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Xóa
        </button>
      </div>

      {/* Delete mode hint */}
      {isDeleteMode && (
        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-red-600/80 px-4 py-1.5 text-xs font-semibold text-white backdrop-blur-md animate-in fade-in duration-200 pointer-events-none">
          Chế độ xóa — Click vào tế bào để loại bỏ
        </div>
      )}

      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        className={`mx-auto block max-w-full rounded-[18px] ${cursorClass}`}
        style={{ touchAction: "none" }}
      />

      {/* Bottom badges */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2">
        {highlightedIds && highlightedIds.size > 0 && onClearHighlight && (
          <button
            onClick={onClearHighlight}
            className="flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 backdrop-blur-md transition hover:bg-red-500/30"
          >
            <X className="h-3 w-3" />
            Bỏ highlight ({highlightedIds.size})
          </button>
        )}
        <div className="rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-md pointer-events-none">
          {detections.length} tế bào phát hiện
        </div>
      </div>

      {/* Zoom Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
        {transform.scale > 1 && (
          <button
            onClick={handleResetZoom}
            className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-md hover:bg-black/80 transition"
          >
            Đặt lại ({transform.scale.toFixed(1)}x)
          </button>
        )}
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md pointer-events-none">
          <ZoomIn className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
