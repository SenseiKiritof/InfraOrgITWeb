import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../lib/i18n";
import { DataTransferSection } from "./DataTransferSection";

vi.mock("../../app/AuthProvider", () => ({
  useAuth: () => ({ session: { csrfToken: "csrf" } }),
}));

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("DataTransferSection", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/data/import/confirm")) {
          return json({
            imported: true,
            counts: 4,
            backup: "/tmp/backup.db",
            credentialRefs: [],
          });
        }
        if (url.includes("/api/data/import")) {
          return json({
            token: "token-1",
            canApply: true,
            existing: 0,
            counts: 4,
            warnings: ["Credential metadata: 1 shared references."],
            credentialRefs: [
              {
                id: 1,
                name: "Acme deploy key",
                username: "deploy",
                authType: "PrivateKey",
                owner: "shared",
              },
            ],
            expiresAt: "2026-11-19T12:00:00Z",
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("previews and confirms an inventory import", async () => {
    const { container } = render(
      <LanguageProvider initialLanguage="en">
        <DataTransferSection />
      </LanguageProvider>,
    );

    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error("file input missing");
    fireEvent.change(input, {
      target: {
        files: [
          new File(["{}"], "inventory.json", {
            type: "application/json",
          }),
        ],
      },
    });

    expect(await screen.findByText("Import preview")).toBeTruthy();
    expect(screen.getByText(/4 items/)).toBeTruthy();
    expect(screen.getByText(/credential references/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Import and replace" }));
    expect(await screen.findByText("Import completed: 4 items.")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText("Backup: /tmp/backup.db")).toBeTruthy(),
    );
  });
});
