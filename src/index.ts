#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js"
import { z } from "zod"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { ChildProcess } from "child_process"

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
  | { type: 'filesystem'; config: FilesystemServerConfig }
  | { type: 'database'; config: DatabaseServerConfig }
  | { type: 'generic'; config: GenericServerConfig }

// Transport Configuration
type TransportConfig =
  | {
      type: 'stdio'
      command: string
      args?: string[]
      env?: Record<string, string>
    }
  | {
      type: 'websocket'
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

// Type guard for StdioClientTransport
function isStdioTransport(transport: any): transport is StdioClientTransport {
  return 'start' in transport
}

// Schema Definitions
const ServerTypeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('filesystem'),
    config: z.object({
      rootDirectory: z.string().optional(),
      permissions: z.string().optional(),
      watchMode: z.boolean().optional()
    })
  }),
  z.object({
    type: z.literal('database'),
    config: z.object({
      database: z.string(),
      readOnly: z.boolean().optional(),
      poolSize: z.number().optional()
    })
  }),
  z.object({
    type: z.literal('generic'),
    config: z.record(z.unknown())
  })
])

const TransportConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stdio'),
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional()
  }),
  z.object({
    type: z.literal('websocket'),
    url: z.string(),
    options: z.record(z.unknown()).optional()
  })
])

const BatchArgsSchema = z.object({
  targetServer: z.object({
    name: z.string(),
    serverType: ServerTypeSchema,
    transport: TransportConfigSchema,
    maxIdleTimeMs: z.number().optional()
  }),
  operations: z.array(
    z.object({
      tool: z.string(),
      arguments: z.record(z.unknown()).default({})
    })
  ),
  options: z.object({
    maxConcurrent: z.number().default(10),
    timeoutMs: z.number().default(30000),
    stopOnError: z.boolean().default(false),
    keepAlive: z.boolean().default(false)
  }).default({
    maxConcurrent: 10,
    timeoutMs: 30000,
    stopOnError: false,
    keepAlive: false
  })
})

// Connection Management
class ConnectionManager {
  private connections = new Map<string, ServerConnection>()
  private cleanupIntervals = new Map<string, NodeJS.Timeout>()

  createKeyForIdentity(identity: ServerIdentity): string {
    return JSON.stringify({
      name: identity.name,
      serverType: identity.serverType,
      transport: identity.transport
    })
  }

  async getOrCreateConnection(identity: ServerIdentity): Promise<ServerConnection> {
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
      identity
    }

    this.connections.set(serverKey, connection)
    this.setupMonitoring(serverKey, connection)
    this.setupCleanupInterval(serverKey)

    return connection
  }

  private async createTransport(config: TransportConfig): Promise<WebSocketClientTransport | StdioClientTransport> {
    switch (config.type) {
      case 'stdio': {
        const transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: config.env,
          stderr: 'pipe'
        })
        await transport.start()
        return transport
      }

      case 'websocket': {
        const wsUrl = config.url.startsWith('ws://') || config.url.startsWith('wss://')
          ? config.url
          : `ws://${config.url}`
        return new WebSocketClientTransport(new URL(wsUrl))
      }
    }
  }

  private setupMonitoring(serverKey: string, connection: ServerConnection): void {
    if (isStdioTransport(connection.transport)) {
      // For stdio transports, we can monitor stderr
      const stderr = connection.transport.stderr
      if (stderr) {
        stderr.on('data', (data: Buffer) => {
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
      if (idleTime > (conn.identity.maxIdleTimeMs ?? 300000)) { // 5min default
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
    const connection = await this.connectionManager.getOrCreateConnection(identity)

    const results: OperationResult[] = []
    const pending = [...operations]
    const running = new Set<Promise<OperationResult>>()

    try {
      while (pending.length > 0 || running.size > 0) {
        while (pending.length > 0 && running.size < options.maxConcurrent) {
          const op = pending.shift()!
          const promise = this.executeOperation(connection, op, options.timeoutMs)
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
          arguments: operation.arguments
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new McpError(ErrorCode.RequestTimeout, "Operation timed out")),
            timeoutMs
          )
        )
      ])

      return {
        tool: operation.tool,
        success: true,
        result,
        durationMs: Date.now() - start
      }
    } catch (error) {
      return {
        tool: operation.tool,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start
      }
    }
  }
}

// Server Setup
const connectionManager = new ConnectionManager()
const batchExecutor = new BatchExecutor(connectionManager)
const server = new McpServer({
  name: "mcp-batchit",
  version: "1.0.0"
})

// Define the tool's schema shape (required properties for tool registration)
const toolSchema = {
  targetServer: BatchArgsSchema.shape.targetServer,
  operations: BatchArgsSchema.shape.operations,
  options: BatchArgsSchema.shape.options
}

server.tool(
  "batch_execute",
  `
  Execute multiple operations in batch on a specified MCP server.
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
  Example:
    {
      "targetServer": {
        "name": "local-fs",
        "serverType": {
          "type": "filesystem",
          "config": {
            "rootDirectory": "/tmp",
            "watchMode": true
          }
        },
        "transport": {
          "type": "stdio",
          "command": "fs-server",
          "args": ["--root", "/tmp"]
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
    }
  `,
  toolSchema,
  async (args) => {
    const parsed = BatchArgsSchema.safeParse(args)
    if (!parsed.success) {
      throw new McpError(ErrorCode.InvalidParams, parsed.error.message)
    }

    const { targetServer, operations, options } = parsed.data

    const results = await batchExecutor.executeBatch(targetServer, operations, options)

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          targetServer: targetServer.name,
          summary: {
            successCount: results.filter(r => r.success).length,
            failCount: results.filter(r => !r.success).length,
            totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0)
          },
          operations: results
        }, null, 2)
      }]
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
