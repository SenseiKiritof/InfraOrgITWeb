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
      "db.internal:5432 · local:15432 · ServerApplication #7 · server #3",
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
