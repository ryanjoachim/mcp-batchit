
import fs from "fs/promises"
import { validatePathInProcess, type PathValidationConfig } from "./validation.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { eventBus } from "../utils/eventBus.js"
import { metricsCollector } from "../utils/metricsCollector.js"
import { withRecovery } from "../utils/recovery.js"
import { ConnectionManager } from "./connectionManager.js"
import { GetFileInfoArgsSchema, type FileInfo } from "../schemas/operations.js"
import { performance } from "perf_hooks"

// Initialize connection manager as singleton
const connectionManager = new ConnectionManager()

interface FileInfoResult extends FileInfo {
  metrics: {
    statTime: number
    totalTime: number
  }
}

/**
 * Retrieves detailed file or directory metadata.
 * Uses connection pooling, metrics collection, and automatic retry with backoff.
 * @throws {McpError} If validation fails or operation encounters an error
 */
export async function getFileInfoOp(
  filePath: string,
  config: PathValidationConfig
): Promise<string> {
  const startTime = performance.now()
  const operationId = `fileInfo_${Date.now()}`

  // Validate arguments against schema
  const validationResult = GetFileInfoArgsSchema.safeParse({
    path: filePath
  })

  if (!validationResult.success) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "Invalid arguments for get file info operation",
      { validation: validationResult.error.flatten() }
    )
  }

  return withRecovery(async () => {
    // Get managed connection
    await connectionManager.getConnection(filePath)

    const operationContext = {
      operationId,
      filePath,
      startTime
    }

    eventBus.emit("getFileInfo:start", operationContext)

    try {
      const validPath = await validatePathInProcess(filePath, config)

      const statStartTime = performance.now()
      const stats = await fs.stat(validPath)
      const statTime = performance.now() - statStartTime

      metricsCollector.recordMetric("getFileInfo.stat.time", statTime)
      metricsCollector.recordMetric("getFileInfo.file.size", stats.size)

      const info: FileInfoResult = {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        permissions: stats.mode.toString(8).slice(-3),
        metrics: {
          statTime,
          totalTime: performance.now() - startTime
        }
      }

      const totalTime = performance.now() - startTime
      metricsCollector.recordMetric("getFileInfo.total.time", totalTime)

      eventBus.emit("getFileInfo:complete", {
        ...operationContext,
        info,
        duration: totalTime
      })

      return Object.entries(info)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n")
    } catch (error) {
      const duration = performance.now() - startTime
      const errorContext = {
        ...operationContext,
        error: error instanceof Error ? error.message : String(error),
        errorCode: error instanceof McpError ? error.code : ErrorCode.InternalError,
        duration,
        phase: "execution"
      }

      eventBus.emit("getFileInfo:error", errorContext)
      metricsCollector.recordMetric("getFileInfo.errors", 1)
      metricsCollector.recordMetric("getFileInfo.error.duration", duration)

      await connectionManager.recordError(
        filePath,
        error instanceof Error ? error : new Error(String(error))
      )

      // Propagate McpError with additional context or create new one
      throw error instanceof McpError
        ? new McpError(error.code, error.message, { ...errorContext, originalError: error })
        : new McpError(
            ErrorCode.InternalError,
            `Failed to get file info: ${error instanceof Error ? error.message : String(error)}`,
            errorContext
          )
    }
  })
}
