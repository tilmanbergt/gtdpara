/** The text of a caught value: an Error's message, anything else as a string. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
