import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../lib/i18n";
import { RequireSystemAdmin } from "./RequireSystemAdmin";

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

function renderGuard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LanguageProvider initialLanguage="it">
          <RequireSystemAdmin>
            <p>contenuto riservato</p>
          </RequireSystemAdmin>
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RequireSystemAdmin", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("non monta la pagina mentre verifica il ruolo", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );

    renderGuard();

    expect(screen.getByRole("status")).toHaveTextContent("Caricamento…");
    expect(screen.queryByText("contenuto riservato")).toBeNull();
  });

  it("mostra l'errore per un utente senza ruolo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          isSystemAdmin: false,
          adminEnvironmentIds: [],
          operatorEnvironmentIds: [],
        }),
      ),
    );

    renderGuard();

    expect(await screen.findByText("Accesso riservato")).toBeTruthy();
    expect(screen.queryByText("contenuto riservato")).toBeNull();
  });

  it("monta la pagina per un SystemAdmin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          isSystemAdmin: true,
          adminEnvironmentIds: [],
          operatorEnvironmentIds: [],
        }),
      ),
    );

    renderGuard();

    expect(await screen.findByText("contenuto riservato")).toBeTruthy();
  });
});
