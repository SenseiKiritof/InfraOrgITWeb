import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { useI18n } from "../../lib/i18n";
import {
  getServerUpdatePolicy,
  updateServerUpdatePolicy,
} from "../../lib/serverUpdatePolicy";

export function ServerUpdateSection() {
  const { session } = useAuth();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const policy = useQuery({
    queryKey: ["server-update-policy"],
    queryFn: getServerUpdatePolicy,
  });
  const [enabled, setEnabled] = useState(true);
  const [ltsOnly, setLtsOnly] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!policy.data) return;
    setEnabled(policy.data.enabled);
    setLtsOnly(policy.data.ltsOnly);
  }, [policy.data]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const next = await updateServerUpdatePolicy(
        enabled,
        ltsOnly,
        session?.csrfToken ?? "",
      );
      queryClient.setQueryData(["server-update-policy"], next);
      setMessage(t("serverUpdate.saved"));
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : t("common.saveError"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          {t("serverUpdate.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {t("serverUpdate.description")}
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span>{t("serverUpdate.enabled")}</span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={ltsOnly}
          onChange={(event) => setLtsOnly(event.target.checked)}
        />
        <span>{t("serverUpdate.ltsOnly")}</span>
      </label>
      <p className="text-xs text-slate-500">{t("serverUpdate.ltsHint")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !policy.data}
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? t("serverUpdate.saving") : t("serverUpdate.save")}
        </button>
        {message && <span className="text-sm text-slate-600">{message}</span>}
      </div>
    </section>
  );
}
