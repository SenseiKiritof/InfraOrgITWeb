import { afterEach, describe, expect, it, vi } from "vitest";
import { searchAll } from "./search";

function page<T>(items: T[]) {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 5,
  };
}

function stubSearch(payloads: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
    const path = new URL(String(url), "http://localhost").pathname;
    return new Response(JSON.stringify(payloads[path] ?? page([])), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("searchAll", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("non interroga l'API con meno di due caratteri", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchAll(" a ")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("unisce i tipi, li ordina e costruisce i link di dettaglio", async () => {
    const payloads: Record<string, unknown> = {
      "/api/providers": page([
        { id: 2, name: "Zeta", environmentCount: 1 },
        { id: 1, name: "Alpha", environmentCount: 0 },
      ]),
      "/api/environments": page([
        { id: 3, name: "Prod", description: "Production" },
      ]),
      "/api/servers": page([
        {
          id: 4,
          name: "srv-01",
          ipAddress: "10.0.0.1",
          providerEnvironmentLabel: "OVH / Prod",
        },
      ]),
      "/api/applications": page([
        { id: 5, name: "api", basePath: "/api", type: "Backend" },
      ]),
      "/api/projects": page([{ id: 6, name: "Core", description: null }]),
      "/api/diagrams": page([
        { id: 7, name: "Global", description: "Overview" },
      ]),
    };

    const fetchMock = stubSearch(payloads);

    const results = await searchAll(" fast ");

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(
      results.map((item) => `${item.type}:${item.name}:${item.href}`),
    ).toEqual([
      "provider:Alpha:/providers/1",
      "provider:Zeta:/providers/2",
      "environment:Prod:/environments/3",
      "server:srv-01:/servers/4",
      "application:api:/applications/5",
      "project:Core:/projects/6",
      "diagram:Global:/diagrams/7",
    ]);
    expect(results.find((item) => item.type === "server")?.detail).toBe(
      "10.0.0.1 · OVH / Prod",
    );

    const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    expect(url.searchParams.get("q")).toBe("fast");
    expect(url.searchParams.get("pageSize")).toBe("5");
  });

  it("mette il nome esatto, senza maiuscole, davanti a un nome parziale e al dettaglio", async () => {
    stubSearch({
      "/api/projects": page([{ id: 10, name: "Lead Task", description: null }]),
      "/api/servers": page([
        {
          id: 20,
          name: "srv-lead-01",
          ipAddress: "10.0.0.20",
          hostname: "lead.example",
          providerEnvironmentLabel: "OVH / Prod",
        },
        {
          id: 21,
          name: "srv-02",
          ipAddress: "10.0.0.21",
          hostname: "task.example",
          providerEnvironmentLabel: "Lead / Task",
        },
      ]),
    });

    const results = await searchAll("LEAD TASK");

    expect(results.map((item) => `${item.type}:${item.name}`)).toEqual([
      "project:Lead Task",
      "server:srv-lead-01",
      "server:srv-02",
    ]);
  });

  it("preferisce i token del nome nell'ordine della query", async () => {
    stubSearch({
      "/api/environments": page([
        { id: 1, name: "Beta Alpha", description: "Production" },
        { id: 2, name: "Alpha Beta Production", description: null },
      ]),
    });

    const results = await searchAll("alpha beta");

    expect(results.map((item) => `${item.type}:${item.name}`)).toEqual([
      "environment:Alpha Beta Production",
      "environment:Beta Alpha",
    ]);
  });

  it("preferisce un nome parziale a un dettaglio completo", async () => {
    stubSearch({
      "/api/projects": page([{ id: 10, name: "Lead", description: null }]),
      "/api/servers": page([
        {
          id: 20,
          name: "srv-01",
          ipAddress: "10.0.0.20",
          hostname: null,
          providerEnvironmentLabel: "Lead / Task",
        },
      ]),
    });

    const results = await searchAll("lead task");

    expect(results.map((item) => `${item.type}:${item.name}`)).toEqual([
      "project:Lead",
      "server:srv-01",
    ]);
  });

  it("tiene i risultati dell'API e mette davanti il nome più vicino con un token parziale", async () => {
    stubSearch({
      "/api/projects": page([{ id: 10, name: "Lead Task", description: null }]),
      "/api/servers": page([
        {
          id: 20,
          name: "tas-runner",
          ipAddress: "10.0.0.20",
          hostname: null,
          providerEnvironmentLabel: "OVH / Prod",
        },
        {
          id: 21,
          name: "srv-02",
          ipAddress: "10.0.0.21",
          hostname: null,
          providerEnvironmentLabel: "Lead / Task",
        },
      ]),
    });

    const results = await searchAll("lead tas");

    expect(results.map((item) => `${item.type}:${item.name}`)).toEqual([
      "project:Lead Task",
      "server:tas-runner",
      "server:srv-02",
    ]);
  });
});
