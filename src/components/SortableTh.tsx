import type { SortState } from "../lib/sort";

interface SortableThProps {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  sortable?: boolean;
  className?: string;
}

export function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
  sortable = true,
  className = "px-4 py-2",
}: SortableThProps) {
  const active = sort?.key === sortKey;

  return (
    <th
      scope="col"
      aria-sort={
        active
          ? sort.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
      className={className}
    >
      {sortable ? (
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className="flex items-center gap-1 uppercase tracking-wide hover:text-slate-700"
        >
          {label}
          <span aria-hidden="true">
            {active ? (sort.direction === "asc" ? "↑" : "↓") : ""}
          </span>
        </button>
      ) : (
        label
      )}
    </th>
  );
}
