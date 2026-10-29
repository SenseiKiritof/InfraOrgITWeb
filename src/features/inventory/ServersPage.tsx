import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import { AutocompleteSelect } from "../../components/AutocompleteSelect";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeader, SearchForm } from "../../components/page";
import { apiFetch } from "../../lib/api";
import type {
  ApplicationVersion,
  Paged,
  ProviderEnvironment,
  Server,
  ServerApplication,
} from "../../lib/inventory";
import { deleteEntity, paged, saveEntity } from "../../lib/inventory";
import type {
  ApplicationActionButton,
  CommandResult,
  ReachabilityResult,
  ReachabilityTest,
  ServerCredential,
} from "../../lib/remote";
import {
  assignServerSsh,
  getActionButtons,
  getCredentials,
  getGlobalReachability,
  getServerReachability,
  resetHostKey,
  runAction,
  runServerReachability,
} from "../../lib/remote";
import { useQueryFilter } from "../../lib/useQueryFilter";
import { useServerAccess } from "../../lib/useServerAccess";
import { useConsole } from "../remote/ConsoleProvider";

export function ServersPage() {
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const access = useServerAccess();
  const adminEnvironmentIds = access.data?.adminEnvironmentIds ?? [];
  const queryClient = useQueryClient();
  const { search, setSearch, q, setQ } = useQueryFilter();

  const servers = useQuery({
    queryKey: ["servers", q],
    queryFn: () => paged<Server>("/api/servers", q),
  });

  const isSystemAdmin = access.data?.isSystemAdmin ?? false;
  const credentials = useQuery({
    queryKey: ["server-credentials", "options"],
    queryFn: getCredentials,
    enabled: isSystemAdmin,
    retry: false,
  });

  const environments = useQuery({
    queryKey: ["provider-environments", "options"],
    queryFn: () =>
      apiFetch<Paged<ProviderEnvironment>>(
        "/api/provider-environments?pageSize=200",
      ),
  });

  const save = async (row: Server | null, values: FormValues) => {
    const saved = (await saveEntity(
      "/api/servers",
      row?.id ?? null,
      {
        providerEnvironmentId: Number(values.providerEnvironmentId),
        name: values.name,
        ipAddress: values.ipAddress,
        hostname: values.hostname,
        sshPort: Number(values.sshPort || 22),
        jumpServerId: values.jumpServerId ? Number(values.jumpServerId) : null,
      },
      csrf,
    )) as Server | undefined;

    const serverId = row?.id ?? saved?.id;
    const credentialId = values.credentialId
      ? Number(values.credentialId)
      : null;
    if (
      isSystemAdmin &&
      serverId &&
      credentialId !== (row?.credentialId ?? null)
    ) {
      await assignServerSsh(
        serverId,
        credentialId,
        Number(values.sshPort || 22),
        csrf,
      );
    }

    await queryClient.invalidateQueries({ queryKey: ["servers"] });
  };

  const remove = async (row: Server) => {
    await deleteEntity(`/api/servers/${row.id}`, csrf);
    await queryClient.invalidateQueries({ queryKey: ["servers"] });
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title="Server"
        description="Server gestiti per ambiente provider."
      />
      <SearchForm
        value={search}
        onChange={setSearch}
        onSubmit={() => setQ(search)}
      />
      <EntitySection
        rows={servers.data?.items}
        columns={[
          { key: "name", label: "Nome", render: (row) => row.name },
          {
            key: "providerEnvironmentLabel",
            label: "Ambiente",
            render: (row) => row.providerEnvironmentLabel,
          },
          { key: "ipAddress", label: "IP", render: (row) => row.ipAddress },
          { key: "sshPort", label: "Porta SSH", render: (row) => row.sshPort },
          {
            key: "jumpServerName",
            label: "Proxy",
            render: (row) =>
              row.jumpServerName
                ? `${row.jumpServerName} (${row.jumpServerIpAddress ?? "—"})`
                : "—",
          },
        ]}
        fields={[
          {
            name: "providerEnvironmentId",
            label: "Ambiente provider",
            type: "select",
            required: true,
            options:
              environments.data?.items
                .filter((environment) =>
                  adminEnvironmentIds.includes(environment.id),
                )
                .map((environment) => ({
                  value: String(environment.id),
                  label: environment.label,
                })) ?? [],
          },
          { name: "name", label: "Nome", required: true },
          { name: "ipAddress", label: "Indirizzo IP", required: true },
          { name: "hostname", label: "Hostname", required: true },
          { name: "sshPort", label: "Porta SSH", type: "number" },
          {
            name: "jumpServerId",
            label: "Server proxy (jump)",
            type: "select",
            options:
              servers.data?.items.map((item) => ({
                value: String(item.id),
                label: `${item.name} (${item.ipAddress})`,
              })) ?? [],
          },
          ...(isSystemAdmin
            ? [
                {
                  name: "credentialId",
                  label: "Credenziale SSH",
                  type: "select" as const,
                  options:
                    credentials.data?.items.map((credential) => ({
                      value: String(credential.id),
                      label: `${credential.name} (${credential.username})`,
                    })) ?? [],
                },
              ]
            : []),
        ]}
        empty={{
          providerEnvironmentId: "",
          name: "",
          ipAddress: "",
          hostname: "",
          sshPort: "22",
          jumpServerId: "",
          credentialId: "",
        }}
        toForm={(row) => ({
          providerEnvironmentId: String(row.providerEnvironmentId),
          name: row.name,
          ipAddress: row.ipAddress,
          hostname: row.hostname,
          sshPort: String(row.sshPort),
          jumpServerId: row.jumpServerId ? String(row.jumpServerId) : "",
          credentialId: row.credentialId ? String(row.credentialId) : "",
        })}
        canWrite={adminEnvironmentIds.length > 0}
        canEditRow={(row) =>
          adminEnvironmentIds.includes(row.providerEnvironmentId)
        }
        canDeleteRow={(row) =>
          adminEnvironmentIds.includes(row.providerEnvironmentId)
        }
        onSave={save}
        onDelete={remove}
        rowHref={(row) => `/servers/${row.id}`}
        createLabel="Nuovo server"
      />
    </section>
  );
}

