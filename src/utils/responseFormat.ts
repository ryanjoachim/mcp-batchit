import { OperationResult } from "../types/operations.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

type TextContent = {
  type: "text";
  text: string;
  [key: string]: unknown;
};

type ImageContent = {
  type: "image";
  data: string;
  mimeType: string;
  [key: string]: unknown;
};

type ResourceContent = {
  type: "resource";
  resource: {
    text: string;
    uri: string;
    mimeType?: string;
    [key: string]: unknown;
  } | {
    uri: string;
    blob: string;
    mimeType?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type McpContent = TextContent | ImageContent | ResourceContent;

interface McpResponse {
  content: McpContent[];
  [key: string]: unknown;
}

/**
 * Formats batch results into standardized response
 */
export function formatBatchResults(
  results: OperationResult[],
  serverName: string
): McpResponse {
  const textContent: TextContent = {
    type: "text",
    text: JSON.stringify({
      targetServer: serverName,
      summary: {
        successCount: results.filter(r => r.success).length,
        failCount: results.filter(r => !r.success).length,
        totalDurationMs: results.reduce((sum, r) => sum + (r.durationMs || 0), 0),
      },
      operations: results
    }, null, 2)
  };

  return {
    content: [textContent]
  };
}

/**
 * Formats an error into a standardized response
 */
export function formatErrorResponse(error: unknown): McpResponse {
  const mcpError = error instanceof McpError ? error :
    new McpError(1, error instanceof Error ? error.message : String(error));

  const textContent: TextContent = {
    type: "text",
    text: JSON.stringify({
      error: {
        code: mcpError.code,
        message: mcpError.message
      }
    }, null, 2)
  };

  return {
    content: [textContent],
    isError: true
  };
}
