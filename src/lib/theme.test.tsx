import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, ThemePreference } from "./api";
import {
  applyTheme,
  readPendingThemePreference,
  readThemePreference,
  storePendingThemePreference,
  storeThemePreference,
  THEME_STORAGE_KEY,
  useTheme,
} from "./theme";

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: (_type: string, listener: EventListener) => {
        listeners.add(listener as (event: MediaQueryListEvent) => void);
      },
      removeEventListener: (_type: string, listener: EventListener) => {
        listeners.delete(listener as (event: MediaQueryListEvent) => void);
      },
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  return listeners;
}

const session = (theme?: ThemePreference): Session => ({
  user: { username: "mario", name: "Mario", surname: "Rossi" },
  expiresIn: 300,
  refreshExpiresIn: 1800,
  csrfToken: "csrf",
  theme,
});

const darkApplied = () => document.documentElement.classList.contains("dark");

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    stubMatchMedia(true);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    Reflect.deleteProperty(window, "infraorgitDesktop");
    vi.unstubAllGlobals();
  });

  it("usa il tema di sistema come fallback e rispetta la preferenza salvata", () => {
    expect(readThemePreference()).toBe("system");

    applyTheme("system");
    expect(darkApplied()).toBe(true);

    localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(readThemePreference()).toBe("light");
    applyTheme(readThemePreference());
    expect(darkApplied()).toBe(false);
  });

  it("adotta il tema del server e lo salva in locale", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    const { result } = renderHook(() => useTheme(session("dark")));

    await waitFor(() => expect(result.current.theme).toBe("dark"));
    expect(darkApplied()).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("mantiene il fallback locale quando la sessione non espone il tema", () => {
    storeThemePreference("dark");

    const { result } = renderHook(() => useTheme(session()));

    expect(result.current.theme).toBe("dark");
    expect(result.current.resolved).toBe("dark");
  });

  it("non sovrascrive la scelta fatta prima del login con il default system", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    storeThemePreference("dark");
    storePendingThemePreference("dark");

    const { result } = renderHook(() => useTheme(session("system")));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(result.current.theme).toBe("dark");
    expect(darkApplied()).toBe(true);
    expect(readPendingThemePreference()).toBeNull();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/session/theme");
    expect(JSON.parse(String(init.body))).toEqual({ theme: "dark" });
  });

  it("mantiene una scelta pendente se il PATCH non è disponibile", () => {
    storeThemePreference("dark");
    storePendingThemePreference("dark");

    const { result } = renderHook(() => useTheme(session()));

    expect(result.current.theme).toBe("dark");
    expect(readPendingThemePreference()).toBe("dark");
  });

  it("al toggle salva in locale e invia il PATCH con CSRF", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useTheme(session("dark")));
    await waitFor(() => expect(result.current.theme).toBe("dark"));

    act(() => result.current.toggle());

    expect(result.current.theme).toBe("light");
    expect(darkApplied()).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(readPendingThemePreference()).toBeNull());

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/session/theme");
    expect(init.method).toBe("PATCH");
    expect(new Headers(init.headers).get("X-CSRF-Token")).toBe("csrf");
    expect(JSON.parse(String(init.body))).toEqual({ theme: "light" });
  });

  it("resta sul fallback locale se il PATCH fallisce", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: "error" }), { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useTheme(session("dark")));
    await waitFor(() => expect(result.current.theme).toBe("dark"));

    act(() => result.current.toggle());

    expect(result.current.theme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(darkApplied()).toBe(false);
    expect(readPendingThemePreference()).toBe("light");
    await waitFor(() => expect(result.current.theme).toBe("light"));
  });

  it("sincronizza il tema con la shell desktop senza un secondo stato", async () => {
    const sendMessage = vi.fn();
    let receive: ((raw: string) => void) | undefined;
    Object.defineProperty(window, "infraorgitDesktop", {
      configurable: true,
      value: {
        sendMessage,
        receiveMessage: (handler: (raw: string) => void) => {
          receive = handler;
        },
      },
    });
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useTheme(session("dark")));
    await waitFor(() => expect(result.current.theme).toBe("dark"));

    act(() => result.current.setTheme("light"));
    const outgoing = sendMessage.mock.calls
      .map(([raw]) => JSON.parse(String(raw)) as Record<string, unknown>)
      .filter((message) => message.type === "theme.changed");
    expect(outgoing.at(-1)).toEqual({
      type: "theme.changed",
      theme: "light",
    });

    act(() =>
      receive?.(JSON.stringify({ type: "theme.apply", theme: "dark" })),
    );
    await waitFor(() => expect(result.current.theme).toBe("dark"));
    expect(darkApplied()).toBe(true);
  });
});
