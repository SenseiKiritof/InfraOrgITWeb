import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiSpecImport } from "./ApiSpecImport";

const spec = JSON.stringify({
  openapi: "3.0.3",
  servers: [{ url: "https://api.example.com" }],
  paths: {
    "/health": { get: { summary: "Stato" } },
    "/items": {
      post: {
        requestBody: {
          content: { "application/json": { example: { name: "x" } } },
        },
      },
    },
  },
});

afterEach(cleanup);

describe("ApiSpecImport", () => {
  it("analizza una specifica e mostra le API da importare", () => {
    render(
      <ApiSpecImport versionId={1} csrfToken="csrf" onImported={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Apri" }));
    fireEvent.change(screen.getByLabelText("Documento OpenAPI o Swagger"), {
      target: { value: spec },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analizza" }));

    expect(
      screen.getByRole("button", { name: "Importa 2 API" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("https://api.example.com/health"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("https://api.example.com/items"),
    ).toBeInTheDocument();
  });

  it("mostra l'errore per un documento non valido", () => {
    render(
      <ApiSpecImport versionId={1} csrfToken="csrf" onImported={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Apri" }));
    fireEvent.change(screen.getByLabelText("Documento OpenAPI o Swagger"), {
      target: { value: '{"name":"x"}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analizza" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/OpenAPI/);
  });
});
