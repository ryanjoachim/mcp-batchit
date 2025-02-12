// Export all schema types and validators
export * from './paths.js'
export * from './memory-bank.js'
export * from './operations.js'

// Re-export common types for convenience
import { z } from 'zod'
import { AbsolutePathSchema } from './paths.js'
import { MemoryBankUpdateSchema, MemoryBankToolSchema } from './memory-bank.js'
import {
    ReadFileArgsSchema,
    WriteFileArgsSchema,
    EditFileArgsSchema,
    CreateDirectoryArgsSchema,
    ListDirectoryArgsSchema,
    DirectoryTreeArgsSchema,
    MoveFileArgsSchema,
    SearchFilesArgsSchema,
    GetFileInfoArgsSchema,
    FileInfo
} from './operations.js'

// Common types
export type PathValidation = z.infer<typeof AbsolutePathSchema>
export type MemoryBankUpdate = z.infer<typeof MemoryBankUpdateSchema>
export type MemoryBankTool = z.infer<typeof MemoryBankToolSchema>
export type ReadFileArgs = z.infer<typeof ReadFileArgsSchema>
export type WriteFileArgs = z.infer<typeof WriteFileArgsSchema>
export type EditFileArgs = z.infer<typeof EditFileArgsSchema>
export type CreateDirectoryArgs = z.infer<typeof CreateDirectoryArgsSchema>
export type ListDirectoryArgs = z.infer<typeof ListDirectoryArgsSchema>
export type DirectoryTreeArgs = z.infer<typeof DirectoryTreeArgsSchema>
export type MoveFileArgs = z.infer<typeof MoveFileArgsSchema>
export type SearchFilesArgs = z.infer<typeof SearchFilesArgsSchema>
export type GetFileInfoArgs = z.infer<typeof GetFileInfoArgsSchema>
export { FileInfo }
