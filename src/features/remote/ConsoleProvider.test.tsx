import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../lib/i18n";
import { FakeSocket, stubWebSocket } from "../../test/fakeSocket";

const { terminals } = vi.hoisted(() => ({
  terminals: [] as Array<{ focus: ReturnType<typeof vi.fn> }>,
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 100;
    rows = 30;
    constructor() {
      terminals.push(this);
    }
    open = vi.fn();
    loadAddon = vi.fn();
    focus = vi.fn();
    dispose = vi.fn();
    write = vi.fn();
    onData = () => ({ dispose: vi.fn() });
    onResize = () => ({ dispose: vi.fn() });
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit = vi.fn();
  },
}));

vi.mock("../../app/AuthProvider", () => ({
  useAuth: () => ({ session: { csrfToken: "csrf" } }),
}));

const terminalHidden = () => {
  const node = screen.queryByLabelText("Terminale SSH") as HTMLElement | null;
  return node === null || node.closest("[hidden]") !== null;
};

import {
  ConsoleProvider,
  type ConsoleServerInfo,
  clearConsoleSessions,
  useConsole,
} from "./ConsoleProvider";

function Opener({
  serverId,
  serverName,
  info,
}: {
  serverId: number;
  serverName: string;
  info?: ConsoleServerInfo;
}) {
  const consoleApi = useConsole();
  return (
    <button
      type="button"
      onClick={() => consoleApi.open(serverId, serverName, info)}
    >
      Apri console {serverName}
    </button>
  );
}

function FilesOpener({ serverId }: { serverId: number }) {
  const consoleApi = useConsole();
  return (
    <button type="button" onClick={() => consoleApi.openFiles(serverId)}>
      Apri file {serverId}
    </button>
  );
}

function HasSession({ serverId }: { serverId: number }) {
  const consoleApi = useConsole();
  return (
    <span data-testid={`has-session-${serverId}`}>
      {String(consoleApi.hasSession(serverId))}
    </span>
  );
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const SERVERS = [
  {
    id: 44,
    name: "srv-alpha",
    providerEnvironmentId: 1,
    providerEnvironmentLabel: "ACME / PROD",
    ipAddress: "10.0.0.44",
    hostname: "srv-alpha.acme.example",
    sshPort: 22,
    fileTransferProtocol: "Sftp",
    fileTransferPort: 22,
  },
  {
    id: 45,
    name: "srv-beta",
    providerEnvironmentId: 1,
    providerEnvironmentLabel: "ACME / TEST",
    ipAddress: "10.0.0.45",
    hostname: "srv-beta.acme.example",
    sshPort: 22,
    fileTransferProtocol: "Ftp",
    fileTransferPort: 21,
  },
];

let fileRequests: string[] = [];
let serverRequests = 0;

function stubFilesFetch() {
  fileRequests = [];
  serverRequests = 0;
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
      if (
        url.includes("/api/servers/44/files") ||
        url.includes("/api/servers/45/files")
      ) {
        fileRequests.push(url);
        const serverId = url.includes("/api/servers/44/") ? 44 : 45;
        const home = serverId === 44 ? "/home/alpha" : "/home/beta";
        const path =
          new URL(url, "http://localhost").searchParams.get("path") ?? home;
        const items =
          path === "/home/alpha"
            ? [
                {
                  name: "sub",
                  path: "/home/alpha/sub",
                  isDirectory: true,
                  size: 0,
                  modifiedUtc: null,
                },
              ]
            : path === "/home/beta"
              ? [
                  {
                    name: "docs",
                    path: "/home/beta/docs",
                    isDirectory: true,
                    size: 0,
                    modifiedUtc: null,
                  },
                ]
              : [];
        return json({ path, items });
      }
      if (/^\/api\/servers(\?|$)/.test(url)) {
        serverRequests += 1;
        return json({
          items: SERVERS,
          total: SERVERS.length,
          page: 1,
          pageSize: 200,
        });
      }
      return json({});
    }),
  );
}

const renderFiles = () =>
  renderIt(
    <ConsoleProvider>
      <FilesOpener serverId={44} />
      <FilesOpener serverId={45} />
    </ConsoleProvider>,
  );

const renderWithProvider = () =>
  renderIt(
    <ConsoleProvider>
      <Opener serverId={44} serverName="srv-alpha" />
    </ConsoleProvider>,
  );

const visiblePanes = () =>
  screen
    .getAllByTestId(/console-pane-/)
    .filter((pane) => !pane.hasAttribute("hidden"));

const visibleFilePanes = () =>
  screen
    .getAllByTestId(/^file-pane-/)
    .filter((pane) => !pane.hasAttribute("hidden"));

const consoleTab = (label: string) =>
  screen.getByRole("button", { name: `Apri la console di ${label}` });

const fileTabButton = (name: string) =>
  screen.getByRole("button", { name: `Apri la sessione file di ${name}` });

const queryFileTab = (name: string) =>
  screen.queryByRole("button", { name: `Apri la sessione file di ${name}` });

const fileTab = (name: string) =>
  fileTabButton(name).closest("div") as HTMLElement;

const fileDialog = (name: string) =>
  screen
    .getAllByRole("dialog")
    .find((dialog) => dialog.textContent?.includes(name)) ?? null;

