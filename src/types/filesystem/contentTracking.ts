/**
 * Type definitions for content tracking and modification history.
 */

/**
 * Options for tracking content changes.
 */
export interface ContentTrackingOptions {
  /**
   * Whether content tracking is enabled.
   */
  enabled: boolean

  /**
   * Whether to track file size changes.
   */
  trackSize?: boolean

  /**
   * Whether to track content type changes.
   */
  trackType?: boolean

  /**
   * Whether to track content differences.
   */
  trackDiff?: boolean

  /**
   * Number of context lines to include in diffs.
   */
  diffContextLines?: number
}

/**
 * Represents a content modification event.
 */
export interface ContentModification {
  /**
   * The path of the modified file.
   */
  path: string

  /**
   * The timestamp of the modification.
   */
  timestamp: string

  /**
   * The type of operation performed.
   */
  operation: ContentOperationType

  /**
   * The size of the file after modification.
   */
  size?: number

  /**
   * The content type of the file.
   */
  type?: string

  /**
   * A diff showing the changes made.
   */
  diff?: string
}

/**
 * Type of content operation.
 */
export type ContentOperationType = "create" | "update" | "delete"
