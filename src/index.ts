#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js"
import { z } from "zod"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { ChildProcess } from "child_process"
import { existsSync } from "fs"
import { isAbsolute } from "path"

// Array of patterns that indicate self-referential usage
const SELF_REFERENCE_PATTERNS = [
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

// Transport error handling
enum TransportErrorType {
  CommandNotFound = "CommandNotFound",
  ConnectionFailed = "ConnectionFailed",
  ValidationFailed = "ValidationFailed",
  ConfigurationInvalid = "ConfigurationInvalid",
}

class TransportError extends Error {
  constructor(
    public type: TransportErrorType,
    message: string,
    public cause?: Error
  ) {
    super(message)
    this.name = "TransportError"
    Error.captureStackTrace(this, TransportError)
  }
}

// Server Type Definitions
interface FilesystemServerConfig {
  rootDirectory?: string
  permissions?: string
  watchMode?: boolean
}

interface DatabaseServerConfig {
  database: string
  readOnly?: boolean
  poolSize?: number
}

interface GenericServerConfig {
  [key: string]: unknown
}

type ServerType =
  | { type: "filesystem"; config: FilesystemServerConfig }
  | { type: "database"; config: DatabaseServerConfig }
  | { type: "generic"; config: GenericServerConfig }

// Transport Configuration
type TransportConfig =
  | {
      type: "stdio"
      command: string
      args?: string[]
      env?: Record<string, string>
    }
  | {
      type: "websocket"
      url: string
      options?: Record<string, unknown>
    }

interface ServerIdentity {
  name: string
  serverType: ServerType
  transport: TransportConfig
  maxIdleTimeMs?: number
}

interface ServerConnection {
  client: Client
  transport: WebSocketClientTransport | StdioClientTransport
  childProcess?: ChildProcess
  lastUsed: number
  identity: ServerIdentity
}

interface HPCContentItem {
  type: string
  text?: string
}

interface HPCErrorResponse {
  isError: true
  error?: string
  message?: string
  content?: HPCContentItem[]
}

function isHPCErrorResponse(value: unknown): value is HPCErrorResponse {
  return (
    value !== null &&
    typeof value === "object" &&
    "isError" in value &&
    value.isError === true
  )
}

// Type guard for StdioClientTransport
function isStdioTransport(transport: any): transport is StdioClientTransport {
  return "start" in transport
}

// Schema Definitions
const ServerTypeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("filesystem"),
    config: z.object({
      rootDirectory: z.string().optional(),
      permissions: z.string().optional(),
      watchMode: z.boolean().optional(),
    }),
  }),
  z.object({
    type: z.literal("database"),
    config: z.object({
      database: z.string(),
      readOnly: z.boolean().optional(),
      poolSize: z.number().optional(),
    }),
  }),
  z.object({
    type: z.literal("generic"),
    config: z.record(z.unknown()),
  }),
])

const TransportConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stdio"),
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
  }),
  z.object({
    type: z.literal("websocket"),
    url: z.string(),
    options: z.record(z.unknown()).optional(),
  }),
])

const BatchArgsSchema = z.object({
  targetServer: z.object({
    name: z.string(),
    serverType: ServerTypeSchema,
    transport: TransportConfigSchema,
    maxIdleTimeMs: z.number().optional(),
  }),
  operations: z.array(
    z.object({
      tool: z.string(),
      arguments: z.record(z.unknown()).default({}),
    })
  ),
  options: z
    .object({
      maxConcurrent: z.number().default(10),
      timeoutMs: z.number().default(30000),
      stopOnError: z.boolean().default(false),
      keepAlive: z.boolean().default(false),
    })
    .default({
      maxConcurrent: 10,
      timeoutMs: 30000,
      stopOnError: false,
      keepAlive: false,
    }),
})

// Connection Management
class ConnectionManager {
  private connections = new Map<string, ServerConnection>()
  private cleanupIntervals = new Map<string, NodeJS.Timeout>()

  createKeyForIdentity(identity: ServerIdentity): string {
    return JSON.stringify({
      name: identity.name,
      serverType: identity.serverType,
      transport: identity.transport,
    })
  }

