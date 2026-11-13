import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../lib/i18n";
import type { ApplicationVersionApi } from "../../lib/inventory";
import { ApiCallModal } from "./ApiCallModal";

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const api: ApplicationVersionApi = {
  id: 1,
  applicationVersionId: 1,
  url: "/health",
  requestType: "GET",
  description: "",
  body: null,
  queryParamCount: 0,
};

describe("ApiCallModal", () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "external");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("in bridge invia il blob al desktop senza creare un secondo download", async () => {
    let handler: ((raw: string) => void) | undefined;
    const sendMessage = vi.fn((raw: string) => {
      const message = JSON.parse(raw) as { type?: string };
      if (message.type === "desktop.capabilities") {
        handler?.(
          JSON.stringify({
            type: "desktop.capabilities",
            downloadMode: "auto",
            nativeDownload: false,
          }),
        );
      }
    });
    Object.defineProperty(window, "external", {
      configurable: true,
      value: {
        sendMessage,
        receiveMessage: vi.fn((callback: (raw: string) => void) => {
          handler = callback;
        }),
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/desktop/downloads/capabilities")) {
          return json({ signedUrl: true });
        }
        if (url.includes("/api/application-version-apis/1/query-params")) {
          return json({ items: [], total: 0, page: 1, pageSize: 200 });
        }
        if (url.includes("/api/applications/1/environments")) {
          return json([
            {
              environmentId: 1,
              name: "Prod",
              hostname: "api.example.test",
              ignoreSslErrors: false,
            },
          ]);
        }
        if (
          url.includes("/api/application-version-apis/1/call") &&
          init?.method === "POST"
        ) {
          return json({
            callId: 9,
            status: 200,
            contentType: "application/json",
            reason: "OK",
            durationMs: 4,
            body: '{"status":"ok"}',
            truncated: false,
            sizeBytes: 15,
            binary: false,
          });
        }
        return json({ items: [], total: 0, page: 1, pageSize: 20 });
      }),
    );
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <LanguageProvider initialLanguage="it">
          <ApiCallModal
            api={api}
            applicationId={1}
            csrfToken="csrf"
            onClose={() => undefined}
          />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Chiamata GET /health",
    });
    await waitFor(() =>
      expect(dialog.getAttribute("data-download-route")).toBe("bridge"),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Chiama" }));
    fireEvent.click(await screen.findByRole("button", { name: "Scarica" }));

    await waitFor(() =>
      expect(
        sendMessage.mock.calls
          .map(([raw]) => JSON.parse(String(raw)) as Record<string, unknown>)
          .filter((message) => message.type === "desktop.download.blob"),
      ).toHaveLength(1),
    );
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
