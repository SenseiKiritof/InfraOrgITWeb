import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { type TranslationKey, useI18n } from "../../lib/i18n";
import type {
  DiscoveredPort,
  TunnelService,
  TunnelServiceError,
  TunnelServiceMode,
} from "../../lib/tunnelServices";
import {
  createTunnelService,
  deleteTunnelService,
  discoverTunnelPorts,
  listTunnelServices,
  tunnelServiceFormFromValues,
  tunnelServicePayload,
  tunnelServiceToForm,
  updateTunnelService,
  validateTunnelServiceForm,
} from "../../lib/tunnelServices";

const emptyForm: FormValues = {
  name: "",
  mode: "Local",
  targetHost: "",
  targetPort: "",
  localPort: "",
  remotePort: "",
  kind: "Tcp",
  openPath: "",
  autoStart: "false",
  enabled: "true",
};

const errorKeys: Record<TunnelServiceError, TranslationKey> = {
  nameRequired: "tunnelServices.errorNameRequired",
  targetHostRequired: "tunnelServices.errorTargetHostRequired",
  targetPortRequired: "tunnelServices.errorTargetPortRequired",
  targetPortRange: "tunnelServices.errorTargetPortRange",
  localPortRange: "tunnelServices.errorLocalPortRange",
  remotePortRequired: "tunnelServices.errorRemotePortRequired",
  remotePortRange: "tunnelServices.errorRemotePortRange",
  openPathFormat: "tunnelServices.errorOpenPathFormat",
  kindLocalOnly: "tunnelServices.errorKindLocalOnly",
};

