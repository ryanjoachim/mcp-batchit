/**
 * Represents a single operation to be executed
 */
export interface Operation {
  id?: string;
  tool: string;
  arguments?: Record<string, unknown>;
  dependsOn?: string | string[];
}

/**
 * Options for batch execution
 */
export interface BatchExecutionOptions {
  maxConcurrent?: number;
  timeoutMs?: number;
  stopOnError?: boolean;
}

/**
 * Result of an operation execution
 */
export interface OperationResult {
  id?: string;
  tool: string;
  success: boolean;
  result?: unknown;
  error?: string;
  errorCode?: number;
  durationMs?: number;
}
