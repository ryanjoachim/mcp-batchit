import { z } from "zod"

// Individual filesystem tool schemas for direct MCP tool registration.
// These are simpler per-tool schemas, unlike the monolithic BatchExecuteToolSchema.

// --- read_file ---

export const ReadFileToolSchema = {
  path: z.string().describe("Absolute path of the file to read"),
  options: z
    .object({
      encoding: z
        .string()
        .optional()
        .describe("Character encoding (default: utf-8)"),
      addLineNumbers: z
        .boolean()
        .optional()
        .describe("Add line numbers to output"),
      checkBinary: z
        .boolean()
        .optional()
        .describe("Check if file is binary (default: true)"),
      fileTypeHandling: z
        .boolean()
        .optional()
        .describe("Handle PDF/DOCX extraction (default: true)"),
    })
    .optional()
    .describe("Read options"),
}

// --- read_files ---

export const ReadFilesToolSchema = {
  paths: z.array(z.string()).describe("Array of absolute file paths to read"),
  options: z
    .object({
      encoding: z
        .string()
        .optional()
        .describe("Character encoding (default: utf-8)"),
      addLineNumbers: z
        .boolean()
        .optional()
        .describe("Add line numbers to output"),
      checkBinary: z
        .boolean()
        .optional()
        .describe("Check if file is binary (default: true)"),
      fileTypeHandling: z
        .boolean()
        .optional()
        .describe("Handle PDF/DOCX extraction (default: true)"),
    })
    .optional()
    .describe("Read options"),
}

// --- write_file ---

export const WriteFileToolSchema = {
  path: z.string().describe("Absolute path of the file to write"),
  content: z.string().optional().describe("Content to write to the file"),
  options: z
    .object({
      tracking: z
        .object({
          enabled: z.boolean().describe("Enable content tracking"),
        })
        .optional()
        .describe("Content tracking options"),
    })
    .optional()
    .describe("Write options"),
}

// --- update_file ---

export const UpdateFileToolSchema = {
  path: z.string().describe("Absolute path of the file to update"),
  operation: z
    .object({
      mode: z.enum(["overwrite", "append", "diff"]).describe("Update mode"),
      content: z
        .string()
        .optional()
        .describe("New content (for overwrite/append modes)"),
      diff: z
        .array(
          z.object({
            line: z.number().describe("Line number (1-based)"),
            operation: z
              .enum(["insert", "replace", "delete"])
              .describe("Diff operation type"),
            text: z.string().describe("Text content for the operation"),
          })
        )
        .optional()
        .describe("Line-based diff operations (for diff mode)"),
      tracking: z
        .object({
          enabled: z.boolean().describe("Enable content tracking"),
        })
        .optional()
        .describe("Content tracking options"),
    })
    .describe("Update operation details"),
}

// --- move_file ---

export const MoveFileToolSchema = {
  sourcePath: z.string().describe("Absolute path of the source file"),
  destPath: z.string().describe("Absolute path of the destination"),
  overwrite: z
    .boolean()
    .optional()
    .describe("Whether to overwrite the destination (default: false)"),
}

// --- copy_file ---

export const CopyFileToolSchema = {
  sourcePath: z.string().describe("Absolute path of the source file"),
  destPath: z.string().describe("Absolute path of the destination"),
}

// --- delete_file ---

export const DeleteFileToolSchema = {
  path: z.string().describe("Absolute path of the file to delete"),
}

// --- list_directory ---

export const ListDirectoryToolSchema = {
  path: z.string().describe("Absolute path of the directory to list"),
}

// --- create_directory ---

export const CreateDirectoryToolSchema = {
  path: z.string().describe("Absolute path of the directory to create"),
}

// --- search_files ---

export const SearchFilesToolSchema = {
  path: z.string().describe("Absolute path of the directory to search"),
  pattern: z.string().describe("Search pattern (glob, regex, or text)"),
  excludePatterns: z
    .array(z.string())
    .optional()
    .describe("Patterns to exclude from search"),
  useGlob: z
    .boolean()
    .optional()
    .describe("Interpret pattern as glob (default: true)"),
  useRegex: z.boolean().optional().describe("Interpret pattern as regex"),
  caseSensitive: z
    .boolean()
    .optional()
    .describe("Case-sensitive search (default: false)"),
  wholeWord: z.boolean().optional().describe("Match whole words only"),
  maxConcurrent: z.number().optional().describe("Max concurrent file reads"),
  includeContent: z
    .boolean()
    .optional()
    .describe("Include file content in results (default: false)"),
  maxContentPreview: z
    .number()
    .optional()
    .describe("Max characters of content preview"),
}

// --- get_file_info ---

export const GetFileInfoToolSchema = {
  path: z.string().describe("Absolute path of the file or directory"),
}

// --- directory_tree ---

export const DirectoryTreeToolSchema = {
  path: z.string().describe("Absolute path of the directory root"),
  format: z
    .enum(["json", "text"])
    .optional()
    .describe("Output format (default: json)"),
}

// --- Tool annotations ---

import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js"

export const FILESYSTEM_TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = {
  read_file: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  read_files: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  write_file: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  update_file: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  move_file: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  copy_file: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  delete_file: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  list_directory: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  create_directory: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  search_files: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  get_file_info: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  directory_tree: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
}
