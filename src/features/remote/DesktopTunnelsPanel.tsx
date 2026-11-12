import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import {
  isDesktopBridgeAvailable,
  subscribeDesktopMessages,
} from "../../lib/desktopBridge";
import {
  cancelDesktopTunnelLogin,
  type DesktopActiveTunnel,
  type DesktopTunnelAuth,
  type DesktopTunnelServer,
  loginDesktopTunnels,
  logoutDesktopTunnels,
  openDesktopExternal,
  parseDesktopTunnelEvent,
  parseLocalPort,
  requestDesktopTunnelTargets,
  restoreDesktopTunnels,
  startDesktopDeploymentTunnel,
  startDesktopServiceTunnel,
  stopDesktopTunnel,
} from "../../lib/desktopTunnels";
import { useI18n } from "../../lib/i18n";
import type { TunnelServiceMode } from "../../lib/tunnelServices";

type Status = {
  tone: "log" | "warning" | "error";
  message: string;
};

/** Mostrato solo dentro il webview desktop: fuori non esiste il bridge. */
export function DesktopTunnelsPanel() {
  if (!isDesktopBridgeAvailable()) return null;
  return <DesktopTunnelsPanelContent />;
}

function DesktopTunnelsPanelContent() {
  const { t } = useI18n();
  const instanceUrl = window.location.origin;
  const [auth, setAuth] = useState<DesktopTunnelAuth | null>(null);
  const [targets, setTargets] = useState<DesktopTunnelServer[]>([]);
  const [active, setActive] = useState<DesktopActiveTunnel[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [ports, setPorts] = useState<Record<string, string>>({});
  const lastToken = useRef<string | null>(null);

  useEffect(
    () =>
      subscribeDesktopMessages((message) => {
        const event = parseDesktopTunnelEvent(message, instanceUrl);
        if (!event) return;

        if (event.kind === "auth") {
          setAuth(event.auth);
          if (
            event.auth.status === "pending" ||
            event.auth.status === "none" ||
            event.auth.status === "logout" ||
            (event.auth.status === "error" && event.auth.requiresLogin)
          ) {
            setTargets([]);
          }
          if (
            event.auth.status === "logout" ||
            (event.auth.status === "error" && event.auth.requiresLogin)
          ) {
            lastToken.current = null;
          }
          if (event.auth.status === "error") {
            setStatus({
              tone: "error",
              message: event.auth.message ?? t("common.operationError"),
            });
          }
          return;
        }

        if (event.kind === "targets") {
          setTargets(event.items);
          setAuth((current) =>
            current?.status === "none" ||
            current?.status === "logout" ||
            current?.status === "error"
              ? null
              : current,
          );
          setStatus(
            event.items.length === 0
              ? { tone: "log", message: t("desktopTunnels.targetsEmpty") }
              : null,
          );
          return;
        }

        if (event.kind === "state") {
          setActive(event.items);
          return;
        }

        setStatus({ tone: event.tone, message: event.message });
      }),
    [instanceUrl, t],
  );

  useEffect(() => {
    restoreDesktopTunnels();
  }, []);

  const modeLabel = (mode: TunnelServiceMode) =>
    mode === "Dynamic"
      ? t("tunnelServices.modeDynamic")
      : mode === "Remote"
        ? t("tunnelServices.modeRemote")
        : t("tunnelServices.modeLocal");

  const startDeployment = (
    server: DesktopTunnelServer,
    targetId: number,
    suggested: number | null,
    application: string,
  ) => {
    const key = `${server.serverId}-${targetId}`;
    const parsed = parseLocalPort(
      ports[key] ?? (suggested === null ? "" : String(suggested)),
    );
    if (!parsed.ok) {
      setStatus({
        tone: "error",
        message: t("desktopTunnels.localPortInvalid"),
      });
      return;
    }
    setStatus({
      tone: "log",
      message: t("desktopTunnels.starting", { name: application }),
    });
    startDesktopDeploymentTunnel(server.serverId, targetId, parsed.value);
  };

  const startService = (
    server: DesktopTunnelServer,
    serviceId: number,
    serviceMode: TunnelServiceMode,
    configuredPort: number | null,
    name: string,
  ) => {
    const key = `service-${server.serverId}-${serviceId}`;
    let localPort: number | null = null;
    if (serviceMode !== "Remote") {
      const parsed = parseLocalPort(
        ports[key] ?? (configuredPort === null ? "" : String(configuredPort)),
      );
      if (!parsed.ok) {
        setStatus({
          tone: "error",
          message: t("desktopTunnels.localPortInvalid"),
        });
        return;
      }
      localPort = parsed.value;
    }
    setStatus({
      tone: "log",
      message: t("desktopTunnels.serviceStarting", { name }),
    });
    startDesktopServiceTunnel(server.serverId, serviceId, localPort);
  };

  const sessionActive =
    targets.length > 0 ||
    auth?.status === "restored" ||
    auth?.status === "success";
  const pending =
    auth?.status === "pending"
      ? (auth.verificationUriComplete ?? auth.verificationUri)
      : null;

  return (
    <section
      data-testid="desktop-tunnels-panel"
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
      aria-labelledby="desktop-tunnels-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2
            id="desktop-tunnels-title"
            className="text-sm font-semibold text-slate-900"
          >
            {t("desktopTunnels.title")}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {t("desktopTunnels.description")}
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            requestDesktopTunnelTargets(lastToken.current ?? undefined)
          }
          title={t("desktopTunnels.refresh")}
          className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
          {t("desktopTunnels.refresh")}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = token.trim();
            if (!value) {
              setStatus({
                tone: "error",
                message: t("desktopTunnels.tokenRequired"),
              });
              return;
            }
            setToken("");
            setTargets([]);
            setAuth(null);
            lastToken.current = value;
            setStatus({
              tone: "log",
              message: t("desktopTunnels.loadingTargets"),
            });
            requestDesktopTunnelTargets(value);
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            {t("desktopTunnels.token")}
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={t("desktopTunnels.tokenPlaceholder")}
              className="w-52 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {t("desktopTunnels.loadTargets")}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setTargets([]);
            setAuth(null);
            setStatus(null);
            lastToken.current = null;
            loginDesktopTunnels();
          }}
          disabled={auth?.status === "pending"}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {t("desktopTunnels.keycloakLogin")}
        </button>
        {sessionActive && (
          <button
            type="button"
            onClick={() => {
              setTargets([]);
              setAuth(null);
              lastToken.current = null;
              logoutDesktopTunnels();
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {t("desktopTunnels.logout")}
          </button>
        )}
      </div>

      <AuthState
        auth={auth}
        hasTargets={targets.length > 0}
        pendingUrl={pending}
        onCancel={() => {
          cancelDesktopTunnelLogin();
          setAuth(null);
          setStatus(null);
        }}
      />

      {status?.message && (
        <p
          role={status.tone === "error" ? "alert" : "status"}
          className={`rounded px-3 py-2 text-sm ${
            status.tone === "error"
              ? "bg-red-50 text-red-700"
              : status.tone === "warning"
                ? "bg-amber-50 text-amber-800"
                : "bg-slate-50 text-slate-600"
          }`}
        >
          {status.message}
        </p>
      )}

      <div className="space-y-3">
        {targets.map((server) => (
          <article
            key={server.serverId}
            className="rounded-md border border-slate-200 p-3"
          >
            <h3 className="text-sm font-semibold text-slate-900">
              {server.serverName}
            </h3>
            <p className="mt-0.5 font-mono text-xs text-slate-500">
              {t("desktopTunnels.serverMeta", {
                environment: server.environmentLabel,
                username: server.username,
                host: server.sshHost,
                port: server.sshPort,
              })}
              {jumpChain(server).length > 0
                ? ` · ${t("desktopTunnels.jump")} ${jumpChain(server)}`
                : ""}
            </p>

            <ul className="mt-2 space-y-2">
              {server.targets.map((target) => {
                const key = `${server.serverId}-${target.serverApplicationId}`;
                return (
                  <li
                    key={target.serverApplicationId}
                    className="flex flex-wrap items-end justify-between gap-2 rounded border-t border-slate-100 pt-2"
                  >
                    <p className="text-sm text-slate-700">
                      {t("desktopTunnels.targetMeta", {
                        application: target.application,
                        version: target.version,
                        host: target.targetHost,
                        port: target.targetPort,
                      })}
                    </p>
                    <div className="flex items-end gap-2">
                      <label className="flex flex-col gap-1 text-[11px] text-slate-500">
                        {t("desktopTunnels.localPort")}
                        <input
                          type="number"
                          min={1024}
                          max={65535}
                          aria-label={t("desktopTunnels.localPortFor", {
                            name: `${target.application} ${target.version}`,
                          })}
                          placeholder={t("desktopTunnels.localPortPlaceholder")}
                          value={
                            ports[key] ??
                            (target.suggestedLocalPort === null
                              ? ""
                              : String(target.suggestedLocalPort))
                          }
                          onChange={(event) =>
                            setPorts((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                          className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                      </label>
                      <button
                        type="button"
                        data-testid={`desktop-tunnel-start-${target.serverApplicationId}`}
                        onClick={() =>
                          startDeployment(
                            server,
                            target.serverApplicationId,
                            target.suggestedLocalPort,
                            target.application,
                          )
                        }
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      >
                        {t("desktopTunnels.open")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            {server.services.length > 0 && (
              <>
                <p className="mt-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  {t("desktopTunnels.customServices")}
                </p>
                <ul className="mt-1 space-y-2">
                  {server.services.map((service) => {
                    const key = `service-${server.serverId}-${service.id}`;
                    return (
                      <li
                        key={service.id}
                        className="flex flex-wrap items-end justify-between gap-2 rounded border-t border-slate-100 pt-2"
                      >
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-1.5 text-sm text-slate-700">
                            <span className="truncate">{service.name}</span>
                            <ModeBadge
                              label={modeLabel(service.mode)}
                              mode={service.mode}
                            />
                            {service.autoStart && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                                {t("desktopTunnels.autoBadge")}
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 font-mono text-xs text-slate-500">
                            {service.mode === "Dynamic"
                              ? "SOCKS"
                              : `${service.targetHost ?? "—"}:${service.targetPort ?? "—"}`}
                            {" · "}
                            {service.mode === "Remote"
                              ? `${t("tunnelServices.remotePort")} :${service.remotePort ?? "—"}`
                              : `${t("tunnelServices.localPort")} :${service.localPort ?? "—"}`}
                            {" · "}
                            {service.kind}
                          </p>
                        </div>
                        <div className="flex items-end gap-2">
                          {service.mode !== "Remote" && (
                            <label className="flex flex-col gap-1 text-[11px] text-slate-500">
                              {t("desktopTunnels.localPort")}
                              <input
                                type="number"
                                min={1024}
                                max={65535}
                                aria-label={t("desktopTunnels.localPortFor", {
                                  name: service.name,
                                })}
                                placeholder={t(
                                  "desktopTunnels.localPortPlaceholder",
                                )}
                                value={
                                  ports[key] ??
                                  (service.localPort === null
                                    ? ""
                                    : String(service.localPort))
                                }
                                onChange={(event) =>
                                  setPorts((current) => ({
                                    ...current,
                                    [key]: event.target.value,
                                  }))
                                }
                                className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                              />
                            </label>
                          )}
                          <button
                            type="button"
                            data-testid={`desktop-tunnel-start-service-${service.id}`}
                            disabled={!service.enabled}
                            onClick={() =>
                              startService(
                                server,
                                service.id,
                                service.mode,
                                service.localPort,
                                service.name,
                              )
                            }
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
                          >
                            {t("desktopTunnels.start")}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </article>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900">
          {t("desktopTunnels.activeTitle")}
        </h3>
        {active.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">
            {t("desktopTunnels.activeNone")}
          </p>
        ) : (
          <ul className="mt-1 space-y-2">
            {active.map((tunnel) => (
              <li
                key={tunnel.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm text-slate-700">
                    <span className="truncate">
                      {tunnel.application} · {tunnel.serverName}
                    </span>
                    <ModeBadge
                      label={modeLabel(tunnel.mode)}
                      mode={tunnel.mode}
                    />
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">
                    {activeForward(tunnel)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {tunnel.openUrl && (
                    <button
                      type="button"
                      data-testid={`desktop-tunnel-open-${tunnel.id}`}
                      onClick={() => openDesktopExternal(tunnel.openUrl ?? "")}
                      className="flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
                    >
                      <ArrowTopRightOnSquareIcon
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      {t("desktopTunnels.open")}
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid={`desktop-tunnel-stop-${tunnel.id}`}
                    onClick={() => stopDesktopTunnel(tunnel.id)}
                    className="rounded-md border border-red-200 px-2.5 py-1.5 text-sm text-red-700"
                  >
                    {t("desktopTunnels.stop")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function AuthState({
  auth,
  hasTargets,
  pendingUrl,
  onCancel,
}: {
  auth: DesktopTunnelAuth | null;
  hasTargets: boolean;
  pendingUrl: string | null;
  onCancel: () => void;
}) {
  const { t } = useI18n();

  if (auth?.status === "pending") {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <p>
          {auth.userCode
            ? t("desktopTunnels.devicePending", { code: auth.userCode })
            : t("desktopTunnels.deviceNoCode")}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {pendingUrl && (
            <button
              type="button"
              onClick={() => openDesktopExternal(pendingUrl)}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
            >
              {t("desktopTunnels.openVerification")}
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {t("desktopTunnels.cancel")}
          </button>
        </div>
      </div>
    );
  }

  if (auth?.status === "restoring") {
    return (
      <p className="text-sm text-slate-500">
        {t("desktopTunnels.sessionRestoring")}
      </p>
    );
  }

  if (auth?.status === "none") {
    return (
      <p className="text-sm text-slate-500">
        {t("desktopTunnels.sessionNone")}
      </p>
    );
  }

  if (auth?.status === "logout") {
    return (
      <p className="text-sm text-slate-500">
        {auth.message ?? t("desktopTunnels.sessionLogout")}
      </p>
    );
  }

  if (auth?.status === "error") {
    return null;
  }

  if (auth?.status === "restored") {
    return (
      <p className="text-sm text-emerald-700">
        {auth.saved
          ? t("desktopTunnels.sessionSavedRestored")
          : t("desktopTunnels.sessionRestored")}
      </p>
    );
  }

  if (auth?.status === "success") {
    return (
      <p className="text-sm text-emerald-700">
        {auth.saved
          ? t("desktopTunnels.sessionSaved")
          : t("desktopTunnels.sessionActive")}
      </p>
    );
  }

  if (hasTargets) {
    return (
      <p className="text-sm text-emerald-700">
        {t("desktopTunnels.sessionActive")}
      </p>
    );
  }

  return null;
}

function ModeBadge({
  label,
  mode,
}: {
  label: string;
  mode: TunnelServiceMode;
}) {
  const tone =
    mode === "Dynamic"
      ? "bg-sky-100 text-sky-700"
      : mode === "Remote"
        ? "bg-violet-100 text-violet-700"
        : "bg-emerald-100 text-emerald-700";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] ${tone}`}>{label}</span>
  );
}

function jumpChain(server: DesktopTunnelServer): string {
  const jumps =
    server.jumps.length > 0 ? server.jumps : server.jump ? [server.jump] : [];
  return jumps
    .map((jump) => `${jump.username}@${jump.host}:${jump.port}`)
    .join(" → ");
}

function port(value: number | null): string {
  return value === null ? "—" : String(value);
}

function activeForward(tunnel: DesktopActiveTunnel): string {
  if (tunnel.mode === "Dynamic")
    return `SOCKS 127.0.0.1:${port(tunnel.localPort)}`;
  if (tunnel.mode === "Remote")
    return `${tunnel.serverName || "server"}:${port(tunnel.remotePort)} → ${tunnel.targetHost ?? "—"}:${port(tunnel.targetPort)}`;
  return `127.0.0.1:${port(tunnel.localPort)} → ${tunnel.targetHost ?? "—"}:${port(tunnel.targetPort)}`;
}
