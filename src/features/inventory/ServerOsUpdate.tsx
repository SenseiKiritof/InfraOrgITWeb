import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { apiFetch } from "../../lib/api";
import { type TranslationKey, useI18n } from "../../lib/i18n";
import type { Server } from "../../lib/inventory";
import { eolInfo, ltsIsFixed } from "../../lib/osUpdate";
import {
  runServerOsCheck,
  updateServerOsPolicy,
} from "../../lib/serverUpdatePolicy";

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

function statusToneClass(status: string | null): string {
  switch (status) {
    case "Ok":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case null:
    case "None":
      return "border-slate-200 bg-slate-50 text-slate-600";
    case "NonLts":
      return "border-amber-200 bg-amber-50 text-amber-800";
    default:
      return "border-red-200 bg-red-50 text-red-700";
  }
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
  canRun,
}: {
  server: Server;
  canWrite: boolean;
  canRun: boolean;
}) {
  const { session } = useAuth();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const eol = eolInfo(server.osEolDate);
  const fixedLts = ltsIsFixed(server.osName);
  const statusLabel = server.osUpdateStatus
    ? statusKey[server.osUpdateStatus]
      ? t(statusKey[server.osUpdateStatus])
      : server.osUpdateStatus
    : "—";

  const runCheck = async () => {
    setChecking(true);
    setMessage(null);
    const previous = server.osUpdateCheckedAt;
    let updated = false;
    try {
      await runServerOsCheck(server.id, session?.csrfToken ?? "");
      setMessage(t("servers.osCheckStarted"));
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        const fresh = await apiFetch<Server>(`/api/servers/${server.id}`);
        if (fresh.osUpdateCheckedAt && fresh.osUpdateCheckedAt !== previous) {
          queryClient.setQueryData(["servers", "detail", server.id], fresh);
          await queryClient.invalidateQueries({ queryKey: ["servers"] });
          updated = true;
          setMessage(t("servers.osCheckFinished"));
          break;
        }
      }
      if (!updated) setMessage(t("servers.osCheckPending"));
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : t("servers.osCheckFailed"),
      );
    } finally {
      setChecking(false);
    }
  };

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t("servers.osTitle")}
        </h2>
        {canRun && (
          <button
            type="button"
            onClick={() => void runCheck()}
            disabled={checking}
            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
          >
            {checking ? t("servers.osChecking") : t("servers.osCheckNow")}
          </button>
        )}
      </div>
      <div
        className={`rounded-md border px-3 py-2 ${statusToneClass(server.osUpdateStatus)}`}
      >
        <p className="font-medium">{statusLabel}</p>
        {server.osUpdateDetail && (
          <p className="mt-0.5 text-xs opacity-80">{server.osUpdateDetail}</p>
        )}
      </div>
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
