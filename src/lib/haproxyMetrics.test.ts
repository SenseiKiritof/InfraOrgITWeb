import { describe, expect, it } from "vitest";
import type { HaproxyMetricPoint } from "./haproxy";
import {
  bucketSeconds,
  errorPercent,
  perMinuteFactor,
  sumSeriesByTimestamp,
  toPerMinute,
} from "./haproxyMetrics";

function point(
  timestamp: string,
  values: { req?: number; h4xx?: number; h5xx?: number } = {},
): HaproxyMetricPoint {
  return {
    timestamp,
    req: values.req ?? 0,
    h4xx: values.h4xx ?? 0,
    h5xx: values.h5xx ?? 0,
    bin: 0,
    bout: 0,
    scur: 0,
    qcur: 0,
    rtime: 0,
    ctime: 0,
    ttime: 0,
    qtime: 0,
  };
}

const at = (minute: number) =>
  new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString();

describe("haproxyMetrics", () => {
  it("keeps per-minute buckets unchanged", () => {
    const points = [at(0), at(1), at(2)].map((timestamp) => point(timestamp));
    expect(bucketSeconds(points)).toBe(60);
    expect(perMinuteFactor(points)).toBe(1);
  });

  it("divides 5-minute buckets by five", () => {
    const points = [at(0), at(5), at(10)].map((timestamp) => point(timestamp));
    expect(bucketSeconds(points)).toBe(300);
    expect(perMinuteFactor(points)).toBeCloseTo(0.2);

    const [first] = toPerMinute([
      point(at(0), { req: 500, h4xx: 10, h5xx: 50 }),
      point(at(5)),
      point(at(10)),
    ]);
    expect(first.req).toBeCloseTo(100);
    expect(first.h4xx).toBeCloseTo(2);
    expect(first.h5xx).toBeCloseTo(10);
  });

  it("ignores a single gap thanks to the median", () => {
    const points = [at(0), at(5), at(10), at(25), at(30)].map((timestamp) =>
      point(timestamp),
    );
    expect(bucketSeconds(points)).toBe(300);
  });

  it("falls back to 60 s without usable deltas", () => {
    expect(bucketSeconds([])).toBe(60);
    expect(bucketSeconds([point(at(0))])).toBe(60);
  });

  it("sums series per timestamp and sorts the result", () => {
    const total = sumSeriesByTimestamp([
      [point(at(2), { req: 3, h5xx: 1 }), point(at(0), { req: 1 })],
      [point(at(0), { req: 10, h5xx: 2 }), point(at(2), { req: 30 })],
    ]);
    expect(total.map((entry) => entry.timestamp)).toEqual([at(0), at(2)]);
    expect(total[0].req).toBe(11);
    expect(total[0].h5xx).toBe(2);
    expect(total[1].req).toBe(33);
    expect(total[1].h5xx).toBe(1);
  });

  it("keeps a timestamp present in one series only", () => {
    const total = sumSeriesByTimestamp([
      [point(at(0), { req: 5 })],
      [point(at(1), { req: 7 }), point(at(2), { req: 9 })],
    ]);
    expect(total.map((entry) => entry.req)).toEqual([5, 7, 9]);
  });

  it("adds a repeated timestamp inside the same series", () => {
    const total = sumSeriesByTimestamp([
      [point(at(0), { req: 2 }), point(at(0), { req: 3 })],
      [point(at(0), { req: 1 })],
    ]);
    expect(total).toHaveLength(1);
    expect(total[0].req).toBe(6);
  });

  it("computes the error percentage and guards zero requests", () => {
    expect(errorPercent(5, 200)).toBeCloseTo(2.5);
    expect(errorPercent(0, 40)).toBe(0);
    expect(errorPercent(3, 0)).toBeNull();
    expect(errorPercent(0, 0)).toBeNull();
  });
});
