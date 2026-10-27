import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeader, SearchForm } from "../../components/page";
import { apiFetch } from "../../lib/api";
import type { Application, Project } from "../../lib/inventory";
import { deleteEntity, listOf, paged, saveEntity } from "../../lib/inventory";
import { useIsSystemAdmin } from "../../lib/useServerAccess";

export function ProjectsPage() {
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const isAdmin = useIsSystemAdmin();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

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
        title="Progetti"
        description="Raggruppamenti di applicazioni."
      />
      <SearchForm
        value={search}
        onChange={setSearch}
        onSubmit={() => setQ(search)}
      />
      <EntitySection
        rows={projects.data?.items}
        columns={[
          { key: "name", label: "Nome", render: (row) => row.name },
          {
            key: "description",
            label: "Descrizione",
            render: (row) => row.description ?? "",
          },
          {
            key: "applicationCount",
            label: "Applicazioni",
            render: (row) => row.applicationCount,
          },
        ]}
        fields={[
          { name: "name", label: "Nome", required: true },
          { name: "description", label: "Descrizione", type: "textarea" },
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
        createLabel="Nuovo progetto"
      />
    </section>
  );
}

export function ProjectDetailPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const { session } = useAuth();
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

  const applicationOptions = useQuery({
    queryKey: ["applications", "options"],
    queryFn: () => paged<Application>("/api/applications?pageSize=200"),
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
      <PageHeader title={project.data?.name ?? "Progetto"} />
      <EntitySection
        title="Anagrafica"
        rows={project.data ? [project.data] : undefined}
        columns={[
          { key: "name", label: "Nome", render: (row) => row.name },
          {
            key: "description",
            label: "Descrizione",
            render: (row) => row.description ?? "",
          },
        ]}
        fields={[
          { name: "name", label: "Nome", required: true },
          { name: "description", label: "Descrizione", type: "textarea" },
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
        title="Applicazioni collegate"
        rows={applications.data}
        columns={[
          { key: "name", label: "Applicazione", render: (row) => row.name },
          {
            key: "basePath",
            label: "Base path",
            render: (row) => row.basePath,
          },
        ]}
        fields={[
          {
            name: "applicationId",
            label: "Applicazione",
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
        createLabel="Collega applicazione"
      />
    </section>
  );
}
