import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { Pagination } from "../../components/Pagination";
import { PageHeader } from "../../components/page";
import { SortableTh } from "../../components/SortableTh";
import type { AdminMenu } from "../../lib/admin";
import { getAdminMenus, getRoles } from "../../lib/admin";
import { columnWidths } from "../../lib/columnWidths";
import { deleteEntity, saveEntity } from "../../lib/inventory";
import { usePagination } from "../../lib/pagination";
import { nextSort, useSortedRows } from "../../lib/sort";

interface MenuForm {
  name: string;
  path: string;
  order: string;
  parentId: string;
  isActive: boolean;
  hideBackButton: boolean;
  isVisible: boolean;
  roleIds: number[];
}

const empty: MenuForm = {
  name: "",
  path: "",
  order: "0",
  parentId: "",
  isActive: true,
  hideBackButton: false,
  isVisible: true,
  roleIds: [],
};

export function MenusPage() {
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const queryClient = useQueryClient();
  const menus = useQuery({
    queryKey: ["admin-menus"],
    queryFn: getAdminMenus,
    retry: false,
  });
  const roles = useQuery({ queryKey: ["roles", "options"], queryFn: getRoles });
  const [editing, setEditing] = useState<AdminMenu | "new" | null>(null);
  const [form, setForm] = useState<MenuForm>(empty);
  const [error, setError] = useState<string | null>(null);

  const start = (menu: AdminMenu | "new") => {
    setError(null);
    setEditing(menu);
    if (menu === "new") {
      setForm(empty);
      return;
    }
    setForm({
      name: menu.name,
      path: menu.path,
      order: menu.order === null ? "" : String(menu.order),
      parentId: menu.parentId === null ? "" : String(menu.parentId),
      isActive: menu.isActive,
      hideBackButton: menu.hideBackButton,
      isVisible: menu.isVisible,
      roleIds: menu.roleIds,
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await saveEntity(
        "/api/menus",
        editing === "new" || editing === null ? null : editing.id,
        {
          name: form.name,
          path: form.path,
          order: form.order ? Number(form.order) : null,
          parentId: form.parentId ? Number(form.parentId) : null,
          isActive: form.isActive,
          hideBackButton: form.hideBackButton,
          isVisible: form.isVisible,
          roleIds: form.roleIds,
        },
        csrf,
      );
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-menus"] });
      await queryClient.invalidateQueries({ queryKey: ["menus"] });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Errore di salvataggio",
      );
    }
  };

  const remove = async (menu: AdminMenu) => {
    if (!window.confirm(`Eliminare il menu "${menu.name}"?`)) return;
    setError(null);
    try {
      await deleteEntity(`/api/menus/${menu.id}`, csrf);
      await queryClient.invalidateQueries({ queryKey: ["admin-menus"] });
      await queryClient.invalidateQueries({ queryKey: ["menus"] });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Errore di eliminazione",
      );
    }
  };

  const parentName = (id: number | null) =>
    id === null ? "" : (menus.data?.find((x) => x.id === id)?.name ?? `#${id}`);

  const ordered = useSortedRows(menus.data, (menu, key) =>
    key === "parent"
      ? parentName(menu.parentId)
      : key === "roles"
        ? menu.roleIds.length
        : (menu as unknown as Record<string, unknown>)[key],
  );

  const toggleRole = (id: number) =>
    setForm({
      ...form,
      roleIds: form.roleIds.includes(id)
        ? form.roleIds.filter((x) => x !== id)
        : [...form.roleIds, id],
    });

  const columns = [
    { key: "name", label: "Nome", render: (menu: AdminMenu) => menu.name },
    { key: "path", label: "Path", render: (menu: AdminMenu) => menu.path },
    {
      key: "parent",
      label: "Padre",
      render: (menu: AdminMenu) => parentName(menu.parentId),
    },
    {
      key: "order",
      label: "Ordine",
      render: (menu: AdminMenu) => menu.order ?? "",
    },
    {
      key: "isActive",
      label: "Attivo",
      render: (menu: AdminMenu) => (menu.isActive ? "sì" : "no"),
    },
    {
      key: "isVisible",
      label: "Visibile",
      render: (menu: AdminMenu) => (menu.isVisible ? "sì" : "no"),
    },
    {
      key: "roles",
      label: "Ruoli",
      render: (menu: AdminMenu) => menu.roleIds.length,
    },
  ];
  const paginated = usePagination(ordered.rows);
  const widths = columnWidths(columns, ordered.rows, 20);

  return (
    <section className="space-y-4">
      <PageHeader
        title="Menu"
        description="Voci della sidebar e ruoli che possono vederle."
      />
      {error && (
        <p
          role="alert"
          className="rounded bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Menu
          </h2>
          <button
            type="button"
            onClick={() => start("new")}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Nuovo menu
          </button>
        </div>
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
              {(paginated.items ?? []).map((menu) => (
                <tr key={menu.id} className="border-t border-slate-100">
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-2">
                      {column.render(menu)}
                    </td>
                  ))}
                  <td className="space-x-3 px-4 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => start(menu)}
                      className="text-sm underline"
                    >
                      Modifica
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(menu)}
                      className="text-sm text-red-700 underline"
                    >
                      Elimina
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={paginated.page}
          pageCount={paginated.pageCount}
          total={paginated.total}
          onPage={paginated.setPage}
        />
      </div>

      {editing !== null && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-label={editing === "new" ? "Nuovo menu" : "Modifica menu"}
            onSubmit={(event) => void submit(event)}
            className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-5 shadow-xl"
          >
            <h2 className="text-lg font-semibold">
              {editing === "new" ? "Nuovo menu" : "Modifica menu"}
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Nome</span>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  required
                  className="rounded-md border border-slate-300 px-3 py-1.5"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Path</span>
                <input
                  value={form.path}
                  onChange={(event) =>
                    setForm({ ...form, path: event.target.value })
                  }
                  required
                  className="rounded-md border border-slate-300 px-3 py-1.5"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Ordine</span>
                <input
                  type="number"
                  value={form.order}
                  onChange={(event) =>
                    setForm({ ...form, order: event.target.value })
                  }
                  className="rounded-md border border-slate-300 px-3 py-1.5"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Padre</span>
                <select
                  value={form.parentId}
                  onChange={(event) =>
                    setForm({ ...form, parentId: event.target.value })
                  }
                  className="rounded-md border border-slate-300 px-3 py-1.5"
                >
                  <option value="">— nessuno —</option>
                  {menus.data
                    ?.filter(
                      (menu) => editing === "new" || menu.id !== editing.id,
                    )
                    .map((menu) => (
                      <option key={menu.id} value={menu.id}>
                        {menu.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) =>
                    setForm({ ...form, isActive: event.target.checked })
                  }
                />
                Attivo
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isVisible}
                  onChange={(event) =>
                    setForm({ ...form, isVisible: event.target.checked })
                  }
                />
                Visibile
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.hideBackButton}
                  onChange={(event) =>
                    setForm({ ...form, hideBackButton: event.target.checked })
                  }
                />
                Nasconde il pulsante Indietro
              </label>
            </div>

            <fieldset className="mt-4">
              <legend className="text-sm font-medium">
                Ruoli che vedono la voce
              </legend>
              <div className="mt-1 grid grid-cols-2 gap-1 text-sm">
                {roles.data?.items.map((role) => (
                  <label key={role.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.roleIds.includes(role.id)}
                      onChange={() => toggleRole(role.id)}
                    />
                    {role.label}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Nessun ruolo selezionato: la voce è visibile a tutti gli
                autenticati.
              </p>
            </fieldset>

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
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white"
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
