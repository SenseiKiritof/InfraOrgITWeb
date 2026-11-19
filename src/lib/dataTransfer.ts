import { apiFetch } from "./api";

export interface CredentialRef {
  id: number;
  name: string;
  username: string;
  authType: string;
  owner: string;
}

export interface ImportPreview {
  token: string;
  canApply: boolean;
  existing: number;
  counts: number;
  warnings: string[];
  credentialRefs: CredentialRef[];
  expiresAt: string;
}

export interface ImportResult {
  imported: boolean;
  counts: number;
  backup: string | null;
  credentialRefs: CredentialRef[];
}

async function problem(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { detail?: string; title?: string };
    return new Error(body.detail || body.title || `HTTP ${response.status}`);
  } catch {
    return new Error(`HTTP ${response.status}`);
  }
}

export async function exportInventory(): Promise<{
  blob: Blob;
  fileName: string;
}> {
  const response = await fetch("/api/data/export", {
    credentials: "include",
  });
  if (!response.ok) throw await problem(response);
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return {
    blob: await response.blob(),
    fileName: match?.[1] || "infraorgit-inventory.json",
  };
}

export function previewInventoryImport(
  file: File,
  csrfToken: string,
): Promise<ImportPreview> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<ImportPreview>(
    "/api/data/import",
    { method: "POST", body: form },
    csrfToken,
  );
}

export function confirmInventoryImport(
  token: string,
  csrfToken: string,
): Promise<ImportResult> {
  return apiFetch<ImportResult>(
    "/api/data/import/confirm",
    {
      method: "POST",
      body: JSON.stringify({ token, mode: "replace" }),
    },
    csrfToken,
  );
}
