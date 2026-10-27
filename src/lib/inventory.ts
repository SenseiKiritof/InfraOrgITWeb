import { apiFetch } from "./api";

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Provider {
  id: number;
  name: string;
  environmentCount: number;
}

export interface Environment {
  id: number;
  name: string;
  description: string;
  providerCount: number;
}

export interface ProviderEnvironment {
  id: number;
  providerId: number;
  providerName: string;
  environmentId: number;
  environmentName: string;
  label: string;
  serverCount: number;
}

export interface Server {
  id: number;
  providerEnvironmentId: number;
  providerEnvironmentLabel: string;
  name: string;
  ipAddress: string;
  hostname: string;
  sshPort: number;
  credentialId: number | null;
  hasHostKey: boolean;
  jumpServerId: number | null;
  jumpServerName: string | null;
  jumpServerIpAddress: string | null;
}

export interface ServerApplication {
  id: number;
  serverId: number;
  serverName: string;
  applicationVersionId: number;
  applicationId: number;
  applicationName: string;
  versionNumber: string;
  exposedPort: number;
  proxyRouteId: number | null;
}

export interface Application {
  id: number;
  name: string;
  description: string;
  basePath: string;
  listeningOnPort: number;
  versionCount: number;
}

export interface ApplicationVersion {
  id: number;
  applicationId: number;
  applicationName: string;
  versionNumber: string;
  apiCount: number;
}

export type RequestType = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApplicationVersionApi {
  id: number;
  applicationVersionId: number;
  url: string;
  requestType: RequestType;
  description: string;
  body: string | null;
  queryParamCount: number;
}

export type QueryParamType =
  | "Int"
  | "String"
  | "Bool"
  | "DateTime"
  | "Double"
  | "Decimal";

export interface ApplicationApiQueryParam {
  id: number;
  applicationApiId: number;
  name: string;
  paramType: QueryParamType;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  applicationCount: number;
}

export interface ServerAccess {
  isSystemAdmin: boolean;
  adminEnvironmentIds: number[];
  operatorEnvironmentIds: number[];
}

export function listUrl(path: string, q?: string): string {
  if (!q) return path;
  return `${path}?q=${encodeURIComponent(q)}`;
}

export function paged<T>(path: string, q?: string): Promise<Paged<T>> {
  return apiFetch<Paged<T>>(listUrl(path, q));
}

export function listOf<T>(path: string): Promise<T[]> {
  return apiFetch<T[]>(path);
}

export function saveEntity(
  path: string,
  id: number | null,
  body: unknown,
  csrfToken: string,
): Promise<unknown> {
  return apiFetch(
    id === null ? path : `${path}/${id}`,
    {
      method: id === null ? "POST" : "PUT",
      body: JSON.stringify(body),
    },
    csrfToken,
  );
}

export function deleteEntity(path: string, csrfToken: string): Promise<void> {
  return apiFetch<void>(path, { method: "DELETE" }, csrfToken);
}
