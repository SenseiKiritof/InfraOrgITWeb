import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import { AutocompleteSelect } from "../../components/AutocompleteSelect";
import { PageHeaderSlot } from "../../components/PageHeaderSlot";
import { Pagination } from "../../components/Pagination";
import { SearchForm } from "../../components/page";
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
import { useI18n } from "../../lib/i18n";
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
  const { t } = useI18n();
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
      setError(cause instanceof Error ? cause.message : t("common.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (diagram: Diagram) => {
    if (!window.confirm(t("diagrams.deleteConfirm", { name: diagram.name })))
      return;
    setError(null);
    try {
      await deleteDiagram(diagram.id, csrf);
      await queryClient.invalidateQueries({ queryKey: ["diagrams"] });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t("common.deleteError"),
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
          ? t("diagrams.scopeEnvironment", { name })
          : item.scopeType === "Provider"
            ? t("diagrams.scopeProvider", { name })
            : t("diagrams.scopeProject", { name });
      })
      .join(", ") || t("diagrams.globalView");

  const canCreate =
    isSystemAdmin || (access.data?.adminEnvironmentIds.length ?? 0) > 0;

  const columns = [
    {
      key: "name",
      label: t("common.name"),
      render: (row: Diagram) => row.name,
    },
    {
      key: "scope",
      label: t("common.scope"),
      render: (row: Diagram) => scopeLabel(row),
    },
    {
      key: "isDefault",
      label: t("diagrams.default"),
      render: (row: Diagram) => (row.isDefault ? t("common.yes") : ""),
    },
  ];
  const paginated = usePagination(ordered.rows);
  const widths = columnWidths(columns, ordered.rows, 20);

  return (
    <section className="space-y-4">
      <PageHeaderSlot
        title={t("diagrams.title")}
        description={t("diagrams.description")}
        actions={
          <Link
            to="/diagrams/default"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {t("diagrams.globalView")}
          </Link>
        }
      />
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
          <span />
          {canCreate && (
            <button
              type="button"
              onClick={startCreate}
              className="rounded-md border border-transparent bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              {t("diagrams.create")}
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          {diagrams.isLoading ? (
            <p className="px-4 py-6 text-sm text-slate-500">
              {t("common.loading")}
            </p>
          ) : diagrams.data?.items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">
              {t("diagrams.none")}
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
                    <span className="sr-only">{t("common.actions")}</span>
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
                        {t("common.open")}
                      </Link>
                      <button
                        type="button"
                        onClick={() => startEdit(diagram)}
                        className="text-sm underline"
                      >
                        {t("common.edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(diagram)}
                        className="text-sm text-red-700 underline"
                      >
                        {t("common.delete")}
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
              editing === "new" ? t("diagrams.create") : t("diagrams.edit")
            }
            onSubmit={(event) => void submit(event)}
            className="max-h-[85vh] overflow-y-auto w-full max-w-lg rounded-lg bg-white p-5 shadow-xl"
          >
            <h2 className="text-lg font-semibold">
              {editing === "new" ? t("diagrams.create") : t("diagrams.edit")}
            </h2>
            <div className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="diagram-name"
                  className="block text-sm font-medium"
                >
                  {t("common.name")}
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
                  {t("common.description")}
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
                  {t("diagrams.useAsDefault")}
                </label>
              )}
              <div>
                <label
                  htmlFor="diagram-provider"
                  className="block text-sm font-medium"
                >
                  {t("diagrams.providerOptional")}
                </label>
                <AutocompleteSelect
                  id="diagram-provider"
                  value={form.providerId}
                  disabled={!isSystemAdmin}
                  options={[
                    { value: "", label: "—" },
                    ...(providers.data?.items.map((provider) => ({
                      value: String(provider.id),
                      label: provider.name,
                    })) ?? []),
                  ]}
                  onChange={(value) => setForm({ ...form, providerId: value })}
                />
              </div>
              <div>
                <label
                  htmlFor="diagram-environment"
                  className="block text-sm font-medium"
                >
                  {t("diagrams.environmentOptional")}
                </label>
                <AutocompleteSelect
                  id="diagram-environment"
                  value={form.environmentId}
                  options={[
                    { value: "", label: "—" },
                    ...(environments.data?.items.map((environment) => ({
                      value: String(environment.id),
                      label: environment.name,
                    })) ?? []),
                  ]}
                  onChange={(value) =>
                    setForm({ ...form, environmentId: value })
                  }
                />
              </div>
              <div>
                <label
                  htmlFor="diagram-project"
                  className="block text-sm font-medium"
                >
                  {t("diagrams.projectOptional")}
                </label>
                <AutocompleteSelect
                  id="diagram-project"
                  value={form.projectId}
                  disabled={!isSystemAdmin}
                  options={[
                    { value: "", label: "—" },
                    ...(projects.data?.items.map((project) => ({
                      value: String(project.id),
                      label: project.name,
                    })) ?? []),
                  ]}
                  onChange={(value) => setForm({ ...form, projectId: value })}
                />
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
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md border border-transparent bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {t("common.save")}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
