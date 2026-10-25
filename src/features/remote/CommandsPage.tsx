import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeader } from "../../components/page";
import { deleteEntity, saveEntity } from "../../lib/inventory";
import type { CommandTemplate } from "../../lib/remote";
import { getCommandTemplates } from "../../lib/remote";

export function CommandsPage() {
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const queryClient = useQueryClient();

  const templates = useQuery({
    queryKey: ["command-templates"],
    queryFn: getCommandTemplates,
    retry: false,
  });

  const save = async (row: CommandTemplate | null, values: FormValues) => {
    await saveEntity(
      "/api/command-templates",
      row?.id ?? null,
      {
        name: values.name,
        description: values.description,
        script: values.script,
      },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["command-templates"] });
  };

  const remove = async (row: CommandTemplate) => {
    await deleteEntity(`/api/command-templates/${row.id}`, csrf);
    await queryClient.invalidateQueries({ queryKey: ["command-templates"] });
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title="Comandi"
        description="Template con placeholder {{Nome}}. I valori sono quotati prima dell'esecuzione."
      />
      <EntitySection
        rows={templates.data?.items}
        columns={[
          { key: "name", label: "Nome", render: (row) => row.name },
          {
            key: "description",
            label: "Descrizione",
            render: (row) => row.description,
          },
          {
            key: "placeholders",
            label: "Placeholder",
            render: (row) => row.placeholderCount,
          },
        ]}
        fields={[
          { name: "name", label: "Nome", required: true },
          { name: "description", label: "Descrizione" },
          { name: "script", label: "Script", type: "textarea", required: true },
        ]}
        empty={{ name: "", description: "", script: "" }}
        toForm={(row) => ({
          name: row.name,
          description: row.description,
          script: row.script,
        })}
        canWrite
        onSave={save}
        onDelete={remove}
        createLabel="Nuovo comando"
      />
    </section>
  );
}
