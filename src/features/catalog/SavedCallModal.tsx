import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api";
import { formatBytes, formatDateTime } from "../../lib/format";
import type { ApplicationApiCallDetail } from "../../lib/inventory";

export function SavedCallModal({
  callId,
  onClose,
}: {
  callId: number;
  onClose: () => void;
}) {
  const call = useQuery({
    queryKey: ["api-calls", "detail", callId],
    queryFn: () =>
      apiFetch<ApplicationApiCallDetail>(`/api/api-calls/${callId}`),
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Chiamata salvata"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
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
          <div className="mt-4 space-y-3 text-sm">
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
            {call.data.truncated && (
              <p className="text-xs text-slate-500">
                Risposta salvata troncata: il body supera 1 MiB.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
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
