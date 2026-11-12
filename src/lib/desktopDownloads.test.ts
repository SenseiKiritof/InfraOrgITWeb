import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import {
  base64ByteLength,
  DESKTOP_BLOB_MAX_BYTES,
  desktopDownloads,
  resolveDesktopDownloadRoute,
  resolveDownloadRoute,
  sendDesktopBlob,
} from "./desktopDownloads";

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

interface BridgeMock {
  sendMessage: Mock;
  receiveMessage: Mock;
}

function installBridge(
  capabilities: { downloadMode: string; nativeDownload: boolean } | null,
): BridgeMock {
  let handler: ((raw: string) => void) | undefined;
  const sendMessage = vi.fn((raw: string) => {
    if (!capabilities) return;
    const payload = JSON.parse(raw) as { type?: string };
    if (payload.type === "desktop.capabilities") {
      handler?.(
        JSON.stringify({ type: "desktop.capabilities", ...capabilities }),
      );
    }
  });
  const receiveMessage = vi.fn((callback: (raw: string) => void) => {
    handler = callback;
  });
  Object.defineProperty(window, "external", {
    configurable: true,
    value: { sendMessage, receiveMessage },
  });
  return { sendMessage, receiveMessage };
}

function downloadMessages(bridge: BridgeMock): Record<string, unknown>[] {
  return bridge.sendMessage.mock.calls
    .map(([raw]) => JSON.parse(String(raw)) as Record<string, unknown>)
    .filter(
      (message) =>
        message.type === "desktop.download" ||
        message.type === "desktop.download.blob",
    );
}

afterEach(() => {
  Reflect.deleteProperty(window, "external");
  vi.unstubAllGlobals();
});

describe("resolveDownloadRoute", () => {
  it.each([
    ["auto", true, true, "native"],
    ["auto", true, false, "native"],
    ["auto", false, true, "bridge"],
    ["auto", false, false, "normal"],
    ["bridge", true, true, "bridge"],
    ["bridge", false, true, "bridge"],
    ["bridge", true, false, "native"],
    ["bridge", false, false, "normal"],
    ["native", true, true, "native"],
    ["native", false, true, "bridge"],
    ["native", false, false, "normal"],
  ] as const)(
    "%s con nativeDownload=%s e signedUrl=%s sceglie %s",
    (mode, nativeDownload, signedUrl, expected) => {
      expect(resolveDownloadRoute(mode, nativeDownload, signedUrl)).toBe(
        expected,
      );
    },
  );
});

describe("resolveDesktopDownloadRoute", () => {
  it("senza window.external resta sul web e non chiama il server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await desktopDownloads.resolveRoute()).toBe("normal");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("combina la modalità native con signedUrl del server", async () => {
    installBridge({ downloadMode: "auto", nativeDownload: false });
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        json({ signedUrl: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await resolveDesktopDownloadRoute(50)).toBe("bridge");
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("/api/desktop/downloads/capabilities");
    expect(init?.credentials).toBe("include");
  });

  it("usa native quando il webview sa scaricare e signedUrl è false", async () => {
    installBridge({ downloadMode: "auto", nativeDownload: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ signedUrl: false })),
    );

    expect(await resolveDesktopDownloadRoute(50)).toBe("native");
  });

  it("al timeout delle capability torna al download web", async () => {
    installBridge(null);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ signedUrl: true })),
    );

    expect(await resolveDesktopDownloadRoute(5)).toBe("normal");
  });
});

describe("createDesktopDownloadTicket", () => {
  it("invia serverId e path con CSRF e rende assoluto l'URL", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        json({
          url: "/api/desktop/downloads/tickets/abc",
          expiresAt: "2026-11-12T12:00:00Z",
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const ticket = await desktopDownloads.createTicket(7, "/srv/a.txt", "csrf");

    expect(ticket.url).toBe(
      `${window.location.origin}/api/desktop/downloads/tickets/abc`,
    );
    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(path)).toBe("/api/desktop/downloads/tickets");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      serverId: 7,
      path: "/srv/a.txt",
    });
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("csrf");
  });
});

describe("sendServerFileToDesktop", () => {
  it("crea il ticket e invia un solo messaggio desktop.download", async () => {
    const bridge = installBridge({
      downloadMode: "bridge",
      nativeDownload: false,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          url: "https://server.test/api/desktop/downloads/tickets/abc",
          expiresAt: "2026-11-12T12:00:00Z",
        }),
      ),
    );

    const sent = await desktopDownloads.sendServerFile({
      serverId: 7,
      path: "/srv/a.txt",
      filename: "a.txt",
      csrfToken: "csrf",
    });

    expect(sent).toBe(true);
    expect(downloadMessages(bridge)).toEqual([
      {
        type: "desktop.download",
        url: "https://server.test/api/desktop/downloads/tickets/abc",
        filename: "a.txt",
      },
    ]);
  });

  it("sul ticket fallito non invia nulla e lascia il fallback al chiamante", async () => {
    const bridge = installBridge({
      downloadMode: "bridge",
      nativeDownload: false,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    const sent = await desktopDownloads.sendServerFile({
      serverId: 7,
      path: "/srv/a.txt",
      filename: "a.txt",
      csrfToken: "csrf",
    });

    expect(sent).toBe(false);
    expect(downloadMessages(bridge)).toHaveLength(0);
  });
});

describe("sendDesktopBlob", () => {
  it("invia i risultati piccoli e rifiuta quelli oltre il limite", () => {
    const bridge = installBridge({
      downloadMode: "bridge",
      nativeDownload: false,
    });
    const tooLarge = "A".repeat(
      Math.ceil(((DESKTOP_BLOB_MAX_BYTES + 1) * 4) / 3),
    );

    expect(sendDesktopBlob("small.json", "TWFu", "application/json")).toBe(
      "sent",
    );
    expect(base64ByteLength(tooLarge)).toBeGreaterThan(DESKTOP_BLOB_MAX_BYTES);
    expect(
      sendDesktopBlob("big.bin", tooLarge, "application/octet-stream"),
    ).toBe("too-large");
    expect(downloadMessages(bridge)).toEqual([
      {
        type: "desktop.download.blob",
        filename: "small.json",
        base64: "TWFu",
        mime: "application/json",
      },
    ]);
  });

  it("senza bridge non invia il blob", () => {
    expect(sendDesktopBlob("small.json", "TWFu", "application/json")).toBe(
      "unavailable",
    );
  });
});
