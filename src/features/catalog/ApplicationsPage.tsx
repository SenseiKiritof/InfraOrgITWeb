import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeader, SearchForm } from "../../components/page";
import { apiFetch } from "../../lib/api";
import { formatBytes, formatDateTime } from "../../lib/format";
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
        title="Applicazioni"
        description="Catalogo applicazioni con versioni, API e query param."
      />
      <SearchForm
        value={search}
        onChange={setSearch}
        onSubmit={() => setQ(search)}
      />
      <EntitySection
        rows={applications.data?.items}
        columns={[
          { key: "name", label: "Nome", render: (row) => row.name },
          {
            key: "basePath",
            label: "Base path",
            render: (row) => row.basePath,
          },
          {
            key: "listeningOnPort",
            label: "Porta",
            render: (row) => row.listeningOnPort,
          },
          {
            key: "versionCount",
            label: "Versioni",
            render: (row) => row.versionCount,
          },
        ]}
        fields={[
          { name: "name", label: "Nome", required: true },
          { name: "description", label: "Descrizione", type: "textarea" },
          { name: "basePath", label: "Base path", required: true },
          {
            name: "listeningOnPort",
            label: "Porta in ascolto",
            type: "number",
            required: true,
          },
        ]}
        empty={{
          name: "",
          description: "",
          basePath: "",
          listeningOnPort: "",
        }}
        toForm={(row) => ({
          name: row.name,
          description: row.description,
          basePath: row.basePath,
          listeningOnPort: String(row.listeningOnPort),
        })}
        canWrite={isAdmin}
        onSave={save}
        onDelete={remove}
        rowHref={(row) => `/applications/${row.id}`}
        createLabel="Nuova applicazione"
      />
    </section>
  );
}

