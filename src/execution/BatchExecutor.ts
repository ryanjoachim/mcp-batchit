import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { withRecovery } from "../utils/recovery.js"
import { ErrorManager } from "../utils/errorManager.js"
import {
  createOrderedBatches,
  validateDependsOnReferences,
} from "../utils/dependencyOrder.js"
import { getErrorMessageFromHpcResponse } from "../utils/errorMapper.js"
import { resolveResultReferences } from "../utils/resultResolver.js"
import { resolveTemplates } from "../utils/templateResolver.js"
import { ResultsCache } from "../utils/resultsCache.js"
import { ServerConnection, isProviderConnection } from "../types/connections.js"
import {
  ServerIdentity,
  Operation,
  OperationResult,
  isHPCErrorResponse,
} from "../types/schemas/index.js"
import { ConnectionManager } from "../connections/ConnectionManager.js"

export class BatchExecutor {
  constructor(private connectionManager: ConnectionManager) {}

  async executeBatch(
    identity: ServerIdentity,
    operations: Operation[],
    options: {
      maxConcurrent: number
      timeoutMs: number
      stopOnError: boolean
      keepAlive?: boolean
    },
    context?: {
      signal?: AbortSignal
      onProgress?: (completed: number, total: number) => Promise<void>
    }
  ): Promise<OperationResult[]> {
    // Fresh cache per batch — concurrent batches never interfere
    const cache = new ResultsCache()

    // Validate that all dependsOn references point to known operation IDs
    validateDependsOnReferences(operations)

    const connection =
      await this.connectionManager.getOrCreateConnection(identity)

    // Share the batch's ResultsCache with the internal FileSystem provider
    // so template/result resolution within writeFile uses the same cache
    if (isProviderConnection(connection) && connection.fileSystem) {
      connection.fileSystem.cache = cache
    }

    const results: OperationResult[] = []
    const batches = createOrderedBatches(operations)

    try {
      for (const batch of batches) {
        // Respect cancellation between batch layers
        if (context?.signal?.aborted) {
          break
        }

        // Execute in chunks to respect maxConcurrent
        for (let i = 0; i < batch.length; i += options.maxConcurrent) {
          if (context?.signal?.aborted) break

          const chunk = batch.slice(i, i + options.maxConcurrent)
          const chunkResults = await Promise.all(
            chunk.map((op) =>
              this.executeOperation(
                connection,
                op,
                options.timeoutMs,
                cache,
                context?.signal
              )
            )
          )
          results.push(...chunkResults)

          if (options.stopOnError && chunkResults.some((r) => !r.success)) break
        }

        // Emit progress after each completed layer
        if (context?.onProgress) {
          await context.onProgress(results.length, operations.length)
        }

        if (options.stopOnError && results.some((r) => !r.success)) {
          break
        }
      }
    } finally {
      if (!options.keepAlive) {
        await this.connectionManager.closeConnection(
          this.connectionManager.createKeyForIdentity(identity)
        )
      }
    }

    return results
  }

  private async executeOperation(
    connection: ServerConnection,
    operation: Operation,
    timeoutMs: number,
    cache: ResultsCache,
    signal?: AbortSignal
  ): Promise<OperationResult> {
    const start = Date.now()

    // Fast-path: already cancelled before we even start
    if (signal?.aborted) {
      return {
        tool: operation.tool,
        success: false,
        error: "Operation cancelled",
        durationMs: 0,
      }
    }

    try {
      // Resolve result references (${results.id}) and Handlebars templates
      // before passing arguments to the provider/transport
      const resolvedArgs = resolveResultReferences(
        operation.arguments || {},
        cache
      )
      const templatedArgs = resolveTemplates(resolvedArgs, cache)

      let result: unknown

      // Build race targets: timeout + optional cancellation signal
      let timeoutHandle: NodeJS.Timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () =>
            reject(
              new McpError(ErrorCode.RequestTimeout, "Operation timed out")
            ),
          timeoutMs
        )
      })

      const abortPromise = signal
        ? new Promise<never>((_, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new Error("Operation cancelled")),
              { once: true }
            )
          })
        : null

      const raceTargets: Promise<never>[] = abortPromise
        ? [timeoutPromise, abortPromise]
        : [timeoutPromise]

      try {
        if (isProviderConnection(connection)) {
          // Use provider for execution with recovery
          result = await withRecovery(async () => {
            return Promise.race([
              connection.provider.executeTool(operation.tool, templatedArgs),
              ...raceTargets,
            ])
          })
        } else {
          // Use transport-based execution with recovery
          result = await withRecovery(async () => {
            return Promise.race([
              connection.client.callTool({
                name: operation.tool,
                arguments: templatedArgs,
              }),
              ...raceTargets,
            ])
          })
        }
      } finally {
        clearTimeout(timeoutHandle!) // Always clear to prevent handle leak
      }

      if (isHPCErrorResponse(result)) {
        return {
          tool: operation.tool,
          success: false,
          error: getErrorMessageFromHpcResponse(result),
          durationMs: Date.now() - start,
        }
      }

      const operationResult = {
        tool: operation.tool,
        success: true,
        result,
        durationMs: Date.now() - start,
      }

      if (operation.id) {
        cache.storeResult(operation.id, result)
      }

      return operationResult
    } catch (error) {
      return {
        tool: operation.tool,
        success: false,
        error: ErrorManager.getErrorMessage(error),
        durationMs: Date.now() - start,
      }
    }
  }
}
