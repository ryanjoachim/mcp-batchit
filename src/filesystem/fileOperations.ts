import fs from "fs/promises"
import path from "path"
import { validatePath, PathValidationConfig } from "./pathValidation.js"
import { trackContentModification } from "./contentTracking.js"
import { ContentTrackingOptions } from "../types/operations.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { withRecovery } from "../utils/recovery.js"
import { resolveResultReferences } from "../utils/resultResolver.js"
import { resolveTemplates } from "../utils/templateResolver.js"

export interface FileResult {
  path: string
  content?: string
  error?: string
}

export interface ReadOptions {
  encoding?: BufferEncoding
  addLineNumbers?: boolean
  startLineNumber?: number
  maxConcurrent?: number
}

/**
 * Options for file reading operations
 */
export interface ReadFileOptions {
  encoding?: BufferEncoding
  addLineNumbers?: boolean
  startLineNumber?: number
}

/**
 * Options for reading multiple files
 */
export interface ReadMultipleOptions extends ReadFileOptions {
  maxConcurrent?: number
}

/**
 * Reads content from multiple files concurrently
 */
export async function readMultipleFiles(
  paths: string[],
  config: PathValidationConfig,
  options: ReadMultipleOptions = {}
): Promise<FileResult[]> {
  return withRecovery(async () => {
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Must provide an array of file paths"
      )
    }

    const results: FileResult[] = []
    const maxConcurrent = options.maxConcurrent || 5

    // Process files in batches to control concurrency
    for (let i = 0; i < paths.length; i += maxConcurrent) {
      const batch = paths.slice(i, i + maxConcurrent)

      const batchPromises = batch.map(async (filePath): Promise<FileResult> => {
        try {
          const content = await readFile(filePath, config, options)
          return { path: filePath, content }
        } catch (error) {
          return {
            path: filePath,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
    }

    return results
  })
}

/**
 * Adds line numbers to content
 */
function addLineNumbers(content: string, startLine: number = 1): string {
  const lines = content.split("\n")
  const maxLineNumberWidth = String(startLine + lines.length - 1).length
  return lines
    .map((line, index) => {
      const lineNumber = String(startLine + index).padStart(
        maxLineNumberWidth,
        " "
      )
      return `${lineNumber} | ${line}`
    })
    .join("\n")
}

/**
 * Reads file content with formatting options
 */
export async function readFile(
  filePath: string,
  config: PathValidationConfig,
  options: ReadFileOptions = {}
): Promise<string> {
  return withRecovery(async () => {
    const validPath = validatePath(filePath, config)
    const opts = {
      encoding: options.encoding || "utf-8",
      addLineNumbers: options.addLineNumbers || false,
      startLineNumber: options.startLineNumber || 1,
    }

    try {
      await fs.access(validPath)
    } catch {
      throw new McpError(
        ErrorCode.InvalidParams,
        `File not found: ${validPath}`
      )
    }

    const content = await fs.readFile(validPath, opts.encoding)
    const textContent = Buffer.isBuffer(content)
      ? content.toString(opts.encoding)
      : content

    if (opts.addLineNumbers) {
      return addLineNumbers(textContent, opts.startLineNumber)
    }

    return textContent
  })
}

/**
 * Options for file writing operations
 */
export interface WriteFileOptions {
  tracking?: ContentTrackingOptions
  template?: string
}

export interface WriteFileResult {
  content: string
  summary?: string
}

/**
 * Writes content to a file with optional content tracking
 */
export async function writeFile(
  filePath: string,
  content: unknown,
  config: PathValidationConfig,
  options: WriteFileOptions = {},
  previousResult?: unknown // Add previousResult parameter
): Promise<WriteFileResult> {
  const validPath = validatePath(filePath, config)

  // Ensure directory exists first, outside recovery wrapper
  const dir = path.dirname(validPath)
  await fs.mkdir(dir, { recursive: true })

  // Then check if file exists
  let hadExistingContent = true
  let existingContent: string | undefined

  try {
    existingContent = await fs.readFile(validPath, "utf-8")
  } catch (error) {
    if ((error as any).code === "ENOENT") {
      hadExistingContent = false
    } else {
      throw error
    }
  }

  // Now wrap the write operation in recovery
  return withRecovery(async () => {
    // Handle templates and resolve references
    let resolvedContent: unknown
    if (options.template) {
      // First resolve any references in the content
      const contentToResolve =
        previousResult !== undefined ? { content: previousResult } : { content }
      const resolvedRefs = resolveResultReferences(contentToResolve)

      // Then apply the template with the resolved content
      const templateResult = resolveTemplates({
        template: options.template,
        content: resolvedRefs.content
      })
      resolvedContent = templateResult.content
    } else {
      // If no template, just resolve references normally
      const contentToResolve =
        previousResult !== undefined ? { content: previousResult } : { content }
      resolvedContent = resolveResultReferences(contentToResolve).content
    }

    // Handle resolved objects correctly
    let finalContent: string
    if (typeof resolvedContent === "object" && resolvedContent !== null) {
      // If resolved content is an object, stringify it directly
      finalContent = JSON.stringify(resolvedContent)
    } else if (typeof resolvedContent === "string") {
      finalContent = resolvedContent
    } else {
      // Handle other types (null, undefined, etc.)
      finalContent = ""
    }

    await fs.writeFile(validPath, finalContent, "utf-8")

    // Track content modification if tracking is enabled
    if (options.tracking?.enabled) {
      const modificationResult = await trackContentModification(
        validPath,
        hadExistingContent ? "update" : "create",
        config.rootDirectory,
        existingContent,
        options.tracking
      )

      const summary = `File ${filePath} ${hadExistingContent ? "updated" : "created"}`
      if (modificationResult.diff) {
        return {
          content: finalContent,
          summary: `${summary}\n\nChanges:\n${modificationResult.diff}`,
        }
      }
      return {
        content: finalContent,
        summary,
      }
    }
    // Return the actual content that was written with optional summary
    return { content: finalContent }
  })
}
