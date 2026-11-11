import { apiFetch } from "./api";
import type { TunnelServiceMode } from "./tunnelServices";

/** Central projection of the desktop tunnel sessions (`GET /api/tunnels/sessions`). */
export interface TunnelSession {
  id: number;
  sessionKey: string;
  username: string;
  clientId: string;
  serverId: number;
  serverName: string;
  application: string;
  mode: TunnelServiceMode;
  localPort: number | null;
  targetHost: string | null;
  targetPort: number | null;
  remotePort: number | null;
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

function port(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : String(value);
}

function host(value: string | null | undefined): string {
  return value || "—";
}

/**
 * One line per mode: Local local→target, Dynamic SOCKS on loopback,
 * Remote remote port on the server→target. Null ports stay readable.
 */
export function formatTunnelForward(
  session: Pick<
    TunnelSession,
    | "mode"
    | "serverName"
    | "localPort"
    | "remotePort"
    | "targetHost"
    | "targetPort"
  >,
): string {
  if (session.mode === "Dynamic")
    return `SOCKS 127.0.0.1:${port(session.localPort)}`;
  if (session.mode === "Remote")
    return `${session.serverName || "server"}:${port(session.remotePort)} → ${host(session.targetHost)}:${port(session.targetPort)}`;
  return `127.0.0.1:${port(session.localPort)} → ${host(session.targetHost)}:${port(session.targetPort)}`;
}
