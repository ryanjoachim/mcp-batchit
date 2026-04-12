#!/usr/bin/env node

// MCP SDK imports
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"

// Internal imports - extracted modules
import { ConnectionManager, VERSION } from "./connections/index.js"
import { BatchExecutor } from "./execution/index.js"

// Internal imports - utils
import {
  formatBatchResults,
  formatErrorResponse,
} from "./utils/responseFormat.js"

// Internal imports - filesystem tools
import { registerFilesystemTools } from "./tools/filesystemTools.js"
import { FileSystem } from "./filesystem/FileSystem.js"

// Internal imports - types
import {
  BatchArgsSchema,
  BatchExecuteToolSchema,
} from "./types/schemas/index.js"

// Server Setup
const defaultFileSystem = new FileSystem({ rootDirectory: process.cwd() })
const connectionManager = new ConnectionManager(defaultFileSystem)
const batchExecutor = new BatchExecutor(connectionManager)
const server = new McpServer(
  {
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
- maxConcurrent (default 10): max parallel operations per dependency layer
- timeoutMs (default 30000): per-operation timeout in milliseconds
- stopOnError (default false): halt the batch on the first failure
- keepAlive (default false): keep the target server connection open after the batch

All file paths must be absolute.`,
  },
  {
    capabilities: {
      // tools.listChanged: false — this server exposes a fixed tool set
      tools: { listChanged: false },
      resources: {},
    },
  }
)
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
        results: results.map(
          ({ tool, success, result, error, durationMs }) => ({
            tool,
            success,
            ...(result !== undefined && { result }),
            ...(error !== undefined && { error }),
            durationMs,
          })
        ),
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
    destructiveHint: true, // batch can write, overwrite, or delete files
    openWorldHint: true, // connects to arbitrary external MCP servers
    idempotentHint: false, // repeated calls produce different side-effects
  },
})

// Register 12 individual filesystem tools for direct access.
// These provide tool discovery and per-tool annotations.
// For multi-step workflows with dependency ordering and result chaining, use batch_execute.
registerFilesystemTools(server, defaultFileSystem)

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
            required: [
              "serverName",
              "totalOperations",
              "succeeded",
              "failed",
              "results",
            ],
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
                    tool: {
                      type: "string",
                      description: "Tool name that was invoked",
                    },
                    success: { type: "boolean" },
                    result: {
                      description:
                        "Tool output — present on success, shape depends on the target tool",
                    },
                    error: {
                      type: "string",
                      description: "Error message — present on failure",
                    },
                    durationMs: {
                      type: "number",
                      description: "Wall-clock time for this operation",
                    },
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
