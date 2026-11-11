import { apiFetch } from "./api";

/**
 * Human approval request for an MCP action call (PT-18). The list endpoint
 * returns only the approvals of the authenticated user.
 */
export interface McpApproval {
  id: number;
  action: string;
  serverId: number;
  serverName: string;
  serverApplicationId: number | null;
  serverApplicationName: string | null;
  applicationActionId: number | null;
  applicationActionLabel: string | null;
  status: string;
  requestedAt: string;
  expiresAt: string;
  decidedAt: string | null;
}

export function listMcpApprovals(): Promise<McpApproval[]> {
  return apiFetch<McpApproval[]>("/api/mcp/approvals");
}

export function approveMcpApproval(
  id: number,
  csrfToken: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/mcp/approvals/${id}/approve`,
    { method: "POST" },
    csrfToken,
  );
}

export function denyMcpApproval(id: number, csrfToken: string): Promise<void> {
  return apiFetch<void>(
    `/api/mcp/approvals/${id}/deny`,
    { method: "POST" },
    csrfToken,
  );
}

/** Pending is the only status that still accepts a human decision. */
export function isPendingApproval(status: string): boolean {
  return status.toLowerCase() === "pending";
}

/**
 * Target shown to the approver: server · deployment/application · action.
 * Missing parts are skipped instead of printing placeholder separators.
 */
export function formatApprovalTarget(
  approval: Pick<
    McpApproval,
    "serverName" | "serverApplicationName" | "applicationActionLabel"
  >,
): string {
  const parts = [
    approval.serverName,
    approval.serverApplicationName,
    approval.applicationActionLabel,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : "—";
}
