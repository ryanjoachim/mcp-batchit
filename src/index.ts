#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js"
import { z } from "zod"
import {
  McpError,
  ErrorCode,
  CallToolResultSchema,
  EmptyResultSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { ChildProcess } from "child_process"
//import * as fs from "fs/promises"
// import * as path from "path"
import { existsSync } from "fs"
import { isAbsolute } from "path"

// Import the existing batchit filesystem code:
import {
  readFileOp,
  readMultipleFilesOp,
  writeFileOp,
  editFileOp,
  createDirectoryOp,
  listDirectoryOp,
  directoryTreeOp,
  moveFileOp,
  searchFilesOp,
  getFileInfoOp,
  ReadFileArgsSchema,
  ReadMultipleFilesArgsSchema,
  WriteFileArgsSchema,
  EditFileArgsSchema,
  CreateDirectoryArgsSchema,
  ListDirectoryArgsSchema,
  DirectoryTreeArgsSchema,
  MoveFileArgsSchema,
  SearchFilesArgsSchema,
  GetFileInfoArgsSchema,
  PathValidationConfig,
} from "./batchit-filesystem/index.js"

// Import the memory bank schema and implementation
import { MemoryBankToolSchema } from "./schemas/memory-bank.js"
import { MemoryBank } from "./mem-bank/index.js"

// Self-reference blocklist:
const SELF_REFERENCE_PATTERNS = [
  "mcp-batchit/build/index.js",
  "mcp-batchit/dist/index.js",
  "mcp-batchit/lib/index.js",
  "@modelcontextprotocol/batchit",
  "@modelcontextprotocol/server-batchit",
  "mcp-batchit",
  "batchit",
  "server-batchit",
]

// -----------------------------
// Provider and Transport Types
// -----------------------------
/**
 * Defines the possible types of filesystem providers:
 * - 'batchit-internal': For local filesystem operations using BatchIt's built-in capabilities
 * - 'external': For remote/external filesystem operations that require transport configuration
 *
 * File Handling Features:
 * - Supports PDF and DOCX file content extraction
 * - Line number formatting options
 * - Binary file safety checks
 * - Configurable encoding and concurrent operations
 */
export type ProviderType = "batchit-internal" | "external"

// -----------------------------
// Transport Error Handling
// -----------------------------
export enum TransportErrorType {
  CommandNotFound = "CommandNotFound",
  ConnectionFailed = "ConnectionFailed",
  ValidationFailed = "ValidationFailed",
  ConfigurationInvalid = "ConfigurationInvalid",
}

export class TransportError extends Error {
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

// -----------------------------
// Server Type Definitions
// -----------------------------
interface FilesystemServerConfig {
  rootDirectory: string // Required for path validation
  permissions?: string // Optional - currently unused
  watchMode?: boolean // Optional - for future use
  provider: ProviderType // Provider distinction
}

interface DatabaseServerConfig {
  database: string
  readOnly?: boolean
  poolSize?: number
}

interface GenericServerConfig {
  [key: string]: unknown
}

export type ServerType =
  | { type: "filesystem"; config: FilesystemServerConfig }
  | { type: "database"; config: DatabaseServerConfig }
  | { type: "generic"; config: GenericServerConfig }

// -----------------------------
// Transport Configuration
// -----------------------------
export type TransportConfig =
  | {
      type: "stdio"
      command: string
      args?: string[]
      env?: Record<string, string>
      npxDownload?: boolean
    }
  | {
      type: "websocket"
      url: string
      options?: Record<string, unknown>
    }

export interface ServerIdentity {
  name: string
  serverType: ServerType
  transport?: TransportConfig
  maxIdleTimeMs?: number
}

export interface ServerConnection {
  client: Client
  transport: WebSocketClientTransport | StdioClientTransport
  childProcess?: ChildProcess
  lastUsed: number
  identity: ServerIdentity
}

export interface HPCContentItem {
  type: string
  text?: string
}

export interface HPCErrorResponse {
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
    (value as HPCErrorResponse).isError === true
  )
}

function isStdioTransport(transport: any): transport is StdioClientTransport {
  return "start" in transport
}

// -----------------------------
// Schema Definitions
// -----------------------------
const ServerTypeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("filesystem"),
    config: z
      .object({
        rootDirectory: z
          .string()
          .describe(
            "Required - base directory (Absolute Path) for all filesystem operations"
          ),
        permissions: z
          .string()
          .optional()
          .describe("Optional - currently unused"),
        watchMode: z.boolean().optional().describe("Optional - for future use"),
        provider: z
          .enum(["batchit-internal", "external"])
          .describe(
            "Provider type - internal ('batchit-internal') or external ('external') filesystem"
          ),
      })
      .refine((data) => !!data.rootDirectory, {
        message:
          "rootDirectory (Absolute Path) is required for filesystem server type",
        path: ["rootDirectory"],
      })
      .refine((data) => !!data.provider, {
        message: "provider is required for filesystem server type",
        path: ["provider"],
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
    npxDownload: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("websocket"),
    url: z.string(),
    options: z.record(z.unknown()).optional(),
  }),
])

