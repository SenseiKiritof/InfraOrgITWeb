import { getLanguage, type Language, localeFor } from "./i18n";

const units = ["B", "kB", "MB", "GB", "TB"] as const;

/** Decimal units with locale formatting: 12345 → "12,3 kB" (it), "12.3 kB" (en). */
export function formatBytes(
  bytes: number,
  language: Language = getLanguage(),
): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const text = value.toLocaleString(localeFor(language), {
    maximumFractionDigits: unit === 0 ? 0 : 1,
  });
  return `${text} ${units[unit]}`;
}

/** Local date and time in the selected language. */
export function formatDateTime(
  value: string,
  language: Language = getLanguage(),
): string {
  return new Date(value).toLocaleString(localeFor(language));
}
