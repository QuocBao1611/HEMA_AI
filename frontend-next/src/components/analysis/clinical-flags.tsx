import { AlertTriangle, Siren, Stethoscope } from "lucide-react";

import type { AnalyzeResponse, ClinicalFlagRule, CountRow } from "@/types/api";
import { formatPercent } from "@/lib/utils/format";

export type ClinicalFlag = {
  severity: "critical" | "warning";
  title: string;
  detail: string;
  action: string;
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

function buildDetail(row: CountRow, field: string) {
  if (field === "ratio") {
    return `${row.label}: ${formatPercent(row.ratio)}`;
  }

  return `${row.label}: ${row.count} tế bào (${formatPercent(row.ratio)})`;
}

export function detectClinicalFlags(
  result: AnalyzeResponse,
  rules: ClinicalFlagRule[] = fallbackRules,
): ClinicalFlag[] {
  const flags: ClinicalFlag[] = [];

  for (const rule of rules) {
    if (!rule.enabled) {
      continue;
    }

    const row = findLabel(getRowsForSource(result, rule.source), rule.label);
    if (!row) {
      continue;
    }

    const rawValue = rule.field === "ratio" ? Number(row.ratio) : Number(row.count);
    if (Number.isNaN(rawValue) || rawValue < Number(rule.threshold)) {
      continue;
    }

    flags.push({
      severity: rule.severity === "critical" ? "critical" : "warning",
      title: localizeCopy(rule.title),
      detail: buildDetail(row, rule.field),
      action: localizeCopy(rule.action),
    });
  }

  return flags;
}

type ClinicalFlagsProps = {
  result: AnalyzeResponse;
  rules?: ClinicalFlagRule[];
};

export function ClinicalFlags({ result, rules }: ClinicalFlagsProps) {
  const flags = detectClinicalFlags(result, rules);

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
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {flags.map((flag) => (
          <article
            key={`${flag.title}-${flag.detail}`}
            className={`rounded-[24px] border p-5 ${
              flag.severity === "critical"
                ? "border-red-400/22 bg-red-500/10"
                : "border-red-300/18 bg-red-500/8"
            }`}
          >
            <div className="mb-3 flex items-center gap-3">
              <div
                className={`inline-flex rounded-2xl p-2 ${
                  flag.severity === "critical"
                    ? "bg-red-500/18 text-red-600 dark:text-red-100"
                    : "bg-red-500/14 text-red-600 dark:text-red-100"
                }`}
              >
                {flag.severity === "critical" ? (
                  <Siren className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">{flag.title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300/80">{flag.detail}</p>
              </div>
            </div>
            <p className="text-sm leading-7 text-slate-800 dark:text-slate-200/78">{flag.action}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
