import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FolderArrowDownIcon,
  FolderIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import {
  createContext,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
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

/** Metadati mostrati nella tab e nella ricerca della console. */
export type ConsoleServerInfo = {
  ipAddress?: string | null;
  hostname?: string | null;
  environment?: string | null;
};

type Session = {
  id: string;
  serverId: number;
  serverName: string;
  ipAddress?: string;
  hostname?: string;
  environment?: string;
  /** Indice del pannello (0-2), null quando la console è ridotta. */
  pane: number | null;
  closing?: boolean;
  resumeId?: string;
};

type Activity = "idle" | "receiving" | "unread";

type FileSession = {
  id: string;
  serverId: number;
  serverName: string | null;
  path: string | null;
  /** Indice del pannello (0-2), null quando la sessione è ridotta. */
  pane: number | null;
  /** Cambia a ogni riapertura per forzare una nuova connessione. */
  epoch: number;
};

type ConsoleApi = {
  open: (
    serverId: number,
    serverName: string,
    info?: ConsoleServerInfo,
  ) => void;
  hasSession: (serverId: number) => boolean;
  closeServer: (serverId: number) => void;
  /** Apre l'esploratore file; null mostra la scelta del server. */
  openFiles: (serverId: number | null) => void;
};

type PaneCount = 1 | 2 | 3;
type PaneWidths = [number, number, number];

const PANE_KEYS = ["first", "second", "third"] as const;

const STORAGE_KEY = "ds-console-sessions";
const HEIGHT_STORAGE_KEY = "infraorgit-console-height";
const FILE_SESSIONS_CLEAR_EVENT = "infraorgit:file-sessions-clear";
const ACTIVITY_QUIET_MS = 600;
const DOCK_BAR_PX = 44;
const HEADER_PX = 64;
const MIN_DOCK_PX = 160;
const MIN_PANE_PERCENT = 15;

/** Cancella le console salvate: da chiamare al logout. */
export function clearConsoleSessions() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage non disponibile
  }
  // Le sessioni file vivono solo in memoria: il provider le distrugge al logout.
  window.dispatchEvent(new Event(FILE_SESSIONS_CLEAR_EVENT));
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
  ipAddress?: string;
  hostname?: string;
  environment?: string;
  pane?: number | null;
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
    const used = new Set<number>();
    return value.filter(isStoredSession).map((item) => {
      let pane: number | null = null;
      if (
        typeof item.pane === "number" &&
        item.pane >= 0 &&
        item.pane <= 2 &&
        !used.has(item.pane)
      ) {
        pane = item.pane;
      } else {
        const wasVisible =
          item.pane === undefined
            ? item.visible !== false && item.minimized !== true
            : item.pane !== null;
        // Sessioni salvate prima dei pannelli: 1-3 console restano affiancate.
        if (wasVisible) {
          pane = [0, 1, 2].find((index) => !used.has(index)) ?? null;
        }
      }
      if (pane !== null) used.add(pane);
      return {
        id: item.id,
        serverId: item.serverId,
        serverName: item.serverName,
        ipAddress: item.ipAddress,
        hostname: item.hostname,
        environment: item.environment,
        closing: item.closing,
        resumeId: item.resumeId,
        pane,
      };
    });
  } catch {
    return [];
  }
}

function usedPanes(sessions: Session[], files: FileSession[]): Set<number> {
  const used = new Set<number>();
  for (const session of sessions)
    if (session.pane !== null) used.add(session.pane);
  for (const session of files)
    if (session.pane !== null) used.add(session.pane);
  return used;
}

/** Primo pannello occupato da una console o da una sessione file. */
function firstRenderedPane(
  sessions: Session[],
  files: FileSession[],
  layout: PaneCount,
): number | null {
  let first: number | null = null;
  for (const item of [...sessions, ...files]) {
    if (item.pane === null || item.pane >= layout) continue;
    if (first === null || item.pane < first) first = item.pane;
  }
  return first;
}

/** ` · #2`, ` · #3`… per la seconda console/file dello stesso server. */
function ordinalSuffix(index: number): string {
  return index > 0 ? ` · #${index + 1}` : "";
}

/** Primo pannello libero; allarga il layout fino a 3 prima di sostituire. */
function choosePane(
  layout: PaneCount,
  used: Set<number>,
  fallback: number,
): { pane: number; layout: PaneCount } {
  for (let index = 0; index < layout; index += 1) {
    if (!used.has(index)) return { pane: index, layout };
  }
  if (layout < 3) return { pane: layout, layout: (layout + 1) as PaneCount };
  return { pane: Math.min(Math.max(fallback, 0), layout - 1), layout };
}

