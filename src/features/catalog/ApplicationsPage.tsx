import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Project,
} from "../../lib/inventory";
import { deleteEntity, listOf, paged, saveEntity } from "../../lib/inventory";
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
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

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
          { key: "id", label: "ID", render: (row) => row.id },
          { key: "name", label: "Nome", render: (row) => row.name },
          { key: "path", label: "Base path", render: (row) => row.basePath },
          { key: "port", label: "Porta", render: (row) => row.listeningOnPort },
          {
            key: "versions",
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
      listOf<ApplicationVersion>(`/api/applications/${applicationId}/versions`),
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

  const saveVersion = async (
    row: ApplicationVersion | null,
    values: FormValues,
  ) => {
    await saveEntity(
      `/api/applications/${applicationId}/versions`,
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
        rows={versions.data}
        columns={[
          { key: "id", label: "ID", render: (row) => row.id },
          {
            key: "version",
            label: "Versione",
            render: (row) => row.versionNumber,
          },
          { key: "apis", label: "API", render: (row) => row.apiCount },
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
      {versions.data?.map((version) => (
        <ApiSection
          key={version.id}
          version={version}
          canWrite={isAdmin}
          csrfToken={csrf}
        />
      ))}
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
      listOf<ApplicationVersionApi>(
        `/api/application-versions/${version.id}/apis`,
      ),
  });

  const save = async (
    row: ApplicationVersionApi | null,
    values: FormValues,
  ) => {
    await saveEntity(
      `/api/application-versions/${version.id}/apis`,
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
        title={`API della versione ${version.versionNumber}`}
        rows={apis.data}
        columns={[
          { key: "method", label: "Metodo", render: (row) => row.requestType },
          { key: "url", label: "URL", render: (row) => row.url },
          {
            key: "description",
            label: "Descrizione",
            render: (row) => row.description,
          },
          {
            key: "params",
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
      {apis.data?.map((api) => (
        <QueryParamSection
          key={api.id}
          api={api}
          canWrite={canWrite}
          csrfToken={csrfToken}
        />
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
      listOf<ApplicationApiQueryParam>(
        `/api/application-version-apis/${api.id}/query-params`,
      ),
  });

  const save = async (
    row: ApplicationApiQueryParam | null,
    values: FormValues,
  ) => {
    await saveEntity(
      `/api/application-version-apis/${api.id}/query-params`,
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
      title={`Query param di ${api.requestType} ${api.url}`}
      rows={params.data}
      columns={[
        { key: "name", label: "Nome", render: (row) => row.name },
        { key: "type", label: "Tipo", render: (row) => row.paramType },
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
