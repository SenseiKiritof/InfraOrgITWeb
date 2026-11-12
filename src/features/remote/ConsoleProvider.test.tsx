import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSocket, stubWebSocket } from "../../test/fakeSocket";

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 100;
    rows = 30;
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
  clearConsoleSessions,
  useConsole,
} from "./ConsoleProvider";

function Opener({
  serverId,
  serverName,
}: {
  serverId: number;
  serverName: string;
}) {
  const consoleApi = useConsole();
  return (
    <button type="button" onClick={() => consoleApi.open(serverId, serverName)}>
      Apri console
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

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

let fileRequests: string[] = [];

function stubFilesFetch() {
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
      if (url.includes("/api/servers")) {
        return json({
          items: [
            {
              id: 44,
              name: "srv-alpha",
              providerEnvironmentId: 1,
              ipAddress: "10.0.0.44",
              sshPort: 22,
              fileTransferProtocol: "Sftp",
              fileTransferPort: 22,
            },
            {
              id: 45,
              name: "srv-beta",
              providerEnvironmentId: 1,
              ipAddress: "10.0.0.45",
              sshPort: 22,
              fileTransferProtocol: "Sftp",
              fileTransferPort: 22,
            },
          ],
          total: 2,
          page: 1,
          pageSize: 200,
        });
      }
      return json({});
    }),
  );
}

const renderFiles = () =>
  render(
    <ConsoleProvider>
      <FilesOpener serverId={44} />
      <FilesOpener serverId={45} />
    </ConsoleProvider>,
  );

const renderWithProvider = () =>
  render(
    <ConsoleProvider>
      <Opener serverId={44} serverName="srv-alpha" />
    </ConsoleProvider>,
  );

