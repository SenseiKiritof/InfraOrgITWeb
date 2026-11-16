import { ArrowPathIcon, CheckBadgeIcon } from "@heroicons/react/24/outline";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { PageHeaderSlot } from "../../components/PageHeaderSlot";
import { formatDateTime } from "../../lib/format";
import { type TranslationKey, useI18n } from "../../lib/i18n";
import type { Environment } from "../../lib/inventory";
import { paged } from "../../lib/inventory";
import type {
  McpAction,
  McpAgent,
  McpAgentDraft,
  McpAgentPermissionInput,
  McpAgentStatus,
  McpPermissionRequest,
} from "../../lib/mcpAgents";
import {
  approveMcpAgent,
  approveMcpPermissionRequest,
  denyMcpAgent,
  denyMcpPermissionRequest,
  draftFromAgent,
  listMcpAgents,
  listMcpPermissionRequests,
  MCP_ACTIONS,
  permissionsFromDraft,
  updateMcpAgentPermissions,
} from "../../lib/mcpAgents";

const REFETCH_MS = 12_000;

const STATUS_KEYS: Record<McpAgentStatus, TranslationKey> = {
  Pending: "mcpAgents.statusPending",
  Approved: "mcpAgents.statusApproved",
  Denied: "mcpAgents.statusDenied",
};

const ACTION_KEYS: Record<McpAction, TranslationKey> = {
  "reachability.run": "mcpAgents.reachability",
  "actions.run": "mcpAgents.actions",
};

