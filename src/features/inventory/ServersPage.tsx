import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import { AutocompleteSelect } from "../../components/AutocompleteSelect";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeaderSlot } from "../../components/PageHeaderSlot";
import { PageHeader, SearchForm } from "../../components/page";
import { apiFetch } from "../../lib/api";
import { type TranslationKey, useI18n } from "../../lib/i18n";
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
import { connectionChanged } from "./serverConnection";

type ServerFormState = {
  name: string;
  ipAddress: string;
  hostname: string;
  sshPort: string;
  jumpServerId: string;
  publicIpAddress: string;
  cpuCores: string;
  memoryGb: string;
  diskGb: string;
  operatingSystem: string;
  haNode: string;
  managedBy: string;
};

const serverFieldDefs: {
  name: Exclude<keyof ServerFormState, "jumpServerId">;
  label: TranslationKey;
  type?: "number";
  required?: boolean;
}[] = [
  { name: "name", label: "common.name", required: true },
  { name: "ipAddress", label: "common.address", required: true },
  { name: "hostname", label: "common.hostname", required: true },
  { name: "sshPort", label: "common.sshPort", type: "number" },
  { name: "publicIpAddress", label: "servers.publicIp" },
  { name: "cpuCores", label: "servers.cpuCores", type: "number" },
  { name: "memoryGb", label: "servers.memoryGb", type: "number" },
  { name: "diskGb", label: "servers.diskGb", type: "number" },
  { name: "operatingSystem", label: "servers.operatingSystem" },
  { name: "haNode", label: "servers.haNode" },
  { name: "managedBy", label: "servers.managedBy" },
];

const emptyServerForm: ServerFormState = {
  name: "",
  ipAddress: "",
  hostname: "",
  sshPort: "22",
  jumpServerId: "",
  publicIpAddress: "",
  cpuCores: "",
  memoryGb: "",
  diskGb: "",
  operatingSystem: "",
  haNode: "",
  managedBy: "",
};

function serverToForm(row: Server): ServerFormState {
  return {
    name: row.name,
    ipAddress: row.ipAddress,
    hostname: row.hostname,
    sshPort: String(row.sshPort),
    jumpServerId: row.jumpServerId ? String(row.jumpServerId) : "",
    publicIpAddress: row.publicIpAddress ?? "",
    cpuCores: row.cpuCores ? String(row.cpuCores) : "",
    memoryGb: row.memoryGb ? String(row.memoryGb) : "",
    diskGb: row.diskGb ? String(row.diskGb) : "",
    operatingSystem: row.operatingSystem ?? "",
    haNode: row.haNode ?? "",
    managedBy: row.managedBy ?? "",
  };
}

function serverPayload(values: FormValues) {
  return {
    name: values.name,
    ipAddress: values.ipAddress,
    hostname: values.hostname,
    sshPort: Number(values.sshPort || 22),
    jumpServerId: values.jumpServerId ? Number(values.jumpServerId) : null,
    publicIpAddress: values.publicIpAddress || null,
    cpuCores: optionalNumber(values.cpuCores),
    memoryGb: optionalNumber(values.memoryGb),
    diskGb: optionalNumber(values.diskGb),
    operatingSystem: values.operatingSystem || null,
    haNode: values.haNode || null,
    managedBy: values.managedBy || null,
  };
}

