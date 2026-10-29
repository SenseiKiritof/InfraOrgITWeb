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
  type: string;
  versionCount: number;
}

export interface ApplicationEnvironment {
  environmentId: number;
  name: string;
  hostname: string | null;
  ignoreSslErrors: boolean;
}

export interface ApplicationApiKey {
  id: number;
  applicationId: number;
  environmentId: number | null;
  name: string;
  location: "Header" | "Query";
  hasValue: boolean;
  keyVersion: number;
}

export interface ApplicationApiCallResult {
  callId: number | null;
  status: number;
  contentType: string;
  reason: string;
  durationMs: number;
  body: string;
  truncated: boolean;
  sizeBytes: number;
  binary: boolean;
}

export interface ApplicationApiCall {
  id: number;
  applicationId: number | null;
  applicationName: string | null;
  applicationVersionApiId: number | null;
  method: string;
  url: string;
  environmentId: number;
  environmentName: string;
  status: number | null;
  durationMs: number;
  sizeBytes: number;
  truncated: boolean;
  createdAt: string;
}

export interface ApplicationApiCallDetail extends ApplicationApiCall {
  queryJson: string | null;
  requestBody: string | null;
  responseBody: string | null;
  binary: boolean;
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

const PAGE_SIZE = 200;

function pageUrl(path: string, page: number, q?: string): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  if (q) params.set("q", q);
  return `${path}${path.includes("?") ? "&" : "?"}${params}`;
}

/**
 * Loads every page of a list so client-side sort, filter and paging see all
 * rows and the footer shows the real total.
 *
 * shortcut: one request per 200 rows. Ceiling: a list with tens of thousands
 * of rows gets slow; move that list to server-side paging when it gets there.
 */
export async function paged<T>(path: string, q?: string): Promise<Paged<T>> {
  const first = await apiFetch<Paged<T>>(pageUrl(path, 1, q));
  const items = [...first.items];
  if (items.length < first.total) {
    const pages = Math.ceil(first.total / first.pageSize);
    for (let page = 2; page <= pages; page += 1) {
      const chunk = await apiFetch<Paged<T>>(pageUrl(path, page, q));
      if (chunk.items.length === 0) break;
      items.push(...chunk.items);
    }
  }
  return { items, total: items.length, page: 1, pageSize: first.pageSize };
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
