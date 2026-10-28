const units = ["B", "kB", "MB", "GB", "TB"] as const;

/** Decimal units with Italian formatting: 12345 → "12,3 kB". */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const text = value.toLocaleString("it-IT", {
    maximumFractionDigits: unit === 0 ? 0 : 1,
  });
  return `${text} ${units[unit]}`;
}

/** Local date and time, Italian formatting. */
export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("it-IT");
}
