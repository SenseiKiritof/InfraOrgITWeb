import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
  DocumentIcon,
  EyeIcon,
  EyeSlashIcon,
  FolderIcon,
  FolderPlusIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  type ChangeEvent,
  type FormEvent,
  type DragEvent as ReactDragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import { SortableTh } from "../../components/SortableTh";
import { ApiError } from "../../lib/api";
import { subscribeDesktopMessages } from "../../lib/desktopBridge";
import {
  type DesktopDownloadRoute,
  desktopDownloads,
} from "../../lib/desktopDownloads";
import { desktopDownloadFile } from "../../lib/desktopFiles";
import { resolveDesktopRemote } from "../../lib/desktopRemote";
import { formatBytes, formatDateTime } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import type { Server } from "../../lib/inventory";
import { paged } from "../../lib/inventory";
import {
  assignFileTransfer,
  createServerDirectory,
  defaultFileTransferPort,
  deleteServerFile,
  type FileTransferProtocol,
  getCredentials,
  listServerFiles,
  type RemoteFileEntry,
  renameServerFile,
  type ServerCredential,
  serverFileDownloadUrl,
  uploadServerFile,
} from "../../lib/remote";
import { nextSort, type SortState, sortedRows } from "../../lib/sort";
import { fetchServerAccess } from "../../lib/useServerAccess";

/** Filtro file: nome, estensione o tipo (cartella/file). */
export function matchesFileFilter(
  entry: RemoteFileEntry,
  rawFilter: string,
): boolean {
  const filter = rawFilter.trim().toLocaleLowerCase();
  if (!filter) return true;
  if (entry.name.toLocaleLowerCase().includes(filter)) return true;
  if (entry.isDirectory)
    return ["cartella", "folder", "directory", "dir"].some((word) =>
      word.includes(filter),
    );
  const extension = fileExtension(entry.name);
  return ["file", extension].some((type) => type.includes(filter));
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLocaleLowerCase() : "";
}

/** Cartella che contiene il percorso indicato ("/" se è già la radice). */
function parentOf(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

function serverMatches(server: Server, rawQuery: string): boolean {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return true;
  return [
    server.name,
    server.ipAddress,
    server.hostname,
    server.providerEnvironmentLabel,
  ]
    .filter(Boolean)
    .some((field) => field.toLocaleLowerCase().includes(query));
}

/** Preferenza locale: i file che iniziano con "." sono visibili di default. */
export const HIDDEN_FILES_STORAGE_KEY = "infraorgit-files-show-hidden";

function storedShowHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_FILES_STORAGE_KEY) !== "0";
  } catch {
    // storage non disponibile: restano visibili
    return true;
  }
}

