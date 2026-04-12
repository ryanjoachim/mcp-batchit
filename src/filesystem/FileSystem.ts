import path from "path"
import fs from "fs/promises"
import { isBinaryFile } from "isbinaryfile"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { withRecovery } from "../utils/recovery.js"
import { validatePathWithSymlinks } from "./pathValidation.js"
import { trackContentModification } from "./contentTracking.js"
import { extractTextFromPDF, extractTextFromDOCX } from "./fileTypeHandlers.js"
import { resolveResultReferences } from "../utils/resultResolver.js"
import { resolveTemplates } from "../utils/templateResolver.js"
import { ResultsCache } from "../utils/resultsCache.js"
import { ContentTrackingOptions } from "../types/filesystem/contentTracking.js"
import { PathOptions } from "../types/filesystem/paths.js"

import { LineDiffOperation, applyLineDiff } from "./lineDiff.js"
import { ErrorManager } from "../utils/errorManager.js"
import { createDirectory, listDirectory } from "./directoryOperations.js"
import { searchFiles, SearchOptions } from "./searchFiles.js"
import { getFileInfo, FileInfo } from "./fileInfo.js"
import { directoryTree } from "./directoryTree.js"

// Import new types from the filesystem type system
import { UpdateOperation } from "../types/filesystem/operations.js"
import { UpdateResult } from "../types/filesystem/results.js"

/**
 * Normalizes line endings from CRLF to LF
 */
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n")
}

export interface FileSystemOptions extends PathOptions {
  /**
   * Maximum number of concurrent operations
   */
  maxConcurrent?: number
}

/**
 * Options for reading file content
 * Aligns with ReadOperation from the new type system
 */
export interface ReadOptions {
  /**
   * Character encoding to use when reading the file
   */
  encoding?: BufferEncoding

  /**
   * Whether to add line numbers to the content
   */
  addLineNumbers?: boolean

  /**
   * Starting line number for line numbering
   */
  startLineNumber?: number

  /**
   * Whether to check if the file is binary
   */
  checkBinary?: boolean

  /**
   * Whether to handle special file types (PDF, DOCX, etc.)
   */
  fileTypeHandling?: boolean
}

/**
 * Options for writing file content
 * Aligns with WriteOperation from the new type system
 */
export interface WriteOptions {
  /**
   * Options for tracking content changes
   */
  tracking?: ContentTrackingOptions

  /**
   * Optional template to use for content generation
   */
  template?: string
}

/**
 * Unified filesystem operations with consistent error handling and validation
 */
export class FileSystem {
  private readonly config: PathOptions
  private readonly maxConcurrent: number
  /**
   * ResultsCache instance used for template/result resolution.
   * Set externally by BatchExecutor for per-batch isolation,
   * or defaults to a standalone instance for direct usage.
   */
  cache: ResultsCache = new ResultsCache()

  /** The root directory this FileSystem instance operates within. */
  get rootDirectory(): string {
    return this.config.rootDirectory
  }

  constructor(options: FileSystemOptions) {
    // Set PathOptions properties
    this.config = {
      rootDirectory: options.rootDirectory,
      excludedDirs: options.excludedDirs,
      allowRelative: options.allowRelative,
    }

    this.maxConcurrent = options.maxConcurrent || 10
  }

  /**
   * Read file content with enhanced type handling
   *
   * @param filePath The path of the file to read
   * @param options Options for reading the file
   * @returns The content of the file as a string
   */
  async readFile(filePath: string, options: ReadOptions = {}): Promise<string> {
    return withRecovery(async () => {
      const validationResult = await validatePathWithSymlinks(
        filePath,
        this.config
      )
      const validPath = validationResult.normalizedPath
      const opts = {
        encoding: options.encoding || "utf-8",
        addLineNumbers: options.addLineNumbers || false,
        startLineNumber: options.startLineNumber || 1,
        checkBinary: options.checkBinary !== false,
        fileTypeHandling: options.fileTypeHandling !== false,
      }

      try {
        await fs.access(validPath)
      } catch {
        throw ErrorManager.createNotFoundError("File", validPath)
      }

      let content: string
      const fileType = path.extname(validPath).toLowerCase()

      // Handle specific file types if enabled
      if (opts.fileTypeHandling) {
        switch (fileType) {
          case ".pdf":
            content = await extractTextFromPDF(validPath)
            break
          case ".docx":
            content = await extractTextFromDOCX(validPath)
            break
          default:
            // Check if file is binary
            if (opts.checkBinary) {
              const isBinary = await isBinaryFile(validPath)
              if (isBinary) {
                throw ErrorManager.createInvalidFormatError(
                  "File",
                  `Binary file ${validPath} cannot be read`
                )
              }
            }

            const rawContent = await fs.readFile(validPath, opts.encoding)
            content = Buffer.isBuffer(rawContent)
              ? rawContent.toString(opts.encoding)
              : rawContent
        }
      } else {
        const rawContent = await fs.readFile(validPath, opts.encoding)
        content = Buffer.isBuffer(rawContent)
          ? rawContent.toString(opts.encoding)
          : rawContent
      }

      if (opts.addLineNumbers) {
        const lines = content.split("\n")
        const maxLineNumber = opts.startLineNumber + lines.length - 1
        const numberWidth = maxLineNumber.toString().length

        content = lines
          .map((line, index) => {
            const lineNumber = (opts.startLineNumber + index)
              .toString()
              .padStart(numberWidth, " ")
            return `${lineNumber} | ${line}`
          })
          .join("\n")
      }

      return content
    })
  }

