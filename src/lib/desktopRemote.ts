import {
  getDesktopBridge,
  sendDesktopMessage,
  subscribeDesktopMessages,
} from "./desktopBridge";
import type { CommandResult } from "./remote";

export type DesktopActionIntent = {
  executionId: number;
  serverId: number;
  label: string;
  script: string;
  redactValues: Record<string, string>;
  timeoutSeconds: number;
};

export type DesktopTransport = "client" | "server";

export function isDesktopRemoteAvailable(): boolean {
  return Boolean(getDesktopBridge()?.remote);
}

export type DesktopConsoleHandle = {
  send(data: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
};

export type DesktopConsoleOpen =
  | { transport: "client"; handle: DesktopConsoleHandle }
  | { transport: "server" };

/**
 * Asks the desktop to resolve the console transport. In Client/Auto the main
 * process may open an SSH shell with the user's agent; otherwise it returns
 * "server" and the caller keeps the existing API WebSocket.
 */
export function openDesktopConsole(
  serverId: number,
  cols: number,
  rows: number,
  onData: (data: string) => void,
  onClose: (error: string | null) => void,
): Promise<DesktopConsoleOpen> {
  if (!getDesktopBridge()?.remote)
    return Promise.resolve({ transport: "server" });

  return new Promise((resolve, reject) => {
    const requestId =
      globalThis.crypto?.randomUUID?.() ??
      `console-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let sessionId: string | null = null;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe = () => {};

    const cleanup = () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const open = (value: DesktopConsoleOpen) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      timer = null;
      resolve(value);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const handle: DesktopConsoleHandle = {
      send: (data) => {
        if (sessionId)
          sendDesktopMessage({ type: "console.write", id: sessionId, data });
      },
      resize: (nextCols, nextRows) => {
        if (sessionId)
          sendDesktopMessage({
            type: "console.resize",
            id: sessionId,
            cols: nextCols,
            rows: nextRows,
          });
      },
      close: () => {
        if (sessionId)
          sendDesktopMessage({ type: "console.close", id: sessionId });
        // Keep the listener until the main process confirms the close; the
        // fallback avoids a leak if the desktop already vanished.
        setTimeout(cleanup, 2_000);
      },
    };

    unsubscribe = subscribeDesktopMessages((message) => {
      const sameRequest = message.requestId === requestId;
      if (sameRequest && message.type === "console.opened") {
        sessionId = String(message.id ?? "");
        open({ transport: "client", handle });
        return;
      }
      if (sameRequest && message.type === "console.resolved") {
        cleanup();
        open({ transport: "server" });
        return;
      }
      if (sameRequest && message.type === "console.error") {
        fail(
          new Error(
            typeof message.message === "string"
              ? message.message
              : "Console desktop non disponibile.",
          ),
        );
        return;
      }
      if (!sessionId || message.id !== sessionId) return;
      if (message.type === "console.data") {
        onData(String(message.data ?? ""));
        return;
      }
      if (message.type === "console.closed") {
        const error = typeof message.error === "string" ? message.error : null;
        sessionId = null;
        onClose(error);
        cleanup();
      }
    });

    timer = setTimeout(
      () => fail(new Error("Timeout nell'apertura della console desktop.")),
      20_000,
    );
    if (
      !sendDesktopMessage({
        type: "console.open",
        requestId,
        serverId,
        cols,
        rows,
      })
    )
      fail(new Error("Bridge desktop non disponibile."));
  });
}

/** Asks the desktop whether a server uses the direct or server transport. */
export function resolveDesktopRemote(
  serverId: number,
  scope: "actions" | null = null,
): Promise<DesktopTransport> {
  if (!getDesktopBridge()?.remote) return Promise.resolve("server");
  return new Promise((resolve, reject) => {
    const requestId =
      globalThis.crypto?.randomUUID?.() ??
      `remote-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeDesktopMessages((message) => {
      if (message.requestId !== requestId) return;
      if (message.type === "remote.resolved") {
        if (timer) clearTimeout(timer);
        unsubscribe();
        resolve(message.transport === "client" ? "client" : "server");
        return;
      }
      if (message.type === "remote.error") {
        if (timer) clearTimeout(timer);
        unsubscribe();
        reject(
          new Error(
            typeof message.message === "string"
              ? message.message
              : "Trasporto desktop non disponibile.",
          ),
        );
      }
    });
    timer = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timeout nella scelta del trasporto desktop."));
    }, 10_000);
    if (
      !sendDesktopMessage({
        type: "remote.resolve",
        requestId,
        serverId,
        scope,
      })
    ) {
      if (timer) clearTimeout(timer);
      unsubscribe();
      reject(new Error("Bridge desktop non disponibile."));
    }
  });
}

/** Executes a prepared action with the desktop SSH agent. */
export function runDesktopAction(
  intent: DesktopActionIntent,
): Promise<CommandResult> {
  if (!getDesktopBridge()?.remote)
    return Promise.reject(new Error("Bridge desktop non disponibile."));
  return new Promise((resolve, reject) => {
    const requestId =
      globalThis.crypto?.randomUUID?.() ??
      `action-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeDesktopMessages((message) => {
      if (message.type !== "action.result" || message.requestId !== requestId)
        return;
      if (timer) clearTimeout(timer);
      unsubscribe();
      if (message.transport === "server") {
        reject(
          new Error("La modalità connessioni è cambiata: riprova l'azione."),
        );
        return;
      }
      if (message.ok) {
        resolve(message.data as CommandResult);
        return;
      }
      reject(
        new Error(
          typeof message.error === "string"
            ? message.error
            : "Azione desktop non riuscita.",
        ),
      );
    });
    timer = setTimeout(
      () => {
        unsubscribe();
        reject(new Error("Timeout nell'esecuzione dell'azione desktop."));
      },
      Math.max(30_000, (intent.timeoutSeconds + 30) * 1000),
    );
    if (
      !sendDesktopMessage({
        type: "action.run",
        requestId,
        executionId: intent.executionId,
        serverId: intent.serverId,
        script: intent.script,
        redactValues: intent.redactValues,
        timeoutSeconds: intent.timeoutSeconds,
      })
    ) {
      if (timer) clearTimeout(timer);
      unsubscribe();
      reject(new Error("Bridge desktop non disponibile."));
    }
  });
}
