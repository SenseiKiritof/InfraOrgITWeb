import { describe, expect, it } from "vitest";
import { connectionChanged } from "./serverConnection";

const base = { ipAddress: "10.0.0.1", sshPort: 22, jumpServerId: null };

describe("connectionChanged", () => {
  it("ignora i campi che non cambiano la connessione", () => {
    expect(connectionChanged(base, { ...base })).toBe(false);
  });

  it("rileva IP, porta e proxy", () => {
    expect(connectionChanged(base, { ...base, ipAddress: "10.0.0.2" })).toBe(
      true,
    );
    expect(connectionChanged(base, { ...base, sshPort: 2222 })).toBe(true);
    expect(connectionChanged(base, { ...base, jumpServerId: 7 })).toBe(true);
  });
});
