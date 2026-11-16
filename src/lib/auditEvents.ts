import { apiFetch } from "./api";

export type AuditKind =
  | "McpToolCall"
  | "TunnelStart"
  | "TunnelStop"
  | "TunnelError";

export type AuditOutcome = "Ok" | "Error" | "Denied";

export interface AuditEvent {
  id: number;
  occurredAt: string;
  kind: AuditKind;
  actorUsername: string;
  clientId: string | null;
  action: string;
  targetType: string | null;
  targetId: number | null;
  serverId: number | null;
  targetHost: string | null;
  targetPort: number | null;
  localPort: number | null;
  outcome: AuditOutcome;
  errorCode: string | null;
  durationMs: number;
  correlationId: string | null;
  serverName: string | null;
  targetLabel: string | null;
}

export interface AuditEventPage {
  items: AuditEvent[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditEventQuery {
  page?: number;
  pageSize?: number;
  kind?: string;
  outcome?: string;
  q?: string;
  serverId?: number | null;
}

export function getAuditEvents(
  query: AuditEventQuery = {},
): Promise<AuditEventPage> {
  const params = new URLSearchParams({
    page: String(query.page ?? 1),
    pageSize: String(query.pageSize ?? 25),
    kind: query.kind ?? "",
    outcome: query.outcome ?? "",
    q: query.q ?? "",
    serverId: query.serverId == null ? "" : String(query.serverId),
  });
  return apiFetch<AuditEventPage>(`/api/audit-events?${params}`);
}

/** Human labels for the entity types stored in an audit target. */
const TARGET_TYPE_LABELS: Record<string, string> = {
  Server: "",
  ServerApplication: "Applicazione",
  Application: "Applicazione",
  Project: "Progetto",
  McpAgent: "Agente MCP",
  McpPermissionRequest: "Richiesta permesso",
};

/** MCP calls without a single target still name the data they touched. */
function mcpScope(action: string): string {
  if (action === "get_mcp_agent" || action === "request_mcp_permission") {
    return "Agente MCP";
  }
  if (action === "get_topology") return "Topologia";
  if (action === "list_executions") return "Registro esecuzioni";
  return "Inventario";
}

/** MCP calls have a server or an entity target; tunnels add host and ports. */
export function formatAuditTarget(event: AuditEvent): string {
  const parts: string[] = [];
  if (event.targetHost) {
    parts.push(`${event.targetHost}:${event.targetPort ?? "—"}`);
  }
  if (event.localPort !== null) {
    parts.push(`local:${event.localPort}`);
  }
  if (event.targetType) {
    const type = TARGET_TYPE_LABELS[event.targetType] ?? event.targetType;
    const value = event.targetLabel ?? `#${event.targetId ?? "—"}`;
    parts.push(type ? `${type} ${value}` : value);
  }
  if (event.serverId !== null && event.targetType !== "Server") {
    parts.push(event.serverName ?? `server #${event.serverId}`);
  }
  if (parts.length === 0 && event.kind === "McpToolCall") {
    return mcpScope(event.action);
  }
  return parts.join(" · ") || "—";
}
