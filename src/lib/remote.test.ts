import { describe, expect, it } from "vitest";
import type { Server } from "./inventory";
import { splitServersByCredential } from "./remote";

const server = (id: number, credentialId: number | null): Server => ({
  id,
  providerEnvironmentId: 1,
  providerEnvironmentLabel: "Provider / ENV",
  name: `srv-${id}`,
  ipAddress: "10.0.0.1",
  hostname: `srv-${id}.local`,
  sshPort: 22,
  credentialId,
  hasHostKey: false,
});

describe("splitServersByCredential", () => {
  it("separa associati e disponibili", () => {
    const result = splitServersByCredential(
      [server(1, 10), server(2, null), server(3, 10), server(4, 20)],
      10,
    );

    expect(result.assigned.map((item) => item.id)).toEqual([1, 3]);
    expect(result.available.map((item) => item.id)).toEqual([2]);
  });
});
