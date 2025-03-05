import { z } from "zod"
import { validatePathFormat } from "../utils/pathUtils.js"

const PathValidationOptionsSchema = z.object({
  requireAbsolute: z.boolean().default(true).describe("Whether paths must be absolute"),
  rootDirectory: z.string().optional().describe("Base directory that all paths must be within"),
  maxLength: z.number().default(260).describe("Maximum allowed path length"),
  allowedExtensions: z.array(z.string()).optional().describe("File extensions that are allowed"),
  checkSymlinks: z.boolean().default(true).describe("Whether to validate symlink targets"),
  validateMarkdown: z.boolean().default(false).describe("Whether to validate markdown content"),
  requireHeader: z.boolean().default(false).describe("Whether to require a heading in markdown"),
  cacheStats: z.boolean().default(false).describe("Whether to cache file stats"),
  bypassRootCheck: z.boolean().default(false).describe("Whether to bypass root directory containment check")
})

export const AbsolutePathSchema = z.string().min(1).describe("Absolute file or directory path")
  .refine(
    (p) => {
      try {
        validatePathFormat(p)
        return true
      } catch {
        return false
      }
    },
    { message: "Invalid path format" }
  )

export const PathValidationSchema = z.object({
  path: AbsolutePathSchema.describe("Path to validate"),
  options: PathValidationOptionsSchema.optional().describe("Validation options")
})

export const MemoryBankPathSchema = PathValidationSchema.extend({
  options: PathValidationOptionsSchema.extend({
    validateMarkdown: z.boolean().default(true).describe("Whether to validate markdown content"),
    requireHeader: z.boolean().default(true).describe("Whether to require a heading in markdown"),
    allowedExtensions: z.array(z.string()).default(['.md']).describe("Allowed file extensions (default: .md)")
  }).describe("Path validation options for memory bank files")
})

export const FileSystemConfigSchema = z.object({
  rootDirectory: AbsolutePathSchema.describe("Base directory for all file operations"),
  provider: z.enum(["batchit-internal", "external"]).describe("Provider type for filesystem operations"),
  pathValidation: PathValidationOptionsSchema.optional().describe("Additional path validation options")
})

// Schema descriptions for documentation
export const PathsDescriptions = {
  "_schema": "Path validation and configuration schemas",

  "AbsolutePath._schema": "A valid absolute file system path",

  "PathValidation._schema": "Path validation configuration",
  "PathValidation.path": "The path to validate",
  "PathValidation.options": "Options for path validation",

  "PathValidationOptions._schema": "Options for validating file paths",
  "PathValidationOptions.requireAbsolute": "Whether paths must be absolute",
  "PathValidationOptions.rootDirectory": "Base directory that all paths must be within",
  "PathValidationOptions.maxLength": "Maximum allowed path length",
  "PathValidationOptions.allowedExtensions": "File extensions that are allowed",
  "PathValidationOptions.checkSymlinks": "Whether to validate symlink targets",
  "PathValidationOptions.validateMarkdown": "Whether to validate markdown content",
  "PathValidationOptions.requireHeader": "Whether to require a heading in markdown",
  "PathValidationOptions.cacheStats": "Whether to cache file stats",
  "PathValidationOptions.bypassRootCheck": "Whether to bypass root directory containment check",

  "MemoryBankPath._schema": "Path validation specific to memory bank files",
  "MemoryBankPath.options": "Memory bank specific path validation options",

  "FileSystemConfig._schema": "Configuration for filesystem operations",
  "FileSystemConfig.rootDirectory": "Base directory for all file operations",
  "FileSystemConfig.provider": "Provider type (internal or external) for filesystem operations",
  "FileSystemConfig.pathValidation": "Additional path validation options"
}