export function TunnelServicesSection({
  serverId,
  canWrite,
}: {
  serverId: number;
  canWrite: boolean;
}) {
  const { session } = useAuth();
  const { t } = useI18n();
  const csrf = session?.csrfToken ?? "";
  const queryClient = useQueryClient();
  const [discovered, setDiscovered] = useState<DiscoveredPort[] | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [createValues, setCreateValues] = useState<FormValues | null>(null);

  const services = useQuery({
    queryKey: ["tunnel-services", serverId],
    queryFn: () => listTunnelServices(serverId),
    enabled: Number.isInteger(serverId),
    retry: false,
  });

  const modeLabel = (mode: TunnelServiceMode) =>
    mode === "Dynamic"
      ? t("tunnelServices.modeDynamic")
      : mode === "Remote"
        ? t("tunnelServices.modeRemote")
        : t("tunnelServices.modeLocal");

  const save = async (row: TunnelService | null, values: FormValues) => {
    const form = tunnelServiceFormFromValues(values);
    const errors = validateTunnelServiceForm(form);
    if (errors.length > 0)
      throw new Error(errors.map((error) => t(errorKeys[error])).join(" "));
    const body = tunnelServicePayload(form);
    if (row) await updateTunnelService(serverId, row.id, body, csrf);
    else await createTunnelService(serverId, body, csrf);
    await queryClient.invalidateQueries({
      queryKey: ["tunnel-services", serverId],
    });
  };

  const remove = async (row: TunnelService) => {
    await deleteTunnelService(serverId, row.id, csrf);
    await queryClient.invalidateQueries({
      queryKey: ["tunnel-services", serverId],
    });
  };

  const discover = async () => {
    setDiscovering(true);
    setDiscoveryError(null);
    setDiscovered(null);
    try {
      setDiscovered(await discoverTunnelPorts(serverId, csrf));
    } catch (cause) {
      setDiscoveryError(
        cause instanceof Error ? cause.message : t("common.operationError"),
      );
    } finally {
      setDiscovering(false);
    }
  };

  const addPort = (port: number) => {
    setCreateValues({
      ...emptyForm,
      name: t("tunnelServices.portName", { port }),
      mode: "Local",
      kind: "Tcp",
      targetHost: "127.0.0.1",
      targetPort: String(port),
    });
  };

  return (
    <section className="space-y-2">
      <EntitySection
        title={t("tunnelServices.title")}
        rows={services.data}
        columns={[
          {
            key: "name",
            label: t("common.name"),
            render: (row) => row.name,
          },
          {
            key: "mode",
            label: t("tunnelServices.mode"),
            render: (row) => modeLabel(row.mode),
          },
          {
            key: "target",
            label: t("tunnelServices.target"),
            render: (row) =>
              row.targetHost
                ? `${row.targetHost}:${row.targetPort ?? "—"}`
                : "—",
          },
          {
            key: "localPort",
            label: t("tunnelServices.localPort"),
            render: (row) => row.localPort ?? "—",
          },
          {
            key: "remotePort",
            label: t("tunnelServices.remotePort"),
            render: (row) => row.remotePort ?? "—",
          },
          {
            key: "kind",
            label: t("tunnelServices.kind"),
            render: (row) => row.kind,
          },
          {
            key: "autoStart",
            label: t("tunnelServices.autoStart"),
            render: (row) => (row.autoStart ? t("common.yes") : t("common.no")),
          },
          {
            key: "enabled",
            label: t("tunnelServices.enabled"),
            render: (row) => (row.enabled ? t("common.yes") : t("common.no")),
          },
        ]}
        fields={[
          {
            name: "name",
            label: t("common.name"),
            required: true,
          },
          {
            name: "mode",
            label: t("tunnelServices.mode"),
            type: "select",
            options: [
              { value: "Local", label: t("tunnelServices.modeLocal") },
              { value: "Dynamic", label: t("tunnelServices.modeDynamic") },
              { value: "Remote", label: t("tunnelServices.modeRemote") },
            ],
          },
          { name: "targetHost", label: t("tunnelServices.targetHost") },
          {
            name: "targetPort",
            label: t("tunnelServices.targetPort"),
            type: "number",
          },
          {
            name: "localPort",
            label: t("tunnelServices.localPort"),
            type: "number",
          },
          {
            name: "remotePort",
            label: t("tunnelServices.remotePort"),
            type: "number",
          },
          {
            name: "kind",
            label: t("tunnelServices.kind"),
            type: "select",
            options: [
              { value: "Tcp", label: "TCP" },
              { value: "Http", label: "HTTP" },
              { value: "Https", label: "HTTPS" },
            ],
          },
          { name: "openPath", label: t("tunnelServices.openPath") },
          {
            name: "autoStart",
            label: t("tunnelServices.autoStart"),
            type: "checkbox",
          },
          {
            name: "enabled",
            label: t("tunnelServices.enabled"),
            type: "checkbox",
          },
        ]}
        empty={emptyForm}
        toForm={(row) => {
          const form = tunnelServiceToForm(row);
          return {
            name: form.name,
            mode: form.mode,
            targetHost: form.targetHost,
            targetPort: form.targetPort,
            localPort: form.localPort,
            remotePort: form.remotePort,
            kind: form.kind,
            openPath: form.openPath,
            autoStart: String(form.autoStart),
            enabled: String(form.enabled),
          };
        }}
        canWrite={canWrite}
        onSave={save}
        onDelete={remove}
        createValues={createValues}
        onCreateValuesUsed={() => setCreateValues(null)}
        createLabel={t("tunnelServices.create")}
        headerActions={
          canWrite ? (
            <button
              type="button"
              onClick={() => void discover()}
              disabled={discovering}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {discovering
                ? t("tunnelServices.discovering")
                : t("tunnelServices.discover")}
            </button>
          ) : undefined
        }
      />
      {discoveryError && (
        <p
          role="alert"
          className="rounded bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {t("tunnelServices.discoverFailed")}: {discoveryError}
        </p>
      )}
      {discovered !== null && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("tunnelServices.discoveredTitle")}
          </h3>
          {discovered.length === 0 ? (
            <p className="mt-2 text-slate-500">
              {t("tunnelServices.discoveredNone")}
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {discovered.map((item) => (
                <li
                  key={item.port}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="font-mono">
                    {item.address ? `${item.address}:${item.port}` : item.port}
                  </span>
                  <button
                    type="button"
                    onClick={() => addPort(item.port)}
                    className="rounded-md border border-slate-300 px-3 py-1 text-sm"
                  >
                    {t("tunnelServices.addDiscovered")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
