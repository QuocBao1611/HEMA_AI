import { type CountRow } from "@/types/api";
import { formatCount, formatPercent } from "@/lib/utils/format";

type ResultTableProps = {
  rows: CountRow[];
  emptyMessage: string;
};

export function ResultTable({ rows, emptyMessage }: ResultTableProps) {
  if (!rows.length) {
    return (
      <div className="rounded-[22px] border border-dashed border-white/10 bg-slate-950/30 px-4 py-10 text-center text-sm text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  const maxRatio = Math.max(...rows.map((row) => Number(row.ratio || 0)), 0.0001);

  return (
    <div className="overflow-hidden rounded-[24px] border border-white/8">
      <div className="grid grid-cols-[minmax(0,1.4fr)_110px_140px_140px] gap-4 border-b border-white/8 bg-white/[0.04] px-4 py-3 text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
        <span>Loại tế bào</span>
        <span>Số lượng</span>
        <span>Tỷ lệ</span>
        <span>Tin cậy TB</span>
      </div>

      <div className="divide-y divide-white/8 bg-slate-950/28">
        {rows.map((row) => (
          <div
            key={`${row.label}-${row.class_index ?? row.label}`}
            className="grid grid-cols-[minmax(0,1.4fr)_110px_140px_140px] gap-4 px-4 py-4 text-sm text-slate-200"
          >
            <div>
              <div className="font-semibold text-white">{row.label}</div>
              {row.member_labels?.length ? (
                <div className="mt-1 text-xs text-slate-400">
                  {row.member_labels.join(", ")}
                </div>
              ) : null}
            </div>

            <div>{formatCount(row.count)}</div>

            <div>
              <div>{formatPercent(row.ratio)}</div>
              <div className="mt-2 h-1.5 rounded-full bg-white/6">
                <div
                  className="h-1.5 rounded-full bg-[linear-gradient(90deg,#be123c,#ef4444)]"
                  style={{
                    width: `${Math.round((Number(row.ratio || 0) / maxRatio) * 100)}%`,
                  }}
                />
              </div>
            </div>

            <div>{row.average_confidence != null ? formatPercent(row.average_confidence) : "-"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
