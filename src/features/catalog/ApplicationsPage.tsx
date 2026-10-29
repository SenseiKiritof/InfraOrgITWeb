import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeaderSlot } from "../../components/PageHeaderSlot";
import { PageHeader, SearchForm } from "../../components/page";
import { apiFetch } from "../../lib/api";
import { formatBytes, formatDateTime } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import type {
  Application,
  ApplicationApiCall,
  ApplicationApiKey,
  ApplicationApiQueryParam,
  ApplicationEnvironment,
  ApplicationVersion,
  ApplicationVersionApi,
  Paged,
  Project,
  Server,
  ServerApplication,
} from "../../lib/inventory";
import { deleteEntity, listOf, paged, saveEntity } from "../../lib/inventory";
import type {
  ApplicationActionConfig,
  CommandTemplate,
} from "../../lib/remote";
import {
  getApplicationActions,
  getCommandTemplates,
  saveApplicationAction,
} from "../../lib/remote";
import { useQueryFilter } from "../../lib/useQueryFilter";
import { useIsSystemAdmin, useServerAccess } from "../../lib/useServerAccess";
import { ApiCallModal } from "./ApiCallModal";
import { ApiSpecImport } from "./ApiSpecImport";
import { SavedCallModal } from "./SavedCallModal";

const requestTypes = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const paramTypes = [
  "Int",
  "String",
  "Bool",
  "DateTime",
  "Double",
  "Decimal",
] as const;

export function ApplicationsPage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const csrf = session?.csrfToken ?? "";
  const isAdmin = useIsSystemAdmin();
  const queryClient = useQueryClient();
  const { search, setSearch, q, setQ } = useQueryFilter();

  const applications = useQuery({
    queryKey: ["applications", q],
    queryFn: () => paged<Application>("/api/applications", q),
  });

  const save = async (row: Application | null, values: FormValues) => {
    await saveEntity(
      "/api/applications",
      row?.id ?? null,
      {
        name: values.name,
        description: values.description,
        basePath: values.basePath,
        listeningOnPort: Number(values.listeningOnPort),
        isFrontend: values.isFrontend === "true",
      },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["applications"] });
  };

  const remove = async (row: Application) => {
    await deleteEntity(`/api/applications/${row.id}`, csrf);
    await queryClient.invalidateQueries({ queryKey: ["applications"] });
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title={t("applications.title")}
        description={t("applications.description")}
      />
      <SearchForm
        value={search}
        onChange={setSearch}
        onSubmit={() => setQ(search)}
      />
      <EntitySection
        rows={applications.data?.items}
        columns={[
          { key: "name", label: t("common.name"), render: (row) => row.name },
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
            key: "isFrontend",
            label: t("common.type"),
            render: (row) => (row.isFrontend ? "FE" : "BE"),
          },
          {
            key: "versionCount",
            label: t("common.versions"),
            render: (row) => row.versionCount,
          },
        ]}
        fields={[
          { name: "name", label: t("common.name"), required: true },
          {
            name: "description",
            label: t("common.description"),
            type: "textarea",
          },
          { name: "basePath", label: t("common.basePath"), required: true },
          {
            name: "listeningOnPort",
            label: t("applications.listeningPort"),
            type: "number",
            required: true,
          },
          {
            name: "isFrontend",
            label: t("applications.isFrontend"),
            type: "checkbox",
          },
        ]}
        empty={{
          name: "",
          description: "",
          basePath: "",
          listeningOnPort: "",
          isFrontend: "false",
        }}
        toForm={(row) => ({
          name: row.name,
          description: row.description,
          basePath: row.basePath,
          listeningOnPort: String(row.listeningOnPort),
          isFrontend: String(row.isFrontend),
        })}
        canWrite={isAdmin}
        onSave={save}
        onDelete={remove}
        rowHref={(row) => `/applications/${row.id}`}
        createLabel={t("applications.create")}
      />
    </section>
  );
}

