import { apiFetch } from "./api";
import type { Paged } from "./inventory";

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

export interface CommandExecution {
  id: number;
  username: string;
  serverId: number;
  serverName: string;
  kind: "Action" | "Reachability" | "Console";
  label: string;
  script: string;
  exitCode: number | null;
  output: string;
  startedAt: string;
  endedAt: string | null;
}

export function getCredentials(): Promise<Paged<ServerCredential>> {
  return apiFetch<Paged<ServerCredential>>(
    "/api/server-credentials?pageSize=200",
  );
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
  return apiFetch<Paged<CommandTemplate>>(
    "/api/command-templates?pageSize=200",
  );
}

export function getExecutions(
  q?: string,
  kind?: string,
): Promise<Paged<CommandExecution>> {
  const params = new URLSearchParams({ pageSize: "200" });
  if (q) params.set("q", q);
  if (kind) params.set("kind", kind);
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
): Promise<ReachabilityResult[]> {
  return apiFetch<ReachabilityResult[]>(
    `/api/servers/${serverId}/reachability-tests/run`,
    { method: "POST" },
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

export function runAction(
  serverApplicationId: number,
  actionId: number,
  csrfToken: string,
): Promise<CommandResult> {
  const idempotencyKey =
    globalThis.crypto?.randomUUID?.() ??
    `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return apiFetch<CommandResult>(
    `/api/server-applications/${serverApplicationId}/actions/${actionId}/run`,
    { method: "POST", headers: { "Idempotency-Key": idempotencyKey } },
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
