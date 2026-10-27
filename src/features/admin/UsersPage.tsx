import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { PageHeader, SearchForm } from "../../components/page";
import { SortableTh } from "../../components/SortableTh";
import type { AdminUser } from "../../lib/admin";
import { getGroups, getRoles, getUsers } from "../../lib/admin";
import { deleteEntity, saveEntity } from "../../lib/inventory";
import { nextSort, useSortedRows } from "../../lib/sort";

const userSortValue = (user: AdminUser, key: string) =>
  key === "name" ? `${user.name} ${user.surname}` : user.username;

export function UsersPage() {
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<AdminUser | "new" | null>(null);
  const [form, setForm] = useState({ username: "", name: "", surname: "" });
  const [groupIds, setGroupIds] = useState<number[]>([]);
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      setError(
        cause instanceof Error ? cause.message : "Errore di salvataggio",
      );
    }
  };

  const remove = async (user: AdminUser) => {
    if (!window.confirm(`Eliminare l'utente ${user.username}?`)) return;
    setError(null);
    try {
      await deleteEntity(`/api/users/${user.id}`, csrf);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Errore di eliminazione",
      );
    }
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title="Utenti"
        description="Utenti provisionati da Keycloak e ruoli assegnati."
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
            Utenti
          </h2>
          <button
            type="button"
            onClick={() => start("new")}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Nuovo utente
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <SortableTh
                  label="Username"
                  sortKey="username"
                  sort={ordered.sort}
                  onSort={(key) =>
                    ordered.setSort((current) => nextSort(current, key))
                  }
                />
                <SortableTh
                  label="Nome"
                  sortKey="name"
                  sort={ordered.sort}
                  onSort={(key) =>
                    ordered.setSort((current) => nextSort(current, key))
                  }
                />
                <th className="px-4 py-2">Gruppi</th>
                <th className="px-4 py-2">Ruoli</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {(ordered.rows ?? []).map((user) => (
                <tr key={user.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{user.username}</td>
                  <td className="px-4 py-2">
                    {user.name} {user.surname}
                  </td>
                  <td className="px-4 py-2">
                    {user.groups.map((x) => x.name).join(", ")}
                  </td>
                  <td className="px-4 py-2">
                    {user.roles.map((x) => x.label).join(", ")}
                  </td>
                  <td className="space-x-3 px-4 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => start(user)}
                      className="text-sm underline"
                    >
                      Modifica
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(user)}
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
      </div>

      {editing !== null && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-label={editing === "new" ? "Nuovo utente" : "Modifica utente"}
            onSubmit={(event) => void submit(event)}
            className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-5 shadow-xl"
          >
            <h2 className="text-lg font-semibold">
              {editing === "new" ? "Nuovo utente" : "Modifica utente"}
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {(["username", "name", "surname"] as const).map((field) => (
                <label key={field} className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">
                    {field === "username"
                      ? "Username"
                      : field === "name"
                        ? "Nome"
                        : "Cognome"}
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
                <legend className="text-sm font-medium">Gruppi</legend>
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
                <legend className="text-sm font-medium">Ruoli</legend>
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