export function ServersPage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const csrf = session?.csrfToken ?? "";
  const access = useServerAccess();
  const adminEnvironmentIds = access.data?.adminEnvironmentIds ?? [];
  const console = useConsole();
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
    const after = {
      ipAddress: values.ipAddress,
      sshPort: Number(values.sshPort || 22),
      jumpServerId: values.jumpServerId ? Number(values.jumpServerId) : null,
    };
    const changes = row ? connectionChanged(row, after) : false;
    if (row && changes && console.hasSession(row.id)) {
      if (!window.confirm(t("servers.consoleWillClose"))) return;
    }

    const saved = (await saveEntity(
      "/api/servers",
      row?.id ?? null,
      {
        providerEnvironmentId: Number(values.providerEnvironmentId),
        ...serverPayload(values),
      },
      csrf,
    )) as Server | undefined;

    if (row && changes) console.closeServer(row.id);

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
        title={t("servers.title")}
        description={t("servers.description")}
      />
      <SearchForm
        value={search}
        onChange={setSearch}
        onSubmit={() => setQ(search)}
      />
      <EntitySection
        rows={servers.data?.items}
        columns={[
          { key: "name", label: t("common.name"), render: (row) => row.name },
          {
            key: "providerEnvironmentLabel",
            label: t("common.environment"),
            render: (row) => row.providerEnvironmentLabel,
          },
          {
            key: "ipAddress",
            label: t("common.ip"),
            render: (row) => row.ipAddress,
          },
          {
            key: "sshPort",
            label: t("common.sshPort"),
            render: (row) => row.sshPort,
          },
          {
            key: "jumpServerName",
            label: t("servers.proxy"),
            render: (row) =>
              row.jumpServerName
                ? `${row.jumpServerName} (${row.jumpServerIpAddress ?? "—"})`
                : "—",
          },
        ]}
        fields={[
          {
            name: "providerEnvironmentId",
            label: t("servers.providerEnvironment"),
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
          ...serverFieldDefs.map((field) => ({
            name: field.name,
            label: t(field.label),
            type: field.type,
            required: field.required,
          })),
          {
            name: "jumpServerId",
            label: t("servers.jumpServer"),
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
                  label: t("servers.sshCredential"),
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
          ...emptyServerForm,
          credentialId: "",
        }}
        toForm={(row) => ({
          providerEnvironmentId: String(row.providerEnvironmentId),
          ...serverToForm(row),
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
        createLabel={t("servers.create")}
      />
    </section>
  );
}

export function ServerDetailPage() {
  const { id } = useParams();
  const serverId = Number(id);
  const { session } = useAuth();
  const { t } = useI18n();
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
  const [edit, setEdit] = useState<ServerFormState>(emptyServerForm);
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
    setEdit(serverToForm(server.data));
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
    const after = {
      ipAddress: edit.ipAddress,
      sshPort: Number(edit.sshPort || 22),
      jumpServerId: edit.jumpServerId ? Number(edit.jumpServerId) : null,
    };
    const changes = connectionChanged(server.data, after);
    if (changes && console.hasSession(serverId)) {
      if (!window.confirm(t("servers.consoleWillClose"))) return;
    }
    setEditMessage(null);
    try {
      await saveEntity(
        "/api/servers",
        serverId,
        {
          providerEnvironmentId: server.data.providerEnvironmentId,
          ...serverPayload(edit),
        },
        csrf,
      );
      if (changes) console.closeServer(serverId);
      await queryClient.invalidateQueries({ queryKey: ["servers"] });
      setEditMessage(t("servers.updated"));
    } catch (cause) {
      setEditMessage(
        cause instanceof Error ? cause.message : t("servers.saveFailed"),
      );
    }
  };

  const saveSsh = async (event: React.FormEvent) => {
    event.preventDefault();
    const portChanged = Number(sshPort) !== server.data?.sshPort;
    if (portChanged && console.hasSession(serverId)) {
      if (!window.confirm(t("servers.consoleWillClose"))) return;
    }
    setSshMessage(null);
    try {
      await assignServerSsh(
        serverId,
        credentialId ? Number(credentialId) : null,
        Number(sshPort),
        csrf,
      );
      if (portChanged) console.closeServer(serverId);
      await queryClient.invalidateQueries({ queryKey: ["servers"] });
      setSshMessage(t("servers.sshSaved"));
    } catch (cause) {
      setSshMessage(
        cause instanceof Error ? cause.message : t("servers.sshSaveFailed"),
      );
    }
  };

  const clearHostKey = async () => {
    if (!window.confirm(t("servers.clearHostKeyConfirm"))) return;
    setSshMessage(null);
    try {
      await resetHostKey(serverId, csrf);
      await queryClient.invalidateQueries({ queryKey: ["servers"] });
      setSshMessage(t("servers.hostKeyCleared"));
    } catch (cause) {
      setSshMessage(
        cause instanceof Error
          ? cause.message
          : t("servers.hostKeyResetFailed"),
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
          error:
            cause instanceof Error ? cause.message : t("servers.testFailed"),
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
        runtime: values.runtime || null,
        containerImage: values.containerImage || null,
        containerName: values.containerName || null,
        composeDirectory: values.composeDirectory || null,
        hostPort: optionalNumber(values.hostPort),
        haRole: values.haRole || null,
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
      <PageHeaderSlot
        title={
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">
              {server.data?.name ?? t("servers.title")}
            </span>
            {server.data && (
              <span className="truncate font-normal text-slate-500">
                {server.data.hostname !== server.data.name
                  ? `${server.data.hostname} · `
                  : ""}
                {server.data.ipAddress}
              </span>
            )}
          </span>
        }
        actions={
          isAdmin ? (
            <button
              type="button"
              onClick={() =>
                console.open(serverId, server.data?.name ?? t("servers.title"))
              }
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
            >
              {t("console.title")}
            </button>
          ) : undefined
        }
      />
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        {!server.data ? (
          <p className="text-slate-500">{t("common.loading")}</p>
        ) : isAdmin ? (
          <form
            onSubmit={(event) => void saveServer(event)}
            className="space-y-3"
          >
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t("servers.details")}
            </h2>
            <dl className="grid gap-2 sm:grid-cols-2">
              <dt className="text-slate-500">{t("common.environment")}</dt>
              <dd>{server.data.providerEnvironmentLabel}</dd>
              <dt className="text-slate-500">{t("servers.hostKey")}</dt>
              <dd>
                {server.data.hasHostKey
                  ? t("servers.hostKeyRegistered")
                  : t("servers.hostKeyMissing")}
              </dd>
            </dl>
            <div className="grid gap-3 sm:grid-cols-2">
              {serverFieldDefs.map((field) => (
                <EditField
                  key={field.name}
                  label={t(field.label)}
                  type={field.type}
                  value={edit[field.name]}
                  onChange={(value) =>
                    setEdit({ ...edit, [field.name]: value })
                  }
                />
              ))}
              <label
                htmlFor="server-jump"
                className="flex flex-col gap-1 sm:col-span-2"
              >
                <span className="text-xs text-slate-500">
                  {t("servers.jumpServer")}
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
                  onChange={(value) =>
                    setEdit({ ...edit, jumpServerId: value })
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5"
                />
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
              >
                {t("common.save")}
              </button>
              {editMessage && (
                <p role="status" className="text-sm text-slate-600">
                  {editMessage}
                </p>
              )}
            </div>
          </form>
        ) : (
          <dl className="grid gap-2 sm:grid-cols-2">
            <dt className="text-slate-500">{t("common.environment")}</dt>
            <dd>{server.data.providerEnvironmentLabel}</dd>
            {serverFieldDefs.map((field) => (
              <Fragment key={field.name}>
                <dt className="text-slate-500">{t(field.label)}</dt>
                <dd>{server.data[field.name] ?? "—"}</dd>
              </Fragment>
            ))}
            <dt className="text-slate-500">{t("servers.proxy")}</dt>
            <dd>
              {server.data.jumpServerName
                ? `${server.data.jumpServerName} (${server.data.jumpServerIpAddress ?? "—"})`
                : "—"}
            </dd>
            <dt className="text-slate-500">{t("servers.hostKey")}</dt>
            <dd>
              {server.data.hasHostKey
                ? t("servers.hostKeyRegistered")
                : t("servers.hostKeyMissing")}
            </dd>
          </dl>
        )}
      </div>

      {isSystemAdmin && (
        <form
          onSubmit={(event) => void saveSsh(event)}
          className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t("servers.sshCredential")}
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <label htmlFor="server-credential" className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">
                {t("servers.credential")}
              </span>
              <AutocompleteSelect
                id="server-credential"
                value={credentialId}
                options={[
                  { value: "", label: t("common.noCredential") },
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
              <span className="text-xs text-slate-500">
                {t("common.sshPort")}
              </span>
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
              {t("servers.saveSsh")}
            </button>
            <button
              type="button"
              onClick={() => void clearHostKey()}
              className="rounded-md border border-red-300 px-3 py-1.5 text-red-700"
            >
              {t("servers.clearHostKey")}
            </button>
          </div>
          {sshMessage && <p className="text-sm text-slate-700">{sshMessage}</p>}
        </form>
      )}

      <section className="space-y-2">
        <EntitySection
          title={t("servers.reachability")}
          rows={reachabilityRows}
          columns={[
            {
              key: "hostname",
              label: t("common.host"),
              render: (row) => row.hostname,
            },
            {
              key: "port",
              label: t("common.port"),
              render: (row) => row.port,
            },
            {
              key: "description",
              label: t("common.description"),
              render: (row) => row.description,
            },
            {
              key: "scope",
              label: t("common.type"),
              render: (row) =>
                row.serverId === null
                  ? t("servers.scopeGlobal")
                  : t("common.server"),
            },
          ]}
          fields={[
            { name: "hostname", label: t("common.host"), required: true },
            {
              name: "port",
              label: t("common.port"),
              type: "number",
              required: true,
            },
            { name: "description", label: t("common.description") },
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
                  {t("servers.selectedCount", {
                    count: selectedTests.length,
                  })}
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
                    ? t("servers.testing")
                    : t("servers.runSelected")}
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
                    ? t("servers.testing")
                    : t("servers.runAll")}
                </button>
              </div>
            ) : undefined
          }
          createLabel={t("servers.newTest")}
        />
        {reachabilityResults.length > 0 && (
          <ul className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            {reachabilityResults.map((result) => (
              <li
                key={`${result.serverId}-${result.hostname}-${result.port}-${result.reachable}-${result.error}`}
              >
                {result.serverName} ·{" "}
                {result.hostname ?? t("servers.connection")}:{result.port ?? ""}{" "}
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
        title={t("servers.deployedApplications")}
        rows={deployed.data}
        columns={[
          {
            key: "applicationName",
            label: t("common.application"),
            render: (row) => row.applicationName,
          },
          {
            key: "versionNumber",
            label: t("common.version"),
            render: (row) => row.versionNumber,
          },
          {
            key: "exposedPort",
            label: t("common.port"),
            render: (row) => row.exposedPort,
          },
          {
            key: "runtime",
            label: t("servers.runtime"),
            render: (row) =>
              row.runtime === "Container"
                ? t("servers.runtimeContainer")
                : row.runtime === "Native"
                  ? t("servers.runtimeNative")
                  : "—",
          },
          {
            key: "hostPort",
            label: t("servers.hostPort"),
            render: (row) => row.hostPort ?? "—",
          },
          {
            key: "haRole",
            label: t("servers.haRole"),
            render: (row) =>
              row.haRole === "Primary"
                ? t("servers.haPrimary")
                : row.haRole === "Secondary"
                  ? t("servers.haSecondary")
                  : "—",
          },
        ]}
        fields={[
          {
            name: "applicationVersionId",
            label: t("servers.applicationVersion"),
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
            label: t("servers.exposedPort"),
            type: "number",
            required: true,
          },
          {
            name: "runtime",
            label: t("servers.runtime"),
            type: "select",
            options: [
              { value: "", label: "—" },
              { value: "Container", label: t("servers.runtimeContainer") },
              { value: "Native", label: t("servers.runtimeNative") },
            ],
          },
          { name: "containerImage", label: t("servers.containerImage") },
          { name: "containerName", label: t("servers.containerName") },
          { name: "composeDirectory", label: t("servers.composeDirectory") },
          { name: "hostPort", label: t("servers.hostPort"), type: "number" },
          {
            name: "haRole",
            label: t("servers.haRole"),
            type: "select",
            options: [
              { value: "", label: "—" },
              { value: "Primary", label: t("servers.haPrimary") },
              { value: "Secondary", label: t("servers.haSecondary") },
            ],
          },
        ]}
        empty={{
          applicationVersionId: "",
          exposedPort: "",
          runtime: "",
          containerImage: "",
          containerName: "",
          composeDirectory: "",
          hostPort: "",
          haRole: "",
        }}
        toForm={(row) => ({
          applicationVersionId: String(row.applicationVersionId),
          exposedPort: String(row.exposedPort),
          runtime: row.runtime ?? "",
          containerImage: row.containerImage ?? "",
          containerName: row.containerName ?? "",
          composeDirectory: row.composeDirectory ?? "",
          hostPort: row.hostPort ? String(row.hostPort) : "",
          haRole: row.haRole ?? "",
        })}
        canWrite={isAdmin}
        canEditRow={() => false}
        onSave={deploy}
        onDelete={removeDeploy}
        rowHref={(row) => `/applications/${row.applicationId}`}
        createLabel={t("servers.deployApplication")}
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
  const { t } = useI18n();
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
      !window.confirm(
        t("servers.runConfirm", {
          label: button.label,
          server: deployment.serverName,
        }),
      )
    )
      return;
    setError(null);
    setResult(null);
    try {
      setResult(await runAction(deployment.id, button.id, csrfToken));
      await queryClient.invalidateQueries({ queryKey: ["command-executions"] });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t("servers.executionFailed"),
      );
    }
  };

  if (!actions.data?.length) return null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {t("servers.actionsTitle")} · {deployment.applicationName}{" "}
        {deployment.versionNumber}
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
          {result.output || t("servers.noOutput")}
          {result.timedOut ? "\n[timeout]" : ""}
        </pre>
      )}
    </section>
  );
}

function EditField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-slate-300 px-3 py-1.5"
      />
    </label>
  );
}

function optionalNumber(value: string | undefined): number | null {
  return value?.trim() ? Number(value) : null;
}
