import { describe, expect, it } from "vitest";
import { compareServerDefault } from "./serverOrder";

describe("compareServerDefault", () => {
  it("ordina per ambiente poi nome, con numeri naturali", () => {
    const rows = [
      { name: "web10", providerEnvironmentLabel: "Sviluppo" },
      { name: "db2", providerEnvironmentLabel: "Produzione" },
      { name: "web2", providerEnvironmentLabel: "Sviluppo" },
      { name: "web2", providerEnvironmentLabel: "Produzione" },
    ];

    expect(
      [...rows]
        .sort(compareServerDefault)
        .map((row) => `${row.providerEnvironmentLabel}/${row.name}`),
    ).toEqual([
      "Produzione/db2",
      "Produzione/web2",
      "Sviluppo/web2",
      "Sviluppo/web10",
    ]);
  });
});
