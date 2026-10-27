import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Keeps the list filter in the URL (`?q=...`) so returning from a detail page
 * restores it instead of resetting the table.
 */
export function useQueryFilter() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [search, setSearch] = useState(q);

  useEffect(() => {
    setSearch(q);
  }, [q]);

  const setQ = useCallback(
    (value: string) => {
      const next = new URLSearchParams(params);
      if (value.trim()) next.set("q", value);
      else next.delete("q");
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  return { search, setSearch, q, setQ };
}
