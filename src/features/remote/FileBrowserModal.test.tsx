import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../lib/i18n";
import { FileBrowserModal } from "./FileBrowserModal";

vi.mock("../../app/AuthProvider", () => ({
  useAuth: () => ({ session: { csrfToken: "csrf" } }),
}));

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("FileBrowserModal", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/server-access/me")) {
          return json({
            isSystemAdmin: false,
            adminEnvironmentIds: [1],
            operatorEnvironmentIds: [1],
          });
        }
        if (url.includes("/api/servers/7/files?")) {
          return json({
            path: "/",
            items: [
              {
                name: "hello.txt",
                path: "/hello.txt",
                isDirectory: false,
                size: 12,
                modifiedUtc: "2026-11-03T10:00:00Z",
              },
            ],
          });
        }
        return json({
          items: [
            {
              id: 7,
              name: "srv-alpha",
              providerEnvironmentId: 1,
              ipAddress: "10.0.0.5",
              sshPort: 22,
              fileTransferProtocol: "Sftp",
              fileTransferPort: 2222,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 200,
        });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "external");
    vi.unstubAllGlobals();
  });

  it("carica server, protocollo e file", async () => {
    render(
      <LanguageProvider initialLanguage="it">
        <FileBrowserModal open serverId={7} onClose={() => undefined} />
      </LanguageProvider>,
    );

    expect(await screen.findByText("hello.txt")).toBeTruthy();
    expect(screen.getAllByText("Sftp :2222").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "Scarica" }).getAttribute("href"),
    ).toContain("/api/servers/7/files/download?path=%2Fhello.txt");
  });

  it("in bridge crea un ticket e invia un solo download al desktop", async () => {
    let handler: ((raw: string) => void) | undefined;
    const sendMessage = vi.fn((raw: string) => {
      const message = JSON.parse(raw) as { type?: string };
      if (message.type === "desktop.capabilities") {
        handler?.(
          JSON.stringify({
            type: "desktop.capabilities",
            downloadMode: "auto",
            nativeDownload: false,
          }),
        );
      }
    });
    Object.defineProperty(window, "external", {
      configurable: true,
      value: {
        sendMessage,
        receiveMessage: vi.fn((callback: (raw: string) => void) => {
          handler = callback;
        }),
      },
    });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/desktop/downloads/capabilities")) {
          return json({ signedUrl: true });
        }
        if (url.includes("/api/desktop/downloads/tickets")) {
          return json({
            url: "/api/desktop/downloads/tickets/t1",
            expiresAt: "2026-11-12T12:00:00Z",
          });
        }
        if (url.includes("/api/server-access/me")) {
          return json({
            isSystemAdmin: false,
            adminEnvironmentIds: [1],
            operatorEnvironmentIds: [1],
          });
        }
        if (url.includes("/api/servers/7/files?")) {
          return json({
            path: "/",
            items: [
              {
                name: "hello.txt",
                path: "/hello.txt",
                isDirectory: false,
                size: 12,
                modifiedUtc: "2026-11-03T10:00:00Z",
              },
            ],
          });
        }
        return json({
          items: [
            {
              id: 7,
              name: "srv-alpha",
              providerEnvironmentId: 1,
              ipAddress: "10.0.0.5",
              sshPort: 22,
              fileTransferProtocol: "Sftp",
              fileTransferPort: 2222,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 200,
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LanguageProvider initialLanguage="it">
        <FileBrowserModal open serverId={7} onClose={() => undefined} />
      </LanguageProvider>,
    );

    const dialog = await screen.findByRole("dialog", {
      name: "File SFTP/FTPS/FTP",
    });
    await waitFor(() =>
      expect(dialog.getAttribute("data-download-route")).toBe("bridge"),
    );
    expect(await screen.findByText("hello.txt")).toBeTruthy();

    const link = screen.getByRole("link", { name: "Scarica" });
    expect(fireEvent.click(link)).toBe(false);
    await waitFor(() =>
      expect(
        sendMessage.mock.calls
          .map(([raw]) => JSON.parse(String(raw)) as Record<string, unknown>)
          .filter((message) => message.type === "desktop.download"),
      ).toHaveLength(1),
    );

    const ticket = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/api/desktop/downloads/tickets"),
    );
    expect(JSON.parse(String(ticket?.[1]?.body))).toEqual({
      serverId: 7,
      path: "/hello.txt",
    });
    expect(
      sendMessage.mock.calls
        .map(([raw]) => JSON.parse(String(raw)) as Record<string, unknown>)
        .filter((message) => message.type === "desktop.download"),
    ).toEqual([
      {
        type: "desktop.download",
        url: `${window.location.origin}/api/desktop/downloads/tickets/t1`,
        filename: "hello.txt",
      },
    ]);
  });
});
