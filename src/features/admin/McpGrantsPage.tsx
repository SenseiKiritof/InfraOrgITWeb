import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeaderSlot } from "../../components/PageHeaderSlot";
import { getGroups, getUsers } from "../../lib/admin";
import { useI18n } from "../../lib/i18n";
import type { Environment } from "../../lib/inventory";
import { paged } from "../../lib/inventory";
import type { McpGrant } from "../../lib/mcpGrants";
import {
  createMcpGrant,
  deleteMcpGrant,
  listMcpGrants,
} from "../../lib/mcpGrants";

export function McpGrantsPage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const csrf = session?.csrfToken ?? "";
  const queryClient = useQueryClient();

  const grants = useQuery({
    queryKey: ["mcp-grants"],
    queryFn: listMcpGrants,
  });
  const users = useQuery({
    queryKey: ["users", "mcp-options"],
    queryFn: () => getUsers(),
  });
  const groups = useQuery({
    queryKey: ["groups", "mcp-options"],
    queryFn: getGroups,
  });
  const environments = useQuery({
    queryKey: ["environments", "mcp-options"],
    queryFn: () => paged<Environment>("/api/environments"),
  });

  const subjectOptions = [
    ...(users.data?.items.map((user) => ({
      value: `u:${user.id}`,
      label: `${t("mcpGrants.user")} · ${user.username}`,
    })) ?? []),
    ...(groups.data?.items.map((group) => ({
      value: `g:${group.id}`,
      label: `${t("mcpGrants.group")} · ${group.name}`,
    })) ?? []),
  ];

  const save = async (_row: McpGrant | null, values: FormValues) => {
    const [kind, id] = values.subject.split(":");
    await createMcpGrant(
      {
        userId: kind === "u" ? Number(id) : null,
        groupId: kind === "g" ? Number(id) : null,
        action: values.action,
        environmentDefinitionId: values.environmentDefinitionId
          ? Number(values.environmentDefinitionId)
          : null,
      },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["mcp-grants"] });
  };

  const remove = async (row: McpGrant) => {
    await deleteMcpGrant(row.id, csrf);
    await queryClient.invalidateQueries({ queryKey: ["mcp-grants"] });
  };

  const subjectLabel = (row: McpGrant) =>
    row.username
      ? `${t("mcpGrants.user")} · ${row.username}`
      : `${t("mcpGrants.group")} · ${row.groupName ?? "—"}`;

  return (
    <section className="space-y-4">
      <PageHeaderSlot
        title={t("mcpGrants.title")}
        description={t("mcpGrants.description")}
      />
      <EntitySection
        rows={grants.data}
        columns={[
          {
            key: "subject",
            label: t("mcpGrants.subject"),
            render: (row) => subjectLabel(row),
          },
          {
            key: "action",
            label: t("mcpGrants.action"),
            render: (row) => row.action,
          },
          {
            key: "environment",
            label: t("common.environment"),
            render: (row) => row.environmentName ?? t("mcpGrants.all"),
          },
          {
            key: "createdAt",
            label: t("tokens.createdAt"),
            render: (row) => new Date(row.createdAt).toLocaleString(),
          },
        ]}
        fields={[
          {
            name: "subject",
            label: t("mcpGrants.subject"),
            type: "select",
            required: true,
            options: subjectOptions,
          },
          {
            name: "action",
            label: t("mcpGrants.action"),
            type: "select",
            required: true,
            options: [
              {
                value: "reachability.run",
                label: t("mcpGrants.reachability"),
              },
              { value: "actions.run", label: t("mcpGrants.actions") },
              { value: "*", label: t("mcpGrants.allActions") },
            ],
          },
          {
            name: "environmentDefinitionId",
            label: t("common.environment"),
            type: "select",
            options: [
              { value: "", label: t("mcpGrants.all") },
              ...(environments.data?.items.map((environment) => ({
                value: String(environment.id),
                label: environment.name,
              })) ?? []),
            ],
          },
        ]}
        empty={{
          subject: subjectOptions[0]?.value ?? "",
          action: "reachability.run",
          environmentDefinitionId: "",
        }}
        toForm={() => ({})}
        canWrite
        canEditRow={() => false}
        onSave={save}
        onDelete={remove}
        createLabel={t("mcpGrants.create")}
      />
    </section>
  );
}
