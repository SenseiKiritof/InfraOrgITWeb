import { apiFetch } from "./api";
import type { DatabaseEngine } from "./databaseEngine";

export interface DatabaseQueryResult {
  engine: DatabaseEngine;
  exitCode: number | null;
  output: string;
  timedOut: boolean;
}

export function runDatabaseQuery(
  deploymentId: number,
  query: string,
  database: string,
  csrfToken: string,
): Promise<DatabaseQueryResult> {
  return apiFetch<DatabaseQueryResult>(
    `/api/server-applications/${deploymentId}/query`,
    {
      method: "POST",
      body: JSON.stringify({ query, database: database || null }),
    },
    csrfToken,
  );
}
