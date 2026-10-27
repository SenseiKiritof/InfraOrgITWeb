import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
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
  getServerReachability,
  resetHostKey,
  runAction,
  runServerReachability,
} from "../../lib/remote";
import { useServerAccess } from "../../lib/useServerAccess";
import { useConsole } from "../remote/ConsoleProvider";

export function ServersPage() {
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const access = useServerAccess();
  const adminEnvironmentIds = access.data?.adminEnvironmentIds ?? [];
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const servers = useQuery({
    queryKey: ["servers", q],
    queryFn: () => paged<Server>("/api/servers", q),
  });

  const environments = useQuery({
    queryKey: ["provider-environments", "options"],
    queryFn: () =>
      apiFetch<Paged<ProviderEnvironment>>(
        "/api/provider-environments?pageSize=200",
      ),
  });

  const save = async (row: Server | null, values: FormValues) => {
    await saveEntity(
      "/api/servers",
      row?.id ?? null,
      {
        providerEnvironmentId: Number(values.providerEnvironmentId),
        name: values.name,
        ipAddress: values.ipAddress,
        hostname: values.hostname,
        sshPort: Number(values.sshPort || 22),
      },
      csrf,
    );
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
          { key: "id", label: "ID", render: (row) => row.id },
          { key: "name", label: "Nome", render: (row) => row.name },
          {
            key: "environment",
            label: "Ambiente",
            render: (row) => row.providerEnvironmentLabel,
          },
          { key: "ip", label: "IP", render: (row) => row.ipAddress },
          { key: "ssh", label: "Porta SSH", render: (row) => row.sshPort },
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
        ]}
        empty={{
          providerEnvironmentId: "",
          name: "",
          ipAddress: "",
          hostname: "",
          sshPort: "22",
        }}
        toForm={(row) => ({
          providerEnvironmentId: String(row.providerEnvironmentId),
          name: row.name,
          ipAddress: row.ipAddress,
          hostname: row.hostname,
          sshPort: String(row.sshPort),
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
  const [credentialId, setCredentialId] = useState("");
  const [sshPort, setSshPort] = useState("22");
  const [sshMessage, setSshMessage] = useState<string | null>(null);
  const [reachabilityResults, setReachabilityResults] = useState<
    ReachabilityResult[]
  >([]);

  useEffect(() => {
    if (!server.data) return;
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

  const runReachability = async () => {
    setReachabilityResults([]);
    try {
      const results = await runServerReachability(serverId, csrf);
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
  };

  const removeDeploy = async (row: ServerApplication) => {
    await deleteEntity(`/api/server-applications/${row.id}`, csrf);
    await queryClient.invalidateQueries({ queryKey: ["server-applications"] });
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
            <dt className="text-slate-500">Host key</dt>
            <dd>{server.data.hasHostKey ? "registrata" : "non registrata"}</dd>
          </dl>
        ) : (
          <p className="text-slate-500">Caricamento…</p>
        )}
      </div>

      {isSystemAdmin && (
        <form
          onSubmit={(event) => void saveSsh(event)}
          className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Credenziale SSH
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Credenziale</span>
              <select
                value={credentialId}
                onChange={(event) => setCredentialId(event.target.value)}
                className="w-72 rounded-md border border-slate-300 px-3 py-1.5"
              >
                <option value="">— nessuna —</option>
                {credentials.data?.items.map((credential: ServerCredential) => (
                  <option key={credential.id} value={credential.id}>
                    {credential.name} ({credential.username})
                  </option>
                ))}
              </select>
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
          rows={reachability.data}
          columns={[
            { key: "host", label: "Host", render: (row) => row.hostname },
            { key: "port", label: "Porta", render: (row) => row.port },
            {
              key: "description",
              label: "Descrizione",
              render: (row) => row.description,
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
          createLabel="Nuovo test"
        />
        {isOperator && (
          <button
            type="button"
            onClick={() => void runReachability()}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            Esegui test di rete
          </button>
        )}
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
            key: "application",
            label: "Applicazione",
            render: (row) => row.applicationName,
          },
          {
            key: "version",
            label: "Versione",
            render: (row) => row.versionNumber,
          },
          { key: "port", label: "Porta", render: (row) => row.exposedPort },
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
