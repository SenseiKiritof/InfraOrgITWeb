import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  ChevronDownIcon,
  DocumentIcon,
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
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import { ApiError } from "../../lib/api";
import {
  type DesktopDownloadRoute,
  desktopDownloads,
} from "../../lib/desktopDownloads";
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

/** Pannello file SFTP/FTPS/FTP dei server configurati. */
export function FileBrowserModal({
  open,
  serverId,
  initialPath = null,
  onPathChange,
  onServerSelected,
  onClose,
  onCloseSession,
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
  const [servers, setServers] = useState<Server[]>([]);
  const [adminIds, setAdminIds] = useState<number[]>([]);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [loadingServers, setLoadingServers] = useState(false);
  const [entries, setEntries] = useState<RemoteFileEntry[]>([]);
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

  useEffect(() => {
    if (open && serverId !== null) filterInput.current?.focus();
  }, [open, serverId]);

  useEffect(() => {
    if (open) setSelectedId(serverId);
  }, [open, serverId]);

  useEffect(() => {
    if (open) return;
    setConfigOpen(false);
    setConfigError(null);
  }, [open]);

  // Esc chiude il pannello in cima: intercetta prima della console espansa.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  const previousServer = useRef(selectedId);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDownloadRoute("normal");
    setDownloadNote(null);
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
    if (previousServer.current === selectedId) return;
    previousServer.current = selectedId;
    // Cambiando server si riparte dalla home, non dal percorso del precedente.
    setPath(null);
    setFilter("");
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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingServers(true);
    Promise.all([paged<Server>("/api/servers"), fetchServerAccess()])
      .then(([page, serverAccess]) => {
        if (cancelled) return;
        setServers(page.items);
        setAdminIds(serverAccess.adminEnvironmentIds);
        setIsSystemAdmin(serverAccess.isSystemAdmin);
      })
      .catch(() => {
        if (!cancelled) {
          setServers([]);
          setAdminIds([]);
          setIsSystemAdmin(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingServers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

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
    () => entries.filter((entry) => matchesFileFilter(entry, filter)),
    [entries, filter],
  );
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
      return;
    }
    // La home appena restituita dal server è già stata elencata: non serve
    // ripetere la richiesta con il path esplicito.
    if (path !== null && adoptedPath.current === path) {
      adoptedPath.current = null;
      return;
    }
    let cancelled = false;
    setLoadingFiles(true);
    setLoadError(null);
    setLoadErrorCode(null);
    listServerFiles(selectedId, path)
      .then((listing) => {
        if (cancelled) return;
        setEntries(listing.items);
        if (listing.path !== path) {
          adoptedPath.current = listing.path;
          setPath(listing.path);
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setEntries([]);
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

  const parentPath = () => {
    const parts = (path ?? "/").split("/").filter(Boolean);
    parts.pop();
    return parts.length === 0 ? "/" : `/${parts.join("/")}`;
  };

  const refresh = async () => {
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
      setServers((current) =>
        current.map((item) =>
          item.id === server.id
            ? {
                ...item,
                fileTransferProtocol: configProtocol,
                fileTransferPort: port,
                fileTransferCredentialId: credentialId,
                fileTransferCredentialName: credential?.name ?? null,
              }
            : item,
        ),
      );
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
      await refresh();
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : t("files.failed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const addDirectory = () => {
    if (selectedId === null || path === null) return;
    const name = window.prompt(t("files.newFolderPrompt"));
    if (!name?.trim()) return;
    void run(() =>
      createServerDirectory(selectedId, join(path, name.trim()), csrf),
    );
  };

  const uploadFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || selectedId === null || path === null) return;
    void run(() => uploadServerFile(selectedId, path, file, csrf));
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
    void run(() =>
      deleteServerFile(selectedId, entry.path, entry.isDirectory, csrf),
    );
  };

  const downloadEntry = async (entry: RemoteFileEntry) => {
    if (selectedId === null || entry.isDirectory) return;
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

  if (serverId === null) {
    return (
      <div className="fixed inset-x-0 bottom-11 z-40 px-2">
        <div
          role="dialog"
          aria-label={t("files.chooseServer")}
          className="flex h-[60vh] w-full flex-col rounded-lg border border-slate-200 bg-white shadow-2xl"
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
    <div className="fixed inset-x-0 bottom-11 z-40 px-2">
      <div
        role="dialog"
        aria-label={t("files.title")}
        data-download-route={downloadRoute}
        className="flex h-[60vh] w-full flex-col rounded-lg border border-slate-200 bg-white shadow-2xl"
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
          <div className="flex items-center gap-1">
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
              onClick={() => setPath(parentPath())}
              disabled={path === null || path === "/"}
              className="rounded-md border border-slate-300 px-2 py-1.5 disabled:opacity-40"
            >
              {t("files.up")}
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={selectedId === null}
              title={t("files.refresh")}
              className="rounded-md border border-slate-300 p-1.5 disabled:opacity-40"
            >
              <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={addDirectory}
              disabled={selectedId === null || path === null || busy}
              title={t("files.newFolder")}
              className="rounded-md border border-slate-300 p-1.5 disabled:opacity-40"
            >
              <FolderPlusIcon className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => upload.current?.click()}
              disabled={selectedId === null || path === null || busy}
              title={t("files.upload")}
              className="rounded-md border border-slate-300 p-1.5 disabled:opacity-40"
            >
              <ArrowUpTrayIcon className="h-4 w-4" aria-hidden="true" />
            </button>
            <input
              ref={upload}
              type="file"
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

        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-100 px-4 py-2 font-mono text-xs text-slate-600">
          <button
            type="button"
            onClick={() => setPath("/")}
            className="hover:text-slate-900"
          >
            /
          </button>
          {path
            ?.split("/")
            .filter(Boolean)
            .map((segment, index, all) => {
              const target = `/${all.slice(0, index + 1).join("/")}`;
              return (
                <span key={target} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPath(target)}
                    className="hover:text-slate-900"
                  >
                    {segment}
                  </button>
                  {index < all.length - 1 && <span>/</span>}
                </span>
              );
            })}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {loadingFiles && (
            <p className="p-6 text-sm text-slate-500">{t("common.loading")}</p>
          )}
          {!loadingFiles && loadError && !fileConfigNeeded && (
            <p className="p-6 text-sm text-red-700">{loadError}</p>
          )}
          {server?.fileTransferProtocol &&
            selectedId !== null &&
            !loadingFiles && (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2">{t("common.name")}</th>
                    <th className="px-4 py-2">{t("files.size")}</th>
                    <th className="px-4 py-2">{t("files.modified")}</th>
                    <th className="px-4 py-2 text-right">
                      {t("common.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEntries.map((entry) => (
                    <tr
                      key={entry.path}
                      className="border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          title={
                            entry.isDirectory ? entry.name : t("files.download")
                          }
                          onClick={() => {
                            if (entry.isDirectory) {
                              setPath(entry.path);
                            } else {
                              void downloadEntry(entry);
                            }
                          }}
                          className="flex max-w-[28rem] items-center gap-2 truncate text-left hover:underline"
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
                              href={serverFileDownloadUrl(
                                selectedId,
                                entry.path,
                              )}
                              title={t("files.download")}
                              onClick={(event) => {
                                // Solo il bridge possiede il file: native e web
                                // lasciano la navigazione normale al webview.
                                if (downloadRoute !== "bridge") return;
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
                            title={t("common.edit")}
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
                            title={t("common.delete")}
                            className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-40"
                          >
                            <TrashIcon className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visibleEntries.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-slate-500">
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
      </div>

      {configOpen && server && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-label={t("files.configTitle")}
            onSubmit={(event) => void saveFileConfig(event)}
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
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
