import {
  ChevronDownIcon,
  FolderArrowDownIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ViewColumnsIcon,
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
import { useI18n } from "../../lib/i18n";
import type { Server } from "../../lib/inventory";
import { paged } from "../../lib/inventory";
import { fetchServerAccess } from "../../lib/useServerAccess";
import { ConsoleModal } from "./ConsoleModal";
import { FileBrowserModal } from "./FileBrowserModal";

type Session = {
  id: string;
  serverId: number;
  serverName: string;
  visible: boolean;
  closing?: boolean;
  resumeId?: string;
};

type Activity = "idle" | "receiving" | "unread";

type ConsoleApi = {
  open: (serverId: number, serverName: string) => void;
  hasSession: (serverId: number) => boolean;
  closeServer: (serverId: number) => void;
  /** Apre l'esploratore file; null mostra la scelta del server. */
  openFiles: (serverId: number | null) => void;
};

const STORAGE_KEY = "ds-console-sessions";
const ACTIVITY_QUIET_MS = 600;

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

/** Console SSH in un pannello in basso: tab, divisione affiancata e avvisi di output. */
export function ConsoleProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<Session[]>(loadSessions);
  const [activeId, setActiveId] = useState<string | null>(
    () => sessions.find((session) => session.visible)?.id ?? null,
  );
  const [split, setSplit] = useState(false);
  const [activity, setActivity] = useState<Record<string, Activity>>({});
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [launcherQuery, setLauncherQuery] = useState("");
  const [filesOpen, setFilesOpen] = useState(false);
  const [fileServerId, setFileServerId] = useState<number | null>(null);
  const sessionsRef = useRef(sessions);
  const splitRef = useRef(split);
  const activeRef = useRef(activeId);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [storageError, setStorageError] = useState(false);

  const [serverList, setServerList] = useState<Server[]>([]);
  const [serversLoading, setServersLoading] = useState(false);
  const [adminEnvironmentIds, setAdminEnvironmentIds] = useState<number[]>([]);

  useEffect(() => {
    if (!launcherOpen && !filesOpen) return;
    let cancelled = false;
    setServersLoading(true);
    Promise.all([paged<Server>("/api/servers"), fetchServerAccess()])
      .then(([page, serverAccess]) => {
        if (cancelled) return;
        setServerList(page.items);
        setAdminEnvironmentIds(serverAccess.adminEnvironmentIds);
      })
      .catch(() => {
        if (!cancelled) {
          setServerList([]);
          setAdminEnvironmentIds([]);
        }
      })
      .finally(() => {
        if (!cancelled) setServersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [launcherOpen, filesOpen]);
  const availableServers = useMemo(
    () =>
      serverList
        .filter((server) =>
          adminEnvironmentIds.includes(server.providerEnvironmentId),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [serverList, adminEnvironmentIds],
  );
  const filteredServers = availableServers.filter((server) =>
    server.name.toLocaleLowerCase().includes(launcherQuery.toLocaleLowerCase()),
  );

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [sessions]);

  useEffect(() => {
    sessionsRef.current = sessions;
    splitRef.current = split;
    activeRef.current = activeId;
    setActivity((current) => {
      let next = current;
      for (const session of sessions) {
        const viewed = session.visible && (split || session.id === activeId);
        if (viewed && current[session.id] === "unread") {
          if (next === current) next = { ...current };
          next[session.id] = "idle";
        }
      }
      return next;
    });
  }, [sessions, split, activeId]);

  useEffect(() => {
    const current = sessions.find((session) => session.id === activeId);
    if (current?.visible) return;
    setActiveId(sessions.find((session) => session.visible)?.id ?? null);
  }, [sessions, activeId]);

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
          sessionsRef.current.some(
            (session) => session.id === id && session.visible,
          ) &&
          (splitRef.current || activeRef.current === id);
        setActivity((current) => ({
          ...current,
          [id]: visible ? "idle" : "unread",
        }));
      }, ACTIVITY_QUIET_MS),
    );
  }, []);

  const open = useCallback((serverId: number, serverName: string) => {
    const existing = sessionsRef.current.find(
      (session) => session.serverId === serverId,
    );
    if (existing) {
      setSessions((current) =>
        current.map((session) =>
          session.id === existing.id ? { ...session, visible: true } : session,
        ),
      );
      setActiveId(existing.id);
      return;
    }
    const id = newSessionId();
    setSessions((current) => [
      ...current,
      { id, serverId, serverName, visible: true },
    ]);
    setActiveId(id);
  }, []);

  const select = useCallback((id: string) => {
    setSessions((current) =>
      current.map((session) =>
        session.id === id ? { ...session, visible: true } : session,
      ),
    );
    setActiveId(id);
  }, []);

  const minimize = useCallback((id: string) => {
    setSessions((current) =>
      current.map((session) =>
        session.id === id ? { ...session, visible: false } : session,
      ),
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

  const hasSession = useCallback(
    (serverId: number) =>
      sessionsRef.current.some((session) => session.serverId === serverId),
    [],
  );

  const closeServer = useCallback((serverId: number) => {
    setSessions((current) =>
      current.filter((session) => session.serverId !== serverId),
    );
  }, []);

  const openFiles = useCallback((serverId: number | null) => {
    setFileServerId(serverId);
    setFilesOpen(true);
  }, []);

  const api = useMemo(
    () => ({ open, hasSession, closeServer, openFiles }),
    [open, hasSession, closeServer, openFiles],
  );
  const openSessions = sessions.filter((session) => session.visible);
  const shown = split
    ? openSessions
    : openSessions.filter((session) => session.id === activeId);
  const dockHeight = shown.length === 0 ? "2.75rem" : "calc(45vh + 2.75rem)";

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--console-dock-height",
      dockHeight,
    );
    return () => {
      document.documentElement.style.removeProperty("--console-dock-height");
    };
  }, [dockHeight]);

  return (
    <ConsoleContext.Provider value={api}>
      {children}

      <div
        className={
          shown.length === 0
            ? "hidden"
            : "pointer-events-none fixed inset-x-0 bottom-11 z-30 flex h-[45vh] gap-2 overflow-x-auto px-2"
        }
      >
        {sessions.map((session) => {
          const displayed = shown.some((item) => item.id === session.id);
          return (
            <div
              key={session.id}
              data-testid={`console-pane-${session.id}`}
              hidden={!displayed}
              className={
                displayed
                  ? "pointer-events-auto flex min-w-[320px] flex-1"
                  : undefined
              }
            >
              <ConsoleModal
                serverId={session.serverId}
                serverName={session.serverName}
                visible={session.visible}
                active={displayed && session.id === activeId}
                closing={session.closing}
                resumeId={session.resumeId}
                onSessionId={(resumeId) => attach(session.id, resumeId)}
                onData={() => observeData(session.id)}
                onActivate={() => setActiveId(session.id)}
                onMinimize={() => minimize(session.id)}
                onClose={() => remove(session.id)}
              />
            </div>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-700 bg-slate-900 text-slate-100">
        <div className="relative flex h-11 items-center gap-1 px-2">
          <span className="shrink-0 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {t("console.label")}
          </span>
          <button
            type="button"
            onClick={() => {
              setLauncherQuery("");
              setLauncherOpen((value) => !value);
            }}
            aria-label={t("console.add")}
            aria-expanded={launcherOpen}
            title={t("console.add")}
            className={`rounded p-1 ${
              launcherOpen
                ? "bg-slate-700 text-slate-100"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
          </button>
          {launcherOpen && (
            <>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={() => setLauncherOpen(false)}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div className="absolute bottom-full left-2 z-50 mb-1 w-80 rounded-lg border border-slate-200 bg-white p-2 text-slate-900 shadow-xl">
                <label className="flex items-center gap-2 rounded-md border border-slate-300 px-2 py-1.5">
                  <MagnifyingGlassIcon
                    className="h-4 w-4 shrink-0 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    // biome-ignore lint/a11y/noAutofocus: la ricerca è il primo campo del pannello appena aperto
                    autoFocus
                    value={launcherQuery}
                    onChange={(event) => setLauncherQuery(event.target.value)}
                    placeholder={t("console.searchServer")}
                    className="min-w-0 flex-1 text-sm outline-none"
                  />
                </label>
                <div className="mt-1 max-h-72 overflow-y-auto">
                  {serversLoading && (
                    <p className="px-2 py-3 text-sm text-slate-500">
                      {t("common.loading")}
                    </p>
                  )}
                  {!serversLoading && filteredServers.length === 0 && (
                    <p className="px-2 py-3 text-sm text-slate-500">
                      {t("console.noServers")}
                    </p>
                  )}
                  {filteredServers.map((server) => (
                    <button
                      key={server.id}
                      type="button"
                      onClick={() => {
                        open(server.id, server.name);
                        setLauncherOpen(false);
                        setLauncherQuery("");
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                    >
                      <span className="truncate">{server.name}</span>
                      <span className="shrink-0 font-mono text-xs text-slate-500">
                        {server.ipAddress}:{server.sshPort}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`flex shrink-0 items-center rounded ${
                  session.id === activeId ? "bg-slate-800" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => select(session.id)}
                  title={t("console.openSession", {
                    name: session.serverName,
                  })}
                  className="flex items-center gap-1.5 py-1.5 pr-1 pl-2 text-xs"
                >
                  <ActivityDot state={activity[session.id] ?? "idle"} />
                  <span className="max-w-[12rem] truncate">
                    {session.serverName}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={t("console.closeSession", {
                    name: session.serverName,
                  })}
                  onClick={() => close(session.id)}
                  className="px-1.5 py-1 text-slate-400 hover:text-slate-100"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => openFiles(null)}
              aria-label={t("files.open")}
              title={t("files.open")}
              className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-slate-400 hover:text-slate-100"
            >
              <FolderArrowDownIcon className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t("files.label")}</span>
            </button>
            {sessions.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setSplit((value) => !value)}
                  aria-label={split ? t("console.merge") : t("console.split")}
                  aria-pressed={split}
                  title={split ? t("console.merge") : t("console.split")}
                  className={`rounded p-1 ${
                    split
                      ? "bg-slate-700 text-slate-100"
                      : "text-slate-400 hover:text-slate-100"
                  }`}
                >
                  <ViewColumnsIcon className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={t("console.minimize")}
                  title={t("console.minimize")}
                  onClick={() => {
                    for (const session of openSessions) minimize(session.id);
                  }}
                  disabled={openSessions.length === 0}
                  className="rounded p-1 text-slate-400 hover:text-slate-100 disabled:opacity-40"
                >
                  <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {filesOpen && (
        <FileBrowserModal
          open
          serverId={fileServerId}
          onClose={() => setFilesOpen(false)}
        />
      )}
      {storageError && (
        <p className="fixed right-3 bottom-14 z-50 rounded bg-amber-100 px-3 py-1 text-xs text-amber-900 shadow">
          {t("console.storageError")}
        </p>
      )}
    </ConsoleContext.Provider>
  );
}

function ActivityDot({ state }: { state: Activity }) {
  const { t } = useI18n();
  if (state === "receiving") {
    return (
      <span
        role="img"
        aria-label={t("console.receiving")}
        title={t("console.receiving")}
        className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400"
      />
    );
  }
  if (state === "unread") {
    return (
      <span
        role="img"
        aria-label={t("console.unread")}
        title={t("console.unread")}
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
