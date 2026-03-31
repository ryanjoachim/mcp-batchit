import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"

/**
 * Configuration for recovery mechanism
 */
export interface RecoveryConfig {
  maxRetries: number
  initialDelay: number
  maxDelay: number
  backoffFactor: number
  preserveContext?: boolean // Whether to preserve error context in thrown errors
}

/**
 * Default recovery configuration
 */
const DEFAULT_CONFIG: RecoveryConfig = {
  maxRetries: 3,
  initialDelay: 100,
  maxDelay: 5000,
  backoffFactor: 2,
  preserveContext: true,
}

/**
 * Determines if an error is transient and can be retried
 */
export function isTransientError(error: unknown): boolean {
  // Non-retryable McpErrors
  if (error instanceof McpError) {
    switch (error.code) {
      // These errors indicate client-side issues that won't be resolved by retrying
      case ErrorCode.InvalidParams:
      case ErrorCode.InvalidRequest:
      case ErrorCode.MethodNotFound:
      case ErrorCode.ParseError:
        return false

      // These are likely transient and worth retrying
      case ErrorCode.ConnectionClosed:
      case ErrorCode.RequestTimeout:
        return true

      // For InternalError, we need to check the message
      case ErrorCode.InternalError:
        // Simple check for common transient error patterns
        const message = error.message.toLowerCase()
        return (
          message.includes("timeout") ||
          message.includes("connection") ||
          message.includes("network")
        )

      default:
        return false
    }
  }

  // For Node.js errors with error codes
  if (error instanceof Error && "code" in error) {
    const code = (error as any).code

    // Common transient error codes
    const transientCodes = [
      // Connection errors
      "ECONNRESET",
      "ECONNREFUSED",
      "ECONNABORTED",
      // Timeout errors
      "ETIMEDOUT",
      "ESOCKETTIMEDOUT",
      // Resource temporarily unavailable
      "EAGAIN",
    ]

    return transientCodes.includes(code)
  }

  // Default to non-transient for unknown errors
  return false
}

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
    ...config,
  }

  let retries = 0

  while (true) {
    try {
      return await operation()
    } catch (error) {
      // Check if the error is retryable
      if (!isTransientError(error)) {
        // Non-transient errors should be thrown immediately
        if (error instanceof McpError) {
          throw error
        } else {
          // Convert non-McpErrors to McpError format
          const err = error as Error
          throw new McpError(
            ErrorCode.InternalError,
            `Non-retryable error: ${err.message || "Unknown error"}`,
            cfg.preserveContext ? { originalError: error } : undefined
          )
        }
      }

      retries++

      // Stop if max retries reached
      if (retries >= cfg.maxRetries) {
        // Convert other errors to McpError format
        const err = error as Error
        throw new McpError(
          ErrorCode.InternalError,
          `Operation failed after ${retries} retries: ${err.message || "Unknown error"}`,
          cfg.preserveContext
            ? {
                originalError: error,
                retryAttempts: retries,
              }
            : undefined
        )
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        cfg.initialDelay * Math.pow(cfg.backoffFactor, retries - 1),
        cfg.maxDelay
      )

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}
