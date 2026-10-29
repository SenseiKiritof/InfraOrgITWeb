import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatBytes, formatDateTime } from "./format";
import { LANGUAGE_STORAGE_KEY, LanguageProvider, useI18n } from "./i18n";

function Probe() {
  const { language, setLanguage, t } = useI18n();
  return (
    <div>
      <span data-testid="language">{language}</span>
      <span data-testid="label">{t("common.save")}</span>
      <span data-testid="greeting">{t("app.welcome", { name: "Ada" })}</span>
      <button type="button" onClick={() => setLanguage("en")}>
        English
      </button>
      <button type="button" onClick={() => setLanguage("it")}>
        Italiano
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <LanguageProvider>
      <Probe />
    </LanguageProvider>,
  );
}

describe("i18n", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = "";
  });

  afterEach(cleanup);

  it("usa l'italiano come lingua predefinita", () => {
    renderProbe();

    expect(screen.getByTestId("language")).toHaveTextContent("it");
    expect(screen.getByTestId("label")).toHaveTextContent("Salva");
    expect(screen.getByTestId("greeting")).toHaveTextContent("Benvenuto, Ada.");
    expect(document.documentElement.lang).toBe("it");
    expect(formatBytes(12_345)).toBe("12,3 kB");
    expect(formatDateTime("2026-01-02T03:04:05Z")).toBe(
      new Date("2026-01-02T03:04:05Z").toLocaleString("it-IT"),
    );
  });

  it("passa all'inglese subito e aggiorna il lang", () => {
    renderProbe();

    fireEvent.click(screen.getByRole("button", { name: "English" }));

    expect(screen.getByTestId("language")).toHaveTextContent("en");
    expect(screen.getByTestId("label")).toHaveTextContent("Save");
    expect(screen.getByTestId("greeting")).toHaveTextContent("Welcome, Ada.");
    expect(document.documentElement.lang).toBe("en");
    expect(formatBytes(12_345)).toBe("12.3 kB");
    expect(formatDateTime("2026-01-02T03:04:05Z")).toBe(
      new Date("2026-01-02T03:04:05Z").toLocaleString("en-GB"),
    );
  });

  it("salva la scelta e la rilegge al montaggio", () => {
    const first = renderProbe();

    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");

    first.unmount();
    renderProbe();

    expect(screen.getByTestId("language")).toHaveTextContent("en");
    expect(screen.getByTestId("label")).toHaveTextContent("Save");
    expect(document.documentElement.lang).toBe("en");
  });
});
