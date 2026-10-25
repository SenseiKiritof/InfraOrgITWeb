import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader, SearchForm } from "../../components/page";
import { getExecutions } from "../../lib/remote";

export function ExecutionsPage() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const executions = useQuery({
    queryKey: ["command-executions", q],
    queryFn: () => getExecutions(q),
    retry: false,
  });

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
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2">Utente</th>
                <th className="px-4 py-2">Server</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Etichetta</th>
                <th className="px-4 py-2">Exit</th>
                <th className="px-4 py-2">Output</th>
              </tr>
            </thead>
            <tbody>
              {executions.data?.items.map((execution) => (
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
