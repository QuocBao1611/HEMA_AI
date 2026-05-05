import { AlertTriangle, Siren, Stethoscope } from "lucide-react";

import type { AnalyzeResponse, ClinicalFlagRule, CountRow } from "@/types/api";
import { formatPercent } from "@/lib/utils/format";

export type ClinicalFlag = {
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  action: string;
  regionIds: number[];
  avgConfidence?: number; // avg confidence of triggering cells
  skippedReason?: string; // why a rule was demoted/skipped (for debug)
};

const fallbackRules: ClinicalFlagRule[] = [
  {
    key: "ig_present",
    enabled: true,
    label: "IG",
    source: "grouped_counts",
    field: "count",
    threshold: 1,
    severity: "critical",
    title: "Nghi ngờ có tế bào non bất thường",
    action: "Cần bác sĩ huyết học xem lại tiêu bản và đối chiếu thêm với lâm sàng.",
  },
  {
    key: "ne_high",
    enabled: true,
    label: "NE",
    source: "wbc_differential",
    field: "ratio",
    threshold: 0.8,
    severity: "warning",
    title: "Nghi ngờ nhiễm trùng cấp",
    action: "Nên đối chiếu thêm với CRP, Procalcitonin và các chỉ số lâm sàng.",
  },
  {
    key: "eo_high",
    enabled: true,
    label: "EO",
    source: "wbc_differential",
    field: "ratio",
    threshold: 0.08,
    severity: "warning",
    title: "Tăng bạch cầu ái toan",
    action: "Cần xem xét dị ứng, ký sinh trùng hoặc bệnh lý tủy liên quan.",
  },
  {
    key: "erb_present",
    enabled: true,
    label: "ERB",
    source: "estimated_counts",
    field: "count",
    threshold: 1,
    severity: "warning",
    title: "Phát hiện hồng cầu có nhân",
    action: "Nên kiểm tra thêm các nguyên nhân thiếu máu tan huyết hoặc rối loạn tủy.",
  },
  {
    key: "ba_high",
    enabled: true,
    label: "BA",
    source: "wbc_differential",
    field: "ratio",
    threshold: 0.03,
    severity: "warning",
    title: "Tăng bạch cầu ái kiềm",
    action: "Cần đối chiếu thêm với bối cảnh tăng sinh tủy và các chỉ số liên quan.",
  },
];

const VIETNAMESE_COPY: Record<string, string> = {
  "Nghi ngo co te bao non bat thuong": "Nghi ngờ có tế bào non bất thường",
  "Can bac si huyet hoc xem lai tieu ban va doi chieu them voi lam sang.":
    "Cần bác sĩ huyết học xem lại tiêu bản và đối chiếu thêm với lâm sàng.",
  "Nghi ngo nhiem trung cap": "Nghi ngờ nhiễm trùng cấp",
  "Nen doi chieu them voi CRP, Procalcitonin va cac chi so lam sang.":
    "Nên đối chiếu thêm với CRP, Procalcitonin và các chỉ số lâm sàng.",
  "Tang bach cau ai toan": "Tăng bạch cầu ái toan",
  "Can xem xet di ung, ky sinh trung hoac benh ly tuy lien quan.":
    "Cần xem xét dị ứng, ký sinh trùng hoặc bệnh lý tủy liên quan.",
  "Phat hien hong cau co nhan": "Phát hiện hồng cầu có nhân",
  "Nen kiem tra them cac nguyen nhan thieu mau tan huyet hoac roi loan tuy.":
    "Nên kiểm tra thêm các nguyên nhân thiếu máu tan huyết hoặc rối loạn tủy.",
  "Tang bach cau ai kiem": "Tăng bạch cầu ái kiềm",
  "Can doi chieu them voi boi canh tang sinh tuy va cac chi so lien quan.":
    "Cần đối chiếu thêm với bối cảnh tăng sinh tủy và các chỉ số liên quan.",
};

function localizeCopy(value: string) {
  return VIETNAMESE_COPY[value] ?? value;
}

function findLabel(rows: CountRow[], label: string) {
  return rows.find((item) => item.label === label);
}

function getRowsForSource(result: AnalyzeResponse, source: string): CountRow[] {
  if (source === "grouped_counts") {
    return result.grouped_counts ?? [];
  }
  if (source === "wbc_differential") {
    return result.wbc_differential ?? [];
  }
  return result.estimated_counts ?? [];
}

