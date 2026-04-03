/**
 * @fileoverview
 * Extended metadata collection for file tracking.
 *
 * Collects rich file metadata including checksums, permissions, and statistics.
 */
import { createHash } from "crypto"
import { readFile, stat } from "fs/promises"
import { isBinaryFile } from "isbinaryfile"
import { getMimeType } from "./fileTypeHandlers.js"

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
 * Default metadata collection options
 */
const DEFAULT_OPTIONS: Required<MetadataCollectionOptions> = {
  size: true,
  mimeType: true,
  permissions: false,
  checksum: false,
  hash: false,
  lineCount: false,
  charCount: false,
  timestamps: false,
}

/**
 * Collects extended metadata for a file
 *
 * @param filePath - Path to the file
 * @param options - Collection options
 * @returns Extended file metadata
 */
export async function collectMetadata(
  filePath: string,
  options: MetadataCollectionOptions = {}
): Promise<ExtendedFileMetadata> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Get basic file stats
  const stats = await stat(filePath)
  const binary = await isBinaryFile(filePath)

  const metadata: ExtendedFileMetadata = {
    size: binary ? stats.size : await readFile(filePath).then((b) => b.length),
    mimeType: binary ? "application/octet-stream" : getMimeType(filePath) || "text/plain",
    isBinary: binary,
  }

  // Collect permissions
  if (opts.permissions) {
    // Extract permission bits (last 9 bits)
    metadata.permissions = (stats.mode & 0o777).toString(8).padStart(3, "0")
  }

  // Collect timestamps
  if (opts.timestamps) {
    metadata.createdAt = stats.birthtime.toISOString()
    metadata.modifiedAt = stats.mtime.toISOString()
  }

  // For content-based metadata, we need to read the file
  if (opts.checksum || opts.hash || opts.lineCount || opts.charCount) {
    const content = await readFile(filePath)

    // Calculate checksums
    if (opts.checksum) {
      metadata.checksum = createHash("md5").update(content).digest("hex")
    }

    if (opts.hash) {
      metadata.hash = createHash("sha256").update(content).digest("hex")
    }

    // Text-specific metadata
    if (!binary) {
      const textContent = content.toString("utf8")

      if (opts.lineCount) {
        // Count non-empty lines
        metadata.lineCount = textContent.split("\n").filter((line) => line.length > 0).length
      }

      if (opts.charCount) {
        metadata.charCount = textContent.length
      }
    }
  }

  return metadata
}

/**
 * Batch metadata collection with concurrency control
 *
 * @param filePaths - Array of file paths
 * @param options - Collection options
 * @param concurrency - Max concurrent operations (default: 5)
 * @returns Map of file paths to their metadata
 */
export async function collectMetadataBatch(
  filePaths: string[],
  options: MetadataCollectionOptions = {},
  concurrency: number = 5
): Promise<Map<string, ExtendedFileMetadata>> {
  const results = new Map<string, ExtendedFileMetadata>()

  for (let i = 0; i < filePaths.length; i += concurrency) {
    const batch = filePaths.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map(async (path) => {
        try {
          const metadata = await collectMetadata(path, options)
          return { path, metadata, error: null }
        } catch (error) {
          return { path, metadata: null, error }
        }
      })
    )

    for (const result of batchResults) {
      if (result.metadata) {
        results.set(result.path, result.metadata)
      }
    }
  }

  return results
}
