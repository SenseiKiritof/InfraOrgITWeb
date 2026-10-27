import { describe, expect, it } from "vitest";
import { appendOutput, MAX_OUTPUT } from "./terminalBuffer";

describe("appendOutput", () => {
  it("accoda senza tagliare sotto il limite", () => {
    expect(appendOutput("abc", "def")).toBe("abcdef");
  });

  it("taglia all'inizio della riga dopo il limite", () => {
    const current = "a".repeat(MAX_OUTPUT);
    const next = appendOutput(current, "\nultima riga\nnuova riga");

    expect(next.length).toBeLessThanOrEqual(MAX_OUTPUT);
    expect(next.startsWith("ultima riga")).toBe(true);
    expect(next.endsWith("nuova riga")).toBe(true);
  });

  it("non lascia una sequenza di escape spezzata in testa", () => {
    const current = `${"x".repeat(MAX_OUTPUT - 5)}\u001b[3`;
    const next = appendOutput(current, "2mrosso\u001b[0m\nok");

    expect(next.startsWith("\u001b[3")).toBe(false);
    expect(next.endsWith("ok")).toBe(true);
  });
});
