
import fs from "fs/promises"
import { validatePathInProcess, type PathValidationConfig } from "./validation.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { eventBus } from "../utils/eventBus.js"
import { metricsCollector } from "../utils/metricsCollector.js"
import { withRecovery } from "../utils/recovery.js"
import { ConnectionManager } from "./connectionManager.js"
import { MoveFileArgsSchema } from "../schemas/operations.js"

// Initialize connection manager as singleton
const connectionManager = new ConnectionManager()

/**
 * Moves or renames a file/directory from source to destination.
 * Uses connection pooling, metrics collection, and automatic retry with backoff.
 * @throws {McpError} If validation fails or operation encounters an error
 */
export async function moveFileOp(
  sourcePath: string,
  destPath: string,
  config: PathValidationConfig
): Promise<void> {
  // Validate arguments against schema
  const validationResult = MoveFileArgsSchema.safeParse({
    source: sourcePath,
    destination: destPath
  })

  if (!validationResult.success) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "Invalid arguments for move operation",
      { validation: validationResult.error.flatten() }
    )
  }

  const startTime = Date.now()
  const operationId = `move_${Date.now()}`

  return withRecovery(async () => {
    // Get or create connections for both source and destination
    await connectionManager.getConnection(sourcePath)
    await connectionManager.getConnection(destPath)

    const operationContext = {
      operationId,
      sourcePath,
      destPath,
      startTime
    }

    eventBus.emit('moveOperation:start', operationContext)

    try {
      const validSourcePath = await validatePathInProcess(sourcePath, config)
      const validDestPath = await validatePathInProcess(destPath, config)

      // Get source file stats for metrics
      const stats = await fs.stat(validSourcePath)
      metricsCollector.recordMetric(`move.file.size`, stats.size)

      await fs.rename(validSourcePath, validDestPath)

      const duration = Date.now() - startTime
      metricsCollector.recordMetric(`move.operation.duration`, duration)

      eventBus.emit('moveOperation:complete', {
        operationId,
        sourcePath,
        destPath,
        duration,
        fileSize: stats.size
      })
    } catch (error) {
      const duration = Date.now() - startTime
      const errorContext = {
        ...operationContext,
        error: error instanceof Error ? error.message : String(error),
        errorCode: error instanceof McpError ? error.code : ErrorCode.InternalError,
        duration,
        phase: 'execution'
      }

      eventBus.emit('moveOperation:error', errorContext)
      metricsCollector.recordMetric('filesystem.move.errors', 1)
      metricsCollector.recordMetric('filesystem.move.error.duration', duration)

      // Record connection errors and cleanup
      await Promise.all([
        connectionManager.recordError(sourcePath, error instanceof Error ? error : new Error(String(error))),
        connectionManager.recordError(destPath, error instanceof Error ? error : new Error(String(error)))
      ])

      // Propagate McpError with additional context or create new one
      throw error instanceof McpError
        ? new McpError(error.code, error.message, { ...errorContext, originalError: error })
        : new McpError(
            ErrorCode.InternalError,
            `Failed to move file: ${error instanceof Error ? error.message : String(error)}`,
            errorContext
          )
    }
  })
}
