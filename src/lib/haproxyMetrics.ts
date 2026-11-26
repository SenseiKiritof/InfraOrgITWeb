import type { HaproxyMetricPoint } from "./haproxy";

/**
 * Median spacing between consecutive samples, in seconds (60 s fallback).
 * The metrics API does not declare its resolution: it aggregates to 5 minutes
 * above 7 days and to 1 minute otherwise.
 */
export function bucketSeconds(samples: { timestamp: string }[]): number {
  const deltas: number[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const delta =
      (Date.parse(samples[index].timestamp) -
        Date.parse(samples[index - 1].timestamp)) /
      1000;
    if (delta > 0) deltas.push(delta);
  }
  if (deltas.length === 0) return 60;
  deltas.sort((a, b) => a - b);
  const middle = Math.floor(deltas.length / 2);
  return deltas.length % 2 === 0
    ? (deltas[middle - 1] + deltas[middle]) / 2
    : deltas[middle];
}

/** Factor that turns a per-bucket count into a per-minute value. */
export function perMinuteFactor(samples: { timestamp: string }[]): number {
  return 60 / bucketSeconds(samples);
}

/**
 * Sum of the given series per timestamp, sorted by timestamp.
 * A timestamp present in a single series counts only that series; a timestamp
 * repeated inside a series is added every time.
 */
export function sumSeriesByTimestamp(
  series: HaproxyMetricPoint[][],
): HaproxyMetricPoint[] {
  const byTime = new Map<string, HaproxyMetricPoint>();
  for (const points of series) {
    for (const point of points) {
      const current = byTime.get(point.timestamp);
      if (!current) {
        byTime.set(point.timestamp, { ...point });
        continue;
      }
      current.req += point.req;
      current.h4xx += point.h4xx;
      current.h5xx += point.h5xx;
      current.bin += point.bin;
      current.bout += point.bout;
      current.scur += point.scur;
      current.qcur += point.qcur;
    }
  }
  return [...byTime.values()].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
}

/**
 * Error count as a percentage of the bucket requests, or null without traffic.
 */
export function errorPercent(count: number, req: number): number | null {
  return req > 0 ? (count / req) * 100 : null;
}

/** Copy of the points with req/h4xx/h5xx converted to per-minute values. */
export function toPerMinute(
  points: HaproxyMetricPoint[],
): HaproxyMetricPoint[] {
  const factor = perMinuteFactor(points);
  return points.map((point) => ({
    ...point,
    req: point.req * factor,
    h4xx: point.h4xx * factor,
    h5xx: point.h5xx * factor,
  }));
}
