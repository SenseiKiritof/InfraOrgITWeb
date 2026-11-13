import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopTunnelsPanel } from "./DesktopTunnelsPanel";

const origin = window.location.origin;

interface BridgeMock {
  sendMessage: ReturnType<typeof vi.fn>;
  emit: (message: Record<string, unknown>) => void;
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
    emit: (message) =>
      act(() => {
        handler?.(JSON.stringify(message));
      }),
  };
}

function sentMessages(bridge: BridgeMock): Record<string, unknown>[] {
  return bridge.sendMessage.mock.calls.map(([raw]) => JSON.parse(String(raw)));
}

function sentType(
  bridge: BridgeMock,
  type: string,
): Record<string, unknown> | undefined {
  return sentMessages(bridge).find((message) => message.type === type);
}

const targetsMessage = {
  type: "tunnels.targets",
  url: origin,
  items: [
    {
      serverId: 1,
      serverName: "srv-prod",
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
          name: "Proxy",
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
};

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "external");
});

describe("DesktopTunnelsPanel", () => {
  it("senza bridge desktop non mostra nulla", () => {
    const { container } = render(<DesktopTunnelsPanel />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("desktop-tunnels-panel")).toBeNull();
  });

  it("chiede il ripristino e gestisce il codice dispositivo", async () => {
    const bridge = installBridge();
    render(<DesktopTunnelsPanel />);

    expect(sentType(bridge, "tunnels.restore")).toMatchObject({
      url: origin,
      autoStart: true,
    });

    bridge.emit({
      type: "tunnels.auth",
      status: "pending",
      url: origin,
      userCode: "ABCD-EFGH",
      verificationUri: "https://auth.example.com/device",
      verificationUriComplete:
        "https://auth.example.com/device?user_code=ABCD-EFGH",
    });

    expect(await screen.findByText(/ABCD-EFGH/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Apri pagina di accesso" }),
    );
    expect(sentType(bridge, "desktop.openExternal")).toMatchObject({
      url: "https://auth.example.com/device?user_code=ABCD-EFGH",
    });

    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(sentType(bridge, "tunnels.login.cancel")).toMatchObject({
      url: origin,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Accedi con Keycloak" }),
    );
    expect(sentType(bridge, "tunnels.login")).toMatchObject({ url: origin });

    fireEvent.change(screen.getByLabelText("Token personale"), {
      target: { value: "itk_test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Carica target" }));
    expect(sentType(bridge, "tunnels.list")).toMatchObject({
      url: origin,
      token: "itk_test",
      autoStart: true,
    });
  });

  it("con la sessione web attiva nasconde il login e non offre un logout finto", async () => {
    const bridge = installBridge();
    render(<DesktopTunnelsPanel />);

    bridge.emit({
      type: "tunnels.auth",
      status: "restored",
      url: origin,
      saved: false,
    });
    bridge.emit(targetsMessage);

    expect(await screen.findByText("srv-prod")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Accedi con Keycloak" }),
    ).toBeNull();
    expect(screen.queryByLabelText("Token personale")).toBeNull();
    expect(
      screen.getByText("Sessione attiva · ripristinata."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Dimentica token" }),
    ).toBeNull();
  });

  it("con un token salvato offre solo Dimentica token", async () => {
    const bridge = installBridge();
    render(<DesktopTunnelsPanel />);

    bridge.emit({
      type: "tunnels.auth",
      status: "restored",
      url: origin,
      saved: true,
    });
    bridge.emit(targetsMessage);

    expect(await screen.findByText("srv-prod")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dimentica token" }));
    expect(sentType(bridge, "tunnels.logout")).toMatchObject({ url: origin });
  });

  it("mostra target, avvia, apre e chiude i tunnel", async () => {
    const bridge = installBridge();
    render(<DesktopTunnelsPanel />);

    bridge.emit(targetsMessage);

    expect(await screen.findByText("srv-prod")).toBeInTheDocument();
    expect(screen.getByText("auto")).toBeInTheDocument();
    expect(
      screen.getByText(/api 1\.0 · 127\.0\.0\.1:8080/),
    ).toBeInTheDocument();

    const portInput = screen.getByLabelText("Porta locale per api 1.0");
    expect(portInput).toHaveValue(8080);
    fireEvent.change(portInput, { target: { value: "9090" } });
    fireEvent.click(screen.getByTestId("desktop-tunnel-start-2"));

    expect(sentType(bridge, "tunnels.start")).toMatchObject({
      url: origin,
      serverId: 1,
      targetId: 2,
      localPort: 9090,
    });

    fireEvent.click(screen.getByTestId("desktop-tunnel-start-service-7"));
    const serviceStart = sentMessages(bridge)
      .filter((message) => message.type === "tunnels.start")
      .at(-1);
    expect(serviceStart).toMatchObject({
      url: origin,
      serverId: 1,
      serviceId: 7,
      localPort: 1080,
    });

    bridge.emit({
      type: "tunnels.state",
      items: [
        {
          id: "tunnel-1",
          url: origin,
          instanceName: "Prod",
          serverName: "srv-prod",
          application: "api",
          serviceId: null,
          mode: "Local",
          kind: "Tcp",
          targetHost: "127.0.0.1",
          targetPort: 8080,
          localPort: 9090,
          remotePort: null,
          openUrl: "http://127.0.0.1:9090/",
        },
      ],
    });

    expect(await screen.findByText(/api · srv-prod/)).toBeInTheDocument();
    expect(
      screen.getByText("127.0.0.1:9090 → 127.0.0.1:8080"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("desktop-tunnel-open-tunnel-1"));
    expect(sentType(bridge, "desktop.openExternal")).toMatchObject({
      url: "http://127.0.0.1:9090/",
    });

    fireEvent.click(screen.getByTestId("desktop-tunnel-stop-tunnel-1"));
    expect(sentType(bridge, "tunnels.stop")).toMatchObject({
      url: origin,
      id: "tunnel-1",
    });

    bridge.emit({
      type: "tunnels.auth",
      status: "success",
      url: origin,
      saved: true,
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Dimentica token" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Dimentica token" }));
    expect(sentType(bridge, "tunnels.logout")).toMatchObject({ url: origin });
  });

  it("mostra lo stato senza sessione e ignora un'altra istanza", async () => {
    const bridge = installBridge();
    render(<DesktopTunnelsPanel />);

    bridge.emit({
      type: "tunnels.auth",
      status: "none",
      url: "https://other.example.com",
    });
    expect(
      screen.queryByText(
        "Nessuna sessione salvata. Accedi con Keycloak o incolla un token personale.",
      ),
    ).toBeNull();

    bridge.emit({ type: "tunnels.auth", status: "none", url: origin });
    expect(
      await screen.findByText(
        "Nessuna sessione salvata. Accedi con Keycloak o incolla un token personale.",
      ),
    ).toBeInTheDocument();
  });
});
