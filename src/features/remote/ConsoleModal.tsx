import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";
import { isDesktopBridgeAvailable } from "../../lib/desktopBridge";
import type { DesktopConsoleHandle } from "../../lib/desktopRemote";
import { openDesktopConsole } from "../../lib/desktopRemote";
import { type TranslationKey, useI18n } from "../../lib/i18n";
import "@xterm/xterm/css/xterm.css";

type ConsoleStatus = "connecting" | "connected" | "error";

type ConsoleSocket = Pick<WebSocket, "readyState" | "send" | "close">;

const PANE_INDEXES = [0, 1, 2] as const;

const STATUS_KEYS: Record<ConsoleStatus, TranslationKey> = {
  connecting: "console.connecting",
  connected: "console.connected",
  error: "console.connectionError",
};

export function ConsoleModal({
  serverId,
  serverName,
  visible,
  active,
  closing,
  resumeId,
  pane,
  paneCount,
  onMovePane,
  onSessionId,
  onData,
  onActivate,
  onMinimize,
  onClose,
}: {
  serverId: number;
  serverName: string;
  visible: boolean;
  active: boolean;
  closing?: boolean;
  resumeId?: string;
  pane?: number;
  paneCount?: number;
  onMovePane?: (pane: number) => void;
  onSessionId?: (id: string) => void;
  onData?: () => void;
  onActivate?: () => void;
  onMinimize: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<ConsoleStatus>("connecting");
  const [sessionClosed, setSessionClosed] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);
  const container = useRef<HTMLDivElement | null>(null);
  const terminal = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const socket = useRef<ConsoleSocket | null>(null);
  const sessionCallback = useRef(onSessionId);
  sessionCallback.current = onSessionId;
  const dataCallback = useRef(onData);
  dataCallback.current = onData;
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;
  const closed = useRef(false);
  const visibleRef = useRef(visible);
  const initialResume = useRef(resumeId);
  const resumeRef = useRef(resumeId);
  resumeRef.current = resumeId;

  const send = useCallback((value: string) => {
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(new TextEncoder().encode(value));
  }, []);

  const sendResize = useCallback((cols: number, rows: number) => {
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(JSON.stringify({ type: "resize", cols, rows }));
  }, []);

  useEffect(() => {
    const element = container.current;
    if (!element) return;

    const term = new Terminal({
      convertEol: false,
      cursorBlink: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 12,
      scrollback: 5000,
      theme: {
        background: "#020617",
        foreground: "#e2e8f0",
        cursor: "#34d399",
        selectionBackground: "#334155",
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(element);
    terminal.current = term;
    fit.current = fitAddon;

    const dataSubscription = term.onData((data) => send(data));
    const resizeSubscription = term.onResize(({ cols, rows }) =>
      sendResize(cols, rows),
    );
    const observer = new ResizeObserver(() => {
      if (visibleRef.current) fitAddon.fit();
    });
    observer.observe(element);

    return () => {
      dataSubscription.dispose();
      resizeSubscription.dispose();
      observer.disconnect();
      term.dispose();
      terminal.current = null;
      fit.current = null;
    };
  }, [send, sendResize]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: il cambio pannello deve rifare il fit
  useEffect(() => {
    visibleRef.current = visible;
    if (!visible) return;
    const fitNow = () => {
      try {
        fit.current?.fit();
      } catch {
        // il pannello non è ancora dimensionato
      }
    };
    // Il cambio di pannello ridimensiona il terminale: riadatta subito e
    // dopo la transizione, senza aspettare il solo ResizeObserver.
    const frame = requestAnimationFrame(fitNow);
    const timer = window.setTimeout(fitNow, 180);
    if (active) terminal.current?.focus();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [visible, active, pane, paneCount]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reconnectKey forza una nuova connessione
  useEffect(() => {
    let disposed = false;
    let direct: DesktopConsoleHandle | null = null;
    setDisconnected(false);
    setSessionClosed(false);
    setStatus("connecting");

    const connectWebSocket = () => {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const query = new URLSearchParams({ cols: "100", rows: "30" });
      const resume = resumeRef.current ?? initialResume.current;
      if (resume) query.set("resume", resume);
      const ws = new WebSocket(
        `${protocol}://${window.location.host}/api/socket/servers/${serverId}/console?${query}`,
      );
      ws.binaryType = "arraybuffer";
      socket.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        setStatus("connected");
        setDisconnected(false);
        const term = terminal.current;
        if (term) sendResize(term.cols, term.rows);
      };
      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          handleControl(event.data, sessionCallback.current);
          return;
        }

        terminal.current?.write(new Uint8Array(event.data as ArrayBuffer));
        dataCallback.current?.();
      };
      ws.onerror = () => {
        if (disposed) return;
        setStatus("error");
        setDisconnected(true);
      };
      ws.onclose = () => {
        if (disposed) return;
        setSessionClosed(true);
        setDisconnected(true);
      };
    };

    const connect = async () => {
      try {
        const result = await openDesktopConsole(
          serverId,
          100,
          30,
          (data) => {
            terminal.current?.write(data);
            dataCallback.current?.();
          },
          (error) => {
            if (disposed) return;
            setSessionClosed(true);
            setDisconnected(true);
            if (error) setStatus("error");
          },
        );
        if (disposed) {
          if (result.transport === "client") result.handle.close();
          return;
        }
        if (result.transport === "client") {
          direct = result.handle;
          socket.current = {
            readyState: WebSocket.OPEN,
            send: (value) => {
              const text =
                typeof value === "string"
                  ? value
                  : new TextDecoder().decode(value as BufferSource);
              if (text.startsWith("{")) {
                try {
                  const message = JSON.parse(text) as {
                    type?: string;
                    cols?: number;
                    rows?: number;
                  };
                  if (message.type === "resize") {
                    direct?.resize(
                      Number(message.cols) || 100,
                      Number(message.rows) || 30,
                    );
                    return;
                  }
                  if (message.type === "terminate") {
                    direct?.close();
                    return;
                  }
                } catch {
                  // è input utente che inizia con "{"
                }
              }
              direct?.send(text);
            },
            close: () => direct?.close(),
          };
          setStatus("connected");
          setDisconnected(false);
          const term = terminal.current;
          if (term) sendResize(term.cols, term.rows);
          return;
        }
        connectWebSocket();
      } catch {
        if (disposed) return;
        setStatus("error");
        setDisconnected(true);
      }
    };

    const cleanup = () => {
      disposed = true;
      direct?.close();
      socket.current?.close();
      socket.current = null;
    };

    if (!isDesktopBridgeAvailable()) {
      connectWebSocket();
      return cleanup;
    }
    void connect();
    return cleanup;
  }, [serverId, sendResize, reconnectKey]);

  useEffect(() => {
    if (!closing || closed.current) return;
    closed.current = true;
    terminate(socket.current);
    closeCallback.current();
  }, [closing]);

  return (
    <div
      hidden={!visible}
      className="pointer-events-auto flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 p-3 shadow-xl"
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-sm text-slate-200">
        <p className="min-w-0 truncate">
          {t("console.title")} · {serverName}{" "}
          <span className="text-slate-400">
            (
            {sessionClosed
              ? t("console.sessionClosed", {
                  status: t(STATUS_KEYS[status]),
                })
              : t(STATUS_KEYS[status])}
            )
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-1.5 text-xs">
          {paneCount !== undefined &&
            paneCount > 1 &&
            pane !== undefined &&
            onMovePane && (
              <select
                aria-label={t("console.paneFor")}
                title={t("console.paneFor")}
                value={pane}
                onChange={(event) => onMovePane(Number(event.target.value))}
                className="rounded border border-slate-600 bg-slate-900 px-1 py-1 text-xs text-slate-100"
              >
                {PANE_INDEXES.slice(0, paneCount).map((index) => (
                  <option key={index} value={index}>
                    {t("console.paneLabel", { index: index + 1 })}
                  </option>
                ))}
              </select>
            )}
          {disconnected && (
            <button
              type="button"
              onClick={() => {
                closed.current = false;
                setReconnectKey((value) => value + 1);
              }}
              className="rounded border border-emerald-600 px-2 py-1 text-emerald-300"
            >
              {t("console.reconnect")}
            </button>
          )}
          <button
            type="button"
            onClick={onMinimize}
            title={t("console.minimizeHint")}
            className="rounded border border-slate-500 px-2 py-1"
          >
            {t("console.minimize")}
          </button>
          <button
            type="button"
            onClick={() => {
              closed.current = true;
              terminate(socket.current);
              onClose();
            }}
            className="rounded border border-slate-500 px-2 py-1"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
      <div
        ref={container}
        role="application"
        aria-label={t("console.terminal")}
        onFocus={() => onActivate?.()}
        className="min-h-0 flex-1 overflow-hidden rounded bg-black p-2"
      />
    </div>
  );
}

function terminate(socket: ConsoleSocket | null) {
  if (socket?.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify({ type: "terminate" }));
}

function handleControl(message: string, onSessionId?: (id: string) => void) {
  try {
    const value = JSON.parse(message) as { type?: string; id?: string };
    if (value.type === "session" && value.id) onSessionId?.(value.id);
  } catch {
    // frame di controllo malformato: ignorato
  }
}