export interface Operation {
  tool: string
  arguments: Record<string, unknown>
  id?: string
  dependsOn?: string | string[]
  transform?: unknown
}

export interface OperationResult {
  tool: string
  success: boolean
  result?: unknown
  error?: string
  durationMs: number
  operationId?: string
}

const BatchArgsSchema = z.object({
  targetServer: z
    .object({
      name: z.string(),
      serverType: ServerTypeSchema,
      transport: TransportConfigSchema.optional(),
      maxIdleTimeMs: z.number().optional(),
    })
    .refine(
      (data) => {
        // Transport is required for external filesystem providers
        if (
          data.serverType.type === "filesystem" &&
          data.serverType.config.provider === "external"
        ) {
          return !!data.transport
        }
        return true
      },
      {
        message:
          "Transport configuration is required for external filesystem providers",
        path: ["transport"],
      }
    ),
  operations: z.array(
    z.object({
      tool: z.string(),
      arguments: z.record(z.unknown()).default({}),
      id: z.string().optional(),
      dependsOn: z.union([z.string(), z.array(z.string())]).optional(),
      transform: z.any().optional(),
    })
  ),
  options: z
    .object({
      maxConcurrent: z.number().default(5),
      timeoutMs: z.number().default(30000),
      stopOnError: z.boolean().default(false),
      keepAlive: z.boolean().default(false),
    })
    .default({
      maxConcurrent: 5,
      timeoutMs: 30000,
      stopOnError: false,
      keepAlive: false,
    }),
})

