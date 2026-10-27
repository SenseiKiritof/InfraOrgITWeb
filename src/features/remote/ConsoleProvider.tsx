import {
  ChevronDownIcon,
  ChevronUpIcon,
  CommandLineIcon,
} from "@heroicons/react/24/outline";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type ConsoleLayout, ConsoleModal } from "./ConsoleModal";

type Session = {
  id: string;
  serverId: number;
  serverName: string;
  visible: boolean;
  layout: ConsoleLayout;
  closing?: boolean;
  resumeId?: string;
};

type Activity = "idle" | "receiving" | "unread";

type ConsoleApi = {
  open: (serverId: number, serverName: string) => void;
};

const STORAGE_KEY = "ds-console-sessions";
const ACTIVITY_QUIET_MS = 600;

const reveal = (session: Session): Session => ({ ...session, visible: true });

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

type StoredSession = {
  id: string;
  serverId: number;
  serverName: string;
  visible?: boolean;
  minimized?: boolean;
  layout?: string;
  closing?: boolean;
  resumeId?: string;
};

function isStoredSession(item: unknown): item is StoredSession {
  const value = item as Partial<StoredSession> | null;
  return (
    typeof value?.id === "string" &&
    typeof value.serverId === "number" &&
    typeof value.serverName === "string"
  );
}

function loadSessions(): Session[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(isStoredSession).map((item) => ({
      id: item.id,
      serverId: item.serverId,
      serverName: item.serverName,
      closing: item.closing,
      resumeId: item.resumeId,
      layout: item.layout === "modal" ? "modal" : "pane",
      // compatibilità con le sessioni salvate prima della barra console
      visible:
        typeof item.visible === "boolean"
          ? item.visible
          : item.minimized !== true,
    }));
  } catch {
    return [];
  }
}

const ConsoleContext = createContext<ConsoleApi | null>(null);

