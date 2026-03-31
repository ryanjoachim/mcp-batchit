/**
 * Type definitions for filesystem operations.
 */

import { ContentTrackingOptions } from "./contentTracking.js"

/**
 * Base interface for all filesystem operations.
 */
export interface BaseOperation {
  /**
   * The path to the file or directory for the operation.
   */
  path: string

  /**
   * Optional additional parameters for the operation.
   */
  options?: Record<string, unknown>
}

/**
 * Operation for reading file content.
 */
export interface ReadOperation extends BaseOperation {
  /**
   * Identifies this as a read operation.
   */
  operation: "read"

  /**
   * Optional encoding for the file content.
   */
  encoding?: BufferEncoding

  /**
   * Optional starting line for partial reads.
   */
  startLine?: number

  /**
   * Optional ending line for partial reads.
   */
  endLine?: number
}

/**
 * Operation for writing content to a file.
 */
export interface WriteOperation extends BaseOperation {
  /**
   * Identifies this as a write operation.
   */
  operation: "write"

  /**
   * The content to write to the file.
   */
  content: unknown

  /**
   * Optional tracking configuration for content changes.
   */
  tracking?: ContentTrackingOptions

  /**
   * Optional template name for template-based content generation.
   */
  template?: string
}

/**
 * Represents a single diff operation for updating file content.
 */
export interface DiffOperation {
  /**
   * The line number to perform the operation on.
   */
  line: number

  /**
   * The type of operation to perform.
   */
  operation: "insert" | "replace" | "delete"

  /**
   * The text content for the operation.
   */
  text: string
}

/**
 * Operation for updating existing file content.
 */
export interface UpdateOperation extends BaseOperation {
  /**
   * Identifies this as an update operation.
   */
  operation: "update"

  /**
   * The mode of update to perform.
   */
  mode: "overwrite" | "append" | "diff"

  /**
   * Optional content for overwrite or append modes.
   */
  content?: string

  /**
   * Optional diff operations for diff mode.
   */
  diff?: DiffOperation[]

  /**
   * Optional tracking configuration for content changes.
   */
  tracking?: ContentTrackingOptions
}

/**
 * Operation for moving a file or directory.
 */
export interface MoveOperation extends BaseOperation {
  /**
   * Identifies this as a move operation.
   */
  operation: "move"

  /**
   * The destination path for the move.
   */
  destination: string

  /**
   * Whether to overwrite existing files at the destination.
   */
  overwrite?: boolean
}

/**
 * Operation for copying a file or directory.
 */
export interface CopyOperation extends BaseOperation {
  /**
   * Identifies this as a copy operation.
   */
  operation: "copy"

  /**
   * The destination path for the copy.
   */
  destination: string

  /**
   * Whether to overwrite existing files at the destination.
   */
  overwrite?: boolean
}

/**
 * Operation for deleting a file or directory.
 */
export interface DeleteOperation extends BaseOperation {
  /**
   * Identifies this as a delete operation.
   */
  operation: "delete"

  /**
   * Whether to recursively delete directories.
   */
  recursive?: boolean
}

/**
 * Union type of all filesystem operations.
 */
export type FileSystemOperation =
  | ReadOperation
  | WriteOperation
  | UpdateOperation
  | MoveOperation
  | CopyOperation
  | DeleteOperation