  private validateStdioConfig(
    config: Extract<TransportConfig, { type: "stdio" }>
  ) {
    if (!config.command) {
      throw new TransportError(
        TransportErrorType.ConfigurationInvalid,
        "Command is required for stdio transport"
      )
    }

    if (!config.args?.length) {
      throw new TransportError(
        TransportErrorType.ConfigurationInvalid,
        "At least one argument (server file path) is required"
      )
    }

    // For node commands, validate the file exists
    if (config.command === "node") {
      const serverFile = config.args[0]
      if (!isAbsolute(serverFile)) {
        throw new TransportError(
          TransportErrorType.ConfigurationInvalid,
          "Server file path must be absolute when using node command"
        )
      }
      if (!existsSync(serverFile)) {
        throw new TransportError(
          TransportErrorType.ValidationFailed,
          `Server file not found: ${serverFile}`
        )
      }

      // Prevent the BatchIt aggregator from spawning itself
      const fullCommand = [config.command, ...(config.args || [])].join(" ")
      if (
        SELF_REFERENCE_PATTERNS.some((pattern) =>
          fullCommand.toLowerCase().includes(pattern.toLowerCase())
        )
      ) {
        throw new TransportError(
          TransportErrorType.ConfigurationInvalid,
          "Cannot spawn the BatchIt aggregator itself. Provide a valid MCP server file instead."
        )
      }
    }
  }

  private validateWebSocketConfig(
    config: Extract<TransportConfig, { type: "websocket" }>
  ) {
    try {
      const url = new URL(config.url)
      if (url.protocol !== "ws:" && url.protocol !== "wss:") {
        throw new TransportError(
          TransportErrorType.ConfigurationInvalid,
          "WebSocket URL must use ws:// or wss:// protocol"
        )
      }
    } catch (error) {
      throw new TransportError(
        TransportErrorType.ConfigurationInvalid,
        "Invalid WebSocket URL",
        error instanceof Error ? error : undefined
      )
    }
  }

  async getOrCreateConnection(
    identity: ServerIdentity
  ): Promise<ServerConnection> {
    const serverKey = this.createKeyForIdentity(identity)

    if (this.connections.has(serverKey)) {
      const conn = this.connections.get(serverKey)!
      conn.lastUsed = Date.now()
      return conn
    }

    const transport = await this.createTransport(identity.transport)
    const client = new Client(
      { name: "mcp-batchit", version: "1.0.0" },
      { capabilities: {} }
    )

    await client.connect(transport)

    const connection: ServerConnection = {
      client,
      transport,
      lastUsed: Date.now(),
      identity,
    }

    this.connections.set(serverKey, connection)
    this.setupMonitoring(serverKey, connection)
    this.setupCleanupInterval(serverKey)

    return connection
  }

