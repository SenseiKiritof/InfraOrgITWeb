import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  });
  beforeEach(() => {
    sessionStorage.clear();
    stubWebSocket();
  });

  it("riduce la console in una pillola senza chiudere la sessione", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console"));

    const socket = FakeSocket.instances[0];
    expect(screen.getByLabelText("Terminale SSH")).toBeTruthy();

    fireEvent.click(screen.getByText("Riduci"));

    expect(screen.queryByLabelText("Terminale SSH")).toBeNull();
    expect(socket.readyState).toBe(FakeSocket.OPEN);
    expect(screen.getByText("Console SSH · srv-alpha")).toBeTruthy();
  });

  it("riapre la sessione ridotta dalla pillola", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console"));
    fireEvent.click(screen.getByText("Riduci"));
    fireEvent.click(screen.getByText("Console SSH · srv-alpha"));

    expect(screen.getByLabelText("Terminale SSH")).toBeTruthy();
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("chiude la pillola e la sessione", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("Apri console"));
    fireEvent.click(screen.getByText("Riduci"));
    fireEvent.click(screen.getByLabelText("Chiudi la console di srv-alpha"));

    expect(screen.queryByText("Console SSH · srv-alpha")).toBeNull();
    expect(FakeSocket.instances[0].readyState).toBe(FakeSocket.CLOSED);
    expect(FakeSocket.instances[0].sent).toContain(
      JSON.stringify({ type: "terminate" }),
    );
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
