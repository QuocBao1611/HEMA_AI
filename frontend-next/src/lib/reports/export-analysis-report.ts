import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { detectClinicalFlags } from "@/components/analysis/clinical-flags";
import type {
  AnalyzeResponse,
  ClinicalFlagRule,
  CompareModelsResponse,
  PredictResponse,
} from "@/types/api";
import { formatPercent } from "@/lib/utils/format";

type AnyReportResult =
  | AnalyzeResponse
  | PredictResponse
  | CompareModelsResponse
  | Record<string, unknown>;

type ExportReportOptions = {
  title: string;
  filename: string;
  createdAt?: string;
  result: AnyReportResult;
  rules?: ClinicalFlagRule[];
};

function drawHeader(doc: jsPDF, title: string, createdAt?: string) {
  doc.setFontSize(18);
  doc.text(title, 14, 18);
  doc.setFontSize(10);
  doc.text(`Thời gian tạo: ${createdAt || new Date().toLocaleString("vi-VN")}`, 14, 26);
}

function save(doc: jsPDF, filename: string) {
  const safeName = filename.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-");
  doc.save(`${safeName || "hema-analysis-report"}.pdf`);
}

function getModelLabel(result: AnyReportResult) {
  const payload = result as Record<string, unknown>;
  return String(payload.selected_model_name || payload.model_name || "-");
}

export function exportAnalysisReport({
  title,
  filename,
  createdAt,
  result,
  rules,
}: ExportReportOptions) {
  const doc = new jsPDF();
  drawHeader(doc, title, createdAt);

  const mode = String(result.mode || "unknown");
  const baseRows = [
    ["Mode", mode],
    ["Filename", String(result.filename || "-")],
    ["Model", getModelLabel(result)],
  ];

  autoTable(doc, {
    startY: 34,
    head: [["Trường", "Giá trị"]],
    body: baseRows,
    theme: "grid",
  });

  if (mode === "predict") {
    const payload = result as PredictResponse;
    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
        ? (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 8
        : 54,
      head: [["Nhãn", "Độ tin cậy"]],
      body: payload.predictions.map((item) => [
        item.label,
        formatPercent(item.confidence),
      ]),
      theme: "striped",
    });
    return save(doc, filename);
  }

  if (mode === "compare_models") {
    const payload = result as CompareModelsResponse;
    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
        ? (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 8
        : 54,
      head: [["Mô hình", "Phát hiện", "Phân loại", "Tin cậy TB", "Nhóm trội"]],
      body: payload.comparison_rows.map((row) => [
        row.display_name,
        String(row.detected_cell_count),
        String(row.classified_cell_count),
        formatPercent(row.average_confidence),
        row.top_group_label,
      ]),
      theme: "striped",
    });
    return save(doc, filename);
  }

  if (mode === "analyze") {
    const payload = result as AnalyzeResponse;
    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
        ? (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 8
        : 54,
      head: [["Chỉ số", "Giá trị"]],
      body: [
        ["Tế bào phát hiện", String(payload.detected_cell_count)],
        ["Tế bào phân loại", String(payload.classified_cell_count)],
        ["Tổng cộng ước tính", String(payload.estimated_total_cells)],
        ["Độ tin cậy trung bình", formatPercent(payload.average_confidence)],
        ["Nhãn trội", payload.dominant_cell_type?.label || "-"],
      ],
      theme: "grid",
    });

    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 8,
      head: [["Nhãn", "Số lượng", "Tỷ lệ", "Tin cậy TB"]],
      body: payload.estimated_counts.map((row) => [
        row.label,
        String(row.count),
        formatPercent(row.ratio),
        row.average_confidence ? formatPercent(row.average_confidence) : "-",
      ]),
      theme: "striped",
    });

    const flags = detectClinicalFlags(payload, rules);
    if (flags.length) {
      autoTable(doc, {
        startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 8,
        head: [["Mức độ", "Tiêu đề", "Chi tiết", "Hành động"]],
        body: flags.map((flag) => [
          flag.severity,
          flag.title,
          flag.detail,
          flag.action,
        ]),
        theme: "grid",
      });
    }
  }

  save(doc, filename);
}
