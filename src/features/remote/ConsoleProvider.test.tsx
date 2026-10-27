import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSocket, stubWebSocket } from "../../test/fakeSocket";
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
  });

  it("riduce la console nella barra senza chiudere la sessione", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console"));

    const socket = FakeSocket.instances[0];
    expect(screen.getByLabelText("Terminale SSH")).toBeTruthy();

    fireEvent.click(screen.getByText("Riduci"));

    expect(screen.queryByLabelText("Terminale SSH")).toBeNull();
    expect(socket.readyState).toBe(FakeSocket.OPEN);
    expect(screen.getByText("srv-alpha")).toBeTruthy();
  });

  it("riapre la sessione ridotta dalla barra", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console"));
    fireEvent.click(screen.getByText("Riduci"));
    fireEvent.click(screen.getByText("srv-alpha"));

    expect(screen.getByLabelText("Terminale SSH")).toBeTruthy();
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

  it("affianca e separa la console senza riconnettere", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console"));

    fireEvent.click(screen.getByText("Separa"));
    expect(screen.getByLabelText("Terminale SSH")).toBeTruthy();
    expect(screen.getByText("Affianca")).toBeTruthy();

    fireEvent.click(screen.getByText("Affianca"));
    expect(screen.getByLabelText("Terminale SSH")).toBeTruthy();
    expect(screen.getByText("Separa")).toBeTruthy();
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("riduce la barra a una riga e la riapre", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console"));
    fireEvent.click(screen.getByText("Riduci"));
    fireEvent.click(screen.getByLabelText("Riduci la barra delle console"));

    expect(screen.queryByText("srv-alpha")).toBeNull();
    fireEvent.click(screen.getByText("Console (1)"));
    expect(screen.getByText("srv-alpha")).toBeTruthy();
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

  it("segnala l'output non visto anche con la barra ridotta", () => {
    vi.useFakeTimers();
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console"));
    fireEvent.click(screen.getByLabelText("Riduci la barra delle console"));
    const socket = FakeSocket.instances[0];

    act(() => {
      socket.emit("output");
      vi.advanceTimersByTime(700);
    });

    expect(screen.getByLabelText("Output non visto")).toBeTruthy();

    fireEvent.click(screen.getByText("Console (1)"));

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

    expect(screen.getByLabelText("Terminale SSH")).toBeTruthy();
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.instances[1].url).toContain("resume=tok-9");
  });
});
