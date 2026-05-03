"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Edit3,
  Eye,
  Search,
  X,
  Trash2,
} from "lucide-react";
import type { RegionPrediction } from "@/types/api";
import { formatPercent } from "@/lib/utils/format";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type CellCrop = {
  regionId: number;
  label: string;
  confidence: number;
  classIndex: number;
  /** data-URL of the cropped thumbnail */
  thumbnailUrl: string;
  box: RegionPrediction["box"];
};

type CellGroup = {
  label: string;
  cells: CellCrop[];
};

export type CellCorrection = {
  regionId: number;
  originalLabel: string;
  newLabel: string;
};

type CellReviewGalleryProps = {
  imageSrc: string;
  detections: RegionPrediction[];
  classNames: string[];
  corrections: Map<number, CellCorrection>;
  onCorrect: (regionId: number, newLabel: string) => void;
  onUndoCorrect: (regionId: number) => void;
  onDelete?: (regionId: number) => void;
};

/* ------------------------------------------------------------------ */
/*  Colour palette (same as detection-overlay)                         */
/* ------------------------------------------------------------------ */
const LABEL_COLORS: Record<string, string> = {
  RBC: "#22d3ee", WBC: "#a78bfa", SNE: "#facc15", BNE: "#facc15",
  LY: "#34d399", MO: "#f472b6", EO: "#ef4444", BA: "#c084fc",
  PLT: "#94a3b8", IG: "#f87171", MMY: "#f87171", MY: "#f87171",
  MYO: "#f87171", PMY: "#f87171", ERB: "#ef4444",
};
const DEFAULT_COLOR = "#22d3ee";
function getColor(label: string) {
  const key = label.toUpperCase().replace(/\s+/g, "");
  return LABEL_COLORS[key] ?? DEFAULT_COLOR;
}