  /**
   * Read multiple files concurrently
   *
   * @param paths Array of file paths to read
   * @param options Options for reading the files
   * @returns Array of file results with content or error information
   */
  async readFiles(
    paths: string[],
    options: ReadOptions = {}
  ): Promise<{ path: string; content?: string; error?: string }[]> {
    if (!Array.isArray(paths) || paths.length === 0) {
      throw ErrorManager.createMissingParamError("paths", "readFiles operation")
    }

    // Initialize results array with the same length as paths
    const results: { path: string; content?: string; error?: string }[] = Array(
      paths.length
    ).fill(null)

    // Create a function to process a file at a specific index
    const processFile = async (filePath: string, index: number) => {
      try {
        const content = await this.readFile(filePath, options)
        results[index] = { path: filePath, content }
      } catch (error) {
        const normalizedError = ErrorManager.normalizeError(
          error,
          `Failed to read file ${filePath}`
        )
        results[index] = { path: filePath, error: normalizedError.message }
      }
    }

    // Process files in batches while maintaining order
    for (let i = 0; i < paths.length; i += this.maxConcurrent) {
      const batch = paths.slice(i, i + this.maxConcurrent)
      const batchPromises = batch.map((filePath, batchIndex) =>
        processFile(filePath, i + batchIndex)
      )
      await Promise.all(batchPromises)
    }

    return results
  }

