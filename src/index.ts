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
import { createOrderedBatches } from "./utils/dependencyOrder.js"
import { getErrorMessageFromHpcResponse } from "./utils/errorMapper.js"

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

const VERSION = "1.2.1"

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
      { name: "mcp-batchit", version: VERSION },
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
    try {
      validateTransport(config)

      switch (config.type) {
        case "stdio": {
          return new StdioClientTransport({
            command: config.command,
            args: config.args,
            env: config.env,
            stderr: "pipe",
          })
        }

        case "websocket": {
          const wsUrl =
            config.url.startsWith("ws://") || config.url.startsWith("wss://")
              ? config.url
              : `ws://${config.url}`
          return new WebSocketClientTransport(new URL(wsUrl))
        }

        default:
          throw new McpError(
            ErrorCode.InvalidParams,
            `Unsupported transport type: ${(config as { type: string }).type}`
          )
      }
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

    interval.unref() // Don't prevent the process from exiting when idle
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
    await Promise.all(
      [...this.connections.keys()].map((key) => this.closeConnection(key))
    )
  }
}

class BatchExecutor {
  constructor(private connectionManager: ConnectionManager) { }

  async executeBatch(
    identity: ServerIdentity,
    operations: Operation[],
    options: {
      maxConcurrent: number
      timeoutMs: number
      stopOnError: boolean
      keepAlive?: boolean
    },
    context?: {
      signal?: AbortSignal
      onProgress?: (completed: number, total: number) => Promise<void>
    }
  ): Promise<OperationResult[]> {
    const connection =
      await this.connectionManager.getOrCreateConnection(identity)

    const results: OperationResult[] = []
    const batches = createOrderedBatches(operations)

    try {
      for (const batch of batches) {
        // Respect cancellation between batch layers
        if (context?.signal?.aborted) {
          break
        }

        const batchResults = await Promise.all(
          batch.map((op) =>
            this.executeOperation(connection, op, options.timeoutMs, context?.signal)
          )
        )
        results.push(...batchResults)

        // Emit progress after each completed layer
        if (context?.onProgress) {
          await context.onProgress(results.length, operations.length)
        }

        if (options.stopOnError && batchResults.some((r) => !r.success)) {
          break
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
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<OperationResult> {
    const start = Date.now()

    // Fast-path: already cancelled before we even start
    if (signal?.aborted) {
      return {
        tool: operation.tool,
        success: false,
        error: "Operation cancelled",
        durationMs: 0,
      }
    }

    try {
      let result: unknown

      // Build race targets: timeout + optional cancellation signal
      let timeoutHandle: NodeJS.Timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new McpError(ErrorCode.RequestTimeout, "Operation timed out")),
          timeoutMs
        )
      })

      const abortPromise = signal
        ? new Promise<never>((_, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new Error("Operation cancelled")),
            { once: true }
          )
        })
        : null

      const raceTargets: Promise<never>[] = abortPromise
        ? [timeoutPromise, abortPromise]
        : [timeoutPromise]

      try {
        if (isProviderConnection(connection)) {
          // Use provider for execution with recovery
          result = await withRecovery(async () => {
            return Promise.race([
              connection.provider.executeTool(
                operation.tool,
                operation.arguments
              ),
              ...raceTargets,
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
              ...raceTargets,
            ])
          })
        }
      } finally {
        clearTimeout(timeoutHandle!) // Always clear to prevent handle leak
      }

