import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, getSession } from "./api";

const payload = {
  user: { username: "mario", name: "Mario", surname: "Rossi" },
  expiresIn: 300,
  refreshExpiresIn: 1800,
  csrfToken: "csrf",
};

describe("getSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    );
    await expect(getSession()).resolves.toBeNull();
  });

  it("parses the session body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    await expect(getSession()).resolves.toEqual(payload);
  });
});

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries once with a fresh CSRF token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "csrf_failed" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...payload, csrfToken: "fresh" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiFetch<{ id: number }>("/api/diagrams", { method: "POST" }, "stale"),
    ).resolves.toEqual({ id: 1 });

    const headers = new Headers(fetchMock.mock.calls[2][1]?.headers);
    expect(headers.get("X-CSRF-Token")).toBe("fresh");
  });
});
