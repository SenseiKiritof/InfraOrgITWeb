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
    parts.push(`${event.targetType} #${event.targetId ?? "—"}`);
  }
  if (event.serverId !== null) {
    parts.push(`server #${event.serverId}`);
  }
  return parts.join(" · ") || "—";
}