describe("ConsoleProvider", () => {
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    localStorage.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    localStorage.setItem("infraorgit-console-height", "320");
    terminals.length = 0;
    stubWebSocket();
    vi.stubGlobal("PointerEvent", class extends MouseEvent {});
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
  });

  it("mostra nome, IP e hostname nella tab e il testo intero nel tooltip", () => {
    renderIt(
      <ConsoleProvider>
        <Opener
          serverId={44}
          serverName="demo-app-01"
          info={{
            ipAddress: "10.0.0.10",
            hostname: "demo-app-01.acme.example",
            environment: "ACME / PROD",
          }}
        />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console demo-app-01"));

    const label = "demo-app-01 · 10.0.0.10 · demo-app-01.acme.example";
    const tab = consoleTab(label);
    expect(tab.getAttribute("title")).toBe(label);
    expect(within(tab).getByText(label)).toHaveClass("truncate");
  });

  it("riduce la console nella barra senza chiudere la sessione", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console srv-alpha"));

    const socket = FakeSocket.instances[0];
    expect(terminalHidden()).toBe(false);

    fireEvent.click(screen.getByText("Riduci"));

    expect(terminalHidden()).toBe(true);
    expect(socket.readyState).toBe(FakeSocket.OPEN);
    expect(consoleTab("srv-alpha")).toBeTruthy();
  });

  it("riapre la sessione ridotta dalla barra", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByText("Riduci"));
    fireEvent.click(consoleTab("srv-alpha"));

    expect(terminalHidden()).toBe(false);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("chiude la console dalla barra", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByText("Riduci"));
    fireEvent.click(screen.getByLabelText("Chiudi la console di srv-alpha"));

    expect(
      screen.queryByRole("button", { name: "Apri la console di srv-alpha" }),
    ).toBeNull();
    expect(FakeSocket.instances[0].readyState).toBe(FakeSocket.CLOSED);
    expect(FakeSocket.instances[0].sent).toContain(
      JSON.stringify({ type: "terminate" }),
    );
  });

  it("cerca nel launcher per IP, hostname e ambiente", async () => {
    stubFilesFetch();
    renderWithProvider();
    fireEvent.click(screen.getByLabelText("Aggiungi console"));

    const search = await screen.findByPlaceholderText("Cerca un server…");
    await screen.findByText("srv-alpha");

    fireEvent.change(search, { target: { value: "10.0.0.45" } });
    expect(screen.queryByText("srv-alpha")).toBeNull();
    expect(screen.getByText("srv-beta")).toBeTruthy();

    fireEvent.change(search, { target: { value: "alpha.acme.example" } });
    expect(screen.getByText("srv-alpha")).toBeTruthy();
    expect(screen.queryByText("srv-beta")).toBeNull();

    fireEvent.change(search, { target: { value: "ACME / TEST" } });
    expect(screen.getByText("srv-beta")).toBeTruthy();
    expect(screen.queryByText("srv-alpha")).toBeNull();

    fireEvent.change(search, { target: { value: "niente" } });
    expect(
      screen.getByText("Nessun server su cui hai il ruolo ServerAdmin."),
    ).toBeTruthy();

    fireEvent.change(search, { target: { value: "10.0.0.45" } });
    fireEvent.click(screen.getByText("srv-beta"));

    expect(FakeSocket.instances).toHaveLength(1);
    expect(
      consoleTab("srv-beta · 10.0.0.45 · srv-beta.acme.example"),
    ).toBeTruthy();
  });

  it("naviga il launcher con le frecce e apre con Invio", async () => {
    stubFilesFetch();
    renderWithProvider();
    fireEvent.click(screen.getByLabelText("Aggiungi console"));

    const search = await screen.findByPlaceholderText("Cerca un server…");
    await screen.findByText("srv-alpha");
    fireEvent.change(search, { target: { value: "srv" } });

    fireEvent.keyDown(search, { key: "ArrowDown" });
    const active = screen.getByText("srv-beta").closest("button");
    expect(active).toHaveAttribute("aria-selected", "true");
    expect(active).toHaveClass("listbox-option-active");

    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    expect(
      consoleTab("srv-beta · 10.0.0.45 · srv-beta.acme.example"),
    ).toBeTruthy();
  });

  it("dispone le console su due pannelli e permette di sceglierli", () => {
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <Opener serverId={45} serverName="srv-beta" />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByLabelText("2 pannelli"));
    fireEvent.click(screen.getByText("Apri console srv-beta"));
    expect(visiblePanes()).toHaveLength(2);
    expect(visiblePanes()[0]).toHaveTextContent("srv-alpha");
    expect(visiblePanes()[1]).toHaveTextContent("srv-beta");
    expect(FakeSocket.instances).toHaveLength(2);

    fireEvent.click(screen.getByLabelText("1 pannello"));
    expect(visiblePanes()).toHaveLength(1);
    expect(consoleTab("srv-alpha")).toBeTruthy();
    expect(consoleTab("srv-beta")).toBeTruthy();
    expect(FakeSocket.instances).toHaveLength(2);

    fireEvent.click(screen.getByLabelText("2 pannelli"));
    const chooser = screen.getByLabelText(
      "Scegli la console per questo pannello",
    );
    expect(chooser).toBeTruthy();
    const betaOption = within(chooser).getByRole("option", {
      name: "Console · srv-beta",
    }) as HTMLOptionElement;
    fireEvent.change(chooser, { target: { value: betaOption.value } });

    expect(visiblePanes()).toHaveLength(2);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("sposta una console su un altro pannello dal pannello stesso", () => {
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <Opener serverId={45} serverName="srv-beta" />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByLabelText("3 pannelli"));
    fireEvent.click(screen.getByText("Apri console srv-beta"));
    const alphaPane = screen
      .getAllByTestId(/console-pane-/)
      .find((pane) => pane.textContent?.includes("srv-alpha")) as HTMLElement;
    const picker = within(alphaPane).getByLabelText("Pannello della console");
    fireEvent.change(picker, { target: { value: "2" } });

    expect(alphaPane.hasAttribute("hidden")).toBe(false);
    expect(screen.getByTestId("console-empty-pane-0")).toBeTruthy();
    expect(visiblePanes()).toHaveLength(2);
  });

  it("compatta i pannelli chiudendo la console del primo pannello", () => {
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <Opener serverId={45} serverName="srv-beta" />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByText("Apri console srv-beta"));
    expect(visiblePanes()).toHaveLength(2);

    fireEvent.click(within(visiblePanes()[0]).getByText("Chiudi"));

    expect(visiblePanes()).toHaveLength(1);
    expect(visiblePanes()[0]).toHaveTextContent("srv-beta");
    expect(visiblePanes()[0].style.left).toBe("0%");
    expect(screen.queryByTestId("console-empty-pane-0")).toBeNull();
    expect(screen.getByLabelText("1 pannello")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("compatta i pannelli chiudendo una console tra tre", () => {
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <Opener serverId={45} serverName="srv-beta" />
        <Opener serverId={46} serverName="srv-gamma" />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByText("Apri console srv-beta"));
    fireEvent.click(screen.getByText("Apri console srv-gamma"));
    expect(visiblePanes()).toHaveLength(3);

    fireEvent.click(within(visiblePanes()[0]).getByText("Chiudi"));

    expect(visiblePanes()).toHaveLength(2);
    expect(visiblePanes()[0]).toHaveTextContent("srv-beta");
    expect(visiblePanes()[0].style.left).toBe("0%");
    expect(visiblePanes()[1]).toHaveTextContent("srv-gamma");
    expect(visiblePanes()[1].style.left).toBe("50%");
    expect(screen.queryByTestId("console-empty-pane-0")).toBeNull();
    expect(screen.queryByTestId("console-empty-pane-1")).toBeNull();
    expect(screen.getByLabelText("2 pannelli")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("compatta nei pannelli 0 e 1 le sessioni spostate su 1 e 2", () => {
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <Opener serverId={45} serverName="srv-beta" />
        <Opener serverId={46} serverName="srv-gamma" />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByText("Apri console srv-beta"));
    fireEvent.click(screen.getByText("Apri console srv-gamma"));

    const alphaPane = screen
      .getAllByTestId(/console-pane-/)
      .find((pane) => pane.textContent?.includes("srv-alpha")) as HTMLElement;
    fireEvent.change(
      within(alphaPane).getByLabelText("Pannello della console"),
      { target: { value: "1" } },
    );
    expect(visiblePanes()).toHaveLength(2);

    fireEvent.click(screen.getByLabelText("2 pannelli"));

    expect(visiblePanes()).toHaveLength(2);
    expect(visiblePanes()[0]).toHaveTextContent("srv-alpha");
    expect(visiblePanes()[0].style.left).toBe("0%");
    expect(visiblePanes()[1]).toHaveTextContent("srv-gamma");
    expect(visiblePanes()[1].style.left).toBe("50%");
  });

  it("mantiene attiva la console che cambia pannello chiudendone un'altra", () => {
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <Opener serverId={45} serverName="srv-beta" />
        <Opener serverId={46} serverName="srv-gamma" />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByText("Apri console srv-beta"));
    fireEvent.click(screen.getByText("Apri console srv-gamma"));

    const gammaPane = screen
      .getAllByTestId(/^console-pane-/)
      .find((pane) => pane.textContent?.includes("srv-gamma")) as HTMLElement;
    fireEvent.pointerDown(
      within(gammaPane).getByText(/Console SSH · srv-gamma/),
    );
    expect(gammaPane.getAttribute("data-active")).toBe("true");

    fireEvent.click(within(visiblePanes()[0]).getByText("Chiudi"));

    expect(visiblePanes()).toHaveLength(2);
    const moved = visiblePanes().find((pane) =>
      pane.textContent?.includes("srv-gamma"),
    ) as HTMLElement;
    expect(moved.getAttribute("data-active")).toBe("true");
  });

  it("fa subentrare la console minimizzata chiudendone una visibile non attiva", () => {
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <Opener serverId={45} serverName="srv-beta" />
        <Opener serverId={46} serverName="srv-gamma" />
        <Opener serverId={47} serverName="srv-delta" />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByText("Apri console srv-beta"));
    fireEvent.click(screen.getByText("Apri console srv-gamma"));
    fireEvent.click(screen.getByText("Apri console srv-delta"));
    // La quarta console prende il pannello attivo e manda gamma in barra.
    expect(visiblePanes()).toHaveLength(3);
    expect(
      visiblePanes().some((pane) => pane.textContent?.includes("srv-gamma")),
    ).toBe(false);

    fireEvent.click(within(visiblePanes()[0]).getByText("Chiudi"));

    const promoted = visiblePanes().find((pane) =>
      pane.textContent?.includes("srv-gamma"),
    ) as HTMLElement;
    expect(promoted).toBeTruthy();
    expect(visiblePanes()).toHaveLength(3);
    expect(screen.queryByTestId("console-empty-pane-0")).toBeNull();
    expect(screen.queryByTestId("console-empty-pane-1")).toBeNull();
    expect(screen.queryByTestId("console-empty-pane-2")).toBeNull();
    expect(screen.getByLabelText("3 pannelli")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("fa subentrare la minimizzata rendendola attiva chiudendo la console attiva", () => {
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <Opener serverId={45} serverName="srv-beta" />
        <Opener serverId={46} serverName="srv-gamma" />
        <Opener serverId={47} serverName="srv-delta" />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByText("Apri console srv-beta"));
    fireEvent.click(screen.getByText("Apri console srv-gamma"));
    fireEvent.click(screen.getByText("Apri console srv-delta"));

    const deltaPane = screen
      .getAllByTestId(/^console-pane-/)
      .find((pane) => pane.textContent?.includes("srv-delta")) as HTMLElement;
    expect(deltaPane.getAttribute("data-active")).toBe("true");
    fireEvent.click(within(deltaPane).getByText("Chiudi"));

    expect(visiblePanes()).toHaveLength(3);
    const promoted = visiblePanes().find((pane) =>
      pane.textContent?.includes("srv-gamma"),
    ) as HTMLElement;
    expect(promoted.getAttribute("data-active")).toBe("true");
    expect(screen.getByLabelText("3 pannelli")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("fa subentrare la minimizzata mantenendo due pannelli", () => {
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <Opener serverId={45} serverName="srv-beta" />
        <Opener serverId={46} serverName="srv-gamma" />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByText("Apri console srv-beta"));
    fireEvent.click(screen.getByText("Apri console srv-gamma"));

    const gammaPane = screen
      .getAllByTestId(/^console-pane-/)
      .find((pane) => pane.textContent?.includes("srv-gamma")) as HTMLElement;
    fireEvent.click(within(gammaPane).getByText("Riduci"));
    expect(visiblePanes()).toHaveLength(2);

    fireEvent.click(within(visiblePanes()[0]).getByText("Chiudi"));

    expect(visiblePanes()).toHaveLength(2);
    expect(
      visiblePanes().some((pane) => pane.textContent?.includes("srv-gamma")),
    ).toBe(true);
    expect(screen.getByLabelText("2 pannelli")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("mantiene attiva la sessione compattata riducendo il layout", () => {
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <Opener serverId={45} serverName="srv-beta" />
        <Opener serverId={46} serverName="srv-gamma" />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByText("Apri console srv-beta"));
    fireEvent.click(screen.getByText("Apri console srv-gamma"));

    const alphaPane = screen
      .getAllByTestId(/^console-pane-/)
      .find((pane) => pane.textContent?.includes("srv-alpha")) as HTMLElement;
    fireEvent.change(
      within(alphaPane).getByLabelText("Pannello della console"),
      { target: { value: "1" } },
    );

    const gammaPane = screen
      .getAllByTestId(/^console-pane-/)
      .find((pane) => pane.textContent?.includes("srv-gamma")) as HTMLElement;
    fireEvent.pointerDown(
      within(gammaPane).getByText(/Console SSH · srv-gamma/),
    );
    expect(gammaPane.getAttribute("data-active")).toBe("true");

    fireEvent.click(screen.getByLabelText("2 pannelli"));

    expect(visiblePanes()).toHaveLength(2);
    const moved = visiblePanes().find((pane) =>
      pane.textContent?.includes("srv-gamma"),
    ) as HTMLElement;
    expect(moved.getAttribute("data-active")).toBe("true");
    expect(screen.queryByTestId("console-empty-pane-0")).toBeNull();
  });

  it("apre due console dello stesso server in due pannelli", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByText("Apri console srv-alpha"));

    expect(screen.getByLabelText("2 pannelli")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(visiblePanes()).toHaveLength(2);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(consoleTab("srv-alpha")).toBeTruthy();
    expect(consoleTab("srv-alpha · #2")).toBeTruthy();
  });

  it("apre i file accanto alla console senza chiuderla", async () => {
    stubFilesFetch();
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <FilesOpener serverId={44} />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByText("Apri file 44"));

    await screen.findByRole("button", {
      name: "Apri la sessione file di srv-alpha",
    });
    expect(screen.getByLabelText("2 pannelli")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Console e pannello file restano visibili affiancati.
    expect(visiblePanes()).toHaveLength(1);
    expect(visibleFilePanes()).toHaveLength(1);
    expect(terminalHidden()).toBe(false);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.instances[0].readyState).toBe(FakeSocket.OPEN);
    expect(
      screen.getByRole("button", { name: /Apri la console di srv-alpha/ }),
    ).toBeTruthy();
  });

  it("chiude una sola sessione file lasciando console e altra sessione", async () => {
    stubFilesFetch();
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <FilesOpener serverId={44} />
        <FilesOpener serverId={45} />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByText("Apri file 44"));
    await screen.findByRole("button", {
      name: "Apri la sessione file di srv-alpha",
    });
    fireEvent.click(screen.getByText("Apri file 45"));
    await screen.findByRole("button", {
      name: "Apri la sessione file di srv-beta",
    });
    expect(visibleFilePanes()).toHaveLength(2);

    fireEvent.click(
      within(fileDialog("srv-alpha") as HTMLElement).getByLabelText(
        "Chiudi la sessione file di srv-alpha",
      ),
    );

    await waitFor(() => expect(queryFileTab("srv-alpha")).toBeNull());
    expect(fileTabButton("srv-beta")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Apri la console di srv-alpha/ }),
    ).toBeTruthy();
    expect(visibleFilePanes()).toHaveLength(1);
    expect(FakeSocket.instances[0].readyState).toBe(FakeSocket.OPEN);
    await waitFor(() =>
      expect(
        fileRequests.some((url) => url.includes("/api/servers/45/files")),
      ).toBe(true),
    );
  });

  it("chiudendo la sessione file attiva attiva il pannello rimasto", async () => {
    stubFilesFetch();
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <FilesOpener serverId={44} />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByText("Apri file 44"));
    await screen.findByRole("button", {
      name: "Apri la sessione file di srv-alpha",
    });

    const terminal = terminals[0];
    const focused = terminal.focus.mock.calls.length;
    fireEvent.click(
      within(fileDialog("srv-alpha") as HTMLElement).getByLabelText(
        "Chiudi la sessione file di srv-alpha",
      ),
    );

    await waitFor(() =>
      expect(terminal.focus.mock.calls.length).toBeGreaterThan(focused),
    );
  });

  it("chiudendo la console sposta la sessione file nel pannello rimasto", async () => {
    stubFilesFetch();
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <FilesOpener serverId={44} />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByText("Apri file 44"));
    await screen.findByText("sub");
    expect(visiblePanes()).toHaveLength(1);
    expect(visibleFilePanes()).toHaveLength(1);
    expect(visibleFilePanes()[0].style.left).toBe("50%");

    fireEvent.click(within(visiblePanes()[0]).getByText("Chiudi"));

    expect(screen.queryAllByTestId(/^console-pane-/)).toHaveLength(0);
    expect(visibleFilePanes()).toHaveLength(1);
    expect(visibleFilePanes()[0].style.left).toBe("0%");
    expect(fileTabButton("srv-alpha")).toBeTruthy();
    expect(screen.queryByTestId("console-empty-pane-0")).toBeNull();
    expect(screen.getByLabelText("1 pannello")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("chiudendo la sessione file sposta la console nel pannello rimasto", async () => {
    stubFilesFetch();
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <FilesOpener serverId={44} />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri file 44"));
    await screen.findByText("sub");
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    expect(visibleFilePanes()).toHaveLength(1);
    expect(visibleFilePanes()[0].style.left).toBe("0%");
    expect(visiblePanes()).toHaveLength(1);
    expect(visiblePanes()[0].style.left).toBe("50%");

    fireEvent.click(
      within(fileDialog("srv-alpha") as HTMLElement).getByLabelText(
        "Chiudi la sessione file di srv-alpha",
      ),
    );

    await waitFor(() => expect(queryFileTab("srv-alpha")).toBeNull());
    expect(screen.queryAllByTestId(/^file-pane-/)).toHaveLength(0);
    expect(visiblePanes()).toHaveLength(1);
    expect(visiblePanes()[0]).toHaveTextContent("srv-alpha");
    expect(visiblePanes()[0].style.left).toBe("0%");
    expect(screen.queryByTestId("console-empty-pane-0")).toBeNull();
    expect(screen.getByLabelText("1 pannello")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("chiudendo la console promuove la sessione file ridotta", async () => {
    stubFilesFetch();
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <FilesOpener serverId={44} />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByText("Apri file 44"));
    await screen.findByText("sub");
    fireEvent.click(
      await screen.findByLabelText("Riduci la sessione file di srv-alpha"),
    );
    expect(visibleFilePanes()).toHaveLength(0);

    fireEvent.click(within(visiblePanes()[0]).getByText("Chiudi"));

    expect(screen.queryAllByTestId(/^console-pane-/)).toHaveLength(0);
    expect(visibleFilePanes()).toHaveLength(1);
    expect(visibleFilePanes()[0].style.left).toBe("0%");
    expect(fileTabButton("srv-alpha")).toBeTruthy();
    expect(screen.queryByTestId("console-empty-pane-0")).toBeNull();
  });

  it("il pannello vuoto elenca console e sessioni file", async () => {
    stubFilesFetch();
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <FilesOpener serverId={44} />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByText("Apri file 44"));
    await screen.findByRole("button", {
      name: "Apri la sessione file di srv-alpha",
    });
    await waitFor(() =>
      expect(
        within(fileTab("srv-alpha")).getByText(
          "File · srv-alpha · 10.0.0.44 · SFTP",
        ),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByLabelText("3 pannelli"));

    const chooser = screen.getByLabelText(
      "Scegli la console per questo pannello",
    );
    expect(
      within(chooser).getByRole("option", { name: /Console · srv-alpha/ }),
    ).toBeTruthy();
    const fileOption = within(chooser).getByRole("option", {
      name: "File · srv-alpha",
    }) as HTMLOptionElement;
    fireEvent.change(chooser, { target: { value: fileOption.value } });

    // Il pannello 1 torna vuoto, il file ora occupa il pannello 3.
    expect(screen.getByTestId("console-empty-pane-1")).toBeTruthy();
    expect(visibleFilePanes()).toHaveLength(1);
    expect(visiblePanes()).toHaveLength(1);
  });

  it("espande la console, torna all'altezza scelta e la persiste", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console srv-alpha"));

    const dockHeight = () =>
      document.documentElement.style.getPropertyValue("--console-dock-height");
    expect(dockHeight()).toBe("364px");

    fireEvent.click(screen.getByLabelText("Espandi la console"));
    expect(dockHeight()).toBe("calc(100vh - 4rem)");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(dockHeight()).toBe("364px");

    const handle = screen.getByRole("separator", {
      name: "Ridimensiona l'altezza della console",
    });
    fireEvent.pointerDown(handle, { clientY: 500 });
    fireEvent.pointerMove(window, { clientY: 420 });
    fireEvent.pointerUp(window);

    expect(localStorage.getItem("infraorgit-console-height")).toBe("400");
    expect(dockHeight()).toBe("444px");
  });

  it("mantiene la barra anche senza console", () => {
    renderWithProvider();
    expect(screen.getByText("Console", { exact: true })).toBeTruthy();
    expect(
      document.documentElement.style.getPropertyValue("--console-dock-height"),
    ).toBe("2.75rem");
  });

  it("minimizza i pannelli dalla barra, come Riduci", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    expect(
      document.documentElement.style.getPropertyValue("--console-dock-height"),
    ).toBe("364px");

    fireEvent.click(screen.getByTitle("Riduci"));
    expect(
      document.documentElement.style.getPropertyValue("--console-dock-height"),
    ).toBe("2.75rem");
    expect(terminalHidden()).toBe(true);
  });

  it("conserva lo split quando riduci e ripristina la console", () => {
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <Opener serverId={45} serverName="srv-beta" />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByLabelText("2 pannelli"));
    fireEvent.click(screen.getByText("Apri console srv-beta"));
    expect(visiblePanes()).toHaveLength(2);
    const dockHeight = () =>
      document.documentElement.style.getPropertyValue("--console-dock-height");
    expect(dockHeight()).toBe("364px");

    fireEvent.click(screen.getByTitle("Riduci"));
    expect(dockHeight()).toBe("2.75rem");
    expect(visiblePanes()).toHaveLength(2);

    fireEvent.click(screen.getByTitle("Ripristina console"));
    expect(dockHeight()).toBe("364px");
    expect(visiblePanes()).toHaveLength(2);
    expect(visiblePanes()[0]).toHaveTextContent("srv-alpha");
    expect(visiblePanes()[1]).toHaveTextContent("srv-beta");
  });

  it("segnala l'output non visto e lo azzera quando apri la console", () => {
    vi.useFakeTimers();
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByText("Riduci"));
    const socket = FakeSocket.instances[0];

    act(() => {
      socket.emit("layer scaricato");
      vi.advanceTimersByTime(700);
    });

    expect(screen.getByLabelText("Output non visto")).toBeTruthy();

    fireEvent.click(consoleTab("srv-alpha"));

    expect(screen.queryByLabelText("Output non visto")).toBeNull();
  });

  it("segnala l'output non visto anche con il pannello minimizzato", () => {
    vi.useFakeTimers();
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    // Il "Riduci" del pannello sposta la console nella barra.
    fireEvent.click(screen.getByText("Riduci"));
    const socket = FakeSocket.instances[0];

    act(() => {
      socket.emit("output");
      vi.advanceTimersByTime(700);
    });

    expect(screen.getByLabelText("Output non visto")).toBeTruthy();

    fireEvent.click(consoleTab("srv-alpha"));

    expect(screen.queryByLabelText("Output non visto")).toBeNull();
  });

  it("clearConsoleSessions svuota storage e sessioni attive", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    expect(sessionStorage.getItem("ds-console-sessions")).not.toBeNull();

    act(() => clearConsoleSessions());

    expect(sessionStorage.getItem("ds-console-sessions") ?? "[]").toBe("[]");
    expect(terminalHidden()).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Apri la console di srv-alpha" }),
    ).toBeNull();
  });

  it("dopo un refresh riaggancia la stessa sessione", () => {
    const first = renderWithProvider();
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    act(() => {
      FakeSocket.instances[0].emitText(
        JSON.stringify({ type: "session", id: "tok-9" }),
      );
    });

    first.unmount();
    renderWithProvider();

    expect(terminalHidden()).toBe(false);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.instances[1].url).toContain("resume=tok-9");
  });

  it("nasconde e riapre la stessa sessione file con il percorso corrente", async () => {
    stubFilesFetch();
    renderFiles();
    fireEvent.click(screen.getByText("Apri file 44"));

    await screen.findByRole("button", {
      name: "Apri la sessione file di srv-alpha",
    });
    await waitFor(() =>
      expect(
        within(fileTab("srv-alpha")).getByText(
          "File · srv-alpha · 10.0.0.44 · SFTP",
        ),
      ).toBeTruthy(),
    );
    fireEvent.click(await screen.findByText("sub"));
    await waitFor(() =>
      expect(
        fileRequests.some((url) =>
          url.includes("/api/servers/44/files?path=%2Fhome%2Falpha%2Fsub"),
        ),
      ).toBe(true),
    );

    fireEvent.click(
      await screen.findByLabelText("Riduci la sessione file di srv-alpha"),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fileTabButton("srv-alpha")).toBeTruthy();

    const before = fileRequests.length;
    fireEvent.click(screen.getByText("Apri file 44"));
    await waitFor(() =>
      expect(
        fileRequests
          .slice(before)
          .some((url) => url.includes("path=%2Fhome%2Falpha%2Fsub")),
      ).toBe(true),
    );

    fireEvent.click(
      await screen.findByLabelText("Riduci la sessione file di srv-alpha"),
    );
    const reopened = fileRequests.length;
    fireEvent.click(
      within(fileTab("srv-alpha")).getByLabelText(
        /Apri la sessione file di srv-alpha/,
      ),
    );
    await waitFor(() =>
      expect(
        fileRequests
          .slice(reopened)
          .some((url) => url.includes("path=%2Fhome%2Falpha%2Fsub")),
      ).toBe(true),
    );
  });

  it("chiude e distrugge la sessione file con la ×", async () => {
    stubFilesFetch();
    renderFiles();
    fireEvent.click(screen.getByText("Apri file 44"));
    await screen.findByRole("button", {
      name: "Apri la sessione file di srv-alpha",
    });
    await screen.findByText("sub");

    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByLabelText("Chiudi la sessione file di srv-alpha"),
    );

    await waitFor(() => expect(queryFileTab("srv-alpha")).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("tiene separate le sessioni file di due server", async () => {
    stubFilesFetch();
    renderFiles();
    fireEvent.click(screen.getByText("Apri file 44"));
    await screen.findByRole("button", {
      name: "Apri la sessione file di srv-alpha",
    });
    fireEvent.click(await screen.findByText("sub"));
    await waitFor(() =>
      expect(
        fileRequests.some((url) =>
          url.includes("/api/servers/44/files?path=%2Fhome%2Falpha%2Fsub"),
        ),
      ).toBe(true),
    );
    fireEvent.click(
      await screen.findByLabelText("Riduci la sessione file di srv-alpha"),
    );

    fireEvent.click(screen.getByText("Apri file 45"));
    await screen.findByRole("button", {
      name: "Apri la sessione file di srv-beta",
    });
    await waitFor(() =>
      expect(
        within(fileTab("srv-beta")).getByText(
          "File · srv-beta · 10.0.0.45 · FTP",
        ),
      ).toBeTruthy(),
    );
    fireEvent.click(await screen.findByText("docs"));
    await waitFor(() =>
      expect(
        fileRequests.some((url) =>
          url.includes("/api/servers/45/files?path=%2Fhome%2Fbeta%2Fdocs"),
        ),
      ).toBe(true),
    );
    fireEvent.click(
      await screen.findByLabelText("Riduci la sessione file di srv-beta"),
    );

    fireEvent.click(
      within(fileTab("srv-alpha")).getByLabelText(
        "Chiudi la sessione file di srv-alpha",
      ),
    );
    await waitFor(() => expect(queryFileTab("srv-alpha")).toBeNull());
    expect(fileTabButton("srv-beta")).toBeTruthy();

    const before = fileRequests.length;
    fireEvent.click(
      within(fileTab("srv-beta")).getByLabelText(
        /Apri la sessione file di srv-beta/,
      ),
    );
    await waitFor(() =>
      expect(
        fileRequests
          .slice(before)
          .some((url) => url.includes("path=%2Fhome%2Fbeta%2Fdocs")),
      ).toBe(true),
    );
  });

  it("chiudendo la sessione file attiva riapre la precedente", async () => {
    stubFilesFetch();
    renderFiles();
    fireEvent.click(screen.getByText("Apri file 44"));
    await screen.findByRole("button", {
      name: "Apri la sessione file di srv-alpha",
    });
    await screen.findByText("sub");
    fireEvent.click(screen.getByText("Apri file 45"));
    await screen.findByRole("button", {
      name: "Apri la sessione file di srv-beta",
    });
    await screen.findByText("docs");

    const activeDialog = fileDialog("srv-beta");
    expect(activeDialog).not.toBeNull();
    fireEvent.click(
      within(activeDialog as HTMLElement).getByLabelText(
        "Chiudi la sessione file di srv-beta",
      ),
    );

    await waitFor(() => expect(queryFileTab("srv-beta")).toBeNull());
    expect(fileTabButton("srv-alpha")).toBeTruthy();
    // La sessione 44 non è stata toccata: torna visibile con la sua lista.
    expect(fileDialog("srv-alpha")).not.toBeNull();
    expect(await screen.findByText("sub")).toBeInTheDocument();
  });

  it("chiude le sessioni file al logout", async () => {
    stubFilesFetch();
    renderFiles();
    fireEvent.click(screen.getByText("Apri file 44"));
    await screen.findByRole("button", {
      name: "Apri la sessione file di srv-alpha",
    });

    act(() => clearConsoleSessions());

    await waitFor(() => expect(queryFileTab("srv-alpha")).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sceglie il server del pannello file cercando per IP, hostname e ambiente", async () => {
    stubFilesFetch();
    renderFiles();
    fireEvent.click(screen.getByLabelText("Apri i file dei server"));

    const search = await screen.findByPlaceholderText(
      "Cerca per nome, IP, hostname o ambiente…",
    );
    await screen.findByText("srv-alpha");
    expect(
      screen.getByText("10.0.0.44 · srv-alpha.acme.example · ACME / PROD"),
    ).toBeTruthy();

    fireEvent.change(search, { target: { value: "10.0.0.45" } });
    expect(screen.queryByText("srv-alpha")).toBeNull();
    expect(screen.getByText("srv-beta")).toBeTruthy();

    fireEvent.change(search, { target: { value: "alpha.acme.example" } });
    expect(screen.getByText("srv-alpha")).toBeTruthy();

    fireEvent.change(search, { target: { value: "ACME / TEST" } });
    expect(screen.getByText("srv-beta")).toBeTruthy();

    fireEvent.change(search, { target: { value: "niente" } });
    expect(
      screen.getByText("Nessun server corrisponde alla ricerca."),
    ).toBeTruthy();

    fireEvent.change(search, { target: { value: "beta.acme.example" } });
    fireEvent.click(screen.getByText("srv-beta"));

    expect(
      await screen.findByRole("button", {
        name: "Apri la sessione file di srv-beta",
      }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        fileRequests.some((url) => url.includes("/api/servers/45/files")),
      ).toBe(true),
    );
  });

  it("conta anche una sessione file in hasSession", async () => {
    stubFilesFetch();
    renderIt(
      <ConsoleProvider>
        <FilesOpener serverId={44} />
        <HasSession serverId={44} />
      </ConsoleProvider>,
    );
    expect(screen.getByTestId("has-session-44").textContent).toBe("false");
    fireEvent.click(screen.getByText("Apri file 44"));
    await screen.findByTestId(/^file-tab-/);

    await waitFor(() =>
      expect(screen.getByTestId("has-session-44").textContent).toBe("true"),
    );
  });

  it("ripristina le sessioni file dopo un refresh", async () => {
    stubFilesFetch();
    const first = renderFiles();
    fireEvent.click(screen.getByText("Apri file 44"));
    await screen.findByText("sub");
    await waitFor(() =>
      expect(sessionStorage.getItem("ds-file-sessions")).not.toBeNull(),
    );

    first.unmount();
    stubFilesFetch();
    renderFiles();

    expect(await screen.findByText("sub")).toBeTruthy();
    expect(fileTabButton("srv-alpha")).toBeTruthy();
  });

  it("non manda Esc/Backspace alla sessione file quando il dock è ridotto", async () => {
    stubFilesFetch();
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <FilesOpener serverId={44} />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByText("Apri file 44"));
    await screen.findByText("sub");
    expect(visibleFilePanes()).toHaveLength(1);

    fireEvent.click(screen.getByTitle("Riduci"));
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByTitle("Ripristina console"));

    expect(visibleFilePanes()).toHaveLength(1);
  });

  it("Esc esce dalla console espansa anche con un pannello file attivo", async () => {
    stubFilesFetch();
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <FilesOpener serverId={44} />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByText("Apri file 44"));
    await screen.findByText("sub");

    fireEvent.click(screen.getByLabelText("Espandi la console"));
    await waitFor(() =>
      expect(
        screen.getByLabelText("Riporta la console all'altezza precedente"),
      ).toBeTruthy(),
    );
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() =>
      expect(screen.getByLabelText("Espandi la console")).toBeTruthy(),
    );
  });

  it("attiva il pannello console cliccandone l'intestazione", async () => {
    renderIt(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <Opener serverId={45} serverName="srv-beta" />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByText("Apri console srv-alpha"));
    fireEvent.click(screen.getByLabelText("2 pannelli"));
    fireEvent.click(screen.getByText("Apri console srv-beta"));

    const panes = screen.getAllByTestId(/^console-pane-/);
    expect(panes[1].getAttribute("data-active")).toBe("true");
    fireEvent.pointerDown(
      within(panes[0]).getByText(/Console SSH · srv-alpha/),
    );

    expect(panes[0].getAttribute("data-active")).toBe("true");
    expect(panes[1].getAttribute("data-active")).toBe("false");
  });

  it("carica l'inventario una volta per più pannelli file", async () => {
    stubFilesFetch();
    renderFiles();
    fireEvent.click(screen.getByText("Apri file 44"));
    await screen.findByText("sub");
    fireEvent.click(screen.getByText("Apri file 45"));
    await screen.findByText("docs");

    await waitFor(() => expect(serverRequests).toBe(1));
  });
});

function renderIt(ui: ReactNode) {
  return render(<LanguageProvider initialLanguage="it">{ui}</LanguageProvider>);
}
