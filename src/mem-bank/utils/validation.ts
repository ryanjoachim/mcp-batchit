
import { validateMarkdownContent as baseValidateMarkdown } from "../../validation/markdownViolation.js"
import { MemoryBankValidationError } from "../errors/memory-bank-error.js"

/**
 * Validates the content of a Markdown file.
 * @param content The content to validate.
 * @returns A promise that resolves when the content is valid.
 */
export async function validateMarkdownContent(content: string): Promise<void> {
  try {
    const lines = content.split("\n")
    let foundHeading = false
    let foundContent = false

    for (const line of lines) {
      if (line.trim().startsWith("#")) {
        foundHeading = true
      } else if (line.trim() && foundHeading) {
        foundContent = true
        break
      }
    }

    if (!foundHeading) {
      throw new MemoryBankValidationError(
        "Markdown file must start with a heading (#)"
      )
    }

    if (!foundContent) {
      throw new MemoryBankValidationError(
        "Markdown file must contain content after heading"
      )
    }
    await baseValidateMarkdown(content, { requireHeader: true })
  } catch (error) {
    if (error instanceof MemoryBankValidationError) {
      throw error
    }
    throw new MemoryBankValidationError(
      error instanceof Error ? error.message : String(error)
    )
  }
}

/**
 * Validates a file name.
 * @param fileName The file name to validate.
 */
export function validateFileName(fileName: string): void {
  if (!fileName.endsWith(".md")) {
    throw new MemoryBankValidationError("File must have .md extension")
  }

  const invalidChars = /[<>:"\\|?*]/g
  if (invalidChars.test(fileName)) {
    throw new MemoryBankValidationError("File name contains invalid characters")
  }
}
