import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeaderSlot } from "../../components/PageHeaderSlot";
import { Pagination } from "../../components/Pagination";
import { SearchForm } from "../../components/page";
import type {
  AuditEvent,
  AuditKind,
  AuditOutcome,
} from "../../lib/auditEvents";
import { formatAuditTarget, getAuditEvents } from "../../lib/auditEvents";
import { columnWidths } from "../../lib/columnWidths";
import { formatDateTime } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { useQueryFilter } from "../../lib/useQueryFilter";

const KINDS: AuditKind[] = [
  "McpToolCall",
  "TunnelStart",
  "TunnelStop",
  "TunnelError",
];

const OUTCOMES: AuditOutcome[] = ["Ok", "Error", "Denied"];

const OUTCOME_STYLES: Record<AuditOutcome, string> = {
  Ok: "bg-emerald-50 text-emerald-700",
  Error: "bg-red-50 text-red-700",
  Denied: "bg-amber-50 text-amber-700",
};

export function AuditPage() {
  const { t } = useI18n();
  const { search, setSearch, q, setQ } = useQueryFilter();
  const [kind, setKind] = useState("");
  const [outcome, setOutcome] = useState("");
  const [serverId, setServerId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const parsedServerId =
    Number.isInteger(Number(serverId)) && Number(serverId) > 0
      ? Number(serverId)
      : null;
  const audit = useQuery({
    queryKey: [
      "audit-events",
      q,
      kind,
      outcome,
      parsedServerId,
      page,
      pageSize,
    ],
    queryFn: () =>
      getAuditEvents({
        q,
        kind,
        outcome,
        serverId: parsedServerId,
        page,
        pageSize,
      }),
    retry: false,
    placeholderData: (previous) => previous,
  });

  const total = audit.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const kindLabel = (value: string) => {
    switch (value) {
      case "McpToolCall":
        return t("audit.kindMcpToolCall");
      case "TunnelStart":
        return t("audit.kindTunnelStart");
      case "TunnelStop":
        return t("audit.kindTunnelStop");
      case "TunnelError":
        return t("audit.kindTunnelError");
      default:
        return value;
    }
  };

  const outcomeLabel = (value: string) => {
    switch (value) {
      case "Ok":
        return t("audit.outcomeOk");
      case "Error":
        return t("audit.outcomeError");
      case "Denied":
        return t("audit.outcomeDenied");
      default:
        return value;
    }
  };

  const columns = [
    {
      key: "occurredAt",
      label: t("audit.occurredAt"),
      weight: 12,
      render: (row: AuditEvent) => (
        <span className="whitespace-nowrap">
          {formatDateTime(row.occurredAt)}
        </span>
      ),
    },
    {
      key: "kind",
      label: t("audit.kind"),
      weight: 9,
      render: (row: AuditEvent) => kindLabel(row.kind),
    },
    {
      key: "outcome",
      label: t("audit.outcome"),
      weight: 7,
      render: (row: AuditEvent) => (
        <span
          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLES[row.outcome]}`}
        >
          {outcomeLabel(row.outcome)}
        </span>
      ),
    },
    {
      key: "actorUsername",
      label: t("audit.actor"),
      weight: 9,
      render: (row: AuditEvent) => row.actorUsername || "—",
    },
    {
      key: "clientId",
      label: t("audit.clientId"),
      weight: 7,
      render: (row: AuditEvent) =>
        row.clientId ? (
          <span
            className="block max-w-[9rem] truncate font-mono text-xs"
            title={row.clientId}
          >
            {row.clientId}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "action",
      label: t("audit.action"),
      weight: 13,
      render: (row: AuditEvent) => (
        <span className="font-mono text-xs">{row.action}</span>
      ),
    },
    {
      key: "target",
      label: t("audit.target"),
      weight: 17,
      render: (row: AuditEvent) => (
        <span className="text-xs">{formatAuditTarget(row)}</span>
      ),
    },
    {
      key: "errorCode",
      label: t("audit.errorCode"),
      weight: 8,
      render: (row: AuditEvent) =>
        row.errorCode ? (
          <span className="font-mono text-xs text-red-700">
            {row.errorCode}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "durationMs",
      label: t("audit.durationMs"),
      weight: 6,
      render: (row: AuditEvent) => `${row.durationMs} ms`,
    },
    {
      key: "correlationId",
      label: t("audit.correlationId"),
      weight: 12,
      render: (row: AuditEvent) =>
        row.correlationId ? (
          <span
            className="block max-w-[9rem] truncate font-mono text-xs"
            title={row.correlationId}
          >
            {row.correlationId}
          </span>
        ) : (
          "—"
        ),
    },
  ];
  const widths = columnWidths(columns, undefined);

  return (
    <section className="space-y-4">
      <PageHeaderSlot
        title={t("audit.title")}
        description={t("audit.description")}
        actions={
          <Link
            to="/tunnels"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {t("tunnels.title")}
          </Link>
        }
      />
      <SearchForm
        value={search}
        onChange={setSearch}
        onSubmit={() => {
          setQ(search);
          setPage(1);
        }}
      />
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">
            {t("audit.kind")}
          </span>
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5"
          >
            <option value="">{t("audit.allKinds")}</option>
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {kindLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">
            {t("audit.outcome")}
          </span>
          <select
            value={outcome}
            onChange={(event) => {
              setOutcome(event.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5"
          >
            <option value="">{t("audit.allOutcomes")}</option>
            {OUTCOMES.map((value) => (
              <option key={value} value={value}>
                {outcomeLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="audit-server-id" className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">
            {t("audit.serverId")}
          </span>
          <input
            id="audit-server-id"
            type="number"
            min={1}
            step={1}
            value={serverId}
            onChange={(event) => {
              setServerId(event.target.value);
              setPage(1);
            }}
            placeholder={t("audit.serverIdPlaceholder")}
            className="w-44 rounded-md border border-slate-300 px-3 py-1.5"
          />
        </label>
      </div>
      {audit.error && (
        <p
          role="alert"
          className="rounded bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {audit.error instanceof Error
            ? audit.error.message
            : t("common.operationError")}
        </p>
      )}
      <div className="rounded-lg border border-slate-200 bg-white">
        {audit.isLoading ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            {t("common.loading")}
          </p>
        ) : audit.data?.items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">{t("audit.none")}</p>
        ) : (
          <>
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
                  {(audit.data?.items ?? []).map((event) => (
                    <tr
                      key={event.id}
                      className="border-t border-slate-100 align-top"
                    >
                      {columns.map((column) => (
                        <td key={column.key} className="px-4 py-2">
                          {column.render(event)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageCount={pageCount}
              total={total}
              pageSize={pageSize}
              onPage={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </>
        )}
      </div>
    </section>
  );
}
