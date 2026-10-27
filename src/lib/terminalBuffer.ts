export const MAX_OUTPUT = 100_000;

/**
 * Appende un chunk al buffer del terminale. Quando supera il limite taglia
 * all'inizio della riga successiva, così il parser ANSI non riparte mai da
 * metà sequenza di escape (che produrrebbe testo fuori posto).
 */
export function appendOutput(current: string, text: string): string {
  const next = current + text;
  if (next.length <= MAX_OUTPUT) return next;
  const tail = next.slice(next.length - MAX_OUTPUT);
  const newline = tail.indexOf("\n");
  return newline === -1 ? tail : tail.slice(newline + 1);
}
