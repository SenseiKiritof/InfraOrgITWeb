import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSocket, stubWebSocket } from "../../test/fakeSocket";

const terminalMock = vi.hoisted(() => ({
  data: null as ((value: string) => void) | null,
  resize: null as ((size: { cols: number; rows: number }) => void) | null,
  written: [] as Uint8Array[],
  focus: vi.fn(),
  scrollToBottom: vi.fn(),
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 100;
    rows = 30;
    open = vi.fn();
    loadAddon = vi.fn();
    focus = terminalMock.focus;
    dispose = vi.fn();
    scrollToBottom = terminalMock.scrollToBottom;
    write = (value: Uint8Array) => {
      terminalMock.written.push(value);
    };
    onData = (callback: (value: string) => void) => {
      terminalMock.data = callback;
      return { dispose: vi.fn() };
    };
    onResize = (callback: (size: { cols: number; rows: number }) => void) => {
      terminalMock.resize = callback;
      return { dispose: vi.fn() };
    };
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit = vi.fn();
  },
}));

import { ConsoleModal } from "./ConsoleModal";

const renderConsole = (
  visible = true,
  extra: {
    resumeId?: string;
    onSessionId?: (id: string) => void;
  } = {},
) =>
  render(
    <ConsoleModal
      serverId={44}
      serverName="srv-alpha"
      visible={visible}
      active
      resumeId={extra.resumeId}
      onSessionId={extra.onSessionId}
      onMinimize={vi.fn()}
      onClose={vi.fn()}
    />,
  );

describe("ConsoleModal", () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubWebSocket();
    terminalMock.data = null;
    terminalMock.resize = null;
    terminalMock.written = [];
    terminalMock.focus.mockClear();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
  });

  it("resta connesso quando viene ridotta", () => {
    renderConsole(false);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.instances[0].readyState).toBe(FakeSocket.OPEN);
  });

  it("invia i tasti al socket tramite il terminale", () => {
    renderConsole();
    const socket = FakeSocket.instances[0];

    terminalMock.data?.("l");
    terminalMock.data?.("s");
    terminalMock.data?.("\u001b");

    expect(socket.sent).toEqual([
      new TextEncoder().encode("l"),
      new TextEncoder().encode("s"),
      new TextEncoder().encode("\u001b"),
    ]);
  });

  it("scrive l'output del socket nel terminale", () => {
    renderConsole();
    FakeSocket.instances[0].emit("user@host:~$ ");

    expect(terminalMock.written).toHaveLength(1);
    expect(new TextDecoder().decode(terminalMock.written[0])).toBe(
      "user@host:~$ ",
    );
  });

  it("invia il resize all'apertura della socket", () => {
    renderConsole();
    const socket = FakeSocket.instances[0];
    socket.onopen?.();

    expect(socket.sent).toContain(
      JSON.stringify({ type: "resize", cols: 100, rows: 30 }),
    );
  });

  it("permette di riconnettersi dopo la chiusura", () => {
    renderConsole(true, { resumeId: "tok-123" });
    const first = FakeSocket.instances[0];

    act(() => {
      first.onclose?.();
    });

    fireEvent.click(screen.getByRole("button", { name: "Riconnetti" }));

    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.instances[1].url).toContain("resume=tok-123");
  });

  it("riaggancia la sessione con il token di resume", () => {
    renderConsole(false, { resumeId: "tok-123" });
    expect(FakeSocket.instances[0].url).toContain("resume=tok-123");
  });

  it("inoltra il session id ricevuto", () => {
    const onSessionId = vi.fn();
    renderConsole(true, { onSessionId });
    FakeSocket.instances[0].emitText(
      JSON.stringify({ type: "session", id: "session-1" }),
    );

    expect(onSessionId).toHaveBeenCalledWith("session-1");
  });

  it("dà il focus al terminale attivo", () => {
    renderConsole();
    expect(screen.getByLabelText("Terminale SSH")).toBeTruthy();
    expect(terminalMock.focus).toHaveBeenCalled();
  });
});
