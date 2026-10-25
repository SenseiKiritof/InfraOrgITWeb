import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { useServerAccess } from "../../lib/useServerAccess";

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
      <PageHeader title={server.data?.name ?? "Server"} />
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
    </section>
  );
}
