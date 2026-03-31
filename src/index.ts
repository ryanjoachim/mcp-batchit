#!/usr/bin/env node

// MCP SDK imports
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js"

// Internal imports - utils
import {
  validateTransport,
  getTransportConfig,
} from "./utils/transportValidation.js"
import { withRecovery } from "./utils/recovery.js"
import {
  formatBatchResults,
  formatErrorResponse,
} from "./utils/responseFormat.js"

// Internal imports - providers
import { createProvider } from "./providers/factory.js"
// Internal imports - types
import {
  BatchArgsSchema,
  BatchExecuteToolSchema,
  ServerIdentity,
  TransportConfig,
  Operation,
  OperationResult,
  isHPCErrorResponse,
  HPCErrorResponse,
} from "./types/schemas/index.js"

// Internal imports - connections
import {
  ServerConnection,
  createTransportConnection,
  createProviderConnection,
  isTransportConnection,
  isProviderConnection,
} from "./types/connections.js"
import { resultsCache } from "./utils/resultsCache.js"

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

  async getOrCreateConnection(
    identity: ServerIdentity
  ): Promise<ServerConnection> {
    const serverKey = this.createKeyForIdentity(identity)

    if (this.connections.has(serverKey)) {
      const conn = this.connections.get(serverKey)!
      conn.lastUsed = Date.now()
      return conn
    }

    // For internal provider, don't create transport connection
    if (
      identity.serverType.type === "filesystem" &&
      identity.serverType.config.provider === "batchit-internal"
    ) {
      const provider = createProvider(
        "batchit-internal",
        identity.serverType.config.rootDirectory || process.cwd()
      )

      const connection = createProviderConnection(provider, identity)
      this.connections.set(serverKey, connection)
      return connection
    }

    // For external providers, create transport as before
    const transportConfig = getTransportConfig(identity)
    if (!transportConfig) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Transport configuration required for external providers"
      )
    }

    // Create transport with recovery
    const transport = await withRecovery(() =>
      this.createTransport(transportConfig)
    )

    const client = new Client(
      { name: "mcp-batchit", version: "1.2.1" },
      { capabilities: {} }
    )

    // Connect client with recovery
    await withRecovery(() => client.connect(transport))

    const connection = createTransportConnection(client, transport, identity)
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
          validateTransport(config)

          const transport = new StdioClientTransport({
            command: config.command,
            args: config.args,
            env: config.env,
            stderr: "pipe",
          })

          return transport
        } catch (error) {
          if (error instanceof McpError) {
            throw error
          }
          throw new McpError(
            ErrorCode.InvalidParams,
            error instanceof Error ? error.message : String(error)
          )
        }
      }

      case "websocket": {
        try {
          validateTransport(config)

          const wsUrl =
            config.url.startsWith("ws://") || config.url.startsWith("wss://")
              ? config.url
              : `ws://${config.url}`

          const transport = new WebSocketClientTransport(new URL(wsUrl))
          return transport
        } catch (error) {
          if (error instanceof McpError) {
            throw error
          }
          throw new McpError(
            ErrorCode.InvalidParams,
            error instanceof Error ? error.message : String(error)
          )
        }
      }
    }
  }

  private setupMonitoring(
    serverKey: string,
    connection: ServerConnection
  ): void {
    if (isTransportConnection(connection)) {
      if (connection.transport instanceof StdioClientTransport) {
        // For stdio transports, we can monitor stderr
        const stderr = connection.transport.stderr
        if (stderr) {
          stderr.on("data", (data: Buffer) => {
            console.error(`[${connection.identity.name}] ${data.toString()}`)
          })
        }
      }

      // Monitor transport errors for all transport types
      connection.transport.onerror = (error: Error) => {
        console.error(`Transport error:`, error)
        this.closeConnection(serverKey)
      }
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
      if (isTransportConnection(conn)) {
        await conn.client.close()
        await conn.transport.close()
      }
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
    const connection =
      await this.connectionManager.getOrCreateConnection(identity)

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
      let result: unknown

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new McpError(ErrorCode.RequestTimeout, "Operation timed out")
            ),
          timeoutMs
        )
      )

      if (isProviderConnection(connection)) {
        // Use provider for execution with recovery
        result = await withRecovery(async () => {
          return Promise.race([
            connection.provider.executeTool(
              operation.tool,
              operation.arguments
            ),
            timeoutPromise,
          ])
        })
      } else {
        // Use transport-based execution with recovery
        result = await withRecovery(async () => {
          return Promise.race([
            connection.client.callTool({
              name: operation.tool,
              arguments: operation.arguments,
            }),
            timeoutPromise,
          ])
        })
      }

      if (isHPCErrorResponse(result)) {
        return {
          tool: operation.tool,
          success: false,
          error: this.getErrorMessage(result),
          durationMs: Date.now() - start,
        }
      }

      const operationResult = {
        tool: operation.tool,
        success: true,
        result,
        durationMs: Date.now() - start,
      }

      if (operation.id) {
        resultsCache.storeResult(operation.id, result)
        console.log(
          `Stored result for operation ${operation.id}: ${JSON.stringify(result)}`
        )
      }

      return operationResult
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
  version: "1.2.1",
  capabilities: {
    tools: {
      batch_execute: true,
    },
  },
})
server.tool(
  "batch_execute",
  `Execute operations in batch on an MCP server. Supports internal filesystem operations ("provider": "batchit-internal") and external MCP servers (stdio or websocket transport).

Capabilities:
1. Result Chaining: Reference operation results using \${results.operationId} syntax
2. Atomic Execution: Operations execute as single unit with proper rollback
3. Concurrent Processing: Independent operations run in parallel (maxConcurrent)
4. Type-Safe: Full TypeScript support with result type preservation
5. Error Recovery: Automatic retry for transient failures

Server Types:
1. Internal Filesystem (batchit-internal):
   Optimized local filesystem provider with direct access
2. External MCP:
   - stdio: Local external servers
   - websocket: Remote server connections

File Operations:
1. Base Configuration:
\`\`\`json
{
  "targetServer": {
    "name": "local-fs",
    "serverType": {
      "type": "filesystem",
      "config": {
        "rootDirectory": "c:/Users/User/workspace",
        "provider": "batchit-internal"
      }
    }
  }
}
\`\`\`

2. Write vs Update Operations (using above targetServer):
\`\`\`json
{
  "operations": [
    {
      "tool": "write_file",
      "arguments": {
        "path": "c:/Users/User/workspace/config.json",
        "content": {
          "version": "1.0.0",
          "debug": true
        }
      }
    },
    {
      "tool": "update_file",
      "arguments": {
        "path": "c:/Users/User/workspace/config.json",
        "operation": {
          "mode": "overwrite",
          "content": "{\\"version\\": \\"2.0.0\\", \\"debug\\": false}",
          "trackOptions": { "enabled": true }
        }
      }
    },
    {
      "tool": "update_file",
      "arguments": {
        "path": "c:/Users/User/workspace/log.txt",
        "operation": {
          "mode": "append",
          "content": "New log entry\\n"
        }
      }
    },
    {
      "tool": "update_file",
      "arguments": {
        "path": "c:/Users/User/workspace/settings.json",
        "operation": {
          "mode": "diff",
          "operations": [
            {
              "line": 2,
              "operation": "replace",
              "text": "  \\"apiEndpoint\\": \\"https://api.example.com\\""
            }
          ]
        }
      }
    }
  ]
}
\`\`\`

3. Result Chaining:
\`\`\`json
{
  "operations": [
    {
      "tool": "write_file",
      "id": "write1",
      "arguments": {
        "path": "c:/Users/User/workspace/data.json",
        "content": { "key": "value" }
      }
    },
    {
      "tool": "read_file",
      "id": "read1",
      "arguments": {
        "path": "c:/Users/User/workspace/data.json"
      },
      "dependsOn": "write1"
    },
    {
      "tool": "write_file",
      "arguments": {
        "path": "c:/Users/User/workspace/backup.json",
        "content": "\${results.read1}"
      },
      "dependsOn": "read1"
    }
  ],
  "options": {
    "maxConcurrent": 2,
    "timeoutMs": 5000,
    "stopOnError": true
  }
}
\`\`\`

Transport Examples:
1. Stdio Transport:
\`\`\`json
{
  "targetServer": {
    "name": "external-fs",
    "serverType": { "type": "filesystem" },
    "transport": {
      "type": "stdio",
      "command": "node",
      "args": ["c:/Users/User/servers/filesystem/server.js"]
    }
  }
}
\`\`\`


Options:
- maxConcurrent: Parallel operations (default: 5)
- timeoutMs: Operation timeout (default: 30000)
- stopOnError: Halt on failure (default: false)
- keepAlive: Maintain connection (default: false)

Requirements:
- Absolute paths required
- Operation IDs needed for dependencies
- Provider matches serverType`,
  BatchExecuteToolSchema,
  async (args) => {
    try {
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

      return formatBatchResults(results, targetServer.name)
    } catch (error) {
      return formatErrorResponse(error)
    }
  }
)

// Expose batch operations as a resource
server.resource("batch", "batch://operations", async (uri) => ({
  contents: [
    {
      uri: uri.href,
      text: JSON.stringify(
        {
          operations: [
            {
              name: "batch_execute",
              description: "Execute operations in batch",
              schema: BatchExecuteToolSchema,
              capabilities: {
                resultChaining: true,
                atomicExecution: true,
                concurrentProcessing: true,
              },
            },
          ],
          serverTypes: {
            filesystem: {
              internal:
                "Optimized local filesystem provider with direct access",
              external: "External MCP servers",
            },
          },
        },
        null,
        2
      ),
    },
  ],
}))

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
