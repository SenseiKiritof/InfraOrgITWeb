import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import type { FormValues } from "../../components/EntitySection";
import { EntitySection } from "../../components/EntitySection";
import { PageHeaderSlot } from "../../components/PageHeaderSlot";
import {
  type ApiToken,
  type ApiTokenCreated,
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from "../../lib/apiTokens";
import { formatDateTime } from "../../lib/format";
import { useI18n } from "../../lib/i18n";

export function ApiTokensPage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const csrf = session?.csrfToken ?? "";
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<ApiTokenCreated | null>(null);
  const [copied, setCopied] = useState(false);

  const tokens = useQuery({
    queryKey: ["api-tokens"],
    queryFn: listApiTokens,
  });

  const create = async (_row: ApiToken | null, values: FormValues) => {
    const result = await createApiToken(
      {
        name: values.name,
        scopes: values.scopes || "mcp:read",
        expiresInDays: values.expiresInDays
          ? Number(values.expiresInDays)
          : null,
      },
      csrf,
    );
    setCreated(result);
    setCopied(false);
    await queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
  };

  const revoke = async (row: ApiToken) => {
    await revokeApiToken(row.id, csrf);
    await queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
  };

  const copy = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.token);
    setCopied(true);
  };

  return (
    <section className="space-y-4">
      <PageHeaderSlot
        title={t("tokens.title")}
        description={t("tokens.description")}
      />
      {created && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p>{t("tokens.created")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="max-w-full break-all rounded bg-white px-2 py-1">
              {created.token}
            </code>
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm"
            >
              {copied ? t("tokens.copied") : t("tokens.copy")}
            </button>
          </div>
        </div>
      )}
      <EntitySection
        rows={tokens.data}
        columns={[
          { key: "name", label: t("common.name"), render: (row) => row.name },
          {
            key: "scopes",
            label: t("tokens.scopes"),
            render: (row) => row.scopes,
          },
          {
            key: "createdAt",
            label: t("tokens.createdAt"),
            render: (row) => formatDateTime(row.createdAt),
          },
          {
            key: "expiresAt",
            label: t("tokens.expiresAt"),
            render: (row) =>
              row.expiresAt ? formatDateTime(row.expiresAt) : t("tokens.never"),
          },
          {
            key: "lastUsedAt",
            label: t("tokens.lastUsedAt"),
            render: (row) =>
              row.lastUsedAt ? formatDateTime(row.lastUsedAt) : "—",
          },
          {
            key: "status",
            label: t("common.status"),
            render: (row) =>
              row.revokedAt ? t("tokens.revoked") : t("tokens.active"),
          },
        ]}
        fields={[
          { name: "name", label: t("common.name"), required: true },
          {
            name: "scopes",
            label: t("tokens.scopes"),
            type: "select",
            required: true,
            options: [
              { value: "mcp:read", label: t("tokens.scopeRead") },
              {
                value: "mcp:read mcp:operate",
                label: t("tokens.scopeOperate"),
              },
            ],
          },
          {
            name: "expiresInDays",
            label: t("tokens.expiry"),
            type: "select",
            options: [
              { value: "", label: t("tokens.never") },
              { value: "30", label: t("tokens.days", { count: 30 }) },
              { value: "90", label: t("tokens.days", { count: 90 }) },
              { value: "365", label: t("tokens.days", { count: 365 }) },
            ],
          },
        ]}
        empty={{ name: "", scopes: "mcp:read", expiresInDays: "90" }}
        toForm={() => ({})}
        canWrite
        canEditRow={() => false}
        canDeleteRow={() => false}
        onSave={create}
        rowActions={(row) =>
          row.revokedAt ? undefined : (
            <button
              type="button"
              onClick={() => void revoke(row)}
              className="text-sm text-red-700 underline"
            >
              {t("tokens.revoke")}
            </button>
          )
        }
        createLabel={t("tokens.create")}
      />
    </section>
  );
}
