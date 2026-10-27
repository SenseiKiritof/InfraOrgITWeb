import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type AnsiSegment, parseAnsi } from "../../lib/ansi";
import { appendOutput } from "../../lib/terminalBuffer";

export type ConsoleLayout = "pane" | "modal";

export function ConsoleModal({
  serverId,
  serverName,
  visible,
  layout,
  closing,
  resumeId,
  onSessionId,
  onData,
  onMinimize,
  onSetLayout,
  onClose,
}: {
  serverId: number;
  serverName: string;
  visible: boolean;
  layout: ConsoleLayout;
  closing?: boolean;
  resumeId?: string;
  onSessionId?: (id: string) => void;
  onData?: () => void;
  onMinimize: () => void;
  onSetLayout: (layout: ConsoleLayout) => void;
  onClose: () => void;
}) {
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("Connessione…");
  const [focused, setFocused] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const terminal = useRef<HTMLDivElement | null>(null);
  const sessionCallback = useRef(onSessionId);
  sessionCallback.current = onSessionId;
  const dataCallback = useRef(onData);
  dataCallback.current = onData;
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;
  const closed = useRef(false);
  const initialResume = useRef(resumeId);
  const screen = useMemo(() => parseAnsi(output), [output]);

  useEffect(() => {
    if (visible) terminal.current?.focus();
  }, [visible]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deve riallineare dopo ogni chunk di output
  useEffect(() => {
    const element = terminal.current;
    if (!element) return;
    const atBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < 40;
    if (atBottom) element.scrollTop = element.scrollHeight;
  }, [output]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const query = new URLSearchParams({ cols: "100", rows: "30" });
    if (initialResume.current) query.set("resume", initialResume.current);
    const ws = new WebSocket(
      `${protocol}://${window.location.host}/api/socket/servers/${serverId}/console?${query}`,
    );
    ws.binaryType = "arraybuffer";
    const decoder = new TextDecoder();
    socket.current = ws;

    ws.onopen = () => {
      setStatus("Connesso");
      ws.send(JSON.stringify({ type: "resize", cols: 100, rows: 30 }));
    };
    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        handleControl(event.data, sessionCallback.current);
        return;
      }

      const text = decoder.decode(event.data as ArrayBuffer, { stream: true });
      setOutput((current) => appendOutput(current, text));
      dataCallback.current?.();
    };
    ws.onerror = () => setStatus("Errore di connessione");
    ws.onclose = () => setStatus((current) => `${current} · sessione chiusa`);

    return () => {
      ws.close();
      socket.current = null;
    };
  }, [serverId]);

  useEffect(() => {
    if (!closing || closed.current) return;
    closed.current = true;
    terminate(socket.current);
    closeCallback.current();
  }, [closing]);

  const send = (value: string) => {
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(new TextEncoder().encode(value));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") send("\r");
    else if (event.key === "Backspace") send("\u007f");
    else if (event.key === "Delete") send("\u001b[3~");
    else if (event.key === "Tab") send("\t");
    else if (event.key === "ArrowUp") send("\u001b[A");
    else if (event.key === "ArrowDown") send("\u001b[B");
    else if (event.key === "ArrowRight") send("\u001b[C");
    else if (event.key === "ArrowLeft") send("\u001b[D");
    else if (event.key === "Home") send("\u0001");
    else if (event.key === "End") send("\u0005");
    else if (event.key.length === 1) send(event.key);
    else return;
    event.preventDefault();
  };

  if (!visible) return null;

  const body = (
    <>
      <div className="mb-2 flex items-center justify-between gap-2 text-sm text-slate-200">
        <p className="min-w-0 truncate">
          Console SSH · {serverName}{" "}
          <span className="text-slate-400">({status})</span>
        </p>
        <div className="flex shrink-0 items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => onSetLayout(layout === "pane" ? "modal" : "pane")}
            title={
              layout === "pane"
                ? "Separa la console in una finestra"
                : "Affianca la console alle altre"
            }
            className="rounded border border-slate-500 px-2 py-1"
          >
            {layout === "pane" ? "Separa" : "Affianca"}
          </button>
          <button
            type="button"
            onClick={onMinimize}
            title="Lascia la sessione aperta e torna al sito"
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
        aria-label="Terminale SSH"
        role="log"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: il terminale deve ricevere la tastiera; textarea non può colorare l'output
        tabIndex={0}
        ref={terminal}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="min-h-0 flex-1 cursor-text overflow-auto whitespace-pre rounded bg-black p-3 font-mono text-xs text-slate-100 outline-none ring-emerald-400/70 focus:ring-2"
      >
        {output ? (
          screen.rows.map((row, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: righe posizionali del terminale
            <div key={index} className="min-h-[1.2em]">
              <TerminalRow
                segments={row}
                caret={index === screen.cursor.row ? screen.cursor.col : null}
                focused={focused}
              />
            </div>
          ))
        ) : (
          <span className="text-slate-400">
            Clicca qui e premi Invio per iniziare.
          </span>
        )}
        {!output && (
          <span
            aria-hidden="true"
            className={
              focused ? "console-caret" : "console-caret console-caret-idle"
            }
          />
        )}
      </div>
    </>
  );

  if (layout === "modal") {
    return (
      <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
        <div className="flex h-[80vh] w-full max-w-4xl flex-col rounded-lg bg-slate-950 p-4 shadow-xl">
          {body}
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto flex h-full min-h-0 w-full flex-col rounded-lg border border-slate-700 bg-slate-950 p-3 shadow-xl">
      {body}
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

function Caret({ focused }: { focused: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={focused ? "console-caret" : "console-caret console-caret-idle"}
    />
  );
}

function TerminalRow({
  segments,
  caret,
  focused,
}: {
  segments: AnsiSegment[];
  caret: number | null;
  focused: boolean;
}) {
  const nodes: ReactNode[] = [];
  let offset = 0;
  let placed = caret === null;

  segments.forEach((segment) => {
    const style = {
      color: segment.fg,
      backgroundColor: segment.bg,
      fontWeight: segment.bold ? 600 : undefined,
      opacity: segment.dim ? 0.75 : undefined,
      textDecoration: segment.underline ? "underline" : undefined,
    };
    const start = offset;
    const end = offset + segment.text.length;

    if (!placed && caret !== null && caret > start && caret < end) {
      const cut = caret - start;
      nodes.push(
        <span key={`s${start}a`} style={style}>
          {segment.text.slice(0, cut)}
        </span>,
      );
      nodes.push(<Caret key={`c${start}`} focused={focused} />);
      nodes.push(
        <span key={`s${start}b`} style={style}>
          {segment.text.slice(cut)}
        </span>,
      );
      placed = true;
    } else {
      if (!placed && caret !== null && caret === start) {
        nodes.push(<Caret key={`c${start}`} focused={focused} />);
        placed = true;
      }
      nodes.push(
        <span key={`s${start}`} style={style}>
          {segment.text}
        </span>,
      );
    }

    offset = end;
  });

  if (!placed && caret !== null) {
    const padding = caret - offset;
    if (padding > 0) nodes.push(<span key="pad">{" ".repeat(padding)}</span>);
    nodes.push(<Caret key="caret" focused={focused} />);
  }

  return <>{nodes}</>;
}
