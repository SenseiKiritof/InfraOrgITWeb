/** Bridge exposed by the Photino desktop through `window.external`. */
export interface DesktopBridge {
  sendMessage(message: string): void;
  receiveMessage(handler: (message: string) => void): void;
}

/** A decoded desktop message. The type is required to reach subscribers. */
export type DesktopMessage = Record<string, unknown> & { type: string };

type WindowWithDesktopBridge = Window & {
  external?: Partial<DesktopBridge>;
  infraorgitDesktop?: Partial<DesktopBridge>;
};

const listeners = new Set<(message: DesktopMessage) => void>();
let installedBridge: DesktopBridge | null = null;

/** Photino espone `window.external`, Electron un bridge esplicito. */
export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const scope = window as WindowWithDesktopBridge;
  const candidate = scope.infraorgitDesktop ?? scope.external;
  if (
    typeof candidate?.sendMessage !== "function" ||
    typeof candidate?.receiveMessage !== "function"
  )
    return null;
  return candidate as DesktopBridge;
}

export function isDesktopBridgeAvailable(): boolean {
  return getDesktopBridge() !== null;
}

function isMessage(value: unknown): value is DesktopMessage {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as { type?: unknown }).type === "string";
}

function dispatch(raw: string) {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return;
  }
  if (!isMessage(value)) return;

  for (const listener of [...listeners]) {
    try {
      listener(value);
    } catch {
      // Un listener difettoso non deve fermare gli altri.
    }
  }
}

/**
 * Installa `receiveMessage` una sola volta e distribuisce i messaggi tipizzati
 * a tutti gli abbonati. Download e tunnel possono convivere nello stesso SPA.
 */
export function subscribeDesktopMessages(
  listener: (message: DesktopMessage) => void,
): () => void {
  const bridge = getDesktopBridge();
  if (!bridge) return () => {};

  if (installedBridge !== bridge) {
    try {
      bridge.receiveMessage(dispatch);
      installedBridge = bridge;
    } catch {
      return () => {};
    }
  }

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function sendDesktopMessage(message: DesktopMessage): boolean {
  const bridge = getDesktopBridge();
  if (!bridge) return false;
  try {
    bridge.sendMessage(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}
