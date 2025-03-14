import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { TransportConfig } from "../types/schemas/transport.js"
import { ServerIdentity } from "../types/schemas/index.js"

/**
 * Patterns that indicate self-referential usage (trying to spawn BatchIt itself)
 */
export const SELF_REFERENCE_PATTERNS = [
  // Direct file path references
  "mcp-batchit/build/index.js",
  "mcp-batchit/dist/index.js",
  "mcp-batchit/lib/index.js",

  // NPM package references
  "@modelcontextprotocol/batchit",
  "@modelcontextprotocol/server-batchit",

  // Common variations
  "mcp-batchit",
  "batchit",
  "server-batchit",
]

/**
 * Validates a stdio command to ensure it's not trying to spawn BatchIt itself
 */
export function validateStdioCommand(command: string, args: string[] = []): void {
  const fullCommand = [command, ...args].join(" ")
  if (SELF_REFERENCE_PATTERNS.some(pattern =>
    fullCommand.toLowerCase().includes(pattern.toLowerCase())
  )) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "Cannot spawn the BatchIt aggregator itself"
    )
  }
}

/**
 * Validates a WebSocket URL format
 */
export function validateWebSocketUrl(url: string): void {
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== "ws:" && parsedUrl.protocol !== "wss:") {
      throw new McpError(
        ErrorCode.InvalidParams,
        "WebSocket URL must use ws:// or wss:// protocol"
      )
    }
  } catch (error) {
    if (error instanceof McpError) throw error
    throw new McpError(
      ErrorCode.InvalidParams,
      "Invalid WebSocket URL"
    )
  }
}

/**
 * Validates transport configuration and throws McpError if invalid
 */
export function validateTransport(transport: TransportConfig): void {
  if (transport.type === "stdio") {
    if (!transport.command) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Command is required for stdio transport"
      )
    }
    validateStdioCommand(transport.command, transport.args)
  } else if (transport.type === "websocket") {
    validateWebSocketUrl(transport.url)
  }
}

/**
 * Gets transport configuration from server identity, handling filesystem provider cases
 */
export function getTransportConfig(identity: ServerIdentity): TransportConfig | undefined {
  // For filesystem servers, handle provider selection
  if (identity.serverType.type === "filesystem") {
    const { provider = "external" } = identity.serverType.config;

    // Internal provider doesn't need external transport
    if (provider === "batchit-internal") {
      return undefined;
    }

    // External provider requires transport configuration
    if (provider === "external" && !identity.transport) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "External providers require transport configuration"
      );
    }
  }

  return identity.transport;
}
