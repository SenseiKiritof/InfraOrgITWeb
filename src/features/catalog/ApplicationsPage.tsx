import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeader, SearchForm } from "../../components/page";
import { apiFetch } from "../../lib/api";
import type {
  Application,
  ApplicationApiQueryParam,
  ApplicationVersion,
  ApplicationVersionApi,
  Paged,
  Project,
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
import { useIsSystemAdmin } from "../../lib/useServerAccess";

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
        empty={{ name: "", description: "", basePath: "", listeningOnPort: "" }}
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
  const queryClient = useQueryClient();

  const application = useQuery({
    queryKey: ["applications", "detail", applicationId],
    queryFn: () => apiFetch<Application>(`/api/applications/${applicationId}`),
    enabled: Number.isInteger(applicationId),
  });

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
    queryFn: () => paged<Project>("/api/projects?pageSize=200"),
  });

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

  return (
    <section className="space-y-4">
      <PageHeader title={application.data?.name ?? "Applicazione"} />
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        {application.data ? (
          <dl className="grid grid-cols-2 gap-2">
            <dt className="text-slate-500">Descrizione</dt>
            <dd>{application.data.description}</dd>
            <dt className="text-slate-500">Base path</dt>
            <dd>{application.data.basePath}</dd>
            <dt className="text-slate-500">Porta in ascolto</dt>
            <dd>{application.data.listeningOnPort}</dd>
          </dl>
        ) : (
          <p className="text-slate-500">Caricamento…</p>
        )}
      </div>
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
          <ApiSection version={version} canWrite={isAdmin} csrfToken={csrf} />
        </NestedSection>
      ))}
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
    </section>
  );
}

function ApiSection({
  version,
  canWrite,
  csrfToken,
}: {
  version: ApplicationVersion;
  canWrite: boolean;
  csrfToken: string;
}) {
  const queryClient = useQueryClient();
  const apis = useQuery({
    queryKey: ["application-version-apis", version.id],
    queryFn: () =>
      apiFetch<Paged<ApplicationVersionApi>>(
        `/api/application-versions/${version.id}/apis?pageSize=200`,
      ),
  });

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
      <EntitySection
        rows={apis.data?.items}
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
        createLabel="Nuova API"
      />
      {apis.data?.items.map((api) => (
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