  /**
   * Write content to file with optional templating and tracking
   *
   * @param filePath The path of the file to write
   * @param content The content to write to the file
   * @param options Options for writing the file, including tracking and templating
   * @param previousResult Optional previous result to use for template resolution
   * @returns Result of the write operation
   */
  async writeFile(
    filePath: string,
    content: unknown,
    options: WriteOptions = {},
    previousResult?: unknown
  ): Promise<{ content: string; summary?: string }> {
    const validationResult = await validatePathWithSymlinks(
      filePath,
      this.config
    )
    const validPath = validationResult.normalizedPath
    const dir = path.dirname(validPath)
    await fs.mkdir(dir, { recursive: true })

    let hadExistingContent = true
    let existingContent: string | undefined

    try {
      existingContent = await fs.readFile(validPath, "utf-8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        hadExistingContent = false
      } else {
        throw ErrorManager.normalizeError(
          error,
          `Failed to read existing file ${validPath}`
        )
      }
    }

    return withRecovery(async () => {
      // Handle template resolution and reference resolution
      let resolvedContent: unknown

      if (options.template) {
        const contentToResolve =
          previousResult !== undefined
            ? { content: previousResult }
            : { content }
        try {
          const resolvedRefs = resolveResultReferences(
            contentToResolve,
            this.cache
          )
          const templateResult = resolveTemplates(
            {
              template: options.template,
              content: resolvedRefs.content,
            },
            this.cache
          )
          resolvedContent = templateResult.content
        } catch (error) {
          throw ErrorManager.normalizeError(
            error,
            `Failed to resolve template for ${validPath}`
          )
        }
      } else {
        const contentToResolve =
          previousResult !== undefined
            ? { content: previousResult }
            : { content }
        resolvedContent = resolveResultReferences(
          contentToResolve,
          this.cache
        ).content
      }

      if (resolvedContent === undefined || resolvedContent === null) {
        throw ErrorManager.createInvalidFormatError(
          "Template",
          "Resolution failed to produce valid content"
        )
      }

      let finalContent: string
      if (typeof resolvedContent === "object") {
        finalContent = JSON.stringify(resolvedContent)
      } else {
        finalContent = String(resolvedContent)
      }

      await fs.writeFile(validPath, finalContent, "utf-8")

      if (options.tracking?.enabled) {
        const modificationResult = await trackContentModification(
          validPath,
          hadExistingContent ? "update" : "create",
          this.config.rootDirectory,
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

      return { content: finalContent }
    })
  }

  /**
   * Move file from source to destination path
   *
   * @param sourcePath The source path of the file to move
   * @param destPath The destination path to move the file to
   * @param options Options for the move operation, including whether to overwrite existing files
   * @returns Promise that resolves when the move is complete
   */
  async moveFile(
    sourcePath: string,
    destPath: string,
    options: { overwrite?: boolean } = {}
  ): Promise<void> {
    return withRecovery(async () => {
      const validSourceResult = await validatePathWithSymlinks(
        sourcePath,
        this.config
      )
      const validDestResult = await validatePathWithSymlinks(
        destPath,
        this.config
      )
      const validSourcePath = validSourceResult.normalizedPath
      const validDestPath = validDestResult.normalizedPath

      try {
        await fs.access(validSourcePath)
      } catch {
        throw ErrorManager.createNotFoundError("Source file", validSourcePath)
      }

      // Check if destination exists
      try {
        await fs.access(validDestPath)
        if (!options.overwrite) {
          throw ErrorManager.createAlreadyExistsError(
            "Destination",
            validDestPath
          )
        }
        // If overwrite is true, remove existing destination
        await fs.rm(validDestPath, { recursive: true, force: true })
      } catch (error) {
        // Ignore error if destination doesn't exist
        if (error instanceof McpError) {
          throw error
        }
      }

      // Create destination directory if needed
      const destDir = path.dirname(validDestPath)
      await fs.mkdir(destDir, { recursive: true })

      // Check if moving a directory
      const stats = await fs.stat(validSourcePath)
      if (stats.isDirectory()) {
        // For directories, ensure the parent directory exists
        await fs.mkdir(path.dirname(validDestPath), { recursive: true })
      }

      try {
        // Attempt atomic move
        await fs.rename(validSourcePath, validDestPath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EXDEV") {
          // Cross-device move not supported, fallback to copy + delete
          await this.copyRecursive(validSourcePath, validDestPath)
          await fs.rm(validSourcePath, { recursive: true, force: true })
        } else {
          throw ErrorManager.normalizeError(
            error,
            `Failed to move file ${validSourcePath} to ${validDestPath}`
          )
        }
      }
    })
  }

  /**
   * Delete file at specified path
   *
   * @param filePath The path of the file to delete
   * @returns Promise that resolves when the delete is complete
   */
  async deleteFile(filePath: string): Promise<void> {
    return withRecovery(async () => {
      const validationResult = await validatePathWithSymlinks(
        filePath,
        this.config
      )
      const validPath = validationResult.normalizedPath

      try {
        await fs.access(validPath)
      } catch {
        throw ErrorManager.createNotFoundError("File", validPath)
      }

      try {
        await fs.unlink(validPath)
      } catch (error) {
        throw ErrorManager.normalizeError(
          error,
          `Failed to delete file ${validPath}`
        )
      }
    })
  }

  /**
   * Copy file from source to destination path
   *
   * @param sourcePath The source path of the file to copy
   * @param destPath The destination path to copy the file to
   * @returns Promise that resolves when the copy is complete
   */
  async copyFile(sourcePath: string, destPath: string): Promise<void> {
    return withRecovery(async () => {
      const validSourceResult = await validatePathWithSymlinks(
        sourcePath,
        this.config
      )
      const validDestResult = await validatePathWithSymlinks(
        destPath,
        this.config
      )
      const validSourcePath = validSourceResult.normalizedPath
      const validDestPath = validDestResult.normalizedPath

      try {
        await fs.access(validSourcePath)
      } catch {
        throw ErrorManager.createNotFoundError("Source file", validSourcePath)
      }

      const destDir = path.dirname(validDestPath)
      await fs.mkdir(destDir, { recursive: true })

      try {
        await fs.copyFile(validSourcePath, validDestPath)
      } catch (error) {
        throw ErrorManager.normalizeError(
          error,
          `Failed to copy file ${validSourcePath} to ${validDestPath}`
        )
      }
    })
  }

  /**
   * Recursively copies a file or directory
   */
  private async copyRecursive(src: string, dest: string): Promise<void> {
    try {
      const stats = await fs.stat(src)
      if (stats.isDirectory()) {
        // Create destination directory
        await fs.mkdir(dest, { recursive: true })

        // Copy all contents
        const entries = await fs.readdir(src, { withFileTypes: true })

        for (const entry of entries) {
          const srcPath = path.join(src, entry.name)
          const destPath = path.join(dest, entry.name)

          if (entry.isDirectory()) {
            await this.copyRecursive(srcPath, destPath)
          } else {
            await fs.copyFile(srcPath, destPath)
          }
        }
      } else {
        // Ensure parent directory exists
        await fs.mkdir(path.dirname(dest), { recursive: true })

        // Copy the file
        await fs.copyFile(src, dest)
      }
    } catch (error) {
      throw ErrorManager.normalizeError(
        error,
        `Failed in recursive copy from ${src} to ${dest}`
      )
    }
  }

  /**
   * Create directories, including parent directories if needed
   */
  async createDirectory(dirPath: string | string[]): Promise<string> {
    await createDirectory(dirPath, this.config)
    return Array.isArray(dirPath)
      ? dirPath.map((p) => `Created: ${p}`).join("\n")
      : `Created: ${dirPath}`
  }

  /**
   * List contents of a directory
   */
  async listDirectory(dirPath: string): Promise<string> {
    return listDirectory(dirPath, this.config)
  }

  /**
   * Search for files matching a pattern
   */
  async searchFiles(
    directory: string,
    options: SearchOptions
  ): Promise<unknown> {
    return searchFiles(directory, options, this.config)
  }

  /**
   * Get detailed information about a file or directory
   */
  async getFileInfo(filePath: string): Promise<FileInfo> {
    return getFileInfo(filePath, this.config)
  }

  /**
   * Get a recursive tree structure of a directory
   */
  async directoryTree(
    dirPath: string,
    format: "json" | "text" = "json"
  ): Promise<string> {
    return directoryTree(dirPath, this.config, format)
  }

  /**
   * Update file content using the new UpdateOperation type
   *
   * @param operation The update operation to perform
   * @returns Promise that resolves with the update result
   */
  async updateFile(operation: UpdateOperation): Promise<UpdateResult> {
    return withRecovery(async () => {
      const validationResult = await validatePathWithSymlinks(
        operation.path,
        this.config
      )
      const validPath = validationResult.normalizedPath

      // Read existing content
      let existingContent: string
      let hadExistingContent = true
      try {
        existingContent = normalizeLineEndings(await this.readFile(validPath))
      } catch (error) {
        if ((error as McpError).code === ErrorCode.InvalidParams) {
          hadExistingContent = false
          // File doesn't exist, but that's ok for overwrite mode
          if (operation.mode === "overwrite") {
            existingContent = ""
          } else {
            throw error
          }
        } else {
          throw error
        }
      }

      // Apply operation based on mode
      let newContent: string

      switch (operation.mode) {
        case "overwrite":
          newContent = operation.content as string
          break

        case "append":
          newContent = existingContent + "\n" + (operation.content as string)
          break

        case "diff":
          if (operation.diff) {
            // Convert DiffOperation[] to LineDiffOperation[]
            const lineDiffOps: LineDiffOperation[] = operation.diff.map(
              (diff) => ({
                line: diff.line,
                operation: diff.operation,
                text: diff.text,
              })
            )
            newContent = applyLineDiff(existingContent, lineDiffOps)
          } else {
            newContent = existingContent
          }
          break

        default:
          throw ErrorManager.createInvalidFormatError(
            "mode",
            `Unsupported update mode: ${operation.mode}`
          )
      }

      // Write updated content
      await fs.writeFile(validPath, newContent, "utf-8")

      // Track content modification if enabled
      let diff: string | undefined

      if (operation.tracking?.enabled) {
        const modificationResult = await trackContentModification(
          validPath,
          hadExistingContent ? "update" : "create",
          this.config.rootDirectory,
          existingContent,
          operation.tracking
        )

        diff = modificationResult.diff
      }

      // Create and return the result
      const result: UpdateResult = {
        operation: "update",
        path: operation.path,
        success: true,
        summary: `File ${operation.path} ${hadExistingContent ? "updated" : "created"} using ${operation.mode} mode`,
        contentTracking: operation.tracking?.enabled
          ? {
              path: operation.path,
              timestamp: new Date().toISOString(),
              operation: hadExistingContent ? "update" : "create",
              size: Buffer.byteLength(newContent),
              diff,
            }
          : undefined,
      }

      return result
    })
  }
}