export function ApplicationDetailPage() {
  const { id } = useParams();
  const applicationId = Number(id);
  const { session } = useAuth();
  const { t } = useI18n();
  const csrf = session?.csrfToken ?? "";
  const isAdmin = useIsSystemAdmin();
  const access = useServerAccess();
  const adminEnvironmentIds = access.data?.adminEnvironmentIds ?? [];
  const canManageDeployments = adminEnvironmentIds.length > 0;
  const queryClient = useQueryClient();

  const application = useQuery({
    queryKey: ["applications", "detail", applicationId],
    queryFn: () => apiFetch<Application>(`/api/applications/${applicationId}`),
    enabled: Number.isInteger(applicationId),
  });

  const apiKeys = useQuery({
    queryKey: ["application-api-keys", applicationId],
    queryFn: () =>
      listOf<ApplicationApiKey>(`/api/applications/${applicationId}/api-keys`),
    enabled: Number.isInteger(applicationId),
  });

  const environments = useQuery({
    queryKey: ["application-environments", applicationId],
    queryFn: () =>
      apiFetch<ApplicationEnvironment[]>(
        `/api/applications/${applicationId}/environments`,
      ),
    enabled: Number.isInteger(applicationId),
  });
  const environmentRows = environments.data?.map((environment) => ({
    ...environment,
    id: environment.environmentId,
  }));

  const calls = useQuery({
    queryKey: ["api-calls", applicationId],
    queryFn: () =>
      apiFetch<Paged<ApplicationApiCall>>(
        `/api/api-calls?applicationId=${applicationId}&pageSize=200`,
      ),
    enabled: Number.isInteger(applicationId),
  });
  const [openCall, setOpenCall] = useState<ApplicationApiCall | null>(null);
  const isFrontend = application.data?.isFrontend ?? false;

  const versions = useQuery({
    queryKey: ["application-versions", "application", applicationId],
    queryFn: () =>
      apiFetch<Paged<ApplicationVersion>>(
        `/api/applications/${applicationId}/versions?pageSize=200`,
      ),
    enabled: Number.isInteger(applicationId),
  });

  const projects = useQuery({
    queryKey: ["application-projects", applicationId],
    queryFn: () =>
      listOf<Project>(`/api/applications/${applicationId}/projects`),
    enabled: Number.isInteger(applicationId),
  });

  const projectOptions = useQuery({
    queryKey: ["projects", "options"],
    queryFn: () => paged<Project>("/api/projects"),
  });

  const deployments = useQuery({
    queryKey: ["server-applications", "application", applicationId],
    queryFn: () =>
      paged<ServerApplication>(
        `/api/server-applications?applicationId=${applicationId}`,
      ),
    enabled: Number.isInteger(applicationId),
  });

  const serverOptions = useQuery({
    queryKey: ["servers", "options"],
    queryFn: () => paged<Server>("/api/servers"),
  });
  const serversById = new Map(
    (serverOptions.data?.items ?? []).map((server) => [server.id, server]),
  );
  const adminServers =
    serverOptions.data?.items.filter((server) =>
      adminEnvironmentIds.includes(server.providerEnvironmentId),
    ) ?? [];

  const commandTemplates = useQuery({
    queryKey: ["command-templates", "options"],
    queryFn: getCommandTemplates,
    enabled: isAdmin,
    retry: false,
  });

  const actions = useQuery({
    queryKey: ["application-actions", applicationId],
    queryFn: () => getApplicationActions(applicationId),
    enabled: isAdmin && Number.isInteger(applicationId),
    retry: false,
  });

  const saveAction = async (
    row: ApplicationActionConfig | null,
    values: FormValues,
  ) => {
    let parameterValues: Record<string, string>;
    try {
      parameterValues = values.parameterValues
        ? (JSON.parse(values.parameterValues) as Record<string, string>)
        : {};
    } catch {
      throw new Error(t("applications.invalidParameterValues"));
    }

    const commandTemplateId = values.commandTemplateId
      ? Number(values.commandTemplateId)
      : null;
    await saveApplicationAction(
      applicationId,
      row?.id ?? null,
      {
        label: values.label,
        order: Number(values.order || 0),
        commandTemplateId,
        customScript: commandTemplateId ? null : values.customScript,
        parameterValues,
        requiresConfirmation: values.requiresConfirmation === "true",
      },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["application-actions"] });
  };

  const removeAction = async (row: ApplicationActionConfig) => {
    await deleteEntity(`/api/application-actions/${row.id}`, csrf);
    await queryClient.invalidateQueries({ queryKey: ["application-actions"] });
  };

  const saveVersion = async (
    row: ApplicationVersion | null,
    values: FormValues,
  ) => {
    await saveEntity(
      row
        ? "/api/application-versions"
        : `/api/applications/${applicationId}/versions`,
      row?.id ?? null,
      { applicationId, versionNumber: values.versionNumber },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["application-versions"] });
  };

  const removeVersion = async (row: ApplicationVersion) => {
    await deleteEntity(`/api/application-versions/${row.id}`, csrf);
    await queryClient.invalidateQueries({ queryKey: ["application-versions"] });
  };

  const linkProject = async (_row: Project | null, values: FormValues) => {
    await saveEntity(
      `/api/applications/${applicationId}/projects`,
      null,
      { projectId: Number(values.projectId) },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["application-projects"] });
  };

  const unlinkProject = async (row: Project) => {
    await deleteEntity(
      `/api/applications/${applicationId}/projects/${row.id}`,
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["application-projects"] });
  };

  const saveDeployment = async (
    row: ServerApplication | null,
    values: FormValues,
  ) => {
    await saveEntity(
      "/api/server-applications",
      row?.id ?? null,
      {
        serverId: Number(values.serverId),
        applicationVersionId: Number(values.applicationVersionId),
        exposedPort: Number(values.exposedPort),
        proxyRouteId: row?.proxyRouteId ?? null,
      },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["server-applications"] });
    await queryClient.invalidateQueries({
      queryKey: ["application-environments"],
    });
  };

  const removeDeployment = async (row: ServerApplication) => {
    await deleteEntity(`/api/server-applications/${row.id}`, csrf);
    await queryClient.invalidateQueries({ queryKey: ["server-applications"] });
    await queryClient.invalidateQueries({
      queryKey: ["application-environments"],
    });
  };

  const saveApplication = async (
    row: Application | null,
    values: FormValues,
  ) => {
    if (!row) return;
    await saveEntity(
      "/api/applications",
      row.id,
      {
        name: values.name,
        description: values.description,
        basePath: values.basePath,
        listeningOnPort: Number(values.listeningOnPort),
        isFrontend: values.isFrontend === "true",
      },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["applications"] });
  };

  const saveApiKey = async (
    row: ApplicationApiKey | null,
    values: FormValues,
  ) => {
    await saveEntity(
      `/api/applications/${applicationId}/api-keys`,
      row?.id ?? null,
      {
        name: values.name,
        location: values.location,
        value: values.value || null,
        environmentId: values.environmentId
          ? Number(values.environmentId)
          : null,
      },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["application-api-keys"] });
  };

  const removeApiKey = async (row: ApplicationApiKey) => {
    await deleteEntity(
      `/api/applications/${applicationId}/api-keys/${row.id}`,
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["application-api-keys"] });
  };

  const saveEnvironment = async (
    row: (ApplicationEnvironment & { id: number }) | null,
    values: FormValues,
  ) => {
    if (!row) return;
    await saveEntity(
      `/api/applications/${applicationId}/environments`,
      row.environmentId,
      {
        hostname: values.hostname || null,
        ignoreSslErrors: values.ignoreSslErrors === "true",
      },
      csrf,
    );
    await queryClient.invalidateQueries({
      queryKey: ["application-environments", applicationId],
    });
  };

  const removeCall = async (row: ApplicationApiCall) => {
    await deleteEntity(`/api/api-calls/${row.id}`, csrf);
    await queryClient.invalidateQueries({ queryKey: ["api-calls"] });
  };

  return (
    <section className="space-y-4">
      <PageHeaderSlot
        title={application.data?.name ?? t("applications.detail")}
      />
      <EntitySection
        title={t("common.record")}
        rows={application.data ? [application.data] : undefined}
        columns={[
          { key: "name", label: t("common.name"), render: (row) => row.name },
          {
            key: "description",
            label: t("common.description"),
            render: (row) => row.description,
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
            key: "isFrontend",
            label: t("common.type"),
            render: (row) => (row.isFrontend ? "FE" : "BE"),
          },
        ]}
        fields={[
          { name: "name", label: t("common.name"), required: true },
          {
            name: "description",
            label: t("common.description"),
            type: "textarea",
          },
          { name: "basePath", label: t("common.basePath"), required: true },
          {
            name: "listeningOnPort",
            label: t("applications.listeningPort"),
            type: "number",
            required: true,
          },
          {
            name: "isFrontend",
            label: t("applications.isFrontend"),
            type: "checkbox",
          },
        ]}
        empty={{
          name: "",
          description: "",
          basePath: "",
          listeningOnPort: "",
          isFrontend: "false",
        }}
        toForm={(row) => ({
          name: row.name,
          description: row.description,
          basePath: row.basePath,
          listeningOnPort: String(row.listeningOnPort),
          isFrontend: String(row.isFrontend),
        })}
        canWrite={isAdmin}
        canCreate={false}
        onSave={saveApplication}
      />
      <EntitySection
        title={t("common.versions")}
        rows={versions.data?.items}
        columns={[
          {
            key: "versionNumber",
            label: t("common.version"),
            render: (row) => row.versionNumber,
          },
          { key: "apiCount", label: "API", render: (row) => row.apiCount },
        ]}
        fields={[
          {
            name: "versionNumber",
            label: t("applications.versionNumber"),
            required: true,
          },
        ]}
        empty={{ versionNumber: "" }}
        toForm={(row) => ({ versionNumber: row.versionNumber })}
        canWrite={isAdmin}
        onSave={saveVersion}
        onDelete={removeVersion}
        createLabel={t("applications.createVersion")}
      />
      {!isFrontend &&
        versions.data?.items.map((version) => (
          <NestedSection
            key={version.id}
            title={t("applications.versionApis", {
              version: version.versionNumber,
            })}
          >
            <ApiSection
              version={version}
              applicationId={applicationId}
              canWrite={isAdmin}
              csrfToken={csrf}
            />
          </NestedSection>
        ))}
      <EntitySection
        title={t("common.servers")}
        rows={deployments.data?.items}
        columns={[
          {
            key: "serverName",
            label: t("common.server"),
            render: (row) => row.serverName,
          },
          {
            key: "ipAddress",
            label: t("common.ip"),
            render: (row) => serversById.get(row.serverId)?.ipAddress ?? "",
          },
          {
            key: "environment",
            label: t("common.environment"),
            render: (row) =>
              serversById.get(row.serverId)?.providerEnvironmentLabel ?? "",
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
        ]}
        fields={[
          {
            name: "serverId",
            label: t("applications.serverHint"),
            type: "select",
            required: true,
            options: adminServers.map((server) => ({
              value: String(server.id),
              label: `${server.name} · ${server.ipAddress} · ${server.providerEnvironmentLabel}`,
            })),
          },
          {
            name: "applicationVersionId",
            label: t("common.version"),
            type: "select",
            required: true,
            options:
              versions.data?.items.map((version) => ({
                value: String(version.id),
                label: version.versionNumber,
              })) ?? [],
          },
          {
            name: "exposedPort",
            label: t("servers.exposedPort"),
            type: "number",
            required: true,
          },
        ]}
        empty={{
          serverId: "",
          applicationVersionId: "",
          exposedPort: String(application.data?.listeningOnPort ?? ""),
        }}
        toForm={(row) => ({
          serverId: String(row.serverId),
          applicationVersionId: String(row.applicationVersionId),
          exposedPort: String(row.exposedPort),
        })}
        canWrite={canManageDeployments}
        canEditRow={(row) =>
          adminServers.some((server) => server.id === row.serverId)
        }
        canDeleteRow={(row) =>
          adminServers.some((server) => server.id === row.serverId)
        }
        onSave={saveDeployment}
        onDelete={removeDeployment}
        rowHref={(row) => `/servers/${row.serverId}`}
        createLabel={t("applications.addServer")}
      />
      <EntitySection
        title={t("common.environments")}
        rows={environmentRows}
        columns={[
          {
            key: "name",
            label: t("common.environment"),
            render: (row) => row.name,
          },
          {
            key: "hostname",
            label: t("common.hostname"),
            render: (row) => row.hostname ?? "",
          },
          {
            key: "ignoreSslErrors",
            label: "SSL",
            render: (row) =>
              row.ignoreSslErrors
                ? t("applications.sslIgnored")
                : t("applications.sslVerified"),
          },
        ]}
        fields={[
          {
            name: "hostname",
            label: t("applications.hostnameHint"),
          },
          {
            name: "ignoreSslErrors",
            label: t("applications.ignoreSsl"),
            type: "checkbox",
          },
        ]}
        empty={{ hostname: "", ignoreSslErrors: "false" }}
        toForm={(row) => ({
          hostname: row.hostname ?? "",
          ignoreSslErrors: String(row.ignoreSslErrors),
        })}
        canWrite={isAdmin}
        canCreate={false}
        onSave={saveEnvironment}
      />
      {!isFrontend && (
        <EntitySection
          title={t("applications.apiKey")}
          rows={apiKeys.data}
          columns={[
            {
              key: "name",
              label: t("common.name"),
              render: (row) => row.name,
            },
            {
              key: "environmentId",
              label: t("common.environment"),
              render: (row) =>
                row.environmentId === null
                  ? t("applications.allEnvironmentsShort")
                  : (environments.data?.find(
                      (environment) =>
                        environment.environmentId === row.environmentId,
                    )?.name ?? `#${row.environmentId}`),
            },
            {
              key: "location",
              label: t("applications.location"),
              render: (row) => row.location,
            },
            {
              key: "hasValue",
              label: t("applications.value"),
              render: (row) =>
                row.hasValue
                  ? t("applications.configured")
                  : t("applications.missing"),
            },
          ]}
          fields={[
            {
              name: "name",
              label: t("applications.nameHint"),
              required: true,
            },
            {
              name: "environmentId",
              label: t("common.environment"),
              type: "select",
              options: [
                { value: "", label: t("applications.allEnvironments") },
                ...(environments.data ?? []).map((environment) => ({
                  value: String(environment.environmentId),
                  label: environment.name,
                })),
              ],
            },
            {
              name: "location",
              label: t("applications.location"),
              type: "select",
              required: true,
              options: [
                { value: "Header", label: "Header" },
                { value: "Query", label: "Query" },
              ],
            },
            {
              name: "value",
              label: t("applications.valueHint"),
            },
          ]}
          empty={{ name: "", environmentId: "", location: "Header", value: "" }}
          toForm={(row) => ({
            name: row.name,
            environmentId:
              row.environmentId === null ? "" : String(row.environmentId),
            location: row.location,
            value: "",
          })}
          canWrite={isAdmin}
          onSave={saveApiKey}
          onDelete={removeApiKey}
          createLabel={t("applications.createApiKey")}
        />
      )}
      {!isFrontend && (
        <>
          <EntitySection
            title={t("applications.calls")}
            rows={calls.data?.items}
            columns={[
              {
                key: "createdAt",
                label: t("common.dateTime"),
                render: (row) => formatDateTime(row.createdAt),
              },
              {
                key: "environmentName",
                label: t("common.environment"),
                render: (row) => row.environmentName,
              },
              {
                key: "method",
                label: t("common.method"),
                render: (row) => row.method,
              },
              { key: "url", label: "URL", render: (row) => row.url },
              {
                key: "status",
                label: t("common.status"),
                render: (row) => row.status ?? "",
              },
              {
                key: "durationMs",
                label: t("common.durationMs"),
                render: (row) => row.durationMs,
              },
              {
                key: "sizeBytes",
                label: t("common.size"),
                render: (row) => formatBytes(row.sizeBytes),
              },
            ]}
            fields={[]}
            empty={{}}
            toForm={() => ({})}
            canWrite
            canCreate={false}
            canEditRow={() => false}
            onSave={async () => undefined}
            onDelete={removeCall}
            rowLabel={(row) => `${row.method} ${row.url}`}
            rowActions={(row) => (
              <button
                type="button"
                onClick={() => setOpenCall(row)}
                className="text-sm text-slate-700 underline"
              >
                {t("common.open")}
              </button>
            )}
          />
          {calls.data && calls.data.total > calls.data.items.length && (
            <p className="text-xs text-slate-500">
              {t("applications.callsLimited", {
                shown: calls.data.items.length,
                total: calls.data.total,
              })}
            </p>
          )}
          {openCall && (
            <SavedCallModal
              callId={openCall.id}
              applicationId={applicationId}
              csrfToken={csrf}
              onClose={() => setOpenCall(null)}
            />
          )}
        </>
      )}
      <EntitySection
        title={t("applications.linkedProjects")}
        rows={projects.data}
        columns={[
          {
            key: "name",
            label: t("common.project"),
            render: (row) => row.name,
          },
        ]}
        fields={[
          {
            name: "projectId",
            label: t("common.project"),
            type: "select",
            required: true,
            options:
              projectOptions.data?.items.map((project) => ({
                value: String(project.id),
                label: project.name,
              })) ?? [],
          },
        ]}
        empty={{ projectId: "" }}
        toForm={() => ({})}
        canWrite={isAdmin}
        canEditRow={() => false}
        onSave={linkProject}
        onDelete={unlinkProject}
        createLabel={t("applications.linkProject")}
      />
      {isAdmin && (
        <EntitySection
          title={t("applications.actionsTitle")}
          rows={actions.data}
          columns={[
            {
              key: "label",
              label: t("common.label"),
              render: (row) => row.label,
            },
            {
              key: "order",
              label: t("applications.order"),
              render: (row) => row.order,
            },
            {
              key: "commandTemplateName",
              label: t("applications.command"),
              render: (row) =>
                row.commandTemplateName ?? t("applications.customScript"),
            },
            {
              key: "requiresConfirmation",
              label: t("applications.confirmation"),
              render: (row) =>
                row.requiresConfirmation ? t("common.yes") : "",
            },
          ]}
          fields={[
            {
              name: "label",
              label: t("common.label"),
              required: true,
            },
            {
              name: "order",
              label: t("applications.order"),
              type: "number",
            },
            {
              name: "commandTemplateId",
              label: t("applications.baseCommand"),
              type: "select",
              options:
                commandTemplates.data?.items.map(
                  (template: CommandTemplate) => ({
                    value: String(template.id),
                    label: template.name,
                  }),
                ) ?? [],
            },
            {
              name: "customScript",
              label: t("applications.customScriptLabel"),
              type: "textarea",
            },
            {
              name: "parameterValues",
              label: t("applications.parameterValues"),
              type: "textarea",
            },
            {
              name: "requiresConfirmation",
              label: t("applications.requiresConfirmation"),
              type: "checkbox",
            },
          ]}
          empty={{
            label: "",
            order: "0",
            commandTemplateId: "",
            customScript: "",
            parameterValues: "{}",
            requiresConfirmation: "false",
          }}
          toForm={(row) => ({
            label: row.label,
            order: String(row.order),
            commandTemplateId: row.commandTemplateId
              ? String(row.commandTemplateId)
              : "",
            customScript: row.customScript ?? "",
            parameterValues: JSON.stringify(row.parameterValues),
            requiresConfirmation: String(row.requiresConfirmation),
          })}
          canWrite={isAdmin}
          onSave={saveAction}
          onDelete={removeAction}
          createLabel={t("applications.createAction")}
        />
      )}
    </section>
  );
}

