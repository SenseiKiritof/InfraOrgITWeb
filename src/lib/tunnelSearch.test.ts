import { describe, expect, it } from "vitest";
import type {
  DesktopActiveTunnel,
  DesktopTunnelServer,
} from "./desktopTunnels";
import {
  filterActiveTunnels,
  filterTunnelServers,
  filterTunnelSessions,
} from "./tunnelSearch";
import type { TunnelSession } from "./tunnelSessions";

function session(overrides: Partial<TunnelSession> = {}): TunnelSession {
  return {
    id: 1,
    sessionKey: "s1",
    username: "mario",
    clientId: "42",
    serverId: 93,
    serverName: "db001tskm",
    application: "mysql",
    serviceId: null,
    serviceName: null,
    mode: "Local",
    transport: "Client",
    localPort: 3306,
    targetHost: "10.31.184.184",
    targetPort: 3306,
    remotePort: null,
    startedAt: "2026-11-17T10:00:00Z",
    lastSeenAt: "2026-11-17T10:01:00Z",
    status: "Active",
    ...overrides,
  };
}

function service(id: number, name: string) {
  return {
    id,
    serverId: 93,
    name,
    mode: "Local" as const,
    targetHost: "10.31.184.184",
    targetPort: 5432,
    localPort: 5432,
    remotePort: null,
    kind: "Tcp" as const,
    openPath: null,
    autoStart: false,
    enabled: true,
  };
}

function server(
  overrides: Partial<DesktopTunnelServer> = {},
): DesktopTunnelServer {
  return {
    serverId: 93,
    serverName: "db001tskm",
    environmentLabel: "Fastweb / INT",
    sshHost: "10.31.184.184",
    sshPort: 22,
    username: "x3solutions",
    jump: null,
    jumps: [],
    targets: [
      {
        serverApplicationId: 78,
        applicationId: 87,
        application: "be-lh-sys",
        version: "1.0.0",
        targetHost: "10.31.184.184",
        targetPort: 58020,
        suggestedLocalPort: 58020,
      },
      {
        serverApplicationId: 79,
        applicationId: 88,
        application: "mysql",
        version: "8.4",
        targetHost: "10.31.184.184",
        targetPort: 3306,
        suggestedLocalPort: 3306,
      },
    ],
    services: [service(1, "Postgres"), service(2, "Redis")],
    ...overrides,
  };
}

function active(
  overrides: Partial<DesktopActiveTunnel> = {},
): DesktopActiveTunnel {
  return {
    id: "t1",
    url: "https://localhost:8443",
    instanceName: "Locale Caddy",
    serverName: "db001tskm",
    application: "mysql",
    serviceId: null,
    mode: "Local",
    kind: "Tcp",
    targetHost: "10.31.184.184",
    targetPort: 3306,
    localPort: 3306,
    remotePort: null,
    openUrl: null,
    ...overrides,
  };
}

describe("filterTunnelSessions", () => {
  it("filtra per server, utente, applicazione e porta", () => {
    const items = [
      session(),
      session({
        id: 2,
        serverName: "ws101tskm",
        application: "nginx",
        localPort: 8080,
      }),
    ];
    expect(filterTunnelSessions(items, "db001")).toHaveLength(1);
    expect(filterTunnelSessions(items, "mario")).toHaveLength(2);
    expect(filterTunnelSessions(items, "nginx")).toEqual([items[1]]);
    expect(filterTunnelSessions(items, "8080")).toEqual([items[1]]);
    expect(filterTunnelSessions(items, "  ")).toEqual(items);
  });
});

describe("filterTunnelServers", () => {
  it("mantiene tutti i target quando coincide il server", () => {
    const servers = filterTunnelServers([server()], "db001");
    expect(servers).toHaveLength(1);
    expect(servers[0].targets).toHaveLength(2);
    expect(servers[0].services).toHaveLength(2);
  });

  it("limita target e servizi alla corrispondenza", () => {
    const byApplication = filterTunnelServers([server()], "be-lh-sys");
    expect(byApplication[0].targets).toHaveLength(1);
    expect(byApplication[0].targets[0].application).toBe("be-lh-sys");
    expect(byApplication[0].services).toHaveLength(0);

    const byService = filterTunnelServers([server()], "postgres");
    expect(byService[0].targets).toHaveLength(0);
    expect(byService[0].services).toHaveLength(1);
    expect(byService[0].services[0].name).toBe("Postgres");
  });

  it("scarta i server senza corrispondenze", () => {
    expect(filterTunnelServers([server()], "nonesiste")).toEqual([]);
    expect(filterTunnelServers([server()], "")).toHaveLength(1);
  });
});

describe("filterActiveTunnels", () => {
  it("filtra per applicazione, server e porta locale", () => {
    const items = [
      active(),
      active({ id: "t2", application: "nginx", localPort: 8080 }),
    ];
    expect(filterActiveTunnels(items, "mysql")).toEqual([items[0]]);
    expect(filterActiveTunnels(items, "db001")).toHaveLength(2);
    expect(filterActiveTunnels(items, "8080")).toEqual([items[1]]);
  });
});
