import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSocket, stubWebSocket } from "../../test/fakeSocket";
import { ConsoleModal } from "./ConsoleModal";

const renderConsole = (
  minimized = false,
  extra: { resumeId?: string; onSessionId?: (id: string) => void } = {},
) =>
  render(
    <ConsoleModal
      serverId={44}
      serverName="srv-alpha"
      minimized={minimized}
      resumeId={extra.resumeId}
      onSessionId={extra.onSessionId}
      onMinimize={vi.fn()}
      onClose={vi.fn()}
    />,
  );

describe("ConsoleModal", () => {
  afterEach(cleanup);

  beforeEach(stubWebSocket);

  it("resta connesso quando viene ridotta", () => {
    renderConsole(true);
    const socket = FakeSocket.instances[0];

    expect(screen.queryByLabelText("Terminale SSH")).toBeNull();
    expect(socket.readyState).toBe(FakeSocket.OPEN);
  });

  it("prende il focus all'apertura e mostra il cursore", () => {
    const { container } = renderConsole();
    const terminal = screen.getByLabelText("Terminale SSH");

    expect(document.activeElement).toBe(terminal);
    expect(container.querySelector(".console-caret")).not.toBeNull();
  });

  it("invia i tasti al socket", () => {
    renderConsole();
    const socket = FakeSocket.instances[0];
    const terminal = screen.getByLabelText("Terminale SSH");

    fireEvent.keyDown(terminal, { key: "l" });
    fireEvent.keyDown(terminal, { key: "s" });
    fireEvent.keyDown(terminal, { key: "Delete" });
    fireEvent.keyDown(terminal, { key: "ArrowLeft" });
    fireEvent.keyDown(terminal, { key: "Enter" });

    expect(socket.sent).toEqual([
      new TextEncoder().encode("l"),
      new TextEncoder().encode("s"),
      new TextEncoder().encode("\u001b[3~"),
      new TextEncoder().encode("\u001b[D"),
      new TextEncoder().encode("\r"),
    ]);
  });

  it("renderizza l'output con i colori e senza sequenze di controllo", () => {
    const { container } = renderConsole();
    const socket = FakeSocket.instances[0];

    act(() => {
      socket.emit("\u001b]0;title\u0007\u001b[32muser@host\u001b[0m:~$ ");
    });

    expect(terminalText(container)).toBe("user@host:~$ ");
    const colored = Array.from(container.querySelectorAll("span")).find(
      (element) => element.textContent === "user@host",
    );
    expect(colored?.style.color).toBe("rgb(13, 188, 121)");
  });

  it("riaggancia la sessione con il token di resume", () => {
    renderConsole(false, { resumeId: "tok-123" });
    expect(FakeSocket.instances[0].url).toContain("resume=tok-123");
  });

  it("salva l'id di sessione ricevuto dal server", () => {
    const onSessionId = vi.fn();
    renderConsole(false, { onSessionId });
    const socket = FakeSocket.instances[0];

    act(() => {
      socket.emitText(JSON.stringify({ type: "session", id: "sess-1" }));
    });

    expect(onSessionId).toHaveBeenCalledWith("sess-1");
  });

  it("termina la sessione quando il provider chiede la chiusura", () => {
    const onClose = vi.fn();
    render(
      <ConsoleModal
        serverId={44}
        serverName="srv-alpha"
        minimized={false}
        closing
        onMinimize={vi.fn()}
        onClose={onClose}
      />,
    );

    expect(FakeSocket.instances[0].sent).toContain(
      JSON.stringify({ type: "terminate" }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("termina la sessione quando si chiude la console", () => {
    const onClose = vi.fn();
    render(
      <ConsoleModal
        serverId={44}
        serverName="srv-alpha"
        minimized={false}
        onMinimize={vi.fn()}
        onClose={onClose}
      />,
    );
    const socket = FakeSocket.instances[0];

    fireEvent.click(screen.getByText("Chiudi"));

    expect(socket.sent).toContain(JSON.stringify({ type: "terminate" }));
    expect(onClose).toHaveBeenCalled();
  });
});

function terminalText(container: HTMLElement): string {
  const terminal = container.querySelector('[aria-label="Terminale SSH"]');
  return (terminal?.textContent ?? "").replace(/\u00a0/g, " ");
}
