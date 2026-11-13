import { type DesktopMessage, sendDesktopMessage } from "./desktopBridge";
import type {
  TunnelService,
  TunnelServiceKind,
  TunnelServiceMode,
} from "./tunnelServices";

export interface DesktopTunnelJump {
  host: string;
  port: number;
  username: string;
}

export interface DesktopTunnelEndpoint {
  serverApplicationId: number;
  applicationId: number;
  application: string;
  version: string;
  targetHost: string;
  targetPort: number;
  suggestedLocalPort: number | null;
}

export interface DesktopTunnelServer {
  serverId: number;
  serverName: string;
  environmentLabel: string;
  sshHost: string;
  sshPort: number;
  username: string;
  jump: DesktopTunnelJump | null;
  jumps: DesktopTunnelJump[];
  targets: DesktopTunnelEndpoint[];
  services: TunnelService[];
}

export interface DesktopActiveTunnel {
  id: string;
  url: string | null;
  instanceName: string;
  serverName: string;
  application: string;
  serviceId: number | null;
  mode: TunnelServiceMode;
  kind: string;
  targetHost: string | null;
  targetPort: number | null;
  localPort: number | null;
  remotePort: number | null;
  openUrl: string | null;
}

export type DesktopTunnelAuthStatus =
  | "pending"
  | "restoring"
  | "none"
  | "restored"
  | "success"
  | "logout"
  | "error";

export interface DesktopTunnelAuth {
  status: DesktopTunnelAuthStatus;
  url: string;
  userCode: string | null;
  verificationUri: string | null;
  verificationUriComplete: string | null;
  expiresIn: number | null;
  saved: boolean;
  requiresLogin: boolean;
  message: string | null;
}

export type DesktopTunnelEvent =
  | { kind: "auth"; auth: DesktopTunnelAuth }
  | { kind: "targets"; items: DesktopTunnelServer[] }
  | { kind: "state"; items: DesktopActiveTunnel[] }
  | { kind: "status"; tone: "log" | "warning" | "error"; message: string };

export type LocalPortResult =
  | { ok: true; value: number | null }
  | { ok: false };

/** Istanza corrente: la SPA desktop vive sullo stesso origin dell'istanza. */
export function desktopTunnelInstance(): { url: string; name: string } {
  return {
    url: window.location.origin,
    name: document.title || window.location.host,
  };
}

function tunnelMessage(
  type: string,
  extra: Record<string, unknown> = {},
): boolean {
  return sendDesktopMessage({
    type,
    url: desktopTunnelInstance().url,
    ...extra,
  });
}

export function restoreDesktopTunnels(): boolean {
  return tunnelMessage("tunnels.restore", {
    name: desktopTunnelInstance().name,
    autoStart: true,
  });
}

export function requestDesktopTunnelTargets(token?: string): boolean {
  const message: Record<string, unknown> = {
    name: desktopTunnelInstance().name,
    autoStart: true,
  };
  if (token) message.token = token;
  return tunnelMessage("tunnels.list", message);
}

export function loginDesktopTunnels(): boolean {
  return tunnelMessage("tunnels.login", {
    name: desktopTunnelInstance().name,
    autoStart: true,
  });
}

export function cancelDesktopTunnelLogin(): boolean {
  return tunnelMessage("tunnels.login.cancel");
}

export function logoutDesktopTunnels(): boolean {
  return tunnelMessage("tunnels.logout");
}

export function startDesktopDeploymentTunnel(
  serverId: number,
  targetId: number,
  localPort: number | null,
): boolean {
  return tunnelMessage("tunnels.start", {
    serverId,
    targetId,
    localPort,
  });
}

export function startDesktopServiceTunnel(
  serverId: number,
  serviceId: number,
  localPort: number | null,
): boolean {
  const message: Record<string, unknown> = { serverId, serviceId };
  if (localPort !== null) message.localPort = localPort;
  return tunnelMessage("tunnels.start", message);
}

export function stopDesktopTunnel(id: string): boolean {
  return tunnelMessage("tunnels.stop", { id });
}

/** Solo pagina di verifica Keycloak o URL di un tunnel attivo lato desktop. */
export function openDesktopExternal(url: string): boolean {
  return sendDesktopMessage({ type: "desktop.openExternal", url });
}

/** Porta locale opzionale del form; `null` lascia scegliere al desktop. */
export function parseLocalPort(input: string): LocalPortResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: null };
  const port = Number(trimmed);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    return { ok: false };
  return { ok: true, value: port };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function nullableInteger(value: unknown): number | null {
  return integer(value);
}

function mode(value: unknown): TunnelServiceMode | null {
  return value === "Local" || value === "Dynamic" || value === "Remote"
    ? value
    : null;
}

function kind(value: unknown): TunnelServiceKind | null {
  return value === "Tcp" || value === "Http" || value === "Https"
    ? value
    : null;
}

function parseArray<T>(
  value: unknown,
  parse: (item: unknown) => T | null,
): T[] {
  return Array.isArray(value)
    ? value.map(parse).filter((item): item is T => item !== null)
    : [];
}

function parseJump(value: unknown): DesktopTunnelJump | null {
  const row = record(value);
  if (!row) return null;
  const host = text(row.host);
  const port = integer(row.port);
  const username = text(row.username);
  return host && port !== null && username ? { host, port, username } : null;
}

