import { apiFetch } from "./api";

export interface ServerUpdatePolicy {
  enabled: boolean;
  ltsOnly: boolean;
  updatedAt: string | null;
  updatedBy: string;
}

export function getServerUpdatePolicy(): Promise<ServerUpdatePolicy> {
  return apiFetch<ServerUpdatePolicy>("/api/server-update-policy");
}

export function updateServerUpdatePolicy(
  enabled: boolean,
  ltsOnly: boolean,
  csrfToken: string,
): Promise<ServerUpdatePolicy> {
  return apiFetch<ServerUpdatePolicy>(
    "/api/server-update-policy",
    { method: "PUT", body: JSON.stringify({ enabled, ltsOnly }) },
    csrfToken,
  );
}

export function updateServerOsPolicy(
  serverId: number,
  ltsOnly: boolean | null,
  csrfToken: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/servers/${serverId}/os-update-policy`,
    { method: "PUT", body: JSON.stringify({ ltsOnly }) },
    csrfToken,
  );
}
