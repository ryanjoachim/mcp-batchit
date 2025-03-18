import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

/**
 * Maps common errors to appropriate MCP error codes
 */
export function mapToMcpError(error: unknown): McpError {
  // Already an MCP error
  if (error instanceof McpError) {
    return error;
  }

  // Node.js specific error codes
  if (error instanceof Error && "code" in error) {
    const code = (error as any).code;

    switch (code) {
      case "ENOENT":
        return new McpError(ErrorCode.InvalidParams, error.message, { originalError: error });

      case "EACCES":
      case "EPERM":
        return new McpError(ErrorCode.InvalidParams, `Permission denied: ${error.message}`, { originalError: error });

      case "ECONNREFUSED":
      case "ECONNRESET":
        return new McpError(ErrorCode.InternalError, error.message, { originalError: error });
    }
  }

  // Default to internal error
  const context = error instanceof Error ? {
    originalError: error,
    stack: error.stack,
    name: error.name
  } : {
    originalError: error
  };

  return new McpError(
    ErrorCode.InternalError,
    error instanceof Error ? error.message : String(error),
    context
  );
}
