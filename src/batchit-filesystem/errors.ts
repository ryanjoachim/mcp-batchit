import { McpError } from "@modelcontextprotocol/sdk/types.js"

/**
 * Custom error codes for filesystem operations
 */
export enum FilesystemErrorCode {
  ConnectionError = 5000,
  ConnectionTimeout = 5001,
  ConnectionLimitExceeded = 5002,
  IdleTimeout = 5003,
  MaxErrorsExceeded = 5004
}

/**
 * Creates a filesystem-specific error with the given code and message
 */
export function createFilesystemError(
  code: FilesystemErrorCode,
  message: string,
  cause?: Error
): McpError {
  return new McpError(code, `Filesystem error: ${message}`, cause)
}

/**
 * Error messages for common filesystem errors
 */
export const ErrorMessages = {
  [FilesystemErrorCode.ConnectionError]: "Connection failed",
  [FilesystemErrorCode.ConnectionTimeout]: "Connection timed out",
  [FilesystemErrorCode.ConnectionLimitExceeded]: "Maximum connection limit exceeded",
  [FilesystemErrorCode.IdleTimeout]: "Connection idle timeout exceeded",
  [FilesystemErrorCode.MaxErrorsExceeded]: "Maximum error count exceeded"
} as const
