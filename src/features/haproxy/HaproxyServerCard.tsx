import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { formatDateTime } from "../../lib/format";
import {
  getHaproxyInstances,
  type HaproxyDiscoveryStatus,
  type HaproxyMonitoringChoice,
  runHaproxyDiscovery,
  setHaproxyMonitoring,
} from "../../lib/haproxy";
import { type TranslationKey, useI18n } from "../../lib/i18n";

const statusKey: Record<HaproxyDiscoveryStatus, TranslationKey> = {
  Found: "haproxy.statusFound",
  Inactive: "haproxy.statusInactive",
  CredentialsRequired: "haproxy.statusCredentials",
  Unreachable: "haproxy.statusUnreachable",
  Ready: "haproxy.statusReady",
};

export function HaproxyServerCard({ serverId }: { serverId: number }) {
  const { session } = useAuth();
  const { t, language } = useI18n();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const instances = useQuery({
    queryKey: ["haproxy", "server", serverId],
    queryFn: () => getHaproxyInstances(serverId),
  });
  const instance = instances.data?.[0];

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["haproxy", "server", serverId],
    });

  const choose = async (choice: HaproxyMonitoringChoice) => {
    if (!instance) return;
    setBusy(true);
    setMessage(null);
    try {
      await setHaproxyMonitoring(instance.id, choice, session?.csrfToken ?? "");
      await refresh();
      setMessage(t("haproxy.choiceSaved"));
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : t("haproxy.choiceFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const discover = async () => {
    setBusy(true);
    setMessage(t("haproxy.discoveryStarted"));
    try {
      await runHaproxyDiscovery(serverId, session?.csrfToken ?? "");
      window.setTimeout(() => void refresh(), 4000);
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : t("haproxy.discoveryFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t("haproxy.title")}
        </h2>
        <button
          type="button"
          onClick={() => void discover()}
          disabled={busy}
          className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
        >
          {busy ? t("haproxy.discovering") : t("haproxy.discoverNow")}
        </button>
      </div>

      {instances.isLoading && (
        <p className="text-slate-500">{t("haproxy.checking")}</p>
      )}

      {!instances.isLoading && !instance && (
        <p className="text-slate-500">{t("haproxy.notDetected")}</p>
      )}

      {instance && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              {t(statusKey[instance.discoveryStatus])}
            </span>
            {instance.detectedVersion && (
              <span className="text-slate-600">{instance.detectedVersion}</span>
            )}
            <span className="text-slate-500">
              {instance.transport === "SshForward"
                ? `${t("haproxy.viaSsh")} ${instance.apiHost}:${instance.apiPort}`
                : instance.baseUrl}
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <p>
              <span className="text-slate-500">
                {t("haproxy.monitoring")}:{" "}
              </span>
              {t(
                instance.monitoringChoice === "Enabled"
                  ? "haproxy.monitoringEnabled"
                  : instance.monitoringChoice === "Disabled"
                    ? "haproxy.monitoringDisabled"
                    : "haproxy.monitoringUndecided",
              )}
            </p>
            <p>
              <span className="text-slate-500">{t("haproxy.lastSeen")}: </span>
              {instance.lastSeenAt
                ? formatDateTime(instance.lastSeenAt, language)
                : "—"}
            </p>
          </div>

          {instance.monitoringChoice === "Enabled" &&
            !instance.hasCredentials && (
              <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t("haproxy.credentialsRequired")}
              </p>
            )}

          {instance.lastTestDetail && (
            <p className="text-xs text-slate-500">{instance.lastTestDetail}</p>
          )}

          <div className="flex flex-wrap gap-2">
            {instance.monitoringChoice !== "Enabled" && (
              <button
                type="button"
                onClick={() => void choose("Enabled")}
                disabled={busy}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {t("haproxy.enable")}
              </button>
            )}
            {instance.monitoringChoice === "Undecided" && (
              <button
                type="button"
                onClick={() => void choose("Undecided")}
                disabled={busy}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium"
              >
                {t("haproxy.later")}
              </button>
            )}
            {instance.monitoringChoice !== "Disabled" && (
              <button
                type="button"
                onClick={() => void choose("Disabled")}
                disabled={busy}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium"
              >
                {instance.monitoringChoice === "Enabled"
                  ? t("haproxy.disable")
                  : t("haproxy.ignore")}
              </button>
            )}
          </div>
        </>
      )}

      {message && <p className="text-xs text-slate-600">{message}</p>}
    </section>
  );
}
