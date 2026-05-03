"use client";

import { useEffect, useRef, useState, MouseEvent as ReactMouseEvent, WheelEvent as ReactWheelEvent, useCallback } from "react";
import { ZoomIn, Move, SquarePen } from "lucide-react";

type Detection = {
  region_id?: number;
  box: { x: number; y: number; width: number; height: number };
  label: string;
  confidence: number;
  counted?: boolean;
};

type DetectionOverlayProps = {
  imageSrc: string;
  detections: Detection[];
  onAddDetection?: (box: { x: number; y: number; width: number; height: number }) => void;
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
  MANUAL: "#10b981", // For manual drawn boxes if needed
};

const DEFAULT_COLOR = "#22d3ee";

function getColor(label: string): string {
  const key = label.toUpperCase().replace(/\s+/g, "");
  return LABEL_COLORS[key] ?? DEFAULT_COLOR;
}

export function DetectionOverlay({ imageSrc, detections, onAddDetection }: DetectionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [baseScale, setBaseScale] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [draftBox, setDraftBox] = useState<{ x: number, y: number, w: number, h: number } | null>(null);

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

  // Drawing logic
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const img = imageRef.current;
    if (!canvas || !ctx || !img) return;

    // Reset and clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const finalScale = baseScale * transform.scale;
    
    // Draw background
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw scaled/panned image
    ctx.drawImage(
      img,
      0, 0, img.width, img.height,
      transform.x, transform.y, img.width * finalScale, img.height * finalScale
    );

    // Constant styling relative to screen, not zoom
    const lineWidth = Math.min(5, Math.max(2, Math.round(2.5 * baseScale)));
    const fontSize = Math.min(18, Math.max(11, Math.round(13 * baseScale)));
    const padding = Math.min(8, Math.max(4, Math.round(4 * baseScale)));
    ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;

    // Draw boxes
    for (const det of detections) {
      const x = det.box.x * finalScale + transform.x;
      const y = det.box.y * finalScale + transform.y;
      const w = det.box.width * finalScale;
      const h = det.box.height * finalScale;

      // Skip drawing if box is completely outside canvas
      if (x + w < 0 || y + h < 0 || x > canvas.width || y > canvas.height) continue;

      const color = getColor(det.label);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(x, y, w, h);

      const text = det.region_id 
        ? `#${det.region_id} ${det.label} ${(det.confidence * 100).toFixed(0)}%`
        : `${det.label} ${(det.confidence * 100).toFixed(0)}%`;
      
      const metrics = ctx.measureText(text);
      const textHeight = fontSize + 4;

      const labelX = x;
      const labelY = y - textHeight - padding > 0 ? y - textHeight - padding : y;
      
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(
        labelX,
        labelY,
        metrics.width + padding * 2,
        textHeight + padding,
        Math.min(6, Math.max(3, Math.round(3 * baseScale)))
      );
      ctx.fill();

      ctx.fillStyle = "#000000";
      ctx.fillText(text, labelX + padding, labelY + textHeight - 2);
    }

    // Draw draft box if drawing
    if (draftBox) {
      const finalX = draftBox.w < 0 ? draftBox.x + draftBox.w : draftBox.x;
      const finalY = draftBox.h < 0 ? draftBox.y + draftBox.h : draftBox.y;
      const finalW = Math.abs(draftBox.w);
      const finalH = Math.abs(draftBox.h);

      const sx = finalX * finalScale + transform.x;
      const sy = finalY * finalScale + transform.y;
      const sw = finalW * finalScale;
      const sh = finalH * finalScale;

      ctx.strokeStyle = "#10b981"; // Emerald green
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);
      
      // Add a little tag to show it's being drawn
      ctx.fillStyle = "#10b981";
      ctx.fillRect(sx, sy - fontSize - padding, ctx.measureText("Vẽ...").width + padding * 2, fontSize + padding);
      ctx.fillStyle = "#ffffff";
      ctx.fillText("Vẽ...", sx + padding, sy - 2);
    }
  }, [baseScale, transform, detections, draftBox]);

  useEffect(() => {
    draw();
  }, [draw, canvasSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preventScroll = (e: WheelEvent) => {
      e.preventDefault();
    };
    // Must be non-passive to prevent default page scrolling
    canvas.addEventListener("wheel", preventScroll, { passive: false });
    return () => canvas.removeEventListener("wheel", preventScroll);
  }, []);

  // Event Handlers for Pan & Zoom
  const handleWheel = (e: ReactWheelEvent<HTMLCanvasElement>) => {
    e.preventDefault(); // Prevent page scroll
    const scaleAdjust = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(1, Math.min(transform.scale * scaleAdjust, 10)); // Limit scale from 1x to 10x
    
    if (newScale !== transform.scale) {
      // Zoom towards mouse cursor
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
    if (isDrawingMode) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const finalScale = baseScale * transform.scale;
      const imageX = (screenX - transform.x) / finalScale;
      const imageY = (screenY - transform.y) / finalScale;
      
      setDraftBox({ x: imageX, y: imageY, w: 0, h: 0 });
      setIsDragging(true);
    } else {
      setIsDragging(true);
      setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
  };

  const handleMouseMove = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    
    if (isDrawingMode && draftBox) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const finalScale = baseScale * transform.scale;
      const imageX = (screenX - transform.x) / finalScale;
      const imageY = (screenY - transform.y) / finalScale;
      
      setDraftBox(prev => prev ? { ...prev, w: imageX - prev.x, h: imageY - prev.y } : null);
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

      // Only add if it's large enough (prevent accidental clicks)
      if (finalW > 10 && finalH > 10 && onAddDetection) {
        onAddDetection({ 
          x: Math.round(finalX), 
          y: Math.round(finalY), 
          width: Math.round(finalW), 
          height: Math.round(finalH) 
        });
      }
      setDraftBox(null);
    }
    setIsDragging(false);
  };

  const handleResetZoom = () => {
    setTransform({ x: 0, y: 0, scale: 1 });
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-[24px] border border-white/10 bg-slate-950/45 p-3 group select-none"
    >
      {/* Tools Toggle */}
      <div className="absolute left-4 top-4 z-10 flex items-center gap-1 rounded-xl bg-black/60 p-1 backdrop-blur-md opacity-50 transition-opacity hover:opacity-100 focus-within:opacity-100 group-hover:opacity-100">
        <button
          onClick={() => setIsDrawingMode(false)}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
            !isDrawingMode 
              ? "bg-slate-800 text-white shadow-sm" 
              : "text-slate-300 hover:bg-white/10 hover:text-white"
          }`}
          title="Kéo thả & Phóng to"
        >
          <Move className="h-3.5 w-3.5" />
          Kéo thả
        </button>
        <button
          onClick={() => setIsDrawingMode(true)}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
            isDrawingMode 
              ? "bg-emerald-600 text-white shadow-sm" 
              : "text-slate-300 hover:bg-white/10 hover:text-white"
          }`}
          title="Vẽ thêm tế bào bị sót"
        >
          <SquarePen className="h-3.5 w-3.5" />
          Vẽ thêm
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`mx-auto block max-w-full rounded-[18px] ${
          isDrawingMode 
            ? "cursor-crosshair" 
            : transform.scale > 1 
              ? "cursor-grab active:cursor-grabbing" 
              : ""
        }`}
        style={{ touchAction: "none" }}
      />
      
      <div className="absolute bottom-3 right-3 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-md pointer-events-none">
        {detections.length} tế bào phát hiện
      </div>

      {/* Zoom Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
        {transform.scale > 1 && (
          <button
            onClick={handleResetZoom}
            className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-md hover:bg-black/80 transition"
          >
            Đặt lại ({(transform.scale).toFixed(1)}x)
          </button>
        )}
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md pointer-events-none">
          <ZoomIn className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
