import { apiFetch } from "./api";

/** Modalità scelta nel desktop; il web chiede solo quella corrente. */
export type DesktopDownloadMode = "auto" | "bridge" | "native";

/** Percorso effettivo del download dopo le capability del server. */
export type DesktopDownloadRoute = "bridge" | "native" | "normal";

export interface DesktopCapabilities {
  downloadMode: DesktopDownloadMode;
  nativeDownload: boolean;
}

export interface DesktopDownloadTicket {
  url: string;
  expiresAt: string;
}

export interface DesktopBridge {
  sendMessage(message: string): void;
  receiveMessage(handler: (message: string) => void): void;
}

export type DesktopBlobResult = "sent" | "too-large" | "unavailable";

/** Limite per il passaggio del blob al processo nativo (base64 incluso). */
export const DESKTOP_BLOB_MAX_BYTES = 8 * 1024 * 1024;

/** Il desktop deve rispondere subito: oltre questo tempo si usa il web. */
export const DESKTOP_CAPABILITIES_TIMEOUT_MS = 500;

type WindowWithDesktopBridge = Window & {
  external?: Partial<DesktopBridge>;
};

/** Photino espone `window.external` solo nel webview desktop. */
export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const external = (window as WindowWithDesktopBridge).external;
  if (
    typeof external?.sendMessage !== "function" ||
    typeof external.receiveMessage !== "function"
  )
    return null;
  return external as DesktopBridge;
}

export function isDesktopBridgeAvailable(): boolean {
  return getDesktopBridge() !== null;
}

/**
 * Chiede le capability al processo nativo e aspetta una risposta tipizzata.
 * Un timeout o un messaggio malformato valgono "nessuna capability".
 */
export function requestDesktopCapabilities(
  timeoutMs = DESKTOP_CAPABILITIES_TIMEOUT_MS,
  bridge = getDesktopBridge(),
): Promise<DesktopCapabilities | null> {
  if (!bridge) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: DesktopCapabilities | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);

    try {
      bridge.receiveMessage((raw) => {
        const capabilities = parseCapabilities(raw);
        if (capabilities) finish(capabilities);
      });
      bridge.sendMessage(JSON.stringify({ type: "desktop.capabilities" }));
    } catch {
      finish(null);
    }
  });
}

function parseCapabilities(raw: string): DesktopCapabilities | null {
  try {
    const message = JSON.parse(raw) as {
      type?: unknown;
      downloadMode?: unknown;
      nativeDownload?: unknown;
    };
    if (message.type !== "desktop.capabilities") return null;
    return {
      downloadMode:
        message.downloadMode === "bridge" || message.downloadMode === "native"
          ? message.downloadMode
          : "auto",
      nativeDownload: message.nativeDownload === true,
    };
  } catch {
    return null;
  }
}

/** `GET /api/desktop/downloads/capabilities`. */
export async function getSignedUrlCapability(): Promise<boolean> {
  const capability = await apiFetch<{ signedUrl?: boolean }>(
    "/api/desktop/downloads/capabilities",
  );
  return capability.signedUrl === true;
}

/**
 * Regole condivise col desktop:
 * - auto: native, poi bridge, poi web;
 * - bridge: bridge, poi native, poi web;
 * - native: native, poi bridge, poi web.
 */
export function resolveDownloadRoute(
  downloadMode: DesktopDownloadMode,
  nativeDownload: boolean,
  signedUrl: boolean,
): DesktopDownloadRoute {
  if (downloadMode === "bridge") {
    if (signedUrl) return "bridge";
    if (nativeDownload) return "native";
    return "normal";
  }
  if (nativeDownload) return "native";
  if (signedUrl) return "bridge";
  return "normal";
}

/** Senza bridge Photino non serve interrogare il server. */
export async function resolveDesktopDownloadRoute(
  timeoutMs = DESKTOP_CAPABILITIES_TIMEOUT_MS,
): Promise<DesktopDownloadRoute> {
  const bridge = getDesktopBridge();
  if (!bridge) return "normal";

  const [capabilities, signedUrl] = await Promise.all([
    requestDesktopCapabilities(timeoutMs, bridge),
    getSignedUrlCapability().catch(() => false),
  ]);
  if (!capabilities) return "normal";
  return resolveDownloadRoute(
    capabilities.downloadMode,
    capabilities.nativeDownload,
    signedUrl,
  );
}

/** `POST /api/desktop/downloads/tickets` (cookie + CSRF). */
export async function createDesktopDownloadTicket(
  serverId: number,
  path: string,
  csrfToken: string,
): Promise<DesktopDownloadTicket> {
  const ticket = await apiFetch<DesktopDownloadTicket>(
    "/api/desktop/downloads/tickets",
    {
      method: "POST",
      body: JSON.stringify({ serverId, path }),
    },
    csrfToken,
  );
  if (!ticket?.url) throw new Error("Invalid desktop download ticket");
  return { ...ticket, url: absoluteUrl(ticket.url) };
}

/** Il processo nativo riceve un URL assoluto e già firmato. */
function absoluteUrl(url: string): string {
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

/** `{type:"desktop.download"}`: il download lo esegue il processo nativo. */
export function sendDesktopDownload(url: string, filename: string): void {
  const bridge = getDesktopBridge();
  if (!bridge) throw new Error("Desktop bridge unavailable");
  bridge.sendMessage(
    JSON.stringify({ type: "desktop.download", url, filename }),
  );
}

/** `{type:"desktop.download.blob"}` per i risultati API piccoli. */
export function sendDesktopBlob(
  filename: string,
  base64: string,
  mime: string,
): DesktopBlobResult {
  const bridge = getDesktopBridge();
  if (!bridge) return "unavailable";
  if (!isBlobWithinLimit(base64)) return "too-large";
  bridge.sendMessage(
    JSON.stringify({
      type: "desktop.download.blob",
      filename,
      base64,
      mime,
    }),
  );
  return "sent";
}

export function isBlobWithinLimit(base64: string): boolean {
  return base64ByteLength(base64) <= DESKTOP_BLOB_MAX_BYTES;
}

/** Byte decodificati senza materializzare il buffer. */
export function base64ByteLength(base64: string): number {
  const value = base64.replace(/\s/g, "");
  if (value.length === 0) return 0;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding);
}

export function utf8ToBase64(value: string): string {
  return bytesToBase64(new TextEncoder().encode(value));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

/**
 * Ticket + messaggio bridge in un solo passaggio. Qualsiasi errore restituisce
 * false: il chiamante riprende il download web senza duplicare l'azione.
 */
export async function sendServerFileToDesktop(options: {
  serverId: number;
  path: string;
  filename: string;
  csrfToken: string;
}): Promise<boolean> {
  try {
    const ticket = await createDesktopDownloadTicket(
      options.serverId,
      options.path,
      options.csrfToken,
    );
    sendDesktopDownload(ticket.url, options.filename);
    return true;
  } catch {
    return false;
  }
}

export const desktopDownloads = {
  available: isDesktopBridgeAvailable,
  resolveRoute: resolveDesktopDownloadRoute,
  createTicket: createDesktopDownloadTicket,
  send: sendDesktopDownload,
  sendBlob: sendDesktopBlob,
  sendServerFile: sendServerFileToDesktop,
  blobMaxBytes: DESKTOP_BLOB_MAX_BYTES,
};
