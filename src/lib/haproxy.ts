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
  effectiveApiVersion: string | null;
  monitoringChoice: HaproxyMonitoringChoice;
  discoveryStatus: HaproxyDiscoveryStatus;
  detectedVersion: string | null;
  detectedConfigPath: string | null;
  lastSeenAt: string | null;
  lastTestAt: string | null;
  lastTestStatus: string | null;
  lastTestDetail: string | null;
  lastRefreshAt: string | null;
  lastRefreshStatus: string | null;
  lastRefreshDetail: string | null;
  routeCount: number;
  serverCount: number;
  username: string | null;
  statsUsername: string | null;
  caPem: string | null;
  hasCredentials: boolean;
  allowSelfSigned: boolean;
}

export function getHaproxyInstances(
  serverId?: number,
): Promise<HaproxyInstance[]> {
  const query = serverId === undefined ? "" : `?serverId=${serverId}`;
  return apiFetch<HaproxyInstance[]>(`/api/haproxy/instances${query}`);
}

export interface HaproxyRoute {
  id: number;
  frontend: string;
  bind: string;
  host: string;
  path: string;
  backend: string;
  isDefault: boolean;
  rawCondition: string | null;
  configurationVersion: number | null;
  collectedAt: string;
}

export interface HaproxyServer {
  id: number;
  backend: string;
  server: string;
  address: string;
  status: string;
  checkStatus: string | null;
  weight: number | null;
  collectedAt: string;
}

export function getHaproxyRoutes(id: number): Promise<HaproxyRoute[]> {
  return apiFetch<HaproxyRoute[]>(`/api/haproxy/instances/${id}/routes`);
}

export function getHaproxyServers(id: number): Promise<HaproxyServer[]> {
  return apiFetch<HaproxyServer[]>(`/api/haproxy/instances/${id}/servers`);
}

export interface HaproxyLiveSeries {
  kind: string;
  proxy: string;
  server: string;
  status: string;
  checkStatus: string | null;
  reqTotal: number;
  h4xx: number;
  h5xx: number;
  scur: number;
  qcur: number;
  rate: number;
  reqRate: number;
  rtime: number;
  ctime: number;
  ttime: number;
  bin: number;
  bout: number;
}

export interface HaproxyLiveSnapshot {
  at: string;
  series: HaproxyLiveSeries[];
  process: {
    uptime: number;
    currConns: number;
    cumConns: number;
    currSslConns: number;
    cumSslConns: number;
    maxConn: number;
    sessRate: number;
    connRate: number;
    tasks: number;
    runQueue: number;
    idlePct: number;
    threads: number;
    activePeers: number;
    connectedPeers: number;
  } | null;
}

export interface HaproxyMetricPoint {
  timestamp: string;
  req: number;
  h4xx: number;
  h5xx: number;
  bin: number;
  bout: number;
  scur: number;
  qcur: number;
  rtime: number;
  ctime: number;
  ttime: number;
  qtime: number;
}

export function getHaproxyLive(
  id: number,
): Promise<HaproxyLiveSnapshot | null> {
  return apiFetch<HaproxyLiveSnapshot | null>(
    `/api/haproxy/instances/${id}/live`,
  );
}

export function getHaproxyMetrics(
  id: number,
  minutes: number,
): Promise<HaproxyMetricPoint[]> {
  return apiFetch<HaproxyMetricPoint[]>(
    `/api/haproxy/instances/${id}/metrics?minutes=${minutes}&kind=frontend`,
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

export interface HaproxySettings {
  name: string;
  baseUrl: string;
  transport: "Direct" | "SshForward" | "DesktopRelay";
  apiHost: string;
  apiPort: number;
  apiVersion: string;
  username: string;
  statsUsername: string;
  caPem: string;
  allowSelfSigned: boolean;
  serverApplicationId: number | null;
}

export function updateHaproxySettings(
  id: number,
  settings: HaproxySettings,
  csrfToken: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/haproxy/instances/${id}`,
    { method: "PUT", body: JSON.stringify(settings) },
    csrfToken,
  );
}

export function updateHaproxySecrets(
  id: number,
  secrets: {
    password?: string;
    statsPassword?: string;
    clearPassword?: boolean;
    clearStatsPassword?: boolean;
  },
  csrfToken: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/haproxy/instances/${id}/secrets`,
    { method: "PUT", body: JSON.stringify(secrets) },
    csrfToken,
  );
}

export function testHaproxyInstance(
  id: number,
  csrfToken: string,
): Promise<{
  apiVersion: string;
  haproxyVersion: string | null;
  statsRows: number;
  at: string;
}> {
  return apiFetch<{
    apiVersion: string;
    haproxyVersion: string | null;
    statsRows: number;
    at: string;
  }>(`/api/haproxy/instances/${id}/test`, { method: "POST" }, csrfToken);
}

export function refreshHaproxyInstance(
  id: number,
  csrfToken: string,
): Promise<{ routes: number; servers: number; refreshedAt: string }> {
  return apiFetch<{ routes: number; servers: number; refreshedAt: string }>(
    `/api/haproxy/instances/${id}/refresh`,
    { method: "POST" },
    csrfToken,
  );
}
