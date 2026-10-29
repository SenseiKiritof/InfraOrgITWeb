import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../lib/i18n";
import { UserMenu } from "./UserMenu";

beforeEach(() => {
  localStorage.clear();
});

afterEach(cleanup);

describe("UserMenu", () => {
  it("mostra le opzioni lingua e cambia lingua al click", () => {
    const { container } = render(
      <LanguageProvider>
        <UserMenu name="Ada Lovelace" username="ada" onLogout={vi.fn()} />
      </LanguageProvider>,
    );

    expect(screen.getByText("Lingua / Language")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Italiano" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    const menu = container.querySelector("details");
    expect(menu).not.toBeNull();
    if (menu) menu.open = true;

    fireEvent.click(screen.getByRole("button", { name: "English" }));

    expect(screen.getByText("Lingua / Language")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(menu?.open).toBe(false);
    expect(localStorage.getItem("infraorgit-language")).toBe("en");
  });
});
