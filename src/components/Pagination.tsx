import { useI18n } from "../lib/i18n";
import { PAGE_SIZES } from "../lib/pagination";

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const { t } = useI18n();
  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-2 text-sm">
      <span className="text-slate-500">
        {total} {t(total === 1 ? "pagination.item" : "pagination.items")}
        {pageCount > 1 && ` · ${t("pagination.pageInfo", { page, pageCount })}`}
      </span>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1 text-xs text-slate-500">
          {t("pagination.itemsPerPage")}
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        {pageCount > 1 && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
              className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
            >
              {t("pagination.previous")}
            </button>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => onPage(page + 1)}
              className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
            >
              {t("pagination.next")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
