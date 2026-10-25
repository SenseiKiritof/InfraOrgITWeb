import { afterEach, describe, expect, it, vi } from "vitest";
import { saveEntity } from "./inventory";

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
