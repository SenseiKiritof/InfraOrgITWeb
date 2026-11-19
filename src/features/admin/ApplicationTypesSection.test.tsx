import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../lib/i18n";
import { ApplicationTypesSection } from "./ApplicationTypesSection";

vi.mock("../../app/AuthProvider", () => ({
  useAuth: () => ({ session: { csrfToken: "csrf" } }),
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("ApplicationTypesSection", () => {
  beforeEach(() => {
    window.confirm = vi.fn(() => true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") return json({ id: 13 }, 201);
        if (init?.method === "DELETE")
          return new Response(null, { status: 204 });
        return json([
          {
            id: 6,
            name: "HAProxy",
            label: "HAProxy",
            sortOrder: 60,
            applicationsCount: 1,
          },
        ]);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const renderSection = () =>
    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false } },
          })
        }
      >
        <LanguageProvider initialLanguage="en">
          <ApplicationTypesSection />
        </LanguageProvider>
      </QueryClientProvider>,
    );

  it("creates and deletes a database-backed type", async () => {
    renderSection();
    expect(await screen.findAllByText("HAProxy")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "New type" }));
    fireEvent.change(screen.getByLabelText("Code"), {
      target: { value: "Apache" },
    });
    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "Apache HTTP Server" },
    });
    fireEvent.change(screen.getByLabelText("Sort order"), {
      target: { value: "130" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(([url, init]) => {
          if (!String(url).endsWith("/api/application-types")) return false;
          if (init?.method !== "POST") return false;
          return String(init.body).includes('"name":"Apache"');
        }),
      ).toBe(true),
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(([url, init]) => {
          return (
            String(url).endsWith("/api/application-types/6") &&
            init?.method === "DELETE"
          );
        }),
      ).toBe(true),
    );
  });
});
