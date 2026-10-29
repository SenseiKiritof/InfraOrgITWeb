import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";

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
  const [status, setStatus] = useState("Connessione…");
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

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const query = new URLSearchParams({ cols: "100", rows: "30" });
    if (initialResume.current) query.set("resume", initialResume.current);
    const ws = new WebSocket(
      `${protocol}://${window.location.host}/api/socket/servers/${serverId}/console?${query}`,
    );
    ws.binaryType = "arraybuffer";
    socket.current = ws;

    ws.onopen = () => {
      setStatus("Connesso");
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
    ws.onerror = () => setStatus("Errore di connessione");
    ws.onclose = () => setStatus((current) => `${current} · sessione chiusa`);

    return () => {
      ws.close();
      socket.current = null;
    };
  }, [serverId, sendResize]);

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
          Console SSH · {serverName}{" "}
          <span className="text-slate-400">({status})</span>
        </p>
        <div className="flex shrink-0 items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={onMinimize}
            title="Chiudi il pannello e lascia la sessione nella barra"
            className="rounded border border-slate-500 px-2 py-1"
          >
            Riduci
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
            Chiudi
          </button>
        </div>
      </div>
      <div
        ref={container}
        role="application"
        aria-label="Terminale SSH"
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
