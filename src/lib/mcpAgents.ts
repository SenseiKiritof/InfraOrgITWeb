import { apiFetch } from "./api";

export type McpAgentStatus = "Pending" | "Approved" | "Denied";

export interface McpAgentPermission {
  id: number;
  action: string;
  environmentDefinitionId: number | null;
  environmentName: string | null;
}

export interface McpAgent {
  id: number;
  userId: number;
  username: string;
  clientKey: string;
  name: string;
  status: McpAgentStatus;
  createdAt: string;
  approvedAt: string | null;
  approvedByUsername: string | null;
  lastSeenAt: string | null;
  permissions: McpAgentPermission[];
  pendingRequests: number;
}

export interface McpPermissionRequest {
  id: number;
  agentId: number;
  agentName: string;
  username: string;
  action: string;
  environmentDefinitionId: number | null;
  environmentName: string | null;
  reason: string | null;
  status: string;
  requestedAt: string;
  decidedAt: string | null;
  decidedByUsername: string | null;
}

export interface McpAgentPermissionInput {
  action: string;
  environmentDefinitionId: number | null;
}

export const MCP_ACTIONS = ["reachability.run", "actions.run"] as const;
export type McpAction = (typeof MCP_ACTIONS)[number];

export interface McpPermissionDraft {
  enabled: boolean;
  environmentDefinitionId: number | null;
}

export type McpAgentDraft = Record<McpAction, McpPermissionDraft>;

export function listMcpAgents(): Promise<McpAgent[]> {
  return apiFetch<McpAgent[]>("/api/mcp/agents");
}

export function approveMcpAgent(
  id: number,
  permissions: McpAgentPermissionInput[],
  csrfToken: string,
): Promise<McpAgent> {
  return apiFetch<McpAgent>(
    `/api/mcp/agents/${id}/approve`,
    { method: "POST", body: JSON.stringify({ permissions }) },
    csrfToken,
  );
}

export function denyMcpAgent(id: number, csrfToken: string): Promise<McpAgent> {
  return apiFetch<McpAgent>(
    `/api/mcp/agents/${id}/deny`,
    { method: "POST" },
    csrfToken,
  );
}

export function updateMcpAgentPermissions(
  id: number,
  permissions: McpAgentPermissionInput[],
  csrfToken: string,
): Promise<McpAgent> {
  return apiFetch<McpAgent>(
    `/api/mcp/agents/${id}/permissions`,
    { method: "PUT", body: JSON.stringify({ permissions }) },
    csrfToken,
  );
}

export function listMcpPermissionRequests(): Promise<McpPermissionRequest[]> {
  return apiFetch<McpPermissionRequest[]>("/api/mcp/permission-requests");
}

export function approveMcpPermissionRequest(
  id: number,
  csrfToken: string,
): Promise<McpPermissionRequest> {
  return apiFetch<McpPermissionRequest>(
    `/api/mcp/permission-requests/${id}/approve`,
    { method: "POST" },
    csrfToken,
  );
}

export function denyMcpPermissionRequest(
  id: number,
  csrfToken: string,
): Promise<McpPermissionRequest> {
  return apiFetch<McpPermissionRequest>(
    `/api/mcp/permission-requests/${id}/deny`,
    { method: "POST" },
    csrfToken,
  );
}

export function draftFromAgent(agent: McpAgent): McpAgentDraft {
  const draft: McpAgentDraft = {
    "reachability.run": { enabled: false, environmentDefinitionId: null },
    "actions.run": { enabled: false, environmentDefinitionId: null },
  };

  for (const permission of agent.permissions) {
    if (permission.action === "*") {
      for (const action of MCP_ACTIONS) {
        draft[action] = {
          enabled: true,
          environmentDefinitionId: permission.environmentDefinitionId,
        };
      }
      continue;
    }
    if (MCP_ACTIONS.includes(permission.action as McpAction)) {
      draft[permission.action as McpAction] = {
        enabled: true,
        environmentDefinitionId: permission.environmentDefinitionId,
      };
    }
  }

  return draft;
}

export function permissionsFromDraft(
  draft: McpAgentDraft,
): McpAgentPermissionInput[] {
  return MCP_ACTIONS.filter((action) => draft[action].enabled).map(
    (action) => ({
      action,
      environmentDefinitionId: draft[action].environmentDefinitionId,
    }),
  );
}
