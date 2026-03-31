import {
  Operation,
  BatchOptions as BatchExecutionOptions,
  OperationResult,
} from "../types/schemas/batch.js"
import { resolveTemplates } from "../utils/templateResolver.js"
import {
  createOrderedBatches,
  validateDependencies,
} from "../utils/dependencyOrder.js"
import { resultsCache } from "../utils/resultsCache.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { mapToMcpError } from "../utils/errorMapper.js"
import { resolveResultReferences } from "../utils/resultResolver.js"

interface OperationResponse {
  success?: boolean
  result?: unknown
  [key: string]: unknown
}

interface Provider {
  executeTool: (name: string, args: unknown) => Promise<unknown>
  notification?: (params: { method: string; params: unknown }) => Promise<void>
}

/**
 * Executes a batch of operations with dependency ordering
 */
export async function executeBatch(
  operations: Operation[],
  provider: Provider,
  options?: Partial<BatchExecutionOptions>
): Promise<OperationResult[]> {
  // Set default options
  const opts = {
    maxConcurrent: options?.maxConcurrent || 5,
    timeoutMs: options?.timeoutMs || 30000,
    stopOnError: options?.stopOnError || false,
  }

  // Validate dependencies and create ordered batches
  validateDependencies(operations)
  const batches = createOrderedBatches(operations)

  try {
    // Clear any existing results at start
    resultsCache.clear()

    // Execute batches in order
    const results: OperationResult[] = []

    for (const batch of batches) {
      // Execute operations in this batch with concurrency limit
      const batchResults = await executeBatchWithConcurrency(
        batch,
        provider,
        opts.maxConcurrent,
        opts.timeoutMs,
        options?.progressToken,
        operations.length
      )

      results.push(...batchResults)

      // Stop if any operation failed and stopOnError is true
      if (opts.stopOnError && results.some((r) => !r.success)) {
        break
      }
    }

    return results
  } finally {
    // Ensure cache is cleared after all batches complete
    setTimeout(() => resultsCache.clear(), 0)
  }
}

/**
 * Executes a batch of operations with concurrency limit
 */
async function executeBatchWithConcurrency(
  batch: Operation[],
  provider: Provider,
  maxConcurrent: number,
  timeoutMs: number,
  progressToken?: string,
  totalOperations?: number
): Promise<OperationResult[]> {
  const results: OperationResult[] = []
  let completedOperations = 0

  for (let i = 0; i < batch.length; i += maxConcurrent) {
    const chunk = batch.slice(i, i + maxConcurrent)
    const chunkResults = await Promise.all(
      chunk.map(async (operation) => {
        const result = await executeOperation(operation, provider, timeoutMs)

        // Update progress after each operation if progressToken is provided
        if (progressToken && totalOperations && provider.notification) {
          completedOperations++
          await provider.notification({
            method: "notifications/progress",
            params: {
              progressToken,
              progress: completedOperations,
              total: totalOperations,
            },
          })
        }

        return result
      })
    )
    results.push(...chunkResults)
  }

  return results
}

/**
 * Executes a single operation with timeout
 */
async function executeOperation(
  operation: Operation,
  provider: Provider,
  timeoutMs: number
): Promise<OperationResult> {
  // Create timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new McpError(ErrorCode.RequestTimeout, "Operation timed out"))
    }, timeoutMs)
  })

  let result: unknown

  try {
    // Resolve arguments
    const resolvedArgs = resolveResultReferences(operation.arguments || {})
    const templatedArgs = resolveTemplates(resolvedArgs)

    // Execute operation
    result = await Promise.race([
      provider.executeTool(operation.tool, templatedArgs),
      timeoutPromise,
    ])

    // Store result for chaining
    if (operation.id) {
      resultsCache.storeResult(operation.id, result)
    }

    // For write_file operations, always succeed if execution completed
    if (operation.tool === "write_file") {
      return {
        id: operation.id,
        tool: operation.tool,
        success: true,
        result: result,
      }
    }

    // For other operations, determine success from result
    const hasSuccess =
      typeof result === "object" && result !== null && "success" in result
    const finalSuccess = hasSuccess
      ? Boolean((result as OperationResponse).success)
      : true

    return {
      id: operation.id,
      tool: operation.tool,
      success: finalSuccess,
      result: result,
    }
  } catch (error) {
    const mappedError = mapToMcpError(error)
    return {
      id: operation.id,
      tool: operation.tool,
      success: false,
      error: mappedError.message,
      errorCode: mappedError.code,
    }
  }
}
