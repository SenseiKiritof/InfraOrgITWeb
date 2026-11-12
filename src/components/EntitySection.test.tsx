import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntitySection } from "./EntitySection";

const rows = [{ id: 1, name: "Primo" }];

afterEach(cleanup);

describe("EntitySection", () => {
  it("ordina le righe cliccando l'intestazione", () => {
    render(
      <EntitySection
        rows={[
          { id: 1, name: "Beta" },
          { id: 2, name: "Alpha" },
        ]}
        columns={[{ key: "name", label: "Nome", render: (row) => row.name }]}
        fields={[]}
        empty={{}}
        toForm={() => ({})}
        canWrite={false}
        onSave={async () => {}}
      />,
    );

    const header = screen.getByRole("button", { name: "Nome" });
    fireEvent.click(header);
    expect(
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual(["Alpha", "Beta"]);

    fireEvent.click(header);
    expect(
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual(["Beta", "Alpha"]);
  });

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

  it("pagina le righe", () => {
    const many = Array.from({ length: 21 }, (_, index) => ({
      id: index + 1,
      name: `Voce ${index + 1}`,
    }));

    render(
      <EntitySection
        rows={many}
        columns={[{ key: "name", label: "Nome", render: (row) => row.name }]}
        fields={[]}
        empty={{}}
        toForm={() => ({})}
        canWrite={false}
        onSave={async () => {}}
      />,
    );

    expect(screen.getAllByRole("row")).toHaveLength(21);
    expect(screen.getByText(/21 elementi/)).toBeInTheDocument();
    expect(screen.getByText(/Pagina 1 di 2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Successiva" }));
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText("Voce 21")).toBeInTheDocument();
    expect(screen.getByText(/Pagina 2 di 2/)).toBeInTheDocument();
  });

  it("cambia il numero di elementi per pagina", () => {
    const many = Array.from({ length: 25 }, (_, index) => ({
      id: index + 1,
      name: `Voce ${index + 1}`,
    }));

    render(
      <EntitySection
        rows={many}
        columns={[{ key: "name", label: "Nome", render: (row) => row.name }]}
        fields={[]}
        empty={{}}
        toForm={() => ({})}
        canWrite={false}
        onSave={async () => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText("Elementi per pagina"), {
      target: { value: "10" },
    });

    expect(screen.getAllByRole("row")).toHaveLength(11);
    expect(screen.getByText(/Pagina 1 di 3/)).toBeInTheDocument();
  });

  it("nasconde la creazione quando canCreate è false", () => {
    render(
      <EntitySection
        rows={rows}
        columns={[{ key: "name", label: "Nome", render: (row) => row.name }]}
        fields={[]}
        empty={{}}
        toForm={() => ({})}
        canWrite
        canCreate={false}
        onSave={async () => {}}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Nuovo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Modifica" }),
    ).toBeInTheDocument();
  });

  it("filtra per colonna e azzera i filtri", () => {
    render(
      <EntitySection
        rows={[
          { id: 1, name: "Alpha" },
          { id: 2, name: "Beta" },
        ]}
        columns={[
          {
            key: "name",
            label: "Nome",
            render: (row) => row.name,
            filter: (row, value) => row.name.toLowerCase().includes(value),
          },
        ]}
        fields={[]}
        empty={{}}
        toForm={() => ({})}
        canWrite={false}
        onSave={async () => {}}
      />,
    );

    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Filtra Nome"), {
      target: { value: "BET" },
    });

    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Azzera filtri" }));

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Azzera filtri")).not.toBeInTheDocument();
  });

  it("riporta alla prima pagina quando cambia un filtro", () => {
    const many = Array.from({ length: 25 }, (_, index) => ({
      id: index + 1,
      name: `Voce ${index + 1}`,
    }));

    render(
      <EntitySection
        rows={many}
        columns={[
          {
            key: "name",
            label: "Nome",
            render: (row) => row.name,
            filter: (row, value) => row.name.toLowerCase().includes(value),
          },
        ]}
        fields={[]}
        empty={{}}
        toForm={() => ({})}
        canWrite={false}
        onSave={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Successiva" }));
    expect(screen.getByText("Voce 21")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filtra Nome"), {
      target: { value: "voce 1" },
    });

    expect(screen.getByText("Voce 1")).toBeInTheDocument();
    expect(screen.queryByText("Voce 21")).not.toBeInTheDocument();
    expect(screen.getByText(/11 elementi/)).toBeInTheDocument();
  });

  it("usa l'ordine predefinito e lo ripristina azzerando il sort", () => {
    render(
      <EntitySection
        rows={[
          { id: 1, name: "Beta" },
          { id: 2, name: "Alpha" },
        ]}
        defaultOrder={(left, right) => left.name.localeCompare(right.name)}
        columns={[{ key: "name", label: "Nome", render: (row) => row.name }]}
        fields={[]}
        empty={{}}
        toForm={() => ({})}
        canWrite={false}
        onSave={async () => {}}
      />,
    );

    const header = screen.getByRole("button", { name: "Nome" });
    const order = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent);

    expect(order()).toEqual(["Alpha", "Beta"]);
    fireEvent.click(header);
    fireEvent.click(header);
    expect(order()).toEqual(["Beta", "Alpha"]);
    fireEvent.click(header);
    expect(order()).toEqual(["Alpha", "Beta"]);
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
