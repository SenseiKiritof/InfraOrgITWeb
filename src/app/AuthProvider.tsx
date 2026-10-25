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
import { getSession, postLogout, redirectToLogin } from "../lib/api";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  error: string | null;
  logout: () => Promise<void>;
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
        cause instanceof Error ? cause.message : "Sessione non disponibile",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!session) return;
    const refreshIn = Math.max(30, session.expiresIn - 30) * 1000;
    const timer = window.setTimeout(() => void loadSession(), refreshIn);
    return () => window.clearTimeout(timer);
  }, [loadSession, session]);

  const logout = useCallback(async () => {
    if (session) {
      try {
        await postLogout(session.csrfToken);
      } catch {
        // il cookie viene comunque rimosso dal backend; si prosegue
      }
    }
    setSession(null);
    window.location.assign("/auth/login");
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
