import { apiFetch } from "./api";
import {
  desktopCreateDirectory,
  desktopDeleteFile,
  desktopListFiles,
  desktopRenameFile,
  desktopUploadFile,
} from "./desktopFiles";
import {
  isDesktopRemoteAvailable,
  resolveDesktopRemote,
  runDesktopAction,
} from "./desktopRemote";
import type { Paged, Server } from "./inventory";
import { paged } from "./inventory";

export interface ServerCredential {
  id: number;
  name: string;
  username: string;
  authType: "Password" | "PrivateKey";
  hasSecret: boolean;
  serversCount: number;
  needsReauth: boolean;
}

export interface CredentialInput {
  name: string;
  username: string;
  authType: "Password" | "PrivateKey";
  secret: string | null;
  passphrase: string | null;
}

export interface CommandTemplate {
  id: number;
  name: string;
  description: string;
  script: string;
  placeholderCount: number;
}

export interface CommandTemplateInput {
  name: string;
  description: string;
  script: string;
}

export interface ApplicationActionConfig {
  id: number;
  applicationId: number;
  label: string;
  order: number;
  commandTemplateId: number | null;
  commandTemplateName: string | null;
  customScript: string | null;
  parameterValues: Record<string, string>;
  requiresConfirmation: boolean;
}

export interface ApplicationActionButton {
  id: number;
  label: string;
  order: number;
  requiresConfirmation: boolean;
  serverId: number;
}

export interface ApplicationActionIntent {
  executionId: number;
  serverId: number;
  label: string;
  script: string;
  redactValues: Record<string, string>;
  timeoutSeconds: number;
}

export interface CommandResult {
  exitCode: number | null;
  output: string;
  timedOut: boolean;
}

export interface ReachabilityTest {
  id: number;
  serverId: number | null;
  hostname: string;
  port: number;
  description: string;
}

export interface ReachabilityResult {
  serverId: number;
  serverName: string;
  hostname: string | null;
  port: number | null;
  reachable: boolean;
  error: string | null;
}

export type FileTransferProtocol = "Sftp" | "Ftp" | "Ftps";

/** FTPS e FTP usano la 21; SFTP la 22. */
export function defaultFileTransferPort(
  protocol: FileTransferProtocol | "" | null,
): number {
  return protocol === "Ftp" || protocol === "Ftps" ? 21 : 22;
}

export interface RemoteFileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedUtc: string | null;
}

export interface RemoteFileList {
  path: string;
  items: RemoteFileEntry[];
}

export interface FileTransferConfig {
  protocol: FileTransferProtocol | null;
  port: number | null;
  credentialId: number | null;
}

export function assignFileTransfer(
  serverId: number,
  config: FileTransferConfig,
  csrfToken: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/servers/${serverId}/file-transfer`,
    {
      method: "PUT",
      body: JSON.stringify({
        protocol: config.protocol,
        port: config.port,
        credentialId: config.credentialId,
      }),
    },
    csrfToken,
  );
}

/**
 * Elenca i file del server. Con `path` null la richiesta non invia il
 * parametro: il server parte dalla home della sessione (SFTP) e la restituisce.
 */
export async function listServerFiles(
  serverId: number,
  path: string | null,
): Promise<RemoteFileList> {
  const local = await desktopListFiles(serverId, path);
  if (local) return local;
  const query = path === null ? "" : `?path=${encodeURIComponent(path)}`;
  return apiFetch<RemoteFileList>(`/api/servers/${serverId}/files${query}`);
}

export function serverFileDownloadUrl(serverId: number, path: string): string {
  return `/api/servers/${serverId}/files/download?path=${encodeURIComponent(path)}`;
}

export async function uploadServerFile(
  serverId: number,
  directory: string,
  file: File,
  csrfToken: string,
): Promise<{ path: string }> {
  const local = await desktopUploadFile(serverId, directory, file);
  if (local) return local;
  const form = new FormData();
  form.append("file", file);
  return apiFetch<{ path: string }>(
    `/api/servers/${serverId}/files/upload?path=${encodeURIComponent(directory)}`,
    { method: "POST", body: form },
    csrfToken,
  );
}

export async function createServerDirectory(
  serverId: number,
  path: string,
  csrfToken: string,
): Promise<{ path: string }> {
  const local = await desktopCreateDirectory(
    serverId,
    path.replace(/\/[^/]*$/, "") || "/",
    path.split("/").filter(Boolean).pop() || path,
  );
  if (local) return local;
  return apiFetch<{ path: string }>(
    `/api/servers/${serverId}/files/directory`,
    { method: "POST", body: JSON.stringify({ path }) },
    csrfToken,
  );
}

export async function renameServerFile(
  serverId: number,
  path: string,
  newName: string,
  isDirectory: boolean,
  csrfToken: string,
): Promise<{ path: string }> {
  const local = await desktopRenameFile(serverId, path, newName);
  if (local) return local;
  return apiFetch<{ path: string }>(
    `/api/servers/${serverId}/files/rename`,
    {
      method: "POST",
      body: JSON.stringify({ path, newName, isDirectory }),
    },
    csrfToken,
  );
}

export async function deleteServerFile(
  serverId: number,
  path: string,
  isDirectory: boolean,
  csrfToken: string,
): Promise<void> {
  const local = await desktopDeleteFile(serverId, path, isDirectory);
  if (local) return;
  return apiFetch<void>(
    `/api/servers/${serverId}/files?path=${encodeURIComponent(path)}&isDirectory=${isDirectory}`,
    { method: "DELETE" },
    csrfToken,
  );
}

export interface CommandExecution {
  id: number;
  username: string;
  serverId: number;
  serverName: string;
  kind: "Action" | "Reachability" | "Console";
  label: string;
  exitCode: number | null;
  output: string;
  startedAt: string;
  endedAt: string | null;
}

export function getCredentials(): Promise<Paged<ServerCredential>> {
  return paged<ServerCredential>("/api/server-credentials");
}

export function getServersForCredential(): Promise<Paged<Server>> {
  return paged<Server>("/api/servers");
}

export function splitServersByCredential(
  servers: Server[],
  credentialId: number,
): { assigned: Server[]; available: Server[] } {
  return {
    assigned: servers.filter((server) => server.credentialId === credentialId),
    // Solo server senza credenziale: aggiungerne uno già associato la sposterebbe
    // silenziosamente da un'altra credenziale.
    available: servers.filter((server) => server.credentialId === null),
  };
}

export function assignServerSsh(
  serverId: number,
  credentialId: number | null,
  sshPort: number,
  csrfToken: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/servers/${serverId}/ssh`,
    { method: "PUT", body: JSON.stringify({ credentialId, sshPort }) },
    csrfToken,
  );
}

