import { z } from "zod"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
// import { AbsolutePathSchema } from "../schemas/paths.js"
import {
  ReadFileArgsSchema,
  ReadMultipleFilesArgsSchema,
  WriteFileArgsSchema,
  EditFileArgsSchema,
  CreateDirectoryArgsSchema,
  ListDirectoryArgsSchema,
  DirectoryTreeArgsSchema,
  MoveFileArgsSchema,
  SearchFilesArgsSchema,
  GetFileInfoArgsSchema,
  FileInfo
} from "../schemas/operations.js"

/**
 * Validates schema and throws McpError with appropriate error code
 */
function validateSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  operation: string
): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const issues = result.error.errors.map((err) => {
      const path = err.path.join(".")
      return path ? `${path}: ${err.message}` : err.message
    })

    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid parameters for ${operation}: ${issues.join(", ")}`
    )
  }
  return result.data
}

// Re-export operation schemas and types
export {
  ReadFileArgsSchema,
  ReadMultipleFilesArgsSchema,
  WriteFileArgsSchema,
  EditFileArgsSchema,
  CreateDirectoryArgsSchema,
  ListDirectoryArgsSchema,
  DirectoryTreeArgsSchema,
  MoveFileArgsSchema,
  SearchFilesArgsSchema,
  GetFileInfoArgsSchema,
  FileInfo,
  validateSchema
}
