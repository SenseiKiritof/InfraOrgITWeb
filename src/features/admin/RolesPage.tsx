import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeader } from "../../components/page";
import type { AdminRole } from "../../lib/admin";
import { getRoles } from "../../lib/admin";
import { useI18n } from "../../lib/i18n";
import { deleteEntity, saveEntity } from "../../lib/inventory";

export function RolesPage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const csrf = session?.csrfToken ?? "";
  const queryClient = useQueryClient();
  const roles = useQuery({
    queryKey: ["roles"],
    queryFn: getRoles,
    retry: false,
  });

  const save = async (row: AdminRole | null, values: FormValues) => {
    await saveEntity(
      "/api/roles",
      row?.id ?? null,
      { name: values.name, label: values.label, scopeEnum: values.scopeEnum },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["roles"] });
  };

  const remove = async (row: AdminRole) => {
    await deleteEntity(`/api/roles/${row.id}`, csrf);
    await queryClient.invalidateQueries({ queryKey: ["roles"] });
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title={t("roles.title")}
        description={t("roles.description")}
      />
      <EntitySection
        rows={roles.data?.items}
        columns={[
          { key: "name", label: t("common.name"), render: (row) => row.name },
          {
            key: "label",
            label: t("common.label"),
            render: (row) => row.label,
          },
          {
            key: "scopeEnum",
            label: t("common.scope"),
            render: (row) => row.scopeEnum,
          },
          {
            key: "usersCount",
            label: t("common.users"),
            render: (row) => row.usersCount,
          },
          {
            key: "menusCount",
            label: t("menus.title"),
            render: (row) => row.menusCount,
          },
          {
            key: "assignmentsCount",
            label: t("common.environments"),
            render: (row) => row.assignmentsCount,
          },
        ]}
        fields={[
          { name: "name", label: t("common.name"), required: true },
          { name: "label", label: t("common.label"), required: true },
          {
            name: "scopeEnum",
            label: t("common.scope"),
            type: "select",
            required: true,
            options: [
              { value: "System", label: "System" },
              { value: "Environment", label: "Environment" },
            ],
          },
        ]}
        empty={{ name: "", label: "", scopeEnum: "System" }}
        toForm={(row) => ({
          name: row.name,
          label: row.label,
          scopeEnum: row.scopeEnum,
        })}
        canWrite
        onSave={save}
        onDelete={remove}
        createLabel={t("roles.create")}
      />
    </section>
  );
}