/** Pannello file SFTP/FTPS/FTP dei server configurati. */
export function FileBrowserModal({
  open,
  serverId,
  initialPath = null,
  onPathChange,
  onServerSelected,
  onClose,
  onCloseSession,
  embedded = false,
  pane,
  paneCount,
  onMovePane,
  onActivate,
  active = false,
  serverList,
  adminEnvironmentIds,
  serverListLoading,
  systemAdmin,
  onServerUpdated,
}: {
  open: boolean;
  serverId: number | null;
  /** Percorso da ripristinare; null parte dalla home restituita dal server. */
  initialPath?: string | null;
  onPathChange?: (path: string) => void;
  /** Solo in modalità scelta server: apre la sessione del server indicato. */
  onServerSelected?: (serverId: number, serverName: string) => void;
  /** Nasconde il pannello lasciando viva la sessione. */
  onClose: () => void;
  /** Chiude e distrugge la sessione file. */
  onCloseSession?: () => void;
  /** Renderizza il pannello dentro un contenitore del padre invece della barra console. */
  embedded?: boolean;
  /** Indice del pannello occupato dalla sessione file. */
  pane?: number;
  /** Numero di pannelli disponibili quando il pannello è agganciato. */
  paneCount?: number;
  /** Sposta la sessione file nel pannello indicato. */
  onMovePane?: (pane: number) => void;
  /** Segnala al padre che il pannello è stato attivato. */
  onActivate?: () => void;
  /** Evidenzia il pannello attivo. */
  active?: boolean;
  /** Inventario già caricato dal provider: evita richieste duplicate. */
  serverList?: Server[];
  adminEnvironmentIds?: number[];
  serverListLoading?: boolean;
  systemAdmin?: boolean;
  /** Notifica il provider dopo un salvataggio della configurazione file. */
  onServerUpdated?: (serverId: number, patch: Partial<Server>) => void;
}) {
  const { t, language } = useI18n();
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const [selectedId, setSelectedId] = useState<number | null>(serverId);
  const [path, setPath] = useState<string | null>(initialPath);
  const [filter, setFilter] = useState("");
  const [serverQuery, setServerQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloadRoute, setDownloadRoute] =
    useState<DesktopDownloadRoute>("normal");
  const [downloadNote, setDownloadNote] = useState<{
    text: string;
    tone: "info" | "warning";
  } | null>(null);
  const [localServers, setLocalServers] = useState<Server[]>([]);
  const [localAdminIds, setLocalAdminIds] = useState<number[]>([]);
  const [localSystemAdmin, setLocalSystemAdmin] = useState(false);
  const [localLoadingServers, setLocalLoadingServers] = useState(false);
  const [directFiles, setDirectFiles] = useState(false);
  const servers = serverList ?? localServers;
  const adminIds = adminEnvironmentIds ?? localAdminIds;
  const isSystemAdmin = systemAdmin ?? localSystemAdmin;
  const loadingServers = serverListLoading ?? localLoadingServers;
  const [entries, setEntries] = useState<RemoteFileEntry[]>([]);
  const [sort, setSort] = useState<SortState>(null);
  const [showHidden, setShowHidden] = useState(storedShowHidden);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    done: number;
    total: number;
    name: string;
  } | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadErrorCode, setLoadErrorCode] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [configOpen, setConfigOpen] = useState(false);
  const [configProtocol, setConfigProtocol] =
    useState<FileTransferProtocol>("Sftp");
  const [configPort, setConfigPort] = useState("22");
  const [configCredentialId, setConfigCredentialId] = useState("");
  const [credentials, setCredentials] = useState<ServerCredential[]>([]);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSaving, setConfigSaving] = useState(false);
  const upload = useRef<HTMLInputElement | null>(null);
  const filterInput = useRef<HTMLInputElement | null>(null);
  const adoptedPath = useRef<string | null>(null);
  const loadedPath = useRef<string | null>(null);

  useEffect(() => {
    if (open && serverId !== null) filterInput.current?.focus();
  }, [open, serverId]);

  useEffect(() => {
    if (!open || selectedId === null) {
      setDirectFiles(false);
      return;
    }
    let active = true;
    void resolveDesktopRemote(selectedId)
      .then((transport) => {
        if (active) setDirectFiles(transport === "client");
      })
      .catch(() => {
        if (active) setDirectFiles(false);
      });
    return () => {
      active = false;
    };
  }, [open, selectedId]);

  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_FILES_STORAGE_KEY, showHidden ? "1" : "0");
    } catch {
      // storage non disponibile: la preferenza vale per la sessione
    }
  }, [showHidden]);

  useEffect(() => {
    if (open) setSelectedId(serverId);
  }, [open, serverId]);

  useEffect(() => {
    if (open) return;
    setConfigOpen(false);
    setConfigError(null);
  }, [open]);

  // Esc svuota prima il filtro, poi chiude il pannello. Backspace risale di
  // una cartella, tranne quando il focus è in un campo di testo.
  useEffect(() => {
    if (!open) return;
    // Nel dock solo il pannello attivo riceve Esc/Backspace: quelli nascosti
    // restano montati e non devono reagire alle scorciatoie globali.
    if (embedded && !active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (!configOpen && serverId !== null && filter) {
          event.preventDefault();
          setFilter("");
          return;
        }
        onClose();
        return;
      }
      if (event.key !== "Backspace" || configOpen) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const tag =
        target instanceof HTMLElement ? target.tagName.toLocaleLowerCase() : "";
      if (
        tag === "input" ||
        tag === "select" ||
        tag === "textarea" ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (path === null || path === "/" || busy) return;
      event.preventDefault();
      event.stopPropagation();
      setPath(parentOf(path));
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    open,
    embedded,
    active,
    onClose,
    filter,
    path,
    busy,
    configOpen,
    serverId,
  ]);

  const previousServer = useRef(selectedId);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDownloadRoute("normal");
    setDownloadNote(null);
    setSelectedPaths([]);
    void desktopDownloads
      .resolveRoute()
      .then((route) => {
        if (!cancelled) setDownloadRoute(route);
      })
      .catch(() => {
        if (!cancelled) setDownloadRoute("normal");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return subscribeDesktopMessages((message) => {
      if (message.type !== "desktop.download.status") return;
      const name =
        typeof message.fileName === "string" && message.fileName
          ? message.fileName
          : t("files.title");
      const state = typeof message.state === "string" ? message.state : "";
      if (state === "completed") {
        setDownloadNote({
          text: t("files.downloadDone", { name }),
          tone: "info",
        });
        return;
      }
      if (state === "failed" || state === "cancelled") {
        setDownloadNote({
          text: t("files.downloadFailed", { name }),
          tone: "warning",
        });
        return;
      }
      const total =
        typeof message.totalBytes === "number" ? message.totalBytes : 0;
      const received =
        typeof message.receivedBytes === "number" ? message.receivedBytes : 0;
      setDownloadNote({
        text:
          total > 0
            ? t("files.downloading", {
                name,
                percent: Math.min(100, Math.round((received / total) * 100)),
              })
            : t("files.downloadingUnknown", { name }),
        tone: "info",
      });
    });
  }, [open, t]);

  useEffect(() => {
    if (previousServer.current === selectedId) return;
    previousServer.current = selectedId;
    // Cambiando server si riparte dalla home, non dal percorso del precedente.
    setPath(null);
    setFilter("");
    setEntries([]);
    setSelectedPaths([]);
    loadedPath.current = null;
    setLoadError(null);
    setLoadErrorCode(null);
    setActionError(null);
    setConfigOpen(false);
  }, [selectedId]);

  const notifyPath = useRef(onPathChange);
  notifyPath.current = onPathChange;
  useEffect(() => {
    if (path !== null) notifyPath.current?.(path);
  }, [path]);

  // La selezione vale per la cartella aperta: cambiando percorso o server
  // riparte vuota, e non sopravvive alle righe sparite da un nuovo elenco.
  // biome-ignore lint/correctness/useExhaustiveDependencies: si azzera al cambio di percorso/server
  useEffect(() => {
    setSelectedPaths([]);
  }, [path, selectedId]);

  useEffect(() => {
    setSelectedPaths((current) => {
      if (current.length === 0) return current;
      const present = new Set(entries.map((entry) => entry.path));
      const next = current.filter((value) => present.has(value));
      return next.length === current.length ? current : next;
    });
  }, [entries]);

  // Filtro e file nascosti cambiano ciò che l'utente vede: una selezione
  // invisibile non deve finire in un'eliminazione di massa.
  // biome-ignore lint/correctness/useExhaustiveDependencies: si azzera quando cambia ciò che è visibile
  useEffect(() => {
    setSelectedPaths([]);
  }, [filter, showHidden]);

  useEffect(() => {
    if (!open) return;
    // Il provider del dock passa già inventario e permessi: niente richieste
    // duplicate per ogni pannello file.
    if (serverList !== undefined) return;
    let cancelled = false;
    setLocalLoadingServers(true);
    Promise.all([paged<Server>("/api/servers"), fetchServerAccess()])
      .then(([page, serverAccess]) => {
        if (cancelled) return;
        setLocalServers(page.items);
        setLocalAdminIds(serverAccess.adminEnvironmentIds);
        setLocalSystemAdmin(serverAccess.isSystemAdmin);
      })
      .catch(() => {
        if (!cancelled) {
          setLocalServers([]);
          setLocalAdminIds([]);
          setLocalSystemAdmin(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLocalLoadingServers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, serverList]);

  const available = useMemo(
    () =>
      servers
        .filter((server) => adminIds.includes(server.providerEnvironmentId))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [servers, adminIds],
  );
  const filteredAvailable = useMemo(
    () => available.filter((server) => serverMatches(server, serverQuery)),
    [available, serverQuery],
  );
  const server = available.find((item) => item.id === selectedId) ?? null;
  const visibleEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (showHidden || !entry.name.startsWith(".")) &&
          matchesFileFilter(entry, filter),
      ),
    [entries, filter, showHidden],
  );
  const orderedEntries = useMemo(
    () =>
      sortedRows(visibleEntries, sort, (entry, key) => {
        if (key === "name") return entry.name;
        if (key === "size") return entry.isDirectory ? null : entry.size;
        if (key === "modified") return entry.modifiedUtc;
        return null;
      }) ?? [],
    [visibleEntries, sort],
  );
  const selectedSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);
  const selectedEntries = useMemo(
    () => entries.filter((entry) => selectedSet.has(entry.path)),
    [entries, selectedSet],
  );
  const allSelected =
    orderedEntries.length > 0 &&
    orderedEntries.every((entry) => selectedSet.has(entry.path));
  const protocolMissing =
    Boolean(server && !server.fileTransferProtocol) ||
    loadErrorCode === "file_transfer_not_configured";
  const credentialMissing =
    !protocolMissing && loadErrorCode === "credential_missing";
  const fileConfigNeeded = protocolMissing || credentialMissing;
  const credentialChoices =
    configProtocol === "Sftp"
      ? credentials
      : credentials.filter((item) => item.authType === "Password");
  const sshOption = configProtocol === "Sftp" && Boolean(server?.credentialId);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey ricarica la cartella
  useEffect(() => {
    if (!open || selectedId === null) return;
    if (!server?.fileTransferProtocol) {
      setLoadingFiles(false);
      setEntries([]);
      setLoadError(null);
      setLoadErrorCode(null);
      loadedPath.current = null;
      return;
    }
    // La home appena restituita dal server è già stata elencata: non serve
    // ripetere la richiesta con il path esplicito.
    if (path !== null && adoptedPath.current === path) {
      adoptedPath.current = null;
      return;
    }
    let cancelled = false;
    // Un refresh mantiene le righe; un cambio cartella no, altrimenti si
    // vedrebbero i file vecchi sotto il nuovo percorso.
    if (loadedPath.current !== path) setEntries([]);
    setLoadingFiles(true);
    setLoadError(null);
    setLoadErrorCode(null);
    listServerFiles(selectedId, path)
      .then((listing) => {
        if (cancelled) return;
        loadedPath.current = listing.path;
        setEntries(listing.items);
        if (listing.path !== path) {
          adoptedPath.current = listing.path;
          setPath(listing.path);
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        // Un refresh fallito non deve svuotare la lista già visibile.
        setLoadErrorCode(cause instanceof ApiError ? cause.code : null);
        setLoadError(
          cause instanceof Error ? cause.message : t("files.failed"),
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingFiles(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, selectedId, path, server?.fileTransferProtocol, reloadKey]);

  const refresh = () => {
    setReloadKey((value) => value + 1);
  };

  const openCredentials = () => {
    setConfigOpen(false);
    onClose();
  };

  const openFileConfig = () => {
    if (!server) return;
    const protocol = server.fileTransferProtocol ?? "Sftp";
    setConfigProtocol(protocol);
    setConfigPort(
      String(server.fileTransferPort ?? defaultFileTransferPort(protocol)),
    );
    setConfigCredentialId(
      server.fileTransferCredentialId
        ? String(server.fileTransferCredentialId)
        : protocol === "Sftp" && server.credentialId
          ? "ssh"
          : "",
    );
    setConfigError(null);
    setConfigOpen(true);
    setCredentials([]);
    setCredentialsLoading(true);
    getCredentials()
      .then((page) => setCredentials(page.items))
      .catch((cause) => {
        setConfigError(
          cause instanceof Error ? cause.message : t("common.operationError"),
        );
      })
      .finally(() => setCredentialsLoading(false));
  };

  const saveFileConfig = async (event: FormEvent) => {
    event.preventDefault();
    if (!server || !csrf) return;
    const port = Number(configPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setConfigError(t("files.portInvalid"));
      return;
    }
    const useSsh = configCredentialId === "ssh";
    if (useSsh && (!server.credentialId || configProtocol !== "Sftp")) {
      setConfigError(t("files.credentialRequired"));
      return;
    }
    const parsedCredentialId = Number(configCredentialId);
    const credentialId = useSsh ? null : parsedCredentialId;
    if (
      !useSsh &&
      (!Number.isInteger(parsedCredentialId) || parsedCredentialId <= 0)
    ) {
      setConfigError(t("files.credentialRequired"));
      return;
    }
    const credential = useSsh
      ? null
      : credentialChoices.find((item) => item.id === credentialId);
    if (!useSsh && !credential) {
      setConfigError(t("files.credentialRequired"));
      return;
    }

    setConfigSaving(true);
    setConfigError(null);
    try {
      await assignFileTransfer(
        server.id,
        {
          protocol: configProtocol,
          port,
          credentialId,
        },
        csrf,
      );
      const patch = {
        fileTransferProtocol: configProtocol,
        fileTransferPort: port,
        fileTransferCredentialId: credentialId,
        fileTransferCredentialName: credential?.name ?? null,
      };
      setLocalServers((current) =>
        current.map((item) =>
          item.id === server.id ? { ...item, ...patch } : item,
        ),
      );
      onServerUpdated?.(server.id, patch);
      setConfigOpen(false);
      setLoadError(null);
      setLoadErrorCode(null);
      setPath(null);
      setReloadKey((value) => value + 1);
    } catch (cause) {
      setConfigError(
        cause instanceof Error ? cause.message : t("common.operationError"),
      );
    } finally {
      setConfigSaving(false);
    }
  };

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      refresh();
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : t("files.failed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const addDirectory = () => {
    if (selectedId === null || path === null || loadingFiles) return;
    const name = window.prompt(t("files.newFolderPrompt"));
    if (!name?.trim()) return;
    void run(() =>
      createServerDirectory(selectedId, join(path, name.trim()), csrf),
    );
  };

  const canUpload =
    Boolean(server?.fileTransferProtocol) &&
    selectedId !== null &&
    path !== null &&
    !busy &&
    !loadingFiles;

  const uploadFiles = async (files: File[]) => {
    if (
      !canUpload ||
      selectedId === null ||
      path === null ||
      files.length === 0
    )
      return;
    setBusy(true);
    setActionError(null);
    try {
      for (const [index, file] of files.entries()) {
        setUploadStatus({
          done: index,
          total: files.length,
          name: file.name,
        });
        await uploadServerFile(selectedId, path, file, csrf);
      }
      await refresh();
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : t("files.failed"),
      );
    } finally {
      setBusy(false);
      setUploadStatus(null);
    }
  };

  const uploadFile = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void uploadFiles(files);
  };

  const dragDepth = useRef(0);
  const hasFiles = (event: ReactDragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes("Files");
  const onDragEnter = (event: ReactDragEvent) => {
    if (!canUpload || !hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDraggingFiles(true);
  };
  const onDragOver = (event: ReactDragEvent) => {
    if (!canUpload || !hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = (event: ReactDragEvent) => {
    if (!canUpload || !hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDraggingFiles(false);
  };
  const onDrop = (event: ReactDragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDraggingFiles(false);
    if (!canUpload) {
      setActionError(t("files.dropUnavailable"));
      return;
    }
    void uploadFiles(Array.from(event.dataTransfer.files));
  };

  const rename = (entry: RemoteFileEntry) => {
    if (selectedId === null) return;
    const name = window.prompt(t("files.renamePrompt"), entry.name);
    if (!name?.trim() || name.trim() === entry.name) return;
    void run(() =>
      renameServerFile(
        selectedId,
        entry.path,
        name.trim(),
        entry.isDirectory,
        csrf,
      ),
    );
  };

  const remove = (entry: RemoteFileEntry) => {
    if (selectedId === null) return;
    if (!window.confirm(t("files.deleteConfirm", { name: entry.name }))) return;
    setSelectedPaths((current) =>
      current.filter((value) => value !== entry.path),
    );
    void run(() =>
      deleteServerFile(selectedId, entry.path, entry.isDirectory, csrf),
    );
  };

  const toggleSelected = (value: string) => {
    setSelectedPaths((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const toggleSelectAll = () => {
    setSelectedPaths((current) => {
      const visible = orderedEntries.map((entry) => entry.path);
      const all =
        visible.length > 0 && visible.every((value) => current.includes(value));
      return all
        ? current.filter((value) => !visible.includes(value))
        : Array.from(new Set([...current, ...visible]));
    });
  };

  const removeSelected = () => {
    if (selectedId === null || selectedEntries.length === 0) return;
    if (
      !window.confirm(
        t("files.bulkDeleteConfirm", { count: selectedEntries.length }),
      )
    ) {
      return;
    }
    const targets = [...selectedEntries];
    void (async () => {
      setBusy(true);
      setActionError(null);
      let failedAt = targets.length;
      try {
        // Un DELETE per riga, in sequenza: l'API non ha un endpoint di massa.
        for (const [index, entry] of targets.entries()) {
          failedAt = index;
          await deleteServerFile(
            selectedId,
            entry.path,
            entry.isDirectory,
            csrf,
          );
        }
        failedAt = targets.length;
      } catch (cause) {
        setActionError(
          cause instanceof Error ? cause.message : t("files.failed"),
        );
      } finally {
        // Tieni selezionati il file fallito e quelli non ancora tentati.
        setSelectedPaths(
          failedAt === targets.length
            ? []
            : targets.slice(failedAt).map((entry) => entry.path),
        );
        // Aggiorna anche dopo un errore parziale, senza svuotare la tabella.
        setBusy(false);
        refresh();
      }
    })();
  };

  const copyPath = async () => {
    if (path === null) return;
    try {
      await navigator.clipboard?.writeText(path);
    } catch {
      // clipboard non disponibile: nessun errore all'utente
    }
  };

  const downloadEntry = async (entry: RemoteFileEntry) => {
    if (selectedId === null || entry.isDirectory) return;
    if (directFiles) {
      const local = await desktopDownloadFile(selectedId, entry.path);
      if (local) {
        setDownloadNote(
          local.saved
            ? {
                text: t("files.downloadDone", { name: entry.name }),
                tone: "info",
              }
            : null,
        );
        return;
      }
    }
    const url = serverFileDownloadUrl(selectedId, entry.path);
    // Native e web: navigazione normale, il webview desktop la intercetta.
    if (downloadRoute !== "bridge") {
      window.location.assign(url);
      return;
    }
    setDownloadNote({ text: t("desktopDownload.sending"), tone: "info" });
    const sent = await desktopDownloads.sendServerFile({
      serverId: selectedId,
      path: entry.path,
      filename: entry.name,
      csrfToken: csrf,
    });
    if (sent) {
      setDownloadNote({ text: t("desktopDownload.sent"), tone: "info" });
      return;
    }
    setDownloadNote({ text: t("desktopDownload.failed"), tone: "warning" });
    window.location.assign(url);
  };

  if (!open) return null;

  const segments = (path ?? "/").split("/").filter(Boolean);

  const frameClass = embedded
    ? "h-full min-h-0 w-full"
    : "fixed inset-x-0 bottom-11 z-40 px-2";
  const panelClass = [
    "relative flex w-full flex-col rounded-lg border bg-white text-slate-900",
    embedded ? "h-full min-h-0" : "h-[60vh] shadow-2xl",
    active
      ? "border-emerald-400 ring-1 ring-emerald-400/60"
      : "border-slate-200",
  ].join(" ");

  if (serverId === null) {
    return (
      <div className={frameClass}>
        <div
          role="dialog"
          aria-label={t("files.chooseServer")}
          className={panelClass}
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              {t("files.chooseServer")}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              title={t("common.close")}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="border-b border-slate-200 px-4 py-3">
            <label className="flex items-center gap-2 rounded-md border border-slate-300 px-2 py-1.5">
              <MagnifyingGlassIcon
                className="h-4 w-4 shrink-0 text-slate-400"
                aria-hidden="true"
              />
              <input
                // biome-ignore lint/a11y/noAutofocus: la ricerca è il primo campo del pannello appena aperto
                autoFocus
                value={serverQuery}
                onChange={(event) => setServerQuery(event.target.value)}
                placeholder={t("files.searchServer")}
                className="min-w-0 flex-1 text-sm outline-none"
              />
              {serverQuery && (
                <button
                  type="button"
                  aria-label={t("files.clearFilter")}
                  title={t("files.clearFilter")}
                  onClick={() => setServerQuery("")}
                  className="rounded p-0.5 text-slate-400 hover:text-slate-700"
                >
                  <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loadingServers && (
              <p className="px-2 py-3 text-sm text-slate-500">
                {t("common.loading")}
              </p>
            )}
            {!loadingServers && available.length === 0 && (
              <p className="px-2 py-3 text-sm text-slate-500">
                {t("console.noServers")}
              </p>
            )}
            {!loadingServers &&
              available.length > 0 &&
              filteredAvailable.length === 0 && (
                <p className="px-2 py-3 text-sm text-slate-500">
                  {t("files.searchServerEmpty")}
                </p>
              )}
            {filteredAvailable.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onServerSelected?.(item.id, item.name)}
                className="flex w-full items-center justify-between gap-3 rounded px-2 py-2 text-left hover:bg-slate-100"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {item.name}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-slate-500">
                    {[
                      item.ipAddress,
                      item.hostname,
                      item.providerEnvironmentLabel,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {item.fileTransferProtocol && (
                  <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">
                    {item.fileTransferProtocol.toUpperCase()}
                    {item.fileTransferPort ? ` :${item.fileTransferPort}` : ""}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={frameClass}>
      <div
        role="dialog"
        aria-label={t("files.title")}
        data-download-route={downloadRoute}
        onPointerDown={onActivate}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={panelClass}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="min-w-0 truncate text-sm font-semibold uppercase tracking-wide text-slate-600">
            {t("files.title")}
            {server && (
              <span className="ml-2 normal-case font-normal text-slate-500">
                {[server.name, server.ipAddress, server.hostname]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            {paneCount !== undefined && paneCount > 1 && onMovePane && (
              <label className="mr-1 flex items-center gap-1 text-xs text-slate-500">
                <span className="whitespace-nowrap">
                  {t("console.paneFor")}
                </span>
                <select
                  value={pane ?? 0}
                  onChange={(event) => onMovePane(Number(event.target.value))}
                  className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-700"
                >
                  {Array.from({ length: paneCount }, (_, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: i pannelli sono slot stabili identificati dall'indice
                    <option key={index} value={index}>
                      {t("console.paneLabel", { index: index + 1 })}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {onCloseSession && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t("files.hideSession", {
                  name: server?.name ?? `#${selectedId}`,
                })}
                title={t("files.hideSession", {
                  name: server?.name ?? `#${selectedId}`,
                })}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <ChevronDownIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={onCloseSession ?? onClose}
              aria-label={
                onCloseSession
                  ? t("files.closeSession", {
                      name: server?.name ?? `#${selectedId}`,
                    })
                  : t("common.close")
              }
              title={
                onCloseSession
                  ? t("files.closeSession", {
                      name: server?.name ?? `#${selectedId}`,
                    })
                  : t("common.close")
              }
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-b border-slate-200 px-4 py-3 text-sm">
          <div className="flex min-w-56 flex-col gap-1">
            <span className="text-xs text-slate-500">{t("common.server")}</span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
              {server ? `${server.name} (${server.ipAddress})` : `#${serverId}`}
            </span>
          </div>
          {server?.fileTransferProtocol && (
            <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
              {server.fileTransferProtocol}
              {server.fileTransferPort ? ` :${server.fileTransferPort}` : ""}
            </span>
          )}
          <label className="flex min-w-40 flex-1 flex-col gap-1">
            <span className="text-xs text-slate-500">{t("common.search")}</span>
            <span className="relative flex items-center">
              <input
                ref={filterInput}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t("files.filterPlaceholder")}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 pr-8"
              />
              {filter && (
                <button
                  type="button"
                  aria-label={t("files.clearFilter")}
                  title={t("files.clearFilter")}
                  onClick={() => setFilter("")}
                  className="absolute right-1 rounded p-0.5 text-slate-400 hover:text-slate-700"
                >
                  <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </span>
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPath(parentOf(path ?? "/"))}
              disabled={path === null || path === "/"}
              className="rounded-md border border-slate-300 px-2 py-1.5 disabled:opacity-40"
            >
              {t("files.up")}
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={selectedId === null || loadingFiles}
              title={loadingFiles ? t("files.refreshing") : t("files.refresh")}
              aria-label={
                loadingFiles ? t("files.refreshing") : t("files.refresh")
              }
              className="flex items-center gap-1 rounded-md border border-slate-300 p-1.5 text-sm disabled:opacity-40"
            >
              <ArrowPathIcon
                className={`h-4 w-4 ${loadingFiles ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {loadingFiles && (
                <span className="px-0.5 text-xs">{t("files.refreshing")}</span>
              )}
            </button>
            <button
              type="button"
              onClick={addDirectory}
              disabled={
                selectedId === null || path === null || busy || loadingFiles
              }
              aria-label={t("files.newFolder")}
              title={t("files.newFolder")}
              className="rounded-md border border-slate-300 p-1.5 disabled:opacity-40"
            >
              <FolderPlusIcon className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => upload.current?.click()}
              disabled={
                selectedId === null || path === null || busy || loadingFiles
              }
              aria-label={t("files.upload")}
              title={t("files.upload")}
              className="rounded-md border border-slate-300 p-1.5 disabled:opacity-40"
            >
              <ArrowUpTrayIcon className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setShowHidden((value) => !value)}
              aria-pressed={showHidden}
              aria-label={t("files.showHidden")}
              title={t("files.showHidden")}
              className={`rounded-md border p-1.5 ${
                showHidden
                  ? "border-slate-400 bg-slate-100 text-slate-900"
                  : "border-slate-300 text-slate-500"
              }`}
            >
              {showHidden ? (
                <EyeIcon className="h-4 w-4" aria-hidden="true" />
              ) : (
                <EyeSlashIcon className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <input
              ref={upload}
              type="file"
              multiple
              onChange={uploadFile}
              className="hidden"
            />
          </div>
        </div>

        {fileConfigNeeded && (
          <div
            role="alert"
            className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <p>
              {protocolMissing
                ? t("files.notConfigured")
                : t("files.credentialMissing")}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {isSystemAdmin ? (
                <>
                  <button
                    type="button"
                    onClick={openFileConfig}
                    className="rounded-md bg-amber-900 px-3 py-1.5 text-sm font-medium text-white"
                  >
                    {t("files.configureAccess")}
                  </button>
                  <Link
                    to="/credentials"
                    onClick={openCredentials}
                    className="text-xs font-medium underline"
                  >
                    {t("files.manageCredentials")}
                  </Link>
                </>
              ) : (
                <span className="text-xs">
                  {t("files.credentialAdminHint")}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-xs text-slate-600">
          <nav
            aria-label={t("files.breadcrumb")}
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto font-mono"
          >
            <button
              type="button"
              onClick={() => setPath("/")}
              aria-current={segments.length === 0 ? "page" : undefined}
              className={`shrink-0 rounded px-0.5 hover:text-slate-900 ${
                segments.length === 0 ? "font-semibold text-slate-900" : ""
              }`}
            >
              /
            </button>
            {segments.map((segment, index) => {
              const target = `/${segments.slice(0, index + 1).join("/")}`;
              const current = index === segments.length - 1;
              return (
                <span
                  key={target}
                  className="flex shrink-0 items-center gap-1 whitespace-nowrap"
                >
                  <button
                    type="button"
                    onClick={() => setPath(target)}
                    aria-current={current ? "page" : undefined}
                    className={`rounded px-0.5 hover:text-slate-900 ${
                      current ? "font-semibold text-slate-900" : ""
                    }`}
                  >
                    {segment}
                  </button>
                  {!current && <span aria-hidden="true">/</span>}
                </span>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={() => void copyPath()}
            disabled={path === null}
            aria-label={t("files.copyPath")}
            title={t("files.copyPath")}
            className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
          >
            <ClipboardDocumentIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {loadError && !fileConfigNeeded && entries.length > 0 && (
          <p
            role="alert"
            className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
          >
            {loadError}
          </p>
        )}

        {loadingFiles && entries.length > 0 && (
          <p
            role="status"
            className="border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-xs text-slate-600"
          >
            {t("files.refreshing")}
          </p>
        )}

        {selectedEntries.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
            <span aria-live="polite">
              {t("files.selectedCount", { count: selectedEntries.length })}
            </span>
            <button
              type="button"
              onClick={removeSelected}
              disabled={busy}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {t("files.bulkDelete")}
            </button>
            <button
              type="button"
              onClick={() => setSelectedPaths([])}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            >
              {t("files.clearSelection")}
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          {loadingFiles && entries.length === 0 && (
            <p className="p-6 text-sm text-slate-500">{t("common.loading")}</p>
          )}
          {!loadingFiles &&
            loadError &&
            entries.length === 0 &&
            !fileConfigNeeded && (
              <p className="p-6 text-sm text-red-700">{loadError}</p>
            )}
          {server?.fileTransferProtocol && selectedId !== null && (
            <table className="w-full text-left text-sm text-slate-900">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th scope="col" className="w-10 px-4 py-2">
                    <input
                      type="checkbox"
                      aria-label={t("files.selectAll")}
                      checked={allSelected}
                      ref={(node) => {
                        if (node) {
                          node.indeterminate =
                            selectedEntries.length > 0 && !allSelected;
                        }
                      }}
                      onChange={toggleSelectAll}
                      disabled={orderedEntries.length === 0}
                      className="h-4 w-4 accent-slate-900 disabled:opacity-40"
                    />
                  </th>
                  <SortableTh
                    label={t("common.name")}
                    sortKey="name"
                    sort={sort}
                    onSort={(key) =>
                      setSort((current) => nextSort(current, key))
                    }
                  />
                  <SortableTh
                    label={t("files.size")}
                    sortKey="size"
                    sort={sort}
                    onSort={(key) =>
                      setSort((current) => nextSort(current, key))
                    }
                  />
                  <SortableTh
                    label={t("files.modified")}
                    sortKey="modified"
                    sort={sort}
                    onSort={(key) =>
                      setSort((current) => nextSort(current, key))
                    }
                  />
                  <th className="px-4 py-2 text-right">
                    {t("common.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {orderedEntries.map((entry) => (
                  <tr
                    key={entry.path}
                    className={`border-t border-slate-100 hover:bg-slate-50 ${
                      selectedSet.has(entry.path) ? "bg-slate-50" : ""
                    }`}
                  >
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        aria-label={t("files.selectRow", { name: entry.name })}
                        checked={selectedSet.has(entry.path)}
                        onChange={() => toggleSelected(entry.path)}
                        className="h-4 w-4 accent-slate-900"
                      />
                    </td>
                    <td
                      className="px-4 py-2"
                      onDoubleClick={() => {
                        // Un file si scarica già al singolo clic; il doppio
                        // clic serve solo ad aprire una cartella.
                        if (entry.isDirectory) setPath(entry.path);
                      }}
                    >
                      <button
                        type="button"
                        draggable={!entry.isDirectory}
                        title={
                          entry.isDirectory ? entry.name : t("files.download")
                        }
                        onDragStart={(event) => {
                          if (entry.isDirectory || selectedId === null) return;
                          if (directFiles) {
                            event.preventDefault();
                            return;
                          }
                          const url = serverFileDownloadUrl(
                            selectedId,
                            entry.path,
                          );
                          event.dataTransfer.effectAllowed = "copy";
                          event.dataTransfer.setData("text/uri-list", url);
                          event.dataTransfer.setData(
                            "DownloadURL",
                            `application/octet-stream:${entry.name}:${url}`,
                          );
                        }}
                        onClick={() => {
                          if (entry.isDirectory) {
                            setPath(entry.path);
                          } else {
                            void downloadEntry(entry);
                          }
                        }}
                        className="flex max-w-[28rem] items-center gap-2 truncate text-left text-slate-900 hover:underline"
                      >
                        {entry.isDirectory ? (
                          <FolderIcon
                            className="h-4 w-4 shrink-0 text-amber-500"
                            aria-hidden="true"
                          />
                        ) : (
                          <DocumentIcon
                            className="h-4 w-4 shrink-0 text-slate-400"
                            aria-hidden="true"
                          />
                        )}
                        <span className="truncate">{entry.name}</span>
                      </button>
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {entry.isDirectory
                        ? "—"
                        : formatBytes(entry.size, language)}
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {entry.modifiedUtc
                        ? formatDateTime(entry.modifiedUtc, language)
                        : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1">
                        {!entry.isDirectory && (
                          <a
                            href={serverFileDownloadUrl(selectedId, entry.path)}
                            aria-label={t("files.download")}
                            title={t("files.download")}
                            onClick={(event) => {
                              // In direct mode the desktop owns the file; the
                              // ticket/native path stays for the server mode.
                              if (!directFiles && downloadRoute !== "bridge")
                                return;
                              event.preventDefault();
                              void downloadEntry(entry);
                            }}
                            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <ArrowDownTrayIcon
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => rename(entry)}
                          disabled={busy}
                          aria-label={t("files.rename")}
                          title={t("files.rename")}
                          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
                        >
                          <PencilSquareIcon
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(entry)}
                          disabled={busy}
                          aria-label={t("common.delete")}
                          title={t("common.delete")}
                          className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-40"
                        >
                          <TrashIcon className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleEntries.length === 0 && !loadingFiles && !loadError && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-slate-500">
                      <span className="flex flex-wrap items-center gap-2">
                        {filter
                          ? t("files.noMatches", { query: filter })
                          : t("files.emptyFolder")}
                        {filter && (
                          <button
                            type="button"
                            onClick={() => setFilter("")}
                            className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100"
                          >
                            {t("files.clearFilter")}
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {downloadNote && (
          <p
            role="status"
            className={`border-t px-4 py-2 text-sm ${
              downloadNote.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            {downloadNote.text}
          </p>
        )}

        {actionError && (
          <p className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {actionError}
          </p>
        )}

        {uploadStatus && (
          <p
            role="status"
            className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600"
          >
            {t("files.uploading", {
              name: uploadStatus.name,
              done: uploadStatus.done,
              total: uploadStatus.total,
            })}
          </p>
        )}

        {draggingFiles && (
          <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-emerald-500 bg-emerald-50/95 text-sm font-medium text-emerald-800">
            {t("files.dropUpload")}
          </div>
        )}
      </div>

      {configOpen && server && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-label={t("files.configTitle")}
            onSubmit={(event) => void saveFileConfig(event)}
            className="w-full max-w-md rounded-lg bg-white p-5 text-slate-900 shadow-xl"
          >
            <h3 className="text-base font-semibold text-slate-900">
              {t("files.configTitle")}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {t("files.configDescription")}
            </p>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-xs text-slate-600">
                {t("files.protocol")}
                <select
                  value={configProtocol}
                  onChange={(event) => {
                    const protocol = event.target.value as FileTransferProtocol;
                    setConfigProtocol(protocol);
                    setConfigPort(String(defaultFileTransferPort(protocol)));
                    setConfigCredentialId(
                      protocol === "Sftp" && server.credentialId ? "ssh" : "",
                    );
                  }}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="Sftp">SFTP</option>
                  <option value="Ftp">FTP</option>
                  <option value="Ftps">FTPS</option>
                </select>
              </label>

              <label className="grid gap-1 text-xs text-slate-600">
                {t("files.port")}
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={configPort}
                  onChange={(event) => setConfigPort(event.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>

              <label className="grid gap-1 text-xs text-slate-600">
                {t("files.credential")}
                <select
                  value={configCredentialId}
                  onChange={(event) =>
                    setConfigCredentialId(event.target.value)
                  }
                  disabled={
                    credentialsLoading ||
                    (credentialChoices.length === 0 && !sshOption)
                  }
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-60"
                >
                  <option value="">
                    {credentialsLoading
                      ? t("files.credentialLoading")
                      : t("files.credentialPlaceholder")}
                  </option>
                  {sshOption && (
                    <option value="ssh">{t("files.credentialSsh")}</option>
                  )}
                  {credentialChoices.map((credential) => (
                    <option key={credential.id} value={credential.id}>
                      {credential.name} · {credential.username} ·{" "}
                      {credential.authType}
                    </option>
                  ))}
                </select>
              </label>

              {!credentialsLoading && credentialChoices.length > 0 && (
                <p className="text-xs text-slate-500">
                  <Link
                    to="/credentials"
                    onClick={openCredentials}
                    className="font-medium underline"
                  >
                    {t("files.manageCredentials")}
                  </Link>
                </p>
              )}

              {!credentialsLoading &&
                credentialChoices.length === 0 &&
                !sshOption && (
                  <p className="text-xs text-slate-500">
                    {t("files.credentialEmpty")}{" "}
                    <Link
                      to="/credentials"
                      onClick={openCredentials}
                      className="font-medium underline"
                    >
                      {t("files.manageCredentials")}
                    </Link>
                  </p>
                )}
            </div>

            {configError && (
              <p
                role="alert"
                className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {configError}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfigOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              >
                {t("files.configCancel")}
              </button>
              <button
                type="submit"
                disabled={
                  configSaving || credentialsLoading || !configCredentialId
                }
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                {t("files.configSave")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function join(directory: string, name: string): string {
  return directory === "/" ? `/${name}` : `${directory}/${name}`;
}
