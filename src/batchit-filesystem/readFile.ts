import fs from "fs/promises"
import path from "path"
import { isBinaryFile } from "isbinaryfile"
import { validatePathInProcess, type PathValidationConfig } from "./validation.js"
import { addLineNumbers } from "./utils.js"
import { extractTextFromPDF, extractTextFromDOCX } from "./fileTypeHandlers.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { eventBus } from "../utils/eventBus.js"
import { metricsCollector } from "../utils/metricsCollector.js"
import { withRecovery } from "../utils/recovery.js"
import { ConnectionManager } from "./connectionManager.js"
import { ReadFileArgsSchema, ReadMultipleFilesArgsSchema } from "../schemas/operations.js"
import { performance } from "perf_hooks"

export interface ReadOptions {
  encoding?: BufferEncoding
  maxConcurrent?: number
  checkBinary?: boolean
  addLineNumbers?: boolean
  fileTypeHandling?: boolean
  startLineNumber?: number
}

export const defaultOptions: ReadOptions = {
  encoding: "utf-8",
  maxConcurrent: 5,
  checkBinary: true,
  addLineNumbers: true,
  fileTypeHandling: true,
  startLineNumber: 1
}

interface FileResult {
  path: string
  content?: string
  error?: string
  fileType?: string
  lineCount?: number
  encoding: string
  metrics?: {
    readTime: number
    processingTime: number
    totalTime: number
  }
}

// Initialize connection manager as singleton
const connectionManager = new ConnectionManager()

/**
 * Reads file content with support for different file types and formatting options.
 * Uses connection pooling, metrics collection, and automatic retry with backoff.
 * @throws {McpError} If validation fails or operation encounters an error
 */
