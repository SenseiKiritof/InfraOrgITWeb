import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { Pagination } from "../../components/Pagination";
import { PageHeader, SearchForm } from "../../components/page";
import { SortableTh } from "../../components/SortableTh";
import type { AdminUser } from "../../lib/admin";
import { getGroups, getRoles, getUsers } from "../../lib/admin";
import { columnWidths } from "../../lib/columnWidths";
import { useI18n } from "../../lib/i18n";
import { deleteEntity, saveEntity } from "../../lib/inventory";
import { usePagination } from "../../lib/pagination";
import { nextSort, useSortedRows } from "../../lib/sort";
import { useQueryFilter } from "../../lib/useQueryFilter";

const userSortValue = (user: AdminUser, key: string) =>
  key === "name" ? `${user.name} ${user.surname}` : user.username;

export function UsersPage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const csrf = session?.csrfToken ?? "";
  const queryClient = useQueryClient();
  const { search, setSearch, q, setQ } = useQueryFilter();
  const [editing, setEditing] = useState<AdminUser | "new" | null>(null);
  const [form, setForm] = useState({ username: "", name: "", surname: "" });
  const [groupIds, setGroupIds] = useState<number[]>([]);
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const columns = [
    {
      key: "username",
      label: t("common.username"),
      render: (user: AdminUser) => user.username,
    },
    {
      key: "name",
      label: t("common.name"),
      render: (user: AdminUser) => `${user.name} ${user.surname}`,
    },
    {
      key: "groups",
      label: t("common.groups"),
      sortable: false,
      render: (user: AdminUser) => user.groups.map((x) => x.name).join(", "),
    },
    {
      key: "roles",
      label: t("common.roles"),
      sortable: false,
      render: (user: AdminUser) => user.roles.map((x) => x.label).join(", "),
    },
  ];

  const users = useQuery({
    queryKey: ["users", q],
    queryFn: () => getUsers(q),
    retry: false,
  });
  const groups = useQuery({
    queryKey: ["groups", "options"],
    queryFn: getGroups,
  });
  const roles = useQuery({ queryKey: ["roles", "options"], queryFn: getRoles });
  const ordered = useSortedRows(users.data?.items, userSortValue);

  const start = (user: AdminUser | "new") => {
    setEditing(user);
    setError(null);
    if (user === "new") {
      setForm({ username: "", name: "", surname: "" });
      setGroupIds([]);
      setRoleIds([]);
      return;
    }
    setForm({
      username: user.username,
      name: user.name,
      surname: user.surname,
    });
    setGroupIds(user.groups.map((x) => x.id));
    setRoleIds(user.roles.map((x) => x.id));
  };

  const toggle = (
    values: number[],
    id: number,
    set: (next: number[]) => void,
  ) =>
    set(values.includes(id) ? values.filter((x) => x !== id) : [...values, id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await saveEntity(
        "/api/users",
        editing === "new" || editing === null ? null : editing.id,
        { ...form, groupIds, roleIds },
        csrf,
      );
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("common.saveError"));
    }
  };

  const remove = async (user: AdminUser) => {
    if (!window.confirm(t("users.deleteConfirm", { username: user.username })))
      return;
    setError(null);
    try {
      await deleteEntity(`/api/users/${user.id}`, csrf);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t("common.deleteError"),
      );
    }
  };

  const paginated = usePagination(ordered.rows);
  const widths = columnWidths(columns, ordered.rows, 20);

  return (
    <section className="space-y-4">
      <PageHeader
        title={t("users.title")}
        description={t("users.description")}
      />
      <SearchForm
        value={search}
        onChange={setSearch}
        onSubmit={() => setQ(search)}
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
            {t("users.title")}
          </h2>
          <button
            type="button"
            onClick={() => start("new")}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            {t("users.create")}
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
                    sortable={column.sortable !== false}
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
              {(paginated.items ?? []).map((user) => (
                <tr key={user.id} className="border-t border-slate-100">
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-2">
                      {column.render(user)}
                    </td>
                  ))}
                  <td className="space-x-3 px-4 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => start(user)}
                      className="text-sm underline"
                    >
                      {t("common.edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(user)}
                      className="text-sm text-red-700 underline"
                    >
                      {t("common.delete")}
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
            aria-label={editing === "new" ? t("users.create") : t("users.edit")}
            onSubmit={(event) => void submit(event)}
            className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-5 shadow-xl"
          >
            <h2 className="text-lg font-semibold">
              {editing === "new" ? t("users.create") : t("users.edit")}
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {(["username", "name", "surname"] as const).map((field) => (
                <label key={field} className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">
                    {field === "username"
                      ? t("common.username")
                      : field === "name"
                        ? t("common.name")
                        : t("common.surname")}
                  </span>
                  <input
                    value={form[field]}
                    onChange={(event) =>
                      setForm({ ...form, [field]: event.target.value })
                    }
                    required
                    className="rounded-md border border-slate-300 px-3 py-1.5"
                  />
                </label>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <fieldset>
                <legend className="text-sm font-medium">
                  {t("common.groups")}
                </legend>
                <div className="mt-1 max-h-48 space-y-1 overflow-auto text-sm">
                  {groups.data?.items.map((group) => (
                    <label key={group.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={groupIds.includes(group.id)}
                        onChange={() => toggle(groupIds, group.id, setGroupIds)}
                      />
                      {group.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-sm font-medium">
                  {t("common.roles")}
                </legend>
                <div className="mt-1 max-h-48 space-y-1 overflow-auto text-sm">
                  {roles.data?.items.map((role) => (
                    <label key={role.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={roleIds.includes(role.id)}
                        onChange={() => toggle(roleIds, role.id, setRoleIds)}
                      />
                      {role.label}
                    </label>
                  ))}
                </div>
              </fieldset>
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
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white"
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