function buildDetail(row: CountRow, field: string, result: AnalyzeResponse, corrections?: Map<number, { newLabel: string }>) {
  let baseText = "";
  if (field === "ratio") {
    baseText = `${row.label}: ${formatPercent(row.ratio)}`;
  } else {
    baseText = `${row.label}: ${row.count} tế bào (${formatPercent(row.ratio)})`;
  }

  if (result.region_predictions && result.region_predictions.length > 0) {
    const targetLabels = row.member_labels && row.member_labels.length > 0 
      ? new Set(row.member_labels) 
      : new Set([row.label]);

    const matchingIds: number[] = [];
    
    for (const rp of result.region_predictions) {
      // Lấy nhãn đã sửa (nếu có), nếu không dùng nhãn gốc của AI
      const label = corrections?.get(rp.region_id)?.newLabel || rp.label;
      if (targetLabels.has(label)) {
        matchingIds.push(rp.region_id);
      }
    }

    if (matchingIds.length > 0) {
      const displayIds = matchingIds.slice(0, 10).map(id => `#${id}`).join(", ");
      const more = matchingIds.length > 10 ? ` và ${matchingIds.length - 10} vị trí khác` : "";
      return `${baseText} (Tại vị trí: ${displayIds}${more})`;
    }
  }

  return baseText;
}

export function detectClinicalFlags(
  result: AnalyzeResponse,
  rules: ClinicalFlagRule[] = fallbackRules,
  corrections?: Map<number, { newLabel: string }>
): ClinicalFlag[] {
  const flags: ClinicalFlag[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    // 1. Find the target row in the appropriate data source
    const sourceRows = getRowsForSource(result, rule.source);
    const row = findLabel(sourceRows, rule.label);
    if (!row) continue;

    const rawValue = rule.field === "ratio" ? Number(row.ratio) : Number(row.count);
    if (Number.isNaN(rawValue)) continue;

    // 2. Guard: minimum sample size for ratio-based rules
    // Prevents spurious % alerts when only 2-3 WBCs were classified
    if (rule.field === "ratio" && rule.min_sample) {
      const totalInSource = sourceRows.reduce((sum, r) => sum + (r.count ?? 0), 0);
      if (totalInSource < rule.min_sample) continue;
    }

    // 3. Guard: minimum average confidence for count-based rules
    // Prevents low-confidence misclassifications from triggering critical alerts
    if (rule.field === "count" && rule.min_avg_confidence) {
      const avgConf = Number(row.average_confidence ?? 0);
      if (avgConf < rule.min_avg_confidence) continue;
    }

    // 4. Determine effective severity:
    //    - rawValue >= threshold         → original severity (warning/critical)
    //    - warn_threshold <= rawValue < threshold → downgrade to "info" (borderline)
    //    - rawValue < warn_threshold     → no flag
    let effectiveSeverity: "critical" | "warning" | "info";
    if (rawValue >= Number(rule.threshold)) {
      effectiveSeverity = rule.severity === "critical" ? "critical" : "warning";
    } else if (rule.warn_threshold !== undefined && rawValue >= Number(rule.warn_threshold)) {
      effectiveSeverity = "info";
    } else {
      continue; // Below all thresholds
    }

    const regionIds = extractRegionIds(result, row, corrections);
    const avgConfidence = row.average_confidence ? Number(row.average_confidence) : undefined;

    flags.push({
      severity: effectiveSeverity,
      title: localizeCopy(rule.title),
      detail: buildDetail(row, rule.field, result, corrections),
      action: localizeCopy(rule.action),
      regionIds,
      avgConfidence,
    });
  }

  // Sort: critical → warning → info
  const order = { critical: 0, warning: 1, info: 2 };
  return flags.sort((a, b) => (order[a.severity] ?? 2) - (order[b.severity] ?? 2));
}

function extractRegionIds(
  result: AnalyzeResponse,
  row: CountRow,
  corrections?: Map<number, { newLabel: string }>
): number[] {
  if (!result.region_predictions) return [];
  const targetLabels = row.member_labels && row.member_labels.length > 0
    ? new Set(row.member_labels)
    : new Set([row.label]);
  return result.region_predictions
    .filter((rp) => {
      const label = corrections?.get(rp.region_id)?.newLabel || rp.label;
      return targetLabels.has(label);
    })
    .map((rp) => rp.region_id)
    .filter((id): id is number => id !== undefined);
}

