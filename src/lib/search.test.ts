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

    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const path = new URL(String(url), "http://localhost").pathname;
      return new Response(JSON.stringify(payloads[path] ?? page([])), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

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
});
