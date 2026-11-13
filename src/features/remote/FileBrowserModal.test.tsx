import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
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

let fileRequests: string[] = [];

describe("FileBrowserModal", () => {
  beforeEach(() => {
    fileRequests = [];
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
        if (url.includes("/api/servers/7/files")) {
          fileRequests.push(url);
          const path =
            new URL(url, "http://localhost").searchParams.get("path") ??
            "/home/test";
          const items =
            path === "/home/test"
              ? [
                  {
                    name: "hello.txt",
                    path: "/home/test/hello.txt",
                    isDirectory: false,
                    size: 12,
                    modifiedUtc: "2026-11-03T10:00:00Z",
                  },
                  {
                    name: "report.pdf",
                    path: "/home/test/report.pdf",
                    isDirectory: false,
                    size: 2048,
                    modifiedUtc: "2026-11-03T11:00:00Z",
                  },
                  {
                    name: "logs",
                    path: "/home/test/logs",
                    isDirectory: true,
                    size: 0,
                    modifiedUtc: null,
                  },
                ]
              : [];
          return json({ path, items });
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
      <BrowserRouter>
        <LanguageProvider initialLanguage="it">
          <FileBrowserModal open serverId={7} onClose={() => undefined} />
        </LanguageProvider>
      </BrowserRouter>,
    );

    expect(await screen.findByText("hello.txt")).toBeTruthy();
    expect(screen.getAllByText("Sftp :2222").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "Scarica" })[0].getAttribute("href"),
    ).toContain(
      "/api/servers/7/files/download?path=%2Fhome%2Ftest%2Fhello.txt",
    );
  });

  it("mostra l'avviso e configura accesso e credenziale mancanti", async () => {
    let saved: unknown = null;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/server-access/me")) {
          return json({
            isSystemAdmin: true,
            adminEnvironmentIds: [1],
            operatorEnvironmentIds: [1],
          });
        }
        if (url.includes("/api/server-credentials")) {
          return json({
            items: [
              {
                id: 3,
                name: "sftp-prod",
                username: "deploy",
                authType: "Password",
                hasSecret: true,
                serversCount: 1,
                needsReauth: false,
              },
            ],
            total: 1,
            page: 1,
            pageSize: 200,
          });
        }
        if (url.includes("/api/servers/7/file-transfer")) {
          saved = JSON.parse(String(init?.body));
          return new Response(null, { status: 204 });
        }
        if (url.includes("/api/servers/7/files")) {
          return json({
            path: "/home/test",
            items: [
              {
                name: "hello.txt",
                path: "/home/test/hello.txt",
                isDirectory: false,
                size: 12,
                modifiedUtc: null,
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
              providerEnvironmentLabel: "ACME / PROD",
              ipAddress: "10.0.0.5",
              sshPort: 22,
              fileTransferProtocol: null,
              fileTransferPort: null,
              fileTransferCredentialId: null,
              credentialId: null,
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
      <BrowserRouter>
        <LanguageProvider initialLanguage="it">
          <FileBrowserModal open serverId={7} onClose={() => undefined} />
        </LanguageProvider>
      </BrowserRouter>,
    );

    expect(
      await screen.findByText(
        "Accesso SFTP/FTPS/FTP non configurato per questo server.",
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Configura accesso file" }),
    );

    await screen.findByRole("dialog", { name: "Accesso file del server" });
    await waitFor(() =>
      expect(screen.getByLabelText("Credenziale")).toBeTruthy(),
    );
    fireEvent.change(screen.getByLabelText("Credenziale"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva e apri" }));

    await waitFor(() =>
      expect(saved).toEqual({
        protocol: "Sftp",
        port: 22,
        credentialId: 3,
      }),
    );
    expect(await screen.findByText("hello.txt")).toBeTruthy();
  });

  it("mostra l'avviso quando la credenziale file non è disponibile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/server-access/me")) {
          return json({
            isSystemAdmin: true,
            adminEnvironmentIds: [1],
            operatorEnvironmentIds: [1],
          });
        }
        if (url.includes("/api/servers/7/files")) {
          return new Response(
            JSON.stringify({
              code: "credential_missing",
              detail:
                "Il server srv-alpha non ha una credenziale per il trasferimento file.",
            }),
            { status: 422, headers: { "Content-Type": "application/json" } },
          );
        }
        return json({
          items: [
            {
              id: 7,
              name: "srv-alpha",
              providerEnvironmentId: 1,
              providerEnvironmentLabel: "ACME / PROD",
              ipAddress: "10.0.0.5",
              sshPort: 22,
              fileTransferProtocol: "Sftp",
              fileTransferPort: 22,
              fileTransferCredentialId: null,
              credentialId: null,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 200,
        });
      }),
    );

    render(
      <BrowserRouter>
        <LanguageProvider initialLanguage="it">
          <FileBrowserModal open serverId={7} onClose={() => undefined} />
        </LanguageProvider>
      </BrowserRouter>,
    );

    expect(
      await screen.findByText(
        "Nessuna credenziale SFTP/FTPS/FTP disponibile per questo server.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Configura accesso file" }),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "Il server srv-alpha non ha una credenziale per il trasferimento file.",
      ),
    ).toBeNull();
  });

  it("parte senza path e adotta la home restituita dal server", async () => {
    render(
      <BrowserRouter>
        <LanguageProvider initialLanguage="it">
          <FileBrowserModal open serverId={7} onClose={() => undefined} />
        </LanguageProvider>
      </BrowserRouter>,
    );

    expect(await screen.findByText("hello.txt")).toBeTruthy();
    expect(fileRequests).toEqual(["/api/servers/7/files"]);
    // Il percorso restituito è adottato e mostrato nel breadcrumb.
    expect(screen.getByText("home")).toBeTruthy();
    expect(screen.getByText("test")).toBeTruthy();
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
        if (url.includes("/api/servers/7/files")) {
          const path =
            new URL(url, "http://localhost").searchParams.get("path") ?? "/";
          return json({
            path,
            items: [
              {
                name: "hello.txt",
                path: path === "/" ? "/hello.txt" : `${path}/hello.txt`,
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
      <BrowserRouter>
        <LanguageProvider initialLanguage="it">
          <FileBrowserModal open serverId={7} onClose={() => undefined} />
        </LanguageProvider>
      </BrowserRouter>,
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

  it("filtra per nome, estensione e tipo e svuota il filtro", async () => {
    render(
      <BrowserRouter>
        <LanguageProvider initialLanguage="it">
          <FileBrowserModal open serverId={7} onClose={() => undefined} />
        </LanguageProvider>
      </BrowserRouter>,
    );

    await screen.findByText("hello.txt");
    expect(screen.getByText("report.pdf")).toBeTruthy();
    expect(screen.getByText("logs")).toBeTruthy();

    const filter = screen.getByPlaceholderText("Filtra i file…");
    fireEvent.change(filter, { target: { value: "pdf" } });
    expect(screen.getByText("report.pdf")).toBeTruthy();
    expect(screen.queryByText("hello.txt")).toBeNull();

    fireEvent.change(filter, { target: { value: "cartella" } });
    expect(screen.getByText("logs")).toBeTruthy();
    expect(screen.queryByText("report.pdf")).toBeNull();

    fireEvent.change(filter, { target: { value: "zzz" } });
    expect(screen.getByText('Nessun file corrisponde a "zzz".')).toBeTruthy();
    fireEvent.click(screen.getAllByLabelText("Pulisci il filtro")[0]);
    expect(screen.getByText("hello.txt")).toBeTruthy();

    fireEvent.click(screen.getByText("logs"));
    expect(await screen.findByText("Cartella vuota.")).toBeTruthy();
  });

  it("cerca i server per nome, IP, hostname e ambiente", async () => {
    const onServerSelected = vi.fn();
    const onClose = vi.fn();
    const servers = [
      {
        id: 7,
        name: "srv-alpha",
        providerEnvironmentId: 1,
        providerEnvironmentLabel: "ACME / PROD",
        ipAddress: "10.0.0.5",
        hostname: "srv-alpha.local",
        sshPort: 22,
        fileTransferProtocol: "Sftp",
        fileTransferPort: 2222,
      },
      {
        id: 8,
        name: "srv-beta",
        providerEnvironmentId: 1,
        providerEnvironmentLabel: "ACME / TEST",
        ipAddress: "10.0.0.6",
        hostname: "srv-beta.local",
        sshPort: 22,
        fileTransferProtocol: "Ftp",
        fileTransferPort: 21,
      },
    ];
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
        return json({ items: servers, total: 2, page: 1, pageSize: 200 });
      }),
    );

    render(
      <BrowserRouter>
        <LanguageProvider initialLanguage="it">
          <FileBrowserModal
            open
            serverId={null}
            onServerSelected={onServerSelected}
            onClose={onClose}
          />
        </LanguageProvider>
      </BrowserRouter>,
    );

    const search = await screen.findByPlaceholderText(
      "Cerca per nome, IP, hostname o ambiente…",
    );
    await screen.findByText("srv-alpha");
    expect(
      screen.getByText("10.0.0.5 · srv-alpha.local · ACME / PROD"),
    ).toBeTruthy();

    fireEvent.change(search, { target: { value: "10.0.0.6" } });
    expect(screen.queryByText("srv-alpha")).toBeNull();
    expect(screen.getByText("srv-beta")).toBeTruthy();

    fireEvent.change(search, { target: { value: "alpha.local" } });
    expect(screen.getByText("srv-alpha")).toBeTruthy();
    expect(screen.queryByText("srv-beta")).toBeNull();

    fireEvent.change(search, { target: { value: "ACME / TEST" } });
    expect(screen.getByText("srv-beta")).toBeTruthy();

    fireEvent.change(search, { target: { value: "niente" } });
    expect(
      screen.getByText("Nessun server corrisponde alla ricerca."),
    ).toBeTruthy();

    fireEvent.change(search, { target: { value: "srv-beta.local" } });
    fireEvent.click(screen.getByText("srv-beta"));
    expect(onServerSelected).toHaveBeenCalledWith(8, "srv-beta");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
