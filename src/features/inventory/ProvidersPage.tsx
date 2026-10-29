import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeaderSlot } from "../../components/PageHeaderSlot";
import { PageHeader, SearchForm } from "../../components/page";
import { apiFetch } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import type { Paged, Provider, ProviderEnvironment } from "../../lib/inventory";
import { deleteEntity, paged, saveEntity } from "../../lib/inventory";
import { useQueryFilter } from "../../lib/useQueryFilter";
import { useIsSystemAdmin } from "../../lib/useServerAccess";

export function ProvidersPage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const csrf = session?.csrfToken ?? "";
  const isAdmin = useIsSystemAdmin();
  const queryClient = useQueryClient();
  const { search, setSearch, q, setQ } = useQueryFilter();

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
        title={t("providers.title")}
        description={t("providers.description")}
      />
      <SearchForm
        value={search}
        onChange={setSearch}
        onSubmit={() => setQ(search)}
      />
      <EntitySection
        rows={providers.data?.items}
        columns={[
          { key: "name", label: t("common.name"), render: (row) => row.name },
          {
            key: "environmentCount",
            label: t("common.environments"),
            render: (row) => row.environmentCount,
          },
        ]}
        fields={[{ name: "name", label: t("common.name"), required: true }]}
        empty={{ name: "" }}
        toForm={(row) => ({ name: row.name })}
        canWrite={isAdmin}
        onSave={save}
        onDelete={remove}
        rowHref={(row) => `/providers/${row.id}`}
        createLabel={t("providers.create")}
      />
    </section>
  );
}

export function ProviderDetailPage() {
  const { id } = useParams();
  const providerId = Number(id);
  const { session } = useAuth();
  const { t } = useI18n();
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
      <PageHeaderSlot title={provider.data?.name ?? t("providers.detail")} />
      <EntitySection
        title={t("common.record")}
        rows={provider.data ? [provider.data] : undefined}
        columns={[
          { key: "name", label: t("common.name"), render: (row) => row.name },
        ]}
        fields={[{ name: "name", label: t("common.name"), required: true }]}
        empty={{ name: "" }}
        toForm={(row) => ({ name: row.name })}
        canWrite={isAdmin}
        canCreate={false}
        onSave={save}
      />
      <EntitySection
        title={t("providers.environments")}
        rows={environments.data?.items}
        columns={[
          {
            key: "environmentName",
            label: t("common.environment"),
            render: (row) => row.environmentName,
          },
          {
            key: "serverCount",
            label: t("common.server"),
            render: (row) => row.serverCount,
          },
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
