import fs from "fs/promises"
import path from "path"
import { ErrorManager } from "../utils/errorManager.js"
import {
  normalizeContent,
  DiffOptions,
  compareFiles,
  LineDiffOperation,
  applyLineDiff,
} from "./lineDiff.js"

/**
 * Represents a text edit operation
 */
export interface EditOperation {
  oldText: string
  newText: string
}

/**
 * Applies a series of edit operations to a file with diffing support
 */
export async function editFile(
  filePath: string,
  edits: EditOperation[],
  rootDirectory: string,
  dryRun: boolean = false,
  options: DiffOptions = {}
): Promise<string> {
  try {
    // Basic path validation
    if (!path.isAbsolute(filePath)) {
      throw ErrorManager.createPathValidationError(
        filePath,
        "Must be absolute path"
      )
    }

    const normalized = path.normalize(filePath)

    if (normalized.includes("..")) {
      throw ErrorManager.createPathValidationError(
        normalized,
        "Cannot contain parent directory references (..)"
      )
    }

    if (!normalized.startsWith(path.normalize(rootDirectory))) {
      throw ErrorManager.createPathValidationError(
        normalized,
        `Must be within root directory ${rootDirectory}`
      )
    }

    // Read original content
    let originalContent: string
    try {
      originalContent = normalizeContent(
        await fs.readFile(normalized, "utf-8"),
        options
      )
    } catch (error) {
      throw ErrorManager.normalizeError(
        error,
        `Failed to read file ${normalized}`
      )
    }

    // Convert edits to line operations
    const lineOperations: LineDiffOperation[] = []
    const warnings: string[] = []

    // Split content into lines for analysis
    const contentLines = originalContent.split("\n")

    for (const edit of edits) {
      const normalizedOld = normalizeContent(edit.oldText, options)
      const normalizedNew = normalizeContent(edit.newText, options)

      // Find the line number where this edit should be applied
      const matchIndex = contentLines.findIndex((line) =>
        normalizeContent(line, options).includes(normalizedOld)
      )

      if (matchIndex !== -1) {
        // Add as a replace operation
        lineOperations.push({
          line: matchIndex + 1, // Convert to 1-based line numbers
          operation: "replace",
          text: contentLines[matchIndex].replace(normalizedOld, normalizedNew),
        })
      } else {
        warnings.push(
          `Could not find match for pattern: ${edit.oldText.substring(0, 40)}...`
        )
      }
    }

    // Apply the line operations
    const modifiedContent = applyLineDiff(
      originalContent,
      lineOperations,
      options
    )

    // Create temporary files for diffing
    const tmpOriginal = path.join(
      path.dirname(normalized),
      `.tmp_original_${Date.now()}`
    )
    const tmpModified = path.join(
      path.dirname(normalized),
      `.tmp_modified_${Date.now()}`
    )

    let result = ""

    try {
      await fs.writeFile(tmpOriginal, originalContent)
      await fs.writeFile(tmpModified, modifiedContent)

      // Generate diff using the consolidated functionality
      const { diff } = await compareFiles(
        tmpOriginal,
        tmpModified,
        rootDirectory,
        options
      )

      // Format with proper backticks if diff is provided
      if (diff) {
        let numBackticks = 3
        while (diff.includes("`".repeat(numBackticks))) {
          numBackticks++
        }

        // Add warnings if any
        if (warnings.length > 0) {
          result += "WARNING: The following operations were skipped:\n"
          result += warnings.join("\n")
          result += "\n\n"
        }

        // Add the diff
        result += `${"`".repeat(numBackticks)}diff\n${diff}${"`".repeat(numBackticks)}\n\n`
      }

      // Write changes if not dry run
      if (!dryRun) {
        await fs.writeFile(normalized, modifiedContent, "utf-8")
        result += "Changes have been applied."
      } else {
        result += "Dry run: changes not applied."
      }

      return result
    } finally {
      // Clean up temporary files
      try {
        await fs.unlink(tmpOriginal)
        await fs.unlink(tmpModified)
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    // Add context about which operation was in progress based on dryRun
    const operation = dryRun ? "preview edits for" : "apply edits to"
    throw ErrorManager.normalizeError(
      error,
      `Failed to ${operation} ${path.basename(filePath)}`
    )
  }
}
