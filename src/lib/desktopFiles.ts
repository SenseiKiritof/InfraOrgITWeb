import {
  getDesktopBridge,
  sendDesktopMessage,
  subscribeDesktopMessages,
} from "./desktopBridge";
import type { RemoteFileList } from "./remote";

export type DesktopFileResult<T> =
  | { transport: "server" }
  | { transport: "client"; data: T };

export interface DesktopFileProgress {
  operation: string;
  transferredBytes: number;
  totalBytes: number;
  percent: number;
}

type FileMessage = {
  type: string;
  requestId: string;
  serverId: number;
  [key: string]: unknown;
};

function requestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `file-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

/**
 * Sends one file request to the desktop and waits for the matching result.
 * "server" means the desktop declined the direct path; the caller must use the
 * existing API endpoint.
 */
export function requestDesktopFile<T>(
  message: Omit<FileMessage, "requestId">,
  {
    timeoutMs = 30_000,
    onProgress = null,
  }: {
    timeoutMs?: number;
    onProgress?: ((progress: DesktopFileProgress) => void) | null;
  } = {},
): Promise<DesktopFileResult<T>> {
  if (!getDesktopBridge()?.remote)
    return Promise.resolve({ transport: "server" });

  return new Promise((resolve, reject) => {
    const id = requestId();
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeDesktopMessages((incoming) => {
      if (incoming.requestId !== id) return;
      if (incoming.type === "files.progress") {
        if (onProgress) {
          onProgress({
            operation: String(incoming.operation || ""),
            transferredBytes: Number(incoming.transferredBytes) || 0,
            totalBytes: Number(incoming.totalBytes) || 0,
            percent: Math.min(100, Math.max(0, Number(incoming.percent) || 0)),
          });
        }
        return;
      }
      if (incoming.type !== "files.result") return;
      done = true;
      unsubscribe();
      if (timer) clearTimeout(timer);
      if (incoming.transport === "server") {
        resolve({ transport: "server" });
        return;
      }
      if (incoming.ok) {
        resolve({
          transport: "client",
          data: incoming.data as T,
        });
        return;
      }
      reject(
        new Error(
          typeof incoming.error === "string"
            ? incoming.error
            : "Operazione file desktop non riuscita.",
        ),
      );
    });

    timer = setTimeout(() => {
      if (done) return;
      done = true;
      unsubscribe();
      reject(new Error("Timeout nell'operazione file desktop."));
    }, timeoutMs);

    if (
      !sendDesktopMessage({
        ...message,
        requestId: id,
        type: String(message.type),
      })
    ) {
      if (timer) clearTimeout(timer);
      unsubscribe();
      reject(new Error("Bridge desktop non disponibile."));
    }
  });
}

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export async function desktopListFiles(
  serverId: number,
  path: string | null,
): Promise<RemoteFileList | null> {
  const result = await requestDesktopFile<RemoteFileList>({
    type: "files.list",
    serverId,
    path,
  });
  return result.transport === "client" ? result.data : null;
}

/** Base64 over the message bridge; larger files stay on the server path. */
const MAX_DIRECT_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function desktopUploadFile(
  serverId: number,
  directory: string,
  file: File,
  onProgress?: ((progress: DesktopFileProgress) => void) | null,
): Promise<{ path: string } | null> {
  if (!getDesktopBridge()?.remote) return null;
  if (file.size > MAX_DIRECT_UPLOAD_BYTES) return null;
  const result = await requestDesktopFile<{ path: string }>(
    {
      type: "files.upload",
      serverId,
      directory,
      name: file.name,
      data: base64(await file.arrayBuffer()),
    },
    { onProgress: onProgress || null },
  );
  return result.transport === "client" ? result.data : null;
}

export async function desktopCreateDirectory(
  serverId: number,
  directory: string,
  name: string,
): Promise<{ path: string } | null> {
  const result = await requestDesktopFile<{ path: string }>({
    type: "files.mkdir",
    serverId,
    directory,
    name,
  });
  return result.transport === "client" ? result.data : null;
}

export async function desktopRenameFile(
  serverId: number,
  path: string,
  newName: string,
): Promise<{ path: string } | null> {
  const result = await requestDesktopFile<{ path: string }>({
    type: "files.rename",
    serverId,
    path,
    newName,
  });
  return result.transport === "client" ? result.data : null;
}

export async function desktopDeleteFile(
  serverId: number,
  path: string,
  isDirectory: boolean,
): Promise<boolean | null> {
  const result = await requestDesktopFile<null>({
    type: "files.delete",
    serverId,
    path,
    isDirectory,
  });
  return result.transport === "client" ? true : null;
}

export async function desktopDownloadFile(
  serverId: number,
  path: string,
  onProgress?: ((progress: DesktopFileProgress) => void) | null,
): Promise<{ saved: boolean } | null> {
  const result = await requestDesktopFile<{ saved: boolean }>(
    {
      type: "files.download",
      serverId,
      path,
    },
    { onProgress: onProgress || null },
  );
  return result.transport === "client" ? result.data : null;
}
