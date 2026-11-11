import { afterEach, describe, expect, it, vi } from "vitest";
import type { McpApproval } from "./mcpApprovals";
import {
  approveMcpApproval,
  denyMcpApproval,
  formatApprovalTarget,
  isPendingApproval,
  listMcpApprovals,
} from "./mcpApprovals";

const approval: McpApproval = {
  id: 7,
  action: "actions.run",
  serverId: 3,
  serverName: "web-01",
  serverApplicationId: 12,
  serverApplicationName: "Shop",
  applicationActionId: 4,
  applicationActionLabel: "Restart",
  status: "Pending",
  requestedAt: "2026-11-11T09:00:00Z",
  expiresAt: "2026-11-11T09:05:00Z",
  decidedAt: null,
};

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listMcpApprovals", () => {
  it("legge le approvazioni dal contratto same-origin", async () => {
    const fetchMock = stubFetch([approval]);

    await expect(listMcpApprovals()).resolves.toEqual([approval]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/mcp/approvals");
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe("include");
  });
});

describe("decisioni", () => {
  it("approva con POST e token CSRF", async () => {
    const fetchMock = stubFetch(null, 204);

    await expect(approveMcpApproval(7, "csrf-1")).resolves.toBeUndefined();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/mcp/approvals/7/approve");
    expect(options?.method).toBe("POST");
    expect(new Headers(options?.headers).get("X-CSRF-Token")).toBe("csrf-1");
    expect(options?.credentials).toBe("include");
  });

  it("nega con POST e token CSRF", async () => {
    const fetchMock = stubFetch(null, 204);

    await expect(denyMcpApproval(7, "csrf-1")).resolves.toBeUndefined();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/mcp/approvals/7/deny");
    expect(options?.method).toBe("POST");
    expect(new Headers(options?.headers).get("X-CSRF-Token")).toBe("csrf-1");
  });
});

describe("isPendingApproval", () => {
  it("considera pendente solo lo stato Pending, senza badare al caso", () => {
    expect(isPendingApproval("Pending")).toBe(true);
    expect(isPendingApproval("pending")).toBe(true);
    expect(isPendingApproval("Approved")).toBe(false);
    expect(isPendingApproval("Denied")).toBe(false);
    expect(isPendingApproval("Expired")).toBe(false);
  });
});

describe("formatApprovalTarget", () => {
  it("unisce server, applicazione e azione", () => {
    expect(formatApprovalTarget(approval)).toBe("web-01 · Shop · Restart");
  });

  it("salta le parti mancanti", () => {
    expect(
      formatApprovalTarget({
        serverName: "web-01",
        serverApplicationName: null,
        applicationActionLabel: " Restart ",
      }),
    ).toBe("web-01 · Restart");
    expect(
      formatApprovalTarget({
        serverName: "",
        serverApplicationName: null,
        applicationActionLabel: null,
      }),
    ).toBe("—");
  });
});
