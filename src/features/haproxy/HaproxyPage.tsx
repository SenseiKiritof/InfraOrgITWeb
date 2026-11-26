import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
  getHaproxyMetricsSeries,
  getHaproxyProtocol,
  getHaproxyRoutes,
  getHaproxyServers,
  type HaproxyMetricPoint,
  type HaproxyRoute,
  type HaproxyServer,
  replaceHaproxyCertificate,
  setHaproxyServerState,
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
  const [routeFilters, setRouteFilters] = useState({
    mode: "",
    text: "",
    frontend: "",
    backend: "",
    bind: "",
    inventory: "",
  });
  const [serverFilters, setServerFilters] = useState({
    type: "",
    backend: "",
    server: "",
    address: "",
    status: "",
    check: "",
    weight: "",
    paths: "",
  });
  const [selectedServers, setSelectedServers] = useState<Set<string>>(
    new Set(),
  );
  const [chartSearch, setChartSearch] = useState("");
  const [chartSelected, setChartSelected] = useState<Set<string>>(new Set());
  const [collapsedBackends, setCollapsedBackends] = useState<Set<string>>(
    new Set(),
  );
  const [showCompare, setShowCompare] = useState(false);
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
  const statsOnly = selected?.apiVersion === "stats";
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
  const serverMetrics = useQuery({
    queryKey: ["haproxy", "server-metrics", selected?.id],
    queryFn: () => getHaproxyMetricsSeries(selected?.id ?? 0, 60, "server"),
    enabled: selected !== undefined && tab === "servers",
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

  const serverAction = async (
    backend: string,
    server: string,
    action: "ready" | "drain" | "maint",
  ) => {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      await setHaproxyServerState(selected.id, backend, server, action, csrf);
      await servers.refetch();
      await live.refetch();
      setMessage(t("haproxy.serverActionOk"));
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : t("haproxy.serverActionFailed"),
      );
    } finally {
      setBusy(false);
    }
  };
  const frontends =
    live.data?.series.filter((item) => item.kind === "frontend") ?? [];
  const liveReq = frontends.reduce((sum, item) => sum + item.reqRate, 0);
  const liveSessions = frontends.reduce((sum, item) => sum + item.scur, 0);
  const matches = (value: string, needle: string) => {
    const term = needle.trim().toLowerCase();
    return term.length === 0 || value.toLowerCase().includes(term);
  };
  const modeLabel = (mode: string) => (mode === "tcp" ? "TCP" : "HTTP");
  const routeRows = (routes.data ?? []).filter(
    (row) =>
      (routeFilters.mode === "" || row.mode === routeFilters.mode) &&
      matches(`${row.host}${row.path}`, routeFilters.text) &&
      matches(row.frontend, routeFilters.frontend) &&
      matches(row.backend, routeFilters.backend) &&
      matches(row.bind, routeFilters.bind) &&
      matches(row.proxyRouteLabel ?? "", routeFilters.inventory),
  );
  const routeFrontends = [...new Set(routeRows.map((row) => row.frontend))];
  const showFrontendColumn = routeFrontends.length > 1;
  const sharedFrontend = routeFrontends.length === 1 ? routeFrontends[0] : null;
  const routesByBackend = new Map<string, { paths: string[]; mode: string }>();
  for (const route of routes.data ?? []) {
    const entry = routesByBackend.get(route.backend) ?? {
      paths: [],
      mode: route.mode,
    };
    if (!entry.paths.includes(route.path)) entry.paths.push(route.path);
    if (route.mode === "tcp") entry.mode = "tcp";
    routesByBackend.set(route.backend, entry);
  }
  const pathsFor = (backend: string) => {
    const entry = routesByBackend.get(backend);
    return entry?.mode === "tcp" ? [] : (entry?.paths ?? []);
  };
  const serverRows = (servers.data ?? []).filter((row) => {
    const mode = routesByBackend.get(row.backend)?.mode ?? "";
    return (
      (serverFilters.type === "" || mode === serverFilters.type) &&
      matches(row.backend, serverFilters.backend) &&
      matches(row.server, serverFilters.server) &&
      matches(row.address, serverFilters.address) &&
      matches(row.status, serverFilters.status) &&
      matches(row.checkStatus ?? "", serverFilters.check) &&
      matches(String(row.weight ?? ""), serverFilters.weight) &&
      matches(pathsFor(row.backend).join(" "), serverFilters.paths)
    );
  });
  const serverKey = (row: HaproxyServer) => `${row.backend}\u0000${row.server}`;
  const toggleServer = (key: string) =>
    setSelectedServers((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const visibleSelected = serverRows.filter((row) =>
    selectedServers.has(serverKey(row)),
  );
  const serverRates = new Map<string, HaproxyMetricPoint>();
  for (const series of serverMetrics.data ?? []) {
    const last = series.points.at(-1);
    if (last) serverRates.set(`${series.proxy}\u0000${series.server}`, last);
  }
  const rateFor = (row: HaproxyServer) => serverRates.get(serverKey(row));
  const seriesByKey = new Map(
    (serverMetrics.data ?? []).map((series) => [
      `${series.proxy}\u0000${series.server}`,
      series,
    ]),
  );
  const serverGroups = (() => {
    const groups = new Map<string, HaproxyServer[]>();
    for (const row of serverRows) {
      const list = groups.get(row.backend) ?? [];
      list.push(row);
      groups.set(row.backend, list);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([backend, rows]) => ({
        backend,
        rows,
        mode: routesByBackend.get(backend)?.mode ?? "",
        req: rows.reduce((sum, row) => sum + (rateFor(row)?.req ?? 0), 0),
        h5xx: rows.reduce((sum, row) => sum + (rateFor(row)?.h5xx ?? 0), 0),
      }));
  })();
  const compareSeries: ChartSeries[] = showCompare
    ? visibleSelected
        .map((row, index) => ({
          label: `${row.backend} / ${row.server}`,
          color: chartColors[index % chartColors.length],
          points: seriesByKey.get(serverKey(row))?.points ?? [],
        }))
        .filter((series) => series.points.length > 0)
    : [];
  const toggleGroup = (backend: string) =>
    setCollapsedBackends((current) => {
      const next = new Set(current);
      if (next.has(backend)) next.delete(backend);
      else next.add(backend);
      return next;
    });
  const groupSelected = (rows: HaproxyServer[]) =>
    rows.length > 0 && rows.every((row) => selectedServers.has(serverKey(row)));
  const bulkServerAction = async (action: "ready" | "drain" | "maint") => {
    if (!selected || visibleSelected.length === 0) return;
    setBusy(true);
    setMessage(null);
    let failed = 0;
    try {
      for (const row of visibleSelected) {
        try {
          await setHaproxyServerState(
            selected.id,
            row.backend,
            row.server,
            action,
            csrf,
          );
        } catch {
          failed += 1;
        }
      }
      await servers.refetch();
      await live.refetch();
      setSelectedServers(new Set());
      setMessage(
        failed === 0
          ? t("haproxy.bulkActionOk", { count: visibleSelected.length })
          : t("haproxy.bulkActionPartial", {
              failed,
              count: visibleSelected.length,
            }),
      );
    } finally {
      setBusy(false);
    }
  };
  const chartOptions = useMemo(() => {
    const byBackend = new Map<string, HaproxyRoute>();
    const byFrontend = new Map<string, HaproxyRoute>();
    for (const route of routes.data ?? []) {
      if (!byBackend.has(route.backend)) byBackend.set(route.backend, route);
      if (!byFrontend.has(route.frontend))
        byFrontend.set(route.frontend, route);
    }
    const seen = new Set<string>();
    const items: ChartOption[] = [];
    for (const series of live.data?.series ?? []) {
      const key = `${series.kind}|${series.proxy}|${series.server}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const route =
        series.kind === "frontend"
          ? byFrontend.get(series.proxy)
          : byBackend.get(series.proxy);
      items.push({
        key,
        kind: series.kind,
        proxy: series.proxy,
        server: series.server,
        label:
          series.kind === "server"
            ? `${series.proxy} / ${series.server}`
            : series.proxy,
        project: route?.applicationName
          ? `${route.applicationName}${route.hostPort ? ` · :${route.hostPort}` : ""}`
          : (route?.proxyRouteLabel ?? route?.host ?? ""),
        mode: route?.mode ?? "",
      });
    }
    return items;
  }, [live.data, routes.data]);
  const chartProjects = useMemo(() => {
    const groups = new Map<string, ChartOption[]>();
    for (const option of chartOptions) {
      const key = option.project || option.label;
      const list = groups.get(key) ?? [];
      list.push(option);
      groups.set(key, list);
    }
    const items: ChartProjectOption[] = [];
    for (const [key, options] of groups) {
      const backends = options.filter((o) => o.kind === "backend");
      const fronts = options.filter((o) => o.kind === "frontend");
      const elements =
        backends.length > 0 ? backends : fronts.length > 0 ? fronts : options;
      items.push({
        key,
        label: key,
        elements,
        mode: elements.some((element) => element.mode === "tcp") ? "tcp" : "",
      });
    }
    return items.sort((a, b) => a.label.localeCompare(b.label));
  }, [chartOptions]);
  const filteredChartProjects = chartProjects.filter((project) =>
    matches(project.label, chartSearch),
  );
  const selectedChartProjects = chartProjects.filter((project) =>
    chartSelected.has(project.key),
  );
  const chartData = useQuery({
    queryKey: [
      "haproxy",
      "chart",
      selected?.id,
      range,
      [...chartSelected].sort().join(","),
    ],
    queryFn: async () => {
      if (!selected) return [];
      return Promise.all(
        selectedChartProjects.map(async (project, index) => ({
          label: project.label,
          color: chartColors[index % chartColors.length],
          points: mergePoints(
            await Promise.all(
              project.elements.map((element) =>
                getHaproxyMetrics(
                  selected.id,
                  range,
                  element.kind,
                  element.proxy,
                  element.server,
                ),
              ),
            ),
          ),
        })),
      );
    },
    enabled: selected !== undefined && chartSelected.size > 0,
  });

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
              {instance.clusterName ? ` · ${instance.clusterName}` : ""}
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
              <span className="text-xs text-slate-500">
                {tab === "routes" ? routeRows.length : serverRows.length}
              </span>
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
                  value={
                    live.data?.process
                      ? String(live.data.process.currConns)
                      : "—"
                  }
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
                  {live.data?.process
                    ? t("haproxy.uptime", {
                        value: live.data.process.uptime,
                      })
                    : "—"}
                </span>
              </div>
              <details className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <summary className="cursor-pointer text-xs font-medium text-slate-600">
                  {t("haproxy.series")} ({chartSelected.size})
                </summary>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    value={chartSearch}
                    onChange={(event) => setChartSearch(event.target.value)}
                    placeholder={t("haproxy.filter")}
                    className="min-w-48 flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setChartSelected(new Set())}
                    className="text-xs underline disabled:opacity-40"
                    disabled={chartSelected.size === 0}
                  >
                    {t("haproxy.clearSelection")}
                  </button>
                </div>
                <div className="mt-2 max-h-56 space-y-1 overflow-auto rounded border border-slate-200 bg-white p-2">
                  {filteredChartProjects.map((project) => (
                    <label
                      key={project.key}
                      className="flex items-center gap-2 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={chartSelected.has(project.key)}
                        onChange={() =>
                          setChartSelected((current) => {
                            const next = new Set(current);
                            if (next.has(project.key)) next.delete(project.key);
                            else next.add(project.key);
                            return next;
                          })
                        }
                      />
                      <span className="font-mono">{project.label}</span>
                      {project.mode === "tcp" && (
                        <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-800">
                          TCP
                        </span>
                      )}
                      <span className="text-slate-400">
                        · {project.elements.length}
                      </span>
                    </label>
                  ))}
                  {filteredChartProjects.length === 0 && (
                    <p className="text-xs text-slate-500">—</p>
                  )}
                </div>
              </details>
              <MetricChart
                points={metrics.data ?? []}
                series={
                  chartSelected.size > 0 ? (chartData.data ?? []) : undefined
                }
              />
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
                {!statsOnly && (
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
                )}
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
                            {!statsOnly && (
                              <>
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
                                    void removeCertificate(
                                      certificate.storageName,
                                    )
                                  }
                                  className="text-red-600 underline disabled:opacity-50"
                                >
                                  {t("common.delete")}
                                </button>
                              </>
                            )}
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
            <div className="space-y-2">
              {tab === "servers" && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
                  <span className="text-slate-600">
                    {t("haproxy.selected", { count: selectedServers.size })}
                  </span>
                  <input
                    value={serverFilters.backend}
                    onChange={(event) =>
                      setServerFilters((current) => ({
                        ...current,
                        backend: event.target.value,
                      }))
                    }
                    placeholder={t("haproxy.backend")}
                    className="w-40 rounded border border-slate-300 px-2 py-0.5 text-[10px]"
                  />
                  {(["ready", "drain", "maint"] as const).map((action) => (
                    <button
                      key={action}
                      type="button"
                      disabled={busy || selectedServers.size === 0}
                      onClick={() => void bulkServerAction(action)}
                      className="rounded border border-slate-300 px-2 py-0.5 text-[10px] uppercase disabled:opacity-40"
                    >
                      {action}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={busy || selectedServers.size === 0}
                    onClick={() => setShowCompare((current) => !current)}
                    className="rounded border border-slate-300 px-2 py-0.5 text-[10px] disabled:opacity-40"
                  >
                    {t("haproxy.compare")}
                  </button>
                  <button
                    type="button"
                    disabled={busy || selectedServers.size === 0}
                    onClick={() => setSelectedServers(new Set())}
                    className="underline disabled:opacity-40"
                  >
                    {t("haproxy.clearSelection")}
                  </button>
                  {message && <span className="text-slate-600">{message}</span>}
                </div>
              )}
              {tab === "servers" && showCompare && (
                <div className="rounded-md border border-slate-200 bg-white p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">
                      {t("haproxy.compare")}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCompare(false)}
                      className="text-xs underline"
                    >
                      {t("common.close")}
                    </button>
                  </div>
                  {compareSeries.length > 0 ? (
                    <MetricChart points={[]} series={compareSeries} />
                  ) : (
                    <p className="p-2 text-xs text-slate-500">—</p>
                  )}
                </div>
              )}
              <div className="overflow-x-auto">
                {tab === "routes" ? (
                  <>
                    {sharedFrontend && (
                      <p className="px-2 pt-2 text-xs text-slate-500">
                        {t("haproxy.frontend")}:{" "}
                        <span className="font-mono">{sharedFrontend}</span>
                      </p>
                    )}
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 text-slate-500">
                        <tr>
                          <th className="px-2 py-1">{t("haproxy.type")}</th>
                          <th className="px-2 py-1">{t("haproxy.host")}</th>
                          {showFrontendColumn && (
                            <th className="px-2 py-1">
                              {t("haproxy.frontend")}
                            </th>
                          )}
                          <th className="px-2 py-1">{t("haproxy.backend")}</th>
                          <th className="px-2 py-1">{t("haproxy.bind")}</th>
                          <th className="px-2 py-1">
                            {t("haproxy.inventory")}
                          </th>
                        </tr>
                        <tr>
                          <th className="px-2 pb-1">
                            <select
                              value={routeFilters.mode}
                              onChange={(event) =>
                                setRouteFilters((current) => ({
                                  ...current,
                                  mode: event.target.value,
                                }))
                              }
                              className="w-full rounded border border-slate-200 px-1 py-0.5 text-[10px] font-normal"
                            >
                              <option value="">{t("haproxy.all")}</option>
                              <option value="http">HTTP</option>
                              <option value="tcp">TCP</option>
                            </select>
                          </th>
                          <th className="px-2 pb-1">
                            <input
                              value={routeFilters.text}
                              onChange={(event) =>
                                setRouteFilters((current) => ({
                                  ...current,
                                  text: event.target.value,
                                }))
                              }
                              placeholder={t("haproxy.filter")}
                              className="w-full rounded border border-slate-200 px-1 py-0.5 text-[10px] font-normal"
                            />
                          </th>
                          {showFrontendColumn && (
                            <th className="px-2 pb-1">
                              <input
                                value={routeFilters.frontend}
                                onChange={(event) =>
                                  setRouteFilters((current) => ({
                                    ...current,
                                    frontend: event.target.value,
                                  }))
                                }
                                placeholder={t("haproxy.filter")}
                                className="w-full rounded border border-slate-200 px-1 py-0.5 text-[10px] font-normal"
                              />
                            </th>
                          )}
                          <th className="px-2 pb-1">
                            <input
                              value={routeFilters.backend}
                              onChange={(event) =>
                                setRouteFilters((current) => ({
                                  ...current,
                                  backend: event.target.value,
                                }))
                              }
                              placeholder={t("haproxy.filter")}
                              className="w-full rounded border border-slate-200 px-1 py-0.5 text-[10px] font-normal"
                            />
                          </th>
                          <th className="px-2 pb-1">
                            <input
                              value={routeFilters.bind}
                              onChange={(event) =>
                                setRouteFilters((current) => ({
                                  ...current,
                                  bind: event.target.value,
                                }))
                              }
                              placeholder={t("haproxy.filter")}
                              className="w-full rounded border border-slate-200 px-1 py-0.5 text-[10px] font-normal"
                            />
                          </th>
                          <th className="px-2 pb-1">
                            <input
                              value={routeFilters.inventory}
                              onChange={(event) =>
                                setRouteFilters((current) => ({
                                  ...current,
                                  inventory: event.target.value,
                                }))
                              }
                              placeholder={t("haproxy.filter")}
                              className="w-full rounded border border-slate-200 px-1 py-0.5 text-[10px] font-normal"
                            />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {routeRows.map((row) => (
                          <tr
                            key={row.id}
                            className="border-b border-slate-100"
                          >
                            <td className="px-2 py-1">
                              <span
                                className={`rounded px-1 text-[10px] ${
                                  row.mode === "tcp"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-sky-100 text-sky-800"
                                }`}
                              >
                                {modeLabel(row.mode)}
                              </span>
                            </td>
                            <td className="px-2 py-1 font-mono">
                              {row.host || "—"}
                              {row.isDefault && (
                                <span className="ml-2 rounded bg-slate-100 px-1 text-[10px] text-slate-500">
                                  {t("haproxy.defaultRoute")}
                                </span>
                              )}
                              {row.mode !== "tcp" && (
                                <span className="text-slate-400">
                                  {row.path}
                                </span>
                              )}
                            </td>
                            {showFrontendColumn && (
                              <td className="px-2 py-1">{row.frontend}</td>
                            )}
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
                              colSpan={showFrontendColumn ? 6 : 5}
                              className="px-2 py-4 text-center text-slate-500"
                            >
                              {t("haproxy.noRoutes")}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="px-2 py-1">
                          <input
                            type="checkbox"
                            checked={
                              serverRows.length > 0 &&
                              serverRows.every((row) =>
                                selectedServers.has(serverKey(row)),
                              )
                            }
                            onChange={(event) => {
                              if (event.target.checked)
                                setSelectedServers(
                                  new Set(serverRows.map(serverKey)),
                                );
                              else setSelectedServers(new Set());
                            }}
                          />
                        </th>
                        <th className="px-2 py-1">{t("haproxy.type")}</th>
                        <th className="px-2 py-1">{t("haproxy.serverName")}</th>
                        <th className="px-2 py-1">{t("haproxy.address")}</th>
                        <th className="px-2 py-1">{t("common.status")}</th>
                        <th className="px-2 py-1">{t("haproxy.check")}</th>
                        <th className="px-2 py-1">{t("haproxy.weight")}</th>
                        <th className="px-2 py-1">{t("haproxy.paths")}</th>
                        <th className="px-2 py-1">
                          {t("haproxy.reqPerMinuteShort")}
                        </th>
                        <th className="px-2 py-1">
                          {t("haproxy.errors5xxShort")}
                        </th>
                        <th className="px-2 py-1" />
                      </tr>
                      <tr>
                        <th />
                        <th className="px-2 pb-1">
                          <select
                            value={serverFilters.type}
                            onChange={(event) =>
                              setServerFilters((current) => ({
                                ...current,
                                type: event.target.value,
                              }))
                            }
                            className="w-full rounded border border-slate-200 px-1 py-0.5 text-[10px] font-normal"
                          >
                            <option value="">{t("haproxy.all")}</option>
                            <option value="http">HTTP</option>
                            <option value="tcp">TCP</option>
                          </select>
                        </th>
                        {(
                          [
                            "server",
                            "address",
                            "status",
                            "check",
                            "weight",
                            "paths",
                          ] as const
                        ).map((field) => (
                          <th key={field} className="px-2 pb-1">
                            <input
                              value={serverFilters[field]}
                              onChange={(event) =>
                                setServerFilters((current) => ({
                                  ...current,
                                  [field]: event.target.value,
                                }))
                              }
                              placeholder={t("haproxy.filter")}
                              className="w-full rounded border border-slate-200 px-1 py-0.5 text-[10px] font-normal"
                            />
                          </th>
                        ))}
                        <th />
                        <th />
                        <th />
                      </tr>
                    </thead>
                    {serverGroups.map((group) => (
                      <tbody key={group.backend}>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <td className="px-2 py-1">
                            <input
                              type="checkbox"
                              checked={groupSelected(group.rows)}
                              onChange={(event) =>
                                setSelectedServers((current) => {
                                  const next = new Set(current);
                                  for (const row of group.rows) {
                                    if (event.target.checked)
                                      next.add(serverKey(row));
                                    else next.delete(serverKey(row));
                                  }
                                  return next;
                                })
                              }
                            />
                          </td>
                          <td colSpan={10} className="px-2 py-1">
                            <button
                              type="button"
                              onClick={() => toggleGroup(group.backend)}
                              className="mr-1 w-3 text-slate-500"
                            >
                              {collapsedBackends.has(group.backend) ? "▸" : "▾"}
                            </button>
                            <span className="font-mono font-medium">
                              {group.backend}
                            </span>
                            {group.mode && (
                              <span
                                className={`ml-2 rounded px-1 text-[10px] ${
                                  group.mode === "tcp"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-sky-100 text-sky-800"
                                }`}
                              >
                                {modeLabel(group.mode)}
                              </span>
                            )}
                            <span className="ml-2 text-slate-500">
                              {group.rows.length} server
                            </span>
                            <span className="ml-4 text-slate-500">
                              {t("haproxy.reqPerMinuteShort")}{" "}
                              <span className="font-medium tabular-nums text-slate-700">
                                {group.req}
                              </span>
                            </span>
                            <span className="ml-3 text-slate-500">
                              {t("haproxy.errors5xxShort")}{" "}
                              <span className="font-medium tabular-nums text-slate-700">
                                {group.h5xx}
                              </span>
                            </span>
                          </td>
                        </tr>
                        {!collapsedBackends.has(group.backend) &&
                          group.rows.map((row) => {
                            const key = serverKey(row);
                            const paths = pathsFor(row.backend);
                            const mode =
                              routesByBackend.get(row.backend)?.mode ?? "";
                            const rate = rateFor(row);
                            return (
                              <tr
                                key={row.id}
                                className="border-b border-slate-100"
                              >
                                <td className="px-2 py-1">
                                  <input
                                    type="checkbox"
                                    checked={selectedServers.has(key)}
                                    onChange={() => toggleServer(key)}
                                  />
                                </td>
                                <td className="px-2 py-1">
                                  {mode ? (
                                    <span
                                      className={`rounded px-1 text-[10px] ${
                                        mode === "tcp"
                                          ? "bg-amber-100 text-amber-800"
                                          : "bg-sky-100 text-sky-800"
                                      }`}
                                    >
                                      {modeLabel(mode)}
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="px-2 py-1">{row.server}</td>
                                <td className="px-2 py-1 font-mono">
                                  {row.address}
                                </td>
                                <td className="px-2 py-1">
                                  {row.status || "—"}
                                </td>
                                <td className="px-2 py-1">
                                  {row.checkStatus ?? "—"}
                                </td>
                                <td className="px-2 py-1">
                                  {row.weight ?? "—"}
                                </td>
                                <td className="px-2 py-1 font-mono text-[10px]">
                                  {paths.length === 0
                                    ? "—"
                                    : paths.slice(0, 3).join(", ") +
                                      (paths.length > 3
                                        ? ` +${paths.length - 3}`
                                        : "")}
                                </td>
                                <td className="px-2 py-1 tabular-nums">
                                  {rate?.req ?? "—"}
                                </td>
                                <td className="px-2 py-1 tabular-nums">
                                  {rate?.h5xx ?? "—"}
                                </td>
                                <td className="flex flex-wrap gap-1 px-2 py-1">
                                  {(["ready", "drain", "maint"] as const).map(
                                    (action) => (
                                      <button
                                        key={action}
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                          void serverAction(
                                            row.backend,
                                            row.server,
                                            action,
                                          )
                                        }
                                        className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] uppercase disabled:opacity-50"
                                      >
                                        {action}
                                      </button>
                                    ),
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    ))}
                    {serverRows.length === 0 && (
                      <tbody>
                        <tr>
                          <td
                            colSpan={11}
                            className="px-2 py-4 text-center text-slate-500"
                          >
                            {t("haproxy.noServers")}
                          </td>
                        </tr>
                      </tbody>
                    )}
                  </table>
                )}
              </div>
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

const chartColors = [
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#ef4444",
  "#14b8a6",
  "#6366f1",
  "#84cc16",
];

interface ChartOption {
  key: string;
  kind: string;
  proxy: string;
  server: string;
  label: string;
  project: string;
  mode: string;
}

interface ChartProjectOption {
  key: string;
  label: string;
  elements: ChartOption[];
  mode: string;
}

function mergePoints(groups: HaproxyMetricPoint[][]): HaproxyMetricPoint[] {
  const byTime = new Map<string, HaproxyMetricPoint>();
  for (const points of groups) {
    for (const point of points) {
      const current = byTime.get(point.timestamp);
      if (!current) {
        byTime.set(point.timestamp, { ...point });
        continue;
      }
      current.req += point.req;
      current.h4xx += point.h4xx;
      current.h5xx += point.h5xx;
      current.bin += point.bin;
      current.bout += point.bout;
      current.scur += point.scur;
      current.qcur += point.qcur;
    }
  }
  return [...byTime.values()].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
}

interface ChartSeries {
  label: string;
  color: string;
  points: HaproxyMetricPoint[];
}

function MetricChart({
  points,
  series,
}: {
  points: HaproxyMetricPoint[];
  series?: ChartSeries[];
}) {
  if (series && series.length > 0) {
    const width = 600;
    const height = 160;
    const pad = 8;
    const maxReq = Math.max(
      1,
      ...series.flatMap((item) => item.points.map((point) => point.req)),
    );
    const count = Math.max(...series.map((item) => item.points.length), 1);
    const x = (index: number) =>
      pad + (index / Math.max(1, count - 1)) * (width - pad * 2);
    const y = (value: number) =>
      height - pad - (value / maxReq) * (height - pad * 2);
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {series.map((item) => (
            <span key={item.label} className="flex items-center gap-1">
              <span
                className="h-0.5 w-4"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </span>
          ))}
          <span className="ml-auto">max {maxReq}/min</span>
        </div>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="HAProxy req/min per serie"
          className="h-40 w-full rounded-md border border-slate-200 bg-slate-50"
        >
          {series.map((item) => (
            <path
              key={item.label}
              d={item.points
                .map(
                  (point, index) =>
                    `${index === 0 ? "M" : "L"}${x(index)},${y(point.req)}`,
                )
                .join(" ")}
              fill="none"
              stroke={item.color}
              strokeWidth={1.5}
            />
          ))}
        </svg>
      </div>
    );
  }
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
