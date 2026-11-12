import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  ChevronDownIcon,
  DocumentIcon,
  FolderIcon,
  FolderPlusIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { formatBytes, formatDateTime } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import type { Server } from "../../lib/inventory";
import { paged } from "../../lib/inventory";
import {
  createServerDirectory,
  deleteServerFile,
  listServerFiles,
  type RemoteFileEntry,
  renameServerFile,
  serverFileDownloadUrl,
  uploadServerFile,
} from "../../lib/remote";
import { fetchServerAccess } from "../../lib/useServerAccess";

/** Esploratore file SFTP/FTPS/FTP dei server configurati. */
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
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [adminIds, setAdminIds] = useState<number[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);
  const [entries, setEntries] = useState<RemoteFileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const upload = useRef<HTMLInputElement | null>(null);
  const adoptedPath = useRef<string | null>(null);

  useEffect(() => {
    if (open) setSelectedId(serverId);
  }, [open, serverId]);

  const previousServer = useRef(selectedId);
  useEffect(() => {
    if (previousServer.current === selectedId) return;
    previousServer.current = selectedId;
    // Cambiando server si riparte dalla home, non dal percorso del precedente.
    setPath(null);
    setFilter("");
    setLoadError(null);
    setActionError(null);
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
      })
      .catch(() => {
        if (!cancelled) {
          setServers([]);
          setAdminIds([]);
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
  const server = available.find((item) => item.id === selectedId) ?? null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey ricarica la cartella
  useEffect(() => {
    if (!open || selectedId === null || !server?.fileTransferProtocol) return;
    // La home appena restituita dal server è già stata elencata: non serve
    // ripetere la richiesta con il path esplicito.
    if (path !== null && adoptedPath.current === path) {
      adoptedPath.current = null;
      return;
    }
    let cancelled = false;
    setLoadingFiles(true);
    setLoadError(null);
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

  if (!open) return null;

  const visibleEntries = entries.filter((entry) =>
    entry.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-3 sm:p-6">
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("files.title")}
        className="relative flex h-[85vh] w-full max-w-5xl flex-col rounded-lg border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            {t("files.title")}
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
          {serverId === null ? (
            <label className="flex min-w-56 flex-col gap-1">
              <span className="text-xs text-slate-500">
                {t("common.server")}
              </span>
              <select
                value={selectedId ?? ""}
                onChange={(event) => {
                  const value = event.target.value
                    ? Number(event.target.value)
                    : null;
                  if (value !== null && onServerSelected) {
                    const chosen = available.find((item) => item.id === value);
                    onServerSelected(value, chosen?.name ?? `#${value}`);
                    return;
                  }
                  setSelectedId(value);
                }}
                className="rounded-md border border-slate-300 px-2 py-1.5"
              >
                <option value="">
                  {loadingServers
                    ? t("common.loading")
                    : t("files.chooseServer")}
                </option>
                {available.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.ipAddress})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="flex min-w-56 flex-col gap-1">
              <span className="text-xs text-slate-500">
                {t("common.server")}
              </span>
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                {server
                  ? `${server.name} (${server.ipAddress})`
                  : `#${serverId}`}
              </span>
            </div>
          )}
          {server?.fileTransferProtocol && (
            <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
              {server.fileTransferProtocol}
              {server.fileTransferPort ? ` :${server.fileTransferPort}` : ""}
            </span>
          )}
          <label className="flex min-w-40 flex-1 flex-col gap-1">
            <span className="text-xs text-slate-500">{t("common.search")}</span>
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t("files.filterPlaceholder")}
              className="rounded-md border border-slate-300 px-2 py-1.5"
            />
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
          {selectedId === null && (
            <p className="p-6 text-sm text-slate-500">
              {!loadingServers && available.length === 0
                ? t("console.noServers")
                : t("files.chooseServerHint")}
            </p>
          )}
          {selectedId !== null && !server?.fileTransferProtocol && (
            <p className="p-6 text-sm text-slate-500">
              {t("files.notConfigured")}
            </p>
          )}
          {loadingFiles && (
            <p className="p-6 text-sm text-slate-500">{t("common.loading")}</p>
          )}
          {!loadingFiles && loadError && (
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
                              window.location.assign(
                                serverFileDownloadUrl(selectedId, entry.path),
                              );
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
                        {t("common.noItems")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
        </div>

        {actionError && (
          <p className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {actionError}
          </p>
        )}
      </div>
    </div>
  );
}

function join(directory: string, name: string): string {
  return directory === "/" ? `/${name}` : `${directory}/${name}`;
}
