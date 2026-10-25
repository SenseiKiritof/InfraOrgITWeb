import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeader, SearchForm } from "../../components/page";
import { apiFetch } from "../../lib/api";
import type {
  Environment,
  Paged,
  Provider,
  ProviderEnvironment,
} from "../../lib/inventory";
import { deleteEntity, paged, saveEntity } from "../../lib/inventory";
import { useIsSystemAdmin } from "../../lib/useServerAccess";

export function EnvironmentsPage() {
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const isAdmin = useIsSystemAdmin();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const environments = useQuery({
    queryKey: ["environments", q],
    queryFn: () => paged<Environment>("/api/environments", q),
  });

  const save = async (row: Environment | null, values: FormValues) => {
    await saveEntity(
      "/api/environments",
      row?.id ?? null,
      { name: values.name, description: values.description },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["environments"] });
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title="Ambienti"
        description="Anagrafica degli ambienti (produzione, staging, …)."
      />
      <SearchForm
        value={search}
        onChange={setSearch}
        onSubmit={() => setQ(search)}
      />
      <EntitySection
        rows={environments.data?.items}
        columns={[
          { key: "id", label: "ID", render: (row) => row.id },
          { key: "name", label: "Nome", render: (row) => row.name },
          {
            key: "description",
            label: "Descrizione",
            render: (row) => row.description,
          },
          {
            key: "providers",
            label: "Provider",
            render: (row) => row.providerCount,
          },
        ]}
        fields={[
          { name: "name", label: "Nome", required: true },
          { name: "description", label: "Descrizione", type: "textarea" },
        ]}
        empty={{ name: "", description: "" }}
        toForm={(row) => ({ name: row.name, description: row.description })}
        canWrite={isAdmin}
        onSave={save}
        rowHref={(row) => `/environments/${row.id}`}
        createLabel="Nuovo ambiente"
      />
    </section>
  );
}

export function EnvironmentDetailPage() {
  const { id } = useParams();
  const environmentId = Number(id);
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const isAdmin = useIsSystemAdmin();
  const queryClient = useQueryClient();

  const environment = useQuery({
    queryKey: ["environments", "detail", environmentId],
    queryFn: () => apiFetch<Environment>(`/api/environments/${environmentId}`),
    enabled: Number.isInteger(environmentId),
  });

  const providers = useQuery({
    queryKey: ["providers", "options"],
    queryFn: () => paged<Provider>("/api/providers"),
  });

  const links = useQuery({
    queryKey: ["provider-environments", "environment", environmentId],
    queryFn: () =>
      apiFetch<Paged<ProviderEnvironment>>(
        `/api/provider-environments?environmentId=${environmentId}&pageSize=200`,
      ),
    enabled: Number.isInteger(environmentId),
  });

  const saveEnvironment = async (
    row: Environment | null,
    values: FormValues,
  ) => {
    if (!row) return;
    await saveEntity(
      "/api/environments",
      row.id,
      { name: values.name, description: values.description },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["environments"] });
  };

  const saveLink = async (
    row: ProviderEnvironment | null,
    values: FormValues,
  ) => {
    await saveEntity(
      "/api/provider-environments",
      row?.id ?? null,
      {
        providerId: Number(values.providerId),
        environmentId,
      },
      csrf,
    );
    await queryClient.invalidateQueries({
      queryKey: ["provider-environments"],
    });
  };

  const removeLink = async (row: ProviderEnvironment) => {
    await deleteEntity(`/api/provider-environments/${row.id}`, csrf);
    await queryClient.invalidateQueries({
      queryKey: ["provider-environments"],
    });
  };

  return (
    <section className="space-y-4">
      <PageHeader title={environment.data?.name ?? "Ambiente"} />
      <EntitySection
        title="Anagrafica"
        rows={environment.data ? [environment.data] : undefined}
        columns={[
          { key: "id", label: "ID", render: (row) => row.id },
          { key: "name", label: "Nome", render: (row) => row.name },
          {
            key: "description",
            label: "Descrizione",
            render: (row) => row.description,
          },
        ]}
        fields={[
          { name: "name", label: "Nome", required: true },
          { name: "description", label: "Descrizione", type: "textarea" },
        ]}
        empty={{ name: "", description: "" }}
        toForm={(row) => ({ name: row.name, description: row.description })}
        canWrite={isAdmin}
        onSave={saveEnvironment}
      />
      <EntitySection
        title="Provider collegati"
        rows={links.data?.items}
        columns={[
          {
            key: "provider",
            label: "Provider",
            render: (row) => row.providerName,
          },
          { key: "servers", label: "Server", render: (row) => row.serverCount },
        ]}
        fields={[
          {
            name: "providerId",
            label: "Provider",
            type: "select",
            required: true,
            options:
              providers.data?.items.map((provider) => ({
                value: String(provider.id),
                label: provider.name,
              })) ?? [],
          },
        ]}
        empty={{ providerId: "" }}
        toForm={(row) => ({ providerId: String(row.providerId) })}
        canWrite={isAdmin}
        onSave={saveLink}
        onDelete={removeLink}
        createLabel="Collega provider"
      />
    </section>
  );
}
