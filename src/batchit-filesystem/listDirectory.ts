
import fs from "fs/promises"
import { validatePathInProcess, type PathValidationConfig } from "./validation.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { eventBus } from "../utils/eventBus.js"
import { metricsCollector } from "../utils/metricsCollector.js"
import { withRecovery } from "../utils/recovery.js"
import { ConnectionManager } from "./connectionManager.js"
import { ListDirectoryArgsSchema } from "../schemas/operations.js"
import { performance } from "perf_hooks"

// Initialize connection manager as singleton
const connectionManager = new ConnectionManager()

interface DirectoryEntry {
  name: string
  type: "DIR" | "FILE"
}

interface DirectoryContents {
  path: string
  entries: DirectoryEntry[]
  metrics: {
    fileCount: number
    dirCount: number
    scanTime: number
    totalTime: number
  }
}

/**
 * Lists a directory's contents with [DIR] or [FILE] prefixes.
 * Uses connection pooling, metrics collection, and automatic retry with backoff.
 * @throws {McpError} If validation fails or operation encounters an error
 */
export async function listDirectoryOp(
  dirPath: string,
  config: PathValidationConfig
): Promise<string> {
  const startTime = performance.now()
  const operationId = `listDir_${Date.now()}`

  // Validate arguments against schema
  const validationResult = ListDirectoryArgsSchema.safeParse({
    path: dirPath
  })

  if (!validationResult.success) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "Invalid arguments for list directory operation",
      { validation: validationResult.error.flatten() }
    )
  }

  return withRecovery(async () => {
    // Get managed connection for the directory
    await connectionManager.getConnection(dirPath)

    const operationContext = {
      operationId,
      dirPath,
      startTime
    }

    eventBus.emit("listDirectory:start", operationContext)

    try {
      const validPath = await validatePathInProcess(dirPath, config)
      const scanStartTime = performance.now()

      const entries = await fs.readdir(validPath, { withFileTypes: true })
      const scanTime = performance.now() - scanStartTime

      const fileCount = entries.filter(entry => entry.isFile()).length
      const dirCount = entries.filter(entry => entry.isDirectory()).length

      metricsCollector.recordMetric("listDirectory.scan.time", scanTime)
      metricsCollector.recordMetric("listDirectory.file.count", fileCount)
      metricsCollector.recordMetric("listDirectory.directory.count", dirCount)

      const contents: DirectoryContents = {
        path: validPath,
        entries: entries.map(entry => ({
          name: entry.name,
          type: entry.isDirectory() ? "DIR" : "FILE"
        })),
        metrics: {
          fileCount,
          dirCount,
          scanTime,
          totalTime: performance.now() - startTime
        }
      }

      const formattedResult = entries
        .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
        .join("\n")

      const totalTime = performance.now() - startTime
      metricsCollector.recordMetric("listDirectory.total.time", totalTime)

      eventBus.emit("listDirectory:complete", {
        ...operationContext,
        contents,
        duration: totalTime
      })

      return formattedResult
    } catch (error) {
      const duration = performance.now() - startTime
      const errorContext = {
        ...operationContext,
        error: error instanceof Error ? error.message : String(error),
        errorCode: error instanceof McpError ? error.code : ErrorCode.InternalError,
        duration,
        phase: "execution"
      }

      eventBus.emit("listDirectory:error", errorContext)
      metricsCollector.recordMetric("listDirectory.errors", 1)
      metricsCollector.recordMetric("listDirectory.error.duration", duration)

      await connectionManager.recordError(
        dirPath,
        error instanceof Error ? error : new Error(String(error))
      )

      // Propagate McpError with additional context or create new one
      throw error instanceof McpError
        ? new McpError(error.code, error.message, { ...errorContext, originalError: error })
        : new McpError(
            ErrorCode.InternalError,
            `Failed to list directory: ${error instanceof Error ? error.message : String(error)}`,
            errorContext
          )
    }
  })
}
