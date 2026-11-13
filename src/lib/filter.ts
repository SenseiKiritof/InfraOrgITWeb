/**
 * Client-side table filters. `query` is already trimmed and lowercased by
 * `EntitySection`, so the column only decides how to match.
 */
export function includesText(
  value: string | number | null | undefined,
  query: string,
): boolean {
  return String(value ?? "")
    .toLowerCase()
    .includes(query);
}

/** Prefix match for numeric columns such as ports and counts. */
export function startsWithValue(
  value: string | number | null | undefined,
  query: string,
): boolean {
  return String(value ?? "").startsWith(query);
}
