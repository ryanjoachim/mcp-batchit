import { z } from "zod"
import { AbsolutePathSchema } from "./paths.js"
import type { ReadOptions } from "../batchit-filesystem/readFile.js"

export interface FileInfo extends Record<string, unknown> {
  size: number
  created: Date
  modified: Date
  accessed: Date
  isDirectory: boolean
  isFile: boolean
  permissions: string
}

/**
 * Valid encodings for file operations
 */
const encodings = [
  "ascii",
  "utf8",
  "utf-8",
  "utf16le",
  "ucs2",
  "ucs-2",
  "base64",
  "base64url",
  "latin1",
  "binary",
  "hex",
] as const

const ReadOptionsSchema: z.ZodType<ReadOptions> = z.object({
  encoding: z.enum(encodings).optional()
    .describe("Character encoding for reading the file"),
  maxConcurrent: z.number().optional()
    .describe("Maximum number of concurrent file operations"),
  checkBinary: z.boolean().optional()
    .describe("Whether to check if file is binary before reading"),
  addLineNumbers: z.boolean().optional()
    .describe("Add line numbers to the output"),
  fileTypeHandling: z.boolean().optional()
    .describe("Enable special handling for PDF/DOCX files"),
  startLineNumber: z.number().optional()
    .describe("Starting line number when addLineNumbers is true"),
})

export const ReadFileArgsSchema = z.object({
  path: AbsolutePathSchema.describe("Absolute path to the file to read"),
  options: ReadOptionsSchema.optional()
    .describe("Optional configuration for reading operations"),
})

export const ReadMultipleFilesArgsSchema = z.object({
  paths: z.array(AbsolutePathSchema).min(1)
    .describe("Array of absolute paths to files to read"),
  options: ReadOptionsSchema.optional()
    .describe("Optional configuration for reading operations"),
})

export const WriteFileArgsSchema = z.object({
  path: AbsolutePathSchema.describe("Absolute path to write the file to"),
  content: z.string().describe("Content to write to the file"),
})

export const EditOperation = z.object({
  oldText: z.string().min(1, "Search text cannot be empty")
    .describe("Text to search for in the file"),
  newText: z.string().optional().default("")
    .describe("Text to replace the found text with"),
})

export const EditFileArgsSchema = z.object({
  path: AbsolutePathSchema.describe("Absolute path to the file to edit"),
  edits: z.array(EditOperation)
    .min(1, "At least one edit operation must be provided")
    .describe("Array of edit operations to perform"),
  dryRun: z.boolean().default(false)
    .describe("If true, return expected changes without modifying the file"),
})

export const CreateDirectoryArgsSchema = z.object({
  paths: z.union([AbsolutePathSchema, z.array(AbsolutePathSchema)])
    .describe("Single path or array of paths to create"),
})

export const ListDirectoryArgsSchema = z.object({
  path: AbsolutePathSchema.describe("Absolute path to the directory to list"),
})

export const DirectoryTreeArgsSchema = z.object({
  path: AbsolutePathSchema.describe("Absolute path to get directory tree for"),
})

export const MoveFileArgsSchema = z.object({
  source: AbsolutePathSchema.describe("Absolute path of file to move"),
  destination: AbsolutePathSchema.describe("Absolute path to move file to"),
})

export const SearchFilesArgsSchema = z.object({
  path: AbsolutePathSchema.describe("Absolute path of directory to search in"),
  pattern: z.string().min(1, "Search pattern cannot be empty")
    .describe("Pattern to search for in files"),
  excludePatterns: z.array(z.string()).optional().default([])
    .describe("Patterns to exclude from search"),
  useGlob: z.boolean().optional().default(false)
    .describe("Use glob pattern matching"),
  useRegex: z.boolean().optional().default(false)
    .describe("Use regex pattern matching"),
  caseSensitive: z.boolean().optional().default(false)
    .describe("Make search case-sensitive"),
  wholeWord: z.boolean().optional().default(false)
    .describe("Match whole words only"),
  maxConcurrent: z.number().optional().default(5)
    .describe("Maximum number of concurrent search operations"),
})

export const GetFileInfoArgsSchema = z.object({
  path: AbsolutePathSchema.describe("Absolute path to get file info for"),
})

// Schema descriptions for documentation
export const OperationsDescriptions = {
  // ReadFile descriptions
  "ReadFile._schema": "Read the contents of a file with options for formatting and encoding",
  "ReadFile.path": "Absolute path to the file to read",
  "ReadFile.options": "Optional configuration for reading operations",

  // ReadMultipleFiles descriptions
  "ReadMultipleFiles._schema": "Read the contents of multiple files concurrently",
  "ReadMultipleFiles.paths": "Array of absolute file paths to read",
  "ReadMultipleFiles.options": "Optional configuration for reading operations",

  // WriteFile descriptions
  "WriteFile._schema": "Write content to a file, creating it if it doesn't exist",
  "WriteFile.path": "Absolute path to the file to write",
  "WriteFile.content": "Content to write to the file",

  // EditFile descriptions
  "EditFile._schema": "Apply a series of text replacements to a file",
  "EditFile.path": "Absolute path to the file to edit",
  "EditFile.edits": "Array of text replacements to perform",
  "EditFile.dryRun": "Generate diff without applying changes if true",

  // CreateDirectory descriptions
  "CreateDirectory._schema": "Create one or more directories, including parent directories",
  "CreateDirectory.paths": "Directory path(s) to create",

  // ListDirectory descriptions
  "ListDirectory._schema": "List the contents of a directory",
  "ListDirectory.path": "Absolute path to the directory to list",

  // DirectoryTree descriptions
  "DirectoryTree._schema": "Generate a hierarchical tree of a directory's contents",
  "DirectoryTree.path": "Absolute path to the directory to generate a tree for",

  // MoveFile descriptions
  "MoveFile._schema": "Move or rename a file or directory",
  "MoveFile.source": "Absolute path to the source file or directory",
  "MoveFile.destination": "Absolute path to the destination location",

  // SearchFiles descriptions
  "SearchFiles._schema": "Search for files matching a pattern in a directory hierarchy",
  "SearchFiles.path": "Absolute path to the directory to search",
  "SearchFiles.pattern": "Pattern to search for in file names",
  "SearchFiles.excludePatterns": "Patterns to exclude from search results",
  "SearchFiles.useGlob": "Whether to use glob pattern matching",
  "SearchFiles.useRegex": "Whether to use regular expression matching",
  "SearchFiles.caseSensitive": "Whether to perform case-sensitive matching",
  "SearchFiles.wholeWord": "Whether to match whole words only",
  "SearchFiles.maxConcurrent": "Maximum concurrent search operations",

  // GetFileInfo descriptions
  "GetFileInfo._schema": "Get detailed metadata about a file or directory",
  "GetFileInfo.path": "Absolute path to the file or directory"
}
