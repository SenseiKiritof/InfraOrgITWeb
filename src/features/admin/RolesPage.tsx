import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeader } from "../../components/page";
import type { AdminRole } from "../../lib/admin";
import { getRoles } from "../../lib/admin";
import { deleteEntity, saveEntity } from "../../lib/inventory";

export function RolesPage() {
  const { session } = useAuth();
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
        title="Ruoli"
        description="I ruoli di sistema non si eliminano e non cambiano nome o scope."
      />
      <EntitySection
        rows={roles.data?.items}
        columns={[
          { key: "name", label: "Nome", render: (row) => row.name },
          { key: "label", label: "Etichetta", render: (row) => row.label },
          { key: "scope", label: "Scope", render: (row) => row.scopeEnum },
          { key: "users", label: "Utenti", render: (row) => row.usersCount },
          { key: "menus", label: "Menu", render: (row) => row.menusCount },
          {
            key: "assignments",
            label: "Ambienti",
            render: (row) => row.assignmentsCount,
          },
        ]}
        fields={[
          { name: "name", label: "Nome", required: true },
          { name: "label", label: "Etichetta", required: true },
          {
            name: "scopeEnum",
            label: "Scope",
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
        createLabel="Nuovo ruolo"
      />
    </section>
  );
}
