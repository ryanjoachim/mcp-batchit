
/**
 * Identifies a server for connection management
 */
export interface ServerIdentity {
  /** Unique name to identify the server */
  name: string;
  /** Server type configuration */
  serverType: {
    /** Type of server (e.g., 'filesystem', 'database') */
    type: string;
    /** Server-specific configuration */
    config: Record<string, unknown>;
  };
  /** Optional transport configuration */
  transport?: {
    /** Transport type (e.g., 'stdio', 'websocket') */
    type: string;
    /** Transport-specific configuration */
    [key: string]: unknown;
  };
}

/**
 * Options for batch execution
 */
export interface BatchExecutionOptions {
  /** Maximum concurrent operations (default: 5) */
  maxConcurrent?: number;
  /** Operation timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Whether to stop on first error (default: false) */
  stopOnError?: boolean;
  /** Whether to maintain persistent connections (default: false) */
  keepAlive?: boolean;
}

/**
 * An operation to be executed as part of a batch
 */
export interface Operation {
  /** Unique identifier for the operation */
  id?: string;
  /** Tool/command to execute */
  tool: string;
  /** Tool-specific arguments */
  arguments?: Record<string, unknown>;
  /** Dependencies on other operations */
  dependsOn?: string | string[];
  /** Transform operation results */
  transform?: ((results: unknown[], args: Record<string, unknown>) => unknown) | Record<string, unknown>;
}

/**
 * Result of a batch operation execution
 */
export interface BatchResult {
  /** Target server that executed the operations */
  targetServer: string;
  /** Summary of execution results */
  summary: {
    /** Number of successful operations */
    successCount: number;
    /** Number of failed operations */
    failCount: number;
  };
  /** Results of individual operations */
  operations: Array<{
    /** Operation that was executed */
    tool: string;
    /** Whether the operation succeeded */
    success: boolean;
    /** Operation result or error message */
    result: unknown;
  }>;
}

export interface OperationResult {
  operationId?: string;
  tool: string;
  success: boolean;
  durationMs: number;
  result?: unknown;
  error?: unknown;
  errorDetails?: unknown;
  context?: Record<string, unknown>;
  startTime?: Date;
  endTime?: Date;
}
