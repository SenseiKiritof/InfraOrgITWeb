import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeader, SearchForm } from "../../components/page";
import type {
  AdminGroup,
  AdminRole,
  EnvironmentGroupRole,
} from "../../lib/admin";
import { getEnvironmentGroupRoles, getGroups, getRoles } from "../../lib/admin";
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
          { key: "name", label: "Nome", render: (row) => row.name },
          {
            key: "description",
            label: "Descrizione",
            render: (row) => row.description,
          },
          {
            key: "providerCount",
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

  const groups = useQuery({
    queryKey: ["groups", "options"],
    queryFn: getGroups,
  });
  const roles = useQuery({ queryKey: ["roles", "options"], queryFn: getRoles });

  const groupRoles = useQuery({
    queryKey: ["provider-environment-group-roles", environmentId],
    queryFn: () => getEnvironmentGroupRoles(environmentId),
    enabled: Number.isInteger(environmentId),
    retry: false,
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

  const saveGroupRole = async (
    _row: EnvironmentGroupRole | null,
    values: FormValues,
  ) => {
    await saveEntity(
      `/api/provider-environments/${environmentId}/group-roles`,
      null,
      { groupId: Number(values.groupId), roleId: Number(values.roleId) },
      csrf,
    );
    await queryClient.invalidateQueries({
      queryKey: ["provider-environment-group-roles", environmentId],
    });
  };

  const removeGroupRole = async (row: EnvironmentGroupRole) => {
    await deleteEntity(
      `/api/provider-environments/${environmentId}/group-roles/${row.id}`,
      csrf,
    );
    await queryClient.invalidateQueries({
      queryKey: ["provider-environment-group-roles", environmentId],
    });
  };

  return (
    <section className="space-y-4">
      <PageHeader title={environment.data?.name ?? "Ambiente"} />
      <EntitySection
        title="Anagrafica"
        rows={environment.data ? [environment.data] : undefined}
        columns={[
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
        canCreate={false}
        onSave={saveEnvironment}
      />
      <EntitySection
        title="Provider collegati"
        rows={links.data?.items}
        columns={[
          {
            key: "providerName",
            label: "Provider",
            render: (row) => row.providerName,
          },
          {
            key: "serverCount",
            label: "Server",
            render: (row) => row.serverCount,
          },
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
      <EntitySection
        title="Ruoli per ambiente"
        rows={groupRoles.data?.items}
        columns={[
          { key: "groupName", label: "Gruppo", render: (row) => row.groupName },
          { key: "roleName", label: "Ruolo", render: (row) => row.roleName },
        ]}
        fields={[
          {
            name: "groupId",
            label: "Gruppo",
            type: "select",
            required: true,
            options:
              groups.data?.items.map((group: AdminGroup) => ({
                value: String(group.id),
                label: group.name,
              })) ?? [],
          },
          {
            name: "roleId",
            label: "Ruolo",
            type: "select",
            required: true,
            options:
              roles.data?.items
                .filter((role: AdminRole) => role.scopeEnum === "Environment")
                .map((role) => ({
                  value: String(role.id),
                  label: role.label,
                })) ?? [],
          },
        ]}
        empty={{ groupId: "", roleId: "" }}
        toForm={() => ({})}
        canWrite={isAdmin}
        canEditRow={() => false}
        onSave={saveGroupRole}
        onDelete={removeGroupRole}
        createLabel="Assegna ruolo"
      />
    </section>
  );
}
