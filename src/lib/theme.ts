import { useCallback, useEffect, useRef, useState } from "react";
import { patchSessionTheme, type Session, type ThemePreference } from "./api";
import { sendDesktopMessage } from "./desktopBridge";

export type { ThemePreference } from "./api";

export const THEME_STORAGE_KEY = "infraorgit-theme";
export const THEME_PENDING_KEY = "infraorgit-theme-pending";

const PREFERENCES: ThemePreference[] = ["light", "dark", "system"];

function notifyDesktopTheme(theme: ThemePreference) {
  sendDesktopMessage({ type: "theme.changed", theme });
}

function storedPreference(key: string): ThemePreference | null {
  try {
    const stored = localStorage.getItem(key);
    if (PREFERENCES.includes(stored as ThemePreference))
      return stored as ThemePreference;
  } catch {
    // storage non disponibile: si usa il tema di sistema
  }
  return null;
}

/** Valore locale usato prima del login e quando il server non risponde. */
export function readThemePreference(): ThemePreference {
  return storedPreference(THEME_STORAGE_KEY) ?? "system";
}

export function storeThemePreference(theme: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // storage non disponibile: resta valido per questa scheda
  }
}

/** Scelta locale non ancora confermata dal server. */
export function readPendingThemePreference(): ThemePreference | null {
  return storedPreference(THEME_PENDING_KEY);
}

export function storePendingThemePreference(theme: ThemePreference): void {
  try {
    localStorage.setItem(THEME_PENDING_KEY, theme);
  } catch {
    // storage non disponibile: il PATCH resta best effort
  }
}

export function clearPendingThemePreference(): void {
  try {
    localStorage.removeItem(THEME_PENDING_KEY);
  } catch {
    // storage non disponibile
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
    if (!serverTheme) return;
    const pending = readPendingThemePreference();
    if (lastServerTheme.current === serverTheme && !pending) return;
    lastServerTheme.current = serverTheme;
    const next = pending ?? serverTheme;
    storeThemePreference(next);
    setThemeState(next);
    applyTheme(next);
    setResolved(resolvedTheme(next));
    notifyDesktopTheme(next);
    if (!pending) return;
    const csrf = session?.csrfToken;
    if (!csrf) return;
    void patchSessionTheme(csrf, pending)
      .then(() => {
        if (readPendingThemePreference() === pending)
          clearPendingThemePreference();
      })
      .catch(() => undefined);
  }, [serverTheme, session?.csrfToken]);

  const setTheme = useCallback(
    (next: ThemePreference) => {
      setThemeState(next);
      storeThemePreference(next);
      storePendingThemePreference(next);
      applyTheme(next);
      setResolved(resolvedTheme(next));
      notifyDesktopTheme(next);
      const csrf = session?.csrfToken;
      if (csrf)
        void patchSessionTheme(csrf, next)
          .then(() => {
            if (readPendingThemePreference() === next)
              clearPendingThemePreference();
          })
          .catch(() => undefined);
    },
    [session?.csrfToken],
  );

  const cycle = useCallback(() => {
    const next =
      theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
  }, [theme, setTheme]);

  return { theme, resolved, setTheme, cycle };
}
