import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
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

/** Esploratore file SFTP/FTP dei server configurati. */
export function FileBrowserModal({
  open,
  serverId,
  onClose,
}: {
  open: boolean;
  serverId: number | null;
  onClose: () => void;
}) {
  const { t, language } = useI18n();
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const [selectedId, setSelectedId] = useState<number | null>(serverId);
  const [path, setPath] = useState("/");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [adminIds, setAdminIds] = useState<number[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);
  const [entries, setEntries] = useState<RemoteFileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const upload = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) setSelectedId(serverId);
  }, [open, serverId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset quando cambia il server
  useEffect(() => {
    setPath("/");
    setFilter("");
    setError(null);
  }, [selectedId]);

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
    let cancelled = false;
    setLoadingFiles(true);
    setError(null);
    listServerFiles(selectedId, path)
      .then((listing) => {
        if (cancelled) return;
        setEntries(listing.items);
        setPath(listing.path);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setEntries([]);
        setError(cause instanceof Error ? cause.message : t("files.failed"));
      })
      .finally(() => {
        if (!cancelled) setLoadingFiles(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, selectedId, path, server?.fileTransferProtocol, reloadKey]);

  const parentPath = () => {
    const parts = path.split("/").filter(Boolean);
    parts.pop();
    return parts.length === 0 ? "/" : `/${parts.join("/")}`;
  };

  const refresh = async () => {
    setReloadKey((value) => value + 1);
  };

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("files.failed"));
    } finally {
      setBusy(false);
    }
  };

  const addDirectory = () => {
    if (selectedId === null) return;
    const name = window.prompt(t("files.newFolderPrompt"));
    if (!name?.trim()) return;
    void run(() =>
      createServerDirectory(selectedId, join(path, name.trim()), csrf),
    );
  };

  const uploadFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || selectedId === null) return;
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
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-b border-slate-200 px-4 py-3 text-sm">
          <label className="flex min-w-56 flex-col gap-1">
            <span className="text-xs text-slate-500">{t("common.server")}</span>
            <select
              value={selectedId ?? ""}
              onChange={(event) =>
                setSelectedId(
                  event.target.value ? Number(event.target.value) : null,
                )
              }
              className="rounded-md border border-slate-300 px-2 py-1.5"
            >
              <option value="">
                {loadingServers ? t("common.loading") : t("files.chooseServer")}
              </option>
              {available.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.ipAddress})
                </option>
              ))}
            </select>
          </label>
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
              disabled={path === "/"}
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
              disabled={selectedId === null || busy}
              title={t("files.newFolder")}
              className="rounded-md border border-slate-300 p-1.5 disabled:opacity-40"
            >
              <FolderPlusIcon className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => upload.current?.click()}
              disabled={selectedId === null || busy}
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
            .split("/")
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
              {t("files.chooseServerHint")}
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

        {error && (
          <p className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function join(directory: string, name: string): string {
  return directory === "/" ? `/${name}` : `${directory}/${name}`;
}
