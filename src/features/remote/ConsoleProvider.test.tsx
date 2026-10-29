import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
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
});
