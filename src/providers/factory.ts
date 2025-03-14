import { ProviderType } from "../types/provider.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import * as fileOps from "../filesystem/fileOperations.js"
import * as dirOps from "../filesystem/directoryOperations.js"
import { updateFileContent } from "../filesystem/contentEditor.js"
import { WriteFileOptions } from "../filesystem/fileOperations.js"

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
  const config = { rootDirectory }

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
          return fileOps.readFile(
            String(args.path),
            config,
            "options" in args && typeof args.options === "object"
              ? (args.options as any)
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
            options?: WriteFileOptions
          }

          const result = await fileOps.writeFile(
            String(restArgs.path),
            restArgs.content !== undefined ? restArgs.content : "",
            config,
            restArgs.options
          )
          return result.content

        case "create_directory":
          if (!("paths" in args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Missing required 'paths' parameter"
            )
          }
          await dirOps.createDirectory(args.paths as string | string[], config)
          return "Directory created successfully"

        case "list_directory":
          if (!("path" in args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Missing required 'path' parameter"
            )
          }
          return dirOps.listDirectory(String(args.path), config)

        case "update_file":
          if (!("path" in args) || !("operation" in args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Missing required parameters"
            )
          }
          return updateFileContent(
            String(args.path),
            args.operation as any,
            config
          )

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Tool '${name}' not supported by internal provider`
          )
      }
    },
  }
}
