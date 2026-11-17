import { apiFetch } from "./api";

export type ConnectionPolicyMode = "Server" | "Client" | "Auto";

export interface ConnectionPolicy {
  mode: ConnectionPolicyMode;
  updatedAt: string | null;
  updatedBy: string;
}

export function getConnectionPolicy(): Promise<ConnectionPolicy> {
  return apiFetch<ConnectionPolicy>("/api/connection-policy");
}

export function updateConnectionPolicy(
  mode: ConnectionPolicyMode,
  csrfToken: string,
): Promise<ConnectionPolicy> {
  return apiFetch<ConnectionPolicy>(
    "/api/connection-policy",
    { method: "PUT", body: JSON.stringify({ mode }) },
    csrfToken,
  );
}
