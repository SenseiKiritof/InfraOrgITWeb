import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { useQueryFilter } from "./useQueryFilter";

function Probe() {
  const { search, setSearch, q, setQ } = useQueryFilter();
  const location = useLocation();
  return (
    <div>
      <input
        aria-label="Cerca"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <button type="button" onClick={() => setQ(search)}>
        Filtra
      </button>
      <p data-testid="q">{q}</p>
      <p data-testid="url">{location.search}</p>
    </div>
  );
}

afterEach(cleanup);

describe("useQueryFilter", () => {
  it("legge il filtro dalla URL e lo riscrive", () => {
    render(
      <MemoryRouter initialEntries={["/servers?q=alpha"]}>
        <Probe />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Cerca")).toHaveValue("alpha");
    expect(screen.getByTestId("q")).toHaveTextContent("alpha");

    fireEvent.change(screen.getByLabelText("Cerca"), {
      target: { value: "beta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Filtra" }));

    expect(screen.getByTestId("url")).toHaveTextContent("?q=beta");
    expect(screen.getByTestId("q")).toHaveTextContent("beta");

    fireEvent.change(screen.getByLabelText("Cerca"), {
      target: { value: "  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Filtra" }));
    expect(screen.getByTestId("url")).toBeEmptyDOMElement();
  });
});
