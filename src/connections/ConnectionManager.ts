import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import {
  validateTransport,
  getTransportConfig,
} from "../utils/transportValidation.js"
import { withRecovery } from "../utils/recovery.js"
import { ErrorManager } from "../utils/errorManager.js"
import { createProvider } from "../providers/factory.js"
import { FileSystem } from "../filesystem/FileSystem.js"
import {
  ServerConnection,
  ClientTransport,
  createTransportConnection,
  createProviderConnection,
  isTransportConnection,
} from "../types/connections.js"
import { ServerIdentity, TransportConfig } from "../types/schemas/index.js"

export const VERSION = "1.3.1"

export class ConnectionManager {
  private connections = new Map<string, ServerConnection>()
  private cleanupIntervals = new Map<string, NodeJS.Timeout>()
  private defaultFileSystem: FileSystem

  constructor(defaultFileSystem: FileSystem) {
    this.defaultFileSystem = defaultFileSystem
  }

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
      const rootDirectory =
        identity.serverType.config.rootDirectory || process.cwd()
      // Reuse the default filesystem when rootDirectory matches
      const existingFs =
        rootDirectory === this.defaultFileSystem.rootDirectory
          ? this.defaultFileSystem
          : undefined
      const provider = createProvider(
        "batchit-internal",
        rootDirectory,
        existingFs
      )

      // Expose the FileSystem so BatchExecutor can share its ResultsCache
      const fsInstance = existingFs ?? new FileSystem({ rootDirectory })
      const connection = createProviderConnection(
        provider,
        identity,
        fsInstance
      )
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
  ): Promise<ClientTransport> {
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

        case "streamable-http": {
          return new StreamableHTTPClientTransport(new URL(config.url))
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
        ErrorManager.getErrorMessage(error)
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
