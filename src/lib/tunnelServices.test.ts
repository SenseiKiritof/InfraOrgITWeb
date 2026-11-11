import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  TunnelService,
  TunnelServiceForm,
  TunnelServiceInput,
} from "./tunnelServices";
import {
  createTunnelService,
  deleteTunnelService,
  discoverTunnelPorts,
  emptyTunnelServiceForm,
  listTunnelServices,
  tunnelServiceFormFromValues,
  tunnelServicePayload,
  updateTunnelService,
  validateTunnelServiceForm,
} from "./tunnelServices";

const service: TunnelService = {
  id: 7,
  serverId: 3,
  name: "PostgreSQL",
  mode: "Local",
  targetHost: "127.0.0.1",
  targetPort: 5432,
  localPort: 15432,
  remotePort: null,
  kind: "Tcp",
  openPath: null,
  autoStart: true,
  enabled: true,
};

const input: TunnelServiceInput = {
  name: "PostgreSQL",
  mode: "Local",
  targetHost: "127.0.0.1",
  targetPort: 5432,
  localPort: 15432,
  remotePort: null,
  kind: "Tcp",
  openPath: null,
  autoStart: true,
  enabled: true,
};

function form(overrides: Partial<TunnelServiceForm> = {}): TunnelServiceForm {
  return { ...emptyTunnelServiceForm, name: "PostgreSQL", ...overrides };
}

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("tunnel services API client", () => {
  it("elenca i servizi del server", async () => {
    const fetchMock = stubFetch([service]);

    await expect(listTunnelServices(3)).resolves.toEqual([service]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/servers/3/tunnel-services");
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe("include");
  });

  it("crea un servizio con il token CSRF", async () => {
    const fetchMock = stubFetch(service);

    await expect(createTunnelService(3, input, "csrf")).resolves.toEqual(
      service,
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/servers/3/tunnel-services");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(input);
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("csrf");
  });

  it("aggiorna un servizio esistente", async () => {
    const fetchMock = stubFetch(service);

    await expect(updateTunnelService(3, 7, input, "csrf")).resolves.toEqual(
      service,
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/servers/3/tunnel-services/7");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual(input);
  });

  it("elimina un servizio", async () => {
    const fetchMock = stubFetch(null, 204);

    await expect(deleteTunnelService(3, 7, "csrf")).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/servers/3/tunnel-services/7");
    expect(init?.method).toBe("DELETE");
  });

  it("normalizza le porte scoperte", async () => {
    const fetchMock = stubFetch({ ports: [80, 22, 80] });

    await expect(discoverTunnelPorts(3, "csrf")).resolves.toEqual([22, 80]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/servers/3/tunnel-services/discover");
    expect(init?.method).toBe("POST");
  });

  it("accetta anche una lista di porte senza involucro", async () => {
    stubFetch([443, 22]);

    await expect(discoverTunnelPorts(3, "csrf")).resolves.toEqual([22, 443]);
  });
});

describe("validateTunnelServiceForm", () => {
  it("accetta un tunnel locale completo", () => {
    expect(
      validateTunnelServiceForm(
        form({
          mode: "Local",
          targetHost: "10.0.0.5",
          targetPort: "5432",
          localPort: "15432",
        }),
      ),
    ).toEqual([]);
  });

  it("richiede il nome", () => {
    expect(validateTunnelServiceForm(form({ name: " " }))).toContain(
      "nameRequired",
    );
  });

  it("per Local richiede host e porta di destinazione", () => {
    expect(
      validateTunnelServiceForm(
        form({ mode: "Local", targetHost: "", targetPort: "" }),
      ),
    ).toEqual(["targetHostRequired", "targetPortRequired"]);
  });

  it("valida la porta locale opzionale tra 1024 e 65535", () => {
    expect(
      validateTunnelServiceForm(
        form({
          mode: "Local",
          targetHost: "10.0.0.5",
          targetPort: "5432",
          localPort: "1023",
        }),
      ),
    ).toEqual(["localPortRange"]);
    expect(
      validateTunnelServiceForm(
        form({
          mode: "Local",
          targetHost: "10.0.0.5",
          targetPort: "5432",
          localPort: "65536",
        }),
      ),
    ).toEqual(["localPortRange"]);
    expect(
      validateTunnelServiceForm(
        form({
          mode: "Local",
          targetHost: "10.0.0.5",
          targetPort: "5432",
          localPort: "",
        }),
      ),
    ).toEqual([]);
  });

  it("per Dynamic non richiede destinazione ma valida la porta locale", () => {
    expect(
      validateTunnelServiceForm(
        form({
          mode: "Dynamic",
          targetHost: "",
          targetPort: "",
          localPort: "1080",
        }),
      ),
    ).toEqual([]);
    expect(
      validateTunnelServiceForm(form({ mode: "Dynamic", localPort: "80" })),
    ).toEqual(["localPortRange"]);
  });

  it("per Remote richiede anche la porta remota", () => {
    expect(
      validateTunnelServiceForm(
        form({ mode: "Remote", targetHost: "10.0.0.5", targetPort: "80" }),
      ),
    ).toEqual(["remotePortRequired"]);
    expect(
      validateTunnelServiceForm(
        form({
          mode: "Remote",
          targetHost: "10.0.0.5",
          targetPort: "80",
          remotePort: "8080",
        }),
      ),
    ).toEqual([]);
  });

  it("consente HTTP e HTTPS solo per Local e richiede il path con /", () => {
    expect(
      validateTunnelServiceForm(
        form({
          mode: "Dynamic",
          kind: "Http",
        }),
      ),
    ).toEqual(["kindLocalOnly"]);
    expect(
      validateTunnelServiceForm(
        form({
          mode: "Local",
          targetHost: "10.0.0.5",
          targetPort: "8080",
          kind: "Http",
          openPath: "health",
        }),
      ),
    ).toEqual(["openPathFormat"]);
    expect(
      validateTunnelServiceForm(
        form({
          mode: "Local",
          targetHost: "10.0.0.5",
          targetPort: "8080",
          kind: "Https",
          openPath: "/health",
        }),
      ),
    ).toEqual([]);
  });

  it("segnala le porte non numeriche come fuori intervallo", () => {
    expect(
      validateTunnelServiceForm(
        form({ mode: "Local", targetHost: "10.0.0.5", targetPort: "abc" }),
      ),
    ).toEqual(["targetPortRange"]);
  });
});

describe("tunnelServicePayload", () => {
  it("azzera i campi non usati da Dynamic", () => {
    const payload = tunnelServicePayload(
      form({
        mode: "Dynamic",
        targetHost: "10.0.0.5",
        targetPort: "80",
        localPort: "1080",
        remotePort: "8080",
        kind: "Http",
        openPath: "/health",
      }),
    );

    expect(payload).toEqual({
      name: "PostgreSQL",
      mode: "Dynamic",
      targetHost: null,
      targetPort: null,
      localPort: 1080,
      remotePort: null,
      kind: "Tcp",
      openPath: null,
      autoStart: false,
      enabled: true,
    });
  });

  it("per Remote conserva la porta remota e azzera quella locale", () => {
    const payload = tunnelServicePayload(
      form({
        mode: "Remote",
        targetHost: "10.0.0.5",
        targetPort: "80",
        localPort: "15432",
        remotePort: "8080",
      }),
    );

    expect(payload.localPort).toBeNull();
    expect(payload.remotePort).toBe(8080);
    expect(payload.targetHost).toBe("10.0.0.5");
  });

  it("per Local HTTP conserva percorso e tipo", () => {
    const payload = tunnelServicePayload(
      form({
        mode: "Local",
        targetHost: "10.0.0.5",
        targetPort: "8080",
        kind: "Https",
        openPath: "/health",
      }),
    );

    expect(payload.kind).toBe("Https");
    expect(payload.openPath).toBe("/health");
  });
});

describe("tunnelServiceFormFromValues", () => {
  it("converte le checkbox di EntitySection", () => {
    const result = tunnelServiceFormFromValues({
      name: "Redis",
      mode: "Remote",
      targetHost: "10.0.0.5",
      targetPort: "6379",
      remotePort: "16379",
      kind: "Tcp",
      autoStart: "true",
      enabled: "false",
    });

    expect(result.mode).toBe("Remote");
    expect(result.autoStart).toBe(true);
    expect(result.enabled).toBe(false);
    expect(result.localPort).toBe("");
  });
});
