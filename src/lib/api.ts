export interface SessionUser {
  username: string;
  name: string;
  surname: string;
}

export interface Session {
  user: SessionUser;
  expiresIn: number;
  refreshExpiresIn: number;
  csrfToken: string;
}

export interface Menu {
  id: number;
  name: string;
  path: string;
  isActive: boolean;
  hideBackButton: boolean;
  isVisible: boolean;
  order: number | null;
  parentId: number | null;
  children: Menu[];
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function problemFrom(response: Response): Promise<ApiError> {
  let code = `http_${response.status}`;
  let message = response.statusText || "Errore API";
  try {
    const body = (await response.json()) as {
      code?: string;
      detail?: string;
      title?: string;
    };
    code = body.code ?? code;
    message = body.detail ?? body.title ?? message;
  } catch {
    // risposta non JSON: resta lo status
  }
  return new ApiError(response.status, code, message);
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  csrfToken?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if (csrfToken) headers.set("X-CSRF-Token", csrfToken);

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "include",
  });
  if (!response.ok) throw await problemFrom(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function getSession(): Promise<Session | null> {
  const response = await fetch("/api/session", { credentials: "include" });
  if (response.status === 401) return null;
  if (!response.ok) throw await problemFrom(response);
  return (await response.json()) as Session;
}

export function getMenus(): Promise<Menu[]> {
  return apiFetch<Menu[]>("/api/menus");
}

export function postLogout(csrfToken: string): Promise<void> {
  return apiFetch<void>("/auth/logout", { method: "POST" }, csrfToken);
}

export function redirectToLogin(): void {
  window.location.assign("/auth/login");
}
