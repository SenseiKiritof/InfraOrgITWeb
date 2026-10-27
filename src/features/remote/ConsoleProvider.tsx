import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ConsoleModal } from "./ConsoleModal";

type Session = {
  id: string;
  serverId: number;
  serverName: string;
  minimized: boolean;
  closing?: boolean;
  resumeId?: string;
};

type ConsoleApi = {
  open: (serverId: number, serverName: string) => void;
};

const STORAGE_KEY = "ds-console-sessions";

/** Cancella le console salvate: da chiamare al logout. */
export function clearConsoleSessions() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage non disponibile
  }
}

function newSessionId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // fallback per origini non secure (http su LAN)
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

function loadSessions(): Session[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (item): item is Session =>
          typeof item?.id === "string" &&
          typeof item?.serverId === "number" &&
          typeof item?.serverName === "string",
      )
      .map((item) => ({ ...item, minimized: item.minimized === true }));
  } catch {
    return [];
  }
}

const ConsoleContext = createContext<ConsoleApi | null>(null);

/** Console SSH persistenti tra le pagine e dopo il refresh: ridotte restano connesse. */
export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>(loadSessions);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      // storage non disponibile: la console resta solo in memoria
    }
  }, [sessions]);

  const open = useCallback((serverId: number, serverName: string) => {
    setSessions((current) => {
      const existing = current.find((item) => item.serverId === serverId);
      if (existing)
        return current.map((item) => ({
          ...item,
          minimized: item.id !== existing.id,
        }));
      return [
        ...current.map((item) => ({ ...item, minimized: true })),
        {
          id: newSessionId(),
          serverId,
          serverName,
          minimized: false,
        },
      ];
    });
  }, []);

  const toggle = useCallback((id: string, minimized: boolean) => {
    setSessions((current) =>
      current.map((item) =>
        minimized
          ? item.id === id
            ? { ...item, minimized: true }
            : item
          : { ...item, minimized: item.id !== id },
      ),
    );
  }, []);

  const close = useCallback((id: string) => {
    setSessions((current) =>
      current.map((item) =>
        item.id === id ? { ...item, closing: true } : item,
      ),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setSessions((current) => current.filter((item) => item.id !== id));
  }, []);

  const attach = useCallback((id: string, resumeId: string) => {
    setSessions((current) =>
      current.map((item) => (item.id === id ? { ...item, resumeId } : item)),
    );
  }, []);

  const api = useMemo(() => ({ open }), [open]);
  const minimized = sessions.filter((session) => session.minimized);

  return (
    <ConsoleContext.Provider value={api}>
      {children}
      {sessions.map((session) => (
        <ConsoleModal
          key={session.id}
          serverId={session.serverId}
          serverName={session.serverName}
          minimized={session.minimized}
          closing={session.closing}
          resumeId={session.resumeId}
          onSessionId={(resumeId) => attach(session.id, resumeId)}
          onMinimize={() => toggle(session.id, true)}
          onClose={() => remove(session.id)}
        />
      ))}
      {minimized.length > 0 && (
        <div className="fixed right-4 bottom-4 z-30 flex flex-col items-end gap-2">
          {minimized.map((session) => (
            <div
              key={session.id}
              className="flex items-center gap-1 rounded-full border border-slate-600 bg-slate-900 pr-1 pl-3 text-sm text-slate-100 shadow-lg"
            >
              <button
                type="button"
                onClick={() => toggle(session.id, false)}
                className="py-1.5"
                title="Riapri la console"
              >
                Console SSH · {session.serverName}
              </button>
              <button
                type="button"
                aria-label={`Chiudi la console di ${session.serverName}`}
                onClick={() => close(session.id)}
                className="rounded-full px-2 py-1 text-slate-400 hover:text-slate-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </ConsoleContext.Provider>
  );
}

export function useConsole(): ConsoleApi {
  const value = useContext(ConsoleContext);
  if (!value) throw new Error("useConsole richiede ConsoleProvider.");
  return value;
}
