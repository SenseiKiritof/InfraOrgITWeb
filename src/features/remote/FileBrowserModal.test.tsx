import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../lib/i18n";
import { FileBrowserModal, HIDDEN_FILES_STORAGE_KEY } from "./FileBrowserModal";

vi.mock("../../app/AuthProvider", () => ({
  useAuth: () => ({ session: { csrfToken: "csrf" } }),
}));

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

let fileRequests: string[] = [];
let uploadRequests: string[] = [];

const access = () =>
  json({
    isSystemAdmin: false,
    adminEnvironmentIds: [1],
    operatorEnvironmentIds: [1],
  });

const serversPage = (items: unknown[]) =>
  json({ items, total: items.length, page: 1, pageSize: 200 });

const sftpServer = {
  id: 7,
  name: "srv-alpha",
  providerEnvironmentId: 1,
  ipAddress: "10.0.0.5",
  sshPort: 22,
  fileTransferProtocol: "Sftp",
  fileTransferPort: 22,
};

const fileEntry = (name: string) => ({
  name,
  path: `/home/test/${name}`,
  isDirectory: false,
  size: 12,
  modifiedUtc: null,
});

describe("FileBrowserModal", () => {
  beforeEach(() => {
    fileRequests = [];
    uploadRequests = [];
    localStorage.clear();
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
        if (url.includes("/api/servers/7/files/upload")) {
          uploadRequests.push(url);
          return json({ path: "/home/test/uploaded" });
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
    Reflect.deleteProperty(window, "infraorgitDesktop");
    Reflect.deleteProperty(navigator, "clipboard");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const renderPanel = (
    props: { onClose?: () => void; embedded?: boolean } = {},
  ) =>
    render(
      <BrowserRouter>
        <LanguageProvider initialLanguage="it">
          <FileBrowserModal
            open
            serverId={7}
            onClose={props.onClose ?? (() => undefined)}
            embedded={props.embedded}
          />
        </LanguageProvider>
      </BrowserRouter>,
    );

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

  it("ordina i file per nome e dimensione", async () => {
    render(
      <BrowserRouter>
        <LanguageProvider initialLanguage="it">
          <FileBrowserModal open serverId={7} onClose={() => undefined} />
        </LanguageProvider>
      </BrowserRouter>,
    );

    await screen.findByText("hello.txt");
    const rowNames = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell")[1].textContent);

    expect(rowNames()).toEqual(["hello.txt", "report.pdf", "logs"]);
    fireEvent.click(screen.getByRole("button", { name: "Nome" }));
    expect(rowNames()).toEqual(["hello.txt", "logs", "report.pdf"]);
    fireEvent.click(screen.getByRole("button", { name: "Nome" }));
    expect(rowNames()).toEqual(["report.pdf", "logs", "hello.txt"]);
    fireEvent.click(screen.getByRole("button", { name: "Dimensione" }));
    expect(rowNames()).toEqual(["hello.txt", "report.pdf", "logs"]);
  });

  it("carica i file trascinati nella cartella aperta", async () => {
    render(
      <BrowserRouter>
        <LanguageProvider initialLanguage="it">
          <FileBrowserModal open serverId={7} onClose={() => undefined} />
        </LanguageProvider>
      </BrowserRouter>,
    );

    await screen.findByText("hello.txt");
    fireEvent.drop(screen.getByRole("dialog"), {
      dataTransfer: {
        types: ["Files"],
        files: [new File(["contenuto"], "nuovo.txt")],
      },
    });

    await waitFor(() =>
      expect(
        uploadRequests.some((url) =>
          url.includes("/api/servers/7/files/upload?path=%2Fhome%2Ftest"),
        ),
      ).toBe(true),
    );
  });

  it("mostra il progresso dei download nativi", async () => {
    let receive: ((message: string) => void) | null = null;
    Reflect.set(window, "infraorgitDesktop", {
      sendMessage: vi.fn(),
      receiveMessage: (handler: (message: string) => void) => {
        receive = handler;
      },
    });
    render(
      <BrowserRouter>
        <LanguageProvider initialLanguage="it">
          <FileBrowserModal open serverId={7} onClose={() => undefined} />
        </LanguageProvider>
      </BrowserRouter>,
    );

    await screen.findByText("hello.txt");
    act(() =>
      receive?.(
        JSON.stringify({
          type: "desktop.download.status",
          state: "progressing",
          fileName: "dump.sql.gz",
          receivedBytes: 45,
          totalBytes: 100,
        }),
      ),
    );

    expect(
      await screen.findByText("Download di dump.sql.gz: 45%"),
    ).toBeTruthy();
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

  it("usa la credenziale SSH quando non ci sono credenziali file", async () => {
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
          return json({ items: [], total: 0, page: 1, pageSize: 200 });
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
              credentialId: 6,
              fileTransferProtocol: null,
              fileTransferPort: null,
              fileTransferCredentialId: null,
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

    fireEvent.click(
      await screen.findByRole("button", { name: "Configura accesso file" }),
    );
    await screen.findByRole("dialog", { name: "Accesso file del server" });
    expect(
      screen.getByRole("option", { name: "Usa la credenziale SSH" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salva e apri" }));

    await waitFor(() =>
      expect(saved).toEqual({
        protocol: "Sftp",
        port: 22,
        credentialId: null,
      }),
    );
    expect(await screen.findByText("hello.txt")).toBeTruthy();
  });

  it("non resta in caricamento passando a un server senza protocollo", async () => {
    let resolveFiles: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/server-access/me")) {
        return json({
          isSystemAdmin: true,
          adminEnvironmentIds: [1],
          operatorEnvironmentIds: [1],
        });
      }
      if (url.includes("/api/servers/7/files")) {
        return new Promise<Response>((resolve) => {
          resolveFiles = resolve;
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
            fileTransferPort: 22,
          },
          {
            id: 8,
            name: "srv-beta",
            providerEnvironmentId: 1,
            ipAddress: "10.0.0.6",
            sshPort: 22,
            fileTransferProtocol: null,
            fileTransferPort: null,
          },
        ],
        total: 2,
        page: 1,
        pageSize: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <BrowserRouter>
        <LanguageProvider initialLanguage="it">
          <FileBrowserModal open serverId={7} onClose={() => undefined} />
        </LanguageProvider>
      </BrowserRouter>,
    );
    expect(await screen.findByText("Caricamento…")).toBeTruthy();

    rerender(
      <BrowserRouter>
        <LanguageProvider initialLanguage="it">
          <FileBrowserModal open serverId={8} onClose={() => undefined} />
        </LanguageProvider>
      </BrowserRouter>,
    );

    expect(
      await screen.findByText(
        "Accesso SFTP/FTPS/FTP non configurato per questo server.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Caricamento…")).toBeNull();
    resolveFiles?.(json({ path: "/", items: [] }));
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

  it("mantiene le righe visibili durante un aggiornamento lento", async () => {
    let resolveRefresh: ((response: Response) => void) | undefined;
    let fileCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/server-access/me")) return access();
        if (url.includes("/api/servers/7/files")) {
          fileCalls += 1;
          if (fileCalls === 1) {
            return json({
              path: "/home/test",
              items: [fileEntry("hello.txt")],
            });
          }
          return new Promise<Response>((resolve) => {
            resolveRefresh = resolve;
          });
        }
        return serversPage([sftpServer]);
      }),
    );

    render(
      <BrowserRouter>
        <LanguageProvider initialLanguage="it">
          <FileBrowserModal open serverId={7} onClose={() => undefined} />
        </LanguageProvider>
      </BrowserRouter>,
    );
    expect(await screen.findByText("hello.txt")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Aggiorna" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Aggiornamento…",
    );
    expect(screen.getByText("hello.txt")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Aggiornamento…" })
        .hasAttribute("disabled"),
    ).toBe(true);

    resolveRefresh?.(
      json({ path: "/home/test", items: [fileEntry("aggiornato.txt")] }),
    );

    expect(await screen.findByText("aggiornato.txt")).toBeTruthy();
    expect(screen.queryByText("hello.txt")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Aggiorna" })).toBeTruthy();
  });

  it("mantiene le righe e segnala l'errore se il refresh fallisce", async () => {
    let fileCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/server-access/me")) return access();
        if (url.includes("/api/servers/7/files")) {
          fileCalls += 1;
          if (fileCalls === 1) {
            return json({
              path: "/home/test",
              items: [fileEntry("hello.txt")],
            });
          }
          return new Response(
            JSON.stringify({ code: "sftp_error", detail: "Elenca fallito" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return serversPage([sftpServer]);
      }),
    );

    render(
      <BrowserRouter>
        <LanguageProvider initialLanguage="it">
          <FileBrowserModal open serverId={7} onClose={() => undefined} />
        </LanguageProvider>
      </BrowserRouter>,
    );
    await screen.findByText("hello.txt");

    fireEvent.click(screen.getByRole("button", { name: "Aggiorna" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Elenca fallito",
    );
    expect(screen.getByText("hello.txt")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aggiorna" })).toBeTruthy();
  });

  it("in embedded ignora Esc quando non è il pannello attivo", async () => {
    const onClose = vi.fn();
    const panel = (active: boolean) => (
      <BrowserRouter>
        <LanguageProvider initialLanguage="it">
          <FileBrowserModal
            open
            serverId={7}
            embedded
            active={active}
            pane={0}
            paneCount={2}
            onClose={onClose}
          />
        </LanguageProvider>
      </BrowserRouter>
    );
    const view = render(panel(false));
    await screen.findByText("hello.txt");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    view.rerender(panel(true));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("in embedded riempie il pannello e sposta la sessione", async () => {
    const onMovePane = vi.fn();
    const onActivate = vi.fn();

    render(
      <BrowserRouter>
        <LanguageProvider initialLanguage="it">
          <FileBrowserModal
            open
            serverId={7}
            embedded
            pane={0}
            paneCount={2}
            onMovePane={onMovePane}
            onActivate={onActivate}
            onClose={() => undefined}
          />
        </LanguageProvider>
      </BrowserRouter>,
    );

    const dialog = await screen.findByRole("dialog", {
      name: "File SFTP/FTPS/FTP",
    });
    expect(dialog.className).not.toContain("fixed");
    expect(dialog.className).not.toContain("bottom-11");
    expect(dialog.className).not.toContain("h-[60vh]");
    expect(dialog.className).toContain("h-full");
    expect(dialog.parentElement?.className).not.toContain("fixed");
    expect(dialog.parentElement?.className).toContain("h-full");

    fireEvent.pointerDown(dialog);
    expect(onActivate).toHaveBeenCalled();

    const select = screen.getByRole("combobox", {
      name: "Pannello della console",
    });
    expect(within(select).getAllByRole("option")).toHaveLength(2);
    fireEvent.change(select, { target: { value: "1" } });
    expect(onMovePane).toHaveBeenCalledWith(1);

    expect(await screen.findByText("hello.txt")).toBeTruthy();
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

  it("naviga cliccando un segmento del breadcrumb", async () => {
    renderPanel();
    await screen.findByText("hello.txt");

    fireEvent.click(screen.getByRole("button", { name: "home" }));

    await waitFor(() =>
      expect(fileRequests).toContain("/api/servers/7/files?path=%2Fhome"),
    );
    // Il breadcrumb resta visibile anche mentre la richiesta è in corso.
    expect(
      screen.getByRole("navigation", { name: "Percorso corrente" }),
    ).toBeTruthy();
  });

  it("copia il percorso corrente ignorando gli errori della clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderPanel();
    await screen.findByText("hello.txt");

    fireEvent.click(screen.getByRole("button", { name: "Copia percorso" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("/home/test"));

    writeText.mockRejectedValueOnce(new Error("clipboard negata"));
    fireEvent.click(screen.getByRole("button", { name: "Copia percorso" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("nasconde i file nascosti ricordando la preferenza", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/server-access/me")) return access();
        if (url.includes("/api/servers/7/files")) {
          return json({
            path: "/home/test",
            items: [fileEntry("hello.txt"), fileEntry(".env")],
          });
        }
        return serversPage([sftpServer]);
      }),
    );

    const { unmount } = renderPanel();
    await screen.findByText("hello.txt");
    expect(screen.getByText(".env")).toBeTruthy();
    const toggle = screen.getByRole("button", { name: "File nascosti" });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(toggle);
    expect(screen.queryByText(".env")).toBeNull();
    expect(screen.getByText("hello.txt")).toBeTruthy();
    expect(localStorage.getItem(HIDDEN_FILES_STORAGE_KEY)).toBe("0");

    unmount();
    renderPanel();
    expect(await screen.findByText("hello.txt")).toBeTruthy();
    expect(screen.queryByText(".env")).toBeNull();

    // Il filtro testuale convive con il toggle.
    fireEvent.change(screen.getByPlaceholderText("Filtra i file…"), {
      target: { value: "env" },
    });
    expect(screen.getByText('Nessun file corrisponde a "env".')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "File nascosti" }));
    expect(screen.getByText(".env")).toBeTruthy();
    expect(localStorage.getItem(HIDDEN_FILES_STORAGE_KEY)).toBe("1");
  });

  it("seleziona e deseleziona tutte le righe visibili", async () => {
    renderPanel();
    await screen.findByText("hello.txt");

    const selectAll = screen.getByLabelText("Seleziona tutti");
    fireEvent.click(selectAll);
    expect(screen.getByText("Elementi selezionati: 3")).toBeTruthy();

    fireEvent.click(selectAll);
    expect(screen.queryByText(/Elementi selezionati:/)).toBeNull();
  });

  it("elimina in blocco le righe selezionate", async () => {
    const deletes: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/server-access/me")) return access();
        if (url.includes("/api/servers/7/files") && init?.method === "DELETE") {
          deletes.push(url);
          return new Response(null, { status: 204 });
        }
        if (url.includes("/api/servers/7/files")) {
          fileRequests.push(url);
          return json({
            path: "/home/test",
            items: [
              fileEntry("hello.txt"),
              fileEntry("report.pdf"),
              {
                name: "logs",
                path: "/home/test/logs",
                isDirectory: true,
                size: 0,
                modifiedUtc: null,
              },
            ],
          });
        }
        return serversPage([sftpServer]);
      }),
    );
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);

    renderPanel();
    await screen.findByText("hello.txt");
    fireEvent.click(screen.getByLabelText("Seleziona hello.txt"));
    fireEvent.click(screen.getByLabelText("Seleziona logs"));
    expect(screen.getByText("Elementi selezionati: 2")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Elimina selezionati" }),
    );

    await waitFor(() => expect(deletes).toHaveLength(2));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(deletes[0]).toContain(
      "/api/servers/7/files?path=%2Fhome%2Ftest%2Fhello.txt&isDirectory=false",
    );
    expect(deletes[1]).toContain(
      "/api/servers/7/files?path=%2Fhome%2Ftest%2Flogs&isDirectory=true",
    );
    await waitFor(() =>
      expect(screen.queryByText(/Elementi selezionati:/)).toBeNull(),
    );
    expect(
      (screen.getByLabelText("Seleziona hello.txt") as HTMLInputElement)
        .checked,
    ).toBe(false);
  });

  it("azzera la selezione cambiando cartella", async () => {
    renderPanel();
    await screen.findByText("hello.txt");

    fireEvent.click(screen.getByLabelText("Seleziona hello.txt"));
    expect(screen.getByText("Elementi selezionati: 1")).toBeTruthy();

    fireEvent.click(screen.getByText("logs"));

    expect(await screen.findByText("Cartella vuota.")).toBeTruthy();
    expect(screen.queryByText(/Elementi selezionati:/)).toBeNull();
  });

  it("risale con Backspace ed Esc svuota prima il filtro", async () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    await screen.findByText("hello.txt");
    const filterInput = screen.getByPlaceholderText("Filtra i file…");

    fireEvent.change(filterInput, { target: { value: "pdf" } });
    // Backspace dentro un campo di testo non naviga.
    fireEvent.keyDown(filterInput, { key: "Backspace" });
    expect(fileRequests).not.toContain("/api/servers/7/files?path=%2Fhome");

    fireEvent.keyDown(window, { key: "Backspace" });
    await waitFor(() =>
      expect(fileRequests).toContain("/api/servers/7/files?path=%2Fhome"),
    );

    fireEvent.keyDown(filterInput, { key: "Escape" });
    expect((filterInput as HTMLInputElement).value).toBe("");
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("apre una cartella con doppio clic", async () => {
    renderPanel();
    await screen.findByText("hello.txt");

    fireEvent.doubleClick(screen.getByText("logs"));

    await waitFor(() =>
      expect(fileRequests).toContain(
        "/api/servers/7/files?path=%2Fhome%2Ftest%2Flogs",
      ),
    );
  });
});
