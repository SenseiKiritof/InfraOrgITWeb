import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeaderSlot } from "../../components/PageHeaderSlot";
import { formatDateTime } from "../../lib/format";
import {
  getHaproxyInstances,
  getHaproxyRoutes,
  getHaproxyServers,
} from "../../lib/haproxy";
import { useI18n } from "../../lib/i18n";

export function HaproxyPage() {
  const { t, language } = useI18n();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<"routes" | "servers">("routes");
  const [filter, setFilter] = useState("");
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
            </div>
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t("haproxy.filter")}
              className="min-w-48 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <span className="text-xs text-slate-500">
              {tab === "routes" ? routeRows.length : serverRows.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            {tab === "routes" ? (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="px-2 py-1">{t("haproxy.host")}</th>
                    <th className="px-2 py-1">{t("haproxy.frontend")}</th>
                    <th className="px-2 py-1">{t("haproxy.backend")}</th>
                    <th className="px-2 py-1">{t("haproxy.bind")}</th>
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
                      <td className="px-2 py-1 font-mono">{row.bind || "—"}</td>
                    </tr>
                  ))}
                  {routeRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
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
        </div>
      )}
    </section>
  );
}
