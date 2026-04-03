/**
 * Type definitions for content tracking and modification history.
 */

/**
 * Options for diff generation
 */
export interface DiffGenerationOptions {
  /**
   * Number of context lines (default: 3)
   */
  contextLines?: number

  /**
   * Enable compression (default: false)
   */
  compress?: boolean

  /**
   * Compression level 1-9 (default: 6)
   */
  compressionLevel?: number

  /**
   * Maximum diff size in bytes before truncation (default: 1MB)
   */
  maxDiffSize?: number

  /**
   * Normalize whitespace before comparison (default: true)
   */
  normalizeWhitespace?: boolean

  /**
   * Case-insensitive comparison (default: false)
   */
  ignoreCase?: boolean
}

/**
 * Result of a diff generation operation
 */
export interface DiffResult {
  /**
   * The diff string (may be compressed if compress is true)
   */
  diff: string

  /**
   * Whether the diff is compressed
   */
  compressed: boolean

  /**
   * Original size before compression (if compressed)
   */
  originalSize?: number

  /**
   * Compressed size (if compressed)
   */
  compressedSize?: number

  /**
   * Whether content is identical
   */
  identical: boolean

  /**
   * Number of lines changed
   */
  linesChanged?: number

  /**
   * Number of additions
   */
  additions?: number

  /**
   * Number of deletions
   */
  deletions?: number
}

/**
 * Options for metadata collection
 */
export interface MetadataCollectionOptions {
  /**
   * Collect file size (default: true)
   */
  size?: boolean

  /**
   * Detect MIME type (default: true)
   */
  mimeType?: boolean

  /**
   * Collect file permissions (default: false)
   */
  permissions?: boolean

  /**
   * Calculate MD5 checksum (default: false)
   */
  checksum?: boolean

  /**
   * Calculate SHA-256 hash (default: false)
   */
  hash?: boolean

  /**
   * Count lines in text files (default: false)
   */
  lineCount?: boolean

  /**
   * Count characters (default: false)
   */
  charCount?: boolean

  /**
   * Collect filesystem timestamps (default: false)
   */
  timestamps?: boolean
}

/**
 * Extended file metadata
 */
export interface ExtendedFileMetadata {
  /**
   * File size in bytes
   */
  size: number

  /**
   * MIME type
   */
  mimeType: string

  /**
   * File permissions (Unix-style, e.g., '0644')
   */
  permissions?: string

  /**
   * MD5 checksum
   */
  checksum?: string

  /**
   * SHA-256 hash
   */
  hash?: string

  /**
   * Line count (text files only)
   */
  lineCount?: number

  /**
   * Character count
   */
  charCount?: number

  /**
   * Creation time (from filesystem)
   */
  createdAt?: string

  /**
   * Last modification time (from filesystem)
   */
  modifiedAt?: string

  /**
   * Whether file is binary
   */
  isBinary: boolean
}

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

  /**
   * Diff generation options (if trackDiff is true)
   */
  diffOptions?: DiffGenerationOptions

  /**
   * Extended metadata collection options
   */
  metadata?: MetadataCollectionOptions

  /**
   * Compression options for diffs
   */
  compression?: {
    enabled: boolean
    level?: number
  }
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

  /**
   * Whether the diff is compressed.
   */
  diffCompressed?: boolean

  /**
   * Diff statistics.
   */
  diffStats?: {
    additions: number
    deletions: number
    linesChanged: number
  }

  /**
   * Extended metadata (if collected).
   */
  metadata?: Partial<ExtendedFileMetadata>
}

/**
 * Type of content operation.
 */
export type ContentOperationType = "create" | "update" | "delete"
