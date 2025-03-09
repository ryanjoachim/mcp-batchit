import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

/**
 * Configuration for recovery mechanism
 */
export interface RecoveryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

/**
 * Default recovery configuration
 */
const DEFAULT_CONFIG: RecoveryConfig = {
  maxRetries: 3,
  initialDelay: 100,
  maxDelay: 5000,
  backoffFactor: 2
};

/**
 * Executes an operation with exponential backoff retry
 * Converting any non-McpError errors to McpError format
 */
export async function withRecovery<T>(
  operation: () => Promise<T>,
  config: Partial<RecoveryConfig> = {}
): Promise<T> {
  // Merge with defaults
  const cfg = {
    ...DEFAULT_CONFIG,
    ...config
  };

  let retries = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      // If it's already an McpError and we're out of retries, rethrow
      if (error instanceof McpError && retries >= cfg.maxRetries) {
        throw error;
      }

      retries++;

      // Stop if max retries reached
      if (retries >= cfg.maxRetries) {
        // Convert other errors to McpError format
        const err = error as Error;
        throw new McpError(
          ErrorCode.InternalError,
          `Operation failed after ${retries} retries: ${err.message || 'Unknown error'}`
        );
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        cfg.initialDelay * Math.pow(cfg.backoffFactor, retries - 1),
        cfg.maxDelay
      );

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
