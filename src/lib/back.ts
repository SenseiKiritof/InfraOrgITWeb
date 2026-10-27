export type BackAction = { kind: "history" } | { kind: "parent"; to: string };

/**
 * "Indietro" on a detail page returns through history when the page was
 * reached inside the app, so list filters survive; a direct visit falls back
 * to the parent list.
 */
export function backAction(historyIdx: number, parent: string): BackAction {
  if (historyIdx > 0) return { kind: "history" };
  return { kind: "parent", to: `/${parent}` };
}
