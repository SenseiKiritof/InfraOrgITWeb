import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AutocompleteSelect } from "../../components/AutocompleteSelect";
import { apiFetch } from "../../lib/api";
import { formatBytes } from "../../lib/format";
import type {
  ApplicationApiCallResult,
  ApplicationApiQueryParam,
  ApplicationEnvironment,
  ApplicationVersionApi,
  Paged,
} from "../../lib/inventory";

export function ApiCallModal({
  api,
  applicationId,
  csrfToken,
  onClose,
  initialEnvironmentId,
  initialQuery,
  initialBody,
}: {
  api: ApplicationVersionApi;
  applicationId: number;
  csrfToken: string;
  onClose: () => void;
  initialEnvironmentId?: number;
  initialQuery?: Record<string, string>;
  initialBody?: string | null;
}) {
  const queryClient = useQueryClient();
  const params = useQuery({
    queryKey: ["application-api-query-params", api.id],
    queryFn: () =>
      apiFetch<Paged<ApplicationApiQueryParam>>(
        `/api/application-version-apis/${api.id}/query-params?pageSize=200`,
      ),
  });
  const environments = useQuery({
    queryKey: ["application-environments", applicationId],
    queryFn: () =>
      apiFetch<ApplicationEnvironment[]>(
        `/api/applications/${applicationId}/environments`,
      ),
  });

  const [values, setValues] = useState<Record<string, string>>(
    initialQuery ?? {},
  );
  const [body, setBody] = useState(initialBody ?? api.body ?? "");
  const [environment, setEnvironment] = useState(
    initialEnvironmentId ? String(initialEnvironmentId) : "",
  );
  const [save, setSave] = useState(false);
  const [result, setResult] = useState<ApplicationApiCallResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const sendsBody = ["POST", "PUT", "PATCH"].includes(api.requestType);
  const environmentId = environment;
  const defaulted = useRef(initialEnvironmentId !== undefined);
  useEffect(() => {
    if (defaulted.current || !environments.data) return;
    defaulted.current = true;
    const first = environments.data.find((item) => item.hostname);
    if (first) setEnvironment(String(first.environmentId));
  }, [environments.data]);

  const send = async () => {
    if (!environmentId) {
      setError("Seleziona un ambiente.");
      return;
    }
    setBusy(true);
    setError(null);
    setCopied(false);
    setResult(null);
    try {
      setResult(
        await apiFetch<ApplicationApiCallResult>(
          `/api/application-version-apis/${api.id}/call`,
          {
            method: "POST",
            body: JSON.stringify({
              environmentId: Number(environmentId),
              query: values,
              body: sendsBody ? body : null,
              save,
            }),
          },
          csrfToken,
        ),
      );
      await queryClient.invalidateQueries({ queryKey: ["api-calls"] });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Chiamata non riuscita",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Chiamata ${api.requestType} ${api.url}`}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Chiama API
            </h2>
            <p className="mt-1 font-mono text-sm">
              {api.requestType} {api.url}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            Chiudi
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label
            htmlFor="api-call-environment"
            className="block space-y-1 text-sm"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Ambiente
            </span>
            <AutocompleteSelect
              id="api-call-environment"
              value={environmentId}
              options={(environments.data ?? []).map((item) => ({
                value: String(item.environmentId),
                label: item.name,
              }))}
              onChange={setEnvironment}
            />
          </label>

          {params.data?.items.length ? (
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Query param
              </legend>
              {params.data.items.map((param) => (
                <label
                  key={param.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className="w-48 shrink-0 font-mono text-xs">
                    {param.name}
                  </span>
                  <input
                    value={values[param.name] ?? ""}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [param.name]: event.target.value,
                      }))
                    }
                    placeholder={param.paramType}
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </label>
              ))}
            </fieldset>
          ) : null}

          {sendsBody && (
            <label className="block space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Body JSON
              </span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={6}
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
              />
            </label>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={save}
              onChange={(event) => setSave(event.target.checked)}
            />
            Salva la chiamata
          </label>

          <button
            type="button"
            onClick={() => void send()}
            disabled={busy}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Chiamata…" : "Chiama"}
          </button>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}

          {result && (
            <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <p>
                <span className="font-semibold">{result.status}</span>{" "}
                {result.reason} · {result.durationMs} ms ·{" "}
                {formatBytes(result.sizeBytes)}
                {result.contentType ? ` · ${result.contentType}` : ""}
              </p>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-2 font-mono text-xs">
                {result.body}
              </pre>
              {result.truncated && (
                <p className="text-xs text-slate-500">
                  Risposta troncata: il body supera 10 MiB.
                </p>
              )}
              {result.binary && (
                <p className="text-xs text-slate-500">
                  Risposta binaria: usa Scarica per il file originale.
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyResult(result, setCopied, setError)}
                  disabled={result.binary}
                  className="rounded-md border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
                >
                  Copia
                </button>
                <button
                  type="button"
                  onClick={() => download(result)}
                  className="rounded-md border border-slate-300 px-3 py-1 text-sm"
                >
                  Scarica
                </button>
                {copied && (
                  <span className="text-xs text-slate-500">Copiato</span>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

async function copyResult(
  result: ApplicationApiCallResult,
  onCopied: (value: boolean) => void,
  onError: (message: string) => void,
): Promise<void> {
  try {
    await navigator.clipboard.writeText(result.body);
    onCopied(true);
  } catch {
    onError("Copia non riuscita: clipboard non disponibile.");
  }
}

function download(result: ApplicationApiCallResult): void {
  const extension = result.binary
    ? extensionFor(result.contentType)
    : result.contentType.includes("json")
      ? "json"
      : "txt";
  const content = result.binary ? base64Bytes(result.body) : result.body;
  const blob = new Blob([content], {
    type: result.contentType || "text/plain",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `api-call-${result.callId ?? "nuova"}.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function base64Bytes(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes.buffer as ArrayBuffer;
}

function extensionFor(contentType: string): string {
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "application/zip": "zip",
  };
  return map[contentType.split(";")[0]?.trim() ?? ""] ?? "bin";
}