export async function readFileOp(
  filePath: string,
  config: PathValidationConfig,
  options: ReadOptions = defaultOptions
): Promise<FileResult> {
  const startTime = performance.now()
  const operationId = `read_${Date.now()}`

  // Validate arguments against schema
  const validationResult = ReadFileArgsSchema.safeParse({
    path: filePath,
    options
  })

  if (!validationResult.success) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "Invalid arguments for read operation",
      { validation: validationResult.error.flatten() }
    )
  }

  return withRecovery(async () => {
    // Get managed connection
    await connectionManager.getConnection(filePath)

    const operationContext = {
      operationId,
      filePath,
      options,
      startTime
    }

    eventBus.emit("readOperation:start", operationContext)

    try {
      const validPath = await validatePathInProcess(filePath, config)
      const opts = { ...defaultOptions, ...options }

      try {
        await fs.access(validPath)
      } catch {
        throw new McpError(
          ErrorCode.InvalidParams,
          `File not found: ${validPath}`,
          { path: validPath, exists: false }
        )
      }

      const fileType = path.extname(validPath).toLowerCase()
      const readStartTime = performance.now()
      let content: string

      if (opts.fileTypeHandling) {
        metricsCollector.recordMetric("read.fileType.count", 1)
        metricsCollector.recordMetric(`read.fileType.${fileType}.count`, 1)

        switch (fileType) {
          case ".pdf":
            content = await extractTextFromPDF(validPath)
            break
          case ".docx":
            content = await extractTextFromDOCX(validPath)
            break
          default:
            if (opts.checkBinary) {
              const isBinary = await isBinaryFile(validPath)
              if (isBinary) {
                throw new McpError(
                  ErrorCode.InvalidParams,
                  `Cannot read binary file: ${validPath}`,
                  { path: validPath, fileType }
                )
              }
            }
            const rawContent = await fs.readFile(validPath, opts.encoding)
            content = Buffer.isBuffer(rawContent) ?
              rawContent.toString(opts.encoding) : rawContent
        }
      } else {
        const rawContent = await fs.readFile(validPath, opts.encoding)
        content = Buffer.isBuffer(rawContent) ?
          rawContent.toString(opts.encoding) : rawContent
      }

      const readTime = performance.now() - readStartTime
      metricsCollector.recordMetric("read.time", readTime)

      const processingStartTime = performance.now()
      if (opts.addLineNumbers) {
        content = addLineNumbers(content, opts.startLineNumber)
      }

      const processingTime = performance.now() - processingStartTime
      const totalTime = performance.now() - startTime

      metricsCollector.recordMetric("read.processing.time", processingTime)
      metricsCollector.recordMetric("read.total.time", totalTime)
      metricsCollector.recordMetric("read.file.size", Buffer.byteLength(content))

      const result: FileResult = {
        path: validPath,
        content,
        fileType,
        lineCount: content.split("\n").length,
        encoding: opts.encoding || "utf-8",
        metrics: {
          readTime,
          processingTime,
          totalTime
        }
      }

      eventBus.emit("readOperation:complete", {
        ...operationContext,
        result,
        duration: totalTime
      })

      return result
    } catch (error) {
      const duration = performance.now() - startTime
      const errorContext = {
        ...operationContext,
        error: error instanceof Error ? error.message : String(error),
        errorCode: error instanceof McpError ? error.code : ErrorCode.InternalError,
        duration,
        phase: "execution"
      }

      eventBus.emit("readOperation:error", errorContext)
      metricsCollector.recordMetric("read.errors", 1)
      metricsCollector.recordMetric("read.error.duration", duration)

      await connectionManager.recordError(
        filePath,
        error instanceof Error ? error : new Error(String(error))
      )

      // Propagate McpError with additional context or create new one
      throw error instanceof McpError
        ? new McpError(error.code, error.message, { ...errorContext, originalError: error })
        : new McpError(
            ErrorCode.InternalError,
            `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
            errorContext
          )
    }
  })
}

/**
 * Reads multiple files concurrently with connection sharing and batch processing.
 * @throws {McpError} If validation fails or operation encounters an error
 */
export async function readMultipleFilesOp(
  paths: string[],
  config: PathValidationConfig,
  options: ReadOptions = defaultOptions
): Promise<FileResult[]> {
  const startTime = performance.now()
  const operationId = `readMultiple_${Date.now()}`

  // Validate arguments against schema
  const validationResult = ReadMultipleFilesArgsSchema.safeParse({
    paths,
    options
  })

  if (!validationResult.success) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "Invalid arguments for read multiple operation",
      { validation: validationResult.error.flatten() }
    )
  }

  const opts = { ...defaultOptions, ...options }
  const batchSize = opts.maxConcurrent || 1
  const results: FileResult[] = []
  const errors: McpError[] = []

  const operationContext = {
    operationId,
    paths,
    options: opts,
    startTime,
    batchSize
  }

  eventBus.emit("readMultipleOperation:start", operationContext)

  try {
    for (let i = 0; i < paths.length; i += batchSize) {
      const batchStartTime = performance.now()
      const batch = paths.slice(i, i + batchSize)

      eventBus.emit("readMultipleOperation:batch:start", {
        ...operationContext,
        batchIndex: i / batchSize,
        batchPaths: batch
      })

      const batchPromises = batch.map(async (filePath): Promise<FileResult> => {
        try {
          return await readFileOp(filePath, config, opts)
        } catch (error) {
          const mcpError = error instanceof McpError
            ? error
            : new McpError(
                ErrorCode.InternalError,
                `Failed to read file: ${error instanceof Error ? error.message : String(error)}`
              )
          errors.push(mcpError)
          return {
            path: filePath,
            error: mcpError.message,
            fileType: path.extname(filePath).toLowerCase(),
            encoding: opts.encoding || "utf-8"
          }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)

      const batchDuration = performance.now() - batchStartTime
      metricsCollector.recordMetric("read.batch.time", batchDuration)

      eventBus.emit("readMultipleOperation:batch:complete", {
        ...operationContext,
        batchIndex: i / batchSize,
        batchResults,
        duration: batchDuration
      })
    }

    const totalTime = performance.now() - startTime
    metricsCollector.recordMetric("read.multiple.total.time", totalTime)
    metricsCollector.recordMetric("read.multiple.success.count", paths.length - errors.length)
    metricsCollector.recordMetric("read.multiple.error.count", errors.length)

    eventBus.emit("readMultipleOperation:complete", {
      ...operationContext,
      results,
      errors,
      duration: totalTime
    })

    return results
  } catch (error) {
    const duration = performance.now() - startTime
    const errorContext = {
      ...operationContext,
      error: error instanceof Error ? error.message : String(error),
      errorCode: error instanceof McpError ? error.code : ErrorCode.InternalError,
      duration,
      phase: "execution",
      completedCount: results.length,
      errorCount: errors.length
    }

    eventBus.emit("readMultipleOperation:error", errorContext)
    metricsCollector.recordMetric("read.multiple.errors", 1)
    metricsCollector.recordMetric("read.multiple.error.duration", duration)

    throw new McpError(
      ErrorCode.InternalError,
      `Failed to process files: ${error instanceof Error ? error.message : String(error)}`,
      errorContext
    )
  }
}
