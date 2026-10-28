import { useEffect, useState } from "react";

export const PAGE_SIZES = [10, 20, 50, 100] as const;

export function usePagination<T>(rows: T[] | undefined, initialPageSize = 20) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const total = rows?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when rows or page size change
  useEffect(() => {
    setPage(1);
  }, [total, pageSize]);

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
