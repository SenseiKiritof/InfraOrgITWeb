export type EolTone = "danger" | "warning" | "neutral";

/** Date-only EOL: red when expired, orange within 60 days. */
export function eolInfo(value: string | null, now = new Date()) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const days = Math.ceil(
    (date.getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000,
  );
  const tone: EolTone =
    days < 0 ? "danger" : days <= 60 ? "warning" : "neutral";
  return { date, days, tone };
}

/** RHEL, SLES and Debian are always LTS; the override only affects Ubuntu. */
export function ltsIsFixed(osName: string | null): boolean {
  const name = (osName ?? "").toLowerCase();
  return /red hat|rhel|alma|rocky|oracle linux|suse|sles|debian/.test(name);
}