function parseEndpoint(value: unknown): DesktopTunnelEndpoint | null {
  const row = record(value);
  if (!row) return null;
  const serverApplicationId = integer(row.serverApplicationId);
  if (serverApplicationId === null) return null;
  return {
    serverApplicationId,
    applicationId: integer(row.applicationId) ?? 0,
    application: text(row.application) ?? "",
    version: text(row.version) ?? "",
    targetHost: text(row.targetHost) ?? "",
    targetPort: integer(row.targetPort) ?? 0,
    suggestedLocalPort: nullableInteger(row.suggestedLocalPort),
  };
}

function parseService(value: unknown): TunnelService | null {
  const row = record(value);
  if (!row) return null;
  const id = integer(row.id);
  const serverId = integer(row.serverId);
  const serviceMode = mode(row.mode);
  if (id === null || serverId === null || serviceMode === null) return null;
  return {
    id,
    serverId,
    name: text(row.name) ?? `#${id}`,
    mode: serviceMode,
    targetHost: text(row.targetHost),
    targetPort: nullableInteger(row.targetPort),
    localPort: nullableInteger(row.localPort),
    remotePort: nullableInteger(row.remotePort),
    kind: kind(row.kind) ?? "Tcp",
    openPath: text(row.openPath),
    autoStart: row.autoStart === true,
    enabled: row.enabled !== false,
  };
}

function parseServer(value: unknown): DesktopTunnelServer | null {
  const row = record(value);
  if (!row) return null;
  const serverId = integer(row.serverId);
  if (serverId === null) return null;
  return {
    serverId,
    serverName: text(row.serverName) ?? `#${serverId}`,
    environmentLabel: text(row.environmentLabel) ?? "",
    sshHost: text(row.sshHost) ?? "",
    sshPort: integer(row.sshPort) ?? 22,
    username: text(row.username) ?? "",
    jump: parseJump(row.jump),
    jumps: parseArray(row.jumps, parseJump),
    targets: parseArray(row.targets, parseEndpoint),
    services: parseArray(row.services, parseService),
  };
}

function parseActiveTunnel(value: unknown): DesktopActiveTunnel | null {
  const row = record(value);
  if (!row) return null;
  const id = text(row.id);
  const tunnelMode = mode(row.mode);
  if (!id || !tunnelMode) return null;
  return {
    id,
    url: text(row.url),
    instanceName: text(row.instanceName) ?? "",
    serverName: text(row.serverName) ?? "",
    application: text(row.application) ?? "",
    serviceId: nullableInteger(row.serviceId),
    mode: tunnelMode,
    kind: text(row.kind) ?? "Tcp",
    targetHost: text(row.targetHost),
    targetPort: nullableInteger(row.targetPort),
    localPort: nullableInteger(row.localPort),
    remotePort: nullableInteger(row.remotePort),
    openUrl: text(row.openUrl),
  };
}

function sameInstance(value: string | null, instanceUrl: string): boolean {
  if (!value) return false;
  try {
    return new URL(value, instanceUrl).origin === new URL(instanceUrl).origin;
  } catch {
    return false;
  }
}

/**
 * Converte un messaggio desktop in un evento della UI, scartando quelli di
 * un'altra istanza. `tunnels.state` può arrivare a tutte le finestre: il
 * filtro per URL avviene qui, prima del rendering.
 */
export function parseDesktopTunnelEvent(
  message: DesktopMessage,
  instanceUrl: string,
): DesktopTunnelEvent | null {
  switch (message.type) {
    case "tunnels.auth": {
      if (!sameInstance(text(message.url), instanceUrl)) return null;
      const status = text(message.status);
      if (
        status !== "pending" &&
        status !== "restoring" &&
        status !== "none" &&
        status !== "restored" &&
        status !== "success" &&
        status !== "logout" &&
        status !== "error"
      )
        return null;
      return {
        kind: "auth",
        auth: {
          status,
          url: text(message.url) ?? instanceUrl,
          userCode: text(message.userCode),
          verificationUri: text(message.verificationUri),
          verificationUriComplete: text(message.verificationUriComplete),
          expiresIn: nullableInteger(message.expiresIn),
          saved: message.saved === true,
          requiresLogin: message.requiresLogin === true,
          message: text(message.message),
        },
      };
    }
    case "tunnels.targets": {
      if (!sameInstance(text(message.url), instanceUrl)) return null;
      return {
        kind: "targets",
        items: parseArray(message.items, parseServer),
      };
    }
    case "tunnels.state": {
      const items = parseArray(message.items, parseActiveTunnel).filter(
        (item) => item.url === null || sameInstance(item.url, instanceUrl),
      );
      return { kind: "state", items };
    }
    case "tunnels.log":
      return {
        kind: "status",
        tone: "log",
        message: text(message.message) ?? "",
      };
    case "tunnels.warning":
      return {
        kind: "status",
        tone: "warning",
        message: text(message.message) ?? "",
      };
    case "tunnels.error": {
      const url = text(message.url);
      if (url && !sameInstance(url, instanceUrl)) return null;
      return {
        kind: "status",
        tone: "error",
        message: text(message.message) ?? "",
      };
    }
    default:
      return null;
  }
}
