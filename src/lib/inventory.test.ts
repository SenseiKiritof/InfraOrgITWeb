import { afterEach, describe, expect, it, vi } from "vitest";
import { paged, saveEntity } from "./inventory";

describe("paged", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("carica tutte le pagine e riporta il totale reale", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const page = new URL(String(url), "http://localhost").searchParams.get(
        "page",
      );
      const items = page === "1" ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }];
      return new Response(
        JSON.stringify({ items, total: 3, page: Number(page), pageSize: 2 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await paged<{ id: number }>("/api/servers", "web");

    expect(result.items.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(result.total).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("q=web");
  });
});

describe("saveEntity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates on the collection and updates on the item", async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await saveEntity("/api/providers", null, { name: "A" }, "csrf");
    await saveEntity("/api/providers", 7, { name: "B" }, "csrf");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/providers");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/providers/7");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("PUT");
  });
});
