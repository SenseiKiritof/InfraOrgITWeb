import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeaderSlot } from "../../components/PageHeaderSlot";
import { useI18n } from "../../lib/i18n";
import { deleteEntity, saveEntity } from "../../lib/inventory";
import type { ReachabilityTest } from "../../lib/remote";
import { getGlobalReachability } from "../../lib/remote";

export function ReachabilityPage() {
  const { session } = useAuth();
  const { t } = useI18n();
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
      <PageHeaderSlot title={t("reachability.title")} />
      <p className="text-sm text-slate-600">{t("reachability.description")}</p>
      <EntitySection
        rows={tests.data}
        columns={[
          {
            key: "hostname",
            label: t("common.host"),
            render: (row) => row.hostname,
          },
          { key: "port", label: t("common.port"), render: (row) => row.port },
          {
            key: "description",
            label: t("common.description"),
            render: (row) => row.description,
          },
        ]}
        fields={[
          { name: "hostname", label: t("common.host"), required: true },
          {
            name: "port",
            label: t("common.port"),
            type: "number",
            required: true,
          },
          { name: "description", label: t("common.description") },
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
        createLabel={t("reachability.create")}
      />
    </section>
  );
}
