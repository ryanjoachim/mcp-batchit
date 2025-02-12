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

const encodings = [
  'ascii', 'utf8', 'utf-8', 'utf16le', 'ucs2', 'ucs-2', 'base64', 'base64url',
  'latin1', 'binary', 'hex'
] as const;

const ReadOptionsSchema: z.ZodType<ReadOptions> = z.object({
  encoding: z.enum(encodings).optional(),
  maxConcurrent: z.number().optional(),
  checkBinary: z.boolean().optional(),
  addLineNumbers: z.boolean().optional(),
  fileTypeHandling: z.boolean().optional(),
  startLineNumber: z.number().optional()
})

export const ReadFileArgsSchema = z.object({
  path: AbsolutePathSchema,
  options: ReadOptionsSchema.optional()
})

export const ReadMultipleFilesArgsSchema = z.object({
  paths: z.array(AbsolutePathSchema).min(1),
  options: ReadOptionsSchema.optional()
})

export const WriteFileArgsSchema = z.object({
  path: AbsolutePathSchema,
  content: z.string()
})

export const EditOperation = z.object({
  oldText: z.string()
    .min(1, "Search text cannot be empty"),
  newText: z.string()
    .optional()
    .default("")
})

export const EditFileArgsSchema = z.object({
  path: AbsolutePathSchema,
  edits: z.array(EditOperation)
    .min(1, "At least one edit operation must be provided"),
  dryRun: z.boolean()
    .default(false)
})

export const CreateDirectoryArgsSchema = z.object({
  paths: z.union([AbsolutePathSchema, z.array(AbsolutePathSchema)])
})

export const ListDirectoryArgsSchema = z.object({
  path: AbsolutePathSchema
})

export const DirectoryTreeArgsSchema = z.object({
  path: AbsolutePathSchema
})

export const MoveFileArgsSchema = z.object({
  source: AbsolutePathSchema,
  destination: AbsolutePathSchema
})

export const SearchFilesArgsSchema = z.object({
  path: AbsolutePathSchema,
  pattern: z.string()
    .min(1, "Search pattern cannot be empty"),
  excludePatterns: z.array(z.string())
    .optional()
    .default([])
})

export const GetFileInfoArgsSchema = z.object({
  path: AbsolutePathSchema
})
