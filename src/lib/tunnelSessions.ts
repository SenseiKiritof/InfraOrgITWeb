import { apiFetch } from "./api";

/** Central projection of the desktop tunnel sessions (`GET /api/tunnels/sessions`). */
export interface TunnelSession {
  id: number;
  sessionKey: string;
  username: string;
  clientId: string;
  serverId: number;
  serverName: string;
  application: string;
  localPort: number;
  targetHost: string;
  targetPort: number;
  startedAt: string;
  lastSeenAt: string;
  status: string;
}

export interface TunnelSessionList {
  items: TunnelSession[];
}

export function getTunnelSessions(): Promise<TunnelSessionList> {
  return apiFetch<TunnelSessionList>("/api/tunnels/sessions");
}

/** Loopback address the desktop exposes → destination seen by the server. */
export function formatTunnelForward(session: TunnelSession): string {
  return `127.0.0.1:${session.localPort} → ${session.targetHost}:${session.targetPort}`;
}