function ApiSection({
  version,
  applicationId,
  canWrite,
  csrfToken,
}: {
  version: ApplicationVersion;
  applicationId: number;
  canWrite: boolean;
  csrfToken: string;
}) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [calling, setCalling] = useState<ApplicationVersionApi | null>(null);
  const apis = useQuery({
    queryKey: ["application-version-apis", version.id],
    queryFn: () =>
      apiFetch<Paged<ApplicationVersionApi>>(
        `/api/application-versions/${version.id}/apis?pageSize=200`,
      ),
  });

  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const visibleApis =
    needle && apis.data
      ? apis.data.items.filter(
          (api) =>
            api.url.toLowerCase().includes(needle) ||
            api.requestType.toLowerCase().includes(needle) ||
            api.description.toLowerCase().includes(needle),
        )
      : apis.data?.items;

  const save = async (
    row: ApplicationVersionApi | null,
    values: FormValues,
  ) => {
    await saveEntity(
      row
        ? "/api/application-version-apis"
        : `/api/application-versions/${version.id}/apis`,
      row?.id ?? null,
      {
        applicationVersionId: version.id,
        url: values.url,
        requestType: values.requestType,
        description: values.description,
        body: values.body || null,
      },
      csrfToken,
    );
    await queryClient.invalidateQueries({
      queryKey: ["application-version-apis", version.id],
    });
    await queryClient.invalidateQueries({ queryKey: ["application-versions"] });
  };

  const remove = async (row: ApplicationVersionApi) => {
    await deleteEntity(`/api/application-version-apis/${row.id}`, csrfToken);
    await queryClient.invalidateQueries({
      queryKey: ["application-version-apis", version.id],
    });
    await queryClient.invalidateQueries({ queryKey: ["application-versions"] });
  };

  return (
    <>
      {canWrite && (
        <ApiSpecImport
          versionId={version.id}
          applicationId={applicationId}
          csrfToken={csrfToken}
          onImported={() => {
            void queryClient.invalidateQueries({
              queryKey: ["application-version-apis", version.id],
            });
            void queryClient.invalidateQueries({
              queryKey: ["application-versions"],
            });
            void queryClient.invalidateQueries({
              queryKey: ["application-api-keys"],
            });
          }}
        />
      )}
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label={t("applications.searchApiLabel", {
          version: version.versionNumber,
        })}
        placeholder={t("applications.searchApiPlaceholder")}
        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />
      <EntitySection
        rows={visibleApis}
        columns={[
          {
            key: "requestType",
            label: t("common.method"),
            render: (row) => row.requestType,
          },
          { key: "url", label: "URL", render: (row) => row.url },
          {
            key: "description",
            label: t("common.description"),
            render: (row) => row.description,
          },
          {
            key: "queryParamCount",
            label: "Query param",
            render: (row) => row.queryParamCount,
          },
        ]}
        fields={[
          {
            name: "requestType",
            label: t("common.method"),
            type: "select",
            required: true,
            options: requestTypes.map((type) => ({ value: type, label: type })),
          },
          { name: "url", label: "URL", required: true },
          { name: "description", label: t("common.description") },
          { name: "body", label: "Body", type: "textarea" },
        ]}
        empty={{
          requestType: "GET",
          url: "",
          description: "",
          body: "",
        }}
        toForm={(row) => ({
          requestType: row.requestType,
          url: row.url,
          description: row.description,
          body: row.body ?? "",
        })}
        canWrite={canWrite}
        onSave={save}
        onDelete={remove}
        rowActions={(row) =>
          canWrite ? (
            <button
              type="button"
              onClick={() => setCalling(row)}
              className="text-sm text-slate-700 underline"
            >
              {t("applications.call")}
            </button>
          ) : null
        }
        createLabel={t("applications.newApi")}
      />
      {visibleApis?.map((api) => (
        <NestedSection
          key={api.id}
          title={t("applications.queryParamsOf", {
            method: api.requestType,
            url: api.url,
          })}
        >
          <QueryParamSection
            api={api}
            canWrite={canWrite}
            csrfToken={csrfToken}
          />
        </NestedSection>
      ))}
      {calling && (
        <ApiCallModal
          api={calling}
          applicationId={applicationId}
          csrfToken={csrfToken}
          onClose={() => setCalling(null)}
        />
      )}
    </>
  );
}

