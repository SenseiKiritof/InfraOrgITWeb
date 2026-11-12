import { useCallback, useEffect, useRef, useState } from "react";
import { patchSessionTheme, type Session, type ThemePreference } from "./api";

export type { ThemePreference } from "./api";

export const THEME_STORAGE_KEY = "infraorgit-theme";

const PREFERENCES: ThemePreference[] = ["light", "dark", "system"];

/** Valore locale usato prima del login e quando il server non risponde. */
export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (PREFERENCES.includes(stored as ThemePreference))
      return stored as ThemePreference;
  } catch {
    // storage non disponibile: si usa il tema di sistema
  }
  return "system";
}

export function storeThemePreference(theme: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // storage non disponibile: resta valido per questa scheda
  }
}

export function prefersDark(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function resolvedTheme(theme: ThemePreference): "light" | "dark" {
  return theme === "system" ? (prefersDark() ? "dark" : "light") : theme;
}

export function applyTheme(theme: ThemePreference): void {
  const dark = resolvedTheme(theme) === "dark";
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

/**
 * Preferenza tema: localStorage come fallback immediato, valore del server
 * quando la sessione lo espone. Il toggle salva anche sul server, così la
 * scelta segue l'utente su altri dispositivi.
 */
export function useTheme(session: Session | null) {
  const [theme, setThemeState] = useState<ThemePreference>(readThemePreference);
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    resolvedTheme(theme),
  );
  const serverTheme = session?.theme;
  const lastServerTheme = useRef<ThemePreference | undefined>(undefined);

  useEffect(() => {
    applyTheme(theme);
    setResolved(resolvedTheme(theme));
  }, [theme]);

  useEffect(() => {
    if (theme !== "system" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyTheme("system");
      setResolved(resolvedTheme("system"));
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  useEffect(() => {
    if (!serverTheme || lastServerTheme.current === serverTheme) return;
    lastServerTheme.current = serverTheme;
    storeThemePreference(serverTheme);
    setThemeState(serverTheme);
  }, [serverTheme]);

  const setTheme = useCallback(
    (next: ThemePreference) => {
      setThemeState(next);
      storeThemePreference(next);
      applyTheme(next);
      setResolved(resolvedTheme(next));
      const csrf = session?.csrfToken;
      if (csrf) void patchSessionTheme(csrf, next).catch(() => undefined);
    },
    [session?.csrfToken],
  );

  const toggle = useCallback(() => {
    setTheme(resolved === "dark" ? "light" : "dark");
  }, [resolved, setTheme]);

  return { theme, resolved, setTheme, toggle };
}