  private async createTransport(
    config: TransportConfig
  ): Promise<WebSocketClientTransport | StdioClientTransport> {
    switch (config.type) {
      case "stdio": {
        try {
          this.validateStdioConfig(config)

          try {
            const transport = new StdioClientTransport({
              command: config.command,
              args: config.args,
              env: config.env,
              stderr: "pipe",
            })

            // Test the transport
            return transport
          } catch (error) {
            if (
              error &&
              typeof error === "object" &&
              "code" in error &&
              error.code === "ENOENT"
            ) {
              throw new TransportError(
                TransportErrorType.CommandNotFound,
                `Command '${config.command}' not found in PATH. If using 'npx', ensure it's installed globally. Consider using 'node' with direct path to server JS file instead.`
              )
            }
            throw error
          }
        } catch (error) {
          if (error instanceof TransportError) {
            throw new McpError(ErrorCode.InvalidParams, error.message)
          } else {
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to create stdio transport: ${
                error instanceof Error ? error.message : String(error)
              }`
            )
          }
        }
      }

      case "websocket": {
        try {
          this.validateWebSocketConfig(config)

          const wsUrl =
            config.url.startsWith("ws://") || config.url.startsWith("wss://")
              ? config.url
              : `ws://${config.url}`

          const transport = new WebSocketClientTransport(new URL(wsUrl))
          return transport
        } catch (error) {
          if (error instanceof TransportError) {
            throw new McpError(ErrorCode.InvalidParams, error.message)
          } else {
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to create WebSocket transport: ${
                error instanceof Error ? error.message : String(error)
              }`
            )
          }
        }
      }
    }
  }

  private setupMonitoring(
    serverKey: string,
    connection: ServerConnection
  ): void {
    if (isStdioTransport(connection.transport)) {
      // For stdio transports, we can monitor stderr
      const stderr = connection.transport.stderr
      if (stderr) {
        stderr.on("data", (data: Buffer) => {
          console.error(`[${connection.identity.name}] ${data.toString()}`)
        })
      }
    }

    // Monitor transport errors
    connection.transport.onerror = (error: Error) => {
      console.error(`Transport error:`, error)
      this.closeConnection(serverKey)
    }
  }

  private setupCleanupInterval(serverKey: string): void {
    const interval = setInterval(() => {
      const conn = this.connections.get(serverKey)
      if (!conn) return

      const idleTime = Date.now() - conn.lastUsed
      if (idleTime > (conn.identity.maxIdleTimeMs ?? 300000)) {
        // 5min default
        this.closeConnection(serverKey)
      }
    }, 60000) // Check every minute

    this.cleanupIntervals.set(serverKey, interval)
  }

  async closeConnection(serverKey: string): Promise<void> {
    const conn = this.connections.get(serverKey)
    if (!conn) return

    try {
      await conn.client.close()
      await conn.transport.close()
    } catch (error) {
      console.error(`Error closing connection for ${serverKey}:`, error)
    }

    this.connections.delete(serverKey)

    const interval = this.cleanupIntervals.get(serverKey)
    if (interval) {
      clearInterval(interval)
      this.cleanupIntervals.delete(serverKey)
    }
  }

  async closeAll(): Promise<void> {
    for (const serverKey of this.connections.keys()) {
      await this.closeConnection(serverKey)
    }
  }
}

// Batch Execution
interface Operation {
  tool: string
  arguments: Record<string, unknown>
}

interface OperationResult {
  tool: string
  success: boolean
  result?: unknown
  error?: string
  durationMs: number
}

class BatchExecutor {
  constructor(private connectionManager: ConnectionManager) {}

  async executeBatch(
    identity: ServerIdentity,
    operations: Operation[],
    options: {
      maxConcurrent: number
      timeoutMs: number
      stopOnError: boolean
      keepAlive?: boolean
    }
  ): Promise<OperationResult[]> {
    const connection = await this.connectionManager.getOrCreateConnection(
      identity
    )

    const results: OperationResult[] = []
    const pending = [...operations]
    const running = new Set<Promise<OperationResult>>()

    try {
      while (pending.length > 0 || running.size > 0) {
        while (pending.length > 0 && running.size < options.maxConcurrent) {
          const op = pending.shift()!
          const promise = this.executeOperation(
            connection,
            op,
            options.timeoutMs
          )
          running.add(promise)

          promise.then((res) => {
            running.delete(promise)
            results.push(res)
            if (!res.success && options.stopOnError) {
              pending.length = 0
            }
          })
        }

        if (running.size > 0) {
          await Promise.race(running)
        }
      }
    } finally {
      if (!options.keepAlive) {
        await this.connectionManager.closeConnection(
          this.connectionManager.createKeyForIdentity(identity)
        )
      }
    }

    return results
  }

  private getErrorMessage(result: HPCErrorResponse): string {
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

  private async executeOperation(
    connection: ServerConnection,
    operation: Operation,
    timeoutMs: number
  ): Promise<OperationResult> {
    const start = Date.now()
    try {
      const result = await Promise.race([
        connection.client.callTool({
          name: operation.tool,
          arguments: operation.arguments,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new McpError(ErrorCode.RequestTimeout, "Operation timed out")
              ),
            timeoutMs
          )
        ),
      ])

      if (isHPCErrorResponse(result)) {
        return {
          tool: operation.tool,
          success: false,
          error: this.getErrorMessage(result),
          durationMs: Date.now() - start,
        }
      }

      return {
        tool: operation.tool,
        success: true,
        result,
        durationMs: Date.now() - start,
      }
    } catch (error) {
      return {
        tool: operation.tool,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
      }
    }
  }
}

// Server Setup
const connectionManager = new ConnectionManager()
const batchExecutor = new BatchExecutor(connectionManager)
const server = new McpServer({
  name: "mcp-batchit",
  version: "1.0.0",
})

// Define the tool's schema shape (required properties for tool registration)
const toolSchema = {
  targetServer: BatchArgsSchema.shape.targetServer,
  operations: BatchArgsSchema.shape.operations,
  options: BatchArgsSchema.shape.options,
}

server.tool(
  "batch_execute",
  `
Execute multiple operations in batch on a specified MCP server. You must provide a real MCP server (like @modelcontextprotocol/server-filesystem). The aggregator will reject any attempt to spawn itself.

Transport Configuration:

1. For stdio transport (recommended for local servers):
   Using node with direct file path (preferred):
   {
     "transport": {
       "type": "stdio",
       "command": "node",
       "args": ["C:/path/to/server.js"]
     }
   }

   Using npx (requires global npx installation):
   {
     "transport": {
       "type": "stdio",
       "command": "npx",
       "args": ["@modelcontextprotocol/server-filesystem"]
     }
   }

2. For WebSocket transport (for connecting to running servers):
   {
     "transport": {
       "type": "websocket",
       "url": "ws://localhost:3000"
     }
   }

Usage:
  - Provide "targetServer" configuration with:
    - name: Unique identifier for the server
    - serverType: Type and configuration of the server (filesystem, database, or generic)
    - transport: Connection method (stdio or websocket) and its configuration
  - Provide "operations" as an array of objects with:
    - tool: The tool name on the target server
    - arguments: The JSON arguments to pass
  - Options:
    - maxConcurrent: Maximum concurrent operations (default: 10)
    - timeoutMs: Timeout per operation in milliseconds (default: 30000)
    - stopOnError: Whether to stop on first error (default: false)
    - keepAlive: Keep connection after batch completion (default: false)

Complete Example:
  {
    "targetServer": {
      "name": "local-fs",
      "serverType": {
        "type": "filesystem",
        "config": {
          "rootDirectory": "C:/data",
          "watchMode": true
        }
      },
       "transport": {
        "type": "stdio",
        "command": "node",
         "args": ["C:/path/to/filesystem-server.js"]
      }
    },
     "operations": [
      { "tool": "createFile", "arguments": { "path": "test1.txt", "content": "Hello" } },
      { "tool": "createFile", "arguments": { "path": "test2.txt", "content": "World" } }
    ],
    "options": {
      "maxConcurrent": 3,
      "stopOnError": true
    }
  }`,
  toolSchema,
  async (args) => {
    const parsed = BatchArgsSchema.safeParse(args)
    if (!parsed.success) {
      throw new McpError(ErrorCode.InvalidParams, parsed.error.message)
    }

    const { targetServer, operations, options } = parsed.data

    const results = await batchExecutor.executeBatch(
      targetServer,
      operations,
      options
    )

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              targetServer: targetServer.name,
              summary: {
                successCount: results.filter((r) => r.success).length,
                failCount: results.filter((r) => !r.success).length,
                totalDurationMs: results.reduce(
                  (sum, r) => sum + r.durationMs,
                  0
                ),
              },
              operations: results,
            },
            null,
            2
          ),
        },
      ],
    }
  }
)

// Startup
;(async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error("mcp-batchit is running on stdio. Ready to batch-execute!")

  process.on("SIGINT", cleanup)
  process.on("SIGTERM", cleanup)
})().catch((err) => {
  console.error("Fatal error in aggregator server:", err)
  process.exit(1)
})

async function cleanup() {
  console.error("Shutting down, closing all connections...")
  await connectionManager.closeAll()
  await server.close()
  process.exit(0)
}
