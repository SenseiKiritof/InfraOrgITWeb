import type {
  DesktopActiveTunnel,
  DesktopTunnelServer,
} from "./desktopTunnels";
import type { TunnelSession } from "./tunnelSessions";

type SearchValue = string | number | null | undefined;

function matches(needle: string, values: SearchValue[]): boolean {
  if (!needle) return true;
  return values.some(
    (value) =>
      value !== null &&
      value !== undefined &&
      String(value).toLowerCase().includes(needle),
  );
}

function normalize(query: string): string {
  return query.trim().toLowerCase();
}

/** Filters the central tunnel projection by any visible column. */
export function filterTunnelSessions(
  items: TunnelSession[],
  query: string,
): TunnelSession[] {
  const needle = normalize(query);
  if (!needle) return items;
  return items.filter((session) =>
    matches(needle, [
      session.serverName,
      session.application,
      session.serviceName,
      session.username,
      session.mode,
      session.transport,
      session.status,
      session.targetHost,
      session.targetPort,
      session.localPort,
      session.remotePort,
    ]),
  );
}

/** Filters the desktop tunnel targets, pruning non-matching targets/services. */
export function filterTunnelServers(
  servers: DesktopTunnelServer[],
  query: string,
): DesktopTunnelServer[] {
  const needle = normalize(query);
  if (!needle) return servers;
  return servers.flatMap((server) => {
    const serverHit = matches(needle, [
      server.serverName,
      server.environmentLabel,
      server.sshHost,
      server.username,
    ]);
    const targets = serverHit
      ? server.targets
      : server.targets.filter((target) =>
          matches(needle, [
            target.application,
            target.version,
            target.targetHost,
            target.targetPort,
          ]),
        );
    const services = serverHit
      ? server.services
      : server.services.filter((service) =>
          matches(needle, [
            service.name,
            service.kind,
            service.mode,
            service.targetHost,
            service.targetPort,
          ]),
        );
    if (!serverHit && targets.length === 0 && services.length === 0) return [];
    return [{ ...server, targets, services }];
  });
}

/** Filters the desktop active tunnels shown by the local panel. */
export function filterActiveTunnels(
  items: DesktopActiveTunnel[],
  query: string,
): DesktopActiveTunnel[] {
  const needle = normalize(query);
  if (!needle) return items;
  return items.filter((tunnel) =>
    matches(needle, [
      tunnel.serverName,
      tunnel.application,
      tunnel.instanceName,
      tunnel.mode,
      tunnel.kind,
      tunnel.targetHost,
      tunnel.localPort,
      tunnel.remotePort,
    ]),
  );
}
