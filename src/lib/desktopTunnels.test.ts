import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseDesktopTunnelEvent,
  parseLocalPort,
  restoreDesktopTunnels,
  startDesktopDeploymentTunnel,
} from "./desktopTunnels";

const instance = "https://infra.example.com";
const origin = window.location.origin;

function installBridge() {
  const sendMessage = vi.fn();
  Object.defineProperty(window, "external", {
    configurable: true,
    value: { sendMessage, receiveMessage: vi.fn() },
  });
  return sendMessage;
}

afterEach(() => {
  Reflect.deleteProperty(window, "external");
});

describe("parseLocalPort", () => {
  it("accetta vuoto, limiti e rifiuta valori fuori range", () => {
    expect(parseLocalPort("")).toEqual({ ok: true, value: null });
    expect(parseLocalPort(" 1024 ")).toEqual({ ok: true, value: 1024 });
    expect(parseLocalPort("65535")).toEqual({ ok: true, value: 65535 });
    expect(parseLocalPort("1023").ok).toBe(false);
    expect(parseLocalPort("65536").ok).toBe(false);
    expect(parseLocalPort("abc").ok).toBe(false);
    expect(parseLocalPort("80.5").ok).toBe(false);
  });
});

describe("parseDesktopTunnelEvent", () => {
  it("accetta l'autenticazione della propria istanza", () => {
    const event = parseDesktopTunnelEvent(
      {
        type: "tunnels.auth",
        status: "pending",
        url: instance,
        userCode: "ABCD-EFGH",
        verificationUri: "https://auth.example.com/device",
        verificationUriComplete:
          "https://auth.example.com/device?user_code=ABCD-EFGH",
      },
      instance,
    );

    expect(event).toEqual({
      kind: "auth",
      auth: expect.objectContaining({
        status: "pending",
        userCode: "ABCD-EFGH",
        saved: false,
        requiresLogin: false,
      }),
    });
  });

  it("scarta autenticazione e target di un'altra istanza", () => {
    expect(
      parseDesktopTunnelEvent(
        {
          type: "tunnels.auth",
          status: "none",
          url: "https://other.example.com",
        },
        instance,
      ),
    ).toBeNull();
    expect(
      parseDesktopTunnelEvent(
        {
          type: "tunnels.targets",
          url: "https://other.example.com",
          items: [],
        },
        instance,
      ),
    ).toBeNull();
  });

  it("normalizza target, servizi e stato attivo", () => {
    const targets = parseDesktopTunnelEvent(
      {
        type: "tunnels.targets",
        url: instance,
        items: [
          {
            serverId: 1,
            serverName: "srv",
            environmentLabel: "Prod",
            sshHost: "10.0.0.1",
            sshPort: 22,
            username: "deploy",
            jump: null,
            targets: [
              {
                serverApplicationId: 2,
                applicationId: 3,
                application: "api",
                version: "1.0",
                targetHost: "127.0.0.1",
                targetPort: 8080,
                suggestedLocalPort: 8080,
              },
            ],
            services: [
              {
                id: 7,
                serverId: 1,
                name: "SOCKS",
                mode: "Dynamic",
                targetHost: null,
                targetPort: null,
                localPort: 1080,
                remotePort: null,
                kind: "Tcp",
                openPath: null,
                autoStart: true,
                enabled: true,
              },
            ],
          },
        ],
      },
      instance,
    );

    expect(targets).toMatchObject({
      kind: "targets",
      items: [
        {
          serverId: 1,
          targets: [{ serverApplicationId: 2, suggestedLocalPort: 8080 }],
          services: [{ id: 7, mode: "Dynamic", autoStart: true }],
        },
      ],
    });

    const state = parseDesktopTunnelEvent(
      {
        type: "tunnels.state",
        items: [
          {
            id: "t1",
            url: instance,
            application: "api",
            serverName: "srv",
            mode: "Local",
            localPort: 8080,
            targetHost: "127.0.0.1",
            targetPort: 8080,
            openUrl: "http://127.0.0.1:8080/",
          },
          {
            id: "t2",
            url: "https://other.example.com",
            application: "other",
            serverName: "other",
            mode: "Local",
          },
        ],
      },
      instance,
    );

    expect(state).toMatchObject({
      kind: "state",
      items: [{ id: "t1", openUrl: "http://127.0.0.1:8080/" }],
    });
  });

  it("ignora gli errori di un'altra istanza", () => {
    expect(
      parseDesktopTunnelEvent(
        {
          type: "tunnels.error",
          url: "https://other.example.com",
          message: "x",
        },
        instance,
      ),
    ).toBeNull();
    expect(
      parseDesktopTunnelEvent(
        { type: "tunnels.error", message: "x" },
        instance,
      ),
    ).toMatchObject({ kind: "status", tone: "error" });
  });
});

describe("desktop tunnel messages", () => {
  it("restore usa l'origin della SPA e autoStart", () => {
    const sendMessage = installBridge();

    expect(restoreDesktopTunnels()).toBe(true);
    expect(JSON.parse(String(sendMessage.mock.calls[0][0]))).toMatchObject({
      type: "tunnels.restore",
      url: origin,
      name: document.title || window.location.host,
      autoStart: true,
    });
  });

  it("start deployment porta serverId, targetId e porta locale", () => {
    const sendMessage = installBridge();

    startDesktopDeploymentTunnel(1, 2, 8080);
    expect(JSON.parse(String(sendMessage.mock.calls[0][0]))).toEqual({
      type: "tunnels.start",
      url: origin,
      serverId: 1,
      targetId: 2,
      localPort: 8080,
    });
  });
});
