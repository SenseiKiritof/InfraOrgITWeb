import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../lib/i18n";
import type { ServerApplication } from "../../lib/inventory";
import { DatabaseQueryModal } from "./DatabaseQueryModal";

vi.mock("../../app/AuthProvider", () => ({
  useAuth: () => ({ session: { csrfToken: "csrf" } }),
}));

const deployment: ServerApplication = {
  id: 7,
  serverId: 3,
  serverName: "db-01",
  applicationVersionId: 2,
  applicationId: 1,
  applicationName: "crm-db",
  versionNumber: "1.0.0",
  exposedPort: 3306,
  proxyRouteId: null,
  runtime: null,
  containerImage: null,
  containerName: null,
  composeDirectory: null,
  hostPort: null,
  haRole: null,
};

describe("DatabaseQueryModal", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              engine: "MySql",
              exitCode: 0,
              output: "id\tname\n1\tAcme",
              timedOut: false,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs a read-only query and shows the output", async () => {
    render(
      <LanguageProvider initialLanguage="en">
        <DatabaseQueryModal
          deployment={deployment}
          engine="MySql"
          applicationName="crm-db"
          serverName="db-01"
          onClose={() => {}}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText(/read-only/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Database"), {
      target: { value: "crm" },
    });
    fireEvent.change(screen.getByLabelText("Query"), {
      target: { value: "SELECT * FROM users" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => expect(screen.getByText(/Acme/)).toBeTruthy());
    const call = vi.mocked(fetch).mock.calls[0];
    expect(String(call[0])).toBe("/api/server-applications/7/query");
    expect(String(call[1]?.body)).toContain('"query":"SELECT * FROM users"');
    expect(String(call[1]?.body)).toContain('"database":"crm"');
  });
});
