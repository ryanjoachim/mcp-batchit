/**
 * Represents a line-based diff operation
 */
export interface LineDiffOperation {
  line: number;
  operation: "insert" | "replace" | "delete";
  text?: string;
}

/**
 * Applies a series of line-based operations to text content
 * Maintains correct line offsets as operations affect line numbers
 */
export function applyLineDiff(
  existingContent: string,
  ops: LineDiffOperation[]
): string {
  const lines = existingContent.split("\n");

  // Sort operations by line number to process in order
  ops.sort((a, b) => a.line - b.line);

  // Track offset as operations shift line numbers
  let offset = 0;

  for (const op of ops) {
    // Adjust index based on current offset
    const idx = op.line - 1 + offset;

    switch (op.operation) {
      case "insert":
        if (!op.text) continue;

        if (idx < 0) {
          // Insert at beginning
          lines.unshift(op.text);
          offset++;
        } else if (idx >= lines.length) {
          // Insert at end
          lines.push(op.text);
          offset++;
        } else {
          // Insert at position
          lines.splice(idx + 1, 0, op.text);
          offset++;
        }
        break;

      case "replace":
        if (!op.text) continue;

        if (idx < 0 || idx >= lines.length) continue;

        // Replace existing line
        lines[idx] = op.text;
        break;

      case "delete":
        if (idx < 0 || idx >= lines.length) continue;

        // Delete line
        lines.splice(idx, 1);
        offset--;
        break;
    }
  }

  return lines.join("\n");
}
