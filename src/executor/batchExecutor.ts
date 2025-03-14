import {
  Operation,
  BatchExecutionOptions,
  OperationResult,
} from "../types/operations.js"
import { resolveTemplates } from "../utils/templateResolver.js"
import {
  createOrderedBatches,
  validateDependencies,
} from "../utils/dependencyOrder.js"
import { resultsCache } from "../utils/resultsCache.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { withRecovery } from "../utils/recovery.js"
import { mapToMcpError } from "../utils/errorMapper.js"
import { resolveResultReferences } from "../utils/resultResolver.js"

/**
 * Executes a batch of operations with dependency ordering
 */
export async function executeBatch(
  operations: Operation[],
  provider: { executeTool: (name: string, args: unknown) => Promise<unknown> },
  options: BatchExecutionOptions = {}
): Promise<OperationResult[]> {
  // Set default options
  const opts = {
    maxConcurrent: options.maxConcurrent || 5,
    timeoutMs: options.timeoutMs || 30000,
    stopOnError: options.stopOnError || false,
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
        opts.timeoutMs
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
  provider: { executeTool: (name: string, args: unknown) => Promise<unknown> },
  maxConcurrent: number,
  timeoutMs: number
): Promise<OperationResult[]> {
  const results: OperationResult[] = []

  for (let i = 0; i < batch.length; i += maxConcurrent) {
    const chunk = batch.slice(i, i + maxConcurrent)
    const chunkResults = await Promise.all(
      chunk.map((operation) => executeOperation(operation, provider, timeoutMs))
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
  provider: { executeTool: (name: string, args: unknown) => Promise<unknown> },
  timeoutMs: number
): Promise<OperationResult> {
  try {
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new McpError(ErrorCode.RequestTimeout, "Operation timed out"))
      }, timeoutMs)
    })

      let previousResult: unknown

      // Execute operation with timeout and recovery
      const result = await withRecovery(async () => {
        const resolvedArgs = resolveResultReferences(operation.arguments || {})
        const templatedArgs = resolveTemplates(resolvedArgs)

        return Promise.race([
          provider.executeTool(operation.tool, {
            ...templatedArgs,
            previousResult,
          }),
        timeoutPromise,
      ])
    })

    // Update previousResult for the next operation
    previousResult = result // Assign the result to previousResult

    // Store result in cache
    if (operation.id) {
      resultsCache.storeResult(operation.id, result)
    }

    return {
      id: operation.id,
      tool: operation.tool,
      success: true,
      result,
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
