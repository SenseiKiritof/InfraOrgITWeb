import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditEvent, AuditEventPage } from "./auditEvents";
import { formatAuditTarget, getAuditEvents } from "./auditEvents";

const event: AuditEvent = {
  id: 1,
  occurredAt: "2026-11-10T09:15:00Z",
  kind: "TunnelStart",
  actorUsername: "mario",
  clientId: "42",
  action: "tunnel.start",
  targetType: "ServerApplication",
  targetId: 7,
  serverId: 3,
  targetHost: "db.internal",
  targetPort: 5432,
  localPort: 15432,
  outcome: "Ok",
  errorCode: null,
  durationMs: 12,
  correlationId: "corr-1",
  serverName: null,
  targetLabel: null,
};

const payload: AuditEventPage = {
  items: [event],
  total: 1,
  page: 1,
  pageSize: 25,
};

function stubFetch() {
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getAuditEvents", () => {
  it("chiama il contratto con i parametri vuoti e legge la pagina", async () => {
    const fetchMock = stubFetch();

    await expect(getAuditEvents()).resolves.toEqual(payload);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/audit-events?page=1&pageSize=25&kind=&outcome=&q=&serverId=",
    );
  });

  it("passa filtri e paginazione", async () => {
    const fetchMock = stubFetch();

    await getAuditEvents({
      page: 2,
      pageSize: 50,
      kind: "TunnelError",
      outcome: "Error",
      q: "db",
      serverId: 3,
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/audit-events?page=2&pageSize=50&kind=TunnelError&outcome=Error&q=db&serverId=3",
    );
  });
});

describe("formatAuditTarget", () => {
  it("mostra host, porta locale, entità e server", () => {
    expect(formatAuditTarget(event)).toBe(
      "db.internal:5432 · local:15432 · Applicazione #7 · server #3",
    );
  });

  it("usa i nomi risolti dal backend", () => {
    expect(
      formatAuditTarget({
        ...event,
        serverName: "ws101tskm",
        targetLabel: "be-lh-sys",
      }),
    ).toBe(
      "db.internal:5432 · local:15432 · Applicazione be-lh-sys · ws101tskm",
    );
    expect(
      formatAuditTarget({
        ...event,
        targetType: "Server",
        targetId: 3,
        targetLabel: "ws001tskm",
        serverId: 3,
        serverName: "ws001tskm",
        targetHost: null,
        targetPort: null,
        localPort: null,
      }),
    ).toBe("ws001tskm");
    expect(
      formatAuditTarget({
        ...event,
        targetType: "McpAgent",
        targetId: 2,
        targetLabel: "opencode-skill",
        serverId: null,
        targetHost: null,
        targetPort: null,
        localPort: null,
      }),
    ).toBe("Agente MCP opencode-skill");
  });

  it("etichetta le letture MCP senza bersaglio", () => {
    const read = {
      ...event,
      kind: "McpToolCall" as const,
      targetType: null,
      targetId: null,
      targetHost: null,
      targetPort: null,
      localPort: null,
      serverId: null,
    };
    expect(formatAuditTarget({ ...read, action: "list_servers" })).toBe(
      "Inventario",
    );
    expect(formatAuditTarget({ ...read, action: "get_topology" })).toBe(
      "Topologia",
    );
    expect(formatAuditTarget({ ...read, action: "list_executions" })).toBe(
      "Registro esecuzioni",
    );
  });

  it("ripiega sul solo server e su un trattino", () => {
    expect(
      formatAuditTarget({
        ...event,
        targetType: null,
        targetId: null,
        targetHost: null,
        targetPort: null,
        localPort: null,
        serverId: 3,
      }),
    ).toBe("server #3");
    expect(
      formatAuditTarget({
        ...event,
        targetType: null,
        targetId: null,
        targetHost: null,
        targetPort: null,
        localPort: null,
        serverId: null,
      }),
    ).toBe("—");
  });
});
