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

export const SESSION_REFRESHED_EVENT = "session:refreshed";

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  csrfToken?: string,
): Promise<T> {
  const send = (token?: string) => {
    const headers = new Headers(options.headers);
    if (options.body && !headers.has("Content-Type"))
      headers.set("Content-Type", "application/json");
    if (token) headers.set("X-CSRF-Token", token);
    return fetch(path, { ...options, headers, credentials: "include" });
  };

  const parse = async (response: Response): Promise<T> => {
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  };

  let response = await send(csrfToken);
  if (response.status === 401) {
    const problem = await problemFrom(response);
    // L'access token può essere scaduto mentre la scheda era in background:
    // /api/session rinnova la sessione, poi la richiesta viene ripetuta una volta.
    const fresh = await getSession();
    if (!fresh) {
      redirectToLogin();
      throw problem;
    }
    window.dispatchEvent(
      new CustomEvent<Session>(SESSION_REFRESHED_EVENT, { detail: fresh }),
    );
    response = await send(fresh.csrfToken);
    if (!response.ok) throw await problemFrom(response);
    return parse(response);
  }
  if (response.status === 403) {
    const problem = await problemFrom(response);
    if (problem.code === "csrf_failed") {
      // Token stale dopo un altro login nello stesso browser: riallinea e riprova.
      const fresh = await getSession();
      if (fresh?.csrfToken && fresh.csrfToken !== csrfToken) {
        window.dispatchEvent(
          new CustomEvent<Session>(SESSION_REFRESHED_EVENT, { detail: fresh }),
        );
        response = await send(fresh.csrfToken);
        if (!response.ok) throw await problemFrom(response);
        return parse(response);
      }
    }
    throw problem;
  }
  if (!response.ok) throw await problemFrom(response);
  return parse(response);
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
