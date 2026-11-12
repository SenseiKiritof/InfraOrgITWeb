import { afterEach, describe, expect, it, vi } from "vitest";
import { sendDesktopMessage, subscribeDesktopMessages } from "./desktopBridge";

interface BridgeMock {
  sendMessage: ReturnType<typeof vi.fn>;
  receiveMessage: ReturnType<typeof vi.fn>;
  dispatch: (message: unknown) => void;
}

function installBridge(): BridgeMock {
  let handler: ((raw: string) => void) | undefined;
  const sendMessage = vi.fn();
  const receiveMessage = vi.fn((callback: (raw: string) => void) => {
    handler = callback;
  });
  Object.defineProperty(window, "external", {
    configurable: true,
    value: { sendMessage, receiveMessage },
  });
  return {
    sendMessage,
    receiveMessage,
    dispatch: (message) => handler?.(JSON.stringify(message)),
  };
}

afterEach(() => {
  Reflect.deleteProperty(window, "external");
});

describe("desktop bridge fan-out", () => {
  it("installa receiveMessage una volta e distribuisce a tutti gli abbonati", () => {
    const bridge = installBridge();
    const first = vi.fn();
    const second = vi.fn();

    const unsubscribeFirst = subscribeDesktopMessages(first);
    const unsubscribeSecond = subscribeDesktopMessages(second);

    expect(bridge.receiveMessage).toHaveBeenCalledTimes(1);
    bridge.dispatch({ type: "tunnels.log", message: "pronto" });
    expect(first).toHaveBeenCalledWith(
      expect.objectContaining({ type: "tunnels.log", message: "pronto" }),
    );
    expect(second).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    bridge.dispatch({ type: "tunnels.state", items: [] });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);

    unsubscribeSecond();
    bridge.dispatch({ type: "tunnels.warning", message: "x" });
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("ignora messaggi malformati e un listener difettoso", () => {
    const bridge = installBridge();
    const broken = vi.fn(() => {
      throw new Error("boom");
    });
    const healthy = vi.fn();

    subscribeDesktopMessages(broken);
    subscribeDesktopMessages(healthy);

    bridge.receiveMessage.mock.calls[0][0]("not json");
    bridge.dispatch({ type: "tunnels.log", message: "ok" });
    expect(broken).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it("invia messaggi solo con il bridge presente", () => {
    expect(sendDesktopMessage({ type: "desktop.capabilities" })).toBe(false);

    const bridge = installBridge();
    expect(sendDesktopMessage({ type: "tunnels.restore", url: "x" })).toBe(
      true,
    );
    expect(bridge.sendMessage).toHaveBeenCalledWith(
      JSON.stringify({ type: "tunnels.restore", url: "x" }),
    );
  });
});
