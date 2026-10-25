import { useEffect, useRef, useState } from "react";

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, "g");

export function ConsoleModal({
  serverId,
  serverName,
  onClose,
}: {
  serverId: number;
  serverName: string;
  onClose: () => void;
}) {
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("Connessione…");
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(
      `${protocol}://${window.location.host}/api/socket/servers/${serverId}/console?cols=100&rows=30`,
    );
    ws.binaryType = "arraybuffer";
    const decoder = new TextDecoder();
    socket.current = ws;

    ws.onopen = () => {
      setStatus("Connesso");
      ws.send(JSON.stringify({ type: "resize", cols: 100, rows: 30 }));
    };
    ws.onmessage = (event) => {
      const text =
        typeof event.data === "string"
          ? event.data
          : decoder.decode(event.data as ArrayBuffer);
      setOutput((current) =>
        (current + text.replace(ANSI, "")).slice(-100_000),
      );
    };
    ws.onerror = () => setStatus("Errore di connessione");
    ws.onclose = () => setStatus((current) => `${current} · sessione chiusa`);

    return () => {
      ws.close();
      socket.current = null;
    };
  }, [serverId]);

  const send = (value: string) => {
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(new TextEncoder().encode(value));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter") send("\r");
    else if (event.key === "Backspace") send("\x7f");
    else if (event.key === "Tab") send("\t");
    else if (event.key === "ArrowUp") send("\x1b[A");
    else if (event.key === "ArrowDown") send("\x1b[B");
    else if (event.key === "ArrowRight") send("\x1b[C");
    else if (event.key === "ArrowLeft") send("\x1b[D");
    else if (event.key.length === 1) send(event.key);
    else return;
    event.preventDefault();
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex h-[80vh] w-full max-w-4xl flex-col rounded-lg bg-slate-950 p-4 shadow-xl">
        <div className="mb-2 flex items-center justify-between text-sm text-slate-200">
          <p>
            Console SSH · {serverName}{" "}
            <span className="text-slate-400">({status})</span>
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-500 px-2 py-1"
          >
            Chiudi
          </button>
        </div>
        <textarea
          readOnly
          aria-label="Terminale SSH"
          value={output || "Clicca qui e premi Invio per iniziare."}
          onKeyDown={onKeyDown}
          className="min-h-0 flex-1 resize-none rounded bg-black p-3 font-mono text-xs text-slate-100 outline-none"
        />
        <p className="mt-2 text-xs text-slate-400">
          Clicca nel terminale per digitare. La sessione ha durata massima
          limitata e viene registrata.
        </p>
      </div>
    </div>
  );
}
