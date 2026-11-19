import { useRef, useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import {
  confirmInventoryImport,
  exportInventory,
  type ImportPreview,
  type ImportResult,
  previewInventoryImport,
} from "../../lib/dataTransfer";
import { useI18n } from "../../lib/i18n";

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export function DataTransferSection() {
  const { session } = useAuth();
  const { t } = useI18n();
  const csrf = session?.csrfToken ?? "";
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"export" | "preview" | "confirm" | null>(
    null,
  );
  const [exportPending, setExportPending] = useState(false);

  const download = async () => {
    setExportPending(false);
    setBusy("export");
    setError(null);
    try {
      const exported = await exportInventory();
      const url = URL.createObjectURL(exported.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = exported.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t("dataTransfer.error"),
      );
    } finally {
      setBusy(null);
    }
  };

  const chooseFile = async (file: File | undefined) => {
    setResult(null);
    setError(null);
    setPreview(null);
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setError(t("dataTransfer.tooLarge"));
      return;
    }
    setBusy("preview");
    try {
      setPreview(await previewInventoryImport(file, csrf));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t("dataTransfer.error"),
      );
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy("confirm");
    setError(null);
    try {
      setResult(await confirmInventoryImport(preview.token, csrf));
      setPreview(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t("dataTransfer.error"),
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          {t("dataTransfer.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {t("dataTransfer.description")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setExportPending(true)}
          disabled={busy !== null}
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "export"
            ? t("dataTransfer.exporting")
            : t("dataTransfer.export")}
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy !== null}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "preview"
            ? t("dataTransfer.reading")
            : t("dataTransfer.import")}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) =>
            void chooseFile(event.target.files?.[0] ?? undefined)
          }
        />
      </div>

      <p className="text-xs text-slate-500">{t("dataTransfer.importHint")}</p>
      <p className="text-xs text-slate-500">
        {t("dataTransfer.integrityHint")}
      </p>

      {exportPending && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>{t("dataTransfer.exportWarning")}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void download()}
              disabled={busy !== null}
              className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("dataTransfer.exportConfirm")}
            </button>
            <button
              type="button"
              onClick={() => setExportPending(false)}
              disabled={busy !== null}
              className="rounded-md border border-amber-400 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
            >
              {t("dataTransfer.exportCancel")}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {preview && (
        <div className="space-y-3 rounded-md border border-slate-200 p-3 text-sm">
          <p className="font-medium text-slate-900">
            {t("dataTransfer.preview")}
          </p>
          <p className="text-slate-600">
            {t("dataTransfer.counts", { count: preview.counts })} ·{" "}
            {t("dataTransfer.existing", { count: preview.existing })}
          </p>
          {preview.warnings.length > 0 && (
            <div>
              <p className="font-medium text-amber-800">
                {t("dataTransfer.warnings")}
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-amber-800">
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          {preview.credentialRefs.length > 0 && (
            <p className="text-slate-600">
              {t("dataTransfer.credentials", {
                count: preview.credentialRefs.length,
              })}
            </p>
          )}
          {!preview.canApply && (
            <p className="rounded-md bg-amber-50 p-3 text-amber-800">
              {t("dataTransfer.cannotApply")}
            </p>
          )}
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy !== null || !preview.canApply}
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "confirm"
              ? t("dataTransfer.importing")
              : t("dataTransfer.confirm")}
          </button>
          <p className="text-xs text-slate-500">
            {t("dataTransfer.confirmHint")}
          </p>
        </div>
      )}

      {result && (
        <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
          <p>{t("dataTransfer.imported", { count: result.counts })}</p>
          {result.backup && (
            <p className="mt-1 break-all text-xs">
              {t("dataTransfer.backup", { path: result.backup })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
