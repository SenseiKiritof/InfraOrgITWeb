import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutocompleteSelect } from "./AutocompleteSelect";

const options = [
  { value: "db", label: "Database" },
  { value: "cache", label: "Cache Redis" },
];

afterEach(cleanup);

function renderSelect(onChange = vi.fn()) {
  const { container } = render(
    <>
      <label htmlFor="target">Destinazione</label>
      <AutocompleteSelect
        id="target"
        value=""
        options={options}
        onChange={onChange}
      />
    </>,
  );
  return { container, input: screen.getByLabelText("Destinazione"), onChange };
}

describe("AutocompleteSelect", () => {
  it("filtra le opzioni mentre si digita", () => {
    const { input } = renderSelect();

    fireEvent.focus(input);
    expect(screen.getAllByRole("option")).toHaveLength(2);

    fireEvent.change(input, { target: { value: "cache" } });

    expect(
      screen.getByRole("option", { name: "Cache Redis" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Database" }),
    ).not.toBeInTheDocument();
  });

  it("chiama onChange con il valore dell'opzione cliccata", () => {
    const { input, onChange } = renderSelect();

    fireEvent.focus(input);
    fireEvent.mouseDown(screen.getByRole("option", { name: "Database" }));

    expect(onChange).toHaveBeenCalledWith("db");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("rende la listbox in un portale sul body, agganciata all'input", () => {
    const { container, input } = renderSelect();

    fireEvent.focus(input);
    const listbox = screen.getByRole("listbox");

    expect(container).not.toContainElement(listbox);
    expect(listbox.parentElement).toBe(document.body);
    expect(listbox).toHaveStyle({ position: "fixed" });
    expect(listbox.style.top).toBe("4px");
    expect(input).toHaveAttribute("aria-controls", listbox.id);
    expect(screen.getByRole("combobox")).toBe(input);

    fireEvent(window, new Event("resize"));
    expect(screen.getByRole("listbox")).toBe(listbox);
  });

  it("ribalta la lista sopra l'input quando sotto non c'è spazio", () => {
    const { input } = renderSelect();
    vi.spyOn(input, "getBoundingClientRect").mockReturnValue({
      top: 700,
      bottom: 740,
      left: 20,
      width: 200,
      height: 40,
      right: 220,
      x: 20,
      y: 700,
      toJSON: () => ({}),
    });

    fireEvent.focus(input);
    const listbox = screen.getByRole("listbox");

    // innerHeight 768: 768 - 700 + 4 = 72; spazio sopra 700 - 4 - 8 = 688.
    expect(listbox.style.bottom).toBe("72px");
    expect(listbox.style.top).toBe("");
    expect(listbox.style.maxHeight).toBe("688px");
    expect(listbox.style.left).toBe("20px");
    expect(listbox.style.width).toBe("200px");
  });
});
