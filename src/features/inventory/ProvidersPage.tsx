import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeader, SearchForm } from "../../components/page";
import { apiFetch } from "../../lib/api";
import type { Paged, Provider, ProviderEnvironment } from "../../lib/inventory";
import { deleteEntity, paged, saveEntity } from "../../lib/inventory";
import { useIsSystemAdmin } from "../../lib/useServerAccess";

export function ProvidersPage() {
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const isAdmin = useIsSystemAdmin();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const providers = useQuery({
    queryKey: ["providers", q],
    queryFn: () => paged<Provider>("/api/providers", q),
  });

  const save = async (row: Provider | null, values: FormValues) => {
    await saveEntity(
      "/api/providers",
      row?.id ?? null,
      { name: values.name },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["providers"] });
  };

  const remove = async (row: Provider) => {
    await deleteEntity(`/api/providers/${row.id}`, csrf);
    await queryClient.invalidateQueries({ queryKey: ["providers"] });
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title="Providers"
        description="Provider che espongono ambienti di esecuzione."
      />
      <SearchForm
        value={search}
        onChange={setSearch}
        onSubmit={() => setQ(search)}
      />
      <EntitySection
        rows={providers.data?.items}
        columns={[
          { key: "id", label: "ID", render: (row) => row.id },
          { key: "name", label: "Nome", render: (row) => row.name },
          {
            key: "environments",
            label: "Ambienti",
            render: (row) => row.environmentCount,
          },
        ]}
        fields={[{ name: "name", label: "Nome", required: true }]}
        empty={{ name: "" }}
        toForm={(row) => ({ name: row.name })}
        canWrite={isAdmin}
        onSave={save}
        onDelete={remove}
        rowHref={(row) => `/providers/${row.id}`}
        createLabel="Nuovo provider"
      />
    </section>
  );
}

export function ProviderDetailPage() {
  const { id } = useParams();
  const providerId = Number(id);
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const isAdmin = useIsSystemAdmin();
  const queryClient = useQueryClient();

  const provider = useQuery({
    queryKey: ["providers", "detail", providerId],
    queryFn: () => apiFetch<Provider>(`/api/providers/${providerId}`),
    enabled: Number.isInteger(providerId),
  });

  const environments = useQuery({
    queryKey: ["provider-environments", "provider", providerId],
    queryFn: () =>
      apiFetch<Paged<ProviderEnvironment>>(
        `/api/provider-environments?providerId=${providerId}&pageSize=200`,
      ),
    enabled: Number.isInteger(providerId),
  });

  const save = async (row: Provider | null, values: FormValues) => {
    if (!row) return;
    await saveEntity("/api/providers", row.id, { name: values.name }, csrf);
    await queryClient.invalidateQueries({ queryKey: ["providers"] });
  };

  return (
    <section className="space-y-4">
      <PageHeader title={provider.data?.name ?? "Provider"} />
      <EntitySection
        title="Anagrafica"
        rows={provider.data ? [provider.data] : undefined}
        columns={[
          { key: "id", label: "ID", render: (row) => row.id },
          { key: "name", label: "Nome", render: (row) => row.name },
        ]}
        fields={[{ name: "name", label: "Nome", required: true }]}
        empty={{ name: "" }}
        toForm={(row) => ({ name: row.name })}
        canWrite={isAdmin}
        canCreate={false}
        onSave={save}
      />
      <EntitySection
        title="Ambienti del provider"
        rows={environments.data?.items}
        columns={[
          {
            key: "environment",
            label: "Ambiente",
            render: (row) => row.environmentName,
          },
          { key: "servers", label: "Server", render: (row) => row.serverCount },
        ]}
        fields={[]}
        empty={{}}
        toForm={() => ({})}
        canWrite={false}
        onSave={async () => {}}
        rowHref={(row) => `/environments/${row.environmentId}`}
      />
    </section>
  );
}
