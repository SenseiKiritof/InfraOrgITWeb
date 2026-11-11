import { ArrowPathIcon, CheckBadgeIcon } from "@heroicons/react/24/outline";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { PageHeaderSlot } from "../../components/PageHeaderSlot";
import { columnWidths } from "../../lib/columnWidths";
import { formatDateTime } from "../../lib/format";
import { type TranslationKey, useI18n } from "../../lib/i18n";
import {
  approveMcpApproval,
  denyMcpApproval,
  formatApprovalTarget,
  isPendingApproval,
  listMcpApprovals,
  type McpApproval,
} from "../../lib/mcpApprovals";

const REFETCH_MS = 12_000;

const STATUS_KEYS: Record<string, TranslationKey> = {
  pending: "approvals.statusPending",
  approved: "approvals.statusApproved",
  denied: "approvals.statusDenied",
  expired: "approvals.statusExpired",
  used: "approvals.statusUsed",
};

export function McpApprovalsPage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const csrf = session?.csrfToken ?? "";
  const queryClient = useQueryClient();
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approvals = useQuery({
    queryKey: ["mcp-approvals"],
    queryFn: listMcpApprovals,
    refetchInterval: REFETCH_MS,
  });

  const statusLabel = (status: string) => {
    const key = STATUS_KEYS[status.toLowerCase()];
    return key ? t(key) : status || "—";
  };

  const decide = async (row: McpApproval, approve: boolean) => {
    setDecidingId(row.id);
    setError(null);
    try {
      if (approve) await approveMcpApproval(row.id, csrf);
      else await denyMcpApproval(row.id, csrf);
      await queryClient.invalidateQueries({ queryKey: ["mcp-approvals"] });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t("common.operationError"),
      );
    } finally {
      setDecidingId(null);
    }
  };

  const columns = [
    {
      key: "requestedAt",
      label: t("approvals.requestedAt"),
      weight: 13,
      render: (row: McpApproval) => (
        <span className="whitespace-nowrap">
          {formatDateTime(row.requestedAt)}
        </span>
      ),
    },
    {
      key: "target",
      label: t("approvals.target"),
      weight: 30,
      render: (row: McpApproval) => (
        <div className="min-w-0">
          <p className="break-words font-medium">{formatApprovalTarget(row)}</p>
          <p className="font-mono text-xs text-slate-500">{row.action}</p>
        </div>
      ),
    },
    {
      key: "status",
      label: t("common.status"),
      weight: 10,
      render: (row: McpApproval) => (
        <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          {statusLabel(row.status)}
        </span>
      ),
    },
    {
      key: "expiresAt",
      label: t("approvals.expiresAt"),
      weight: 13,
      render: (row: McpApproval) => (
        <span className="whitespace-nowrap">
          {formatDateTime(row.expiresAt)}
        </span>
      ),
    },
    {
      key: "decidedAt",
      label: t("approvals.decidedAt"),
      weight: 13,
      render: (row: McpApproval) => (
        <span className="whitespace-nowrap">
          {row.decidedAt ? formatDateTime(row.decidedAt) : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      label: t("common.actions"),
      weight: 13,
      render: (row: McpApproval) =>
        isPendingApproval(row.status) ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={decidingId !== null}
              onClick={() => void decide(row, true)}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-40"
            >
              {t("approvals.approve")}
            </button>
            <button
              type="button"
              disabled={decidingId !== null}
              onClick={() => void decide(row, false)}
              className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
            >
              {t("approvals.deny")}
            </button>
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
  ];
  const widths = columnWidths(columns, undefined);

  return (
    <section className="space-y-4">
      <PageHeaderSlot
        title={t("approvals.title")}
        description={t("approvals.description")}
        actions={
          <button
            type="button"
            onClick={() => void approvals.refetch()}
            disabled={approvals.isFetching}
            title={t("approvals.refresh")}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            <ArrowPathIcon
              className={`h-4 w-4 ${approvals.isFetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {t("approvals.refresh")}
          </button>
        }
      />
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="flex items-center gap-2 font-semibold">
          <CheckBadgeIcon className="h-5 w-5" aria-hidden="true" />
          {t("approvals.humanTitle")}
        </p>
        <p className="mt-1">{t("approvals.humanBody")}</p>
      </div>
      <p className="text-xs text-slate-500">{t("approvals.autoRefresh")}</p>
      {error && (
        <p
          role="alert"
          className="rounded bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {approvals.error && (
        <p
          role="alert"
          className="rounded bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {approvals.error instanceof Error
            ? approvals.error.message
            : t("common.operationError")}
        </p>
      )}
      <div className="rounded-lg border border-slate-200 bg-white">
        {approvals.isLoading ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            {t("common.loading")}
          </p>
        ) : approvals.data?.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            {t("approvals.none")}
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
                {(approvals.data ?? []).map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-slate-100 align-top"
                  >
                    {columns.map((column) => (
                      <td key={column.key} className="px-4 py-2">
                        {column.render(row)}
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
