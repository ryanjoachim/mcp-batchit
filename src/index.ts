#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js"
import { z } from "zod"
import { batchExecutor } from "./executor/index.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { ChildProcess } from "child_process"
import { existsSync } from "fs"
import { isAbsolute } from "path"
import { MemoryBankToolSchema } from "./schemas/memory-bank.js"
import { MemoryBankController } from "./mem-bank/controllers/memory-bank.controller.js"
import type { BatchResult } from "./types/config.js"

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

// Create the connection manager singleton
export const connectionManager = new ConnectionManager()

// Create and configure the MCP server
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
    const result: BatchResult = await batchExecutor.executeBatch(
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
                successCount: result.operations.filter((r) => r.success).length,
                failCount: result.operations.filter((r) => !r.success).length,
                totalDurationMs: result.operations.reduce((acc, r) => {
                  const duration =
                    typeof r.result === "object" &&
                    r.result &&
                    "durationMs" in r.result
                      ? (r.result as { durationMs: number }).durationMs
                      : 0
                  return acc + duration
                }, 0),
              },
              operations: result.operations,
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
