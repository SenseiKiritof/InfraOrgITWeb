import type { ReactNode } from "react";

function textLength(node: ReactNode): number {
  if (typeof node === "string" || typeof node === "number") {
    return String(node).length;
  }
  if (Array.isArray(node)) {
    return node.reduce<number>((sum, item) => sum + textLength(item), 0);
  }
  return 0;
}

/**
 * Relative column widths from the longest value in the whole dataset, so the
 * layout does not shift while paging. Values are percentages for `<col>`.
 */
export function columnWidths<T>(
  columns: { label: string; render: (row: T) => ReactNode }[],
  rows: T[] | undefined,
  trailingWeight = 0,
): string[] {
  const weights = columns.map((column) => {
    let longest = column.label.length;
    for (const row of rows ?? []) {
      longest = Math.max(longest, textLength(column.render(row)));
    }
    return Math.min(Math.max(longest, 4), 48);
  });
  if (trailingWeight > 0) weights.push(trailingWeight);

  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => `${((weight / total) * 100).toFixed(2)}%`);
}
