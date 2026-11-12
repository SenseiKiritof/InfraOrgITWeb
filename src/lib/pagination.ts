import { useEffect, useState } from "react";

export const PAGE_SIZES = [10, 20, 50, 100] as const;

export function usePagination<T>(
  rows: T[] | undefined,
  initialPageSize = 20,
  /** Changes to this value reset the page, e.g. when column filters change. */
  resetKey = "",
) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const total = rows?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when rows, page size or filters change
  useEffect(() => {
    setPage(1);
  }, [total, pageSize, resetKey]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  const offset = (page - 1) * pageSize;

  return {
    page,
    setPage,
    pageCount,
    pageSize,
    setPageSize,
    total,
    items: rows?.slice(offset, offset + pageSize),
  };
}
