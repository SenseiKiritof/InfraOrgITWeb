import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Pagination } from "../../components/Pagination";
import { PageHeader, SearchForm } from "../../components/page";
import { SortableTh } from "../../components/SortableTh";
import { columnWidths } from "../../lib/columnWidths";
import { formatDateTime } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import type { CommandExecution } from "../../lib/remote";
import { getExecutions } from "../../lib/remote";
import { nextSort, type SortState } from "../../lib/sort";
import { useQueryFilter } from "../../lib/useQueryFilter";

interface ExecutionColumn {
  key: string;
  label: string;
  weight: number;
  render: (row: CommandExecution) => ReactNode;
}

export function ExecutionsPage() {
  const { t } = useI18n();
  const columns: ExecutionColumn[] = [
    {
      key: "startedAt",
      weight: 17,
      label: t("executions.date"),
      render: (row) => formatDateTime(row.startedAt),
    },
    {
      key: "username",
      label: t("common.user"),
      weight: 12,
      render: (row) => row.username,
    },
    {
      key: "serverName",
      label: t("common.server"),
      weight: 18,
      render: (row) => row.serverName,
    },
    {
      key: "kind",
      label: t("common.type"),
      weight: 10,
      render: (row) => row.kind,
    },
    {
      key: "label",
      label: t("common.label"),
      weight: 27,
      render: (row) => row.label,
    },
    {
      key: "exitCode",
      label: "Exit",
      weight: 6,
      render: (row) => row.exitCode ?? "—",
    },
  ];
  const { search, setSearch, q, setQ } = useQueryFilter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState<SortState>(null);
  const sortParam = sort
    ? `${sort.direction === "desc" ? "-" : ""}${sort.key}`
    : undefined;

  const executions = useQuery({
    queryKey: ["command-executions", q, page, pageSize, sortParam],
    queryFn: () => getExecutions({ q, page, pageSize, sort: sortParam }),
    retry: false,
    placeholderData: (previous) => previous,
  });

  const total = executions.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const widths = columnWidths(columns, undefined, 10);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const changeSort = (key: string) => {
    setSort((current) => nextSort(current, key));
    setPage(1);
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title={t("executions.title")}
        description={t("executions.description")}
      />
      <SearchForm
        value={search}
        onChange={setSearch}
        onSubmit={() => {
          setQ(search);
          setPage(1);
        }}
      />
      <div className="rounded-lg border border-slate-200 bg-white">
        {executions.isLoading ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            {t("common.loading")}
          </p>
        ) : executions.data?.items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            {t("executions.none")}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <colgroup>
                  {widths.map((width, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
                    <col key={index} style={{ width }} />
                  ))}
                </colgroup>
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {columns.map((column) => (
                      <SortableTh
                        key={column.key}
                        label={column.label}
                        sortKey={column.key}
                        sort={sort}
                        onSort={changeSort}
                      />
                    ))}
                    <th className="px-4 py-2">{t("executions.output")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(executions.data?.items ?? []).map((execution) => (
                    <tr
                      key={execution.id}
                      className="border-t border-slate-100 align-top"
                    >
                      {columns.map((column) => (
                        <td key={column.key} className="px-4 py-2">
                          {column.render(execution)}
                        </td>
                      ))}
                      <td className="px-4 py-2">
                        <details>
                          <summary className="cursor-pointer underline">
                            {t("executions.detail")}
                          </summary>
                          <pre className="mt-2 max-h-48 max-w-xl overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
                            {execution.output || t("executions.empty")}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageCount={pageCount}
              total={total}
              pageSize={pageSize}
              onPage={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </>
        )}
      </div>
    </section>
  );
}
