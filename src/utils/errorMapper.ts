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
        return new McpError(ErrorCode.InvalidParams, error.message);

      case "EACCES":
      case "EPERM":
        return new McpError(ErrorCode.InvalidParams, `Permission denied: ${error.message}`);

      case "ECONNREFUSED":
      case "ECONNRESET":
        return new McpError(ErrorCode.InternalError, error.message);
    }
  }

  // Default to internal error
  return new McpError(
    ErrorCode.InternalError,
    error instanceof Error ? error.message : String(error)
  );
}
