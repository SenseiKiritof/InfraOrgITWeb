import { afterEach, describe, expect, it, vi } from "vitest";
import type { Server } from "./inventory";
import {
  defaultFileTransferPort,
  runAction,
  splitServersByCredential,
} from "./remote";

const server = (id: number, credentialId: number | null): Server => ({
  id,
  providerEnvironmentId: 1,
  providerEnvironmentLabel: "Provider / ENV",
  name: `srv-${id}`,
  ipAddress: "10.0.0.1",
  hostname: `srv-${id}.local`,
  sshPort: 22,
  credentialId,
  hasHostKey: false,
  fileTransferProtocol: null,
  fileTransferPort: null,
  fileTransferCredentialId: null,
  fileTransferCredentialName: null,
  jumpServerId: null,
  jumpServerName: null,
  jumpServerIpAddress: null,
  publicIpAddress: null,
  cpuCores: null,
  memoryGb: null,
  diskGb: null,
  operatingSystem: null,
  haNode: null,
  managedBy: null,
});

describe("splitServersByCredential", () => {
  it("separa associati e disponibili", () => {
    const result = splitServersByCredential(
      [server(1, 10), server(2, null), server(3, 10), server(4, 20)],
      10,
    );

    expect(result.assigned.map((item) => item.id)).toEqual([1, 3]);
    expect(result.available.map((item) => item.id)).toEqual([2]);
  });
});

describe("defaultFileTransferPort", () => {
  it("usa 22 per SFTP e 21 per FTP/FTPS", () => {
    expect(defaultFileTransferPort("Sftp")).toBe(22);
    expect(defaultFileTransferPort("Ftp")).toBe(21);
    expect(defaultFileTransferPort("Ftps")).toBe(21);
    expect(defaultFileTransferPort(null)).toBe(22);
    expect(defaultFileTransferPort("")).toBe(22);
  });
});

describe("runAction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubRun = () =>
    vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ exitCode: 0, output: "ok", timedOut: false }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

  it("invia confirm=true dopo la conferma", async () => {
    const fetchMock = stubRun();
    vi.stubGlobal("fetch", fetchMock);

    await runAction(7, 3, "csrf", true);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(init?.body))).toEqual({ confirm: true });
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBeTruthy();
  });

  it("invia confirm=false per le azioni senza conferma", async () => {
    const fetchMock = stubRun();
    vi.stubGlobal("fetch", fetchMock);

    await runAction(7, 3, "csrf");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(init?.body))).toEqual({ confirm: false });
  });
});
