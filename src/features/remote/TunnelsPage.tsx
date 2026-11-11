import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { PageHeaderSlot } from "../../components/PageHeaderSlot";
import { columnWidths } from "../../lib/columnWidths";
import { formatDateTime } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import type { TunnelSession } from "../../lib/tunnelSessions";
import {
  formatTunnelForward,
  getTunnelSessions,
} from "../../lib/tunnelSessions";

const REFETCH_MS = 15_000;

export function TunnelsPage() {
  const { t } = useI18n();
  const modeLabel = (mode: TunnelSession["mode"]) =>
    mode === "Dynamic"
      ? t("tunnelServices.modeDynamic")
      : mode === "Remote"
        ? t("tunnelServices.modeRemote")
        : t("tunnelServices.modeLocal");
  const tunnels = useQuery({
    queryKey: ["tunnel-sessions"],
    queryFn: getTunnelSessions,
    refetchInterval: REFETCH_MS,
    retry: false,
  });

  const columns = [
    {
      key: "server",
      label: t("common.server"),
      weight: 12,
      render: (row: TunnelSession) => row.serverName || `#${row.serverId}`,
    },
    {
      key: "application",
      label: t("common.application"),
      weight: 14,
      render: (row: TunnelSession) => row.application || "—",
    },
    {
      key: "user",
      label: t("common.user"),
      weight: 9,
      render: (row: TunnelSession) => row.username || "—",
    },
    {
      key: "mode",
      label: t("tunnels.mode"),
      weight: 8,
      render: (row: TunnelSession) => modeLabel(row.mode),
    },
    {
      key: "forward",
      label: t("tunnels.forward"),
      weight: 22,
      render: (row: TunnelSession) => (
        <span className="font-mono text-xs">{formatTunnelForward(row)}</span>
      ),
    },
    {
      key: "startedAt",
      label: t("tunnels.startedAt"),
      weight: 14,
      render: (row: TunnelSession) => (
        <span className="whitespace-nowrap">
          {formatDateTime(row.startedAt)}
        </span>
      ),
    },
    {
      key: "lastSeenAt",
      label: t("tunnels.lastSeenAt"),
      weight: 14,
      render: (row: TunnelSession) => (
        <span className="whitespace-nowrap">
          {formatDateTime(row.lastSeenAt)}
        </span>
      ),
    },
    {
      key: "status",
      label: t("common.status"),
      weight: 9,
      render: (row: TunnelSession) => (
        <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          {row.status || "—"}
        </span>
      ),
    },
  ];
  const widths = columnWidths(columns, undefined);

  return (
    <section className="space-y-4">
      <PageHeaderSlot
        title={t("tunnels.title")}
        description={t("tunnels.description")}
        actions={
          <button
            type="button"
            onClick={() => void tunnels.refetch()}
            disabled={tunnels.isFetching}
            title={t("tunnels.refresh")}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            <ArrowPathIcon
              className={`h-4 w-4 ${tunnels.isFetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {t("tunnels.refresh")}
          </button>
        }
      />
      <p className="text-xs text-slate-500">{t("tunnels.autoRefresh")}</p>
      {tunnels.error && (
        <p
          role="alert"
          className="rounded bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {tunnels.error instanceof Error
            ? tunnels.error.message
            : t("common.operationError")}
        </p>
      )}
      <div className="rounded-lg border border-slate-200 bg-white">
        {tunnels.isLoading ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            {t("common.loading")}
          </p>
        ) : tunnels.data?.items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            {t("tunnels.none")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <colgroup>
                {widths.map((width, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
                  <col key={index} style={{ width }} />
                ))}
              </colgroup>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} className="px-4 py-2">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(tunnels.data?.items ?? []).map((session) => (
                  <tr
                    key={session.id}
                    className="border-t border-slate-100 align-top"
                  >
                    {columns.map((column) => (
                      <td key={column.key} className="px-4 py-2">
                        {column.render(session)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
