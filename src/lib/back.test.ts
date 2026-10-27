import { describe, expect, it } from "vitest";
import { backAction } from "./back";

describe("backAction", () => {
  it("usa la cronologia quando la pagina è stata aperta nell'app", () => {
    expect(backAction(3, "servers")).toEqual({ kind: "history" });
  });

  it("torna alla lista padre quando non c'è cronologia", () => {
    expect(backAction(0, "servers")).toEqual({
      kind: "parent",
      to: "/servers",
    });
    expect(backAction(0, "diagrams")).toEqual({
      kind: "parent",
      to: "/diagrams",
    });
  });
});
