import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";
export type SortState = { key: string; direction: SortDirection } | null;

export function compareValues(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  if (typeof left === "number" && typeof right === "number")
    return left - right;
  if (typeof left === "boolean" && typeof right === "boolean")
    return Number(left) - Number(right);
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function nextSort(current: SortState, key: string): SortState {
  if (current?.key !== key) return { key, direction: "asc" };
  return {
    key,
    direction: current.direction === "asc" ? "desc" : "asc",
  };
}

export function sortedRows<T>(
  rows: T[] | undefined,
  sort: SortState,
  value: (row: T, key: string) => unknown = (row, key) =>
    (row as Record<string, unknown>)[key],
): T[] | undefined {
  if (!rows || !sort) return rows;
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort(
    (left, right) =>
      factor * compareValues(value(left, sort.key), value(right, sort.key)),
  );
}

/** Sorting state and rows for a table whose keys are not plain row fields. */
export function useSortedRows<T>(
  rows: T[] | undefined,
  value: (row: T, key: string) => unknown,
) {
  const [sort, setSort] = useState<SortState>(null);
  const sorted = useMemo(
    () => sortedRows(rows, sort, value),
    [rows, sort, value],
  );
  return { rows: sorted, sort, setSort };
}
