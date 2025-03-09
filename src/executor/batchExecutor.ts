import { Operation, BatchExecutionOptions, OperationResult } from "../types/operations.js";
import { createOrderedBatches, validateDependencies } from "../utils/dependencyOrder.js";
import { resultsCache } from "../utils/resultsCache.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { withRecovery } from "../utils/recovery.js";
import { mapToMcpError } from "../utils/errorMapper.js";

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
    stopOnError: options.stopOnError || false
  };

  try {
    // Validate dependencies and create ordered batches
    validateDependencies(operations);
    const batches = createOrderedBatches(operations);

    // Execute batches in order
    const results: OperationResult[] = [];

    for (const batch of batches) {
      // Execute operations in this batch with concurrency limit
      const batchResults = await executeBatchWithConcurrency(
        batch,
        provider,
        opts.maxConcurrent,
        opts.timeoutMs
      );

      results.push(...batchResults);

      // Stop if any operation failed and stopOnError is true
      if (opts.stopOnError && results.some(r => !r.success)) {
        break;
      }
    }

    return results;
  } finally {
    // Always clear the cache when done
    resultsCache.clear();
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
  const results: OperationResult[] = [];

  // Process operations in chunks based on maxConcurrent
  for (let i = 0; i < batch.length; i += maxConcurrent) {
    const chunk = batch.slice(i, i + maxConcurrent);

    // Execute operations in chunk concurrently
    const chunkPromises = chunk.map(operation =>
      executeOperation(operation, provider, timeoutMs)
    );

    // Wait for all operations in chunk to complete
    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
  }

  return results;
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
        reject(new McpError(ErrorCode.RequestTimeout, "Operation timed out"));
      }, timeoutMs);
    });

    // Execute operation with timeout and recovery
    const result = await withRecovery(async () => {
      return Promise.race([
        provider.executeTool(operation.tool, operation.arguments || {}),
        timeoutPromise
      ]);
    });

    // Store result in cache if operation has ID
    if (operation.id) {
      resultsCache.storeResult(operation.id, result);
    }

    return {
      id: operation.id,
      tool: operation.tool,
      success: true,
      result
    };
  } catch (error) {
    const mappedError = mapToMcpError(error);
    return {
      id: operation.id,
      tool: operation.tool,
      success: false,
      error: mappedError.message,
      errorCode: mappedError.code
    };
  }
}
