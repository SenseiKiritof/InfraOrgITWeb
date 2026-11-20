import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { type TranslationKey, useI18n } from "../../lib/i18n";
import type { Server } from "../../lib/inventory";
import { eolInfo, ltsIsFixed } from "../../lib/osUpdate";
import { updateServerOsPolicy } from "../../lib/serverUpdatePolicy";

const toneClass = {
  danger: "text-red-700",
  warning: "text-amber-700",
  neutral: "text-slate-500",
} as const;

const statusKey: Record<string, TranslationKey> = {
  Ok: "servers.osStatusOk",
  None: "servers.osStatusNone",
  NonLts: "servers.osStatusNonLts",
  Error: "servers.osStatusError",
  Unsupported: "servers.osStatusUnsupported",
  Permission: "servers.osStatusPermission",
};

function eolLabel(
  t: (key: TranslationKey, values?: Record<string, string | number>) => string,
  info: NonNullable<ReturnType<typeof eolInfo>>,
): string {
  const date = info.date.toLocaleDateString();
  if (info.tone === "danger") return t("servers.eolExpired", { date });
  if (info.tone === "warning") return t("servers.eolSoon", { days: info.days });
  return t("servers.eolDate", { date });
}

export function OsUpdateBadge({ server }: { server: Server }) {
  const { t } = useI18n();
  const current =
    [server.osName, server.osVersion].filter(Boolean).join(" ").trim() ||
    server.operatingSystem ||
    "";
  const eol = eolInfo(server.osEolDate);
  if (!current && !server.osUpdateTarget && !eol)
    return <span className="text-slate-400">—</span>;
  return (
    <div className="space-y-0.5 text-xs">
      <div className="flex flex-wrap items-center gap-1">
        <span>{current || "—"}</span>
        {server.osUpdateTarget && (
          <>
            <span>→</span>
            <span className="font-medium">{server.osUpdateTarget}</span>
            {server.osUpdateTargetLts && (
              <span className="rounded bg-emerald-100 px-1 text-[10px] text-emerald-800">
                LTS
              </span>
            )}
          </>
        )}
      </div>
      {eol && <span className={toneClass[eol.tone]}>{eolLabel(t, eol)}</span>}
      {server.osUpdateStatus &&
        server.osUpdateStatus !== "Ok" &&
        server.osUpdateStatus !== "None" && (
          <span
            className={
              toneClass[
                server.osUpdateStatus === "NonLts" ? "warning" : "danger"
              ]
            }
            title={server.osUpdateDetail ?? ""}
          >
            {statusKey[server.osUpdateStatus]
              ? t(statusKey[server.osUpdateStatus])
              : server.osUpdateStatus}
          </span>
        )}
    </div>
  );
}

export function ServerOsCard({
  server,
  canWrite,
}: {
  server: Server;
  canWrite: boolean;
}) {
  const { session } = useAuth();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const eol = eolInfo(server.osEolDate);
  const fixedLts = ltsIsFixed(server.osName);

  const savePolicy = async (value: boolean | null) => {
    setSaving(true);
    setMessage(null);
    try {
      await updateServerOsPolicy(server.id, value, session?.csrfToken ?? "");
      await queryClient.invalidateQueries({ queryKey: ["servers"] });
      setMessage(t("servers.osPolicySaved"));
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : t("servers.saveFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {t("servers.osTitle")}
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <p>
          <span className="text-slate-500">{t("servers.osCurrent")}: </span>
          {[server.osName, server.osVersion].filter(Boolean).join(" ") ||
            server.operatingSystem ||
            "—"}
        </p>
        <p>
          <span className="text-slate-500">{t("servers.osTarget")}: </span>
          {server.osUpdateTarget ?? "—"}
          {server.osUpdateTargetLts && " · LTS"}
        </p>
        <p>
          <span className="text-slate-500">{t("servers.osEol")}: </span>
          {eol ? (
            <span className={toneClass[eol.tone]}>{eolLabel(t, eol)}</span>
          ) : (
            "—"
          )}
        </p>
        <p>
          <span className="text-slate-500">{t("servers.osCheckedAt")}: </span>
          {server.osUpdateCheckedAt
            ? new Date(server.osUpdateCheckedAt).toLocaleString()
            : t("servers.osNever")}
        </p>
        <p>
          <span className="text-slate-500">{t("servers.osStatus")}: </span>
          {server.osUpdateStatus
            ? statusKey[server.osUpdateStatus]
              ? t(statusKey[server.osUpdateStatus])
              : server.osUpdateStatus
            : "—"}
        </p>
        {server.osUpdateDetail && (
          <p className="text-slate-500">{server.osUpdateDetail}</p>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">
            {t("servers.osLtsPolicy")}
          </span>
          {fixedLts ? (
            <span className="text-sm">{t("servers.osLtsFixed")}</span>
          ) : (
            <select
              aria-label={t("servers.osLtsPolicy")}
              value={
                server.osUpdateLtsOnly === null
                  ? ""
                  : String(server.osUpdateLtsOnly)
              }
              disabled={!canWrite || saving}
              onChange={(event) => {
                const value =
                  event.target.value === ""
                    ? null
                    : event.target.value === "true";
                void savePolicy(value);
              }}
              className="rounded-md border border-slate-300 px-3 py-1.5"
            >
              <option value="">{t("servers.osLtsInherit")}</option>
              <option value="true">{t("servers.osLtsOnly")}</option>
              <option value="false">{t("servers.osAll")}</option>
            </select>
          )}
        </div>
        {message && <span className="text-xs text-slate-600">{message}</span>}
      </div>
    </section>
  );
}
