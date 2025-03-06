import fs from "fs/promises"
import { validatePathInProcess, type PathValidationConfig } from "./validation.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { eventBus } from "../utils/eventBus.js"
import { metricsCollector } from "../utils/metricsCollector.js"
import { withRecovery } from "../utils/recovery.js"
import { ConnectionManager } from "./connectionManager.js"
import { CreateDirectoryArgsSchema } from "../schemas/operations.js"
import { performance } from "perf_hooks"

// Initialize connection manager as singleton
const connectionManager = new ConnectionManager()

interface CreateDirectoryResult {
  path: string
  success: boolean
  error?: string
}

/**
 * Creates one or more directories, including parent directories if needed.
 * Uses connection pooling, metrics collection, and automatic retry with backoff.
 * Continues creating directories if some fail, then reports all errors together.
 * @throws {McpError} If validation fails or all operations fail
 */
export async function createDirectoryOp(
  paths: string | string[],
  config: PathValidationConfig
): Promise<void> {
  const startTime = performance.now()
  const operationId = `createDir_${Date.now()}`

  // Validate arguments against schema
  const validationResult = CreateDirectoryArgsSchema.safeParse({
    paths
  })

  if (!validationResult.success) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "Invalid arguments for create directory operation",
      { validation: validationResult.error.flatten() }
    )
  }

  const pathsToCreate = Array.isArray(paths) ? paths : [paths]
  const results: CreateDirectoryResult[] = []
  let successCount = 0

  const operationContext = {
    operationId,
    paths: pathsToCreate,
    startTime
  }

  eventBus.emit("createDirectory:start", operationContext)

  await withRecovery(async () => {
    for (const path of pathsToCreate) {
      const dirStartTime = performance.now()

      try {
        // Get managed connection for this directory path
        await connectionManager.getConnection(path)

        const validPath = await validatePathInProcess(path, config)
        await fs.mkdir(validPath, { recursive: true })

        const duration = performance.now() - dirStartTime
        successCount++

        metricsCollector.recordMetric("createDirectory.operation.time", duration)

        results.push({
          path,
          success: true
        })

        eventBus.emit("createDirectory:success", {
          ...operationContext,
          path,
          duration
        })
      } catch (error) {
        const duration = performance.now() - dirStartTime
        const errorContext = {
          ...operationContext,
          path,
          error: error instanceof Error ? error.message : String(error),
          errorCode: error instanceof McpError ? error.code : ErrorCode.InternalError,
          duration
        }

        eventBus.emit("createDirectory:error", errorContext)
        metricsCollector.recordMetric("createDirectory.errors", 1)
        metricsCollector.recordMetric("createDirectory.error.duration", duration)

        await connectionManager.recordError(
          path,
          error instanceof Error ? error : new Error(String(error))
        )

        results.push({
          path,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    const totalTime = performance.now() - startTime
    metricsCollector.recordMetric("createDirectory.total.time", totalTime)
    metricsCollector.recordMetric("createDirectory.success.count", successCount)
    metricsCollector.recordMetric("createDirectory.error.count", pathsToCreate.length - successCount)

    eventBus.emit("createDirectory:complete", {
      ...operationContext,
      duration: totalTime,
      results,
      successCount
    })

    // If no directories were created successfully, throw an error
    if (successCount === 0) {
      const errors = results
        .filter(r => !r.success)
        .map(r => `Failed to create directory '${r.path}': ${r.error}`)

      throw new McpError(
        ErrorCode.InternalError,
        "All directory creation operations failed",
        {
          errors,
          results,
          totalTime
        }
      )
    }
  })
}
