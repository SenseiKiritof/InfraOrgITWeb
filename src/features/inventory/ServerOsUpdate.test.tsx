import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../lib/i18n";
import type { Server } from "../../lib/inventory";
import { ServerOsCard } from "./ServerOsUpdate";

vi.mock("../../app/AuthProvider", () => ({
  useAuth: () => ({ session: { csrfToken: "csrf" } }),
}));

vi.mock("../../lib/serverUpdatePolicy", () => ({
  runServerOsCheck: vi.fn(),
  updateServerOsPolicy: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  apiFetch: vi.fn(),
}));

const failedServer = {
  id: 7,
  name: "as201tskm",
  operatingSystem: null,
  osName: "Ubuntu",
  osVersion: "22.04.4",
  osUpdateTarget: null,
  osUpdateTargetLts: null,
  osEolDate: null,
  osUpdateStatus: "Error",
  osUpdateDetail: "Connection refused",
  osUpdateCheckedAt: "2026-11-25T08:00:00Z",
  osUpdateLtsOnly: null,
} as Server;

describe("ServerOsCard", () => {
  it("mostra lo stato fallito con il dettaglio e il comando manuale", () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLanguage="it">
          <ServerOsCard server={failedServer} canWrite={false} canRun />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Controllo non riuscito")).toBeTruthy();
    expect(screen.getByText("Connection refused")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Controlla ora" })).toBeTruthy();
  });
});
