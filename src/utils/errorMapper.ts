import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"

/**
 * Maps common errors to appropriate MCP error codes
 *
 * MCP Error Codes (from JSON-RPC spec and MCP SDK):
 * - ConnectionClosed (-32000): SDK error code for closed connections
 * - RequestTimeout (-32001): SDK error code for request timeouts
 * - ParseError (-32700): Standard JSON-RPC error code for parse errors
 * - InvalidRequest (-32600): Standard JSON-RPC error code for invalid requests
 * - MethodNotFound (-32601): Standard JSON-RPC error code for when a method is not found
 * - InvalidParams (-32602): Standard JSON-RPC error code for invalid parameters
 * - InternalError (-32603): Standard JSON-RPC error code for internal errors
 */
export function mapToMcpError(error: unknown): McpError {
  // Already an MCP error
  if (error instanceof McpError) {
    return error
  }

  // Node.js specific error codes
  if (error instanceof Error && "code" in error) {
    const code = (error as any).code
    const errorMessage = error.message

    // File system errors - Invalid Parameters (parameter validation failures)
    const invalidParamsFileCodes = [
      "ENOENT", // No such file or directory
      "EACCES", // Permission denied
      "EPERM", // Operation not permitted
      "EEXIST", // File already exists
      "EISDIR", // Is a directory when file expected
      "ENOTDIR", // Not a directory when directory expected
      "EROFS", // Read-only file system
      "ENAMETOOLONG", // Filename too long
      "ELOOP", // Too many symbolic links
      "ENOTEMPTY", // Directory not empty
      "EINVAL", // Invalid argument
    ]

    if (invalidParamsFileCodes.includes(code)) {
      // Enhance certain error messages for clarity
      let enhancedMessage = errorMessage

      if (code === "EACCES" || code === "EPERM") {
        enhancedMessage = `Permission denied: ${errorMessage}`
      } else if (code === "EEXIST") {
        enhancedMessage = `Resource already exists: ${errorMessage}`
      } else if (code === "EISDIR") {
        enhancedMessage = `Expected file but found directory: ${errorMessage}`
      } else if (code === "ENOTDIR") {
        enhancedMessage = `Expected directory but found file: ${errorMessage}`
      }

      return new McpError(ErrorCode.InvalidParams, enhancedMessage, {
        originalError: error,
        errorCode: code,
        stack: error.stack,
      })
    }

    // Timeout errors - RequestTimeout (operation timeouts)
    const timeoutCodes = [
      "ETIMEDOUT", // Connection timed out
      "ESOCKETTIMEDOUT", // Socket timeout
      "ETIMEOUT", // Generic timeout
    ]

    if (timeoutCodes.includes(code)) {
      return new McpError(
        ErrorCode.RequestTimeout,
        `Operation timed out: ${errorMessage}`,
        {
          originalError: error,
          errorCode: code,
          stack: error.stack,
        }
      )
    }

    // Connection errors - ConnectionClosed (connection issues)
    const connectionClosedCodes = [
      "ECONNREFUSED", // Connection refused
      "ECONNRESET", // Connection reset
      "ECONNABORTED", // Connection aborted
      "EPIPE", // Broken pipe
      "ESHUTDOWN", // Cannot send after transport endpoint shutdown
    ]

    if (connectionClosedCodes.includes(code)) {
      return new McpError(
        ErrorCode.ConnectionClosed,
        `Connection error: ${errorMessage}`,
        {
          originalError: error,
          errorCode: code,
          stack: error.stack,
        }
      )
    }

    // Network errors - InternalError (network issues)
    const networkCodes = [
      "EHOSTUNREACH", // Host unreachable
      "ENETUNREACH", // Network unreachable
      "EADDRINUSE", // Address already in use
      "EADDRNOTAVAIL", // Address not available
    ]

    if (networkCodes.includes(code)) {
      return new McpError(
        ErrorCode.InternalError,
        `Network error: ${errorMessage}`,
        {
          originalError: error,
          errorCode: code,
          stack: error.stack,
        }
      )
    }

    // Parse errors - ParseError (syntax errors)
    const parseCodes = [
      "EBADMSG", // Bad message
      "ERR_INVALID_ARG_TYPE", // Invalid argument type
      "ERR_INVALID_ARG_VALUE", // Invalid argument value
    ]

    if (parseCodes.includes(code) || error.name === "SyntaxError") {
      return new McpError(
        ErrorCode.ParseError,
        `Parse error: ${errorMessage}`,
        {
          originalError: error,
          errorCode: code,
          stack: error.stack,
        }
      )
    }

    // Resource errors - InternalError (system resource issues)
    const resourceCodes = [
      "EMFILE", // Too many open files
      "EBUSY", // Resource busy
      "ENOSPC", // No space left on device
      "ENOMEM", // Not enough memory
      "EAGAIN", // Resource temporarily unavailable
    ]

    if (resourceCodes.includes(code)) {
      return new McpError(
        ErrorCode.InternalError,
        `Resource error: ${errorMessage}`,
        {
          originalError: error,
          errorCode: code,
          stack: error.stack,
        }
      )
    }

    // For any other code, preserve it in the context for debugging
    return new McpError(ErrorCode.InternalError, errorMessage, {
      originalError: error,
      errorCode: code,
      stack: error.stack,
    })
  }

  // Handle SyntaxError separately (may not have a code property)
  if (error instanceof SyntaxError) {
    return new McpError(ErrorCode.ParseError, `Parse error: ${error.message}`, {
      originalError: error,
      stack: error.stack,
      name: error.name,
    })
  }

  // Default to internal error with enhanced context preservation
  const context =
    error instanceof Error
      ? {
          originalError: error,
          stack: error.stack,
          name: error.name,
        }
      : {
          originalError: error,
        }

  return new McpError(
    ErrorCode.InternalError,
    error instanceof Error ? error.message : String(error),
    context
  )
}

/**
 * Extracts a human-readable error message from an HPCErrorResponse
 */
export function getErrorMessageFromHpcResponse(result: {
  error?: string
  message?: string
  content?: Array<{ type: string; text?: string }>
}): string {
  // Direct error/message properties
  if (result.error || result.message) {
    return result.error ?? result.message ?? "Unknown HPC error"
  }

  // Look for error in content array
  if (result.content?.length) {
    const textContent = result.content
      .filter((item) => item.type === "text" && item.text)
      .map((item) => item.text)
      .filter((text): text is string => text !== undefined)
      .join(" ")

    if (textContent) {
      return textContent
    }
  }

  return "Unknown HPC error"
}
