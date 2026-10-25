import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeader } from "../../components/page";
import { deleteEntity, saveEntity } from "../../lib/inventory";
import type { ReachabilityTest } from "../../lib/remote";
import { getGlobalReachability } from "../../lib/remote";

export function ReachabilityPage() {
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const queryClient = useQueryClient();
  const tests = useQuery({
    queryKey: ["reachability-tests", "global"],
    queryFn: getGlobalReachability,
    retry: false,
  });

  const save = async (row: ReachabilityTest | null, values: FormValues) => {
    await saveEntity(
      "/api/reachability-tests",
      row?.id ?? null,
      {
        hostname: values.hostname,
        port: Number(values.port),
        description: values.description,
      },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["reachability-tests"] });
  };

  const remove = async (row: ReachabilityTest) => {
    await deleteEntity(`/api/reachability-tests/${row.id}`, csrf);
    await queryClient.invalidateQueries({ queryKey: ["reachability-tests"] });
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title="Test di rete"
        description="Test globali: vengono eseguiti su ogni server dalla pagina del server."
      />
      <EntitySection
        rows={tests.data}
        columns={[
          { key: "host", label: "Host", render: (row) => row.hostname },
          { key: "port", label: "Porta", render: (row) => row.port },
          {
            key: "description",
            label: "Descrizione",
            render: (row) => row.description,
          },
        ]}
        fields={[
          { name: "hostname", label: "Host", required: true },
          { name: "port", label: "Porta", type: "number", required: true },
          { name: "description", label: "Descrizione" },
        ]}
        empty={{ hostname: "", port: "443", description: "" }}
        toForm={(row) => ({
          hostname: row.hostname,
          port: String(row.port),
          description: row.description,
        })}
        canWrite
        onSave={save}
        onDelete={remove}
        createLabel="Nuovo test"
      />
    </section>
  );
}
