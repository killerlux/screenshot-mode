function escapeRegex(str: string): string {
  return str.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

/**
 * Escapes a literal selection into a pattern for the string match mode.
 *
 * Pretty formatting only changes whitespace, and it may add it where the raw
 * message had none (for example after a colon) or remove it where the raw
 * message wrapped. A whitespace run in the selection therefore matches any
 * amount of whitespace, so a rule captured in one view keeps matching the same
 * content in the other view.
 */
export function escapeLiteralPattern(str: string): string {
  return escapeRegex(str).replace(/\s+/g, "\\s*");
}
