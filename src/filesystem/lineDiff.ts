import fs from "fs/promises";
import path from "path";
import { createTwoFilesPatch } from "diff";
import { isBinaryFile } from "isbinaryfile";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

/**
 * Options for diff operations
 */
export interface DiffOptions {
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
  contextLines?: number;
}

/**
 * Result of a diff operation
 */
export interface DiffResult {
  isDifferent: boolean;
  diff?: string;
  isBinary: boolean;
  warnings?: string[];
}

/**
 * Represents a line-based diff operation
 */
export interface LineDiffOperation {
  line: number;
  operation: "insert" | "replace" | "delete";
  text?: string;
}

/**
 * Normalizes line endings and optionally handles whitespace and case
 */
export function normalizeContent(content: string, options: DiffOptions = {}): string {
  let result = content.replace(/\r\n/g, "\n");

  if (options.ignoreWhitespace) {
    result = result.replace(/\s+/g, " ").trim();
  }

  if (options.ignoreCase) {
    result = result.toLowerCase();
  }

  return result;
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
  const normalizedContent = normalizeContent(existingContent, options);
  const lines = normalizedContent.split("\n");

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

        const normalizedText = normalizeContent(op.text, options);

        if (idx < 0) {
          // Insert at beginning
          lines.unshift(normalizedText);
          offset++;
        } else if (idx >= lines.length) {
          // Insert at end
          lines.push(normalizedText);
          offset++;
        } else {
          // Insert at position
          lines.splice(idx + 1, 0, normalizedText);
          offset++;
        }
        break;

      case "replace":
        if (!op.text) continue;

        if (idx < 0 || idx >= lines.length) continue;

        // Replace existing line
        lines[idx] = normalizeContent(op.text, options);
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

/**
 * Compares two files and generates a diff
 */
export async function compareFiles(
  oldPath: string,
  newPath: string,
  rootDirectory: string,
  options: DiffOptions = {}
): Promise<DiffResult> {
  try {
    // Basic path validation for oldPath
    if (!path.isAbsolute(oldPath)) {
      throw new McpError(ErrorCode.InvalidParams, `Old path must be absolute: ${oldPath}`);
    }

    const normalizedOld = path.normalize(oldPath);

    if (normalizedOld.includes("..")) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Old path cannot contain parent directory references (..): ${normalizedOld}`
      );
    }

    if (!normalizedOld.startsWith(path.normalize(rootDirectory))) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Old path must be within root directory ${rootDirectory}: ${normalizedOld}`
      );
    }

    // Basic path validation for newPath
    if (!path.isAbsolute(newPath)) {
      throw new McpError(ErrorCode.InvalidParams, `New path must be absolute: ${newPath}`);
    }

    const normalizedNew = path.normalize(newPath);

    if (normalizedNew.includes("..")) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `New path cannot contain parent directory references (..): ${normalizedNew}`
      );
    }

    if (!normalizedNew.startsWith(path.normalize(rootDirectory))) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `New path must be within root directory ${rootDirectory}: ${normalizedNew}`
      );
    }

    // Check if files exist
    try {
      await fs.access(normalizedOld);
      await fs.access(normalizedNew);
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `One or both files do not exist: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Check if either file is binary
    const [isOldBinary, isNewBinary] = await Promise.all([
      isBinaryFile(normalizedOld),
      isBinaryFile(normalizedNew)
    ]);

    // If either file is binary, compare them as binary
    if (isOldBinary || isNewBinary) {
      const [oldBuffer, newBuffer] = await Promise.all([
        fs.readFile(normalizedOld),
        fs.readFile(normalizedNew)
      ]);

      return {
        isDifferent: !oldBuffer.equals(newBuffer),
        isBinary: true,
        diff: `Files are ${oldBuffer.equals(newBuffer) ? 'identical' : 'different'} (binary comparison)`
      };
    }

    // Read and normalize file contents
    const [oldContent, newContent] = await Promise.all([
      fs.readFile(normalizedOld, "utf-8").then(content => normalizeContent(content, options)),
      fs.readFile(normalizedNew, "utf-8").then(content => normalizeContent(content, options))
    ]);

    // Generate diff
    const diff = createTwoFilesPatch(
      path.basename(normalizedOld),
      path.basename(normalizedNew),
      oldContent,
      newContent,
      undefined,
      undefined,
      { context: options.contextLines ?? 3 }
    );

    return {
      isDifferent: oldContent !== newContent,
      diff,
      isBinary: false
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Failed to compare files: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
