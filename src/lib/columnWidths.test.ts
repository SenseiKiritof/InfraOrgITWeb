import { describe, expect, it } from "vitest";
import { columnWidths } from "./columnWidths";

describe("columnWidths", () => {
  it("pesa le colonne sul valore più lungo e somma a 100", () => {
    const rows = [
      { id: 1, short: "a", long: "un valore decisamente lungo" },
      { id: 2, short: "bb", long: "altro" },
    ];
    const widths = columnWidths(
      [
        { label: "Corto", render: (row: (typeof rows)[number]) => row.short },
        { label: "Lungo", render: (row: (typeof rows)[number]) => row.long },
      ],
      rows,
      10,
    );

    expect(widths).toHaveLength(3);
    const numbers = widths.map((width) => Number.parseFloat(width));
    expect(numbers.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 1);
    expect(numbers[1]).toBeGreaterThan(numbers[0]);
  });
});
