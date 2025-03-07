
import { resultsCache } from '../utils/resultsCache.js';
import type { ExecutionPlan, DataFlowMap } from '../types/executionPlan.js';
import type {
  ServerIdentity,
  Operation,
  BatchExecutionOptions,
  BatchResult
} from '../types/config.js';

export class BatchExecutor {
  /**
   * Executes a batch of operations with orchestration capabilities
   */
  async executeBatch(
    identity: ServerIdentity,
    operations: Operation[],
    options: BatchExecutionOptions = {}
  ): Promise<BatchResult> {
    const plan = await this.createExecutionPlan(operations);

    try {
      await this.validatePlan(plan);
      const results = await this.executeAccordingToPlan(plan, options);
      const formattedResults = this.formatResults(results);

      resultsCache.clear();

      return {
        targetServer: identity.name,
        summary: {
          successCount: formattedResults.filter(r => r.success).length,
          failCount: formattedResults.filter(r => !r.success).length
        },
        operations: formattedResults
      };
    } catch (error) {
      resultsCache.clear(); // Clean up on error
      throw error;
    }
  }

  /**
   * Creates an execution plan that respects dependencies
   */
  private async createExecutionPlan(operations: Operation[]): Promise<ExecutionPlan> {
    const batches = this.createOrderedBatches(operations);
    const dataFlowMap = this.analyzeDataDependencies(operations);

    return {
      batches,
      dataFlowMap
    };
  }

  /**
   * Validates the execution plan for circular dependencies
   */
  private async validatePlan(plan: ExecutionPlan): Promise<void> {
    const dependencies = new Map<string, Set<string>>();

    plan.batches.flat().forEach(op => {
      if (op.id && op.dependsOn) {
        const deps = Array.isArray(op.dependsOn) ? op.dependsOn : [op.dependsOn];
        dependencies.set(op.id, new Set(deps));
      }
    });

    const visited = new Set<string>();
    const visiting = new Set<string>();

    const hasCircular = (opId: string): boolean => {
      if (visiting.has(opId)) return true;
      if (visited.has(opId)) return false;

      visiting.add(opId);
      const deps = dependencies.get(opId);
      if (deps) {
        for (const dep of deps) {
          if (hasCircular(dep)) return true;
        }
      }
      visiting.delete(opId);
      visited.add(opId);
      return false;
    };

    for (const opId of dependencies.keys()) {
      if (hasCircular(opId)) {
        throw new Error(`Circular dependency detected involving operation ${opId}`);
      }
    }
  }

  /**
   * Executes operations according to the plan, with proper result caching
   */
  private async executeAccordingToPlan(
    plan: ExecutionPlan,
    options: BatchExecutionOptions
  ): Promise<Array<{ id?: string; tool: string; result: unknown; error?: Error }>> {
    const results: Array<{ id?: string; tool: string; result: unknown; error?: Error }> = [];
    const maxConcurrent = options.maxConcurrent || 1;

    for (const batch of plan.batches) {
      const batchResults = await this.executeBatchWithConcurrency(batch, maxConcurrent, options);
      results.push(...batchResults);

      if (results.some(r => r.error) && options.stopOnError) {
        break;
      }
    }

    return results;
  }

  /**
   * Executes a batch of operations with concurrency control
   */
  private async executeBatchWithConcurrency(
    batch: Operation[],
    maxConcurrent: number,
    options: BatchExecutionOptions
  ): Promise<Array<{ id?: string; tool: string; result: unknown; error?: Error }>> {
    const results: Array<{ id?: string; tool: string; result: unknown; error?: Error }> = [];
    const chunks = [];

    // Split batch into chunks based on maxConcurrent
    for (let i = 0; i < batch.length; i += maxConcurrent) {
      chunks.push(batch.slice(i, i + maxConcurrent));
    }

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(async operation => {
          try {
            // Verify dependencies
            if (operation.dependsOn) {
              const deps = Array.isArray(operation.dependsOn)
                ? operation.dependsOn
                : [operation.dependsOn];

              for (const depId of deps) {
                const depResult = resultsCache.getResult(depId);
                if (!depResult) {
                  throw new Error(`Dependent operation ${depId} result not found`);
                }
              }
            }

            // Execute operation
            const result = await this.executeOperation(operation);

            // Cache result if operation has an ID
            if (operation.id) {
              resultsCache.storeResult(operation.id, result);
            }

            return {
              id: operation.id,
              tool: operation.tool,
              result
            };
          } catch (error) {
            const errorResult = {
              id: operation.id,
              tool: operation.tool,
              result: null,
              error: error instanceof Error ? error : new Error(String(error))
            };

            if (options.stopOnError) {
              throw errorResult;
            }

            return errorResult;
          }
        })
      );

      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * Formats the execution results according to BatchResult type
   */
  private formatResults(
    results: Array<{ id?: string; tool: string; result: unknown; error?: Error }>
  ): BatchResult['operations'] {
    return results.map(result => ({
      tool: result.tool,
      success: !result.error,
      result: result.error || result.result
    }));
  }

  /**
   * Creates ordered batches of operations based on dependencies
   */
  private createOrderedBatches(operations: Operation[]): Operation[][] {
    const batches: Operation[][] = [];
    const completed = new Set<string>();
    const remaining = new Set(
      operations
        .filter(op => op.id)
        .map(op => op.id as string)
    );

    while (remaining.size > 0) {
      const batch = operations.filter(op => {
        if (!op.id || !remaining.has(op.id)) return false;

        if (!op.dependsOn) return true;

        const deps = Array.isArray(op.dependsOn) ? op.dependsOn : [op.dependsOn];
        return deps.every(dep => completed.has(dep));
      });

      if (batch.length === 0 && remaining.size > 0) {
        throw new Error('Unable to resolve operation dependencies');
      }

      batches.push(batch);
      batch.forEach(op => {
        if (op.id) {
          completed.add(op.id);
          remaining.delete(op.id);
        }
      });
    }

    return batches;
  }

  /**
   * Analyzes data dependencies between operations
   */
  private analyzeDataDependencies(operations: Operation[]): DataFlowMap {
    const dependencies = new Map<string, string[]>();
    const outputTypes = new Map<string, string>();
    const inputTypes = new Map<string, string[]>();

    operations.forEach(op => {
      if (op.id) {
        if (op.dependsOn) {
          const deps = Array.isArray(op.dependsOn) ? op.dependsOn : [op.dependsOn];
          dependencies.set(op.id, deps);
        }

        outputTypes.set(op.id, op.tool);

        if (op.dependsOn) {
          const deps = Array.isArray(op.dependsOn) ? op.dependsOn : [op.dependsOn];
          inputTypes.set(op.id, deps.map(depId => {
            const depOp = operations.find(o => o.id === depId);
            return depOp?.tool || 'unknown';
          }));
        } else {
          inputTypes.set(op.id, []);
        }
      }
    });

    return {
      dependencies,
      outputTypes,
      inputTypes
    };
  }

  /**
   * Executes a single operation
   */
  private async executeOperation(operation: Operation): Promise<unknown> {
    if (!operation.tool) {
      throw new Error('Operation must specify a tool');
    }

    const args = operation.arguments || {};
    return Promise.resolve({ tool: operation.tool, args });
  }
}

// Export singleton instance
export const batchExecutor = new BatchExecutor();