export function resetHostKey(
  serverId: number,
  csrfToken: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/servers/${serverId}/host-key`,
    { method: "DELETE" },
    csrfToken,
  );
}

export function getCommandTemplates(): Promise<Paged<CommandTemplate>> {
  return paged<CommandTemplate>("/api/command-templates");
}

export function getExecutions(
  query: {
    q?: string;
    kind?: string;
    page?: number;
    pageSize?: number;
    sort?: string;
  } = {},
): Promise<Paged<CommandExecution>> {
  const params = new URLSearchParams({
    page: String(query.page ?? 1),
    pageSize: String(query.pageSize ?? 20),
  });
  if (query.q) params.set("q", query.q);
  if (query.kind) params.set("kind", query.kind);
  if (query.sort) params.set("sort", query.sort);
  return apiFetch<Paged<CommandExecution>>(`/api/command-executions?${params}`);
}

export function getGlobalReachability(): Promise<ReachabilityTest[]> {
  return apiFetch<ReachabilityTest[]>("/api/reachability-tests");
}

export function getServerReachability(
  serverId: number,
): Promise<ReachabilityTest[]> {
  return apiFetch<ReachabilityTest[]>(
    `/api/servers/${serverId}/reachability-tests`,
  );
}

export function runServerReachability(
  serverId: number,
  csrfToken: string,
  testIds?: number[],
): Promise<ReachabilityResult[]> {
  return apiFetch<ReachabilityResult[]>(
    `/api/servers/${serverId}/reachability-tests/run`,
    { method: "POST", body: JSON.stringify({ testIds }) },
    csrfToken,
  );
}

export function getActionButtons(
  serverApplicationId: number,
): Promise<ApplicationActionButton[]> {
  return apiFetch<ApplicationActionButton[]>(
    `/api/server-applications/${serverApplicationId}/actions`,
  );
}

function actionIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `run-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export function prepareActionIntent(
  serverApplicationId: number,
  actionId: number,
  csrfToken: string,
  confirm: boolean,
  idempotencyKey: string,
): Promise<ApplicationActionIntent> {
  return apiFetch<ApplicationActionIntent>(
    `/api/server-applications/${serverApplicationId}/actions/${actionId}/intent`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ confirm }),
    },
    csrfToken,
  );
}

export async function runAction(
  serverApplicationId: number,
  actionId: number,
  csrfToken: string,
  confirm = false,
  serverId: number | null = null,
): Promise<CommandResult> {
  const idempotencyKey = actionIdempotencyKey();
  if (serverId && isDesktopRemoteAvailable()) {
    const transport = await resolveDesktopRemote(serverId, "actions");
    if (transport === "client") {
      const intent = await prepareActionIntent(
        serverApplicationId,
        actionId,
        csrfToken,
        confirm,
        idempotencyKey,
      );
      return runDesktopAction(intent);
    }
  }
  return apiFetch<CommandResult>(
    `/api/server-applications/${serverApplicationId}/actions/${actionId}/run`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ confirm }),
    },
    csrfToken,
  );
}

export function getApplicationActions(
  applicationId: number,
): Promise<ApplicationActionConfig[]> {
  return apiFetch<ApplicationActionConfig[]>(
    `/api/applications/${applicationId}/actions`,
  );
}

export function saveApplicationAction(
  applicationId: number,
  id: number | null,
  body: {
    label: string;
    order: number;
    commandTemplateId: number | null;
    customScript: string | null;
    parameterValues: Record<string, string>;
    requiresConfirmation: boolean;
  },
  csrfToken: string,
): Promise<unknown> {
  return apiFetch(
    id === null
      ? `/api/applications/${applicationId}/actions`
      : `/api/application-actions/${id}`,
    { method: id === null ? "POST" : "PUT", body: JSON.stringify(body) },
    csrfToken,
  );
}
