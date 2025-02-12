import { z } from "zod"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import {
  ReadFileArgsSchema,
  WriteFileArgsSchema,
  EditFileArgsSchema,
  CreateDirectoryArgsSchema,
  ListDirectoryArgsSchema,
  DirectoryTreeArgsSchema,
  MoveFileArgsSchema,
  SearchFilesArgsSchema,
  GetFileInfoArgsSchema
} from "../schemas/operations.js"
import {
  MemoryBankUpdateSchema,
  MemoryBankToolSchema
} from "../schemas/memory-bank.js"

/**
 * Generic schema validation function that throws McpError on validation failure
 */
export function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown, operation: string): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid ${operation} parameters: ${result.error.errors.map(e => e.message).join(", ")}`
    )
  }
  return result.data
}

// Operation schema validations
export function validateReadFileArgs(data: unknown) {
  return validateSchema(ReadFileArgsSchema, data, "ReadFile")
}

export function validateWriteFileArgs(data: unknown) {
  return validateSchema(WriteFileArgsSchema, data, "WriteFile")
}

export function validateEditFileArgs(data: unknown) {
  return validateSchema(EditFileArgsSchema, data, "EditFile")
}

export function validateCreateDirectoryArgs(data: unknown) {
  return validateSchema(CreateDirectoryArgsSchema, data, "CreateDirectory")
}

export function validateListDirectoryArgs(data: unknown) {
  return validateSchema(ListDirectoryArgsSchema, data, "ListDirectory")
}

export function validateDirectoryTreeArgs(data: unknown) {
  return validateSchema(DirectoryTreeArgsSchema, data, "DirectoryTree")
}

export function validateMoveFileArgs(data: unknown) {
  return validateSchema(MoveFileArgsSchema, data, "MoveFile")
}

export function validateSearchFilesArgs(data: unknown) {
  return validateSchema(SearchFilesArgsSchema, data, "SearchFiles")
}

export function validateGetFileInfoArgs(data: unknown) {
  return validateSchema(GetFileInfoArgsSchema, data, "GetFileInfo")
}

// Memory bank schema validations
export function validateMemoryBankUpdate(data: unknown) {
  return validateSchema(MemoryBankUpdateSchema, data, "MemoryBankUpdate")
}

export function validateMemoryBankTool(data: unknown) {
  return validateSchema(MemoryBankToolSchema, data, "MemoryBankTool")
}
