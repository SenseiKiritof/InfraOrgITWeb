import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
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
import { includesText } from "../../lib/filter";
import { formatDateTime } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { useIsSystemAdmin } from "../../lib/useServerAccess";

export function ApiTokensPage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const csrf = session?.csrfToken ?? "";
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<ApiTokenCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = useIsSystemAdmin();

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
    setError(null);
    try {
      await revokeApiToken(row.id, csrf);
      await queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t("common.operationError"),
      );
    }
  };

  const status = (row: ApiToken) =>
    row.revokedAt
      ? t("tokens.revoked")
      : row.expiresAt && new Date(row.expiresAt) < new Date()
        ? t("tokens.expired")
        : t("tokens.active");

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
        actions={
          <Link
            to="/approvals"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {t("mcpAgents.title")}
          </Link>
        }
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
      {error && (
        <p
          role="alert"
          className="rounded bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <EntitySection
        rows={tokens.data}
        columns={[
          {
            key: "name",
            label: t("common.name"),
            render: (row) => row.name,
            filter: (row, value) => includesText(row.name, value),
          },
          ...(isAdmin
            ? [
                {
                  key: "username",
                  label: t("common.user"),
                  render: (row: ApiToken) => row.username,
                  filter: (row: ApiToken, value: string) =>
                    includesText(row.username, value),
                },
              ]
            : []),
          {
            key: "scopes",
            label: t("tokens.scopes"),
            render: (row) => row.scopes,
            filter: (row, value) => includesText(row.scopes, value),
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
            render: status,
            filter: (row, value) => includesText(status(row), value),
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
              {
                value: "tunnels:operate",
                label: t("tokens.scopeTunnel"),
              },
              {
                value: "mcp:read mcp:operate tunnels:operate",
                label: t("tokens.scopeAll"),
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
