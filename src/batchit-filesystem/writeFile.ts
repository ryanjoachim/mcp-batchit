
import fs from "fs/promises"
import { validatePathInProcess, type PathValidationConfig } from "./validation.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { eventBus } from "../utils/eventBus.js"
import { metricsCollector } from "../utils/metricsCollector.js"
import { withRecovery } from "../utils/recovery.js"
import { ConnectionManager } from "./connectionManager.js"
import { WriteFileArgsSchema } from "../schemas/operations.js"
import { performance } from "perf_hooks"

// Initialize connection manager as singleton
const connectionManager = new ConnectionManager()

/**
 * Creates a new file or overwrites an existing file with new content.
 * Uses connection pooling, metrics collection, and automatic retry with backoff.
 * @throws {McpError} If validation fails or operation encounters an error
 */
export async function writeFileOp(
  filePath: string,
  content: string,
  config: PathValidationConfig
): Promise<void> {
  const startTime = performance.now()
  const operationId = `write_${Date.now()}`

  // Validate arguments against schema
  const validationResult = WriteFileArgsSchema.safeParse({
    path: filePath,
    content
  })

  if (!validationResult.success) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "Invalid arguments for write operation",
      { validation: validationResult.error.flatten() }
    )
  }

  return withRecovery(async () => {
    // Get managed connection
    await connectionManager.getConnection(filePath)

    const operationContext = {
      operationId,
      filePath,
      contentSize: Buffer.byteLength(content),
      startTime
    }

    eventBus.emit("writeOperation:start", operationContext)

    try {
      const validPath = await validatePathInProcess(filePath, config)

      const writeStartTime = performance.now()
      await fs.writeFile(validPath, content, "utf-8")
      const writeTime = performance.now() - writeStartTime

      const totalTime = performance.now() - startTime

      metricsCollector.recordMetric("write.time", writeTime)
      metricsCollector.recordMetric("write.total.time", totalTime)
      metricsCollector.recordMetric("write.file.size", Buffer.byteLength(content))

      eventBus.emit("writeOperation:complete", {
        ...operationContext,
        duration: totalTime
      })
    } catch (error) {
      const duration = performance.now() - startTime
      const errorContext = {
        ...operationContext,
        error: error instanceof Error ? error.message : String(error),
        errorCode: error instanceof McpError ? error.code : ErrorCode.InternalError,
        duration,
        phase: "execution"
      }

      eventBus.emit("writeOperation:error", errorContext)
      metricsCollector.recordMetric("write.errors", 1)
      metricsCollector.recordMetric("write.error.duration", duration)

      await connectionManager.recordError(
        filePath,
        error instanceof Error ? error : new Error(String(error))
      )

      // Propagate McpError with additional context or create new one
      throw error instanceof McpError
        ? new McpError(error.code, error.message, { ...errorContext, originalError: error })
        : new McpError(
            ErrorCode.InternalError,
            `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
            errorContext
          )
    }
  })
}
