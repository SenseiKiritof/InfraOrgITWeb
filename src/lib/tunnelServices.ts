import { apiFetch } from "./api";

/** XPipe-style tunnel service stored on a server. */
export type TunnelServiceMode = "Local" | "Dynamic" | "Remote";
export type TunnelServiceKind = "Tcp" | "Http" | "Https";

export interface TunnelService {
  id: number;
  serverId: number;
  name: string;
  mode: TunnelServiceMode;
  targetHost: string | null;
  targetPort: number | null;
  localPort: number | null;
  remotePort: number | null;
  kind: TunnelServiceKind;
  openPath: string | null;
  autoStart: boolean;
  enabled: boolean;
}

/** Body accepted by create/update: the server owns id and serverId. */
export type TunnelServiceInput = Omit<TunnelService, "id" | "serverId">;

/** Raw form state: EntitySection works with strings and checkboxes. */
export interface TunnelServiceForm {
  name: string;
  mode: TunnelServiceMode;
  targetHost: string;
  targetPort: string;
  localPort: string;
  remotePort: string;
  kind: TunnelServiceKind;
  openPath: string;
  autoStart: boolean;
  enabled: boolean;
}

export type TunnelServiceError =
  | "nameRequired"
  | "targetHostRequired"
  | "targetPortRequired"
  | "targetPortRange"
  | "localPortRange"
  | "remotePortRequired"
  | "remotePortRange"
  | "openPathFormat"
  | "kindLocalOnly";

export interface TunnelPortDiscovery {
  ports: number[];
}

export const emptyTunnelServiceForm: TunnelServiceForm = {
  name: "",
  mode: "Local",
  targetHost: "",
  targetPort: "",
  localPort: "",
  remotePort: "",
  kind: "Tcp",
  openPath: "",
  autoStart: false,
  enabled: true,
};

export function listTunnelServices(serverId: number): Promise<TunnelService[]> {
  return apiFetch<TunnelService[]>(`/api/servers/${serverId}/tunnel-services`);
}

export function createTunnelService(
  serverId: number,
  input: TunnelServiceInput,
  csrfToken: string,
): Promise<TunnelService> {
  return apiFetch<TunnelService>(
    `/api/servers/${serverId}/tunnel-services`,
    { method: "POST", body: JSON.stringify(input) },
    csrfToken,
  );
}

export function updateTunnelService(
  serverId: number,
  id: number,
  input: TunnelServiceInput,
  csrfToken: string,
): Promise<TunnelService> {
  return apiFetch<TunnelService>(
    `/api/servers/${serverId}/tunnel-services/${id}`,
    { method: "PUT", body: JSON.stringify(input) },
    csrfToken,
  );
}

export function deleteTunnelService(
  serverId: number,
  id: number,
  csrfToken: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/servers/${serverId}/tunnel-services/${id}`,
    { method: "DELETE" },
    csrfToken,
  );
}

/** POST discover: the API answers `{ ports }`, a bare array is tolerated. */
export async function discoverTunnelPorts(
  serverId: number,
  csrfToken: string,
): Promise<number[]> {
  const result = await apiFetch<TunnelPortDiscovery | number[]>(
    `/api/servers/${serverId}/tunnel-services/discover`,
    { method: "POST" },
    csrfToken,
  );
  const ports = Array.isArray(result) ? result : (result.ports ?? []);
  return [...new Set(ports)].sort((a, b) => a - b);
}

function parsedPort(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const port = Number(trimmed);
  return Number.isInteger(port) ? port : Number.NaN;
}

function inRange(port: number, min: number, max: number): boolean {
  return port >= min && port <= max;
}

/**
 * Mirrors the API rules: Local needs host+port (optional local port),
 * Dynamic only the optional local port, Remote also the remote port.
 * Http/Https exist only for Local and their path must start with "/".
 */
export function validateTunnelServiceForm(
  form: TunnelServiceForm,
): TunnelServiceError[] {
  const errors: TunnelServiceError[] = [];
  if (!form.name.trim()) errors.push("nameRequired");

  if (form.mode !== "Dynamic") {
    if (!form.targetHost.trim()) errors.push("targetHostRequired");
    const targetPort = parsedPort(form.targetPort);
    if (targetPort === null) errors.push("targetPortRequired");
    else if (!inRange(targetPort, 1, 65535)) errors.push("targetPortRange");
  }

  if (form.mode !== "Remote") {
    const localPort = parsedPort(form.localPort);
    if (localPort !== null && !inRange(localPort, 1024, 65535))
      errors.push("localPortRange");
  }

  if (form.mode === "Remote") {
    const remotePort = parsedPort(form.remotePort);
    if (remotePort === null) errors.push("remotePortRequired");
    else if (!inRange(remotePort, 1, 65535)) errors.push("remotePortRange");
  }

  if (form.kind !== "Tcp") {
    if (form.mode !== "Local") errors.push("kindLocalOnly");
    const path = form.openPath.trim();
    if (path && !path.startsWith("/")) errors.push("openPathFormat");
  }

  return [...new Set(errors)];
}

/** Drops the fields that do not belong to the selected mode. */
export function tunnelServicePayload(
  form: TunnelServiceForm,
): TunnelServiceInput {
  const local = form.mode === "Local";
  const dynamic = form.mode === "Dynamic";
  const remote = form.mode === "Remote";
  const http = local && form.kind !== "Tcp";
  return {
    name: form.name.trim(),
    mode: form.mode,
    targetHost: local || remote ? form.targetHost.trim() || null : null,
    targetPort: local || remote ? parsedPort(form.targetPort) : null,
    localPort: local || dynamic ? parsedPort(form.localPort) : null,
    remotePort: remote ? parsedPort(form.remotePort) : null,
    kind: local ? form.kind : "Tcp",
    openPath: http ? form.openPath.trim() || null : null,
    autoStart: form.autoStart,
    enabled: form.enabled,
  };
}

export function tunnelServiceToForm(row: TunnelService): TunnelServiceForm {
  return {
    name: row.name,
    mode: row.mode,
    targetHost: row.targetHost ?? "",
    targetPort: row.targetPort === null ? "" : String(row.targetPort),
    localPort: row.localPort === null ? "" : String(row.localPort),
    remotePort: row.remotePort === null ? "" : String(row.remotePort),
    kind: row.kind,
    openPath: row.openPath ?? "",
    autoStart: row.autoStart,
    enabled: row.enabled,
  };
}

/** EntitySection hands back strings; booleans travel as "true"/"false". */
export function tunnelServiceFormFromValues(
  values: Record<string, string | undefined>,
): TunnelServiceForm {
  const mode: TunnelServiceMode =
    values.mode === "Dynamic" || values.mode === "Remote"
      ? values.mode
      : "Local";
  const kind: TunnelServiceKind =
    values.kind === "Http" || values.kind === "Https" ? values.kind : "Tcp";
  return {
    name: values.name ?? "",
    mode,
    targetHost: values.targetHost ?? "",
    targetPort: values.targetPort ?? "",
    localPort: values.localPort ?? "",
    remotePort: values.remotePort ?? "",
    kind,
    openPath: values.openPath ?? "",
    autoStart: values.autoStart === "true",
    enabled: values.enabled === "true",
  };
}
