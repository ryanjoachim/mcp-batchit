import fs from "fs/promises"
import path from "path"
import { createTwoFilesPatch } from "diff"
import { isBinaryFile } from "isbinaryfile"
import { ErrorManager } from "../utils/errorManager.js"
import { FileSystem } from "./FileSystem.js"

/**
 * Options for diff operations
 */
export interface DiffOptions {
  ignoreWhitespace?: boolean
  ignoreCase?: boolean
  contextLines?: number
}

/**
 * Result of a diff operation
 */
export interface DiffResult {
  isDifferent: boolean
  diff?: string
  isBinary: boolean
  warnings?: string[]
}

/**
 * Represents a line-based diff operation
 */
export interface LineDiffOperation {
  line: number
  operation: "insert" | "replace" | "delete"
  text?: string
}

/**
 * Normalizes line endings and optionally handles whitespace and case
 */
export function normalizeContent(
  content: string,
  options: DiffOptions = {}
): string {
  let result = content.replace(/\r\n/g, "\n")

  if (options.ignoreWhitespace) {
    result = result.replace(/\s+/g, " ").trim()
  }

  if (options.ignoreCase) {
    result = result.toLowerCase()
  }

  return result
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
  const normalizedContent = normalizeContent(existingContent, options)
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

        const normalizedText = normalizeContent(op.text, options)

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
        lines[idx] = normalizeContent(op.text, options)
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
      throw ErrorManager.createPathValidationError(
        oldPath,
        "Must be absolute path"
      )
    }

    const normalizedOld = path.normalize(oldPath)

    if (normalizedOld.includes("..")) {
      throw ErrorManager.createPathValidationError(
        normalizedOld,
        "Cannot contain parent directory references (..)"
      )
    }

    if (!normalizedOld.startsWith(path.normalize(rootDirectory))) {
      throw ErrorManager.createPathValidationError(
        normalizedOld,
        `Must be within root directory ${rootDirectory}`
      )
    }

    // Basic path validation for newPath
    if (!path.isAbsolute(newPath)) {
      throw ErrorManager.createPathValidationError(
        newPath,
        "Must be absolute path"
      )
    }

    const normalizedNew = path.normalize(newPath)

    if (normalizedNew.includes("..")) {
      throw ErrorManager.createPathValidationError(
        normalizedNew,
        "Cannot contain parent directory references (..)"
      )
    }

    if (!normalizedNew.startsWith(path.normalize(rootDirectory))) {
      throw ErrorManager.createPathValidationError(
        normalizedNew,
        `Must be within root directory ${rootDirectory}`
      )
    }

    // Check if files exist using fs.access
    try {
      await fs.access(normalizedOld)
      await fs.access(normalizedNew)
    } catch (error) {
      throw ErrorManager.createNotFoundError(
        "File",
        `One or both files (${normalizedOld}, ${normalizedNew}) do not exist: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    // Check if either file is binary
    const [isOldBinary, isNewBinary] = await Promise.all([
      isBinaryFile(normalizedOld),
      isBinaryFile(normalizedNew),
    ])

    // If either file is binary, compare them as binary
    if (isOldBinary || isNewBinary) {
      const [oldBuffer, newBuffer] = await Promise.all([
        fs.readFile(normalizedOld),
        fs.readFile(normalizedNew),
      ])

      return {
        isDifferent: !oldBuffer.equals(newBuffer),
        isBinary: true,
        diff: `Files are ${oldBuffer.equals(newBuffer) ? "identical" : "different"} (binary comparison)`,
      }
    }

    // For text files, use FileSystem class for proper error handling
    const fileSystem = new FileSystem({ rootDirectory })

    // Read and normalize file contents
    const [oldContent, newContent] = await Promise.all([
      fileSystem
        .readFile(normalizedOld, { checkBinary: false })
        .then((content) => normalizeContent(content, options)),
      fileSystem
        .readFile(normalizedNew, { checkBinary: false })
        .then((content) => normalizeContent(content, options)),
    ])

    // Generate diff
    const diff = createTwoFilesPatch(
      path.basename(normalizedOld),
      path.basename(normalizedNew),
      oldContent,
      newContent,
      undefined,
      undefined,
      { context: options.contextLines ?? 3 }
    )

    return {
      isDifferent: oldContent !== newContent,
      diff,
      isBinary: false,
    }
  } catch (error) {
    throw ErrorManager.normalizeError(
      error,
      `Failed to compare files ${path.basename(oldPath)} and ${path.basename(newPath)}`
    )
  }
}
