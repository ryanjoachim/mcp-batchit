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
/** Type for validated absolute file system paths */
export type PathValidation = z.infer<typeof AbsolutePathSchema>
/** Type for memory bank update operations */
export type MemoryBankUpdate = z.infer<typeof MemoryBankUpdateSchema>
/** Type for memory bank tool operations */
export type MemoryBankTool = z.infer<typeof MemoryBankToolSchema>
/** Type for file read operation arguments */
export type ReadFileArgs = z.infer<typeof ReadFileArgsSchema>
/** Type for file write operation arguments */
export type WriteFileArgs = z.infer<typeof WriteFileArgsSchema>
/** Type for file edit operation arguments */
export type EditFileArgs = z.infer<typeof EditFileArgsSchema>
/** Type for directory creation operation arguments */
export type CreateDirectoryArgs = z.infer<typeof CreateDirectoryArgsSchema>
/** Type for directory listing operation arguments */
export type ListDirectoryArgs = z.infer<typeof ListDirectoryArgsSchema>
/** Type for directory tree operation arguments */
export type DirectoryTreeArgs = z.infer<typeof DirectoryTreeArgsSchema>
/** Type for file move operation arguments */
export type MoveFileArgs = z.infer<typeof MoveFileArgsSchema>
/** Type for file search operation arguments */
export type SearchFilesArgs = z.infer<typeof SearchFilesArgsSchema>
/** Type for file info operation arguments */
export type GetFileInfoArgs = z.infer<typeof GetFileInfoArgsSchema>
export { FileInfo }
