import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeaderSlot } from "../../components/PageHeaderSlot";
import { SearchForm } from "../../components/page";
import { RecordCard } from "../../components/RecordCard";
import { apiFetch } from "../../lib/api";
import type { Topology } from "../../lib/diagrams";
import { useI18n } from "../../lib/i18n";
import type { Application, Project, Server } from "../../lib/inventory";
import { deleteEntity, listOf, paged, saveEntity } from "../../lib/inventory";
import type { ReachabilityResult } from "../../lib/remote";
import { runServerReachability } from "../../lib/remote";
import { useQueryFilter } from "../../lib/useQueryFilter";
import { useIsSystemAdmin, useServerAccess } from "../../lib/useServerAccess";

export function ProjectsPage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const csrf = session?.csrfToken ?? "";
  const isAdmin = useIsSystemAdmin();
  const queryClient = useQueryClient();
  const { search, setSearch, q, setQ } = useQueryFilter();

  const projects = useQuery({
    queryKey: ["projects", q],
    queryFn: () => paged<Project>("/api/projects", q),
  });

  const save = async (row: Project | null, values: FormValues) => {
    await saveEntity(
      "/api/projects",
      row?.id ?? null,
      { name: values.name, description: values.description || null },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  const remove = async (row: Project) => {
    await deleteEntity(`/api/projects/${row.id}`, csrf);
    await queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  return (
    <section className="space-y-4">
      <PageHeaderSlot
        title={t("projects.title")}
        description={t("projects.description")}
      />
      <SearchForm
        value={search}
        onChange={setSearch}
        onSubmit={() => setQ(search)}
      />
      <EntitySection
        rows={projects.data?.items}
        columns={[
          { key: "name", label: t("common.name"), render: (row) => row.name },
          {
            key: "description",
            label: t("common.description"),
            render: (row) => row.description ?? "",
          },
          {
            key: "applicationCount",
            label: t("common.applications"),
            render: (row) => row.applicationCount,
          },
        ]}
        fields={[
          { name: "name", label: t("common.name"), required: true },
          {
            name: "description",
            label: t("common.description"),
            type: "textarea",
          },
        ]}
        empty={{ name: "", description: "" }}
        toForm={(row) => ({
          name: row.name,
          description: row.description ?? "",
        })}
        canWrite={isAdmin}
        onSave={save}
        onDelete={remove}
        rowHref={(row) => `/projects/${row.id}`}
        createLabel={t("projects.create")}
      />
    </section>
  );
}

export function ProjectDetailPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const { session } = useAuth();
  const { t } = useI18n();
  const csrf = session?.csrfToken ?? "";
  const isAdmin = useIsSystemAdmin();
  const queryClient = useQueryClient();

  const project = useQuery({
    queryKey: ["projects", "detail", projectId],
    queryFn: () => apiFetch<Project>(`/api/projects/${projectId}`),
    enabled: Number.isInteger(projectId),
  });

  const applications = useQuery({
    queryKey: ["project-applications", projectId],
    queryFn: () =>
      listOf<Application>(`/api/projects/${projectId}/applications`),
    enabled: Number.isInteger(projectId),
  });

  const topology = useQuery({
    queryKey: ["topology", "project", projectId],
    queryFn: () => apiFetch<Topology>(`/api/topology?projectId=${projectId}`),
    enabled: Number.isInteger(projectId),
  });

  const servers = useQuery({
    queryKey: ["servers", "options"],
    queryFn: () => paged<Server>("/api/servers"),
  });
  const serversById = new Map(
    (servers.data?.items ?? []).map((server) => [server.id, server]),
  );
  const access = useServerAccess();
  const canRunOn = (serverId: number) => {
    const server = serversById.get(serverId);
    if (!server) return false;
    return (
      (access.data?.adminEnvironmentIds ?? []).includes(
        server.providerEnvironmentId,
      ) ||
      (access.data?.operatorEnvironmentIds ?? []).includes(
        server.providerEnvironmentId,
      )
    );
  };

  const serversByApplication = new Map<string, string[]>();
  for (const provider of topology.data?.providers ?? [])
    for (const environment of provider.environments)
      for (const server of environment.servers)
        for (const application of server.applications) {
          const names =
            serversByApplication.get(application.applicationName) ?? [];
          if (!names.includes(server.name)) names.push(server.name);
          serversByApplication.set(application.applicationName, names);
        }

  const serverGroups = (topology.data?.providers ?? []).flatMap((provider) =>
    provider.environments.flatMap((environment) =>
      environment.servers.flatMap((server) => {
        const applications = server.applications.filter((application) =>
          application.projects.some((project) => project.id === projectId),
        );
        if (applications.length === 0) return [];
        return [
          {
            key: String(server.id),
            serverId: server.id,
            environment: environment.environmentName,
            serverName: server.name,
            ipAddress: server.ipAddress,
            hostname: server.hostname,
            applications: applications.map((application) => ({
              key: String(application.id),
              applicationName: application.applicationName,
              versionNumber: application.versionNumber,
              exposedPort: application.exposedPort,
            })),
          },
        ];
      }),
    ),
  );
  const isProduction = (name: string) =>
    name.trim().toLowerCase().startsWith("prod");

  const [runningTests, setRunningTests] = useState(false);
  const [testResults, setTestResults] = useState<ReachabilityResult[]>([]);
  const runnableServers = serverGroups.filter((group) =>
    canRunOn(group.serverId),
  );

  const runTests = async () => {
    if (runnableServers.length === 0) return;
    setRunningTests(true);
    setTestResults([]);
    const collected: ReachabilityResult[] = [];
    for (const server of runnableServers) {
      try {
        collected.push(...(await runServerReachability(server.serverId, csrf)));
      } catch (cause) {
        collected.push({
          serverId: server.serverId,
          serverName: server.serverName,
          hostname: null,
          port: null,
          reachable: false,
          error:
            cause instanceof Error ? cause.message : t("servers.testFailed"),
        });
      }
      setTestResults([...collected]);
    }
    setRunningTests(false);
    await queryClient.invalidateQueries({ queryKey: ["command-executions"] });
  };

  const applicationOptions = useQuery({
    queryKey: ["applications", "options"],
    queryFn: () => paged<Application>("/api/applications"),
  });

  const [edit, setEdit] = useState({ name: "", description: "" });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!project.data) return;
    setEdit({
      name: project.data.name,
      description: project.data.description ?? "",
    });
  }, [project.data]);

  const saveProject = async () => {
    if (!project.data) return;
    setMessage(null);
    try {
      await saveEntity(
        "/api/projects",
        project.data.id,
        { name: edit.name, description: edit.description || null },
        csrf,
      );
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setMessage(t("projects.updated"));
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : t("common.saveError"),
      );
    }
  };

  const linkApplication = async (
    _row: Application | null,
    values: FormValues,
  ) => {
    await saveEntity(
      `/api/projects/${projectId}/applications`,
      null,
      { applicationId: Number(values.applicationId) },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["project-applications"] });
  };

  const unlinkApplication = async (row: Application) => {
    await deleteEntity(
      `/api/projects/${projectId}/applications/${row.id}`,
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["project-applications"] });
  };

  return (
    <section className="space-y-4">
      <PageHeaderSlot title={project.data?.name ?? t("projects.detail")} />
      <RecordCard
        title={t("common.record")}
        fields={[
          { name: "name", label: t("common.name"), required: true },
          {
            name: "description",
            label: t("common.description"),
            type: "textarea",
          },
        ]}
        values={edit}
        onChange={setEdit}
        canWrite={isAdmin}
        onSubmit={() => void saveProject()}
        message={message}
      />
      <EntitySection
        title={t("projects.linkedApplications")}
        rows={applications.data}
        columns={[
          {
            key: "name",
            label: t("common.application"),
            render: (row) => row.name,
          },
          {
            key: "basePath",
            label: t("common.basePath"),
            render: (row) => row.basePath,
          },
          {
            key: "listeningOnPort",
            label: t("common.port"),
            render: (row) => row.listeningOnPort,
          },
          {
            key: "servers",
            label: t("common.server"),
            render: (row) =>
              (serversByApplication.get(row.name) ?? []).join(", ") || "—",
          },
        ]}
        fields={[
          {
            name: "applicationId",
            label: t("common.application"),
            type: "select",
            required: true,
            options:
              applicationOptions.data?.items.map((application) => ({
                value: String(application.id),
                label: application.name,
              })) ?? [],
          },
        ]}
        empty={{ applicationId: "" }}
        toForm={() => ({})}
        canWrite={isAdmin}
        canEditRow={() => false}
        onSave={linkApplication}
        onDelete={unlinkApplication}
        rowHref={(row) => `/applications/${row.id}`}
        createLabel={t("projects.linkApplication")}
      />
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3 px-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t("projects.applicationServers")}
          </h2>
          {runnableServers.length > 0 && (
            <button
              type="button"
              onClick={() => void runTests()}
              disabled={runningTests}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {runningTests ? t("servers.testing") : t("servers.runAll")}
            </button>
          )}
        </div>
        <ProjectServerList
          title={t("projects.integrated")}
          servers={serverGroups.filter((row) => !isProduction(row.environment))}
        />
        <ProjectServerList
          title={t("projects.production")}
          servers={serverGroups.filter((row) => isProduction(row.environment))}
        />
        {testResults.length > 0 && (
          <ul className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            {testResults.map((result) => (
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
    </section>
  );
}

type ProjectServerGroup = {
  key: string;
  serverId: number;
  environment: string;
  serverName: string;
  ipAddress: string;
  hostname: string;
  applications: {
    key: string;
    applicationName: string;
    versionNumber: string;
    exposedPort: number;
  }[];
};

function ProjectServerList({
  title,
  servers,
}: {
  title: string;
  servers: ProjectServerGroup[];
}) {
  const { t } = useI18n();
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      {servers.length === 0 ? (
        <p className="mt-2 text-slate-500">{t("projects.noServers")}</p>
      ) : (
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2">{t("common.server")}</th>
              <th className="px-2 py-2">{t("common.ip")}</th>
              <th className="px-2 py-2">{t("common.hostname")}</th>
              <th className="px-2 py-2">{t("common.applications")}</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((server) => (
              <tr key={server.key} className="border-t border-slate-100">
                <td className="px-2 py-2">{server.serverName}</td>
                <td className="px-2 py-2">{server.ipAddress}</td>
                <td className="px-2 py-2">{server.hostname}</td>
                <td className="px-2 py-2">
                  <ul>
                    {server.applications.map((application) => (
                      <li key={application.key}>
                        {application.applicationName}{" "}
                        {application.versionNumber} · :{application.exposedPort}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
