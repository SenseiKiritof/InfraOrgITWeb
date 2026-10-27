import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeader } from "../../components/page";
import type { Server } from "../../lib/inventory";
import { deleteEntity, saveEntity } from "../../lib/inventory";
import type { ServerCredential } from "../../lib/remote";
import {
  assignServerSsh,
  getCredentials,
  getServersForCredential,
  splitServersByCredential,
} from "../../lib/remote";

export function CredentialsPage() {
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const queryClient = useQueryClient();
  const [managing, setManaging] = useState<ServerCredential | null>(null);
  const [selectedServerIds, setSelectedServerIds] = useState<number[]>([]);
  const [serverFilter, setServerFilter] = useState("");
  const [managerError, setManagerError] = useState<string | null>(null);
  const [managerMessage, setManagerMessage] = useState<string | null>(null);
  const [managerBusy, setManagerBusy] = useState(false);

  const credentials = useQuery({
    queryKey: ["server-credentials"],
    queryFn: getCredentials,
    retry: false,
  });

  const servers = useQuery({
    queryKey: ["servers", "credential-manager"],
    queryFn: getServersForCredential,
    retry: false,
  });

  const save = async (row: ServerCredential | null, values: FormValues) => {
    await saveEntity(
      "/api/server-credentials",
      row?.id ?? null,
      {
        name: values.name,
        username: values.username,
        authType: values.authType,
        secret: values.secret ? values.secret : null,
        passphrase: values.passphrase ? values.passphrase : null,
      },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["server-credentials"] });
  };

  const remove = async (row: ServerCredential) => {
    await deleteEntity(`/api/server-credentials/${row.id}`, csrf);
    await queryClient.invalidateQueries({ queryKey: ["server-credentials"] });
  };

  const openManager = (row: ServerCredential) => {
    setManaging(row);
    setSelectedServerIds([]);
    setServerFilter("");
    setManagerError(null);
    setManagerMessage(null);
  };

  const updateCredential = async (
    server: Server,
    credentialId: number | null,
  ) => {
    setManagerBusy(true);
    setManagerError(null);
    try {
      await assignServerSsh(server.id, credentialId, server.sshPort, csrf);
      await queryClient.invalidateQueries({ queryKey: ["server-credentials"] });
      await queryClient.invalidateQueries({ queryKey: ["servers"] });
    } catch (cause) {
      setManagerError(
        cause instanceof Error ? cause.message : "Operazione non riuscita",
      );
    } finally {
      setManagerBusy(false);
    }
  };

  const split =
    managing && servers.data
      ? splitServersByCredential(servers.data.items, managing.id)
      : { assigned: [], available: [] };

  const filter = serverFilter.trim().toLowerCase();
  const visibleAvailable = split.available.filter(
    (server) =>
      !filter ||
      [server.name, server.providerEnvironmentLabel, server.ipAddress].some(
        (value) => value.toLowerCase().includes(filter),
      ),
  );
  const allVisibleSelected =
    visibleAvailable.length > 0 &&
    visibleAvailable.every((server) => selectedServerIds.includes(server.id));

  const toggleServer = (serverId: number) => {
    setSelectedServerIds((current) =>
      current.includes(serverId)
        ? current.filter((id) => id !== serverId)
        : [...current, serverId],
    );
  };

  const toggleAllVisible = () => {
    setSelectedServerIds((current) => {
      const visibleIds = visibleAvailable.map((server) => server.id);
      if (visibleIds.every((id) => current.includes(id))) {
        return current.filter((id) => !visibleIds.includes(id));
      }
      return [...new Set([...current, ...visibleIds])];
    });
  };

  const addServers = async () => {
    if (!managing || selectedServerIds.length === 0) return;
    const targets = split.available.filter((server) =>
      selectedServerIds.includes(server.id),
    );
    if (targets.length === 0) return;

    setManagerBusy(true);
    setManagerError(null);
    setManagerMessage(null);
    const failures: string[] = [];
    let added = 0;
    for (const server of targets) {
      try {
        await assignServerSsh(server.id, managing.id, server.sshPort, csrf);
        added++;
      } catch (cause) {
        failures.push(
          `${server.name}: ${cause instanceof Error ? cause.message : "errore"}`,
        );
      }
    }

    await queryClient.invalidateQueries({ queryKey: ["server-credentials"] });
    await queryClient.invalidateQueries({ queryKey: ["servers"] });
    setSelectedServerIds([]);
    setManagerBusy(false);
    if (added > 0) setManagerMessage(`${added} server aggiunti.`);
    if (failures.length > 0)
      setManagerError(`Non aggiunti: ${failures.join("; ")}`);
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title="Credenziali"
        description="Segreti SSH cifrati: non vengono mai restituiti al client."
      />
      <EntitySection
        rows={credentials.data?.items}
        columns={[
          { key: "name", label: "Nome", render: (row) => row.name },
          { key: "username", label: "Utente", render: (row) => row.username },
          { key: "authType", label: "Tipo", render: (row) => row.authType },
          {
            key: "hasSecret",
            label: "Segreto",
            render: (row) => (row.hasSecret ? "impostato" : "assente"),
          },
          {
            key: "serversCount",
            label: "Server",
            render: (row) => row.serversCount,
          },
        ]}
        fields={[
          { name: "name", label: "Nome", required: true },
          { name: "username", label: "Utente SSH", required: true },
          {
            name: "authType",
            label: "Tipo",
            type: "select",
            required: true,
            options: [
              { value: "Password", label: "Password" },
              { value: "PrivateKey", label: "Chiave privata" },
            ],
          },
          {
            name: "secret",
            label: "Password o chiave privata (vuoto = invariato)",
            type: "textarea",
          },
          {
            name: "passphrase",
            label: "Passphrase della chiave (opzionale)",
            type: "textarea",
          },
        ]}
        empty={{
          name: "",
          username: "",
          authType: "Password",
          secret: "",
          passphrase: "",
        }}
        toForm={(row) => ({
          name: row.name,
          username: row.username,
          authType: row.authType,
          secret: "",
          passphrase: "",
        })}
        canWrite
        onSave={save}
        onDelete={remove}
        rowActions={(row) => (
          <button
            type="button"
            onClick={() => openManager(row)}
            className="text-sm font-medium text-slate-900 underline"
          >
            Server
          </button>
        )}
        createLabel="Nuova credenziale"
      />

      {managing && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Gestisci server della credenziale"
            className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">
                  Server della credenziale
                </h2>
                <p className="text-sm text-slate-500">{managing.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setManaging(null)}
                className="text-sm underline"
              >
                Chiudi
              </button>
            </div>

            {managerError && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {managerError}
              </p>
            )}
            {managerMessage && (
              <p className="mt-3 text-sm text-emerald-700">{managerMessage}</p>
            )}

            <div className="mt-4 space-y-5">
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Associati ({split.assigned.length})
                </h3>
                {split.assigned.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    Nessun server usa questa credenziale.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200">
                    {split.assigned.map((server) => (
                      <li
                        key={server.id}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <span>
                          {server.name}
                          <span className="ml-2 text-slate-500">
                            {server.providerEnvironmentLabel} · :
                            {server.sshPort}
                          </span>
                        </span>
                        <button
                          type="button"
                          disabled={managerBusy}
                          onClick={() => void updateCredential(server, null)}
                          className="text-sm text-red-700 underline disabled:opacity-50"
                        >
                          Rimuovi
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Aggiungi server senza credenziale
                </h3>
                {split.available.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    Nessun server senza credenziale disponibile.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    <input
                      aria-label="Cerca server"
                      placeholder="Cerca server…"
                      value={serverFilter}
                      onChange={(event) => setServerFilter(event.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                    />
                    <div className="rounded-md border border-slate-200">
                      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleAllVisible}
                          />
                          Seleziona tutti visibili
                        </label>
                        <span className="text-sm text-slate-500">
                          {selectedServerIds.length} selezionati
                        </span>
                      </div>
                      {visibleAvailable.length === 0 ? (
                        <p className="px-3 py-4 text-sm text-slate-500">
                          Nessun server corrisponde.
                        </p>
                      ) : (
                        <ul className="max-h-56 divide-y divide-slate-100 overflow-auto">
                          {visibleAvailable.map((server) => (
                            <li key={server.id}>
                              <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={selectedServerIds.includes(
                                    server.id,
                                  )}
                                  onChange={() => toggleServer(server.id)}
                                />
                                <span className="min-w-0">
                                  {server.name}
                                  <span className="ml-2 text-slate-500">
                                    {server.providerEnvironmentLabel} · :
                                    {server.sshPort}
                                  </span>
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={selectedServerIds.length === 0 || managerBusy}
                      onClick={() => void addServers()}
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Aggiungi selezionati ({selectedServerIds.length})
                    </button>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