      if (isHPCErrorResponse(result)) {
        return {
          tool: operation.tool,
          success: false,
          error: getErrorMessageFromHpcResponse(result),
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
  version: VERSION,
  // description is surfaced to clients during the initialize handshake, giving them
  // a usage guide without consuming tool description tokens on every tools/list call.
  description: `mcp-batchit executes multiple MCP tool calls in a single batch request with dependency ordering and result chaining.

Supports two server types:
- batchit-internal: Optimised local filesystem provider (write_file, update_file, read_file, etc.)
- External MCP servers via stdio or websocket transport

Key features:
- Result chaining: reference prior operation output using \${results.<operationId>} in arguments
- Dependency ordering: set dependsOn on an operation to ensure it runs after its dependency
- Concurrent execution: independent operations within a layer run in parallel up to maxConcurrent
- Error recovery: transient failures are automatically retried via withRecovery

Options (all optional):
- maxConcurrent (default 5): max parallel operations per dependency layer
- timeoutMs (default 30000): per-operation timeout in milliseconds
- stopOnError (default false): halt the batch on the first failure
- keepAlive (default false): keep the target server connection open after the batch

All file paths must be absolute.`,
  capabilities: {
    // tools.listChanged: false — this server exposes a fixed tool set
    tools: { listChanged: false },
    resources: {},
  },
})
// tool() expects ZodRawShapeCompat (the raw shape), not a full ZodObject.
// Using .shape unwraps the ZodObject so the SDK can infer args types correctly,
// and ensures the call resolves to the right overload — which returns RegisteredTool.
const batchTool = server.tool(
  "batch_execute",
  // Concise behavioural description — examples and full usage live in server description.
  `Execute one or more operations in batch on a target MCP server. Supports internal filesystem operations (provider: "batchit-internal") and external MCP servers (stdio or websocket). Operations may declare dependsOn to form a dependency graph; independent operations within each layer run concurrently. Reference prior results with \${results.<id>} syntax. Supports cancellation via the MCP notifications/cancelled notification.`,
  BatchExecuteToolSchema,
  async (args, extra) => {
    try {
      const parsed = BatchArgsSchema.safeParse(args)
      if (!parsed.success) {
        throw new McpError(ErrorCode.InvalidParams, parsed.error.message)
      }

      const { targetServer, operations, options } = parsed.data

      // extra.signal is aborted by the SDK when the client sends notifications/cancelled.
      // NOTE: Progress notifications (notifications/progress) require RequestHandlerExtra
      // to expose _meta.progressToken and sendNotification(), neither of which are
      // present in this SDK version. The onProgress hook in executeBatch is wired up
      // and ready — upgrade the SDK to enable it here.
      const results = await batchExecutor.executeBatch(
        targetServer,
        operations,
        options,
        {
          signal: extra.signal,
        }
      )

      // structuredContent lets clients consume results programmatically (spec 2025-06-18+).
      // The text content field is retained for backwards-compatible display.
      const structuredContent = {
        serverName: targetServer.name,
        totalOperations: operations.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results: results.map(({ tool, success, result, error, durationMs }) => ({
          tool,
          success,
          ...(result !== undefined && { result }),
          ...(error !== undefined && { error }),
          durationMs,
        })),
      }

      return {
        ...formatBatchResults(results, targetServer.name),
        structuredContent,
      }
    } catch (error) {
      return formatErrorResponse(error)
    }
  }
)

// Set annotations on the registered tool. tool() now correctly returns RegisteredTool
// (the .shape fix above resolved the overload), so .update() is available.
// Clients SHOULD surface these hints to users before invoking.
batchTool.update({
  annotations: {
    destructiveHint: true,   // batch can write, overwrite, or delete files
    openWorldHint: true,     // connects to arbitrary external MCP servers
    idempotentHint: false,   // repeated calls produce different side-effects
  },
})

// Expose the batch_execute output schema as a readable resource.
// Resources are for data clients can inspect — a hand-written JSON Schema is
// far more useful here than serialising a Zod object (which emits internal metadata).
server.resource(
  "batch-output-schema",
  "batch://output-schema",
  { mimeType: "application/schema+json" },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/schema+json",
        text: JSON.stringify(
          {
            $schema: "http://json-schema.org/draft-07/schema#",
            title: "batch_execute structuredContent output",
            type: "object",
            required: ["serverName", "totalOperations", "succeeded", "failed", "results"],
            properties: {
              serverName: {
                type: "string",
                description: "Name of the target server the batch ran against",
              },
              totalOperations: { type: "number" },
              succeeded: { type: "number" },
              failed: { type: "number" },
              results: {
                type: "array",
                items: {
                  type: "object",
                  required: ["tool", "success", "durationMs"],
                  properties: {
                    tool: { type: "string", description: "Tool name that was invoked" },
                    success: { type: "boolean" },
                    result: { description: "Tool output — present on success, shape depends on the target tool" },
                    error: { type: "string", description: "Error message — present on failure" },
                    durationMs: { type: "number", description: "Wall-clock time for this operation" },
                  },
                },
              },
            },
          },
          null,
          2
        ),
      },
    ],
  })
)

// Startup
async function cleanup() {
  console.error("Shutting down, closing all connections...")
  await connectionManager.closeAll()
  await server.close()
  process.exit(0)
}

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error("mcp-batchit is running on stdio. Ready to batch-execute!")

  process.on("SIGINT", cleanup)
  process.on("SIGTERM", cleanup)
}

main().catch((err) => {
  console.error("Fatal error in aggregator server:", err)
  process.exit(1)
})
