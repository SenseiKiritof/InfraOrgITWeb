import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getConnectionPolicy,
  updateConnectionPolicy,
} from "./connectionPolicy";

const policy = {
  mode: "Auto" as const,
  updatedAt: "2026-11-13T20:00:00Z",
  updatedBy: "admin",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("connection policy", () => {
  it("reads the installation mode", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(policy), { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    await expect(getConnectionPolicy()).resolves.toEqual(policy);
    expect(fetch).toHaveBeenCalledWith(
      "/api/connection-policy",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("writes the mode with the CSRF token", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(policy), { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    await expect(updateConnectionPolicy("Auto", "csrf")).resolves.toEqual(
      policy,
    );
    const [, init] = fetch.mock.calls[0];
    expect(init.method).toBe("PUT");
    expect(new Headers(init.headers).get("X-CSRF-Token")).toBe("csrf");
    expect(init.body).toBe(JSON.stringify({ mode: "Auto" }));
  });
});
