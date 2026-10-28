import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import { Pagination } from "../../components/Pagination";
import { PageHeader, SearchForm } from "../../components/page";
import { SortableTh } from "../../components/SortableTh";
import { columnWidths } from "../../lib/columnWidths";
import type {
  Diagram,
  DiagramInput,
  DiagramScopeItem,
} from "../../lib/diagrams";
import {
  createDiagram,
  deleteDiagram,
  getDiagrams,
  updateDiagram,
} from "../../lib/diagrams";
import type { Environment, Project, Provider } from "../../lib/inventory";
import { paged } from "../../lib/inventory";
import { usePagination } from "../../lib/pagination";
import { nextSort, useSortedRows } from "../../lib/sort";
import { useQueryFilter } from "../../lib/useQueryFilter";
import { useServerAccess } from "../../lib/useServerAccess";

interface FormState {
  name: string;
  description: string;
  isDefault: boolean;
  providerId: string;
  environmentId: string;
  projectId: string;
}

const emptyForm: FormState = {
  name: "",
  description: "",
  isDefault: false,
  providerId: "",
  environmentId: "",
  projectId: "",
};

export function DiagramsPage() {
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const access = useServerAccess();
  const isSystemAdmin = access.data?.isSystemAdmin ?? false;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { search, setSearch, q, setQ } = useQueryFilter();
  const [editing, setEditing] = useState<Diagram | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const diagrams = useQuery({
    queryKey: ["diagrams", q],
    queryFn: () => getDiagrams(q),
  });

  const providers = useQuery({
    queryKey: ["providers", "options"],
    queryFn: () => paged<Provider>("/api/providers"),
  });
  const environments = useQuery({
    queryKey: ["environments", "options"],
    queryFn: () => paged<Environment>("/api/environments"),
  });
  const projects = useQuery({
    queryKey: ["projects", "options"],
    queryFn: () => paged<Project>("/api/projects"),
  });

  const startCreate = () => {
    setForm(emptyForm);
    setError(null);
    setEditing("new");
  };

  const startEdit = (diagram: Diagram) => {
    const scope = (type: string) =>
      String(
        diagram.scopeItems.find((item) => item.scopeType === type)?.entityId ??
          "",
      );
    setForm({
      name: diagram.name,
      description: diagram.description ?? "",
      isDefault: diagram.isDefault,
      providerId: scope("Provider"),
      environmentId: scope("ProviderEnvironment"),
      projectId: scope("Project"),
    });
    setError(null);
    setEditing(diagram);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const scopeItems: DiagramScopeItem[] = [];
      if (form.providerId)
        scopeItems.push({
          scopeType: "Provider",
          entityId: Number(form.providerId),
        });
      if (form.environmentId)
        scopeItems.push({
          scopeType: "ProviderEnvironment",
          entityId: Number(form.environmentId),
        });
      if (form.projectId)
        scopeItems.push({
          scopeType: "Project",
          entityId: Number(form.projectId),
        });

      const input: DiagramInput = {
        name: form.name,
        description: form.description || null,
        isDefault: form.isDefault,
        scopeItems,
      };

      if (editing === "new") {
        const created = await createDiagram(input, csrf);
        setEditing(null);
        await queryClient.invalidateQueries({ queryKey: ["diagrams"] });
        navigate(`/diagrams/${created.id}`);
        return;
      }

      if (editing) {
        await updateDiagram(editing.id, input, csrf);
        setEditing(null);
        await queryClient.invalidateQueries({ queryKey: ["diagrams"] });
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Errore di salvataggio",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (diagram: Diagram) => {
    if (!window.confirm(`Eliminare il diagramma "${diagram.name}"?`)) return;
    setError(null);
    try {
      await deleteDiagram(diagram.id, csrf);
      await queryClient.invalidateQueries({ queryKey: ["diagrams"] });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Errore di eliminazione",
      );
    }
  };

  const ordered = useSortedRows(diagrams.data?.items, (diagram, key) =>
    key === "scope"
      ? scopeLabel(diagram)
      : (diagram as unknown as Record<string, unknown>)[key],
  );

  const scopeLabel = (diagram: Diagram) =>
    diagram.scopeItems
      .map((item) => {
        const options =
          item.scopeType === "Provider"
            ? providers.data?.items
            : item.scopeType === "ProviderEnvironment"
              ? environments.data?.items
              : projects.data?.items;
        const name =
          options?.find((option) => option.id === item.entityId)?.name ??
          `#${item.entityId}`;
        return item.scopeType === "ProviderEnvironment"
          ? `Ambiente ${name}`
          : item.scopeType === "Provider"
            ? `Provider ${name}`
            : `Progetto ${name}`;
      })
      .join(", ") || "Vista globale";

  const canCreate =
    isSystemAdmin || (access.data?.adminEnvironmentIds.length ?? 0) > 0;

  const columns = [
    { key: "name", label: "Nome", render: (row: Diagram) => row.name },
    { key: "scope", label: "Scope", render: (row: Diagram) => scopeLabel(row) },
    {
      key: "isDefault",
      label: "Predefinito",
      render: (row: Diagram) => (row.isDefault ? "sì" : ""),
    },
  ];
  const paginated = usePagination(ordered.rows);
  const widths = columnWidths(columns, ordered.rows, 20);

  return (
    <section className="space-y-4">
      <PageHeader
        title="Diagrammi"
        description="Vista globale e diagrammi salvati."
      >
        <Link
          to="/diagrams/default"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          Vista globale
        </Link>
      </PageHeader>
      <SearchForm
        value={search}
        onChange={setSearch}
        onSubmit={() => setQ(search)}
      />

      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Diagrammi
          </h2>
          {canCreate && (
            <button
              type="button"
              onClick={startCreate}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              Nuovo diagramma
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          {diagrams.isLoading ? (
            <p className="px-4 py-6 text-sm text-slate-500">Caricamento…</p>
          ) : diagrams.data?.items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">
              Nessun diagramma.
            </p>
          ) : (
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
                      sort={ordered.sort}
                      onSort={(key) =>
                        ordered.setSort((current) => nextSort(current, key))
                      }
                    />
                  ))}
                  <th className="px-4 py-2">
                    <span className="sr-only">Azioni</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(paginated.items ?? []).map((diagram) => (
                  <tr key={diagram.id} className="border-t border-slate-100">
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={
                          column.key === "scope"
                            ? "px-4 py-2 text-slate-600"
                            : "px-4 py-2"
                        }
                      >
                        {column.render(diagram)}
                      </td>
                    ))}
                    <td className="space-x-3 px-4 py-2 text-right whitespace-nowrap">
                      <Link
                        to={`/diagrams/${diagram.id}`}
                        className="text-sm font-medium underline"
                      >
                        Apri
                      </Link>
                      <button
                        type="button"
                        onClick={() => startEdit(diagram)}
                        className="text-sm underline"
                      >
                        Modifica
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(diagram)}
                        className="text-sm text-red-700 underline"
                      >
                        Elimina
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Pagination
          page={paginated.page}
          pageCount={paginated.pageCount}
          total={paginated.total}
          pageSize={paginated.pageSize}
          onPage={paginated.setPage}
          onPageSizeChange={paginated.setPageSize}
        />
      </div>

      {editing !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-label={
              editing === "new" ? "Nuovo diagramma" : "Modifica diagramma"
            }
            onSubmit={(event) => void submit(event)}
            className="max-h-[85vh] overflow-y-auto w-full max-w-lg rounded-lg bg-white p-5 shadow-xl"
          >
            <h2 className="text-lg font-semibold">
              {editing === "new" ? "Nuovo diagramma" : "Modifica diagramma"}
            </h2>
            <div className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="diagram-name"
                  className="block text-sm font-medium"
                >
                  Nome
                </label>
                <input
                  id="diagram-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  required
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="diagram-description"
                  className="block text-sm font-medium"
                >
                  Descrizione
                </label>
                <textarea
                  id="diagram-description"
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  rows={2}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              {isSystemAdmin && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={(event) =>
                      setForm({ ...form, isDefault: event.target.checked })
                    }
                  />
                  Usa come vista globale predefinita
                </label>
              )}
              <div>
                <label
                  htmlFor="diagram-provider"
                  className="block text-sm font-medium"
                >
                  Provider (opzionale)
                </label>
                <select
                  id="diagram-provider"
                  value={form.providerId}
                  disabled={!isSystemAdmin}
                  onChange={(event) =>
                    setForm({ ...form, providerId: event.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                >
                  <option value="">—</option>
                  {providers.data?.items.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="diagram-environment"
                  className="block text-sm font-medium"
                >
                  Ambiente (opzionale)
                </label>
                <select
                  id="diagram-environment"
                  value={form.environmentId}
                  onChange={(event) =>
                    setForm({ ...form, environmentId: event.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                >
                  <option value="">—</option>
                  {environments.data?.items.map((environment) => (
                    <option key={environment.id} value={environment.id}>
                      {environment.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="diagram-project"
                  className="block text-sm font-medium"
                >
                  Progetto (opzionale)
                </label>
                <select
                  id="diagram-project"
                  value={form.projectId}
                  disabled={!isSystemAdmin}
                  onChange={(event) =>
                    setForm({ ...form, projectId: event.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                >
                  <option value="">—</option>
                  {projects.data?.items.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Salva
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
