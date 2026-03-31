/**
 * Type definitions for filesystem operation results.
 */

import { ContentModification } from "./contentTracking.js"

/**
 * Base interface for all filesystem operation results.
 */
export interface BaseResult {
  /**
   * The path of the file or directory that was operated on.
   */
  path: string

  /**
   * Whether the operation was successful.
   */
  success: boolean

  /**
   * Error message if the operation failed.
   */
  error?: string

  /**
   * Duration of the operation in milliseconds.
   */
  durationMs?: number
}

/**
 * Result of a read operation.
 */
export interface ReadResult extends BaseResult {
  /**
   * Identifies this as a read operation result.
   */
  operation: "read"

  /**
   * The content that was read from the file.
   */
  content?: string

  /**
   * Whether the content is binary data.
   */
  binary?: boolean

  /**
   * The MIME type of the content.
   */
  mimeType?: string
}

/**
 * Result of a write operation.
 */
export interface WriteResult extends BaseResult {
  /**
   * Identifies this as a write operation result.
   */
  operation: "write"

  /**
   * The content that was written to the file.
   */
  content?: string

  /**
   * The size of the file after writing.
   */
  size?: number

  /**
   * Tracking information for the content modification.
   */
  contentTracking?: ContentModification
}

/**
 * Result of an update operation.
 */
export interface UpdateResult extends BaseResult {
  /**
   * Identifies this as an update operation result.
   */
  operation: "update"

  /**
   * A summary of the changes made.
   */
  summary?: string

  /**
   * Tracking information for the content modification.
   */
  contentTracking?: ContentModification
}

/**
 * Result of a move operation.
 */
export interface MoveResult extends BaseResult {
  /**
   * Identifies this as a move operation result.
   */
  operation: "move"

  /**
   * The destination path where the file or directory was moved to.
   */
  destination: string
}

/**
 * Result of a copy operation.
 */
export interface CopyResult extends BaseResult {
  /**
   * Identifies this as a copy operation result.
   */
  operation: "copy"

  /**
   * The destination path where the file or directory was copied to.
   */
  destination: string
}

/**
 * Result of a delete operation.
 */
export interface DeleteResult extends BaseResult {
  /**
   * Identifies this as a delete operation result.
   */
  operation: "delete"
}

/**
 * Union type of all filesystem operation results.
 */
export type FileSystemResult =
  | ReadResult
  | WriteResult
  | UpdateResult
  | MoveResult
  | CopyResult
  | DeleteResult