function QueryParamSection({
  api,
  canWrite,
  csrfToken,
}: {
  api: ApplicationVersionApi;
  canWrite: boolean;
  csrfToken: string;
}) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const params = useQuery({
    queryKey: ["application-api-query-params", api.id],
    queryFn: () =>
      apiFetch<Paged<ApplicationApiQueryParam>>(
        `/api/application-version-apis/${api.id}/query-params?pageSize=200`,
      ),
  });

  const save = async (
    row: ApplicationApiQueryParam | null,
    values: FormValues,
  ) => {
    await saveEntity(
      row
        ? "/api/application-api-query-params"
        : `/api/application-version-apis/${api.id}/query-params`,
      row?.id ?? null,
      {
        applicationApiId: api.id,
        name: values.name,
        paramType: values.paramType,
      },
      csrfToken,
    );
    await queryClient.invalidateQueries({
      queryKey: ["application-api-query-params", api.id],
    });
    await queryClient.invalidateQueries({
      queryKey: ["application-version-apis"],
    });
  };

  const remove = async (row: ApplicationApiQueryParam) => {
    await deleteEntity(
      `/api/application-api-query-params/${row.id}`,
      csrfToken,
    );
    await queryClient.invalidateQueries({
      queryKey: ["application-api-query-params", api.id],
    });
    await queryClient.invalidateQueries({
      queryKey: ["application-version-apis"],
    });
  };

  return (
    <EntitySection
      rows={params.data?.items}
      columns={[
        { key: "name", label: t("common.name"), render: (row) => row.name },
        {
          key: "paramType",
          label: t("common.type"),
          render: (row) => row.paramType,
        },
      ]}
      fields={[
        { name: "name", label: t("common.name"), required: true },
        {
          name: "paramType",
          label: t("common.type"),
          type: "select",
          required: true,
          options: paramTypes.map((type) => ({ value: type, label: type })),
        },
      ]}
      empty={{ name: "", paramType: "String" }}
      toForm={(row) => ({ name: row.name, paramType: row.paramType })}
      canWrite={canWrite}
      onSave={save}
      onDelete={remove}
      createLabel={t("applications.newQueryParam")}
    />
  );
}

function NestedSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-700"
      >
        {title}
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-slate-200 p-2">
          {children}
        </div>
      )}
    </section>
  );
}
