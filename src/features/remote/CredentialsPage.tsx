import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeader } from "../../components/page";
import { deleteEntity, saveEntity } from "../../lib/inventory";
import type { ServerCredential } from "../../lib/remote";
import { getCredentials } from "../../lib/remote";

export function CredentialsPage() {
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const queryClient = useQueryClient();

  const credentials = useQuery({
    queryKey: ["server-credentials"],
    queryFn: getCredentials,
    retry: false,
  });

  const save = async (row: ServerCredential | null, values: FormValues) => {
    await saveEntity(
      "/api/server-credentials",
      row?.id ?? null,
      {
        name: values.name,
        username: values.username,
        authType: values.authType,
        secret: values.secret ? values.secret : null,
        passphrase: values.passphrase ? values.passphrase : null,
      },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["server-credentials"] });
  };

  const remove = async (row: ServerCredential) => {
    await deleteEntity(`/api/server-credentials/${row.id}`, csrf);
    await queryClient.invalidateQueries({ queryKey: ["server-credentials"] });
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title="Credenziali"
        description="Segreti SSH cifrati: non vengono mai restituiti al client."
      />
      <EntitySection
        rows={credentials.data?.items}
        columns={[
          { key: "name", label: "Nome", render: (row) => row.name },
          { key: "username", label: "Utente", render: (row) => row.username },
          { key: "type", label: "Tipo", render: (row) => row.authType },
          {
            key: "secret",
            label: "Segreto",
            render: (row) => (row.hasSecret ? "impostato" : "assente"),
          },
          {
            key: "servers",
            label: "Server",
            render: (row) => row.serversCount,
          },
        ]}
        fields={[
          { name: "name", label: "Nome", required: true },
          { name: "username", label: "Utente SSH", required: true },
          {
            name: "authType",
            label: "Tipo",
            type: "select",
            required: true,
            options: [
              { value: "Password", label: "Password" },
              { value: "PrivateKey", label: "Chiave privata" },
            ],
          },
          {
            name: "secret",
            label: "Password o chiave privata (vuoto = invariato)",
            type: "textarea",
          },
          {
            name: "passphrase",
            label: "Passphrase della chiave (opzionale)",
            type: "textarea",
          },
        ]}
        empty={{
          name: "",
          username: "",
          authType: "Password",
          secret: "",
          passphrase: "",
        }}
        toForm={(row) => ({
          name: row.name,
          username: row.username,
          authType: row.authType,
          secret: "",
          passphrase: "",
        })}
        canWrite
        onSave={save}
        onDelete={remove}
        createLabel="Nuova credenziale"
      />
    </section>
  );
}
