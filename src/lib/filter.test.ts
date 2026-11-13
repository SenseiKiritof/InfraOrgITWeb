import { describe, expect, it } from "vitest";
import { includesText, startsWithValue } from "./filter";

describe("table filters", () => {
  it("includesText ignora maiuscole e valori mancanti", () => {
    expect(includesText("Web-01", "web")).toBe(true);
    expect(includesText("192.168.1.10", ".1.1")).toBe(true);
    expect(includesText(null, "x")).toBe(false);
    expect(includesText(22, "2")).toBe(true);
  });

  it("startsWithValue confronta il prefisso numerico", () => {
    expect(startsWithValue(2222, "22")).toBe(true);
    expect(startsWithValue(22, "222")).toBe(false);
    expect(startsWithValue(null, "1")).toBe(false);
  });
});
