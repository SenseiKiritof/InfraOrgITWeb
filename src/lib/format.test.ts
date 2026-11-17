import { describe, expect, it } from "vitest";
import { formatBytes } from "./format";

describe("formatBytes", () => {
  it("uses decimal units and English decimals by default", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(12_345)).toBe("12.3 kB");
    expect(formatBytes(1_048_576)).toBe("1 MB");
  });

  it("uses Italian decimals when Italian is requested", () => {
    expect(formatBytes(12_345, "it")).toBe("12,3 kB");
  });
});
