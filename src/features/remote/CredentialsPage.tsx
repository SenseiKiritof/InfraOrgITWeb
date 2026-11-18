import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeaderSlot } from "../../components/PageHeaderSlot";
import { getDevices, getUsers, revokeDevice } from "../../lib/admin";
import { formatDateTime } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import type { Server } from "../../lib/inventory";
import { deleteEntity, saveEntity } from "../../lib/inventory";
import type { ServerCredential } from "../../lib/remote";
import {
  assignServerSsh,
  getCredentials,
  getServersForCredential,
  splitServersByCredential,
} from "../../lib/remote";

export function CredentialsPage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const csrf = session?.csrfToken ?? "";
  const queryClient = useQueryClient();
  const [managing, setManaging] = useState<ServerCredential | null>(null);
  const [selectedServerIds, setSelectedServerIds] = useState<number[]>([]);
  const [serverFilter, setServerFilter] = useState("");
  const [managerError, setManagerError] = useState<string | null>(null);
  const [managerMessage, setManagerMessage] = useState<string | null>(null);
  const [managerBusy, setManagerBusy] = useState(false);

  const credentials = useQuery({
    queryKey: ["server-credentials"],
    queryFn: getCredentials,
    retry: false,
  });

  const devices = useQuery({
    queryKey: ["desktop-devices"],
    queryFn: getDevices,
    retry: false,
  });

  const users = useQuery({
    queryKey: ["users", "credential-owner"],
    queryFn: () => getUsers(),
    retry: false,
  });
  const ownerOptions = [
    { value: "", label: t("credentials.shared") },
    ...(users.data?.items ?? []).map((user) => ({
      value: String(user.id),
      label: `${user.name} ${user.surname} (${user.username})`.trim(),
    })),
  ];

  const servers = useQuery({
    queryKey: ["servers", "credential-manager"],
    queryFn: getServersForCredential,
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
        sudoPassword: values.sudoPassword ? values.sudoPassword : null,
        ownerUserId: values.ownerUserId ? Number(values.ownerUserId) : null,
        allowOffline: values.allowOffline === "true",
      },
      csrf,
    );
    await queryClient.invalidateQueries({ queryKey: ["server-credentials"] });
  };

  const remove = async (row: ServerCredential) => {
    await deleteEntity(`/api/server-credentials/${row.id}`, csrf);
    await queryClient.invalidateQueries({ queryKey: ["server-credentials"] });
  };

  const openManager = (row: ServerCredential) => {
    setManaging(row);
    setSelectedServerIds([]);
    setServerFilter("");
    setManagerError(null);
    setManagerMessage(null);
  };

  const updateCredential = async (
    server: Server,
    credentialId: number | null,
  ) => {
    setManagerBusy(true);
    setManagerError(null);
    try {
      await assignServerSsh(server.id, credentialId, server.sshPort, csrf);
      await queryClient.invalidateQueries({ queryKey: ["server-credentials"] });
      await queryClient.invalidateQueries({ queryKey: ["servers"] });
    } catch (cause) {
      setManagerError(
        cause instanceof Error ? cause.message : t("common.operationError"),
      );
    } finally {
      setManagerBusy(false);
    }
  };

  const split =
    managing && servers.data
      ? splitServersByCredential(servers.data.items, managing.id)
      : { assigned: [], available: [] };

  const filter = serverFilter.trim().toLowerCase();
  const visibleAvailable = split.available.filter(
    (server) =>
      !filter ||
      [server.name, server.providerEnvironmentLabel, server.ipAddress].some(
        (value) => value.toLowerCase().includes(filter),
      ),
  );
  const allVisibleSelected =
    visibleAvailable.length > 0 &&
    visibleAvailable.every((server) => selectedServerIds.includes(server.id));

  const toggleServer = (serverId: number) => {
    setSelectedServerIds((current) =>
      current.includes(serverId)
        ? current.filter((id) => id !== serverId)
        : [...current, serverId],
    );
  };

  const toggleAllVisible = () => {
    setSelectedServerIds((current) => {
      const visibleIds = visibleAvailable.map((server) => server.id);
      if (visibleIds.every((id) => current.includes(id))) {
        return current.filter((id) => !visibleIds.includes(id));
      }
      return [...new Set([...current, ...visibleIds])];
    });
  };

  const addServers = async () => {
    if (!managing || selectedServerIds.length === 0) return;
    const targets = split.available.filter((server) =>
      selectedServerIds.includes(server.id),
    );
    if (targets.length === 0) return;

    setManagerBusy(true);
    setManagerError(null);
    setManagerMessage(null);
    const failures: string[] = [];
    let added = 0;
    for (const server of targets) {
      try {
        await assignServerSsh(server.id, managing.id, server.sshPort, csrf);
        added++;
      } catch (cause) {
        failures.push(
          `${server.name}: ${
            cause instanceof Error ? cause.message : t("credentials.error")
          }`,
        );
      }
    }

    await queryClient.invalidateQueries({ queryKey: ["server-credentials"] });
    await queryClient.invalidateQueries({ queryKey: ["servers"] });
    setSelectedServerIds([]);
    setManagerBusy(false);
    if (added > 0) setManagerMessage(t("credentials.added", { count: added }));
    if (failures.length > 0)
      setManagerError(
        t("credentials.notAdded", { failures: failures.join("; ") }),
      );
  };

  return (
    <section className="space-y-4">
      <PageHeaderSlot
        title={t("credentials.title")}
        description={t("credentials.description")}
      />
      <EntitySection
        rows={credentials.data?.items}
        columns={[
          { key: "name", label: t("common.name"), render: (row) => row.name },
          {
            key: "username",
            label: t("credentials.user"),
            render: (row) => row.username,
          },
          {
            key: "authType",
            label: t("common.type"),
            render: (row) => row.authType,
          },
          {
            key: "hasSecret",
            label: t("credentials.secret"),
            render: (row) =>
              row.hasSecret ? t("credentials.set") : t("credentials.missing"),
          },
          {
            key: "hasSudoPassword",
            label: t("credentials.sudoPasswordShort"),
            render: (row) =>
              row.hasSudoPassword
                ? t("credentials.set")
                : t("credentials.missing"),
          },
          {
            key: "serversCount",
            label: t("common.server"),
            render: (row) => row.serversCount,
          },
          {
            key: "owner",
            label: t("credentials.owner"),
            render: (row) => row.ownerUsername || t("credentials.shared"),
          },
          {
            key: "allowOffline",
            label: t("credentials.offline"),
            render: (row) =>
              row.allowOffline ? t("common.yes") : t("common.no"),
          },
        ]}
        fields={[
          { name: "name", label: t("common.name"), required: true },
          {
            name: "username",
            label: t("credentials.sshUser"),
            required: true,
          },
          {
            name: "authType",
            label: t("common.type"),
            type: "select",
            required: true,
            options: [
              { value: "Password", label: "Password" },
              {
                value: "PrivateKey",
                label: t("credentials.privateKey"),
              },
            ],
          },
          {
            name: "secret",
            label: t("credentials.secretHint"),
            type: "textarea",
          },
          {
            name: "passphrase",
            label: t("credentials.passphrase"),
            type: "textarea",
          },
          {
            name: "sudoPassword",
            label: t("credentials.sudoPassword"),
            type: "password",
          },
          {
            name: "ownerUserId",
            label: t("credentials.owner"),
            type: "select",
            options: ownerOptions,
          },
          {
            name: "allowOffline",
            label: t("credentials.allowOffline"),
            type: "checkbox",
          },
        ]}
        empty={{
          name: "",
          username: "",
          authType: "Password",
          secret: "",
          passphrase: "",
          sudoPassword: "",
          ownerUserId: "",
          allowOffline: "false",
        }}
        toForm={(row) => ({
          name: row.name,
          username: row.username,
          authType: row.authType,
          secret: "",
          passphrase: "",
          sudoPassword: "",
          ownerUserId: row.ownerUserId ? String(row.ownerUserId) : "",
          allowOffline: String(row.allowOffline),
        })}
        canWrite
        onSave={save}
        onDelete={remove}
        rowActions={(row) => (
          <button
            type="button"
            onClick={() => openManager(row)}
            className="text-sm font-medium text-slate-900 underline"
          >
            {t("common.server")}
          </button>
        )}
        createLabel={t("credentials.create")}
      />

      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t("devices.title")}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {t("devices.description")}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">{t("devices.name")}</th>
                <th className="px-2 py-2">{t("devices.user")}</th>
                <th className="px-2 py-2">{t("devices.fingerprint")}</th>
                <th className="px-2 py-2">{t("devices.lastSeen")}</th>
                <th className="px-2 py-2">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {(devices.data ?? []).map((device) => (
                <tr key={device.id} className="border-b border-slate-100">
                  <td className="px-2 py-2">{device.name}</td>
                  <td className="px-2 py-2">{device.username}</td>
                  <td className="px-2 py-2 font-mono text-xs">
                    {device.fingerprint.slice(0, 16)}…
                  </td>
                  <td className="px-2 py-2">
                    {formatDateTime(device.lastSeenAt)}
                  </td>
                  <td className="px-2 py-2">
                    {device.revokedAt ? (
                      <span className="text-slate-500">
                        {t("devices.revoked")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="text-sm font-medium text-red-700 underline"
                        onClick={() => {
                          if (!window.confirm(t("devices.revokeConfirm")))
                            return;
                          void revokeDevice(device.id, csrf).then(() =>
                            queryClient.invalidateQueries({
                              queryKey: ["desktop-devices"],
                            }),
                          );
                        }}
                      >
                        {t("devices.revoke")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {(devices.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-3 text-slate-500">
                    {t("devices.none")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {managing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("credentials.manageServers")}
            className="max-h-[85vh] overflow-y-auto w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">
                  {t("credentials.serversTitle")}
                </h2>
                <p className="text-sm text-slate-500">{managing.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setManaging(null)}
                className="text-sm underline"
              >
                {t("common.close")}
              </button>
            </div>

            {managerError && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {managerError}
              </p>
            )}
            {managerMessage && (
              <p className="mt-3 text-sm text-emerald-700">{managerMessage}</p>
            )}

            <div className="mt-4 space-y-5">
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {t("credentials.assigned", { count: split.assigned.length })}
                </h3>
                {split.assigned.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    {t("credentials.noneAssigned")}
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200">
                    {split.assigned.map((server) => (
                      <li
                        key={server.id}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <span>
                          {server.name}
                          <span className="ml-2 text-slate-500">
                            {server.providerEnvironmentLabel} · :
                            {server.sshPort}
                          </span>
                        </span>
                        <button
                          type="button"
                          disabled={managerBusy}
                          onClick={() => void updateCredential(server, null)}
                          className="text-sm text-red-700 underline disabled:opacity-50"
                        >
                          {t("credentials.remove")}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {t("credentials.addServers")}
                </h3>
                {split.available.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    {t("credentials.noneAvailable")}
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    <input
                      aria-label={t("credentials.searchServers")}
                      placeholder={t("credentials.searchServersPlaceholder")}
                      value={serverFilter}
                      onChange={(event) => setServerFilter(event.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                    />
                    <div className="rounded-md border border-slate-200">
                      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleAllVisible}
                          />
                          {t("credentials.selectAllVisible")}
                        </label>
                        <span className="text-sm text-slate-500">
                          {t("credentials.selectedCount", {
                            count: selectedServerIds.length,
                          })}
                        </span>
                      </div>
                      {visibleAvailable.length === 0 ? (
                        <p className="px-3 py-4 text-sm text-slate-500">
                          {t("credentials.noMatch")}
                        </p>
                      ) : (
                        <ul className="max-h-56 divide-y divide-slate-100 overflow-auto">
                          {visibleAvailable.map((server) => (
                            <li key={server.id}>
                              <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={selectedServerIds.includes(
                                    server.id,
                                  )}
                                  onChange={() => toggleServer(server.id)}
                                />
                                <span className="min-w-0">
                                  {server.name}
                                  <span className="ml-2 text-slate-500">
                                    {server.providerEnvironmentLabel} · :
                                    {server.sshPort}
                                  </span>
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={selectedServerIds.length === 0 || managerBusy}
                      onClick={() => void addServers()}
                      className="rounded-md border border-transparent bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {t("credentials.addSelected", {
                        count: selectedServerIds.length,
                      })}
                    </button>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
