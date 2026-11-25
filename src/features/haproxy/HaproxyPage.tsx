import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import { PageHeaderSlot } from "../../components/PageHeaderSlot";
import { formatDateTime } from "../../lib/format";
import {
  deleteHaproxyCertificate,
  getHaproxyCertificates,
  getHaproxyInstances,
  getHaproxyLive,
  getHaproxyMetrics,
  getHaproxyProtocol,
  getHaproxyRoutes,
  getHaproxyServers,
  type HaproxyMetricPoint,
  replaceHaproxyCertificate,
  uploadHaproxyCertificate,
} from "../../lib/haproxy";
import { useI18n } from "../../lib/i18n";

export function HaproxyPage() {
  const { t, language } = useI18n();
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<
    "overview" | "routes" | "servers" | "certificates" | "protocol"
  >("overview");
  const [range, setRange] = useState(60);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const instances = useQuery({
    queryKey: ["haproxy", "instances"],
    queryFn: () => getHaproxyInstances(),
    refetchInterval: 30_000,
  });
  const selected =
    instances.data?.find((item) => item.id === selectedId) ??
    instances.data?.[0];
  const routes = useQuery({
    queryKey: ["haproxy", "routes", selected?.id],
    queryFn: () => getHaproxyRoutes(selected?.id ?? 0),
    enabled: selected !== undefined,
  });
  const servers = useQuery({
    queryKey: ["haproxy", "servers", selected?.id],
    queryFn: () => getHaproxyServers(selected?.id ?? 0),
    enabled: selected !== undefined,
  });
  const live = useQuery({
    queryKey: ["haproxy", "live", selected?.id],
    queryFn: () => getHaproxyLive(selected?.id ?? 0),
    enabled: selected !== undefined,
    refetchInterval: 5000,
  });
  const metrics = useQuery({
    queryKey: ["haproxy", "metrics", selected?.id, range],
    queryFn: () => getHaproxyMetrics(selected?.id ?? 0, range),
    enabled: selected !== undefined,
  });
  const certificates = useQuery({
    queryKey: ["haproxy", "certificates", selected?.id],
    queryFn: () => getHaproxyCertificates(selected?.id ?? 0),
    enabled: selected !== undefined && tab === "certificates",
  });
  const protocol = useQuery({
    queryKey: ["haproxy", "protocol", selected?.id],
    queryFn: () => getHaproxyProtocol(selected?.id ?? 0),
    enabled: selected !== undefined && tab === "protocol",
    refetchInterval: 30_000,
  });

  const uploadCertificate = async (file: File | undefined) => {
    if (!file || !selected) return;
    setBusy(true);
    setMessage(null);
    try {
      await uploadHaproxyCertificate(selected.id, file, csrf);
      await certificates.refetch();
      setMessage(t("haproxy.certificateUploaded"));
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : t("haproxy.certificateFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const replaceCertificate = async (name: string, file: File | undefined) => {
    if (!file || !selected) return;
    setBusy(true);
    setMessage(null);
    try {
      await replaceHaproxyCertificate(selected.id, name, file, csrf);
      await certificates.refetch();
      setMessage(t("haproxy.certificateUploaded"));
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : t("haproxy.certificateFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const removeCertificate = async (name: string) => {
    if (
      !selected ||
      !window.confirm(t("haproxy.certificateDeleteConfirm", { name }))
    )
      return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteHaproxyCertificate(selected.id, name, csrf);
      await certificates.refetch();
      setMessage(t("haproxy.certificateDeleted"));
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : t("haproxy.certificateFailed"),
      );
    } finally {
      setBusy(false);
    }
  };
  const frontends =
    live.data?.series.filter((item) => item.kind === "frontend") ?? [];
  const liveReq = frontends.reduce((sum, item) => sum + item.reqRate, 0);
  const liveSessions = frontends.reduce((sum, item) => sum + item.scur, 0);
  const query = filter.trim().toLocaleLowerCase();
  const routeRows = (routes.data ?? []).filter((row) =>
    `${row.host} ${row.path} ${row.frontend} ${row.backend}`
      .toLocaleLowerCase()
      .includes(query),
  );
  const serverRows = (servers.data ?? []).filter((row) =>
    `${row.backend} ${row.server} ${row.address} ${row.status}`
      .toLocaleLowerCase()
      .includes(query),
  );

  return (
    <section className="space-y-4">
      <PageHeaderSlot
        title={t("haproxy.pageTitle")}
        description={t("haproxy.pageDescription")}
      />

      {instances.isLoading && (
        <p className="text-sm text-slate-500">{t("common.loading")}</p>
      )}
      {!instances.isLoading && (instances.data?.length ?? 0) === 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
          {t("haproxy.pageEmpty")}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {(instances.data ?? []).map((instance) => (
          <button
            key={instance.id}
            type="button"
            onClick={() => setSelectedId(instance.id)}
            className={`rounded-lg border p-3 text-left text-sm ${
              selected?.id === instance.id
                ? "border-emerald-400 bg-emerald-50"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold">{instance.name}</span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {instance.effectiveApiVersion ?? instance.apiVersion}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">
              {instance.serverName} · {instance.environmentLabel}
            </p>
            <p className="mt-2 text-xs text-slate-600">
              {t("haproxy.routes")}: {instance.routeCount} ·{" "}
              {t("haproxy.servers")}: {instance.serverCount}
            </p>
          </button>
        ))}
      </div>

      {selected && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">{selected.name}</h2>
              <p className="text-xs text-slate-500">
                {selected.detectedVersion ?? "—"} ·{" "}
                {selected.lastRefreshAt
                  ? formatDateTime(selected.lastRefreshAt, language)
                  : "—"}
              </p>
            </div>
            <Link
              to={`/servers/${selected.serverId}`}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium"
            >
              {t("haproxy.openServer")}
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-slate-300 p-0.5">
              <button
                type="button"
                onClick={() => setTab("overview")}
                className={`rounded px-3 py-1 text-xs ${tab === "overview" ? "bg-slate-900 text-white" : ""}`}
              >
                {t("haproxy.overview")}
              </button>
              <button
                type="button"
                onClick={() => setTab("routes")}
                className={`rounded px-3 py-1 text-xs ${tab === "routes" ? "bg-slate-900 text-white" : ""}`}
              >
                {t("haproxy.routes")}
              </button>
              <button
                type="button"
                onClick={() => setTab("servers")}
                className={`rounded px-3 py-1 text-xs ${tab === "servers" ? "bg-slate-900 text-white" : ""}`}
              >
                {t("haproxy.servers")}
              </button>
              <button
                type="button"
                onClick={() => setTab("certificates")}
                className={`rounded px-3 py-1 text-xs ${tab === "certificates" ? "bg-slate-900 text-white" : ""}`}
              >
                {t("haproxy.certificates")}
              </button>
              <button
                type="button"
                onClick={() => setTab("protocol")}
                className={`rounded px-3 py-1 text-xs ${tab === "protocol" ? "bg-slate-900 text-white" : ""}`}
              >
                {t("haproxy.protocol")}
              </button>
            </div>
            {(tab === "routes" || tab === "servers") && (
              <>
                <input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder={t("haproxy.filter")}
                  className="min-w-48 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                />
                <span className="text-xs text-slate-500">
                  {tab === "routes" ? routeRows.length : serverRows.length}
                </span>
              </>
            )}
          </div>

          {tab === "overview" ? (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi
                  label={t("haproxy.requestsPerMinute")}
                  value={String(Math.round(liveReq))}
                />
                <Kpi
                  label={t("haproxy.sessions")}
                  value={String(liveSessions)}
                />
                <Kpi
                  label={t("haproxy.errors5xx")}
                  value={String(metrics.data?.at(-1)?.h5xx ?? 0)}
                />
                <Kpi
                  label={t("haproxy.currentConnections")}
                  value={String(live.data?.process?.currConns ?? 0)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  [60, t("haproxy.range1h")],
                  [360, t("haproxy.range6h")],
                  [1440, t("haproxy.range24h")],
                  [10080, t("haproxy.range7d")],
                  [43200, t("haproxy.range30d")],
                  [129600, t("haproxy.range90d")],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRange(Number(value))}
                    className={`rounded border px-2 py-0.5 text-xs ${
                      range === Number(value)
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <span className="text-xs text-slate-500">
                  {t("haproxy.liveAt", {
                    date: live.data?.at
                      ? formatDateTime(live.data.at, language)
                      : "—",
                  })}
                </span>
                <span className="text-xs text-slate-500">
                  {t("haproxy.uptime", {
                    value: live.data?.process?.uptime ?? 0,
                  })}
                </span>
              </div>
              <MetricChart points={metrics.data ?? []} />
              {live.data && live.data.series.length > 0 && (
                <p className="text-xs text-slate-500">
                  {t("haproxy.liveSeries", {
                    count: live.data.series.length,
                  })}
                </p>
              )}
            </div>
          ) : tab === "protocol" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="px-2 py-1">{t("haproxy.frontend")}</th>
                    <th className="px-2 py-1">H2 req/sess</th>
                    <th className="px-2 py-1">H3 req/sess</th>
                    <th className="px-2 py-1">QUIC handshake/drop/lost</th>
                    <th className="px-2 py-1">H3/QUIC errors</th>
                    <th className="px-2 py-1">QPACK</th>
                    <th className="px-2 py-1">TLS</th>
                  </tr>
                </thead>
                <tbody>
                  {(protocol.data ?? []).map((row) => (
                    <tr key={row.proxy} className="border-b border-slate-100">
                      <td className="px-2 py-1 font-mono">{row.proxy}</td>
                      <td className="px-2 py-1 tabular-nums">
                        {row.h2Req} / {row.h2Sess}
                      </td>
                      <td className="px-2 py-1 tabular-nums">
                        {row.h3Req} / {row.h3Sess}
                      </td>
                      <td className="px-2 py-1 tabular-nums">
                        {row.quicHandshakeFail} / {row.quicDroppedPkt} /{" "}
                        {row.quicLostPkt}
                      </td>
                      <td className="px-2 py-1 tabular-nums">
                        {row.h3ProtocolErrors} / {row.quicTransportErrors}
                      </td>
                      <td className="px-2 py-1 tabular-nums">
                        {row.qpackEncoderErrors} / {row.qpackDecoderErrors}
                      </td>
                      <td className="px-2 py-1 tabular-nums">
                        {row.sslFailedHandshake}
                      </td>
                    </tr>
                  ))}
                  {(protocol.data ?? []).length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-2 py-4 text-center text-slate-500"
                      >
                        {t("haproxy.noProtocolData")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : tab === "certificates" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium">
                  {t("haproxy.uploadCertificate")}
                  <input
                    type="file"
                    accept=".pem,.crt,.key"
                    className="hidden"
                    disabled={busy}
                    onChange={(event) => {
                      void uploadCertificate(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
                {message && (
                  <span className="text-xs text-slate-600">{message}</span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="px-2 py-1">
                        {t("haproxy.certificateName")}
                      </th>
                      <th className="px-2 py-1">{t("haproxy.domains")}</th>
                      <th className="px-2 py-1">{t("haproxy.issuer")}</th>
                      <th className="px-2 py-1">{t("haproxy.expires")}</th>
                      <th className="px-2 py-1">{t("haproxy.size")}</th>
                      <th className="px-2 py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {(certificates.data ?? []).map((certificate) => {
                      const expired =
                        certificate.notAfter !== null &&
                        new Date(certificate.notAfter) < new Date();
                      return (
                        <tr
                          key={certificate.id}
                          className="border-b border-slate-100"
                        >
                          <td className="px-2 py-1 font-mono">
                            {certificate.storageName}
                          </td>
                          <td className="px-2 py-1">
                            {certificate.domains || "—"}
                          </td>
                          <td className="px-2 py-1">
                            {certificate.issuer || "—"}
                          </td>
                          <td
                            className={`px-2 py-1 ${expired ? "text-red-600 font-medium" : ""}`}
                          >
                            {certificate.notAfter
                              ? formatDateTime(certificate.notAfter, language)
                              : "—"}
                          </td>
                          <td className="px-2 py-1">
                            {certificate.size > 0 ? certificate.size : "—"}
                          </td>
                          <td className="flex flex-wrap gap-2 px-2 py-1">
                            <label className="cursor-pointer underline">
                              {t("haproxy.replace")}
                              <input
                                type="file"
                                accept=".pem,.crt,.key"
                                className="hidden"
                                disabled={busy}
                                onChange={(event) => {
                                  void replaceCertificate(
                                    certificate.storageName,
                                    event.target.files?.[0],
                                  );
                                  event.target.value = "";
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void removeCertificate(certificate.storageName)
                              }
                              className="text-red-600 underline disabled:opacity-50"
                            >
                              {t("common.delete")}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {(certificates.data ?? []).length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-2 py-4 text-center text-slate-500"
                        >
                          {t("haproxy.noCertificates")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {tab === "routes" ? (
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="px-2 py-1">{t("haproxy.host")}</th>
                      <th className="px-2 py-1">{t("haproxy.frontend")}</th>
                      <th className="px-2 py-1">{t("haproxy.backend")}</th>
                      <th className="px-2 py-1">{t("haproxy.bind")}</th>
                      <th className="px-2 py-1">{t("haproxy.inventory")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routeRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="px-2 py-1 font-mono">
                          {row.host || "—"}
                          {row.isDefault && (
                            <span className="ml-2 rounded bg-slate-100 px-1 text-[10px] text-slate-500">
                              {t("haproxy.defaultRoute")}
                            </span>
                          )}
                          <span className="text-slate-400">{row.path}</span>
                        </td>
                        <td className="px-2 py-1">{row.frontend}</td>
                        <td className="px-2 py-1">{row.backend}</td>
                        <td className="px-2 py-1 font-mono">
                          {row.bind || "—"}
                        </td>
                        <td className="px-2 py-1">
                          {row.proxyRouteLabel ? (
                            <span className="text-emerald-700">
                              {row.proxyRouteLabel}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {routeRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-2 py-4 text-center text-slate-500"
                        >
                          {t("haproxy.noRoutes")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="px-2 py-1">{t("haproxy.backend")}</th>
                      <th className="px-2 py-1">{t("haproxy.serverName")}</th>
                      <th className="px-2 py-1">{t("haproxy.address")}</th>
                      <th className="px-2 py-1">{t("common.status")}</th>
                      <th className="px-2 py-1">{t("haproxy.check")}</th>
                      <th className="px-2 py-1">{t("haproxy.weight")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serverRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="px-2 py-1">{row.backend}</td>
                        <td className="px-2 py-1">{row.server}</td>
                        <td className="px-2 py-1 font-mono">{row.address}</td>
                        <td className="px-2 py-1">{row.status || "—"}</td>
                        <td className="px-2 py-1">{row.checkStatus ?? "—"}</td>
                        <td className="px-2 py-1">{row.weight ?? "—"}</td>
                      </tr>
                    ))}
                    {serverRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-2 py-4 text-center text-slate-500"
                        >
                          {t("haproxy.noServers")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function MetricChart({ points }: { points: HaproxyMetricPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
        —
      </div>
    );
  }
  const width = 600;
  const height = 160;
  const pad = 8;
  const maxReq = Math.max(1, ...points.map((point) => point.req));
  const maxErr = Math.max(1, ...points.map((point) => point.h5xx));
  const x = (index: number) =>
    pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2);
  const y = (value: number, max: number) =>
    height - pad - (value / max) * (height - pad * 2);
  const reqPath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${x(index)},${y(point.req, maxReq)}`,
    )
    .join(" ");
  const errPath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${x(index)},${y(point.h5xx, maxErr)}`,
    )
    .join(" ");
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-4 bg-sky-500" />
          req/min
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-4 bg-red-500" />
          5xx/min
        </span>
        <span className="ml-auto">
          max {maxReq}/min · 5xx max {maxErr}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="HAProxy req/min e 5xx/min"
        className="h-40 w-full rounded-md border border-slate-200 bg-slate-50"
      >
        <path
          d={`${reqPath} L${x(points.length - 1)},${height - pad} L${x(0)},${height - pad} Z`}
          fill="rgba(14,165,233,0.12)"
        />
        <path d={reqPath} fill="none" stroke="#0ea5e9" strokeWidth="1.5" />
        <path d={errPath} fill="none" stroke="#ef4444" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
