import { useEffect, useState } from "react";

export function usePagination<T>(rows: T[] | undefined, pageSize = 20) {
  const [page, setPage] = useState(1);
  const total = rows?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the row count changes
  useEffect(() => {
    setPage(1);
  }, [total]);

  const offset = (page - 1) * pageSize;

  return {
    page,
    setPage,
    pageCount,
    pageSize,
    total,
    items: rows?.slice(offset, offset + pageSize),
  };
}