describe("ConsoleProvider", () => {
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    sessionStorage.clear();
    stubWebSocket();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
  });

  it("riduce la console nella barra senza chiudere la sessione", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console"));

    const socket = FakeSocket.instances[0];
    expect(terminalHidden()).toBe(false);

    fireEvent.click(screen.getByText("Riduci"));

    expect(terminalHidden()).toBe(true);
    expect(socket.readyState).toBe(FakeSocket.OPEN);
    expect(screen.getByText("srv-alpha")).toBeTruthy();
  });

  it("riapre la sessione ridotta dalla barra", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console"));
    fireEvent.click(screen.getByText("Riduci"));
    fireEvent.click(screen.getByText("srv-alpha"));

    expect(terminalHidden()).toBe(false);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("chiude la console dalla barra", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console"));
    fireEvent.click(screen.getByText("Riduci"));
    fireEvent.click(screen.getByLabelText("Chiudi la console di srv-alpha"));

    expect(screen.queryByText("srv-alpha")).toBeNull();
    expect(FakeSocket.instances[0].readyState).toBe(FakeSocket.CLOSED);
    expect(FakeSocket.instances[0].sent).toContain(
      JSON.stringify({ type: "terminate" }),
    );
  });

  it("aggiunge una console dal footer scegliendo il server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const body = String(input).includes("/api/server-access/me")
          ? {
              isSystemAdmin: false,
              adminEnvironmentIds: [1],
              operatorEnvironmentIds: [1],
            }
          : {
              items: [
                {
                  id: 44,
                  name: "srv-alpha",
                  providerEnvironmentId: 1,
                  ipAddress: "10.0.0.1",
                  sshPort: 22,
                },
              ],
              total: 1,
              page: 1,
              pageSize: 200,
            };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    renderWithProvider();
    fireEvent.click(screen.getByLabelText("Aggiungi console"));
    fireEvent.click(await screen.findByText("srv-alpha"));

    expect(FakeSocket.instances).toHaveLength(1);
    expect(screen.getByTitle("Apri la console di srv-alpha")).toBeTruthy();
  });

  it("divide e unisce i terminali senza riconnettere", () => {
    render(
      <ConsoleProvider>
        <Opener serverId={44} serverName="srv-alpha" />
        <Opener serverId={45} serverName="srv-beta" />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getAllByText("Apri console")[0]);

    const panes = () => screen.getAllByTestId(/console-pane-/);
    expect(panes()).toHaveLength(1);
    expect(panes()[0].hasAttribute("hidden")).toBe(false);

    fireEvent.click(screen.getByLabelText("Dividi le console"));
    expect(panes().filter((pane) => !pane.hasAttribute("hidden"))).toHaveLength(
      1,
    );

    fireEvent.click(screen.getAllByText("Apri console")[1]);
    expect(panes()).toHaveLength(2);
    expect(panes().filter((pane) => !pane.hasAttribute("hidden"))).toHaveLength(
      2,
    );

    fireEvent.click(screen.getByLabelText("Unisci le console"));
    expect(panes().filter((pane) => !pane.hasAttribute("hidden"))).toHaveLength(
      1,
    );
    expect(FakeSocket.instances).toHaveLength(2);
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
    fireEvent.click(screen.getByText("Apri console"));
    expect(
      document.documentElement.style.getPropertyValue("--console-dock-height"),
    ).toBe("calc(45vh + 2.75rem)");

    fireEvent.click(screen.getByLabelText("Riduci"));
    expect(
      document.documentElement.style.getPropertyValue("--console-dock-height"),
    ).toBe("2.75rem");
    expect(terminalHidden()).toBe(true);
  });

  it("minimizza il pannello e lo riapre dalla barra", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console"));
    fireEvent.click(screen.getByText("Riduci"));

    expect(terminalHidden()).toBe(true);
    fireEvent.click(screen.getByTitle("Apri la console di srv-alpha"));
    expect(terminalHidden()).toBe(false);
  });

  it("segnala l'output non visto e lo azzera quando apri la console", () => {
    vi.useFakeTimers();
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console"));
    fireEvent.click(screen.getByText("Riduci"));
    const socket = FakeSocket.instances[0];

    act(() => {
      socket.emit("layer scaricato");
      vi.advanceTimersByTime(700);
    });

    expect(screen.getByLabelText("Output non visto")).toBeTruthy();

    fireEvent.click(screen.getByText("srv-alpha"));

    expect(screen.queryByLabelText("Output non visto")).toBeNull();
  });

  it("segnala l'output non visto anche con il pannello minimizzato", () => {
    vi.useFakeTimers();
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console"));
    fireEvent.click(screen.getByText("Riduci"));
    const socket = FakeSocket.instances[0];

    act(() => {
      socket.emit("output");
      vi.advanceTimersByTime(700);
    });

    expect(screen.getByLabelText("Output non visto")).toBeTruthy();

    fireEvent.click(screen.getByTitle("Apri la console di srv-alpha"));

    expect(screen.queryByLabelText("Output non visto")).toBeNull();
  });

  it("clearConsoleSessions svuota lo storage delle console", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console"));
    expect(sessionStorage.getItem("ds-console-sessions")).not.toBeNull();

    clearConsoleSessions();

    expect(sessionStorage.getItem("ds-console-sessions")).toBeNull();
  });

  it("dopo un refresh riaggancia la stessa sessione", () => {
    const first = renderWithProvider();
    fireEvent.click(screen.getByText("Apri console"));
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

    await screen.findByTestId("file-tab-44");
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
    expect(screen.getByTestId("file-tab-44")).toBeTruthy();

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
      within(screen.getByTestId("file-tab-44")).getByLabelText(
        "Apri la sessione file di srv-alpha",
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
    await screen.findByTestId("file-tab-44");
    await screen.findByText("sub");

    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByLabelText("Chiudi la sessione file di srv-alpha"),
    );

    await waitFor(() => expect(screen.queryByTestId("file-tab-44")).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("tiene separate le sessioni file di due server", async () => {
    stubFilesFetch();
    renderFiles();
    fireEvent.click(screen.getByText("Apri file 44"));
    await screen.findByTestId("file-tab-44");
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
    await screen.findByTestId("file-tab-45");
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
      within(screen.getByTestId("file-tab-44")).getByLabelText(
        "Chiudi la sessione file di srv-alpha",
      ),
    );
    await waitFor(() => expect(screen.queryByTestId("file-tab-44")).toBeNull());
    expect(screen.getByTestId("file-tab-45")).toBeTruthy();

    const before = fileRequests.length;
    fireEvent.click(
      within(screen.getByTestId("file-tab-45")).getByLabelText(
        "Apri la sessione file di srv-beta",
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

  it("chiude le sessioni file al logout", async () => {
    stubFilesFetch();
    renderFiles();
    fireEvent.click(screen.getByText("Apri file 44"));
    await screen.findByTestId("file-tab-44");

    act(() => clearConsoleSessions());

    await waitFor(() => expect(screen.queryByTestId("file-tab-44")).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("apre una sessione file scegliendo il server dal pannello", async () => {
    stubFilesFetch();
    renderFiles();
    fireEvent.click(screen.getByLabelText("Apri i file dei server"));

    const select = await screen.findByRole("combobox");
    await waitFor(() =>
      expect(within(select).getByText(/srv-alpha/)).toBeTruthy(),
    );
    fireEvent.change(select, { target: { value: "44" } });

    expect(await screen.findByTestId("file-tab-44")).toBeTruthy();
    await waitFor(() =>
      expect(
        fileRequests.some((url) => url.includes("/api/servers/44/files")),
      ).toBe(true),
    );
  });
});
