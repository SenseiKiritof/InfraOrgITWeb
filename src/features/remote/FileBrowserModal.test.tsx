import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../lib/i18n";
import { FileBrowserModal } from "./FileBrowserModal";

vi.mock("../../app/AuthProvider", () => ({
  useAuth: () => ({ session: { csrfToken: "csrf" } }),
}));

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

let fileRequests: string[] = [];

describe("FileBrowserModal", () => {
  beforeEach(() => {
    fileRequests = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/server-access/me")) {
          return json({
            isSystemAdmin: false,
            adminEnvironmentIds: [1],
            operatorEnvironmentIds: [1],
          });
        }
        if (url.includes("/api/servers/7/files")) {
          fileRequests.push(url);
          const path =
            new URL(url, "http://localhost").searchParams.get("path") ??
            "/home/test";
          return json({
            path,
            items: [
              {
                name: "hello.txt",
                path: `${path}/hello.txt`,
                isDirectory: false,
                size: 12,
                modifiedUtc: "2026-11-03T10:00:00Z",
              },
            ],
          });
        }
        return json({
          items: [
            {
              id: 7,
              name: "srv-alpha",
              providerEnvironmentId: 1,
              ipAddress: "10.0.0.5",
              sshPort: 22,
              fileTransferProtocol: "Sftp",
              fileTransferPort: 2222,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 200,
        });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("carica server, protocollo e file", async () => {
    render(
      <LanguageProvider initialLanguage="it">
        <FileBrowserModal open serverId={7} onClose={() => undefined} />
      </LanguageProvider>,
    );

    expect(await screen.findByText("hello.txt")).toBeTruthy();
    expect(screen.getAllByText("Sftp :2222").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "Scarica" }).getAttribute("href"),
    ).toContain(
      "/api/servers/7/files/download?path=%2Fhome%2Ftest%2Fhello.txt",
    );
  });

  it("parte senza path e adotta la home restituita dal server", async () => {
    render(
      <LanguageProvider initialLanguage="it">
        <FileBrowserModal open serverId={7} onClose={() => undefined} />
      </LanguageProvider>,
    );

    expect(await screen.findByText("hello.txt")).toBeTruthy();
    expect(fileRequests).toEqual(["/api/servers/7/files"]);
    // Il percorso restituito è adottato e mostrato nel breadcrumb.
    expect(screen.getByText("home")).toBeTruthy();
    expect(screen.getByText("test")).toBeTruthy();
  });
});
