import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../lib/i18n";
import { searchAll } from "../lib/search";
import { GlobalSearch } from "./GlobalSearch";

vi.mock("../lib/search", () => ({
  searchAll: vi.fn(),
}));

const mockedSearch = vi.mocked(searchAll);

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="path">{location.pathname}</span>;
}

function renderSearch() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LanguageProvider>
        <MemoryRouter initialEntries={["/"]}>
          <GlobalSearch />
          <LocationProbe />
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mockedSearch.mockResolvedValue([
    {
      type: "provider",
      id: 1,
      name: "Fastweb",
      detail: null,
      href: "/providers/1",
    },
  ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("GlobalSearch", () => {
  it("mostra la tipologia e apre la schermata del risultato", async () => {
    renderSearch();

    fireEvent.change(screen.getByRole("combobox", { name: "Cerca" }), {
      target: { value: "fast" },
    });

    await waitFor(() => expect(mockedSearch).toHaveBeenCalledWith("fast"));
    const option = await screen.findByRole("option", { name: /Fastweb/ });
    expect(option).toHaveTextContent("Provider");

    fireEvent.click(option);

    expect(screen.getByTestId("path")).toHaveTextContent("/providers/1");
  });
});
