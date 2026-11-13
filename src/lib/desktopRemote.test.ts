import { afterEach, describe, expect, it, vi } from "vitest";
import {
  openDesktopConsole,
  resolveDesktopRemote,
  runDesktopAction,
} from "./desktopRemote";

type FakeBridge = {
  remote: boolean;
  sendMessage: (message: string) => void;
  receiveMessage: (handler: (message: string) => void) => void;
};

function bridgeWith(
  handle: (
    message: Record<string, unknown>,
    reply: (value: unknown) => void,
  ) => void,
) {
  let receive: (message: string) => void = () => {};
  const sent: Record<string, unknown>[] = [];
  const bridge: FakeBridge = {
    remote: true,
    sendMessage: (raw) => {
      const message = JSON.parse(raw) as Record<string, unknown>;
      sent.push(message);
      handle(message, (value) => receive(JSON.stringify(value)));
    },
    receiveMessage: (handler) => {
      receive = handler;
    },
  };
  return {
    bridge,
    sent,
    emit: (value: unknown) => receive(JSON.stringify(value)),
  };
}

afterEach(() => {
  Reflect.deleteProperty(window, "infraorgitDesktop");
  vi.unstubAllGlobals();
});

describe("desktop console bridge", () => {
  it("falls back to the server transport", async () => {
    const { bridge, sent } = bridgeWith((message, reply) => {
      reply({
        type: "console.resolved",
        requestId: message.requestId,
        transport: "server",
      });
    });
    Reflect.set(window, "infraorgitDesktop", bridge);

    const result = await openDesktopConsole(
      1,
      100,
      30,
      () => {},
      () => {},
    );
    expect(result.transport).toBe("server");
    expect(sent[0]).toMatchObject({
      type: "console.open",
      serverId: 1,
      cols: 100,
      rows: 30,
    });
  });

  it("resolves the transport and runs a prepared action", async () => {
    const { bridge, sent } = bridgeWith((message, reply) => {
      if (message.type === "remote.resolve")
        reply({
          type: "remote.resolved",
          requestId: message.requestId,
          transport: "client",
        });
      if (message.type === "action.run")
        reply({
          type: "action.result",
          requestId: message.requestId,
          ok: true,
          data: { exitCode: 0, output: "ok", timedOut: false },
        });
    });
    Reflect.set(window, "infraorgitDesktop", bridge);

    await expect(resolveDesktopRemote(7)).resolves.toBe("client");
    const result = await runDesktopAction({
      executionId: 11,
      serverId: 7,
      label: "Health",
      script: "echo ok",
      redactValues: { Secret: "s3cr3t" },
      timeoutSeconds: 60,
    });
    expect(result).toEqual({ exitCode: 0, output: "ok", timedOut: false });
    expect(sent).toContainEqual(
      expect.objectContaining({
        type: "action.run",
        executionId: 11,
        serverId: 7,
        script: "echo ok",
      }),
    );
  });

  it("opens a direct console and forwards data, resize and close", async () => {
    const data = vi.fn();
    const closed = vi.fn();
    const { bridge, sent, emit } = bridgeWith((message, reply) => {
      if (message.type === "console.open")
        reply({
          type: "console.opened",
          requestId: message.requestId,
          id: "session-1",
        });
      if (message.type === "console.close")
        reply({ type: "console.closed", id: "session-1", error: null });
    });
    Reflect.set(window, "infraorgitDesktop", bridge);

    const result = await openDesktopConsole(1, 100, 30, data, closed);
    expect(result.transport).toBe("client");
    if (result.transport !== "client") return;

    emit({ type: "console.data", id: "session-1", data: "hello" });
    expect(data).toHaveBeenCalledWith("hello");

    result.handle.resize(120, 40);
    result.handle.send("ls\n");
    result.handle.close();

    expect(sent).toContainEqual({
      type: "console.resize",
      id: "session-1",
      cols: 120,
      rows: 40,
    });
    expect(sent).toContainEqual({
      type: "console.write",
      id: "session-1",
      data: "ls\n",
    });
    expect(sent).toContainEqual({ type: "console.close", id: "session-1" });
    expect(closed).toHaveBeenCalledWith(null);
  });
});
