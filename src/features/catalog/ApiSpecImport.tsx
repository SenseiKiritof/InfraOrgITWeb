import { useState } from "react";
import { apiFetch } from "../../lib/api";
import type {
  ApplicationApiKey,
  ApplicationVersionApi,
} from "../../lib/inventory";
import { type ParsedSpec, parseApiSpec } from "../../lib/openapi";

export function ApiSpecImport({
  versionId,
  applicationId,
  csrfToken,
  onImported,
}: {
  versionId: number;
  applicationId: number;
  csrfToken: string;
  onImported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [spec, setSpec] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setSpec(await file.text());
    setFileName(file.name);
    setParsed(null);
    setError(null);
    setMessage(null);
  };

  const analyze = () => {
    setError(null);
    setMessage(null);
    try {
      setParsed(parseApiSpec(spec));
    } catch (cause) {
      setParsed(null);
      setError(
        cause instanceof Error ? cause.message : "Documento non valido.",
      );
    }
  };

  const importAll = async () => {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    let done = 0;
    let keys = 0;
    try {
      for (const api of parsed.apis) {
        const created = await apiFetch<ApplicationVersionApi>(
          `/api/application-versions/${versionId}/apis`,
          {
            method: "POST",
            body: JSON.stringify({
              applicationVersionId: versionId,
              url: api.url,
              requestType: api.method,
              description: api.description,
              body: api.body,
            }),
          },
          csrfToken,
        );
        for (const param of api.queryParams) {
          await apiFetch(
            `/api/application-version-apis/${created.id}/query-params`,
            {
              method: "POST",
              body: JSON.stringify({
                applicationApiId: created.id,
                name: param.name,
                paramType: param.paramType,
              }),
            },
            csrfToken,
          );
        }
        done += 1;
      }

      // API key definitions from the security schemes; the secret is filled later.
      const existing = await apiFetch<ApplicationApiKey[]>(
        `/api/applications/${applicationId}/api-keys`,
      );
      const missing = parsed.apiKeys.filter(
        (key) =>
          !existing.some(
            (item) => item.name === key.name && item.location === key.location,
          ),
      );
      for (const key of missing) {
        await apiFetch(
          `/api/applications/${applicationId}/api-keys`,
          {
            method: "POST",
            body: JSON.stringify({
              name: key.name,
              location: key.location,
              value: null,
              environmentId: null,
            }),
          },
          csrfToken,
        );
        keys += 1;
      }

      setParsed(null);
      setSpec("");
      setMessage(`Importate ${done} API e ${keys} API key.`);
      onImported();
    } catch (cause) {
      if (done > 0) onImported();
      setError(
        `${done} API importate, poi errore: ${
          cause instanceof Error ? cause.message : "importazione interrotta"
        }`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Importa specifica
          </h3>
          <p className="text-xs text-slate-500">
            OpenAPI 3.x o Swagger 2.0 in JSON o YAML.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((value) => !value);
            setError(null);
            setMessage(null);
          }}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          {open ? "Chiudi" : "Apri"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-slate-500">
            Incolla il testo nel riquadro oppure trascina un file JSON/YAML sul
            riquadro.
          </p>
          <textarea
            aria-label="Documento OpenAPI o Swagger"
            value={spec}
            onChange={(event) => {
              setSpec(event.target.value);
              setFileName(null);
              setParsed(null);
              setError(null);
              setMessage(null);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void loadFile(event.dataTransfer.files[0]);
            }}
            rows={8}
            placeholder='{"openapi":"3.0.3", ...} oppure yaml'
            className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
              Carica file
              <input
                type="file"
                accept=".json,.yaml,.yml,application/json"
                className="sr-only"
                onChange={(event) => {
                  void loadFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            {fileName && (
              <span className="text-xs text-slate-500">File: {fileName}</span>
            )}
            <button
              type="button"
              onClick={analyze}
              disabled={busy || !spec.trim()}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Analizza
            </button>
            {parsed && (
              <button
                type="button"
                onClick={() => void importAll()}
                disabled={busy}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy
                  ? "Importazione…"
                  : `Importa ${parsed.apis.length} API e ${parsed.apiKeys.length} API key`}
              </button>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="text-sm text-emerald-800">
              {message}
            </p>
          )}

          {parsed && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-2 text-xs">
              {parsed.apiKeys.map((key) => (
                <li
                  key={`${key.location}:${key.name}`}
                  className="flex flex-wrap items-baseline gap-2"
                >
                  <span className="rounded bg-amber-600 px-1.5 py-0.5 font-mono text-[10px] text-white">
                    API KEY
                  </span>
                  <span className="font-mono">{key.name}</span>
                  <span className="text-slate-500">
                    {key.location === "Header" ? "header" : "query"}
                  </span>
                </li>
              ))}
              {parsed.apis.map((api) => (
                <li
                  key={`${api.method}:${api.url}`}
                  className="flex flex-wrap items-baseline gap-2"
                >
                  <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
                    {api.method}
                  </span>
                  <span className="font-mono">{api.url}</span>
                  <span className="text-slate-500">
                    {api.queryParams.length} query param
                  </span>
                  {api.description && (
                    <span className="text-slate-500">{api.description}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
