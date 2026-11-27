import { useQuery } from "@tanstack/react-query";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
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
  type HaproxyInstance,
  type HaproxyMetricPoint,
  type HaproxyRoute,
  type HaproxyServer,
  replaceHaproxyCertificate,
  setHaproxyServerState,
  uploadHaproxyCertificate,
} from "../../lib/haproxy";
import {
  errorPercent,
  sumSeriesByTimestamp,
  toPerMinute,
} from "../../lib/haproxyMetrics";
import {
  type Language,
  localeFor,
  type TranslationKey,
  useI18n,
} from "../../lib/i18n";

export function HaproxyPage() {
  const { t, language } = useI18n();
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<
    "overview" | "routes" | "servers" | "certificates" | "protocol"
  >("overview");
  const [range, setRange] = useState(60);
  const [aggregateRange, setAggregateRange] = useState(60);
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
    application: "",
    status: "",
    check: "",
    weight: "",
    paths: "",
    req: "",
    h5xx: "",
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
  const [compareRange, setCompareRange] = useState(60);
  const [compareMetric, setCompareMetric] = useState<ChartMetric>("req");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const instances = useQuery({
    queryKey: ["haproxy", "instances"],
    queryFn: () => getHaproxyInstances(),
    refetchInterval: 30_000,
  });
  const monitoredInstances = (instances.data ?? []).filter(
    (item) => item.monitoringChoice === "Enabled",
  );
  const aggregateMetrics = useQuery({
    queryKey: [
      "haproxy",
      "aggregate-metrics",
      aggregateRange,
      monitoredInstances.map((item) => item.id).join(","),
    ],
    queryFn: async () => {
      const settled = await Promise.allSettled(
        monitoredInstances.map((item) =>
          getHaproxyMetrics(item.id, aggregateRange),
        ),
      );
      return settled.flatMap((result, index) =>
        result.status === "fulfilled"
          ? [{ instance: monitoredInstances[index], points: result.value }]
          : [],
      );
    },
    enabled: monitoredInstances.length > 0,
    refetchInterval: 60_000,
  });
  const aggregateServers = useQuery({
    queryKey: [
      "haproxy",
      "aggregate-servers",
      monitoredInstances.map((item) => item.id).join(","),
    ],
    queryFn: async (): Promise<
      { instance: HaproxyInstance; servers: HaproxyServer[] }[]
    > => {
      const settled = await Promise.allSettled(
        monitoredInstances.map((item) => getHaproxyServers(item.id)),
      );
      return settled.flatMap((result, index) =>
        result.status === "fulfilled"
          ? [{ instance: monitoredInstances[index], servers: result.value }]
          : [],
      );
    },
    enabled: monitoredInstances.length > 0,
    refetchInterval: 60_000,
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
  const compareMetrics = useQuery({
    queryKey: ["haproxy", "compare-metrics", selected?.id, compareRange],
    queryFn: () =>
      getHaproxyMetricsSeries(selected?.id ?? 0, compareRange, "server"),
    enabled: selected !== undefined && tab === "servers" && showCompare,
    refetchInterval: 30_000,
  });
  const metricsEmpty = metrics.isSuccess && (metrics.data?.length ?? 0) === 0;
  const aggregateMetricsEmpty =
    aggregateMetrics.isSuccess &&
    !(aggregateMetrics.data ?? []).some((entry) => entry.points.length > 0);
  const compareMetricsEmpty =
    compareMetrics.isSuccess && (compareMetrics.data?.length ?? 0) === 0;

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
  const liveReqPerMin = Math.round(
    frontends.reduce((sum, item) => sum + item.reqRate, 0) * 60,
  );
  const liveSessions = frontends.reduce((sum, item) => sum + item.scur, 0);
  const lastMetricPoint = toPerMinute(metrics.data ?? []).at(-1);
  const errors5xxPerMin = Math.round(lastMetricPoint?.h5xx ?? 0);
  const avgResponseMs = lastMetricPoint
    ? Math.round(lastMetricPoint.rtime)
    : null;
  const errors4xxPercent = lastMetricPoint
    ? errorPercent(lastMetricPoint.h4xx, lastMetricPoint.req)
    : null;
  const errors5xxPercent = lastMetricPoint
    ? errorPercent(lastMetricPoint.h5xx, lastMetricPoint.req)
    : null;
  const uptimeLabel = (seconds: number) => {
    const total = Math.max(0, Math.floor(seconds));
    return t("haproxy.uptime", {
      days: Math.floor(total / 86_400),
      hours: Math.floor((total % 86_400) / 3_600),
      minutes: Math.floor((total % 3_600) / 60),
    });
  };
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
  const serverKey = (row: HaproxyServer) => `${row.backend}\u0000${row.server}`;
  const serverRates = new Map<string, HaproxyMetricPoint>();
  for (const series of serverMetrics.data ?? []) {
    const last = series.points.at(-1);
    if (last) serverRates.set(`${series.proxy}\u0000${series.server}`, last);
  }
  const rateFor = (row: HaproxyServer) => serverRates.get(serverKey(row));
  const serverRows = (servers.data ?? []).filter((row) => {
    const mode = routesByBackend.get(row.backend)?.mode ?? "";
    return (
      (serverFilters.type === "" || mode === serverFilters.type) &&
      matches(row.backend, serverFilters.backend) &&
      matches(row.server, serverFilters.server) &&
      matches(row.address, serverFilters.address) &&
      matches(row.applicationNames.join(" "), serverFilters.application) &&
      matches(row.status, serverFilters.status) &&
      matches(row.checkStatus ?? "", serverFilters.check) &&
      matches(String(row.weight ?? ""), serverFilters.weight) &&
      matches(pathsFor(row.backend).join(" "), serverFilters.paths) &&
      matches(String(rateFor(row)?.req ?? ""), serverFilters.req) &&
      matches(String(rateFor(row)?.h5xx ?? ""), serverFilters.h5xx)
    );
  });
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
  const compareSeriesByKey = new Map(
    (compareMetrics.data ?? []).map((series) => [
      `${series.proxy}\u0000${series.server}`,
      series,
    ]),
  );
  const compareSeries: ChartSeries[] = showCompare
    ? visibleSelected
        .map((row, index) => ({
          label: `${row.backend} / ${row.server}`,
          color: chartColors[index % chartColors.length],
          points: compareSeriesByKey.get(serverKey(row))?.points ?? [],
        }))
        .filter((series) => series.points.length > 0)
    : [];
  const aggregatePointsById = new Map(
    (aggregateMetrics.data ?? []).map((entry) => [
      entry.instance.id,
      entry.points,
    ]),
  );
  const aggregateRows = (instances.data ?? []).map((instance) => ({
    instance,
    last: toPerMinute(aggregatePointsById.get(instance.id) ?? []).at(-1),
  }));
  const aggregateSeries: ChartSeries[] = (instances.data ?? []).flatMap(
    (instance, index) => {
      const points = aggregatePointsById.get(instance.id) ?? [];
      return points.length > 0
        ? [
            {
              label: instance.name,
              color: chartColors[index % chartColors.length],
              points,
            },
          ]
        : [];
    },
  );
  const aggregateChartSeries: ChartSeries[] =
    aggregateSeries.length > 0
      ? [
          ...aggregateSeries,
          {
            label: t("haproxy.aggregateTotal"),
            color: "#e11d48",
            points: sumSeriesByTimestamp(
              aggregateSeries.map((item) => item.points),
            ),
          },
        ]
      : [];
  const aggregateMonitoredCount = aggregateRows.filter(
    (row) => row.instance.monitoringChoice === "Enabled",
  ).length;
  const aggregateReqPerMin = Math.round(
    aggregateRows.reduce((sum, row) => sum + (row.last?.req ?? 0), 0),
  );
  const aggregate5xxPerMin = Math.round(
    aggregateRows.reduce((sum, row) => sum + (row.last?.h5xx ?? 0), 0),
  );
  const aggregateRouteCount = (instances.data ?? []).reduce(
    (sum, instance) => sum + instance.routeCount,
    0,
  );
  const aggregateServerCount = (instances.data ?? []).reduce(
    (sum, instance) => sum + instance.serverCount,
    0,
  );
  const aggregateServerRows = (aggregateServers.data ?? []).flatMap((entry) =>
    entry.servers.map((server) => ({ instance: entry.instance, server })),
  );
  const aggregateStatusCounts = new Map<ServerStatusKey, number>();
  for (const row of aggregateServerRows) {
    const key = aggregateServerStatusKey(row.server.status);
    aggregateStatusCounts.set(key, (aggregateStatusCounts.get(key) ?? 0) + 1);
  }
  const nonUpServers = aggregateServerRows
    .filter((row) => aggregateServerStatusKey(row.server.status) !== "UP")
    .sort(
      (a, b) =>
        a.instance.name.localeCompare(b.instance.name) ||
        a.server.backend.localeCompare(b.server.backend) ||
        a.server.server.localeCompare(b.server.server),
    );
  const reachableProxyCount = (instances.data ?? []).filter(
    (instance) =>
      instance.lastTestStatus === "Ok" || instance.lastRefreshStatus === "Ok",
  ).length;
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
          points: sumSeriesByTimestamp(
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

      {(instances.data?.length ?? 0) > 0 && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{t("haproxy.allProxies")}</h2>
            <div className="flex items-center gap-1">
              {(
                [
                  [60, t("haproxy.range1h")],
                  [360, t("haproxy.range6h")],
                  [1440, t("haproxy.range24h")],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={aggregateMetricsEmpty}
                  onClick={() => setAggregateRange(value)}
                  className={`rounded border px-2 py-0.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-40 ${
                    aggregateRange === value
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi
              label={t("haproxy.monitoredProxies")}
              value={`${aggregateMonitoredCount} / ${instances.data?.length ?? 0}`}
            />
            <Kpi
              label={t("haproxy.reachableProxies")}
              value={`${reachableProxyCount} / ${instances.data?.length ?? 0}`}
            />
            <Kpi
              label={t("haproxy.requestsPerMinute")}
              value={
                aggregateMonitoredCount === 0 ? "—" : String(aggregateReqPerMin)
              }
            />
            <Kpi
              label={t("haproxy.errors5xx")}
              value={
                aggregateMonitoredCount === 0 ? "—" : String(aggregate5xxPerMin)
              }
            />
            <Kpi
              label={t("haproxy.totalRoutesServers")}
              value={`${aggregateRouteCount} · ${aggregateServerCount}`}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-medium text-slate-600">
                  {t("haproxy.serversByStatus")}
                </h3>
                <span className="text-xs text-slate-500">
                  {t("haproxy.servers")}: {aggregateServerRows.length}
                </span>
              </div>
              {aggregateServerRows.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">—</p>
              ) : (
                <>
                  <div className="mt-2 flex h-3 overflow-hidden rounded bg-slate-200">
                    {serverStatusKeys.map((key) => {
                      const count = aggregateStatusCounts.get(key) ?? 0;
                      return count === 0 ? null : (
                        <span
                          key={key}
                          className={
                            serverStatusBarColors[key] ?? "bg-slate-400"
                          }
                          style={{
                            width: `${(count / aggregateServerRows.length) * 100}%`,
                          }}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {serverStatusKeys.map((key) => (
                      <span
                        key={key}
                        className={`rounded px-1 text-[10px] ${
                          serverStatusColors[key] ??
                          "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {key === "OTHER" ? t("haproxy.serverStatusOther") : key}{" "}
                        {aggregateStatusCounts.get(key) ?? 0}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <h3 className="text-xs font-medium text-slate-600">
                {t("haproxy.serversNotUp")}
              </h3>
              {nonUpServers.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  {t("haproxy.serversAllUp")}
                </p>
              ) : (
                <ul className="mt-1">
                  {nonUpServers.slice(0, 8).map((row) => (
                    <li
                      key={`${row.instance.id}-${row.server.backend}-${row.server.server}`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(row.instance.id);
                          setTab("servers");
                        }}
                        className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-white"
                      >
                        <span className="truncate font-medium">
                          {row.instance.name}
                        </span>
                        <span className="truncate font-mono text-slate-500">
                          {row.server.backend} / {row.server.server}
                        </span>
                        <span className="ml-auto shrink-0">
                          <ServerStatusBadge status={row.server.status} />
                        </span>
                      </button>
                    </li>
                  ))}
                  {nonUpServers.length > 8 && (
                    <li className="px-1 pt-1 text-[10px] text-slate-500">
                      +{nonUpServers.length - 8}
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
          <MetricChart
            points={[]}
            series={
              aggregateChartSeries.length > 0 ? aggregateChartSeries : undefined
            }
            language={language}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-2 py-1">{t("haproxy.proxyName")}</th>
                  <th className="px-2 py-1">
                    {t("haproxy.clusterEnvironment")}
                  </th>
                  <th className="px-2 py-1">{t("haproxy.apiVersion")}</th>
                  <th className="px-2 py-1">{t("haproxy.monitoring")}</th>
                  <th className="px-2 py-1">
                    {t("haproxy.reqPerMinuteShort")}
                  </th>
                  <th className="px-2 py-1">{t("haproxy.errors5xxShort")}</th>
                  <th className="px-2 py-1">{t("haproxy.routes")}</th>
                  <th className="px-2 py-1">{t("haproxy.servers")}</th>
                  <th className="px-2 py-1">{t("haproxy.sampleAge")}</th>
                </tr>
              </thead>
              <tbody>
                {aggregateRows.map(({ instance, last }) => {
                  const monitored = instance.monitoringChoice === "Enabled";
                  return (
                    <tr
                      key={instance.id}
                      onClick={() => setSelectedId(instance.id)}
                      className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${
                        selected?.id === instance.id ? "bg-emerald-50" : ""
                      }`}
                    >
                      <td className="px-2 py-1 font-medium">{instance.name}</td>
                      <td className="px-2 py-1">
                        {instance.environmentLabel}
                        {instance.clusterName
                          ? ` · ${instance.clusterName}`
                          : ""}
                      </td>
                      <td className="px-2 py-1">
                        {instance.effectiveApiVersion ?? instance.apiVersion}
                      </td>
                      <td className="px-2 py-1">
                        <span
                          className={`rounded px-1 text-[10px] ${
                            monitoringColors[instance.monitoringChoice] ??
                            "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {t(monitoringLabels[instance.monitoringChoice])}
                        </span>
                      </td>
                      <td className="px-2 py-1 tabular-nums">
                        {monitored && last ? Math.round(last.req) : "—"}
                      </td>
                      <td className="px-2 py-1 tabular-nums">
                        {monitored && last ? Math.round(last.h5xx) : "—"}
                      </td>
                      <td className="px-2 py-1 tabular-nums">
                        {instance.routeCount}
                      </td>
                      <td className="px-2 py-1 tabular-nums">
                        {instance.serverCount}
                      </td>
                      <td className="px-2 py-1 tabular-nums">
                        {monitored && last
                          ? formatSampleAge(last.timestamp, language)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
                  value={String(liveReqPerMin)}
                />
                <Kpi
                  label={t("haproxy.sessions")}
                  value={String(liveSessions)}
                />
                <Kpi
                  label={t("haproxy.errors5xx")}
                  value={String(errors5xxPerMin)}
                />
                <Kpi
                  label={t("haproxy.currentConnections")}
                  value={
                    live.data?.process
                      ? String(live.data.process.currConns)
                      : "—"
                  }
                />
                <Kpi
                  label={t("haproxy.responseTime")}
                  value={avgResponseMs === null ? "—" : `${avgResponseMs} ms`}
                />
                <Kpi
                  label={t("haproxy.errors4xxPercent")}
                  value={formatPercent(errors4xxPercent, language)}
                />
                <Kpi
                  label={t("haproxy.errors5xxPercent")}
                  value={formatPercent(errors5xxPercent, language)}
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
                    disabled={metricsEmpty}
                    onClick={() => setRange(Number(value))}
                    className={`rounded border px-2 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
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
                    ? uptimeLabel(live.data.process.uptime)
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
                language={language}
              />
              <MetricChart
                points={metrics.data ?? []}
                metric="rtime"
                language={language}
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium">
                      {t("haproxy.compare")}
                    </span>
                    <div className="flex items-center gap-1">
                      <select
                        value={compareMetric}
                        onChange={(event) =>
                          setCompareMetric(event.target.value as ChartMetric)
                        }
                        className="rounded border border-slate-300 px-1 py-0.5 text-[10px]"
                      >
                        <option value="req">
                          {t("haproxy.requestsPerMinute")}
                        </option>
                        <option value="h5xx">{t("haproxy.errors5xx")}</option>
                        <option value="rtime">
                          {t("haproxy.metricResponseTime")}
                        </option>
                      </select>
                      {(
                        [
                          [60, t("haproxy.range1h")],
                          [360, t("haproxy.range6h")],
                          [1440, t("haproxy.range24h")],
                          [10080, t("haproxy.range7d")],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          disabled={compareMetricsEmpty}
                          onClick={() => setCompareRange(value)}
                          className={`rounded border px-2 py-0.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-40 ${
                            compareRange === value
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-300"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setShowCompare(false)}
                        className="ml-2 text-xs underline"
                      >
                        {t("common.close")}
                      </button>
                    </div>
                  </div>
                  {compareSeries.length > 0 ? (
                    <MetricChart
                      points={[]}
                      series={compareSeries}
                      language={language}
                      metric={compareMetric}
                    />
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
                        <th className="min-w-40 px-2 py-1">
                          {t("haproxy.backend")}
                        </th>
                        <th className="px-2 py-1">{t("haproxy.type")}</th>
                        <th className="px-2 py-1">{t("haproxy.serverName")}</th>
                        <th className="px-2 py-1">{t("haproxy.address")}</th>
                        <th className="px-2 py-1">
                          {t("haproxy.application")}
                        </th>
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
                          <input
                            value={serverFilters.backend}
                            onChange={(event) =>
                              setServerFilters((current) => ({
                                ...current,
                                backend: event.target.value,
                              }))
                            }
                            placeholder={t("haproxy.backend")}
                            className="w-full rounded border border-slate-200 px-1 py-0.5 text-[10px] font-normal"
                          />
                        </th>
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
                            "application",
                            "status",
                            "check",
                            "weight",
                            "paths",
                            "req",
                            "h5xx",
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
                          <td className="whitespace-nowrap px-2 py-1">
                            <span className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => toggleGroup(group.backend)}
                                className="w-3 text-slate-500"
                              >
                                {collapsedBackends.has(group.backend)
                                  ? "▸"
                                  : "▾"}
                              </button>
                              <span className="font-mono font-medium">
                                {group.backend}
                              </span>
                            </span>
                          </td>
                          <td colSpan={11} className="px-2 py-1">
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
                                <td className="whitespace-nowrap px-2 py-1">
                                  {row.backend}
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
                                  {row.applicationNames.length === 0 ? (
                                    "—"
                                  ) : (
                                    <span className="flex flex-wrap gap-1">
                                      {row.applicationNames
                                        .slice(0, 2)
                                        .map((name) => (
                                          <span
                                            key={name}
                                            className="rounded bg-slate-100 px-1 text-[10px] text-slate-700"
                                          >
                                            {name}
                                          </span>
                                        ))}
                                      {row.applicationNames.length > 2 && (
                                        <span className="text-[10px] text-slate-500">
                                          +{row.applicationNames.length - 2}
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </td>
                                <td className="px-2 py-1">
                                  {row.status ? (
                                    <ServerStatusBadge status={row.status} />
                                  ) : (
                                    "—"
                                  )}
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
                                <td className="px-2 py-1">
                                  <span className="flex flex-wrap gap-1">
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
                                  </span>
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
                            colSpan={13}
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

const monitoringColors: Record<string, string> = {
  Enabled: "bg-emerald-100 text-emerald-800",
  Disabled: "bg-slate-100 text-slate-600",
  Undecided: "bg-amber-100 text-amber-800",
};

const monitoringLabels: Record<string, TranslationKey> = {
  Enabled: "haproxy.monitoringEnabled",
  Disabled: "haproxy.monitoringDisabled",
  Undecided: "haproxy.monitoringUndecided",
};

function formatSampleAge(value: string, language: Language): string {
  const minutes = Math.round((Date.now() - Date.parse(value)) / 60_000);
  const relative = new Intl.RelativeTimeFormat(localeFor(language), {
    numeric: "auto",
  });
  if (Math.abs(minutes) < 60) return relative.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(-hours, "hour");
  return relative.format(-Math.round(hours / 24), "day");
}

const serverStatusColors: Record<string, string> = {
  UP: "bg-emerald-100 text-emerald-800",
  DOWN: "bg-red-100 text-red-700",
  MAINT: "bg-amber-100 text-amber-800",
  DRAIN: "bg-sky-100 text-sky-800",
  NOLB: "bg-violet-100 text-violet-800",
  NOCHECK: "bg-slate-100 text-slate-600",
};

const serverStatusBarColors: Record<string, string> = {
  UP: "bg-emerald-500",
  DOWN: "bg-red-500",
  MAINT: "bg-amber-500",
  DRAIN: "bg-sky-500",
  NOLB: "bg-violet-500",
  NOCHECK: "bg-slate-400",
  OTHER: "bg-slate-400",
};

function serverStatusLabel(status: string): string {
  const tokens = status
    .trim()
    .toUpperCase()
    .split(/[\s(]+/);
  if (tokens[0] === "NO" && tokens[1] === "CHECK") return "NOCHECK";
  return tokens[0] ?? "";
}

const serverStatusKeys = [
  "UP",
  "DOWN",
  "MAINT",
  "DRAIN",
  "NOLB",
  "NOCHECK",
  "OTHER",
] as const;

type ServerStatusKey = (typeof serverStatusKeys)[number];

function aggregateServerStatusKey(status: string): ServerStatusKey {
  const label = serverStatusLabel(status);
  return serverStatusKeys.find((key) => key === label) ?? "OTHER";
}

function ServerStatusBadge({ status }: { status: string }) {
  const label = serverStatusLabel(status);
  return (
    <span
      className={`rounded px-1 text-[10px] ${serverStatusColors[label] ?? "bg-slate-100 text-slate-600"}`}
    >
      {label || status}
    </span>
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

interface ChartSeries {
  label: string;
  color: string;
  points: HaproxyMetricPoint[];
}

function buildTicks(
  points: HaproxyMetricPoint[],
  language: Language,
  count = 5,
): { index: number; label: string }[] {
  if (points.length === 0) return [];
  const format = new Intl.DateTimeFormat(localeFor(language), {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const indices = Array.from({ length: count }, (_, index) =>
    Math.round((index * (points.length - 1)) / Math.max(1, count - 1)),
  );
  const seen = new Set<number>();
  return indices
    .filter((index) => {
      if (seen.has(index)) return false;
      seen.add(index);
      return true;
    })
    .map((index) => ({
      index,
      label: format.format(new Date(points[index].timestamp)),
    }));
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const factor =
    fraction <= 1
      ? 1
      : fraction <= 2
        ? 2
        : fraction <= 2.5
          ? 2.5
          : fraction <= 5
            ? 5
            : 10;
  return factor * exponent;
}

function formatAxis(value: number, language: Language): string {
  return new Intl.NumberFormat(localeFor(language), {
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}

function formatPercent(value: number | null, language: Language): string {
  if (value === null) return "—";
  return `${new Intl.NumberFormat(localeFor(language), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)} %`;
}

type ChartMetric = "req" | "h5xx" | "rtime";

function metricValue(point: HaproxyMetricPoint, metric: ChartMetric): number {
  if (metric === "rtime") return point.rtime;
  return metric === "h5xx" ? point.h5xx : point.req;
}

/** Unit appended to a metric value in legend, tooltip and axis: rate or ms. */
function metricUnit(metric: ChartMetric): string {
  return metric === "rtime" ? " ms" : "/min";
}

interface ChartLine {
  label: string;
  color: string;
  value: (point: HaproxyMetricPoint) => number;
  /** Own y scale, so errors stay visible next to the request axis. */
  scale: number;
  /** Value shown in the legend. */
  max: number;
  area?: string;
}

function useChartWidth(fallback = 600) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);
  const ref = useCallback((node: HTMLDivElement | null) => {
    setElement(node);
  }, []);
  useLayoutEffect(() => {
    if (!element || typeof ResizeObserver === "undefined") return;
    const update = () =>
      setWidth(Math.max(320, Math.round(element.clientWidth)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return { ref, width };
}

function MetricChart({
  points,
  series,
  language,
  metric = "req",
}: {
  points: HaproxyMetricPoint[];
  series?: ChartSeries[];
  language: Language;
  metric?: ChartMetric;
}) {
  const { t } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const { ref: chartRef, width } = useChartWidth();
  const unit = metricUnit(metric);
  if (series && series.length > 0) {
    const height = 210;
    const left = 46;
    const right = 12;
    const top = 8;
    const bottom = 8;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const chartSeries = series.map((item) => ({
      ...item,
      points: metric === "rtime" ? item.points : toPerMinute(item.points),
    }));
    const maxValue = Math.max(
      0,
      ...chartSeries.flatMap((item) =>
        item.points.map((point) => metricValue(point, metric)),
      ),
    );
    const axisMax = niceMax(maxValue);
    const count = Math.max(...chartSeries.map((item) => item.points.length), 1);
    const x = (index: number) =>
      left + (index / Math.max(1, count - 1)) * plotWidth;
    const y = (value: number) => top + (1 - value / axisMax) * plotHeight;
    const grid = Array.from({ length: 5 }, (_, index) => {
      const value = (axisMax * index) / 4;
      const lineY = y(value);
      return (
        <g key={value}>
          <line
            x1={left}
            x2={width - right}
            y1={lineY}
            y2={lineY}
            stroke="#cbd5e1"
            strokeWidth={0.7}
            strokeDasharray={index === 0 ? undefined : "3 3"}
          />
          <text
            x={left - 6}
            y={lineY + 4}
            textAnchor="end"
            fontSize={10}
            fill="#64748b"
          >
            {formatAxis(value, language)}
          </text>
        </g>
      );
    });
    const tickSeries = chartSeries.reduce((best, item) =>
      item.points.length > best.points.length ? item : best,
    );
    const hoverIndex = hover !== null && hover < count ? hover : null;
    const hoverX = hoverIndex !== null ? x(hoverIndex) : 0;
    const move = (event: ReactPointerEvent<SVGSVGElement>) => {
      const matrix = event.currentTarget.getScreenCTM();
      if (!matrix) return;
      const inverse = matrix.inverse();
      const px =
        inverse.a * event.clientX + inverse.c * event.clientY + inverse.e;
      const index = Math.round(
        ((px - left) / plotWidth) * Math.max(1, count - 1),
      );
      setHover(Math.max(0, Math.min(count - 1, index)));
    };
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {chartSeries.map((item) => {
            const seriesMax = Math.max(
              0,
              ...item.points.map((point) => metricValue(point, metric)),
            );
            return (
              <span key={item.label} className="flex items-center gap-1">
                <span
                  className="h-0.5 w-4"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
                <span className="text-slate-400">
                  max {formatAxis(seriesMax, language)}
                  {unit}
                </span>
              </span>
            );
          })}
          <span className="ml-auto">
            max {formatAxis(maxValue, language)}
            {unit}
          </span>
        </div>
        <div ref={chartRef} className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`HAProxy ${metric} per serie`}
            className="h-[210px] w-full cursor-crosshair rounded-md bg-slate-50 ring-1 ring-slate-200"
            onPointerMove={move}
            onPointerLeave={() => setHover(null)}
          >
            {grid}
            {chartSeries.map((item) => (
              <path
                key={item.label}
                d={item.points
                  .map(
                    (point, index) =>
                      `${index === 0 ? "M" : "L"}${x(index)},${y(metricValue(point, metric))}`,
                  )
                  .join(" ")}
                fill="none"
                stroke={item.color}
                strokeWidth={1.5}
              />
            ))}
            {hoverIndex !== null && (
              <>
                <line
                  x1={hoverX}
                  x2={hoverX}
                  y1={top}
                  y2={top + plotHeight}
                  stroke="#94a3b8"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                {chartSeries.map((item) => {
                  const point = item.points[hoverIndex];
                  return point ? (
                    <circle
                      key={item.label}
                      cx={x(hoverIndex)}
                      cy={y(metricValue(point, metric))}
                      r={2.5}
                      fill={item.color}
                    />
                  ) : null;
                })}
              </>
            )}
          </svg>
          {hoverIndex !== null && tickSeries.points[hoverIndex] && (
            <div
              className="pointer-events-none absolute z-10 w-48 rounded-md border border-slate-200 bg-white p-2 text-[10px] shadow-lg"
              style={{
                left: `${(hoverX / width) * 100}%`,
                top: 4,
                transform:
                  hoverX > width / 2
                    ? "translateX(calc(-100% - 8px))"
                    : "translateX(8px)",
              }}
            >
              <p className="mb-1 font-medium text-slate-700">
                {formatDateTime(
                  tickSeries.points[hoverIndex].timestamp,
                  language,
                )}
              </p>
              {chartSeries.map((item) => {
                const point = item.points[hoverIndex];
                return (
                  <p key={item.label} className="flex items-center gap-1">
                    <span
                      className="h-2 w-2"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="truncate">{item.label}</span>
                    <span className="ml-auto font-medium tabular-nums">
                      {point
                        ? `${formatAxis(metricValue(point, metric), language)}${unit}`
                        : "—"}
                    </span>
                  </p>
                );
              })}
            </div>
          )}
        </div>
        <div className="relative h-3 text-[10px] text-slate-500">
          {buildTicks(tickSeries.points, language).map(
            (tick, tickIndex, ticks) => (
              <span
                key={tick.index}
                className="absolute top-0 whitespace-nowrap"
                style={{
                  left: `${
                    ((left +
                      (tick.index / Math.max(1, tickSeries.points.length - 1)) *
                        plotWidth) /
                      width) *
                    100
                  }%`,
                  transform:
                    tickIndex === 0
                      ? undefined
                      : tickIndex === ticks.length - 1
                        ? "translateX(-100%)"
                        : "translateX(-50%)",
                }}
              >
                {tick.label}
              </span>
            ),
          )}
        </div>
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
  const chartPoints = metric === "rtime" ? points : toPerMinute(points);
  const maxOf = (pick: (point: HaproxyMetricPoint) => number) =>
    Math.max(0, ...chartPoints.map(pick));
  const maxReq = maxOf((point) => point.req);
  const errorMax = (pick: (point: HaproxyMetricPoint) => number) =>
    Math.max(1, maxOf(pick));
  const lines: ChartLine[] =
    metric === "rtime"
      ? [
          {
            label: t("haproxy.responseTimeMs"),
            color: "#0ea5e9",
            value: (point) => point.rtime,
            scale: niceMax(maxOf((point) => point.rtime)),
            max: maxOf((point) => point.rtime),
            area: "rgba(14,165,233,0.12)",
          },
        ]
      : [
          {
            label: "req/min",
            color: "#0ea5e9",
            value: (point) => point.req,
            scale: niceMax(maxReq),
            max: maxReq,
            area: "rgba(14,165,233,0.12)",
          },
          {
            label: t("haproxy.errors4xx"),
            color: "#f59e0b",
            value: (point) => point.h4xx,
            scale: errorMax((point) => point.h4xx),
            max: errorMax((point) => point.h4xx),
          },
          {
            label: t("haproxy.errors5xx"),
            color: "#ef4444",
            value: (point) => point.h5xx,
            scale: errorMax((point) => point.h5xx),
            max: errorMax((point) => point.h5xx),
          },
        ];
  return (
    <MetricLineChart
      points={chartPoints}
      lines={lines}
      unit={unit}
      language={language}
      label={
        metric === "rtime"
          ? "HAProxy tempo di risposta (ms)"
          : "HAProxy req/min, 4xx/min e 5xx/min"
      }
    />
  );
}

function MetricLineChart({
  points,
  lines,
  unit,
  language,
  label,
}: {
  points: HaproxyMetricPoint[];
  lines: ChartLine[];
  unit: string;
  language: Language;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const { ref: chartRef, width } = useChartWidth();
  const height = 210;
  const left = 46;
  const right = 12;
  const top = 8;
  const bottom = 8;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const axisMax = lines[0].scale;
  const x = (index: number) =>
    left + (index / Math.max(1, points.length - 1)) * plotWidth;
  const y = (value: number, scale: number) =>
    top + (1 - value / scale) * plotHeight;
  const paths = lines.map((line) => {
    const values = points.map((point) => line.value(point));
    return {
      ...line,
      values,
      path: values
        .map(
          (value, index) =>
            `${index === 0 ? "M" : "L"}${x(index)},${y(value, line.scale)}`,
        )
        .join(" "),
    };
  });
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = (axisMax * index) / 4;
    const lineY = y(value, axisMax);
    return (
      <g key={value}>
        <line
          x1={left}
          x2={width - right}
          y1={lineY}
          y2={lineY}
          stroke="#cbd5e1"
          strokeWidth={0.7}
          strokeDasharray={index === 0 ? undefined : "3 3"}
        />
        <text
          x={left - 6}
          y={lineY + 4}
          textAnchor="end"
          fontSize={10}
          fill="#64748b"
        >
          {formatAxis(value, language)}
        </text>
      </g>
    );
  });
  const hoverIndex = hover !== null && hover < points.length ? hover : null;
  const hoverX = hoverIndex !== null ? x(hoverIndex) : 0;
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const inverse = matrix.inverse();
    const px =
      inverse.a * event.clientX + inverse.c * event.clientY + inverse.e;
    const index = Math.round(
      ((px - left) / plotWidth) * Math.max(1, points.length - 1),
    );
    setHover(Math.max(0, Math.min(points.length - 1, index)));
  };
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        {paths.map((line) => (
          <span key={line.label} className="flex items-center gap-1">
            <span
              className="h-0.5 w-4"
              style={{ backgroundColor: line.color }}
            />
            {line.label}
            <span className="text-slate-400">
              max {formatAxis(line.max, language)}
              {unit}
            </span>
          </span>
        ))}
      </div>
      <div ref={chartRef} className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={label}
          className="h-[210px] w-full cursor-crosshair rounded-md bg-slate-50 ring-1 ring-slate-200"
          onPointerMove={move}
          onPointerLeave={() => setHover(null)}
        >
          {grid}
          {paths.map(
            (line) =>
              line.area && (
                <path
                  key={`${line.label}-area`}
                  d={`${line.path} L${x(points.length - 1)},${top + plotHeight} L${x(0)},${top + plotHeight} Z`}
                  fill={line.area}
                />
              ),
          )}
          {paths.map((line) => (
            <path
              key={line.label}
              d={line.path}
              fill="none"
              stroke={line.color}
              strokeWidth={1.5}
            />
          ))}
          {hoverIndex !== null && (
            <>
              <line
                x1={hoverX}
                x2={hoverX}
                y1={top}
                y2={top + plotHeight}
                stroke="#94a3b8"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {paths.map((line) => (
                <circle
                  key={line.label}
                  cx={hoverX}
                  cy={y(line.values[hoverIndex], line.scale)}
                  r={2.5}
                  fill={line.color}
                />
              ))}
            </>
          )}
        </svg>
        {hoverIndex !== null && (
          <div
            className="pointer-events-none absolute z-10 w-48 rounded-md border border-slate-200 bg-white p-2 text-[10px] shadow-lg"
            style={{
              left: `${(hoverX / width) * 100}%`,
              top: 4,
              transform:
                hoverX > width / 2
                  ? "translateX(calc(-100% - 8px))"
                  : "translateX(8px)",
            }}
          >
            <p className="mb-1 font-medium text-slate-700">
              {formatDateTime(points[hoverIndex].timestamp, language)}
            </p>
            {paths.map((line) => (
              <p key={line.label} className="flex items-center gap-1">
                <span
                  className="h-2 w-2"
                  style={{ backgroundColor: line.color }}
                />
                <span className="truncate">{line.label}</span>
                <span className="ml-auto font-medium tabular-nums">
                  {formatAxis(line.values[hoverIndex], language)}
                  {unit}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
      <div className="relative h-3 text-[10px] text-slate-500">
        {buildTicks(points, language).map((tick, tickIndex, ticks) => (
          <span
            key={tick.index}
            className="absolute top-0 whitespace-nowrap"
            style={{
              left: `${
                ((left +
                  (tick.index / Math.max(1, points.length - 1)) * plotWidth) /
                  width) *
                100
              }%`,
              transform:
                tickIndex === 0
                  ? undefined
                  : tickIndex === ticks.length - 1
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
            }}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  );
}