// -----------------------------
// Connection Manager
// -----------------------------
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
    if (config.command === "node") {
      const serverFile = config.args[0]
      if (!isAbsolute(serverFile)) {
        throw new TransportError(
          TransportErrorType.ConfigurationInvalid,
          "Server file path must be an (Absolute Path) when using node command"
        )
      }
      if (!existsSync(serverFile)) {
        throw new TransportError(
          TransportErrorType.ValidationFailed,
          `Server file not found: ${serverFile}`
        )
      }
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
    const transport = await this.createTransport(identity)
    const client = new Client(
      { name: "mcp-batchit", version: "1.1.1" },
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

  private getTransportConfig(
    identity: ServerIdentity
  ): TransportConfig | undefined {
    if (identity.serverType.type !== "filesystem") {
      return identity.transport
    }

    const { provider } = identity.serverType.config

    if (provider === "external" && !identity.transport) {
      throw new TransportError(
        TransportErrorType.ConfigurationInvalid,
        "Transport configuration is required for external filesystem providers"
      )
    }

    if (provider === "batchit-internal") {
      return {
        type: "stdio",
        command: "node",
        args: [process.argv[1]],
      }
    }

    return identity.transport
  }

  private async createTransport(
    identity: ServerIdentity
  ): Promise<WebSocketClientTransport | StdioClientTransport> {
    const config = this.getTransportConfig(identity)
    if (!config) {
      throw new TransportError(
        TransportErrorType.ConfigurationInvalid,
        "Transport configuration is required but not provided"
      )
    }
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
            return transport
          } catch (error) {
            if (
              error &&
              typeof error === "object" &&
              "code" in error &&
              (error as any).code === "ENOENT"
            ) {
              throw new TransportError(
                TransportErrorType.CommandNotFound,
                `Command '${config.command}' not found in PATH. If using 'npx', ensure it's installed globally.`
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
      const stderr = connection.transport.stderr
      if (stderr) {
        stderr.on("data", (data: Buffer) => {
          console.error(`[${connection.identity.name}] ${data.toString()}`)
        })
      }
    }
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
        this.closeConnection(serverKey)
      }
    }, 60000)
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

// -----------------------------
// Batch Executor
// -----------------------------
class BatchExecutor {
  /**
   * The aggregator's local excluded directories.
   * If you want the user to read/write anywhere, keep it empty or minimal.
   */
  private localExcludedDirs: string[] = ["/private/data", "/secret/hidden"]
  private currentServerIdentity?: ServerIdentity

  constructor(private connectionManager: ConnectionManager) {}

  private setCurrentServerIdentity(identity: ServerIdentity) {
    this.currentServerIdentity = identity
  }

  private getPathValidationConfig(): PathValidationConfig {
    if (!this.currentServerIdentity) {
      throw new Error("Server identity not set")
    }

    if (this.currentServerIdentity.serverType.type !== "filesystem") {
      throw new Error("Server must be of type 'filesystem'")
    }

    const { rootDirectory } = this.currentServerIdentity.serverType.config
    if (!rootDirectory) {
      throw new Error(
        "rootDirectory is required in filesystem server configuration"
      )
    }

    return {
      rootDirectory,
      excludedDirs: this.localExcludedDirs,
    }
  }

  private async executeOperation(
    connection: ServerConnection,
    operation: { tool: string; arguments: Record<string, unknown> },
    timeoutMs: number,
    operationId?: string
  ): Promise<OperationResult> {
    // If target is filesystem, do local calls:
    if (connection.identity.serverType.type === "filesystem") {
      return this.localFilesystemCall(
        operation.tool,
        operation.arguments,
        operationId
      )
    }

    // Otherwise, do HPC calls:
    const maxRetries = 1
    let attempt = 0
    const overallStart = Date.now()

    while (attempt <= maxRetries) {
      try {
        await this.waitForServerReady(connection, timeoutMs)
        const result = await Promise.race([
          connection.client.callTool(
            { name: operation.tool, arguments: operation.arguments },
            CallToolResultSchema,
            {}
          ),
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
            durationMs: Date.now() - overallStart,
            operationId,
          }
        }
        return {
          tool: operation.tool,
          success: true,
          result,
          durationMs: Date.now() - overallStart,
          operationId,
        }
      } catch (error) {
        attempt++
        if (attempt > maxRetries) {
          return {
            tool: operation.tool,
            success: false,
            error:
              error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error),
            durationMs: Date.now() - overallStart,
            operationId,
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
    return {
      tool: operation.tool,
      success: false,
      error: "Unknown error",
      durationMs: Date.now() - overallStart,
      operationId,
    }
  }

  /**
   * localFilesystemCall: The main local logic for all filesystem-based tools,
   * including memory_bank.
   */
  private async localFilesystemCall(
    tool: string,
    rawArgs: Record<string, unknown>,
    operationId?: string
  ): Promise<OperationResult> {
    const overallStart = Date.now()
    let result: unknown

    // Get validation config based on current server identity
    const validationConfig = this.getPathValidationConfig()

    try {
      switch (tool) {
        // Basic filesystem calls:
        case "read_file": {
          const parsed = ReadFileArgsSchema.safeParse(rawArgs)
          if (!parsed.success) {
            throw new Error(`Invalid arguments for read_file: ${parsed.error}`)
          }
          result = await readFileOp(
            parsed.data.path,
            validationConfig,
            parsed.data.options || undefined
          )
          break
        }
        case "read_multiple_files": {
          const parsed = ReadMultipleFilesArgsSchema.safeParse(rawArgs)
          if (!parsed.success) {
            throw new Error(`Invalid arguments: ${parsed.error}`)
          }
          result = await readMultipleFilesOp(
            parsed.data.paths,
            validationConfig,
            parsed.data.options || undefined
          )
          break
        }
        case "write_file": {
          const parsed = WriteFileArgsSchema.safeParse(rawArgs)
          if (!parsed.success) {
            throw new Error(`Invalid arguments for write_file: ${parsed.error}`)
          }
          await writeFileOp(
            parsed.data.path,
            parsed.data.content,
            validationConfig
          )
          result = `Successfully wrote to ${parsed.data.path}`
          break
        }
        case "edit_file": {
          const parsed = EditFileArgsSchema.safeParse(rawArgs)
          if (!parsed.success) {
            throw new Error(`Invalid arguments for edit_file: ${parsed.error}`)
          }
          result = await editFileOp(
            parsed.data.path,
            parsed.data.edits,
            parsed.data.dryRun,
            validationConfig
          )
          break
        }
        case "create_directory": {
          const parsed = CreateDirectoryArgsSchema.safeParse(rawArgs)
          if (!parsed.success) {
            throw new Error(`Invalid arguments: ${parsed.error}`)
          }
          await createDirectoryOp(parsed.data.paths, validationConfig)
          result = `Successfully created directory ${parsed.data.paths}`
          break
        }
        case "list_directory": {
          const parsed = ListDirectoryArgsSchema.safeParse(rawArgs)
          if (!parsed.success) {
            throw new Error(`Invalid arguments: ${parsed.error}`)
          }
          result = await listDirectoryOp(parsed.data.path, validationConfig)
          break
        }
        case "directory_tree": {
          const parsed = DirectoryTreeArgsSchema.safeParse(rawArgs)
          if (!parsed.success) {
            throw new Error(`Invalid arguments: ${parsed.error}`)
          }
          result = await directoryTreeOp(parsed.data.path, validationConfig)
          break
        }
        case "move_file": {
          const parsed = MoveFileArgsSchema.safeParse(rawArgs)
          if (!parsed.success) {
            throw new Error(`Invalid arguments: ${parsed.error}`)
          }
          await moveFileOp(
            parsed.data.source,
            parsed.data.destination,
            validationConfig
          )
          result = `Successfully moved ${parsed.data.source} to ${parsed.data.destination}`
          break
        }
        case "search_files": {
          const parsed = SearchFilesArgsSchema.safeParse(rawArgs)
          if (!parsed.success) {
            throw new Error(`Invalid arguments: ${parsed.error}`)
          }
          const found = await searchFilesOp(
            parsed.data.path,
            {
              pattern: parsed.data.pattern,
              excludePatterns: parsed.data.excludePatterns,
              useGlob: parsed.data.useGlob,
              useRegex: parsed.data.useRegex,
              caseSensitive: parsed.data.caseSensitive,
              wholeWord: parsed.data.wholeWord,
              maxConcurrent: parsed.data.maxConcurrent,
            },
            validationConfig
          )
          result = found.length ? found : "No matches found"
          break
        }
        case "get_file_info": {
          const parsed = GetFileInfoArgsSchema.safeParse(rawArgs)
          if (!parsed.success) {
            throw new Error(
              `Invalid arguments for get_file_info: ${parsed.error}`
            )
          }
          result = await getFileInfoOp(parsed.data.path, validationConfig)
          break
        }

        // ------------------------------------------
        // The user-facing memory_bank tool definition
        // ------------------------------------------
        case "memory_bank": {
          // parse arguments via MemoryBankToolSchema
          const parsed = MemoryBankToolSchema.safeParse(rawArgs)
          if (!parsed.success) {
            throw new Error(parsed.error.message)
          }
          // Use the new MemoryBank implementation
          const bank = new MemoryBank()
          result = await bank.execute(parsed.data, validationConfig)
          break
        }

        default:
          throw new Error(`Unknown local filesystem tool: ${tool}`)
      }

      return {
        tool,
        success: true,
        result,
        durationMs: Date.now() - overallStart,
        operationId,
      }
    } catch (err) {
      return {
        tool,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - overallStart,
        operationId,
      }
    }
  }

  private calculateTimeout(
    baseTimeout: number,
    transport: TransportConfig | undefined
  ): number {
    if (!transport) {
      return baseTimeout
    }

    if (
      transport.type === "stdio" &&
      ((transport.command === "cmd.exe" &&
        transport.args?.some((arg) => arg.includes("npx"))) ||
        transport.npxDownload)
    ) {
      return baseTimeout + 90000
    }
    if (transport.type === "stdio") {
      return baseTimeout + 30000
    }
    return baseTimeout
  }

  private async waitForServerReady(
    connection: ServerConnection,
    totalTimeout: number
  ) {
    const startTime = Date.now()
    const maxAttempts = 100
    let attempts = 0
    while (attempts < maxAttempts) {
      try {
        await connection.client.request(
          {
            method: "health",
            params: { _meta: { progressToken: `ready-${Date.now()}` } },
          },
          EmptyResultSchema,
          {}
        )
        return
      } catch (error) {
        if (Date.now() - startTime > totalTimeout) {
          throw new McpError(
            ErrorCode.RequestTimeout,
            "Server not ready in time"
          )
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
        attempts++
      }
    }
    throw new McpError(
      ErrorCode.RequestTimeout,
      "Max attempts reached for readiness check"
    )
  }

  private getErrorMessage(result: HPCErrorResponse): string {
    const directError = result.error || result.message
    if (directError) return directError
    if (result.content?.length) {
      const textContent = result.content
        .filter((item) => item.type === "text" && typeof item.text === "string")
        .map((item) => item.text)
        .join(" ")
      if (textContent) return textContent
    }
    return "Unknown HPC error"
  }

  private areAllLocalOperations(operations: Operation[]): boolean {
    const localTools = [
      "read_file",
      "read_multiple_files",
      "write_file",
      "edit_file",
      "create_directory",
      "list_directory",
      "directory_tree",
      "move_file",
      "search_files",
      "get_file_info",
      "memory_bank",
    ]
    return operations.every((op) => localTools.includes(op.tool))
  }

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
    // If this is a filesystem server and all operations are local, handle directly
    if (
      identity.serverType.type === "filesystem" &&
      this.areAllLocalOperations(operations)
    ) {
      // Set current server identity for path validation
      this.setCurrentServerIdentity(identity)
      const results: OperationResult[] = []
      const resultMap = new Map<string, OperationResult>()

      for (const op of operations) {
        try {
          if (op.dependsOn) {
            const deps = Array.isArray(op.dependsOn)
              ? op.dependsOn
              : [op.dependsOn]
            const depResults = deps.map((d) => resultMap.get(d)?.result)

            if (op.transform) {
              if (typeof op.transform === "string") {
                try {
                  const transformFn = eval("(" + op.transform + ")")
                  if (typeof transformFn === "function") {
                    op.arguments = transformFn(depResults, op.arguments)
                  }
                } catch (ex) {
                  console.error(`Transform function failed for ${op.id}`, ex)
                }
              } else if (typeof op.transform === "object") {
                op.arguments = { ...op.arguments, ...op.transform }
              }
            }
          }

          const result = await this.localFilesystemCall(
            op.tool,
            op.arguments,
            op.id
          )

          if (op.id) {
            resultMap.set(op.id, result)
          }

          results.push(result)

          if (!result.success && options.stopOnError) {
            break
          }
        } catch (error) {
          const errorResult: OperationResult = {
            tool: op.tool,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: 0,
            operationId: op.id,
          }
          results.push(errorResult)

          if (options.stopOnError) {
            break
          }
        }
      }

      return results
    }

    // Otherwise, proceed with remote execution:
    const connection =
      await this.connectionManager.getOrCreateConnection(identity)
    const adjustedTimeout = this.calculateTimeout(
      options.timeoutMs,
      identity.transport
    )

    let pendingOps = operations.slice()
    const resultMap = new Map<string, OperationResult>()
    const results: OperationResult[] = []
    const running = new Set<Promise<void>>()

    while (pendingOps.length > 0 || running.size > 0) {
      const readyOps = pendingOps.filter((op) => {
        if (!op.dependsOn) return true
        const deps = Array.isArray(op.dependsOn) ? op.dependsOn : [op.dependsOn]
        return deps.every((dep) => resultMap.has(dep))
      })

      if (readyOps.length === 0 && running.size === 0) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Unresolved or cyclic dependencies in operations"
        )
      }

      for (
        let i = 0;
        i < readyOps.length && running.size < options.maxConcurrent;
        i++
      ) {
        const op = readyOps[i]
        pendingOps.splice(pendingOps.indexOf(op), 1)

        let finalArguments = op.arguments
        if (op.dependsOn) {
          const deps = Array.isArray(op.dependsOn)
            ? op.dependsOn
            : [op.dependsOn]
          const depResults = deps.map((d) => resultMap.get(d)?.result)
          if (op.transform) {
            if (typeof op.transform === "string") {
              try {
                const transformFn = eval("(" + op.transform + ")")
                if (typeof transformFn === "function") {
                  finalArguments = transformFn(depResults, op.arguments)
                }
              } catch (ex) {
                console.error(`Transform function failed for ${op.id}`, ex)
              }
            } else if (typeof op.transform === "object") {
              finalArguments = { ...op.arguments, ...op.transform }
            }
          }
        }

        const opPromise = (async () => {
          const res = await this.executeOperation(
            connection,
            { tool: op.tool, arguments: finalArguments },
            adjustedTimeout,
            op.id
          )
          if (op.id) resultMap.set(op.id, res)
          results.push(res)
          if (!res.success && options.stopOnError) {
            pendingOps = []
          }
        })()

        running.add(opPromise)
        opPromise.then(() => running.delete(opPromise))
      }

      if (running.size > 0) {
        await Promise.race(running)
      }
    }

    if (!options.keepAlive) {
      await this.connectionManager.closeConnection(
        this.connectionManager.createKeyForIdentity(identity)
      )
    }
    return results
  }
}

export const connectionManager = new ConnectionManager()
export const batchExecutor = new BatchExecutor(connectionManager)

export const server = new McpServer({
  name: "mcp-batchit",
  version: "1.1.1",
})

// Add the "batch_execute" tool
const batchToolSchema = {
  targetServer: BatchArgsSchema.shape.targetServer,
  operations: BatchArgsSchema.shape.operations,
  options: BatchArgsSchema.shape.options,
}

server.tool(
  "batch_execute",
  `# BatchIt Batch Execute Tool

## Core Purpose
Orchestrates complex file system operations with dependency management, parallel execution, and standardized error handling. This tool serves as the primary interface for executing batched operations across local and remote file systems.

## When to Use
- Processing multiple file operations in a single batch
- Managing complex operation dependencies
- Coordinating parallel file system tasks
- Interfacing with remote file systems
- Handling PDF/DOCX content extraction
- Managing file operation timeouts

## Requirements
- All file paths must be absolute paths
- Valid target server configuration required with specified provider type
- Transport configuration required only for external providers
- Internal BatchIt providers don't need transport configuration

## Configuration Guide

### Target Server (Required)
- name: Server identifier
- serverType: Must specify type, configuration, and provider
  * filesystem:
    - Requires absolute rootDirectory path
    - Must specify provider: "batchit-internal" or "external"
    - For "batchit-internal": No transport needed (handled automatically)
    - For "external": Must provide transport configuration
  * database: Requires database configuration
  * generic: Requires valid config object
- transport: (Required only for external providers)
  * stdio:
    - Requires command and args
    - Optional "npxDownload" flag for NPM package installation (+90s timeout)
    - Environment variables via env object
    - Automatic +30s timeout for process startup
  * websocket:
    - Requires valid ws:// or wss:// URL
    - Configurable options object for connection parameters

### Connection Management
- keepAlive: true maintains connection between operations
- Automatic cleanup after maxIdleTimeMs (default: 300000ms)
- Error handling with automatic reconnection attempts
- Connection pooling for improved performance

### Operations (Required)
Array of operations to execute:
- tool: Tool name to execute
- arguments: Tool-specific parameters
- id: Required for dependency references
- dependsOn: Reference other operations by their id
- transform: Transform operation arguments using:
  * Function: "(results, args) => newArgs"
  * Object: Merged with existing arguments

### Dependencies and Transforms
- Operations execute in dependency order
- Results from dependent operations available in transforms
- Circular dependencies are detected and prevented
- Failed dependencies stop dependent operations
- Transform functions receive array of dependency results

### Options
- maxConcurrent: Max parallel operations (default: 5)
- timeoutMs: Base operation timeout (default: 30000)
  * +90s for NPX downloads
  * +30s for stdio transport startup
- stopOnError: Stop on first error (default: false)
- keepAlive: Maintain connection (default: false)

## Key Features
1. **Operation Orchestration**
   - Concurrent execution with configurable limits
   - Dependency resolution between operations
   - Transaction-like behavior with stopOnError
   - Progress tracking and summary reporting

2. **Server Management**
   - Local and remote server support
   - Connection pooling and cleanup
   - Automatic timeout handling
   - Error recovery and reconnection

3. **File Handling**
   - PDF text extraction with page separation
   - DOCX content extraction
   - Binary file detection
   - Line number formatting
   - UTF-8 and other encodings
   - Concurrent operations

## Examples

### Basic File Operations
\`\`\`json
{
  "targetServer": {
    "name": "batchit-internal-fs",
    "serverType": {
      "type": "filesystem",
      "config": {
        "rootDirectory": "[absolutePath/to/rootDirectory]",
        "provider": "batchit-internal"
      }
    }
  },
  "operations": [
  {
      "tool": "create_directory",
      "arguments": {
        "paths": [
          "/absolute/path/to/project/docs",
          "/absolute/path/to/project/src",
          "/absolute/path/to/project/tests"
        ]
      }
    },
    {
      "tool": "read_file",
      "arguments": {
        "path": "[absolutePath/to/project/src/file.txt]",
        "options": {
          "encoding": "utf-8",
          "addLineNumbers": true,
          "fileTypeHandling": true,
          "checkBinary": true,
          "startLineNumber": 1
        }
      }
    }
  ]
}
\`\`\`

### External Provider Example (With Transport)
\`\`\`json
{
  "targetServer": {
    "name": "local-fs",
    "serverType": {
      "type": "filesystem",
      "config": {
        "rootDirectory": "/absolute/path/to/root",
        "provider": "external"
      }
    },
    "transport": { // Required for external providers
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/server.js"]
    }
  },
  "operations": [
    {
      "tool": "read_file",
      "arguments": {
        "path": "/absolute/path/to/file.txt"
      }
    }
  ],
  "options": {
      "maxConcurrent": 3,
      "timeoutMs": 30000,
      "operations": [
        {
          "tool": "read_multiple_files",
          "arguments": {
            "paths": [
              "/absolute/path/to/document.pdf",
              "/absolute/path/to/document.docx",
              "/absolute/path/to/code.ts"
            ],
            "options": {
              "fileTypeHandling": true,
              "addLineNumbers": true,
              "maxConcurrent": 2
            }
          }
        }
      ]
  }
}
\`\`\`

## Error Prevention
1. Path Validation
   - All paths must be absolute
   - Paths must be within rootDirectory
   - No parent directory (..) references
   - Binary file safety checks

2. Server Configuration
   - Provider validation
   - Transport requirements check
   - Connection verification
   - Timeout handling

3. Operation Safety
   - Schema validation
   - Dependency cycle detection
   - Transform error handling
   - Concurrent operation limits

## Best Practices
1. Server Configuration
   - Use "batchit-internal" for local operations
   - Configure proper timeouts for remote servers
   - Set appropriate concurrent operation limits
   - Implement proper error handling

2. Operation Management
   - Group related operations with dependencies
   - Use meaningful operation IDs
   - Implement proper transform error handling
   - Monitor operation results

3. Resource Management
   - Close connections when done (keepAlive: false)
   - Clean up resources in transforms
   - Handle timeouts appropriately
   - Manage concurrent operations`,
  batchToolSchema,
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
                  (acc, r) => acc + r.durationMs,
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

// --------------
// Memory Bank Integration
// --------------
import { MemoryBankController } from "./mem-bank/controllers/memory-bank.controller.js"
server.tool(
  "memory_bank",
  `# Memory Bank Tool

## Core Purpose
Provides structured documentation and context management for projects, ensuring consistency and knowledge preservation. It facilitates easy access to project goals, current development focus, system architecture, technical environment, and progress tracking.

## When to Use
- To initialize a new project documentation structure.
- To verify and read existing documentation files.
- To update documentation content with various modes (overwrite, append, diff, edit).
- To list the memory bank structure and metadata.

## Requirements
- All paths MUST be absolute
- Valid target server configuration required with provider type
- If using external provider, transport configuration is required
- Files must follow markdown structure:
  * Must start with a heading (#)
  * Must contain at least one content section
  * Content sections separated by blank lines
  * Valid markdown formatting required
  * Template variables supported

## Configuration Guide

### Target Server (Required)
- name: Server identifier
- serverType: Must specify type, configuration, and provider
  * filesystem:
    - Requires absolute rootDirectory path
    - Must specify provider: "batchit-internal" or "external"
    - For "batchit-internal": No transport needed (handled automatically)
    - For "external": Must provide transport configuration
- transport: (Required only for external providers)
  * stdio:
    - Requires command and args
    - Optional "npxDownload" flag for NPM package installation (+90s timeout)
    - Environment variables via env object
    - Automatic +30s timeout for process startup
  * websocket:
    - Requires valid ws:// or wss:// URL
    - Configurable options object for connection parameters

## Key Features

1.  **Initialization**
    -   Creates required memory bank structure.
    -   Sets up required markdown files with templates.
    -   Initializes with current timestamp.
    -   Includes required files with purposes:
        *   productContext.md: Project purpose and goals
        *   activeContext.md: Current development focus
        *   systemPatterns.md: Architecture patterns
        *   techContext.md: Technical environment
        *   progress.md: Project status tracking

2.  **Verification and Reading**
    -   Verifies files exist and structure is valid.
    -   Creates missing files from templates.
    -   Processes template variables.
    -   Validates markdown structure.
    -   Returns content of specified files.
    -   Defaults to all required files.
    -   Reports validation results.

3.  **Updating**
    -   Update modes with validation:
        *   overwrite: Replace entire file content
            *   Validates new content structure
            *   Processes template variables
            *   Updates timestamps
            *   Preserves file metadata
        *   append: Add content to end of file
            *   Maintains document structure
            *   Validates combined content
            *   Updates timestamps
        *   diff: Apply line-based changes
            *   Line-level granularity
            *   Preserves indentation
            *   Validates resulting content
        *   edit: Partial search/replace
            *   Pattern-based replacement
            *   Maintains document integrity
            *   Reports changes via diff output

4. **Listing**
    - Shows memory bank structure
    - Returns directory tree with metadata
    - Includes file validation status
    - Fails if directory doesn't exist

## Examples

### Initialize Operation
\`\`\`json
{
 "targetServer": {
   "name": "memory-bank",
   "serverType": {
     "type": "filesystem",
     "config": {
       "rootDirectory": "/absolute/path/to/memory/bank",
       "provider": "batchit-internal" // Internal provider doesn't require transport
     }
   }
 },
 "operations": [{
   "tool": "memory_bank",
   "arguments": {
     "operation": "initialize",
     "directory": "/absolute/path/to/project-docs"
   }
 }]
}
\`\`\`

### Verify and Read Operation
\`\`\`json
{
 "targetServer": {
   "name": "memory-bank",
   "serverType": {
     "type": "filesystem",
     "config": {
       "rootDirectory": "/absolute/path/to/memory/bank",
       "provider": "batchit-internal"
     }
   }
 },
 "operations": [{
   "tool": "memory_bank",
   "arguments": {
     "operation": "verify_and_read",
     "directory": "/absolute/path/to/project-docs"
   }
 }]
}
\`\`\`

## Error Prevention and Validation
1.  **Path Validation**
    -   All paths must be absolute.
    -   Directory must be within rootDirectory.
    -   Files must follow markdown structure.
    -   Parent directory references (..) not allowed.
    -   File names must be valid markdown files.

2.  **Template and Content Validation**
    -   Template substitution validation.
    -   Content structure preservation.
    -   Automatic error recovery with fallbacks.

## Best Practices
1.  **Directory Structure**
    -   Organize memory bank files in a dedicated directory.
    -   Use meaningful file names.

2.  **Content Management**
    -   Maintain a clear and consistent markdown structure.
    -   Use template variables for dynamic content.
    -   Regularly update documentation to reflect project changes.

3.  **Operation Usage**
    -   Use the "initialize" operation to set up a new memory bank.
    -   Use the "verify_and_read" operation to ensure documentation integrity.
    -   Use the "update" operation to modify documentation content.`,
  MemoryBankToolSchema.shape,
  async (args) => {
    const parsed = MemoryBankToolSchema.safeParse(args)
    if (!parsed.success) {
      throw new McpError(ErrorCode.InvalidParams, parsed.error.message)
    }

    try {
      const controller = new MemoryBankController()
      const validationConfig = {
        rootDirectory: process.cwd(),
        excludedDirs: ["/private/data", "/secret/hidden"],
      }

      const result = await controller.handleRequest(
        parsed.data,
        validationConfig
      )

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      }
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        error instanceof Error ? error.message : String(error)
      )
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
