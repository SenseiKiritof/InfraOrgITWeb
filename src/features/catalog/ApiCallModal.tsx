import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "../../lib/api";
import type {
  ApplicationApiCallResult,
  ApplicationApiQueryParam,
  ApplicationVersionApi,
  Paged,
} from "../../lib/inventory";

export function ApiCallModal({
  api,
  csrfToken,
  onClose,
}: {
  api: ApplicationVersionApi;
  csrfToken: string;
  onClose: () => void;
}) {
  const params = useQuery({
    queryKey: ["application-api-query-params", api.id],
    queryFn: () =>
      apiFetch<Paged<ApplicationApiQueryParam>>(
        `/api/application-version-apis/${api.id}/query-params?pageSize=200`,
      ),
  });

  const [values, setValues] = useState<Record<string, string>>({});
  const [body, setBody] = useState(api.body ?? "");
  const [result, setResult] = useState<ApplicationApiCallResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sendsBody = ["POST", "PUT", "PATCH"].includes(api.requestType);

  const send = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await apiFetch<ApplicationApiCallResult>(
          `/api/application-version-apis/${api.id}/call`,
          {
            method: "POST",
            body: JSON.stringify({
              query: values,
              body: sendsBody ? body : null,
            }),
          },
          csrfToken,
        ),
      );
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
                {result.reason} · {result.durationMs} ms
                {result.contentType ? ` · ${result.contentType}` : ""}
              </p>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-2 font-mono text-xs">
                {result.body}
              </pre>
              {result.truncated && (
                <p className="text-xs text-slate-500">
                  Risposta troncata a 20 000 caratteri.
                </p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
