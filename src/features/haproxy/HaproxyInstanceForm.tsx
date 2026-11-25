import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import {
  createHaproxyCluster,
  getHaproxyClusters,
  type HaproxyInstance,
  refreshHaproxyInstance,
  testHaproxyInstance,
  updateHaproxySecrets,
  updateHaproxySettings,
} from "../../lib/haproxy";
import { useI18n } from "../../lib/i18n";

export function HaproxyInstanceForm({
  instance,
  canManageSecrets,
  onSaved,
}: {
  instance: HaproxyInstance;
  canManageSecrets: boolean;
  onSaved: () => void;
}) {
  const { session } = useAuth();
  const { t } = useI18n();
  const csrf = session?.csrfToken ?? "";
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState(instance.name);
  const [baseUrl, setBaseUrl] = useState(instance.baseUrl);
  const [transport, setTransport] = useState(instance.transport);
  const [clusterId, setClusterId] = useState(
    instance.clusterId ? String(instance.clusterId) : "",
  );
  const [apiHost, setApiHost] = useState(instance.apiHost);
  const [apiPort, setApiPort] = useState(String(instance.apiPort));
  const [apiVersion, setApiVersion] = useState(instance.apiVersion);
  const [username, setUsername] = useState(instance.username ?? "");
  const [statsUsername, setStatsUsername] = useState(
    instance.statsUsername ?? "",
  );
  const [statsBaseUrl, setStatsBaseUrl] = useState(instance.statsBaseUrl ?? "");
  const [caPem, setCaPem] = useState(instance.caPem ?? "");
  const [allowSelfSigned, setAllowSelfSigned] = useState(
    instance.allowSelfSigned,
  );
  const [password, setPassword] = useState("");
  const [statsPassword, setStatsPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [clearStatsPassword, setClearStatsPassword] = useState(false);
  const clusters = useQuery({
    queryKey: ["haproxy", "clusters"],
    queryFn: getHaproxyClusters,
  });

  const createCluster = async () => {
    const name = window.prompt(t("haproxy.clusterNamePrompt"));
    if (!name?.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const cluster = await createHaproxyCluster(
        instance.providerEnvironmentId,
        name.trim(),
        csrf,
      );
      await clusters.refetch();
      setClusterId(String(cluster.id));
      setMessage(t("haproxy.clusterCreated"));
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : t("haproxy.clusterCreateFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await updateHaproxySettings(
        instance.id,
        {
          name,
          baseUrl,
          transport,
          apiHost,
          apiPort: Number(apiPort) || 0,
          apiVersion,
          username,
          statsUsername,
          statsBaseUrl,
          caPem,
          allowSelfSigned,
          serverApplicationId: instance.serverApplicationId,
          clusterId: clusterId ? Number(clusterId) : null,
        },
        csrf,
      );
      if (
        canManageSecrets &&
        (password || statsPassword || clearPassword || clearStatsPassword)
      ) {
        await updateHaproxySecrets(
          instance.id,
          {
            password: password || undefined,
            statsPassword: statsPassword || undefined,
            clearPassword,
            clearStatsPassword,
          },
          csrf,
        );
        setPassword("");
        setStatsPassword("");
        setClearPassword(false);
        setClearStatsPassword(false);
      }
      onSaved();
      setMessage(t("haproxy.settingsSaved"));
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : t("haproxy.settingsFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await testHaproxyInstance(instance.id, csrf);
      setMessage(
        t("haproxy.testOk", {
          api: result.apiVersion,
          haproxy: result.haproxyVersion ?? "—",
          stats: result.statsRows,
        }),
      );
      onSaved();
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : t("haproxy.testFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await refreshHaproxyInstance(instance.id, csrf);
      setMessage(
        t("haproxy.refreshOk", {
          routes: result.routes,
          servers: result.servers,
        }),
      );
      onSaved();
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : t("haproxy.refreshFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium"
      >
        {t("haproxy.configure")}
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          {t("haproxy.name")}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          {t("haproxy.transport")}
          <select
            value={transport}
            onChange={(event) =>
              setTransport(event.target.value as typeof transport)
            }
            className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
          >
            <option value="SshForward">SshForward</option>
            <option value="Direct">Direct</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          {t("haproxy.cluster")}
          <span className="flex gap-1">
            <select
              value={clusterId}
              onChange={(event) => setClusterId(event.target.value)}
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
            >
              <option value="">{t("haproxy.noCluster")}</option>
              {(clusters.data ?? []).map((cluster) => (
                <option key={cluster.id} value={String(cluster.id)}>
                  {cluster.name} ({cluster.mode})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void createCluster()}
              disabled={busy}
              className="rounded border border-slate-300 px-2 py-1 text-xs"
            >
              +
            </button>
          </span>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          {t("haproxy.baseUrl")}
          <input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          {t("haproxy.apiVersion")}
          <select
            value={apiVersion}
            onChange={(event) => setApiVersion(event.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
          >
            <option value="auto">auto</option>
            <option value="v3">v3</option>
            <option value="v2">v2</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          {t("haproxy.apiHost")}
          <input
            value={apiHost}
            onChange={(event) => setApiHost(event.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          {t("haproxy.apiPort")}
          <input
            type="number"
            min={1}
            max={65535}
            value={apiPort}
            onChange={(event) => setApiPort(event.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          {t("haproxy.username")}
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
            autoComplete="off"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          {t("haproxy.statsUsername")}
          <input
            value={statsUsername}
            onChange={(event) => setStatsUsername(event.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
            autoComplete="off"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          {t("haproxy.statsBaseUrl")}
          <input
            value={statsBaseUrl}
            onChange={(event) => setStatsBaseUrl(event.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
            placeholder="https://host:8404"
            autoComplete="off"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs text-slate-500">
        {t("haproxy.caPem")}
        <textarea
          value={caPem}
          onChange={(event) => setCaPem(event.target.value)}
          rows={3}
          className="rounded border border-slate-300 px-2 py-1 font-mono text-xs text-slate-900"
          placeholder="-----BEGIN CERTIFICATE-----"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={allowSelfSigned}
          onChange={(event) => setAllowSelfSigned(event.target.checked)}
        />
        {t("haproxy.allowSelfSigned")}
      </label>

      {canManageSecrets && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            {t("haproxy.password")}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
              autoComplete="new-password"
              placeholder={instance.hasCredentials ? "********" : ""}
            />
            <span className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={clearPassword}
                onChange={(event) => setClearPassword(event.target.checked)}
              />
              {t("haproxy.clearPassword")}
            </span>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            {t("haproxy.statsPassword")}
            <input
              type="password"
              value={statsPassword}
              onChange={(event) => setStatsPassword(event.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
              autoComplete="new-password"
            />
            <span className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={clearStatsPassword}
                onChange={(event) =>
                  setClearStatsPassword(event.target.checked)
                }
              />
              {t("haproxy.clearStatsPassword")}
            </span>
          </label>
        </div>
      )}
      {!canManageSecrets && (
        <p className="text-xs text-slate-500">
          {t("haproxy.secretsSystemAdmin")}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {t("common.save")}
        </button>
        <button
          type="button"
          onClick={() => void test()}
          disabled={busy}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium"
        >
          {t("haproxy.test")}
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium"
        >
          {t("haproxy.refresh")}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium"
        >
          {t("common.close")}
        </button>
      </div>
      {message && <p className="text-xs text-slate-600">{message}</p>}
    </div>
  );
}
