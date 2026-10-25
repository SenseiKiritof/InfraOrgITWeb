import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntitySection } from "./EntitySection";

const rows = [{ id: 1, name: "Primo" }];

afterEach(cleanup);

describe("EntitySection", () => {
  it("mostra le righe e crea un elemento", async () => {
    const onSave = vi.fn(async () => {});
    render(
      <EntitySection
        rows={rows}
        columns={[{ key: "name", label: "Nome", render: (row) => row.name }]}
        fields={[{ name: "name", label: "Nome", required: true }]}
        empty={{ name: "" }}
        toForm={(row) => ({ name: row.name })}
        canWrite
        onSave={onSave}
        createLabel="Nuovo"
      />,
    );

    expect(screen.getByText("Primo")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nuovo" }));
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Secondo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));

    expect(onSave).toHaveBeenCalledWith(null, { name: "Secondo" });
  });

  it("nasconde le azioni di scrittura senza permesso", () => {
    render(
      <EntitySection
        rows={rows}
        columns={[{ key: "name", label: "Nome", render: (row) => row.name }]}
        fields={[]}
        empty={{}}
        toForm={() => ({})}
        canWrite={false}
        onSave={async () => {}}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Nuovo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Modifica" }),
    ).not.toBeInTheDocument();
  });
});
