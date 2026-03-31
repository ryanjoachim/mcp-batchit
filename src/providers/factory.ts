import { ProviderType } from "../types/provider.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import {
  FileSystem,
  WriteOptions,
  ReadOptions,
} from "../filesystem/FileSystem.js"
import { UpdateOperation } from "../types/filesystem/operations.js"

export interface Provider {
  executeTool(name: string, args: unknown): Promise<unknown>
}

export function createProvider(
  type: ProviderType,
  rootDirectory: string
): Provider {
  switch (type) {
    case "batchit-internal":
      return createInternalFilesystemProvider(rootDirectory)

    case "external":
      throw new McpError(
        ErrorCode.InvalidParams,
        "External providers require transport configuration"
      )

    default:
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unsupported provider type: ${type}`
      )
  }
}

function createInternalFilesystemProvider(rootDirectory: string): Provider {
  const fs = new FileSystem({
    rootDirectory,
    maxConcurrent: 10, // Default concurrent operations limit
  })

  return {
    async executeTool(name: string, args: unknown): Promise<unknown> {
      if (!args || typeof args !== "object") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Arguments must be an object"
        )
      }

      switch (name) {
        case "read_file":
          if (!("path" in args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Missing required 'path' parameter"
            )
          }
          return fs.readFile(
            String(args.path),
            "options" in args && typeof args.options === "object"
              ? (args.options as ReadOptions)
              : {}
          )

        case "write_file":
          if (!("path" in args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Missing required 'path' parameter"
            )
          }
          // Allow either content or template
          if (!("content" in args) && !("template" in args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Either 'content' or 'template' parameter is required"
            )
          }
          const { previousResult, ...restArgs } = args as {
            previousResult: unknown
            content?: unknown
            template?: string
            path: string
            options?: WriteOptions
          }

          const result = await fs.writeFile(
            String(restArgs.path),
            restArgs.content !== undefined ? restArgs.content : "",
            restArgs.options,
            previousResult
          )
          return result.content

        case "read_files":
          if (!("paths" in args) || !Array.isArray(args.paths)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Missing or invalid 'paths' parameter"
            )
          }
          return fs.readFiles(
            args.paths as string[],
            "options" in args && typeof args.options === "object"
              ? (args.options as ReadOptions)
              : {}
          )

        case "move_file":
          if (!("sourcePath" in args) || !("destPath" in args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Missing required parameters: sourcePath and/or destPath"
            )
          }
          await fs.moveFile(String(args.sourcePath), String(args.destPath), {
            overwrite: "overwrite" in args ? Boolean(args.overwrite) : false,
          })
          return "File moved successfully"

        case "copy_file":
          if (!("sourcePath" in args) || !("destPath" in args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Missing required parameters: sourcePath and/or destPath"
            )
          }
          await fs.copyFile(String(args.sourcePath), String(args.destPath))
          return "File copied successfully"

        case "delete_file":
          if (!("path" in args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Missing required 'path' parameter"
            )
          }
          await fs.deleteFile(String(args.path))
          return "File deleted successfully"

        case "update_file":
        case "edit_file": // Support legacy name while promoting update_file in docs
          if (!("path" in args) || !("operation" in args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Missing required parameters"
            )
          }
          // Create a proper UpdateOperation object
          const updateOp: UpdateOperation = {
            operation: "update",
            path: String(args.path),
            mode: (args.operation as any).mode,
            content: (args.operation as any).content,
            diff: (args.operation as any).diff,
            tracking: (args.operation as any).tracking,
          }
          return fs.updateFile(updateOp)

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Tool '${name}' not supported by internal provider`
          )
      }
    },
  }
}
