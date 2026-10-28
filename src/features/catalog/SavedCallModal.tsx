import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "../../lib/api";
import { formatBytes, formatDateTime } from "../../lib/format";
import type {
  ApplicationApiCallDetail,
  ApplicationVersionApi,
} from "../../lib/inventory";
import { ApiCallModal } from "./ApiCallModal";

export function SavedCallModal({
  callId,
  applicationId,
  csrfToken,
  onClose,
}: {
  callId: number;
  applicationId: number;
  csrfToken: string;
  onClose: () => void;
}) {
  const call = useQuery({
    queryKey: ["api-calls", "detail", callId],
    queryFn: () =>
      apiFetch<ApplicationApiCallDetail>(`/api/api-calls/${callId}`),
  });
  const [repeatApi, setRepeatApi] = useState<ApplicationVersionApi | null>(
    null,
  );
  const [repeatError, setRepeatError] = useState<string | null>(null);

  const repeat = async () => {
    if (!call.data?.applicationVersionApiId) return;
    setRepeatError(null);
    try {
      setRepeatApi(
        await apiFetch<ApplicationVersionApi>(
          `/api/application-version-apis/${call.data.applicationVersionApiId}`,
        ),
      );
    } catch (cause) {
      setRepeatError(
        cause instanceof Error ? cause.message : "API non disponibile",
      );
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Chiamata salvata"
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Chiamata salvata
            </h2>
            <p className="mt-1 font-mono text-sm">
              {call.data?.method} {call.data?.url}
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

        {call.isLoading && (
          <p className="mt-4 text-sm text-slate-500">Caricamento…</p>
        )}
        {call.error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {call.error instanceof Error
              ? call.error.message
              : "Chiamata non disponibile"}
          </p>
        )}

        {call.data && (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm">
            <p className="text-slate-600">
              {formatDateTime(call.data.createdAt)} ·{" "}
              {call.data.environmentName} · {call.data.status ?? "—"} ·{" "}
              {call.data.durationMs} ms · {formatBytes(call.data.sizeBytes)}
            </p>
            {call.data.queryJson && (
              <Body title="Query" text={call.data.queryJson} />
            )}
            {call.data.requestBody && (
              <Body title="Body richiesta" text={call.data.requestBody} />
            )}
            <Body title="Risposta" text={call.data.responseBody ?? ""} />
            {call.data.binary && (
              <p className="text-xs text-slate-500">
                Risposta binaria, salvata come base64.
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void repeat()}
                disabled={!call.data.applicationVersionApiId}
                title={
                  call.data.applicationVersionApiId
                    ? "Ripeti con gli stessi parametri"
                    : "API non più disponibile"
                }
                className="rounded-md border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
              >
                Ripeti
              </button>
              {repeatError && (
                <span className="text-xs text-red-700">{repeatError}</span>
              )}
            </div>
            {call.data.truncated && (
              <p className="text-xs text-slate-500">
                Risposta salvata troncata: il body supera 1 MiB.
              </p>
            )}
          </div>
        )}
      </section>
      {repeatApi && call.data && (
        <ApiCallModal
          api={repeatApi}
          applicationId={applicationId}
          csrfToken={csrfToken}
          initialEnvironmentId={call.data.environmentId}
          initialQuery={parseQuery(call.data.queryJson)}
          initialBody={call.data.requestBody}
          onClose={() => setRepeatApi(null)}
        />
      )}
    </div>
  );
}

function parseQuery(value: string | null): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, item]) => [key, String(item)]),
    );
  } catch {
    return {};
  }
}

function Body({ title, text }: { title: string; text: string }) {
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2 font-mono text-xs">
        {text}
      </pre>
    </div>
  );
}
