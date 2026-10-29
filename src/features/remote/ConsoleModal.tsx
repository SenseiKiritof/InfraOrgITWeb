import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";
import { type TranslationKey, useI18n } from "../../lib/i18n";
import "@xterm/xterm/css/xterm.css";

type ConsoleStatus = "connecting" | "connected" | "error";

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
  const socket = useRef<WebSocket | null>(null);
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

  useEffect(() => {
    visibleRef.current = visible;
    if (!visible) return;
    requestAnimationFrame(() => {
      try {
        fit.current?.fit();
      } catch {
        // il pannello non è ancora dimensionato
      }
    });
    if (active) terminal.current?.focus();
  }, [visible, active]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reconnectKey forza una nuova connessione
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const query = new URLSearchParams({ cols: "100", rows: "30" });
    const resume = resumeRef.current ?? initialResume.current;
    if (resume) query.set("resume", resume);
    const ws = new WebSocket(
      `${protocol}://${window.location.host}/api/socket/servers/${serverId}/console?${query}`,
    );
    ws.binaryType = "arraybuffer";
    socket.current = ws;
    let disposed = false;
    setDisconnected(false);
    setSessionClosed(false);
    setStatus("connecting");

    ws.onopen = () => {
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

    return () => {
      disposed = true;
      ws.close();
      socket.current = null;
    };
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
      className="pointer-events-auto flex h-full min-h-0 w-full flex-col rounded-lg border border-slate-700 bg-slate-950 p-3 shadow-xl"
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

function terminate(socket: WebSocket | null) {
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
