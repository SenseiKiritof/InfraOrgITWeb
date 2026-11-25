import { apiFetch } from "./api";

export type HaproxyMonitoringChoice = "Undecided" | "Enabled" | "Disabled";
export type HaproxyDiscoveryStatus =
  | "Found"
  | "Inactive"
  | "CredentialsRequired"
  | "Unreachable"
  | "Ready";

export interface HaproxyInstance {
  id: number;
  serverId: number;
  serverName: string;
  providerEnvironmentId: number;
  environmentLabel: string;
  serverApplicationId: number | null;
  name: string;
  baseUrl: string;
  transport: "Direct" | "SshForward" | "DesktopRelay";
  apiHost: string;
  apiPort: number;
  apiVersion: string;
  monitoringChoice: HaproxyMonitoringChoice;
  discoveryStatus: HaproxyDiscoveryStatus;
  detectedVersion: string | null;
  detectedConfigPath: string | null;
  lastSeenAt: string | null;
  lastTestAt: string | null;
  lastTestStatus: string | null;
  lastTestDetail: string | null;
  hasCredentials: boolean;
  allowSelfSigned: boolean;
}

export function getHaproxyInstances(
  serverId: number,
): Promise<HaproxyInstance[]> {
  return apiFetch<HaproxyInstance[]>(
    `/api/haproxy/instances?serverId=${serverId}`,
  );
}

export function setHaproxyMonitoring(
  id: number,
  choice: HaproxyMonitoringChoice,
  csrfToken: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/haproxy/instances/${id}/monitoring`,
    { method: "PUT", body: JSON.stringify({ choice }) },
    csrfToken,
  );
}

export function runHaproxyDiscovery(
  serverId: number,
  csrfToken: string,
): Promise<{ started: boolean }> {
  return apiFetch<{ started: boolean }>(
    `/api/haproxy/discovery/run?serverId=${serverId}`,
    { method: "POST" },
    csrfToken,
  );
}