function detailsOf(info?: ConsoleServerInfo) {
  return {
    ipAddress: info?.ipAddress ?? undefined,
    hostname: info?.hostname ?? undefined,
    environment: info?.environment ?? undefined,
  };
}

function storedDockHeight(): number {
  try {
    const value = Number(localStorage.getItem(HEIGHT_STORAGE_KEY));
    if (Number.isFinite(value) && value >= MIN_DOCK_PX) return value;
  } catch {
    // storage non disponibile
  }
  if (typeof window === "undefined") return 320;
  return Math.max(220, Math.round(window.innerHeight * 0.45));
}

function persistDockHeight(height: number) {
  try {
    localStorage.setItem(HEIGHT_STORAGE_KEY, String(Math.round(height)));
  } catch {
    // storage non disponibile
  }
}

const ConsoleContext = createContext<ConsoleApi | null>(null);

/**
 * Console SSH e pannelli file in un dock in basso: tab per sessione, 1-3
 * pannelli condivisi tra console e SFTP, divisori ridimensionabili e avvisi
 * di output non visto.
 */
export function ConsoleProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [initialSessions] = useState(loadSessions);
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [layout, setLayout] = useState<PaneCount>(() => {
    const highest = initialSessions.reduce(
      (max, session) =>
        session.pane === null ? max : Math.max(max, session.pane),
      -1,
    );
    return Math.min(3, Math.max(1, highest + 1)) as PaneCount;
  });
  const [activePane, setActivePane] = useState(0);
  const [activity, setActivity] = useState<Record<string, Activity>>({});
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [launcherQuery, setLauncherQuery] = useState("");
  const [filesOpen, setFilesOpen] = useState(false);
  const [fileSessions, setFileSessions] = useState<FileSession[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [consoleCollapsed, setConsoleCollapsed] = useState(false);
  const [dockHeight, setDockHeight] = useState(storedDockHeight);
  const [paneWidths, setPaneWidths] = useState<PaneWidths>([
    100 / 3,
    100 / 3,
    100 / 3,
  ]);
  const sessionsRef = useRef(sessions);
  const fileSessionsRef = useRef(fileSessions);
  const layoutRef = useRef(layout);
  const activePaneRef = useRef(activePane);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const panesRef = useRef<HTMLDivElement | null>(null);
  const [storageError, setStorageError] = useState(false);

  const [serverList, setServerList] = useState<Server[]>([]);
  const [serversLoading, setServersLoading] = useState(false);
  const [adminEnvironmentIds, setAdminEnvironmentIds] = useState<number[]>([]);
  const hasSessions = sessions.length > 0;

  useEffect(() => {
    if (
      !launcherOpen &&
      !filesOpen &&
      fileSessions.length === 0 &&
      !hasSessions
    )
      return;
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
  }, [launcherOpen, filesOpen, fileSessions.length, hasSessions]);

  const availableServers = useMemo(
    () =>
      serverList
        .filter((server) =>
          adminEnvironmentIds.includes(server.providerEnvironmentId),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [serverList, adminEnvironmentIds],
  );
  const filteredServers = useMemo(() => {
    const query = launcherQuery.trim().toLocaleLowerCase();
    if (!query) return availableServers;
    return availableServers.filter((server) =>
      [
        server.name,
        server.ipAddress,
        server.hostname,
        server.providerEnvironmentLabel,
      ]
        .filter(Boolean)
        .some((field) => field.toLocaleLowerCase().includes(query)),
    );
  }, [availableServers, launcherQuery]);

  // I server caricati arricchiscono le tab aperte da altre pagine o ripristinate.
  useEffect(() => {
    if (serverList.length === 0) return;
    setSessions((current) => {
      let changed = false;
      const next = current.map((session) => {
        const server = serverList.find((item) => item.id === session.serverId);
        if (!server) return session;
        const enriched: Session = {
          ...session,
          serverName: server.name,
          ipAddress: server.ipAddress,
          hostname: server.hostname,
          environment: server.providerEnvironmentLabel,
        };
        if (
          enriched.serverName === session.serverName &&
          enriched.ipAddress === session.ipAddress &&
          enriched.hostname === session.hostname &&
          enriched.environment === session.environment
        )
          return session;
        changed = true;
        return enriched;
      });
      return changed ? next : current;
    });
  }, [serverList]);

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
    fileSessionsRef.current = fileSessions;
    layoutRef.current = layout;
    activePaneRef.current = activePane;
    setActivity((current) => {
      let next = current;
      for (const session of sessions) {
        const viewed = session.pane !== null && session.pane < layout;
        if (viewed && current[session.id] === "unread") {
          if (next === current) next = { ...current };
          next[session.id] = "idle";
        }
      }
      return next;
    });
  }, [sessions, fileSessions, layout, activePane]);

  useEffect(() => {
    const occupant = [...sessions, ...fileSessions].some(
      (session) =>
        session.pane === activePane &&
        session.pane !== null &&
        session.pane < layout,
    );
    if (occupant) return;
    const next = firstRenderedPane(sessions, fileSessions, layout);
    if (next !== null) setActivePane(next);
  }, [sessions, fileSessions, layout, activePane]);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  useEffect(() => {
    if (!launcherOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setLauncherOpen(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [launcherOpen]);

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
        const session = sessionsRef.current.find((item) => item.id === id);
        const visible =
          session !== undefined &&
          session.pane !== null &&
          session.pane < layoutRef.current;
        setActivity((current) => ({
          ...current,
          [id]: visible ? "idle" : "unread",
        }));
      }, ACTIVITY_QUIET_MS),
    );
  }, []);

  const focusConsole = useCallback(() => {
    setConsoleCollapsed(false);
    setFilesOpen(false);
  }, []);

  const open = useCallback(
    (serverId: number, serverName: string, info?: ConsoleServerInfo) => {
      focusConsole();
      const details = detailsOf(info);
      const choice = choosePane(
        layoutRef.current,
        usedPanes(sessionsRef.current, fileSessionsRef.current),
        activePaneRef.current,
      );
      setLayout(choice.layout);
      setSessions((previous) => [
        ...previous.map((session) =>
          session.pane === choice.pane ? { ...session, pane: null } : session,
        ),
        {
          id: newSessionId(),
          serverId,
          serverName,
          ipAddress: details.ipAddress,
          hostname: details.hostname,
          environment: details.environment,
          pane: choice.pane,
        },
      ]);
      setFileSessions((previous) =>
        previous.map((session) =>
          session.pane === choice.pane ? { ...session, pane: null } : session,
        ),
      );
      setActivePane(choice.pane);
    },
    [focusConsole],
  );

  /** Mette una console o una sessione file in un pannello, liberando l'occupante. */
  const assignPane = useCallback(
    (kind: "console" | "files", id: string, pane: number) => {
      setSessions((current) =>
        current.map((session) => {
          if (kind === "console" && session.id === id)
            return { ...session, pane };
          return session.pane === pane ? { ...session, pane: null } : session;
        }),
      );
      setFileSessions((current) =>
        current.map((session) => {
          if (kind === "files" && session.id === id)
            return {
              ...session,
              pane,
              // Riaprire una sessione ridotta rinnova la connessione.
              epoch: session.pane === null ? session.epoch + 1 : session.epoch,
            };
          return session.pane === pane ? { ...session, pane: null } : session;
        }),
      );
      setActivePane(pane);
      setConsoleCollapsed(false);
    },
    [],
  );

  const select = useCallback(
    (id: string) => {
      focusConsole();
      const current = sessionsRef.current;
      const session = current.find((item) => item.id === id);
      if (!session) return;
      if (session.pane !== null && session.pane < layoutRef.current) {
        setActivePane(session.pane);
        return;
      }
      const choice = choosePane(
        layoutRef.current,
        usedPanes(current, fileSessionsRef.current),
        activePaneRef.current,
      );
      setLayout(choice.layout);
      assignPane("console", id, choice.pane);
    },
    [focusConsole, assignPane],
  );

  const minimize = useCallback((id: string) => {
    const current = sessionsRef.current;
    const target = current.find((session) => session.id === id);
    setSessions((previous) =>
      previous.map((session) =>
        session.id === id ? { ...session, pane: null } : session,
      ),
    );
    if (target?.pane == null || target.pane !== activePaneRef.current) return;
    const next = firstRenderedPane(
      current.filter((session) => session.id !== id),
      fileSessionsRef.current,
      layoutRef.current,
    );
    if (next !== null) setActivePane(next);
  }, []);

  const close = useCallback((id: string) => {
    setSessions((current) =>
      current.map((session) =>
        session.id === id ? { ...session, closing: true } : session,
      ),
    );
  }, []);

  const remove = useCallback((id: string) => {
    const target = sessionsRef.current.find((session) => session.id === id);
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
    if (target?.pane != null && target.pane === activePaneRef.current) {
      const next = firstRenderedPane(
        sessionsRef.current.filter((session) => session.id !== id),
        fileSessionsRef.current,
        layoutRef.current,
      );
      if (next !== null) setActivePane(next);
    }
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
    const removed = sessionsRef.current.filter(
      (session) => session.serverId === serverId,
    );
    const removedFiles = fileSessionsRef.current.filter(
      (session) => session.serverId === serverId,
    );
    for (const session of removed) {
      const timer = timers.current.get(session.id);
      if (timer) clearTimeout(timer);
      timers.current.delete(session.id);
    }
    setSessions((current) =>
      current.filter((session) => session.serverId !== serverId),
    );
    setActivity((current) => {
      if (!removed.some((session) => session.id in current)) return current;
      const next = { ...current };
      for (const session of removed) delete next[session.id];
      return next;
    });
    setFileSessions((current) =>
      current.filter((session) => session.serverId !== serverId),
    );
    if (
      [...removed, ...removedFiles].some(
        (session) => session.pane === activePaneRef.current,
      )
    ) {
      const next = firstRenderedPane(
        sessionsRef.current.filter((session) => session.serverId !== serverId),
        fileSessionsRef.current.filter(
          (session) => session.serverId !== serverId,
        ),
        layoutRef.current,
      );
      if (next !== null) setActivePane(next);
    }
  }, []);

  const showFileSession = useCallback(
    (serverId: number, serverName?: string, forceNew = true) => {
      setConsoleCollapsed(false);
      setFilesOpen(false);
      const current = fileSessionsRef.current;
      const used = usedPanes(sessionsRef.current, current);
      const existing = forceNew
        ? undefined
        : current.find((session) => session.serverId === serverId);
      if (existing) {
        const choice =
          existing.pane !== null && existing.pane < layoutRef.current
            ? { pane: existing.pane, layout: layoutRef.current }
            : choosePane(layoutRef.current, used, activePaneRef.current);
        setLayout(choice.layout);
        setFileSessions((previous) =>
          previous.map((session) => {
            if (session.id === existing.id)
              return {
                ...session,
                serverName: session.serverName ?? serverName ?? null,
                pane: choice.pane,
                epoch: session.epoch + 1,
              };
            return session.pane === choice.pane
              ? { ...session, pane: null }
              : session;
          }),
        );
        setSessions((previous) =>
          previous.map((session) =>
            session.pane === choice.pane ? { ...session, pane: null } : session,
          ),
        );
        setActivePane(choice.pane);
        return;
      }

      const choice = choosePane(layoutRef.current, used, activePaneRef.current);
      setLayout(choice.layout);
      setSessions((previous) =>
        previous.map((session) =>
          session.pane === choice.pane ? { ...session, pane: null } : session,
        ),
      );
      setFileSessions((previous) => [
        ...previous.map((session) =>
          session.pane === choice.pane ? { ...session, pane: null } : session,
        ),
        {
          id: newSessionId(),
          serverId,
          serverName: serverName ?? null,
          path: null,
          pane: choice.pane,
          epoch: 0,
        },
      ]);
      setActivePane(choice.pane);
    },
    [],
  );

  /** Riporta in primo piano una sessione file ridotta, ricaricandola. */
  const selectFile = useCallback((id: string) => {
    const current = fileSessionsRef.current;
    const session = current.find((item) => item.id === id);
    if (!session) return;
    const choice =
      session.pane !== null && session.pane < layoutRef.current
        ? { pane: session.pane, layout: layoutRef.current }
        : choosePane(
            layoutRef.current,
            usedPanes(sessionsRef.current, current),
            activePaneRef.current,
          );
    setLayout(choice.layout);
    setSessions((previous) =>
      previous.map((item) =>
        item.pane === choice.pane ? { ...item, pane: null } : item,
      ),
    );
    setFileSessions((previous) =>
      previous.map((item) => {
        if (item.id === id)
          return { ...item, pane: choice.pane, epoch: item.epoch + 1 };
        return item.pane === choice.pane ? { ...item, pane: null } : item;
      }),
    );
    setActivePane(choice.pane);
    setConsoleCollapsed(false);
    setFilesOpen(false);
  }, []);

  const minimizeFileSession = useCallback((id: string) => {
    const current = fileSessionsRef.current;
    const target = current.find((session) => session.id === id);
    setFileSessions((previous) =>
      previous.map((session) =>
        session.id === id ? { ...session, pane: null } : session,
      ),
    );
    if (target?.pane == null || target.pane !== activePaneRef.current) return;
    const next = firstRenderedPane(
      sessionsRef.current,
      current.filter((session) => session.id !== id),
      layoutRef.current,
    );
    if (next !== null) setActivePane(next);
  }, []);

  const closeFileSession = useCallback((id: string) => {
    const target = fileSessionsRef.current.find((session) => session.id === id);
    setFileSessions((current) =>
      current.filter((session) => session.id !== id),
    );
    if (target?.pane != null && target.pane === activePaneRef.current) {
      const next = firstRenderedPane(
        sessionsRef.current,
        fileSessionsRef.current.filter((session) => session.id !== id),
        layoutRef.current,
      );
      if (next !== null) setActivePane(next);
    }
  }, []);

  const updateFilePath = useCallback((id: string, path: string) => {
    setFileSessions((current) => {
      const index = current.findIndex((session) => session.id === id);
      if (index < 0 || current[index].path === path) return current;
      const next = [...current];
      next[index] = { ...next[index], path };
      return next;
    });
  }, []);

  const openFiles = useCallback(
    (serverId: number | null) => {
      if (serverId === null) {
        setFilesOpen(true);
        return;
      }
      showFileSession(serverId, undefined, false);
    },
    [showFileSession],
  );

  const selectFileServer = useCallback(
    (serverId: number, serverName: string) => {
      setFilesOpen(false);
      showFileSession(serverId, serverName);
    },
    [showFileSession],
  );

  useEffect(() => {
    const clear = () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
      setSessions([]);
      setActivity({});
      setActivePane(0);
      setLauncherOpen(false);
      setExpanded(false);
      setFileSessions([]);
      setFilesOpen(false);
    };
    window.addEventListener(FILE_SESSIONS_CLEAR_EVENT, clear);
    return () => window.removeEventListener(FILE_SESSIONS_CLEAR_EVENT, clear);
  }, []);

  const api = useMemo(
    () => ({ open, hasSession, closeServer, openFiles }),
    [open, hasSession, closeServer, openFiles],
  );

  const changeLayout = useCallback((next: PaneCount) => {
    setLayout(next);
    setActivePane((current) => Math.min(current, next - 1));
    // Console e sessioni file dei pannelli rimossi restano nella barra,
    // pronte a riaprirsi.
    setSessions((current) =>
      current.map((session) =>
        session.pane !== null && session.pane >= next
          ? { ...session, pane: null }
          : session,
      ),
    );
    setFileSessions((current) =>
      current.map((session) =>
        session.pane !== null && session.pane >= next
          ? { ...session, pane: null }
          : session,
      ),
    );
  }, []);

  useEffect(() => {
    setPaneWidths(
      layout === 1
        ? [100, 0, 0]
        : layout === 2
          ? [50, 50, 0]
          : [100 / 3, 100 / 3, 100 / 3],
    );
  }, [layout]);

  const paneWidth = (index: number) => (layout === 1 ? 100 : paneWidths[index]);
  const paneLeft = (index: number) => {
    let left = 0;
    for (let item = 0; item < index; item += 1) left += paneWidth(item);
    return left;
  };

  const startPaneResize = (
    index: number,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    const container = panesRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const move = (pointer: PointerEvent) => {
      const percent = ((pointer.clientX - rect.left) / rect.width) * 100;
      setPaneWidths((current) => {
        const before = current
          .slice(0, index)
          .reduce((total, value) => total + value, 0);
        const pair = current[index] + current[index + 1];
        const first = Math.min(
          Math.max(percent - before, MIN_PANE_PERCENT),
          pair - MIN_PANE_PERCENT,
        );
        const next = [...current] as PaneWidths;
        next[index] = first;
        next[index + 1] = pair - first;
        return next;
      });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  const nudgePane = (
    index: number,
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const delta =
      event.key === "ArrowLeft" ? -4 : event.key === "ArrowRight" ? 4 : 0;
    if (delta === 0) return;
    event.preventDefault();
    setPaneWidths((current) => {
      const pair = current[index] + current[index + 1];
      const first = Math.min(
        Math.max(current[index] + delta, MIN_PANE_PERCENT),
        pair - MIN_PANE_PERCENT,
      );
      const next = [...current] as PaneWidths;
      next[index] = first;
      next[index + 1] = pair - first;
      return next;
    });
  };

  const startHeightResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (expanded) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = dockHeight;
    let latest = startHeight;
    const move = (pointer: PointerEvent) => {
      latest = Math.min(
        Math.max(startHeight + (startY - pointer.clientY), MIN_DOCK_PX),
        Math.max(MIN_DOCK_PX, window.innerHeight - HEADER_PX - DOCK_BAR_PX),
      );
      setDockHeight(latest);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      persistDockHeight(latest);
      setDockHeight(latest);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  const renderedSessions = sessions.filter(
    (session) => session.pane !== null && session.pane < layout,
  );
  const renderedFiles = fileSessions.filter(
    (session) => session.pane !== null && session.pane < layout,
  );
  const activeSession = sessions.find(
    (session) =>
      session.pane === activePane &&
      session.pane !== null &&
      session.pane < layout,
  );
  const dockOpen =
    (renderedSessions.length > 0 || renderedFiles.length > 0) &&
    !consoleCollapsed;
  const paddedHeight = dockOpen
    ? expanded
      ? "calc(100vh - 4rem)"
      : `${dockHeight + DOCK_BAR_PX}px`
    : "2.75rem";
  const panelHeight = expanded
    ? "calc(100vh - 4rem - 2.75rem)"
    : `${dockHeight}px`;
  const serverById = (serverId: number) =>
    serverList.find((server) => server.id === serverId) ?? null;
  const fileSessionName = (session: FileSession) =>
    session.serverName ??
    serverById(session.serverId)?.name ??
    `#${session.serverId}`;
  const fileOrdinal = (session: FileSession) =>
    ordinalSuffix(
      fileSessions
        .filter((item) => item.serverId === session.serverId)
        .findIndex((item) => item.id === session.id),
    );
  const fileSessionLabel = (session: FileSession) => {
    const server = serverById(session.serverId);
    return [
      t("files.tabPrefix"),
      `${fileSessionName(session)}${fileOrdinal(session)}`,
      server?.ipAddress,
      server?.fileTransferProtocol?.toUpperCase(),
    ]
      .filter(Boolean)
      .join(" · ");
  };
  const consoleOrdinal = (session: Session) =>
    ordinalSuffix(
      sessions
        .filter((item) => item.serverId === session.serverId)
        .findIndex((item) => item.id === session.id),
    );
  const sessionLabel = (session: Session) =>
    [session.serverName, session.ipAddress, session.hostname]
      .filter(Boolean)
      .join(" · ") + consoleOrdinal(session);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--console-dock-height",
      paddedHeight,
    );
    return () => {
      document.documentElement.style.removeProperty("--console-dock-height");
    };
  }, [paddedHeight]);

  return (
    <ConsoleContext.Provider value={api}>
      {children}

      <div
        hidden={!dockOpen}
        className={
          dockOpen
            ? "pointer-events-none fixed inset-x-0 bottom-11 z-30 px-2"
            : "hidden"
        }
        style={{ height: panelHeight }}
      >
        <div className="flex h-full min-h-0 flex-col">
          <hr
            aria-label={t("console.resizeHeight")}
            onPointerDown={startHeightResize}
            className={`pointer-events-auto m-0 h-2 shrink-0 border-0 ${
              expanded ? "cursor-default" : "cursor-row-resize"
            }`}
            title={t("console.resizeHeight")}
          />
          <div
            ref={panesRef}
            data-testid="console-panes"
            className="pointer-events-auto relative min-h-0 flex-1"
          >
            {Array.from({ length: layout }, (_, index) => {
              const occupied = [...renderedSessions, ...renderedFiles].some(
                (session) => session.pane === index,
              );
              if (occupied) return null;
              return (
                <div
                  key={`empty-pane-${PANE_KEYS[index]}`}
                  data-testid={`console-empty-pane-${index}`}
                  style={{
                    position: "absolute",
                    left: `${paneLeft(index)}%`,
                    width: `${paneWidth(index)}%`,
                    top: 0,
                    bottom: 0,
                    padding: "0 0.25rem",
                  }}
                >
                  <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-950/70 p-3 text-xs text-slate-400">
                    <span>{t("console.emptyPane")}</span>
                    <select
                      aria-label={t("console.choosePane")}
                      value=""
                      onChange={(event) => {
                        const value = event.target.value;
                        if (!value) return;
                        const separator = value.indexOf(":");
                        const kind =
                          value.slice(0, separator) === "files"
                            ? "files"
                            : "console";
                        assignPane(kind, value.slice(separator + 1), index);
                      }}
                      className="max-w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                    >
                      <option value="">{t("console.choosePane")}</option>
                      {sessions.map((session) => (
                        <option
                          key={`console-${session.id}`}
                          value={`console:${session.id}`}
                        >
                          {t("console.label")} · {sessionLabel(session)}
                        </option>
                      ))}
                      {fileSessions.map((session) => (
                        <option
                          key={`files-${session.id}`}
                          value={`files:${session.id}`}
                        >
                          {t("files.label")} · {fileSessionName(session)}
                          {fileOrdinal(session)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}

            {sessions.map((session) => {
              const shown = session.pane !== null && session.pane < layout;
              return (
                <div
                  key={session.id}
                  data-testid={`console-pane-${session.id}`}
                  hidden={!shown}
                  className="min-w-0 overflow-hidden"
                  style={
                    shown
                      ? {
                          position: "absolute",
                          left: `${paneLeft(session.pane ?? 0)}%`,
                          width: `${paneWidth(session.pane ?? 0)}%`,
                          top: 0,
                          bottom: 0,
                          padding: "0 0.25rem",
                        }
                      : undefined
                  }
                >
                  <ConsoleModal
                    serverId={session.serverId}
                    serverName={`${session.serverName}${consoleOrdinal(session)}`}
                    visible={shown}
                    active={shown && session.id === activeSession?.id}
                    closing={session.closing}
                    resumeId={session.resumeId}
                    pane={session.pane ?? 0}
                    paneCount={layout}
                    onMovePane={(pane) =>
                      assignPane("console", session.id, pane)
                    }
                    onSessionId={(resumeId) => attach(session.id, resumeId)}
                    onData={() => observeData(session.id)}
                    onActivate={() => setActivePane(session.pane ?? 0)}
                    onMinimize={() => minimize(session.id)}
                    onClose={() => remove(session.id)}
                  />
                </div>
              );
            })}

            {fileSessions.map((session) => {
              const shown = session.pane !== null && session.pane < layout;
              return (
                <div
                  key={`${session.id}-${session.epoch}`}
                  data-testid={`file-pane-${session.id}`}
                  hidden={!shown}
                  className="min-w-0 overflow-hidden"
                  style={
                    shown
                      ? {
                          position: "absolute",
                          left: `${paneLeft(session.pane ?? 0)}%`,
                          width: `${paneWidth(session.pane ?? 0)}%`,
                          top: 0,
                          bottom: 0,
                          padding: "0 0.25rem",
                        }
                      : undefined
                  }
                >
                  <FileBrowserModal
                    embedded
                    open
                    serverId={session.serverId}
                    initialPath={session.path}
                    active={shown && session.pane === activePane}
                    pane={session.pane ?? 0}
                    paneCount={layout}
                    onMovePane={(pane) => assignPane("files", session.id, pane)}
                    onActivate={() => setActivePane(session.pane ?? 0)}
                    onPathChange={(path) => updateFilePath(session.id, path)}
                    onClose={() => minimizeFileSession(session.id)}
                    onCloseSession={() => closeFileSession(session.id)}
                  />
                </div>
              );
            })}

            {layout > 1 &&
              Array.from({ length: layout - 1 }, (_, index) => (
                <hr
                  key={`pane-divider-${PANE_KEYS[index]}`}
                  aria-orientation="vertical"
                  aria-label={t("console.resizePanes")}
                  aria-valuemin={MIN_PANE_PERCENT}
                  aria-valuemax={100 - MIN_PANE_PERCENT}
                  aria-valuenow={Math.round(paneWidths[index])}
                  tabIndex={0}
                  onPointerDown={(event) => startPaneResize(index, event)}
                  onKeyDown={(event) => nudgePane(index, event)}
                  style={{ left: `${paneLeft(index + 1)}%` }}
                  className="pointer-events-auto absolute inset-y-0 z-10 m-0 w-2 -translate-x-1/2 cursor-col-resize rounded border-0 bg-slate-700/50 hover:bg-emerald-500/60 focus:bg-emerald-500/60 focus:outline-none"
                  title={t("console.resizePanes")}
                />
              ))}
          </div>
        </div>
      </div>

      <div className="console-footer fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white text-slate-900">
        <div className="relative flex h-11 items-center gap-1 px-2">
          <span className="shrink-0 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
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
                ? "bg-slate-200 text-slate-900"
                : "text-slate-500 hover:text-slate-900"
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
              <div className="absolute bottom-full left-2 z-50 mb-1 w-96 rounded-lg border border-slate-200 bg-white p-2 text-slate-900 shadow-xl">
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
                        open(server.id, server.name, {
                          ipAddress: server.ipAddress,
                          hostname: server.hostname,
                          environment: server.providerEnvironmentLabel,
                        });
                        setLauncherOpen(false);
                        setLauncherQuery("");
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                    >
                      <span className="min-w-0 truncate">
                        <span className="block truncate font-medium">
                          {server.name}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-slate-500">
                          {[
                            server.ipAddress,
                            server.hostname,
                            server.providerEnvironmentLabel,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-slate-500">
                        {server.sshPort}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {sessions.map((session) => {
              const label = sessionLabel(session);
              return (
                <div
                  key={session.id}
                  className={`flex shrink-0 items-center rounded ${
                    session.id === activeSession?.id ? "bg-slate-100" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => select(session.id)}
                    title={label}
                    aria-label={t("console.openSession", { name: label })}
                    className="flex items-center gap-1.5 py-1.5 pr-1 pl-2 text-xs"
                  >
                    <ActivityDot state={activity[session.id] ?? "idle"} />
                    <span className="max-w-[16rem] truncate">{label}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={t("console.closeSession", { name: label })}
                    title={t("console.closeSession", { name: label })}
                    onClick={() => close(session.id)}
                    className="px-1.5 py-1 text-slate-500 hover:text-slate-900"
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {fileSessions.map((session) => {
              const name = `${fileSessionName(session)}${fileOrdinal(session)}`;
              const label = fileSessionLabel(session);
              const shown = session.pane !== null && session.pane < layout;
              return (
                <div
                  key={`files-${session.id}`}
                  data-testid={`file-tab-${session.id}`}
                  className={`flex shrink-0 items-center rounded ${
                    shown && session.pane === activePane ? "bg-slate-100" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectFile(session.id)}
                    title={label}
                    aria-label={t("files.openSession", { name })}
                    className="flex items-center gap-1.5 py-1.5 pr-1 pl-2 text-xs"
                  >
                    <FolderIcon
                      className={`h-3.5 w-3.5 shrink-0 ${
                        shown ? "text-amber-400" : "text-slate-500"
                      }`}
                      aria-hidden="true"
                    />
                    <span
                      className={`max-w-[16rem] truncate ${
                        shown ? "" : "text-slate-500"
                      }`}
                    >
                      {label}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={t("files.closeSession", { name })}
                    title={t("files.closeSession", { name })}
                    onClick={() => closeFileSession(session.id)}
                    className="px-1.5 py-1 text-slate-500 hover:text-slate-900"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => openFiles(null)}
              aria-label={t("files.open")}
              title={t("files.open")}
              className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-slate-500 hover:text-slate-900"
            >
              <FolderArrowDownIcon className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t("files.label")}</span>
            </button>
            {sessions.length + fileSessions.length > 0 && (
              <>
                <fieldset
                  aria-label={t("console.layout")}
                  className="m-0 flex items-center gap-0.5 rounded border border-slate-300 p-0.5"
                >
                  {([1, 2, 3] as const).map((count) => (
                    <button
                      key={count}
                      type="button"
                      aria-label={t(
                        count === 1
                          ? "console.layout1"
                          : count === 2
                            ? "console.layout2"
                            : "console.layout3",
                      )}
                      aria-pressed={layout === count}
                      onClick={() => changeLayout(count)}
                      className={`h-5 w-5 rounded text-[11px] ${
                        layout === count
                          ? "bg-slate-200 text-slate-900"
                          : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </fieldset>
                <button
                  type="button"
                  onClick={() => {
                    focusConsole();
                    setExpanded((value) => !value);
                  }}
                  aria-label={
                    expanded ? t("console.collapse") : t("console.expand")
                  }
                  aria-pressed={expanded}
                  title={expanded ? t("console.collapse") : t("console.expand")}
                  className={`rounded p-1 ${
                    expanded
                      ? "bg-slate-200 text-slate-900"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {expanded ? (
                    <ArrowsPointingInIcon
                      className="h-4 w-4"
                      aria-hidden="true"
                    />
                  ) : (
                    <ArrowsPointingOutIcon
                      className="h-4 w-4"
                      aria-hidden="true"
                    />
                  )}
                </button>
                <button
                  type="button"
                  aria-label={
                    consoleCollapsed
                      ? t("console.restore")
                      : t("console.minimize")
                  }
                  title={
                    consoleCollapsed
                      ? t("console.restore")
                      : t("console.minimize")
                  }
                  onClick={() => {
                    if (consoleCollapsed) focusConsole();
                    else setConsoleCollapsed(true);
                  }}
                  disabled={
                    renderedSessions.length === 0 && renderedFiles.length === 0
                  }
                  className="rounded p-1 text-slate-500 hover:text-slate-900 disabled:opacity-40"
                >
                  {consoleCollapsed ? (
                    <ChevronUpIcon className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {filesOpen && (
        <FileBrowserModal
          open
          serverId={null}
          onServerSelected={selectFileServer}
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
