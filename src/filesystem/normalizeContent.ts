/**
 * Shared content normalization for consistent whitespace and case handling.
 */

export interface NormalizeOptions {
  /** Collapse spaces/tabs (not newlines) to single space, then trim */
  normalizeWhitespace?: boolean
  /** Lowercase for case-insensitive comparison */
  ignoreCase?: boolean
}

/**
 * Normalize line endings (CRLF -> LF) and optionally collapse whitespace and case.
 * Uses /[ \t]+/g to collapse spaces/tabs without destroying newlines,
 * since both diff generation and line-diff application work line-by-line.
 */
export function normalizeContent(
  content: string,
  options: NormalizeOptions = {}
): string {
  let result = content.replace(/\r\n/g, "\n")

  if (options.normalizeWhitespace) {
    result = result.replace(/[ \t]+/g, " ").trim()
  }

  if (options.ignoreCase) {
    result = result.toLowerCase()
  }

  return result
}
