import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { PageHeaderSlot } from "../../components/PageHeaderSlot";
import type { ConnectionPolicyMode } from "../../lib/connectionPolicy";
import {
  getConnectionPolicy,
  updateConnectionPolicy,
} from "../../lib/connectionPolicy";
import { useI18n } from "../../lib/i18n";

const MODES: ConnectionPolicyMode[] = ["Server", "Client", "Auto"];

export function ConnectionPolicyPage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const csrf = session?.csrfToken ?? "";
  const queryClient = useQueryClient();

  const policy = useQuery({
    queryKey: ["connection-policy"],
    queryFn: getConnectionPolicy,
  });
  const [mode, setMode] = useState<ConnectionPolicyMode>("Auto");

  useEffect(() => {
    if (policy.data) setMode(policy.data.mode);
  }, [policy.data]);

  const save = useMutation({
    mutationFn: () => updateConnectionPolicy(mode, csrf),
    onSuccess: (data) => {
      queryClient.setQueryData(["connection-policy"], data);
    },
  });

  const label = (value: ConnectionPolicyMode) =>
    value === "Server"
      ? t("connectionPolicy.server")
      : value === "Client"
        ? t("connectionPolicy.client")
        : t("connectionPolicy.auto");

  const hint = (value: ConnectionPolicyMode) =>
    value === "Server"
      ? t("connectionPolicy.serverHint")
      : value === "Client"
        ? t("connectionPolicy.clientHint")
        : t("connectionPolicy.autoHint");

  return (
    <section className="space-y-4">
      <PageHeaderSlot
        title={t("connectionPolicy.title")}
        description={t("connectionPolicy.description")}
      />

      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        {t("connectionPolicy.cluster")}
      </div>

      <div className="space-y-3">
        {MODES.map((value) => (
          <label
            key={value}
            className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition ${
              mode === value
                ? "border-teal-600 bg-teal-50/60"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <input
              type="radio"
              name="connection-policy"
              value={value}
              checked={mode === value}
              onChange={() => {
                setMode(value);
                save.reset();
              }}
              className="mt-1"
            />
            <span className="space-y-1">
              <span className="block font-medium text-slate-900">
                {label(value)}
                {value === "Auto" && (
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">
                    {t("connectionPolicy.default")}
                  </span>
                )}
              </span>
              <span className="block text-sm text-slate-600">
                {hint(value)}
              </span>
            </span>
          </label>
        ))}
      </div>

      {mode === "Server" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {t("connectionPolicy.serverWarning")}
        </p>
      )}
      {mode === "Client" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {t("connectionPolicy.clientWarning")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={
            save.isPending ||
            policy.isLoading ||
            !policy.data ||
            mode === policy.data.mode
          }
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("connectionPolicy.save")}
        </button>
        {save.isSuccess && (
          <span className="text-sm text-teal-700">
            {t("connectionPolicy.saved")}
          </span>
        )}
        {save.error && (
          <span className="text-sm text-red-700">{String(save.error)}</span>
        )}
      </div>

      {policy.data?.updatedAt && (
        <p className="text-xs text-slate-500">
          {t("connectionPolicy.updatedBy", {
            user: policy.data.updatedBy || "—",
            date: new Date(policy.data.updatedAt).toLocaleString(),
          })}
        </p>
      )}
    </section>
  );
}
