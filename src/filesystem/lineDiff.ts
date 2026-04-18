import { normalizeContent } from "./normalizeContent.js"

/**
 * Represents a line-based diff operation
 */
export interface LineDiffOperation {
  line: number
  operation: "insert" | "replace" | "delete"
  text?: string
}

/**
 * Options for diff operations (used by applyLineDiff)
 */
export interface DiffOptions {
  ignoreWhitespace?: boolean
  ignoreCase?: boolean
  contextLines?: number
}

/**
 * Applies a series of line-based operations to text content
 * Maintains correct line offsets as operations affect line numbers
 */
export function applyLineDiff(
  existingContent: string,
  ops: LineDiffOperation[],
  options: DiffOptions = {}
): string {
  const normalizedContent = normalizeContent(existingContent, {
    normalizeWhitespace: options.ignoreWhitespace,
    ignoreCase: options.ignoreCase,
  })
  const lines = normalizedContent.split("\n")

  // Sort operations by line number to process in order
  ops.sort((a, b) => a.line - b.line)

  // Track offset as operations shift line numbers
  let offset = 0

  for (const op of ops) {
    // Adjust index based on current offset
    const idx = op.line - 1 + offset

    switch (op.operation) {
      case "insert":
        if (!op.text) continue

        const normalizedText = normalizeContent(op.text, {
          normalizeWhitespace: options.ignoreWhitespace,
          ignoreCase: options.ignoreCase,
        })

        if (idx < 0) {
          // Insert at beginning
          lines.unshift(normalizedText)
          offset++
        } else if (idx >= lines.length) {
          // Insert at end
          lines.push(normalizedText)
          offset++
        } else {
          // Insert at position
          lines.splice(idx + 1, 0, normalizedText)
          offset++
        }
        break

      case "replace":
        if (!op.text) continue

        if (idx < 0 || idx >= lines.length) continue

        // Replace existing line
        lines[idx] = normalizeContent(op.text, {
          normalizeWhitespace: options.ignoreWhitespace,
          ignoreCase: options.ignoreCase,
        })
        break

      case "delete":
        if (idx < 0 || idx >= lines.length) continue

        // Delete line
        lines.splice(idx, 1)
        offset--
        break
    }
  }

  return lines.join("\n")
}
