import { useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import {
  type DatabaseEngine,
  databaseEngineLabels,
  queryPlaceholder,
} from "../../lib/databaseEngine";
import {
  type DatabaseQueryResult,
  runDatabaseQuery,
} from "../../lib/databaseQuery";
import { useI18n } from "../../lib/i18n";
import type { ServerApplication } from "../../lib/inventory";

export function DatabaseQueryModal({
  deployment,
  engine,
  applicationName,
  serverName,
  onClose,
}: {
  deployment: ServerApplication;
  engine: DatabaseEngine;
  applicationName: string;
  serverName: string;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [database, setDatabase] = useState("");
  const [result, setResult] = useState<DatabaseQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await runDatabaseQuery(
          deployment.id,
          query,
          database.trim(),
          session?.csrfToken ?? "",
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("dbQuery.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("dbQuery.dialogLabel", {
          engine: databaseEngineLabels[engine],
        })}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t("dbQuery.title", { engine: databaseEngineLabels[engine] })}
            </h2>
            <p className="mt-1 font-mono text-sm">
              {applicationName} · {serverName} · #{deployment.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            {t("common.close")}
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
            {t("dbQuery.readOnly")}
          </p>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              {engine === "Redis"
                ? t("dbQuery.redisDatabase")
                : t("dbQuery.database")}
            </span>
            <input
              value={database}
              onChange={(event) => setDatabase(event.target.value)}
              placeholder={
                engine === "Redis" ? "0" : t("dbQuery.databasePlaceholder")
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              {t("dbQuery.query")}
            </span>
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={queryPlaceholder(engine)}
              rows={engine === "MongoDb" ? 8 : 6}
              spellCheck={false}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
            />
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-md bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          {result && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                {t("dbQuery.exitCode", {
                  code: result.exitCode ?? "—",
                })}
                {result.timedOut && ` · ${t("dbQuery.timedOut")}`}
              </p>
              <pre className="max-h-72 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
                {result.output || t("dbQuery.empty")}
              </pre>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm"
          >
            {t("common.close")}
          </button>
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy || !query.trim()}
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? t("dbQuery.running") : t("dbQuery.run")}
          </button>
        </div>
      </section>
    </div>
  );
}
