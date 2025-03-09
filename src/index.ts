#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js"
import { z } from "zod"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { withRecovery } from "./utils/recovery.js"
import { formatBatchResults, formatErrorResponse } from "./utils/responseFormat.js"
import { ChildProcess } from "child_process"
import { Provider, createProvider } from "./providers/factory.js"

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
];

// Server Type Definitions
interface FilesystemServerConfig {
  rootDirectory?: string;
  permissions?: string;
  watchMode?: boolean;
  provider?: "batchit-internal" | "external";
}

interface DatabaseServerConfig {
  database: string;
  readOnly?: boolean;
  poolSize?: number;
}

interface GenericServerConfig {
  [key: string]: unknown;
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
  provider?: Provider
}

function getTransportConfig(identity: ServerIdentity): TransportConfig | undefined {
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
    type: z.literal("filesystem").describe("Filesystem server type"),
    config: z.object({
      rootDirectory: z.string().optional().describe("Base directory for all filesystem operations"),
      permissions: z.string().optional().describe("Permissions for filesystem access"),
      watchMode: z.boolean().optional().describe("Enable watch mode for file changes"),
      provider: z.enum(["batchit-internal", "external"]).default("external").describe("Provider type - internal or external filesystem"),
    }),
  }),
  z.object({
    type: z.literal("database").describe("Database server type"),
    config: z.object({
      database: z.string().describe("Database connection string"),
      readOnly: z.boolean().optional().describe("Read-only mode"),
      poolSize: z.number().optional().describe("Connection pool size"),
    }),
  }),
  z.object({
    type: z.literal("generic").describe("Generic server type"),
    config: z.record(z.unknown()).describe("Generic server configuration"),
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
    name: z.string().describe("Server identifier"),
    serverType: ServerTypeSchema,
    transport: TransportConfigSchema.describe("Transport configuration (required for external providers)"),
    maxIdleTimeMs: z.number().optional().describe("Maximum idle time before connection close (ms)"),
  }).describe("Target server configuration"),
  operations: z.array(
    z.object({
      tool: z.string().describe("Name of the tool to execute"),
      arguments: z.record(z.unknown()).default({}).describe("Tool-specific arguments"),
      id: z.string().optional().describe("Unique identifier for referencing operation results"),
      dependsOn: z.union([z.string(), z.array(z.string())]).optional().describe("IDs of operations this one depends on"),
    })
  ).describe("Array of operations to execute"),
  options: z
    .object({
      maxConcurrent: z.number().default(10).describe("Maximum number of concurrent operations"),
      timeoutMs: z.number().default(30000).describe("Operation timeout in milliseconds"),
      stopOnError: z.boolean().default(false).describe("Stop on first error"),
      keepAlive: z.boolean().default(false).describe("Keep connection alive after batch completion"),
    })
    .default({
      maxConcurrent: 10,
      timeoutMs: 30000,
      stopOnError: false,
      keepAlive: false,
    })
    .describe("Batch execution options"),
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

  private validateTransport(transport: TransportConfig): void {
    if (transport.type === "stdio") {
      if (!transport.command) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Command is required for stdio transport"
        );
      }

      const fullCommand = [transport.command, ...(transport.args || [])].join(" ");
      if (SELF_REFERENCE_PATTERNS.some(pattern =>
        fullCommand.toLowerCase().includes(pattern.toLowerCase())
      )) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Cannot spawn the BatchIt aggregator itself"
        );
      }
    } else if (transport.type === "websocket") {
      try {
        const url = new URL(transport.url);
        if (url.protocol !== "ws:" && url.protocol !== "wss:") {
          throw new McpError(
            ErrorCode.InvalidParams,
            "WebSocket URL must use ws:// or wss:// protocol"
          );
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Invalid WebSocket URL"
        );
      }
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

    // For internal provider, don't create transport connection
    if (identity.serverType.type === "filesystem" &&
        identity.serverType.config.provider === "batchit-internal") {

      const provider = createProvider(
        "batchit-internal",
        identity.serverType.config.rootDirectory || process.cwd()
      );

      // Create a provider-based connection instead of transport-based
      const connection: ServerConnection = {
        client: new Client(
          { name: "mcp-batchit", version: "1.0.1" },
          { capabilities: {} }
        ),
        transport: {} as any, // Placeholder until full provider implementation
        provider,
        lastUsed: Date.now(),
        identity
      };

      this.connections.set(serverKey, connection);
      return connection;
    }

    // For external providers, create transport as before
    const transportConfig = getTransportConfig(identity);
    if (!transportConfig) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Transport configuration required for external providers"
      );
    }

    // Create transport with recovery
    const transport = await withRecovery(
      () => this.createTransport(transportConfig)
    );

    const client = new Client(
      { name: "mcp-batchit", version: "1.0.1" },
      { capabilities: {} }
    );

    // Connect client with recovery
    await withRecovery(
      () => client.connect(transport)
    );

    const connection: ServerConnection = {
      client,
      transport,
      lastUsed: Date.now(),
      identity,
    };

    this.connections.set(serverKey, connection);
    this.setupMonitoring(serverKey, connection);
    this.setupCleanupInterval(serverKey);

    return connection;
  }

  private async createTransport(
    config: TransportConfig
  ): Promise<WebSocketClientTransport | StdioClientTransport> {
    switch (config.type) {
      case "stdio": {
        try {
          this.validateTransport(config);

          const transport = new StdioClientTransport({
            command: config.command,
            args: config.args,
            env: config.env,
            stderr: "pipe",
          });

          return transport;
        } catch (error) {
          if (error instanceof McpError) {
            throw error;
          }
          throw new McpError(
            ErrorCode.InvalidParams,
            error instanceof Error ? error.message : String(error)
          );
        }
      }

      case "websocket": {
        try {
          this.validateTransport(config);

          const wsUrl =
            config.url.startsWith("ws://") || config.url.startsWith("wss://")
              ? config.url
              : `ws://${config.url}`;

          const transport = new WebSocketClientTransport(new URL(wsUrl));
          return transport;
        } catch (error) {
          if (error instanceof McpError) {
            throw error;
          }
          throw new McpError(
            ErrorCode.InvalidParams,
            error instanceof Error ? error.message : String(error)
          );
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
// Operation definitions
interface Operation {
  tool: string;
  arguments: Record<string, unknown>;
}

interface OperationResult {
  tool: string;
  success: boolean;
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
      let result: unknown;

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new McpError(ErrorCode.RequestTimeout, "Operation timed out")),
          timeoutMs
        )
      );

      if (connection.provider) {
        const provider = connection.provider;  // Capture in local variable to satisfy TypeScript
        // Use provider for execution with recovery
        result = await withRecovery(async () => {
          return Promise.race([
            provider.executeTool(operation.tool, operation.arguments),
            timeoutPromise
          ]);
        });
      } else {
        // Use transport-based execution with recovery
        result = await withRecovery(async () => {
          return Promise.race([
            connection.client.callTool({
              name: operation.tool,
              arguments: operation.arguments,
            }),
            timeoutPromise
          ]);
        });
      }

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
    try {
      const parsed = BatchArgsSchema.safeParse(args);
      if (!parsed.success) {
        throw new McpError(ErrorCode.InvalidParams, parsed.error.message);
      }

      const { targetServer, operations, options } = parsed.data;

      const results = await batchExecutor.executeBatch(
        targetServer,
        operations,
        options
      );

      return formatBatchResults(results, targetServer.name);
    } catch (error) {
      return formatErrorResponse(error);
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
