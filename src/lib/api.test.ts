import { afterEach, describe, expect, it, vi } from "vitest";
import { getSession } from "./api";

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