type ClinicalFlagsProps = {
  result: AnalyzeResponse;
  rules?: ClinicalFlagRule[];
  corrections?: Map<number, { newLabel: string }>;
  onFlagClick?: (ids: Set<number>) => void;
};

export function ClinicalFlags({ result, rules, corrections, onFlagClick }: ClinicalFlagsProps) {
  const flags = detectClinicalFlags(result, rules, corrections);

  if (!flags.length) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-red-600 dark:text-red-100">
        <Stethoscope className="h-4 w-4" />
        <span className="text-sm font-semibold uppercase tracking-[0.28em]">
          Cảnh báo lâm sàng
        </span>
        <span className="ml-auto text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          {flags.filter(f => f.severity === "critical").length > 0 && (
            <span className="mr-2 text-red-500">{flags.filter(f => f.severity === "critical").length} cấp bách</span>
          )}
          {flags.filter(f => f.severity === "warning").length > 0 && (
            <span className="mr-2 text-amber-500">{flags.filter(f => f.severity === "warning").length} cảnh báo</span>
          )}
          {flags.filter(f => f.severity === "info").length > 0 && (
            <span className="text-blue-400">{flags.filter(f => f.severity === "info").length} giáp ranh</span>
          )}
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {flags.map((flag) => {
          const isCritical = flag.severity === "critical";
          const isInfo = flag.severity === "info";
          return (
            <article
              key={`${flag.title}-${flag.detail}`}
              onClick={() => onFlagClick?.(new Set(flag.regionIds))}
              className={`rounded-[24px] border p-5 transition-all ${
                isCritical
                  ? "border-red-400/30 bg-red-500/10"
                  : isInfo
                  ? "border-blue-400/20 bg-blue-500/6"
                  : "border-amber-400/20 bg-amber-500/6"
              } ${
                onFlagClick && flag.regionIds.length > 0
                  ? "cursor-pointer hover:shadow-lg active:scale-[0.98]"
                  : ""
              } ${
                onFlagClick && flag.regionIds.length > 0
                  ? isCritical ? "hover:border-red-500/50 hover:bg-red-500/15 hover:shadow-red-500/10"
                    : isInfo ? "hover:border-blue-500/40 hover:bg-blue-500/10 hover:shadow-blue-500/5"
                    : "hover:border-amber-500/40 hover:bg-amber-500/10 hover:shadow-amber-500/5"
                  : ""
              }`}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`inline-flex rounded-2xl p-2 ${
                      isCritical
                        ? "bg-red-500/18 text-red-600 dark:text-red-100"
                        : isInfo
                        ? "bg-blue-500/14 text-blue-600 dark:text-blue-300"
                        : "bg-amber-500/14 text-amber-600 dark:text-amber-300"
                    }`}
                  >
                    {isCritical ? (
                      <Siren className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900 dark:text-white">{flag.title}</h3>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        isCritical ? "bg-red-500/15 text-red-600 dark:text-red-400"
                        : isInfo ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                        : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      }`}>
                        {isCritical ? "Cấp bách" : isInfo ? "Giáp ranh" : "Cảnh báo"}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300/80">{flag.detail}</p>
                  </div>
                </div>
                {flag.avgConfidence !== undefined && (
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Tin cậy TB</p>
                    <p className={`text-sm font-bold ${
                      flag.avgConfidence >= 0.7 ? "text-emerald-500" :
                      flag.avgConfidence >= 0.4 ? "text-amber-500" : "text-red-400"
                    }`}>
                      {(flag.avgConfidence * 100).toFixed(0)}%
                    </p>
                  </div>
                )}
              </div>
              <p className="text-sm leading-7 text-slate-800 dark:text-slate-200/78">{flag.action}</p>
              {onFlagClick && flag.regionIds.length > 0 && (
                <p className={`mt-3 text-xs font-semibold flex items-center gap-1.5 ${
                  isCritical ? "text-red-500 dark:text-red-400"
                  : isInfo ? "text-blue-500 dark:text-blue-400"
                  : "text-amber-500 dark:text-amber-400"
                }`}>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full animate-pulse ${
                    isCritical ? "bg-red-500" : isInfo ? "bg-blue-500" : "bg-amber-500"
                  }`} />
                  Nhấp để highlight {flag.regionIds.length} tế bào trên ảnh
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
