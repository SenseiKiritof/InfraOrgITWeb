import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader, SearchForm } from "../../components/page";
import { SortableTh } from "../../components/SortableTh";
import { getExecutions } from "../../lib/remote";
import { nextSort, useSortedRows } from "../../lib/sort";

export function ExecutionsPage() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
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
          <table className="w-full text-left text-sm">
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
              {(ordered.rows ?? []).map((execution) => (
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
        )}
      </div>
    </section>
  );
}