/* ------------------------------------------------------------------ */
/*  Crop helper – uses an off-screen canvas                            */
/* ------------------------------------------------------------------ */
function cropCells(
  imgEl: HTMLImageElement,
  detections: RegionPrediction[],
): CellCrop[] {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  return detections.map((det) => {
    const { x, y, width, height } = det.box;
    const THUMB = 96;
    canvas.width = THUMB;
    canvas.height = THUMB;
    ctx.clearRect(0, 0, THUMB, THUMB);
    ctx.drawImage(imgEl, x, y, width, height, 0, 0, THUMB, THUMB);

    return {
      regionId: det.region_id,
      label: det.label,
      confidence: det.confidence,
      classIndex: det.class_index,
      thumbnailUrl: canvas.toDataURL("image/webp", 0.85),
      box: det.box,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Components                                                         */
/* ------------------------------------------------------------------ */

function ClassBadge({
  label,
  count,
  color,
  active,
  onClick,
}: {
  label: string;
  count: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-all ${
        active
          ? "border-white/30 bg-white/15 text-white shadow-lg scale-105"
          : "border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-black/10 dark:hover:bg-white/10"
      }`}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
      <span className="ml-1 rounded-full bg-black/10 dark:bg-black/20 px-1.5 py-0.5 text-[9px]">
        {count}
      </span>
    </button>
  );
}

function CellCard({
  cell,
  correction,
  classNames,
  onCorrect,
  onUndo,
  onPreview,
  onDelete,
}: {
  cell: CellCrop;
  correction?: CellCorrection;
  classNames: string[];
  onCorrect: (regionId: number, newLabel: string) => void;
  onUndo: (regionId: number) => void;
  onPreview: (cell: CellCrop) => void;
  onDelete?: (regionId: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const displayLabel = correction ? correction.newLabel : cell.label;
  const isChanged = !!correction;

  useEffect(() => {
    if (!editing) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setEditing(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [editing]);

  const filteredClasses = useMemo(() => {
    if (!search) return classNames;
    const q = search.toLowerCase();
    return classNames.filter((c) => c.toLowerCase().includes(q));
  }, [classNames, search]);

  return (
    <div
      className={`group relative flex flex-col items-center rounded-xl border p-1 transition-all ${
        isChanged
          ? "border-amber-400/40 bg-amber-500/8 dark:border-amber-400/30 dark:bg-amber-500/6 ring-1 ring-amber-400/20"
          : "border-black/6 dark:border-white/8 bg-slate-50/50 dark:bg-white/[0.02] hover:border-slate-300 dark:hover:border-white/16"
      }`}
    >
      {/* Thumbnail */}
      <div
        className="relative mb-1 h-28 w-28 cursor-pointer overflow-hidden border border-black/6 dark:border-white/8 bg-slate-100 dark:bg-black/30"
        onClick={() => onPreview(cell)}
      >
        <img
          src={cell.thumbnailUrl}
          alt={`Cell ${cell.regionId}`}
          className="h-full w-full object-cover"
          draggable={false}
        />
        {/* ID Badge */}
        <div className="absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[8px] font-bold text-white shadow-sm backdrop-blur-sm">
          #{cell.regionId}
        </div>
        {/* Delete Button */}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(cell.regionId);
            }}
            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-red-500/80 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:bg-red-600 z-10"
            title="Xóa tế bào này"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <Eye className="h-4 w-4 text-white" />
        </div>
      </div>

      {/* Label + confidence */}
      <div className="flex w-full items-center justify-between gap-1 px-1">
        <span
          className="truncate text-[11px] font-bold"
          style={{ color: getColor(displayLabel) }}
        >
          {displayLabel}
        </span>
        <span className="text-[9px] text-slate-500 dark:text-slate-400">
          {formatPercent(cell.confidence)}
        </span>
      </div>

      {/* Action buttons */}
      <div className="mt-1 flex w-full items-center justify-center gap-1">
        {isChanged ? (
          <button
            type="button"
            onClick={() => onUndo(cell.regionId)}
            title="Hoàn tác"
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-amber-400/30 bg-amber-500/10 py-1 text-[10px] font-semibold text-amber-600 dark:text-amber-300 transition hover:bg-amber-500/20"
          >
            <X className="h-3 w-3" />
            Hoàn tác
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { setEditing(true); setSearch(""); }}
            title="Chỉnh sửa nhãn"
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-black/6 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] py-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <Edit3 className="h-3 w-3" />
            Sửa
          </button>
        )}
      </div>

      {/* Correction indicator */}
      {isChanged && (
        <div className="mt-1 flex items-center gap-1 text-[9px] text-amber-600 dark:text-amber-400">
          <span className="line-through opacity-60">{correction!.originalLabel}</span>
          <span>→</span>
          <span className="font-bold">{correction!.newLabel}</span>
        </div>
      )}

      {/* Dropdown class picker */}
      {editing && (
        <div
          ref={dropdownRef}
          className="absolute left-1/2 top-full z-50 mt-1 w-48 -translate-x-1/2 rounded-2xl border border-slate-200 dark:border-white/12 bg-white dark:bg-[#0f0f16] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-white/8 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm nhãn..."
              className="w-full bg-transparent text-xs text-slate-800 dark:text-white outline-none placeholder:text-slate-400"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-auto py-1 custom-scrollbar">
            {filteredClasses.map((cls) => (
              <button
                key={cls}
                type="button"
                onClick={() => {
                  if (cls !== cell.label) {
                    onCorrect(cell.regionId, cls);
                  } else {
                    onUndo(cell.regionId);
                  }
                  setEditing(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-xs transition ${
                  cls === displayLabel
                    ? "bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white font-bold"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: getColor(cls) }}
                  />
                  {cls}
                </span>
                {cls === displayLabel && <Check className="h-3 w-3 text-emerald-500" />}
              </button>
            ))}
            {filteredClasses.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-400">Không tìm thấy</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Preview Modal                                                      */
/* ------------------------------------------------------------------ */
function PreviewModal({
  cell,
  imageSrc,
  onClose,
}: {
  cell: CellCrop;
  imageSrc: string;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const SIZE = 320;
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(
        img,
        cell.box.x, cell.box.y, cell.box.width, cell.box.height,
        0, 0, SIZE, SIZE,
      );
    };
    img.src = imageSrc;
  }, [imageSrc, cell]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative rounded-3xl border border-white/12 bg-white dark:bg-[#111118] p-5 shadow-2xl animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute -right-2 -top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/14 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-white shadow-md transition hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
        <canvas
          ref={canvasRef}
          className="rounded-2xl border border-black/8 dark:border-white/10"
          style={{ width: 320, height: 320 }}
        />
        <div className="mt-3 flex items-center justify-between px-1">
          <span className="text-sm font-bold" style={{ color: getColor(cell.label) }}>
            {cell.label}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Tin cậy: {formatPercent(cell.confidence)}
          </span>
        </div>
        <p className="mt-1 text-[10px] text-slate-400">
          Vùng #{cell.regionId} — {cell.box.width}×{cell.box.height}px
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export function CellReviewGallery({
  imageSrc,
  detections,
  classNames,
  corrections,
  onCorrect,
  onUndoCorrect,
  onDelete,
}: CellReviewGalleryProps) {
  const [crops, setCrops] = useState<CellCrop[]>([]);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [previewCell, setPreviewCell] = useState<CellCrop | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Load image and crop cells
  useEffect(() => {
    if (!imageSrc || !detections.length) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const cropped = cropCells(img, detections);
      setCrops(cropped);
      // Expand all groups by default
      const labels = new Set(cropped.map((c) => c.label));
      setExpandedGroups(labels);
    };
    img.src = imageSrc;
  }, [imageSrc, detections]);

  // Group cells by their current label (considering corrections)
  const groups: CellGroup[] = useMemo(() => {
    const map = new Map<string, CellCrop[]>();

    for (const cell of crops) {
      const correction = corrections.get(cell.regionId);
      const effectiveLabel = correction ? correction.newLabel : cell.label;

      if (!map.has(effectiveLabel)) {
        map.set(effectiveLabel, []);
      }
      map.get(effectiveLabel)!.push(cell);
    }

    return Array.from(map.entries())
      .map(([label, cells]) => ({ label, cells }))
      .sort((a, b) => b.cells.length - a.cells.length);
  }, [crops, corrections]);

  const toggleGroup = useCallback((label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  const filteredGroups = activeFilter
    ? groups.filter((g) => g.label === activeFilter)
    : groups;

  const correctionCount = corrections.size;

  if (!crops.length) return null;

  return (
    <>
      <div className="space-y-5">
        {/* Header with correction counter */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-black dark:text-white">
              Kiểm duyệt tế bào
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300/72">
              Nhấn &quot;Sửa&quot; để chỉnh lại nhãn nếu AI nhận diện sai.
              {correctionCount > 0 && (
                <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                  {correctionCount} đã chỉnh sửa
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Class filter badges */}
        <div className="flex flex-wrap gap-2">
          <ClassBadge
            label="Tất cả"
            count={crops.length}
            color="#64748b"
            active={activeFilter === null}
            onClick={() => setActiveFilter(null)}
          />
          {groups.map((g) => (
            <ClassBadge
              key={g.label}
              label={g.label}
              count={g.cells.length}
              color={getColor(g.label)}
              active={activeFilter === g.label}
              onClick={() => setActiveFilter(activeFilter === g.label ? null : g.label)}
            />
          ))}
        </div>

        {/* Grouped cell galleries */}
        <div className="space-y-3">
          {filteredGroups.map((group) => {
            const isExpanded = expandedGroups.has(group.label);
            return (
              <div
                key={group.label}
                className="rounded-2xl border border-black/6 dark:border-white/8 bg-slate-50/50 dark:bg-white/[0.015]"
              >
                {/* Group header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-100/50 dark:hover:bg-white/[0.03] ${isExpanded ? "rounded-t-2xl" : "rounded-2xl"}`}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  )}
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: getColor(group.label) }}
                  />
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {group.label}
                  </span>
                  <span className="rounded-full bg-black/6 dark:bg-white/8 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                    {group.cells.length}
                  </span>
                </button>

                {/* Cell grid */}
                {isExpanded && (
                  <div className="grid grid-cols-3 gap-2 px-4 pb-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                    {group.cells.map((cell) => (
                      <CellCard
                        key={cell.regionId}
                        cell={cell}
                        correction={corrections.get(cell.regionId)}
                        classNames={classNames}
                        onCorrect={onCorrect}
                        onUndo={onUndoCorrect}
                        onPreview={setPreviewCell}
                        onDelete={onDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Preview modal */}
      {previewCell && (
        <PreviewModal
          cell={previewCell}
          imageSrc={imageSrc}
          onClose={() => setPreviewCell(null)}
        />
      )}
    </>
  );
}
