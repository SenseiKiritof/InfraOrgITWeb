import { afterEach, describe, expect, it } from "vitest";
import { desktopListFiles, requestDesktopFile } from "./desktopFiles";

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
  return { bridge, sent };
}

afterEach(() => {
  Reflect.deleteProperty(window, "infraorgitDesktop");
});

describe("desktop files bridge", () => {
  it("returns the server transport without a direct-capable bridge", async () => {
    await expect(
      requestDesktopFile({ type: "files.list", serverId: 7, path: null }),
    ).resolves.toEqual({ transport: "server" });
  });

  it("lists files through the direct message protocol", async () => {
    const { bridge, sent } = bridgeWith((message, reply) => {
      if (message.type !== "files.list") return;
      reply({
        type: "files.result",
        requestId: message.requestId,
        ok: true,
        data: {
          path: "/home/deploy",
          items: [
            {
              name: "app.log",
              path: "/home/deploy/app.log",
              isDirectory: false,
              size: 12,
              modifiedUtc: null,
            },
          ],
        },
      });
    });
    Reflect.set(window, "infraorgitDesktop", bridge);

    const result = await desktopListFiles(7, null);
    expect(result?.items[0].name).toBe("app.log");
    expect(sent[0]).toMatchObject({
      type: "files.list",
      serverId: 7,
      path: null,
    });
  });

  it("forwards byte progress for the matching request", async () => {
    const { bridge, sent } = bridgeWith((message, reply) => {
      if (message.type !== "files.upload") return;
      reply({
        type: "files.progress",
        requestId: message.requestId,
        operation: "Upload",
        transferredBytes: 5,
        totalBytes: 10,
        percent: 50,
      });
      reply({
        type: "files.result",
        requestId: message.requestId,
        ok: true,
        data: { path: "/home/deploy/app.log" },
      });
    });
    Reflect.set(window, "infraorgitDesktop", bridge);
    const progress: number[] = [];

    const result = await requestDesktopFile<{ path: string }>(
      { type: "files.upload", serverId: 7, path: "/home/deploy" },
      { onProgress: (value) => progress.push(value.percent) },
    );

    expect(result).toEqual({
      transport: "client",
      data: { path: "/home/deploy/app.log" },
    });
    expect(progress).toEqual([50]);
    expect(sent[0]).toMatchObject({ type: "files.upload", serverId: 7 });
  });
});
