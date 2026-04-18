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
  rootDirectory: string,
  existingFs?: FileSystem
): Provider {
  switch (type) {
    case "batchit-internal":
      return createInternalFilesystemProvider(rootDirectory, existingFs)

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

function createInternalFilesystemProvider(
  rootDirectory: string,
  existingFs?: FileSystem
): Provider {
  const fs =
    existingFs ??
    new FileSystem({
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
          await fs.copyFile(String(args.sourcePath), String(args.destPath), {
            overwrite: "overwrite" in args ? Boolean(args.overwrite) : false,
          })
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

        case "list_directory":
          if (!("path" in args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Missing required 'path' parameter"
            )
          }
          return fs.listDirectory(String(args.path))

        case "create_directory":
          if (!("path" in args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Missing required 'path' parameter"
            )
          }
          return fs.createDirectory(
            "paths" in args && Array.isArray(args.paths)
              ? args.paths
              : String(args.path)
          )

        case "search_files": {
          if (!("path" in args) || !("pattern" in args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Missing required parameters: path and pattern"
            )
          }
          const searchArgs = args as {
            path: string
            pattern: string
            excludePatterns?: string[]
            useGlob?: boolean
            useRegex?: boolean
            caseSensitive?: boolean
            wholeWord?: boolean
            maxConcurrent?: number
            includeContent?: boolean
            maxContentPreview?: number
          }
          return fs.searchFiles(String(searchArgs.path), {
            pattern: String(searchArgs.pattern),
            excludePatterns: searchArgs.excludePatterns,
            useGlob: searchArgs.useGlob,
            useRegex: searchArgs.useRegex,
            caseSensitive: searchArgs.caseSensitive,
            wholeWord: searchArgs.wholeWord,
            maxConcurrent: searchArgs.maxConcurrent,
            includeContent: searchArgs.includeContent,
            maxContentPreview: searchArgs.maxContentPreview,
          })
        }

        case "get_file_info":
          if (!("path" in args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Missing required 'path' parameter"
            )
          }
          return fs.getFileInfo(String(args.path))

        case "directory_tree": {
          if (!("path" in args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Missing required 'path' parameter"
            )
          }
          const treeArgs = args as { path: string; format?: "json" | "text" }
          return fs.directoryTree(
            String(treeArgs.path),
            treeArgs.format || "json"
          )
        }

        case "update_file":
        case "edit_file": {
          // Support legacy name while promoting update_file in docs
          if (!("path" in args) || !("operation" in args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Missing required parameters: path and operation"
            )
          }
          const opArgs = args as {
            path: string
            operation: {
              mode: "overwrite" | "append" | "diff"
              content?: string
              diff?: Array<{
                line: number
                operation: "insert" | "replace" | "delete"
                text: string
              }>
              tracking?: { enabled: boolean; diffFormat?: string }
            }
          }
          const updateOp: UpdateOperation = {
            operation: "update",
            path: String(opArgs.path),
            mode: opArgs.operation.mode,
            content: opArgs.operation.content,
            diff: opArgs.operation.diff,
            tracking: opArgs.operation.tracking,
          }
          return fs.updateFile(updateOp)
        }

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Tool '${name}' not supported by internal provider`
          )
      }
    },
  }
}
