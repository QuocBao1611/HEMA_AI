export function formatPercent(value: number | null | undefined) {
  const safeValue = Number(value || 0);
  return `${(safeValue * 100).toFixed(1)}%`;
}

export function formatCount(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("vi-VN");
}
