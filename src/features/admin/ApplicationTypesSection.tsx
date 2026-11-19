import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { useI18n } from "../../lib/i18n";
import type { ApplicationType } from "../../lib/inventory";
import { deleteEntity, listOf, saveEntity } from "../../lib/inventory";

export function ApplicationTypesSection() {
  const { session } = useAuth();
  const { t } = useI18n();
  const csrf = session?.csrfToken ?? "";
  const queryClient = useQueryClient();
  const types = useQuery({
    queryKey: ["application-types"],
    queryFn: () => listOf<ApplicationType>("/api/application-types"),
  });

  const save = async (row: ApplicationType | null, values: FormValues) => {
    await saveEntity(
      "/api/application-types",
      row?.id ?? null,
      {
        name: values.name,
        label: values.label,
        sortOrder: Number(values.sortOrder) || 0,
      },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["application-types"] });
  };

  const remove = async (row: ApplicationType) => {
    await deleteEntity(`/api/application-types/${row.id}`, csrf);
    await queryClient.invalidateQueries({ queryKey: ["application-types"] });
  };

  return (
    <div className="space-y-2">
      <EntitySection<ApplicationType>
        title={t("applicationTypes.title")}
        rows={types.data}
        columns={[
          {
            key: "name",
            label: t("applicationTypes.code"),
            render: (row) => row.name,
          },
          {
            key: "label",
            label: t("common.label"),
            render: (row) => row.label,
          },
          {
            key: "sortOrder",
            label: t("applicationTypes.sortOrder"),
            render: (row) => row.sortOrder,
          },
          {
            key: "applicationsCount",
            label: t("applicationTypes.applications"),
            render: (row) => row.applicationsCount,
          },
        ]}
        fields={[
          {
            name: "name",
            label: t("applicationTypes.code"),
            required: true,
          },
          { name: "label", label: t("common.label"), required: true },
          {
            name: "sortOrder",
            label: t("applicationTypes.sortOrder"),
            type: "number",
          },
        ]}
        empty={{ name: "", label: "", sortOrder: "0" }}
        toForm={(row) => ({
          name: row.name,
          label: row.label,
          sortOrder: String(row.sortOrder),
        })}
        canWrite
        onSave={save}
        onDelete={remove}
        createLabel={t("applicationTypes.create")}
        defaultOrder={(left, right) =>
          left.sortOrder - right.sortOrder ||
          left.name.localeCompare(right.name)
        }
        rowLabel={(row) => row.name}
      />
      <p className="px-1 text-xs text-slate-500">
        {t("applicationTypes.hint")}
      </p>
    </div>
  );
}
