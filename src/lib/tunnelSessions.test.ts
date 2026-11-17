import { afterEach, describe, expect, it, vi } from "vitest";
import type { TunnelSession, TunnelSessionList } from "./tunnelSessions";
import { formatTunnelForward, getTunnelSessions } from "./tunnelSessions";

const session: TunnelSession = {
  id: 1,
  sessionKey: "9f1c",
  username: "mario",
  clientId: "42",
  serverId: 3,
  serverName: "db-01",
  application: "PostgreSQL",
  serviceId: null,
  serviceName: null,
  mode: "Local",
  transport: "Client",
  localPort: 15432,
  targetHost: "db.internal",
  targetPort: 5432,
  remotePort: null,
  startedAt: "2026-11-10T09:15:00Z",
  lastSeenAt: "2026-11-10T09:20:00Z",
  status: "Active",
};

const payload: TunnelSessionList = { items: [session] };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getTunnelSessions", () => {
  it("legge la proiezione dal contratto same-origin", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getTunnelSessions()).resolves.toEqual(payload);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/tunnels/sessions");
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe("include");
  });
});

describe("formatTunnelForward", () => {
  it("mostra la porta locale verso la destinazione per Local", () => {
    expect(formatTunnelForward(session)).toBe(
      "127.0.0.1:15432 → db.internal:5432",
    );
  });

  it("mostra il proxy SOCKS per Dynamic", () => {
    expect(
      formatTunnelForward({
        ...session,
        mode: "Dynamic",
        localPort: 1080,
        targetHost: null,
        targetPort: null,
      }),
    ).toBe("SOCKS 127.0.0.1:1080");
  });

  it("mostra la porta remota sul server per Remote", () => {
    expect(
      formatTunnelForward({
        ...session,
        mode: "Remote",
        localPort: null,
        remotePort: 8080,
        targetHost: "app.internal",
        targetPort: 80,
      }),
    ).toBe("db-01:8080 → app.internal:80");
  });

  it("non si rompe con le porte nulle", () => {
    expect(
      formatTunnelForward({
        ...session,
        mode: "Dynamic",
        localPort: null,
      }),
    ).toBe("SOCKS 127.0.0.1:—");
    expect(
      formatTunnelForward({
        ...session,
        mode: "Remote",
        localPort: null,
        remotePort: null,
        targetHost: null,
        targetPort: null,
      }),
    ).toBe("db-01:— → —:—");
    expect(
      formatTunnelForward({
        ...session,
        mode: "Local",
        localPort: null,
        targetHost: null,
        targetPort: null,
      }),
    ).toBe("127.0.0.1:— → —:—");
  });
});
