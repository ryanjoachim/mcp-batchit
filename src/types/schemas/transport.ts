import { z } from "zod"

/**
 * Base type for transport configuration
 */
export type BaseTransportConfig = {
  type: string
}

/**
 * Type for stdio transport configuration
 */
export type StdioTransportConfig = BaseTransportConfig & {
  type: "stdio"
  command: string
  args?: string[]
  env?: Record<string, string>
}

/**
 * Type for WebSocket transport configuration
 */
export type WebSocketTransportConfig = BaseTransportConfig & {
  type: "websocket"
  url: string
  options?: Record<string, unknown>
}

/**
 * Type for StreamableHTTP transport configuration
 */
export type StreamableHTTPTransportConfig = BaseTransportConfig & {
  type: "streamable-http"
  url: string
  options?: Record<string, unknown>
}

/**
 * Union type for all transport configurations
 */
export type TransportConfig =
  | StdioTransportConfig
  | WebSocketTransportConfig
  | StreamableHTTPTransportConfig

/**
 * Schema for stdio transport configuration
 */
export const StdioTransportConfigSchema = z.object({
  type: z.literal("stdio"),
  command: z.string().describe("Command to execute"),
  args: z.array(z.string()).optional().describe("Command arguments"),
  env: z.record(z.string()).optional().describe("Environment variables"),
})

/**
 * Schema for WebSocket transport configuration
 */
export const WebSocketTransportConfigSchema = z.object({
  type: z.literal("websocket"),
  url: z.string().describe("WebSocket URL (ws:// or wss://)"),
  options: z
    .record(z.unknown())
    .optional()
    .describe("WebSocket connection options"),
})

/**
 * Schema for StreamableHTTP transport configuration
 */
export const StreamableHTTPTransportConfigSchema = z.object({
  type: z.literal("streamable-http"),
  url: z
    .string()
    .describe("HTTP URL for StreamableHTTP transport (http:// or https://)"),
  options: z
    .record(z.unknown())
    .optional()
    .describe("StreamableHTTP connection options"),
})

/**
 * Schema for transport configuration discriminated union
 */
export const TransportConfigSchema = z
  .discriminatedUnion("type", [
    StdioTransportConfigSchema,
    WebSocketTransportConfigSchema,
    StreamableHTTPTransportConfigSchema,
  ])
  .describe("Transport configuration (required for external providers)")
