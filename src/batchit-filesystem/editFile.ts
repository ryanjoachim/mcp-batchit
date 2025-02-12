import fs from "fs/promises"
import { createTwoFilesPatch } from "diff"
import { validatePathInProcess, type PathValidationConfig } from "./validation.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"

/**
 * Normalizes line endings from CRLF to LF.
 */
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n")
}

/**
 * Validates line numbers against file content.
 * @throws McpError if line number is invalid
 */
function validateLineNumber(lineNum: number, totalLines: number, operation: string): void {
  if (lineNum < 1) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid line number for ${operation} operation: ${lineNum}. Line numbers must be positive.`
    )
  }
  if (lineNum > totalLines) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid line number for ${operation} operation: ${lineNum}. File only has ${totalLines} lines.`
    )
  }
}

/**
 * Builds a unified diff string showing changes.
 */
function createUnifiedDiff(
  originalContent: string,
  newContent: string,
  filepath: string
): string {
  const normalizedOriginal = normalizeLineEndings(originalContent)
  const normalizedNew = normalizeLineEndings(newContent)
  return createTwoFilesPatch(
    filepath,
    filepath,
    normalizedOriginal,
    normalizedNew,
    "original",
    "modified"
  )
}

/**
 * Applies a series of line-based edits to a file, returning a diff.
 * If dryRun is true, no changes are written.
 * @throws McpError if line numbers are invalid or content cannot be matched
 */
export async function editFileOp(
  filePath: string,
  edits: Array<{ oldText: string; newText: string }>,
  dryRun: boolean,
  config: PathValidationConfig
): Promise<string> {
  const validPath = await validatePathInProcess(filePath, config)
  let originalContent: string
  try {
    originalContent = normalizeLineEndings(await fs.readFile(validPath, "utf-8"))
  } catch (error) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Failed to read file: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  const totalLines = originalContent.split("\n").length
  let modifiedContent = originalContent
  const warnings: string[] = []

  for (const edit of edits) {
    const normalizedOld = normalizeLineEndings(edit.oldText)
    const normalizedNew = normalizeLineEndings(edit.newText)

    // If we find an exact match
    if (modifiedContent.includes(normalizedOld)) {
      modifiedContent = modifiedContent.replace(normalizedOld, normalizedNew)
      continue
    }

    // Otherwise, attempt line-by-line matching
    const oldLines = normalizedOld.split("\n")
    const contentLines = modifiedContent.split("\n")
    let matchFound = false

    for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
      // Validate line number for the potential match
      try {
        validateLineNumber(i + 1, totalLines, "edit")
      } catch (error) {
        if (error instanceof McpError) {
          warnings.push(error.message)
          continue
        }
        throw error
      }

      const potentialMatch = contentLines.slice(i, i + oldLines.length)

      const isMatch = oldLines.every((oldLine, j) => {
        const contentLine = potentialMatch[j]
        return oldLine.trim() === contentLine.trim()
      })

      if (isMatch) {
        // Preserve indentation of the first line
        const originalIndent = contentLines[i].match(/^\s*/)?.[0] || ""
        const newLines = normalizedNew.split("\n").map((line, j) => {
          if (j === 0) return originalIndent + line.trimStart()
          const oldIndent = oldLines[j]?.match(/^\s*/)?.[0] || ""
          const newIndent = line.match(/^\s*/)?.[0] || ""
          if (oldIndent && newIndent) {
            const relativeIndent = newIndent.length - oldIndent.length
            return (
              originalIndent + " ".repeat(Math.max(0, relativeIndent)) + line.trimStart()
            )
          }
          return line
        })

        contentLines.splice(i, oldLines.length, ...newLines)
        modifiedContent = contentLines.join("\n")
        matchFound = true
        break
      }
    }

    if (!matchFound) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Could not find exact match for edit:\n${edit.oldText}`
      )
    }
  }

  // Build a unified diff
  const diff = createUnifiedDiff(originalContent, modifiedContent, filePath)

  // Format with the correct number of backticks
  let numBackticks = 3
  while (diff.includes("`".repeat(numBackticks))) {
    numBackticks++
  }

  let result = ""

  // Add warnings about skipped operations if any
  if (warnings.length > 0) {
    result += "WARNING: The following operations were skipped:\n"
    result += warnings.join("\n")
    result += "\n\n"
  }

  // Add the diff
  result += `${"`".repeat(numBackticks)}diff\n${diff}${"`".repeat(numBackticks)}\n\n`

  if (!dryRun) {
    try {
      await fs.writeFile(validPath, modifiedContent, "utf-8")
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to write file: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return result
}
