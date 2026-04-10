/**
 * @fileoverview
 * Registers 12 individual filesystem tools as MCP tools alongside batch_execute.
 *
 * Individual tools provide tool discovery and per-tool annotations.
 * They use a shared FileSystem instance and do NOT support result references
 * or template resolution — those are batch_execute-only features.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import {
  FileSystem,
  ReadOptions,
  WriteOptions,
} from "../filesystem/FileSystem.js"
import { UpdateOperation } from "../types/filesystem/operations.js"
import {
  ReadFileToolSchema,
  ReadFilesToolSchema,
  WriteFileToolSchema,
  UpdateFileToolSchema,
  MoveFileToolSchema,
  CopyFileToolSchema,
  DeleteFileToolSchema,
  ListDirectoryToolSchema,
  CreateDirectoryToolSchema,
  SearchFilesToolSchema,
  GetFileInfoToolSchema,
  DirectoryTreeToolSchema,
  FILESYSTEM_TOOL_ANNOTATIONS,
} from "../types/schemas/filesystemTools.js"

/**
 * Register all 12 filesystem tools as individual MCP tools on the server.
 * Each tool has its own schema, description, and annotations.
 */
export function registerFilesystemTools(
  server: McpServer,
  fs: FileSystem
): void {
  // --- read_file ---
  const readFileTool = server.tool(
    "read_file",
    "Read the content of a file. Supports PDF and DOCX extraction, line numbers, and binary detection.",
    ReadFileToolSchema,
    async (args) => {
      try {
        const options: ReadOptions =
          args.options && typeof args.options === "object"
            ? (args.options as ReadOptions)
            : {}
        const content = await fs.readFile(String(args.path), options)
        return { content: [{ type: "text", text: content }] }
      } catch (error) {
        return formatToolError(error)
      }
    }
  )
  readFileTool.update({ annotations: FILESYSTEM_TOOL_ANNOTATIONS.read_file })

  // --- read_files ---
  const readFilesTool = server.tool(
    "read_files",
    "Read multiple files concurrently. Returns an object mapping paths to file contents.",
    ReadFilesToolSchema,
    async (args) => {
      try {
        const options: ReadOptions =
          args.options && typeof args.options === "object"
            ? (args.options as ReadOptions)
            : {}
        const results = await fs.readFiles(args.paths as string[], options)
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    }
  )
  readFilesTool.update({ annotations: FILESYSTEM_TOOL_ANNOTATIONS.read_files })

  // --- write_file ---
  const writeFileTool = server.tool(
    "write_file",
    "Create or overwrite a file with the given content.",
    WriteFileToolSchema,
    async (args) => {
      try {
        if (!("content" in args)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "Missing required 'content' parameter"
          )
        }
        const options: WriteOptions = {}
        if (args.options?.tracking) {
          options.tracking = args.options.tracking as WriteOptions["tracking"]
        }
        const result = await fs.writeFile(
          String(args.path),
          args.content as string,
          options
        )
        return { content: [{ type: "text", text: result.content }] }
      } catch (error) {
        return formatToolError(error)
      }
    }
  )
  writeFileTool.update({ annotations: FILESYSTEM_TOOL_ANNOTATIONS.write_file })

  // --- update_file ---
  const updateFileTool = server.tool(
    "update_file",
    "Modify an existing file using overwrite, append, or line-based diff mode.",
    UpdateFileToolSchema,
    async (args) => {
      try {
        const op = args.operation as {
          mode: "overwrite" | "append" | "diff"
          content?: string
          diff?: Array<{
            line: number
            operation: "insert" | "replace" | "delete"
            text: string
          }>
          tracking?: { enabled: boolean }
        }
        const updateOp: UpdateOperation = {
          operation: "update",
          path: String(args.path),
          mode: op.mode,
          content: op.content,
          diff: op.diff,
          tracking: op.tracking,
        }
        const result = await fs.updateFile(updateOp)
        return {
          content: [
            {
              type: "text",
              text: result.summary || `File ${result.path} updated`,
            },
          ],
        }
      } catch (error) {
        return formatToolError(error)
      }
    }
  )
  updateFileTool.update({
    annotations: FILESYSTEM_TOOL_ANNOTATIONS.update_file,
  })

  // --- move_file ---
  const moveFileTool = server.tool(
    "move_file",
    "Move or rename a file. Supports cross-device moves with copy+delete fallback.",
    MoveFileToolSchema,
    async (args) => {
      try {
        await fs.moveFile(String(args.sourcePath), String(args.destPath), {
          overwrite: args.overwrite ?? false,
        })
        return { content: [{ type: "text", text: "File moved successfully" }] }
      } catch (error) {
        return formatToolError(error)
      }
    }
  )
  moveFileTool.update({ annotations: FILESYSTEM_TOOL_ANNOTATIONS.move_file })

  // --- copy_file ---
  const copyFileTool = server.tool(
    "copy_file",
    "Copy a file to a new location.",
    CopyFileToolSchema,
    async (args) => {
      try {
        await fs.copyFile(String(args.sourcePath), String(args.destPath))
        return { content: [{ type: "text", text: "File copied successfully" }] }
      } catch (error) {
        return formatToolError(error)
      }
    }
  )
  copyFileTool.update({ annotations: FILESYSTEM_TOOL_ANNOTATIONS.copy_file })

  // --- delete_file ---
  const deleteFileTool = server.tool(
    "delete_file",
    "Delete a file.",
    DeleteFileToolSchema,
    async (args) => {
      try {
        await fs.deleteFile(String(args.path))
        return {
          content: [{ type: "text", text: "File deleted successfully" }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    }
  )
  deleteFileTool.update({
    annotations: FILESYSTEM_TOOL_ANNOTATIONS.delete_file,
  })

  // --- list_directory ---
  const listDirectoryTool = server.tool(
    "list_directory",
    "List the contents of a directory.",
    ListDirectoryToolSchema,
    async (args) => {
      try {
        const entries = await fs.listDirectory(String(args.path))
        return {
          content: [{ type: "text", text: JSON.stringify(entries, null, 2) }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    }
  )
  listDirectoryTool.update({
    annotations: FILESYSTEM_TOOL_ANNOTATIONS.list_directory,
  })

  // --- create_directory ---
  const createDirectoryTool = server.tool(
    "create_directory",
    "Create a directory and any necessary parent directories.",
    CreateDirectoryToolSchema,
    async (args) => {
      try {
        await fs.createDirectory(String(args.path))
        return {
          content: [{ type: "text", text: "Directory created successfully" }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    }
  )
  createDirectoryTool.update({
    annotations: FILESYSTEM_TOOL_ANNOTATIONS.create_directory,
  })

  // --- search_files ---
  const searchFilesTool = server.tool(
    "search_files",
    "Search for files by glob pattern, regex, or content.",
    SearchFilesToolSchema,
    async (args) => {
      try {
        const results = await fs.searchFiles(String(args.path), {
          pattern: String(args.pattern),
          excludePatterns: args.excludePatterns as string[] | undefined,
          useGlob: args.useGlob as boolean | undefined,
          useRegex: args.useRegex as boolean | undefined,
          caseSensitive: args.caseSensitive as boolean | undefined,
          wholeWord: args.wholeWord as boolean | undefined,
          maxConcurrent: args.maxConcurrent as number | undefined,
          includeContent: args.includeContent as boolean | undefined,
          maxContentPreview: args.maxContentPreview as number | undefined,
        })
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    }
  )
  searchFilesTool.update({
    annotations: FILESYSTEM_TOOL_ANNOTATIONS.search_files,
  })

  // --- get_file_info ---
  const getFileInfoTool = server.tool(
    "get_file_info",
    "Get detailed metadata for a file or directory (size, dates, permissions, MIME type).",
    GetFileInfoToolSchema,
    async (args) => {
      try {
        const info = await fs.getFileInfo(String(args.path))
        return {
          content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    }
  )
  getFileInfoTool.update({
    annotations: FILESYSTEM_TOOL_ANNOTATIONS.get_file_info,
  })

  // --- directory_tree ---
  const directoryTreeTool = server.tool(
    "directory_tree",
    "Get a recursive directory tree structure in JSON or text format.",
    DirectoryTreeToolSchema,
    async (args) => {
      try {
        const tree = await fs.directoryTree(
          String(args.path),
          (args.format as "json" | "text") || "json"
        )
        return {
          content: [
            {
              type: "text",
              text:
                typeof tree === "string" ? tree : JSON.stringify(tree, null, 2),
            },
          ],
        }
      } catch (error) {
        return formatToolError(error)
      }
    }
  )
  directoryTreeTool.update({
    annotations: FILESYSTEM_TOOL_ANNOTATIONS.directory_tree,
  })
}

/**
 * Format an error as an MCP tool error response.
 */
function formatToolError(error: unknown): {
  content: Array<{ type: "text"; text: string }>
  isError: boolean
} {
  const message =
    error instanceof McpError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error)
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  }
}
