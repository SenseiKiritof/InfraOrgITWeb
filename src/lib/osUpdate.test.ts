import { describe, expect, it } from "vitest";
import { eolInfo, ltsIsFixed } from "./osUpdate";

describe("osUpdate", () => {
  const now = new Date(2026, 10, 20);

  it("flags an expired EOL in red", () => {
    const info = eolInfo("2026-10-01", now);
    expect(info?.tone).toBe("danger");
    expect(info?.days).toBeLessThan(0);
  });

  it("flags an EOL within 60 days in orange", () => {
    const info = eolInfo("2026-12-15", now);
    expect(info?.tone).toBe("warning");
    expect(info?.days).toBeGreaterThan(0);
    expect(info?.days).toBeLessThanOrEqual(60);
  });

  it("keeps a distant EOL neutral", () => {
    expect(eolInfo("2029-05-31", now)?.tone).toBe("neutral");
    expect(eolInfo(null)).toBeNull();
  });

  it("treats RHEL, SLES and Debian as fixed LTS", () => {
    expect(ltsIsFixed("Red Hat Enterprise Linux")).toBe(true);
    expect(ltsIsFixed("SUSE Linux Enterprise Server")).toBe(true);
    expect(ltsIsFixed("Debian GNU/Linux")).toBe(true);
    expect(ltsIsFixed("Ubuntu")).toBe(false);
  });
});