export function McpAgentsPage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const csrf = session?.csrfToken ?? "";
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<number, McpAgentDraft>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const agents = useQuery({
    queryKey: ["mcp-agents"],
    queryFn: listMcpAgents,
    refetchInterval: REFETCH_MS,
  });
  const requests = useQuery({
    queryKey: ["mcp-permission-requests"],
    queryFn: listMcpPermissionRequests,
    refetchInterval: REFETCH_MS,
  });
  const environments = useQuery({
    queryKey: ["environments", "mcp-agents"],
    queryFn: () => paged<Environment>("/api/environments"),
  });

  useEffect(() => {
    if (!agents.data) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const agent of agents.data) {
        if (!next[agent.id]) next[agent.id] = draftFromAgent(agent);
      }
      return next;
    });
  }, [agents.data]);

  const refresh = async () => {
    await Promise.all([agents.refetch(), requests.refetch()]);
  };

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusyKey(key);
    setError(null);
    try {
      await action();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mcp-agents"] }),
        queryClient.invalidateQueries({
          queryKey: ["mcp-permission-requests"],
        }),
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t("common.operationError"),
      );
    } finally {
      setBusyKey(null);
    }
  };

  const updateDraft = (
    agentId: number,
    action: McpAction,
    patch: Partial<McpAgentDraft[McpAction]>,
  ) => {
    setDrafts((current) => {
      const draft = current[agentId] ?? {
        "reachability.run": { enabled: false, environmentDefinitionId: null },
        "actions.run": { enabled: false, environmentDefinitionId: null },
      };
      return {
        ...current,
        [agentId]: {
          ...draft,
          [action]: { ...draft[action], ...patch },
        },
      };
    });
  };

  const draftFor = (agent: McpAgent): McpAgentDraft =>
    drafts[agent.id] ?? draftFromAgent(agent);

  const decideAgent = async (agent: McpAgent, approve: boolean) => {
    const permissions: McpAgentPermissionInput[] = approve
      ? permissionsFromDraft(draftFor(agent))
      : [];
    await run(String(agent.id), async () => {
      const updated = approve
        ? await approveMcpAgent(agent.id, permissions, csrf)
        : await denyMcpAgent(agent.id, csrf);
      setDrafts((current) => ({
        ...current,
        [agent.id]: draftFromAgent(updated),
      }));
    });
  };

  const savePermissions = async (agent: McpAgent) => {
    await run(String(agent.id), async () => {
      const updated = await updateMcpAgentPermissions(
        agent.id,
        permissionsFromDraft(draftFor(agent)),
        csrf,
      );
      setDrafts((current) => ({
        ...current,
        [agent.id]: draftFromAgent(updated),
      }));
    });
  };

  const decideRequest = async (
    request: McpPermissionRequest,
    approve: boolean,
  ) => {
    await run(`request-${request.id}`, async () => {
      if (approve) await approveMcpPermissionRequest(request.id, csrf);
      else await denyMcpPermissionRequest(request.id, csrf);
      setDrafts((current) => {
        const next = { ...current };
        delete next[request.agentId];
        return next;
      });
    });
  };

  const actionLabel = (action: string) =>
    MCP_ACTIONS.includes(action as McpAction)
      ? t(ACTION_KEYS[action as McpAction])
      : action;

  const statusLabel = (status: McpAgentStatus) => t(STATUS_KEYS[status]);

  const statusClass = (status: McpAgentStatus) =>
    status === "Approved"
      ? "bg-emerald-100 text-emerald-800"
      : status === "Denied"
        ? "bg-red-100 text-red-800"
        : "bg-amber-100 text-amber-800";

  const pendingAgents =
    agents.data?.filter((x) => x.status === "Pending") ?? [];
  const approvedAgents =
    agents.data?.filter((x) => x.status === "Approved") ?? [];
  const deniedAgents = agents.data?.filter((x) => x.status === "Denied") ?? [];
  const pendingRequests =
    requests.data?.filter((x) => x.status === "Pending") ?? [];

  const renderAgent = (agent: McpAgent) => {
    const draft = draftFor(agent);
    const busy = busyKey === String(agent.id);
    return (
      <article
        key={agent.id}
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words font-semibold">{agent.name}</p>
            <p className="text-xs text-slate-500">
              {agent.username} ·{" "}
              <span className="font-mono">{agent.clientKey}</span>
            </p>
            <p className="text-xs text-slate-500">
              {t("mcpAgents.createdAt")}: {formatDateTime(agent.createdAt)}
              {agent.lastSeenAt
                ? ` · ${t("mcpAgents.lastSeenAt")}: ${formatDateTime(agent.lastSeenAt)}`
                : ""}
            </p>
          </div>
          <span
            className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusClass(agent.status)}`}
          >
            {statusLabel(agent.status)}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {MCP_ACTIONS.map((action) => (
            <div
              key={action}
              className="rounded-md border border-slate-200 p-3 text-sm"
            >
              <label className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={draft[action].enabled}
                  onChange={(event) =>
                    updateDraft(agent.id, action, {
                      enabled: event.target.checked,
                    })
                  }
                />
                {t(ACTION_KEYS[action])}
              </label>
              <select
                value={draft[action].environmentDefinitionId ?? ""}
                disabled={!draft[action].enabled}
                onChange={(event) =>
                  updateDraft(agent.id, action, {
                    environmentDefinitionId: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
                className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-40"
              >
                <option value="">{t("mcpAgents.allEnvironments")}</option>
                {(environments.data?.items ?? []).map((environment) => (
                  <option key={environment.id} value={environment.id}>
                    {environment.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {agent.status !== "Approved" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void decideAgent(agent, true)}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-40"
            >
              {t("mcpAgents.approve")}
            </button>
          )}
          {agent.status === "Approved" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void savePermissions(agent)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-40"
            >
              {t("mcpAgents.save")}
            </button>
          )}
          {agent.status !== "Denied" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void decideAgent(agent, false)}
              className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
            >
              {agent.status === "Approved"
                ? t("mcpAgents.revoke")
                : t("mcpAgents.deny")}
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <section className="space-y-4">
      <PageHeaderSlot
        title={t("mcpAgents.title")}
        description={t("mcpAgents.description")}
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={agents.isFetching || requests.isFetching}
            title={t("mcpAgents.refresh")}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            <ArrowPathIcon
              className={`h-4 w-4 ${agents.isFetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {t("mcpAgents.refresh")}
          </button>
        }
      />

      <div className="rounded-lg border border-sky-300 bg-sky-50 p-4 text-sm text-sky-900">
        <p className="flex items-center gap-2 font-semibold">
          <CheckBadgeIcon className="h-5 w-5" aria-hidden="true" />
          {t("mcpAgents.noticeTitle")}
        </p>
        <p className="mt-1">{t("mcpAgents.notice")}</p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {agents.error && (
        <p
          role="alert"
          className="rounded bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {agents.error instanceof Error
            ? agents.error.message
            : t("common.operationError")}
        </p>
      )}

      {agents.isLoading ? (
        <p className="text-sm text-slate-500">{t("common.loading")}</p>
      ) : (
        <>
          <h2 className="text-base font-semibold">
            {t("mcpAgents.pending")} ({pendingAgents.length})
          </h2>
          {pendingAgents.length === 0 ? (
            <p className="text-sm text-slate-500">
              {t("mcpAgents.pendingNone")}
            </p>
          ) : (
            <div className="space-y-3">{pendingAgents.map(renderAgent)}</div>
          )}

          <h2 className="text-base font-semibold">
            {t("mcpAgents.requests")} ({pendingRequests.length})
          </h2>
          {pendingRequests.length === 0 ? (
            <p className="text-sm text-slate-500">
              {t("mcpAgents.requestsNone")}
            </p>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((request) => (
                <article
                  key={request.id}
                  className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {request.agentName} · {request.username}
                      </p>
                      <p className="text-xs text-amber-800">
                        {actionLabel(request.action)}
                        {" · "}
                        {request.environmentName ??
                          t("mcpAgents.allEnvironments")}
                      </p>
                      {request.reason && (
                        <p className="mt-1 text-xs text-amber-800">
                          {t("mcpAgents.reason")}: {request.reason}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyKey === `request-${request.id}`}
                        onClick={() => void decideRequest(request, true)}
                        className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-40"
                      >
                        {t("mcpAgents.approveRequest")}
                      </button>
                      <button
                        type="button"
                        disabled={busyKey === `request-${request.id}`}
                        onClick={() => void decideRequest(request, false)}
                        className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
                      >
                        {t("mcpAgents.denyRequest")}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <h2 className="text-base font-semibold">
            {t("mcpAgents.approved")} ({approvedAgents.length})
          </h2>
          {approvedAgents.length === 0 ? (
            <p className="text-sm text-slate-500">
              {t("mcpAgents.approvedNone")}
            </p>
          ) : (
            <div className="space-y-3">{approvedAgents.map(renderAgent)}</div>
          )}

          {deniedAgents.length > 0 && (
            <>
              <h2 className="text-base font-semibold">
                {t("mcpAgents.denied")} ({deniedAgents.length})
              </h2>
              <div className="space-y-3">{deniedAgents.map(renderAgent)}</div>
            </>
          )}
        </>
      )}
    </section>
  );
}
