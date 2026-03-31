/**
 * Type definitions for file and directory information.
 */

/**
 * Base interface for file system entry information.
 */
export interface BaseFileInfo {
  /**
   * The absolute path of the file or directory.
   */
  path: string

  /**
   * The name of the file or directory.
   */
  name: string

  /**
   * Whether the file or directory exists.
   */
  exists: boolean
}

/**
 * File statistics information.
 */
export interface FileStats {
  /**
   * The size of the file in bytes.
   */
  size: number

  /**
   * The creation timestamp of the file.
   */
  created: string

  /**
   * The last modification timestamp of the file.
   */
  modified: string

  /**
   * The last access timestamp of the file.
   */
  accessed: string

  /**
   * The file permissions as a string.
   */
  permissions: string
}

/**
 * Additional metadata for files.
 */
export interface FileMetadata {
  /**
   * The MIME type of the file.
   */
  mimeType?: string

  /**
   * The character encoding of the file.
   */
  encoding?: string

  /**
   * The dimensions of the file if it's an image.
   */
  dimensions?: { width: number; height: number }

  /**
   * The duration of the file if it's a media file.
   */
  duration?: number

  /**
   * The number of pages if it's a document.
   */
  pageCount?: number

  /**
   * Additional metadata properties.
   */
  [key: string]: unknown
}

/**
 * Information about a file.
 */
export interface FileInfo extends BaseFileInfo, FileStats {
  /**
   * Identifies this as a file.
   */
  type: "file"

  /**
   * Additional metadata about the file.
   */
  metadata?: FileMetadata
}

/**
 * Information about a directory.
 */
export interface DirectoryInfo extends BaseFileInfo, FileStats {
  /**
   * Identifies this as a directory.
   */
  type: "directory"

  /**
   * Optional list of children in the directory.
   */
  children?: Array<FileInfo | DirectoryInfo | SymlinkInfo>
}

/**
 * Information about a symbolic link.
 */
export interface SymlinkInfo extends BaseFileInfo, FileStats {
  /**
   * Identifies this as a symbolic link.
   */
  type: "symlink"

  /**
   * The target path that the symlink points to.
   */
  target: string
}

/**
 * Union type of all filesystem entry information.
 */
export type FSEntryInfo = FileInfo | DirectoryInfo | SymlinkInfo

/**
 * Options for generating image previews/thumbnails
 */
export interface PreviewOptions {
  /**
   * Maximum width of the preview in pixels
   */
  maxWidth?: number

  /**
   * Maximum height of the preview in pixels
   */
  maxHeight?: number

  /**
   * Output format for the preview
   */
  format?: "jpeg" | "png" | "webp"

  /**
   * Quality level for the preview (1-100)
   */
  quality?: number
}
