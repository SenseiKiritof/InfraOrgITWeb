import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session } from "../lib/api";
import {
  getSession,
  postLogout,
  redirectToLogin,
  SESSION_REFRESHED_EVENT,
} from "../lib/api";
import { tGlobal } from "../lib/i18n";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  error: string | null;
  logout: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const current = await getSession();
      if (!current) {
        redirectToLogin();
        return;
      }
      setSession(current);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tGlobal("app.sessionUnavailable"),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    // I timer in background vengono rallentati dal browser: al ritorno sulla
    // scheda riallineiamo la sessione prima che l'utente continui a lavorare.
    const onVisibility = () => {
      if (document.visibilityState === "visible") void loadSession();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [loadSession]);

  useEffect(() => {
    const sync = (event: Event) =>
      setSession((event as CustomEvent<Session>).detail);
    window.addEventListener(SESSION_REFRESHED_EVENT, sync);
    return () => window.removeEventListener(SESSION_REFRESHED_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!session) return;
    const refreshIn = Math.max(30, session.expiresIn - 30) * 1000;
    const timer = window.setTimeout(() => void loadSession(), refreshIn);
    return () => window.clearTimeout(timer);
  }, [loadSession, session]);

  const logout = useCallback(async () => {
    if (!session) return true;

    try {
      await postLogout(session.csrfToken);
      setSession(null);
      return true;
    } catch {
      return false;
    }
  }, [session]);

  const value = useMemo(
    () => ({ session, loading, error, logout }),
    [session, loading, error, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth fuori da AuthProvider");
  return context;
}