export function ApplicationDetailPage() {
  const { id } = useParams();
  const applicationId = Number(id);
  const { session } = useAuth();
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
      throw new Error("ParameterValues deve essere un oggetto JSON valido.");
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
      <PageHeader title={application.data?.name ?? "Applicazione"} />
      <EntitySection
        title="Anagrafica"
        rows={application.data ? [application.data] : undefined}
        columns={[
          { key: "name", label: "Nome", render: (row) => row.name },
          {
            key: "description",
            label: "Descrizione",
            render: (row) => row.description,
          },
          {
            key: "basePath",
            label: "Base path",
            render: (row) => row.basePath,
          },
          {
            key: "listeningOnPort",
            label: "Porta",
            render: (row) => row.listeningOnPort,
          },
        ]}
        fields={[
          { name: "name", label: "Nome", required: true },
          { name: "description", label: "Descrizione", type: "textarea" },
          { name: "basePath", label: "Base path", required: true },
          {
            name: "listeningOnPort",
            label: "Porta in ascolto",
            type: "number",
            required: true,
          },
        ]}
        empty={{
          name: "",
          description: "",
          basePath: "",
          listeningOnPort: "",
        }}
        toForm={(row) => ({
          name: row.name,
          description: row.description,
          basePath: row.basePath,
          listeningOnPort: String(row.listeningOnPort),
        })}
        canWrite={isAdmin}
        canCreate={false}
        onSave={saveApplication}
      />
      <EntitySection
        title="Versioni"
        rows={versions.data?.items}
        columns={[
          {
            key: "versionNumber",
            label: "Versione",
            render: (row) => row.versionNumber,
          },
          { key: "apiCount", label: "API", render: (row) => row.apiCount },
        ]}
        fields={[
          { name: "versionNumber", label: "Numero versione", required: true },
        ]}
        empty={{ versionNumber: "" }}
        toForm={(row) => ({ versionNumber: row.versionNumber })}
        canWrite={isAdmin}
        onSave={saveVersion}
        onDelete={removeVersion}
        createLabel="Nuova versione"
      />
      {versions.data?.items.map((version) => (
        <NestedSection
          key={version.id}
          title={`API della versione ${version.versionNumber}`}
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
        title="Server"
        rows={deployments.data?.items}
        columns={[
          {
            key: "serverName",
            label: "Server",
            render: (row) => row.serverName,
          },
          {
            key: "ipAddress",
            label: "IP",
            render: (row) => serversById.get(row.serverId)?.ipAddress ?? "",
          },
          {
            key: "environment",
            label: "Ambiente",
            render: (row) =>
              serversById.get(row.serverId)?.providerEnvironmentLabel ?? "",
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
            name: "serverId",
            label: "Server",
            type: "select",
            required: true,
            options: adminServers.map((server) => ({
              value: String(server.id),
              label: server.name,
            })),
          },
          {
            name: "applicationVersionId",
            label: "Versione",
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
            label: "Porta esposta",
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
        createLabel="Aggiungi server"
      />
      <EntitySection
        title="Ambienti"
        rows={environmentRows}
        columns={[
          { key: "name", label: "Ambiente", render: (row) => row.name },
          {
            key: "hostname",
            label: "Hostname",
            render: (row) => row.hostname ?? "",
          },
          {
            key: "ignoreSslErrors",
            label: "SSL",
            render: (row) => (row.ignoreSslErrors ? "ignorato" : "verificato"),
          },
        ]}
        fields={[
          {
            name: "hostname",
            label: "Hostname (URL per le chiamate)",
          },
          {
            name: "ignoreSslErrors",
            label: "Ignora errori certificato SSL",
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
      <EntitySection
        title="API key"
        rows={apiKeys.data}
        columns={[
          { key: "name", label: "Nome", render: (row) => row.name },
          {
            key: "environmentId",
            label: "Ambiente",
            render: (row) =>
              row.environmentId === null
                ? "Tutti"
                : (environments.data?.find(
                    (environment) =>
                      environment.environmentId === row.environmentId,
                  )?.name ?? `#${row.environmentId}`),
          },
          {
            key: "location",
            label: "Posizione",
            render: (row) => row.location,
          },
          {
            key: "hasValue",
            label: "Valore",
            render: (row) => (row.hasValue ? "configurato" : "mancante"),
          },
        ]}
        fields={[
          { name: "name", label: "Nome (header o query)", required: true },
          {
            name: "environmentId",
            label: "Ambiente",
            type: "select",
            options: [
              { value: "", label: "Tutti gli ambienti" },
              ...(environments.data ?? []).map((environment) => ({
                value: String(environment.environmentId),
                label: environment.name,
              })),
            ],
          },
          {
            name: "location",
            label: "Posizione",
            type: "select",
            required: true,
            options: [
              { value: "Header", label: "Header" },
              { value: "Query", label: "Query" },
            ],
          },
          {
            name: "value",
            label: "Valore (vuoto = mantieni)",
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
        createLabel="Nuova API key"
      />
      <EntitySection
        title="Chiamate"
        rows={calls.data?.items}
        columns={[
          {
            key: "createdAt",
            label: "Data/ora",
            render: (row) => formatDateTime(row.createdAt),
          },
          {
            key: "environmentName",
            label: "Ambiente",
            render: (row) => row.environmentName,
          },
          { key: "method", label: "Metodo", render: (row) => row.method },
          { key: "url", label: "URL", render: (row) => row.url },
          {
            key: "status",
            label: "Stato",
            render: (row) => row.status ?? "",
          },
          {
            key: "durationMs",
            label: "Durata ms",
            render: (row) => row.durationMs,
          },
          {
            key: "sizeBytes",
            label: "Dimensione",
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
            Apri
          </button>
        )}
      />
      {calls.data && calls.data.total > calls.data.items.length && (
        <p className="text-xs text-slate-500">
          Mostrate le ultime {calls.data.items.length} di {calls.data.total}{" "}
          chiamate.
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
      <EntitySection
        title="Progetti collegati"
        rows={projects.data}
        columns={[
          { key: "name", label: "Progetto", render: (row) => row.name },
        ]}
        fields={[
          {
            name: "projectId",
            label: "Progetto",
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
        createLabel="Collega progetto"
      />
      {isAdmin && (
        <EntitySection
          title="Azioni applicazione"
          rows={actions.data}
          columns={[
            { key: "label", label: "Etichetta", render: (row) => row.label },
            { key: "order", label: "Ordine", render: (row) => row.order },
            {
              key: "commandTemplateName",
              label: "Comando",
              render: (row) => row.commandTemplateName ?? "script custom",
            },
            {
              key: "requiresConfirmation",
              label: "Conferma",
              render: (row) => (row.requiresConfirmation ? "sì" : ""),
            },
          ]}
          fields={[
            { name: "label", label: "Etichetta", required: true },
            { name: "order", label: "Ordine", type: "number" },
            {
              name: "commandTemplateId",
              label: "Comando base",
              type: "select",
              options:
                commandTemplates.data?.items.map(
                  (template: CommandTemplate) => ({
                    value: String(template.id),
                    label: template.name,
                  }),
                ) ?? [],
            },
            { name: "customScript", label: "Script custom", type: "textarea" },
            {
              name: "parameterValues",
              label: "Valori parametri (JSON)",
              type: "textarea",
            },
            {
              name: "requiresConfirmation",
              label: "Richiede conferma",
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
          createLabel="Nuova azione"
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
        aria-label={`Cerca API della versione ${version.versionNumber}`}
        placeholder="Cerca API: metodo, URL o descrizione…"
        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />
      <EntitySection
        rows={visibleApis}
        columns={[
          {
            key: "requestType",
            label: "Metodo",
            render: (row) => row.requestType,
          },
          { key: "url", label: "URL", render: (row) => row.url },
          {
            key: "description",
            label: "Descrizione",
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
            label: "Metodo",
            type: "select",
            required: true,
            options: requestTypes.map((type) => ({ value: type, label: type })),
          },
          { name: "url", label: "URL", required: true },
          { name: "description", label: "Descrizione" },
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
              Chiama
            </button>
          ) : null
        }
        createLabel="Nuova API"
      />
      {visibleApis?.map((api) => (
        <NestedSection
          key={api.id}
          title={`Query param di ${api.requestType} ${api.url}`}
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
        { key: "name", label: "Nome", render: (row) => row.name },
        { key: "paramType", label: "Tipo", render: (row) => row.paramType },
      ]}
      fields={[
        { name: "name", label: "Nome", required: true },
        {
          name: "paramType",
          label: "Tipo",
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
      createLabel="Nuovo query param"
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
