import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeaderSlot } from "../../components/PageHeaderSlot";
import { PageHeader, SearchForm } from "../../components/page";
import { apiFetch } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import type {
  Application,
  Project,
  ServerApplication,
} from "../../lib/inventory";
import { deleteEntity, listOf, paged, saveEntity } from "../../lib/inventory";
import { useQueryFilter } from "../../lib/useQueryFilter";
import { useIsSystemAdmin } from "../../lib/useServerAccess";

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
      <PageHeader
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

  const deployments = useQuery({
    queryKey: ["server-applications", "all"],
    queryFn: () => paged<ServerApplication>("/api/server-applications"),
  });

  const serversByApplication = new Map<number, string[]>();
  for (const deployment of deployments.data?.items ?? []) {
    const names = serversByApplication.get(deployment.applicationId) ?? [];
    if (!names.includes(deployment.serverName))
      names.push(deployment.serverName);
    serversByApplication.set(deployment.applicationId, names);
  }

  const applicationOptions = useQuery({
    queryKey: ["applications", "options"],
    queryFn: () => paged<Application>("/api/applications"),
  });

  const saveProject = async (row: Project | null, values: FormValues) => {
    if (!row) return;
    await saveEntity(
      "/api/projects",
      row.id,
      { name: values.name, description: values.description || null },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["projects"] });
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
      <EntitySection
        title={t("common.record")}
        rows={project.data ? [project.data] : undefined}
        columns={[
          { key: "name", label: t("common.name"), render: (row) => row.name },
          {
            key: "description",
            label: t("common.description"),
            render: (row) => row.description ?? "",
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
        canCreate={false}
        onSave={saveProject}
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
              (serversByApplication.get(row.id) ?? []).join(", ") || "—",
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
    </section>
  );
}
