import { apiFetch } from "./api";

export interface McpGrant {
  id: number;
  userId: number | null;
  username: string | null;
  groupId: number | null;
  groupName: string | null;
  action: string;
  environmentDefinitionId: number | null;
  environmentName: string | null;
  createdAt: string;
}

export function listMcpGrants(): Promise<McpGrant[]> {
  return apiFetch<McpGrant[]>("/api/mcp/grants");
}

export function createMcpGrant(
  body: {
    userId: number | null;
    groupId: number | null;
    action: string;
    environmentDefinitionId: number | null;
  },
  csrfToken: string,
): Promise<number> {
  return apiFetch<number>(
    "/api/mcp/grants",
    { method: "POST", body: JSON.stringify(body) },
    csrfToken,
  );
}

export function deleteMcpGrant(id: number, csrfToken: string): Promise<void> {
  return apiFetch<void>(
    `/api/mcp/grants/${id}`,
    { method: "DELETE" },
    csrfToken,
  );
}
