import { useQuery } from "@tanstack/react-query";
import { Pagination } from "../../components/Pagination";
import { PageHeader, SearchForm } from "../../components/page";
import { SortableTh } from "../../components/SortableTh";
import { columnWidths } from "../../lib/columnWidths";
import { usePagination } from "../../lib/pagination";
import type { CommandExecution } from "../../lib/remote";
import { getExecutions } from "../../lib/remote";
import { nextSort, useSortedRows } from "../../lib/sort";
import { useQueryFilter } from "../../lib/useQueryFilter";

export function ExecutionsPage() {
  const { search, setSearch, q, setQ } = useQueryFilter();
  const executions = useQuery({
    queryKey: ["command-executions", q],
    queryFn: () => getExecutions(q),
    retry: false,
  });
  const ordered = useSortedRows(executions.data?.items, (row, key) =>
    key === "startedAt"
      ? row.startedAt
      : key === "exitCode"
        ? (row.exitCode ?? -1)
        : (row as unknown as Record<string, unknown>)[key],
  );

  const paginated = usePagination(ordered.rows);
  const widths = columnWidths(
    [
      {
        label: "Data",
        render: (row: CommandExecution) =>
          new Date(row.startedAt).toLocaleString(),
      },
      { label: "Utente", render: (row: CommandExecution) => row.username },
      { label: "Server", render: (row: CommandExecution) => row.serverName },
      { label: "Tipo", render: (row: CommandExecution) => row.kind },
      { label: "Etichetta", render: (row: CommandExecution) => row.label },
      { label: "Exit", render: (row: CommandExecution) => row.exitCode ?? "—" },
    ],
    ordered.rows,
    12,
  );

  return (
    <section className="space-y-4">
      <PageHeader
        title="Registro esecuzioni"
        description="Audit delle esecuzioni remote: script e output sono redatti."
      />
      <SearchForm
        value={search}
        onChange={setSearch}
        onSubmit={() => setQ(search)}
      />
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {executions.isLoading ? (
          <p className="px-4 py-6 text-sm text-slate-500">Caricamento…</p>
        ) : executions.data?.items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            Nessuna esecuzione.
          </p>
        ) : (
          <>
            <table className="w-full text-left text-sm">
              <colgroup>
                {widths.map((width, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
                  <col key={index} style={{ width }} />
                ))}
              </colgroup>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {[
                    ["Data", "startedAt"],
                    ["Utente", "username"],
                    ["Server", "serverName"],
                    ["Tipo", "kind"],
                    ["Etichetta", "label"],
                    ["Exit", "exitCode"],
                  ].map(([label, key]) => (
                    <SortableTh
                      key={key}
                      label={label}
                      sortKey={key}
                      sort={ordered.sort}
                      onSort={(next) =>
                        ordered.setSort((current) => nextSort(current, next))
                      }
                    />
                  ))}
                  <th className="px-4 py-2">Output</th>
                </tr>
              </thead>
              <tbody>
                {(paginated.items ?? []).map((execution) => (
                  <tr
                    key={execution.id}
                    className="border-t border-slate-100 align-top"
                  >
                    <td className="px-4 py-2 whitespace-nowrap">
                      {new Date(execution.startedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">{execution.username}</td>
                    <td className="px-4 py-2">{execution.serverName}</td>
                    <td className="px-4 py-2">{execution.kind}</td>
                    <td className="px-4 py-2">{execution.label}</td>
                    <td className="px-4 py-2">{execution.exitCode ?? "—"}</td>
                    <td className="px-4 py-2">
                      <details>
                        <summary className="cursor-pointer underline">
                          Dettaglio
                        </summary>
                        <pre className="mt-2 max-h-48 max-w-xl overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
                          {execution.output || "(vuoto)"}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={paginated.page}
              pageCount={paginated.pageCount}
              total={paginated.total}
              onPage={paginated.setPage}
            />
          </>
        )}
      </div>
    </section>
  );
}
