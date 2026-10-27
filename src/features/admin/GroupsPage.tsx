import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeader } from "../../components/page";
import type { AdminGroup } from "../../lib/admin";
import { getGroups } from "../../lib/admin";
import { deleteEntity, saveEntity } from "../../lib/inventory";

export function GroupsPage() {
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const queryClient = useQueryClient();
  const groups = useQuery({
    queryKey: ["groups"],
    queryFn: getGroups,
    retry: false,
  });

  const save = async (row: AdminGroup | null, values: FormValues) => {
    await saveEntity(
      "/api/groups",
      row?.id ?? null,
      { name: values.name },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["groups"] });
  };

  const remove = async (row: AdminGroup) => {
    await deleteEntity(`/api/groups/${row.id}`, csrf);
    await queryClient.invalidateQueries({ queryKey: ["groups"] });
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title="Gruppi"
        description="Gruppi per le assegnazioni di ruolo sugli ambienti."
      />
      <EntitySection
        rows={groups.data?.items}
        columns={[
          { key: "name", label: "Nome", render: (row) => row.name },
          {
            key: "usersCount",
            label: "Utenti",
            render: (row) => row.usersCount,
          },
        ]}
        fields={[{ name: "name", label: "Nome", required: true }]}
        empty={{ name: "" }}
        toForm={(row) => ({ name: row.name })}
        canWrite
        onSave={save}
        onDelete={remove}
        createLabel="Nuovo gruppo"
      />
    </section>
  );
}
