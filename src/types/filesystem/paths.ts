/**
 * Type definitions for filesystem path operations and validation.
 */

/**
 * Options for path validation and normalization.
 */
export interface PathOptions {
  /**
   * The root directory that all paths must be contained within.
   */
  rootDirectory: string

  /**
   * Optional list of directories to exclude from operations.
   */
  excludedDirs?: string[]

  /**
   * Whether to allow relative paths. Defaults to false for security.
   */
  allowRelative?: boolean

  /**
   * Whether to resolve symlinks and verify they stay within the root directory.
   * Defaults to true for security. Set to false for performance-sensitive paths
   * where symlinks are trusted.
   */
  resolveSymlinks?: boolean
}

/**
 * Result of path validation operations.
 */
export interface PathValidationResult {
  /**
   * The normalized absolute path after validation.
   */
  normalizedPath: string

  /**
   * Whether the path points to a directory.
   */
  isDirectory: boolean

  /**
   * Whether the path is contained within the root directory.
   */
  isWithinRoot: boolean

  /**
   * Error message if validation failed but a result was still returned.
   * This is used when we want to return partial information even for invalid paths.
   */
  error?: string
}