export function ServerDetailPage() {
  const { id } = useParams();
  const serverId = Number(id);
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const access = useServerAccess();
  const queryClient = useQueryClient();

  const server = useQuery({
    queryKey: ["servers", "detail", serverId],
    queryFn: () => apiFetch<Server>(`/api/servers/${serverId}`),
    enabled: Number.isInteger(serverId),
  });

  const deployed = useQuery({
    queryKey: ["server-applications", "server", serverId],
    queryFn: () =>
      apiFetch<ServerApplication[]>(`/api/servers/${serverId}/applications`),
    enabled: Number.isInteger(serverId),
  });

  const serverOptions = useQuery({
    queryKey: ["servers", "options"],
    queryFn: () => apiFetch<Paged<Server>>("/api/servers?pageSize=200"),
  });

  const versions = useQuery({
    queryKey: ["application-versions", "options"],
    queryFn: () =>
      apiFetch<Paged<ApplicationVersion>>(
        "/api/application-versions?pageSize=200",
      ),
  });

  const isAdmin =
    server.data !== undefined &&
    (access.data?.adminEnvironmentIds ?? []).includes(
      server.data.providerEnvironmentId,
    );
  const isSystemAdmin = access.data?.isSystemAdmin ?? false;
  const isOperator =
    server.data !== undefined &&
    (access.data?.operatorEnvironmentIds ?? []).includes(
      server.data.providerEnvironmentId,
    );

  const console = useConsole();
  const [edit, setEdit] = useState({
    name: "",
    ipAddress: "",
    hostname: "",
    sshPort: "22",
    jumpServerId: "",
  });
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [credentialId, setCredentialId] = useState("");
  const [sshPort, setSshPort] = useState("22");
  const [sshMessage, setSshMessage] = useState<string | null>(null);
  const [reachabilityResults, setReachabilityResults] = useState<
    ReachabilityResult[]
  >([]);
  const [runningReachability, setRunningReachability] = useState<
    "all" | "selected" | null
  >(null);
  const [selectedTests, setSelectedTests] = useState<number[]>([]);

  useEffect(() => {
    if (!server.data) return;
    setEdit({
      name: server.data.name,
      ipAddress: server.data.ipAddress,
      hostname: server.data.hostname,
      sshPort: String(server.data.sshPort),
      jumpServerId: server.data.jumpServerId
        ? String(server.data.jumpServerId)
        : "",
    });
    setCredentialId(
      server.data.credentialId ? String(server.data.credentialId) : "",
    );
    setSshPort(String(server.data.sshPort));
  }, [server.data]);

  const credentials = useQuery({
    queryKey: ["server-credentials", "options"],
    queryFn: getCredentials,
    enabled: isSystemAdmin,
    retry: false,
  });

  const reachability = useQuery({
    queryKey: ["reachability-tests", "server", serverId],
    queryFn: () => getServerReachability(serverId),
    enabled: Number.isInteger(serverId),
    retry: false,
  });

  const saveServer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!server.data) return;
    setEditMessage(null);
    try {
      await saveEntity(
        "/api/servers",
        serverId,
        {
          providerEnvironmentId: server.data.providerEnvironmentId,
          name: edit.name,
          ipAddress: edit.ipAddress,
          hostname: edit.hostname,
          sshPort: Number(edit.sshPort || 22),
          jumpServerId: edit.jumpServerId ? Number(edit.jumpServerId) : null,
        },
        csrf,
      );
      await queryClient.invalidateQueries({ queryKey: ["servers"] });
      setEditMessage("Server aggiornato.");
    } catch (cause) {
      setEditMessage(
        cause instanceof Error ? cause.message : "Salvataggio non riuscito",
      );
    }
  };

  const saveSsh = async (event: React.FormEvent) => {
    event.preventDefault();
    setSshMessage(null);
    try {
      await assignServerSsh(
        serverId,
        credentialId ? Number(credentialId) : null,
        Number(sshPort),
        csrf,
      );
      await queryClient.invalidateQueries({ queryKey: ["servers"] });
      setSshMessage("Configurazione SSH salvata.");
    } catch (cause) {
      setSshMessage(
        cause instanceof Error ? cause.message : "Salvataggio SSH non riuscito",
      );
    }
  };

  const clearHostKey = async () => {
    if (
      !window.confirm(
        "Azzerare la host key salvata? Verrà riappresa alla prossima connessione.",
      )
    )
      return;
    setSshMessage(null);
    try {
      await resetHostKey(serverId, csrf);
      await queryClient.invalidateQueries({ queryKey: ["servers"] });
      setSshMessage("Host key azzerata.");
    } catch (cause) {
      setSshMessage(
        cause instanceof Error ? cause.message : "Reset host key non riuscito",
      );
    }
  };

  const saveReachability = async (
    row: ReachabilityTest | null,
    values: FormValues,
  ) => {
    const body = {
      hostname: values.hostname,
      port: Number(values.port),
      description: values.description,
    };
    await saveEntity(
      row
        ? `/api/reachability-tests`
        : `/api/servers/${serverId}/reachability-tests`,
      row?.id ?? null,
      body,
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["reachability-tests"] });
  };

  const removeReachability = async (row: ReachabilityTest) => {
    await deleteEntity(`/api/reachability-tests/${row.id}`, csrf);
    await queryClient.invalidateQueries({ queryKey: ["reachability-tests"] });
  };

  const globalReachability = useQuery({
    queryKey: ["reachability-tests", "global"],
    queryFn: getGlobalReachability,
    retry: false,
  });
  const reachabilityRows: ReachabilityTest[] = [
    ...(globalReachability.data ?? []),
    ...(reachability.data ?? []),
  ];
  const reachabilityIdsKey = reachabilityRows.map((row) => row.id).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the available tests change
  useEffect(() => {
    setSelectedTests([]);
  }, [reachabilityIdsKey]);

  const runReachability = async (ids: number[], mode: "all" | "selected") => {
    setReachabilityResults([]);
    setRunningReachability(mode);
    try {
      const results = await runServerReachability(serverId, csrf, ids);
      setReachabilityResults(results);
      await queryClient.invalidateQueries({ queryKey: ["command-executions"] });
    } catch (cause) {
      setReachabilityResults([
        {
          serverId,
          serverName: server.data?.name ?? "",
          hostname: null,
          port: null,
          reachable: false,
          error: cause instanceof Error ? cause.message : "Test non riuscito",
        },
      ]);
    } finally {
      setRunningReachability(null);
    }
  };

  const deploy = async (_row: ServerApplication | null, values: FormValues) => {
    await saveEntity(
      `/api/servers/${serverId}/applications`,
      null,
      {
        applicationVersionId: Number(values.applicationVersionId),
        exposedPort: Number(values.exposedPort),
      },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["server-applications"] });
    await queryClient.invalidateQueries({
      queryKey: ["application-environments"],
    });
  };

  const removeDeploy = async (row: ServerApplication) => {
    await deleteEntity(`/api/server-applications/${row.id}`, csrf);
    await queryClient.invalidateQueries({ queryKey: ["server-applications"] });
    await queryClient.invalidateQueries({
      queryKey: ["application-environments"],
    });
  };

  return (
    <section className="space-y-4">
      <PageHeader title={server.data?.name ?? "Server"}>
        {isAdmin && (
          <button
            type="button"
            onClick={() =>
              console.open(serverId, server.data?.name ?? "Server")
            }
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Console SSH
          </button>
        )}
      </PageHeader>
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        {server.data ? (
          <dl className="grid grid-cols-2 gap-2">
            <dt className="text-slate-500">Ambiente</dt>
            <dd>{server.data.providerEnvironmentLabel}</dd>
            <dt className="text-slate-500">IP</dt>
            <dd>{server.data.ipAddress}</dd>
            <dt className="text-slate-500">Hostname</dt>
            <dd>{server.data.hostname}</dd>
            <dt className="text-slate-500">Porta SSH</dt>
            <dd>{server.data.sshPort}</dd>
            <dt className="text-slate-500">Server proxy</dt>
            <dd>
              {server.data.jumpServerName
                ? `${server.data.jumpServerName} (${server.data.jumpServerIpAddress ?? "—"})`
                : "—"}
            </dd>
            <dt className="text-slate-500">Host key</dt>
            <dd>{server.data.hasHostKey ? "registrata" : "non registrata"}</dd>
          </dl>
        ) : (
          <p className="text-slate-500">Caricamento…</p>
        )}
      </div>

      {isAdmin && server.data && (
        <form
          onSubmit={(event) => void saveServer(event)}
          className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Dati server
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Nome</span>
              <input
                value={edit.name}
                onChange={(event) =>
                  setEdit({ ...edit, name: event.target.value })
                }
                required
                className="rounded-md border border-slate-300 px-3 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Indirizzo IP</span>
              <input
                value={edit.ipAddress}
                onChange={(event) =>
                  setEdit({ ...edit, ipAddress: event.target.value })
                }
                required
                className="rounded-md border border-slate-300 px-3 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Hostname</span>
              <input
                value={edit.hostname}
                onChange={(event) =>
                  setEdit({ ...edit, hostname: event.target.value })
                }
                required
                className="rounded-md border border-slate-300 px-3 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Porta SSH</span>
              <input
                type="number"
                value={edit.sshPort}
                onChange={(event) =>
                  setEdit({ ...edit, sshPort: event.target.value })
                }
                className="rounded-md border border-slate-300 px-3 py-1.5"
              />
            </label>
            <label
              htmlFor="server-jump"
              className="flex flex-col gap-1 sm:col-span-2"
            >
              <span className="text-xs text-slate-500">
                Server proxy (jump)
              </span>
              <AutocompleteSelect
                id="server-jump"
                value={edit.jumpServerId}
                options={[
                  { value: "", label: "—" },
                  ...(serverOptions.data?.items
                    .filter((item) => item.id !== serverId)
                    .map((item) => ({
                      value: String(item.id),
                      label: `${item.name} (${item.ipAddress})`,
                    })) ?? []),
                ]}
                onChange={(value) => setEdit({ ...edit, jumpServerId: value })}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5"
              />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              Salva
            </button>
            {editMessage && (
              <p role="status" className="text-sm text-slate-600">
                {editMessage}
              </p>
            )}
          </div>
        </form>
      )}

      {isSystemAdmin && (
        <form
          onSubmit={(event) => void saveSsh(event)}
          className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Credenziale SSH
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <label htmlFor="server-credential" className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Credenziale</span>
              <AutocompleteSelect
                id="server-credential"
                value={credentialId}
                options={[
                  { value: "", label: "— nessuna —" },
                  ...(credentials.data?.items.map(
                    (credential: ServerCredential) => ({
                      value: String(credential.id),
                      label: `${credential.name} (${credential.username})`,
                    }),
                  ) ?? []),
                ]}
                onChange={setCredentialId}
                className="w-72 rounded-md border border-slate-300 px-3 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Porta SSH</span>
              <input
                type="number"
                min={1}
                max={65535}
                value={sshPort}
                onChange={(event) => setSshPort(event.target.value)}
                className="w-28 rounded-md border border-slate-300 px-3 py-1.5"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white"
            >
              Salva SSH
            </button>
            <button
              type="button"
              onClick={() => void clearHostKey()}
              className="rounded-md border border-red-300 px-3 py-1.5 text-red-700"
            >
              Azzera host key
            </button>
          </div>
          {sshMessage && <p className="text-sm text-slate-700">{sshMessage}</p>}
        </form>
      )}

      <section className="space-y-2">
        <EntitySection
          title="Test di raggiungibilità"
          rows={reachabilityRows}
          columns={[
            { key: "hostname", label: "Host", render: (row) => row.hostname },
            { key: "port", label: "Porta", render: (row) => row.port },
            {
              key: "description",
              label: "Descrizione",
              render: (row) => row.description,
            },
            {
              key: "scope",
              label: "Tipo",
              render: (row) => (row.serverId === null ? "Globale" : "Server"),
            },
          ]}
          fields={[
            { name: "hostname", label: "Host", required: true },
            { name: "port", label: "Porta", type: "number", required: true },
            { name: "description", label: "Descrizione" },
          ]}
          empty={{ hostname: "", port: "443", description: "" }}
          toForm={(row) => ({
            hostname: row.hostname,
            port: String(row.port),
            description: row.description,
          })}
          canWrite={isAdmin}
          onSave={saveReachability}
          onDelete={removeReachability}
          canEditRow={(row) => row.serverId !== null}
          canDeleteRow={(row) => row.serverId !== null}
          selection={{
            selectedIds: selectedTests,
            onChange: setSelectedTests,
          }}
          headerActions={
            isOperator ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  {selectedTests.length} selezionati
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void runReachability(selectedTests, "selected")
                  }
                  disabled={
                    selectedTests.length === 0 || runningReachability !== null
                  }
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  {runningReachability === "selected"
                    ? "Test in corso…"
                    : "Effettua selezionati"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void runReachability(
                      reachabilityRows.map((row) => row.id),
                      "all",
                    )
                  }
                  disabled={
                    reachabilityRows.length === 0 ||
                    runningReachability !== null
                  }
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  {runningReachability === "all"
                    ? "Test in corso…"
                    : "Effettua tutti i test"}
                </button>
              </div>
            ) : undefined
          }
          createLabel="Nuovo test"
        />
        {reachabilityResults.length > 0 && (
          <ul className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            {reachabilityResults.map((result) => (
              <li
                key={`${result.serverId}-${result.hostname}-${result.port}-${result.reachable}-${result.error}`}
              >
                {result.serverName} · {result.hostname ?? "connessione"}:
                {result.port ?? ""}{" "}
                <span
                  className={
                    result.reachable ? "text-emerald-700" : "text-red-700"
                  }
                >
                  {result.reachable ? "OK" : "KO"}
                </span>{" "}
                {result.error}
              </li>
            ))}
          </ul>
        )}
      </section>

      <EntitySection
        title="Applicazioni deployate"
        rows={deployed.data}
        columns={[
          {
            key: "applicationName",
            label: "Applicazione",
            render: (row) => row.applicationName,
          },
          {
            key: "versionNumber",
            label: "Versione",
            render: (row) => row.versionNumber,
          },
          {
            key: "exposedPort",
            label: "Porta",
            render: (row) => row.exposedPort,
          },
        ]}
        fields={[
          {
            name: "applicationVersionId",
            label: "Versione applicazione",
            type: "select",
            required: true,
            options:
              versions.data?.items.map((version) => ({
                value: String(version.id),
                label: `${version.applicationName} ${version.versionNumber}`,
              })) ?? [],
          },
          {
            name: "exposedPort",
            label: "Porta esposta",
            type: "number",
            required: true,
          },
        ]}
        empty={{ applicationVersionId: "", exposedPort: "" }}
        toForm={(row) => ({
          applicationVersionId: String(row.applicationVersionId),
          exposedPort: String(row.exposedPort),
        })}
        canWrite={isAdmin}
        canEditRow={() => false}
        onSave={deploy}
        onDelete={removeDeploy}
        rowHref={(row) => `/applications/${row.applicationId}`}
        createLabel="Deploy applicazione"
      />
      {isOperator &&
        deployed.data?.map((deployment) => (
          <DeployActions
            key={deployment.id}
            deployment={deployment}
            csrfToken={csrf}
          />
        ))}
    </section>
  );
}

function DeployActions({
  deployment,
  csrfToken,
}: {
  deployment: ServerApplication;
  csrfToken: string;
}) {
  const queryClient = useQueryClient();
  const actions = useQuery({
    queryKey: ["server-application-actions", deployment.id],
    queryFn: () => getActionButtons(deployment.id),
    retry: false,
  });
  const [result, setResult] = useState<CommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (button: ApplicationActionButton) => {
    if (
      button.requiresConfirmation &&
      !window.confirm(`Eseguire "${button.label}" su ${deployment.serverName}?`)
    )
      return;
    setError(null);
    setResult(null);
    try {
      setResult(await runAction(deployment.id, button.id, csrfToken));
      await queryClient.invalidateQueries({ queryKey: ["command-executions"] });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Esecuzione non riuscita",
      );
    }
  };

  if (!actions.data?.length) return null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Azioni · {deployment.applicationName} {deployment.versionNumber}
      </h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {actions.data.map((button) => (
          <button
            key={button.id}
            type="button"
            onClick={() => void run(button)}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white"
          >
            {button.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {result && (
        <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
          {result.output || "(nessun output)"}
          {result.timedOut ? "\n[timeout]" : ""}
        </pre>
      )}
    </section>
  );
}