/** Console SSH persistenti: barra in basso, pannelli affiancati o finestre separate. */
export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>(loadSessions);
  const [collapsed, setCollapsed] = useState(false);
  const [activity, setActivity] = useState<Record<string, Activity>>({});
  const sessionsRef = useRef(sessions);
  const collapsedRef = useRef(collapsed);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
      setStorageError(null);
    } catch {
      setStorageError("Impossibile salvare le console nel browser.");
    }
  }, [sessions]);

  useEffect(() => {
    sessionsRef.current = sessions;
    collapsedRef.current = collapsed;
    if (collapsed) return;
    setActivity((current) => {
      let next = current;
      for (const session of sessions) {
        if (session.visible && current[session.id] === "unread") {
          if (next === current) next = { ...current };
          next[session.id] = "idle";
        }
      }
      return next;
    });
  }, [sessions, collapsed]);

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
    },
    [],
  );

  const observeData = useCallback((id: string) => {
    setActivity((current) =>
      current[id] === "receiving" ? current : { ...current, [id]: "receiving" },
    );
    const running = timers.current.get(id);
    if (running) clearTimeout(running);
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        const visible =
          !collapsedRef.current &&
          sessionsRef.current.some(
            (session) => session.id === id && session.visible,
          );
        setActivity((current) => ({
          ...current,
          [id]: visible ? "idle" : "unread",
        }));
      }, ACTIVITY_QUIET_MS),
    );
  }, []);

  const open = useCallback((serverId: number, serverName: string) => {
    setCollapsed(false);
    setSessions((current) => {
      const existing = current.find((session) => session.serverId === serverId);
      if (existing) {
        return current.map((session) =>
          session.id === existing.id
            ? reveal(session)
            : session.layout === "modal"
              ? { ...session, visible: false }
              : session,
        );
      }
      return [
        ...current.map((session) =>
          session.layout === "modal" ? { ...session, visible: false } : session,
        ),
        {
          id: newSessionId(),
          serverId,
          serverName,
          visible: true,
          layout: "pane",
        },
      ];
    });
  }, []);

  const toggle = useCallback((id: string) => {
    setSessions((current) => {
      const target = current.find((session) => session.id === id);
      if (!target) return current;
      if (target.visible) {
        return current.map((session) =>
          session.id === id ? { ...session, visible: false } : session,
        );
      }
      return current.map((session) =>
        session.id === id
          ? reveal(session)
          : session.layout === "modal"
            ? { ...session, visible: false }
            : session,
      );
    });
  }, []);

  const minimize = useCallback((id: string) => {
    setSessions((current) =>
      current.map((session) =>
        session.id === id ? { ...session, visible: false } : session,
      ),
    );
  }, []);

  const changeLayout = useCallback((id: string, layout: ConsoleLayout) => {
    setCollapsed(false);
    setSessions((current) =>
      current.map((session) => {
        if (session.id === id) return { ...session, visible: true, layout };
        if (layout === "modal" && session.layout === "modal") {
          return { ...session, visible: false };
        }
        return session;
      }),
    );
  }, []);

  const close = useCallback((id: string) => {
    setSessions((current) =>
      current.map((session) =>
        session.id === id ? { ...session, closing: true } : session,
      ),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setSessions((current) => current.filter((session) => session.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setActivity((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const attach = useCallback((id: string, resumeId: string) => {
    setSessions((current) =>
      current.map((session) =>
        session.id === id ? { ...session, resumeId } : session,
      ),
    );
  }, []);

  const api = useMemo(() => ({ open }), [open]);
  const unread = sessions.filter(
    (session) => activity[session.id] === "unread",
  ).length;
  const receiving = sessions.some(
    (session) => activity[session.id] === "receiving",
  );

  return (
    <ConsoleContext.Provider value={api}>
      {children}

      <div
        className={
          collapsed
            ? "hidden"
            : "pointer-events-none fixed inset-x-0 bottom-11 top-24 z-30 flex gap-2 overflow-x-auto px-2"
        }
      >
        {sessions.map((session) => (
          <div
            key={session.id}
            className={
              session.visible && session.layout === "pane"
                ? "pointer-events-auto flex min-w-[320px] flex-1"
                : "contents"
            }
          >
            <ConsoleModal
              serverId={session.serverId}
              serverName={session.serverName}
              visible={session.visible}
              layout={session.layout}
              closing={session.closing}
              resumeId={session.resumeId}
              onSessionId={(resumeId) => attach(session.id, resumeId)}
              onData={() => observeData(session.id)}
              onMinimize={() => minimize(session.id)}
              onSetLayout={(layout) => changeLayout(session.id, layout)}
              onClose={() => remove(session.id)}
            />
          </div>
        ))}
      </div>

      {sessions.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-700 bg-slate-900 text-slate-100">
          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="flex h-9 w-full items-center gap-2 px-3 text-xs"
            >
              <CommandLineIcon className="h-4 w-4" aria-hidden="true" />
              <span>Console ({sessions.length})</span>
              <ActivityDot state={receiving ? "receiving" : "idle"} />
              {unread > 0 && (
                <>
                  <ActivityDot state="unread" />
                  <span>
                    {unread} {unread === 1 ? "nuovo" : "nuovi"}
                  </span>
                </>
              )}
              <ChevronUpIcon className="ml-auto h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <div className="flex h-11 items-center gap-1 overflow-x-auto px-2">
              <span className="shrink-0 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Console
              </span>
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`flex shrink-0 items-center rounded ${
                    session.visible ? "bg-slate-800" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(session.id)}
                    title={
                      session.visible
                        ? `Riduci la console di ${session.serverName}`
                        : `Apri la console di ${session.serverName}`
                    }
                    className="flex items-center gap-1.5 py-1.5 pr-1 pl-2 text-xs"
                  >
                    <ActivityDot state={activity[session.id] ?? "idle"} />
                    <span className="max-w-[12rem] truncate">
                      {session.serverName}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Chiudi la console di ${session.serverName}`}
                    onClick={() => close(session.id)}
                    className="px-1.5 py-1 text-slate-400 hover:text-slate-100"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                aria-label="Riduci la barra delle console"
                onClick={() => setCollapsed(true)}
                className="ml-auto shrink-0 rounded p-1 text-slate-400 hover:text-slate-100"
              >
                <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
          {storageError && (
            <p className="border-t border-slate-700 px-3 py-1 text-[11px] text-amber-300">
              {storageError}
            </p>
          )}
        </div>
      )}
    </ConsoleContext.Provider>
  );
}

function ActivityDot({ state }: { state: Activity }) {
  if (state === "receiving") {
    return (
      <span
        role="img"
        aria-label="In ricezione"
        title="In ricezione"
        className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400"
      />
    );
  }
  if (state === "unread") {
    return (
      <span
        role="img"
        aria-label="Output non visto"
        title="Output non visto"
        className="h-2 w-2 shrink-0 rounded-full bg-amber-400 ring-2 ring-amber-400/30"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="h-2 w-2 shrink-0 rounded-full bg-slate-600"
    />
  );
}

export function useConsole(): ConsoleApi {
  const value = useContext(ConsoleContext);
  if (!value) throw new Error("useConsole richiede ConsoleProvider.");
  return value;
}
