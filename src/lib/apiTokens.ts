import { apiFetch } from "./api";

export interface ApiToken {
  id: number;
  name: string;
  scopes: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ApiTokenCreated extends ApiToken {
  token: string;
}

export function listApiTokens(): Promise<ApiToken[]> {
  return apiFetch<ApiToken[]>("/api/api-tokens");
}

export function createApiToken(
  body: { name: string; scopes: string; expiresInDays: number | null },
  csrfToken: string,
): Promise<ApiTokenCreated> {
  return apiFetch<ApiTokenCreated>(
    "/api/api-tokens",
    { method: "POST", body: JSON.stringify(body) },
    csrfToken,
  );
}

export function revokeApiToken(id: number, csrfToken: string): Promise<void> {
  return apiFetch<void>(
    `/api/api-tokens/${id}`,
    { method: "DELETE" },
    csrfToken,
  );
}
