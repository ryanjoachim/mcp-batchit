/**
 * @fileoverview
 * Compression utilities for content tracking.
 *
 * Provides gzip compression/decompression for diff storage optimization.
 */
import { promisify } from "util"
import { gzip, gunzip } from "zlib"

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

/**
 * Compression level (1-9)
 * 1 = fastest, 9 = best compression
 */
export type CompressionLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

/**
 * Default compression level
 */
const DEFAULT_COMPRESSION_LEVEL: CompressionLevel = 6

/**
 * Compresses a string using gzip
 *
 * @param content - The content to compress
 * @param level - Compression level 1-9 (default: 6)
 * @returns Compressed content as base64 string
 */
export async function compressString(
  content: string,
  level: CompressionLevel = DEFAULT_COMPRESSION_LEVEL
): Promise<string> {
  const buffer = Buffer.from(content, "utf8")
  const compressed = await gzipAsync(buffer, { level })
  return compressed.toString("base64")
}

/**
 * Decompresses a gzip-compressed base64 string
 *
 * @param compressedContent - Base64 encoded compressed content
 * @returns Decompressed string
 */
export async function decompressString(compressedContent: string): Promise<string> {
  const buffer = Buffer.from(compressedContent, "base64")
  const decompressed = await gunzipAsync(buffer)
  return decompressed.toString("utf8")
}

/**
 * Compresses a diff string using gzip
 *
 * @param diff - The diff string to compress
 * @param level - Compression level 1-9 (default: 6)
 * @returns Compressed diff as base64 string
 */
export async function compressDiff(
  diff: string,
  level: CompressionLevel = DEFAULT_COMPRESSION_LEVEL
): Promise<string> {
  return compressString(diff, level)
}

/**
 * Decompresses a compressed diff string
 *
 * @param compressedDiff - Base64 encoded compressed diff
 * @returns Decompressed diff string
 */
export async function decompressDiff(compressedDiff: string): Promise<string> {
  return decompressString(compressedDiff)
}

/**
 * Gets the compression ratio (bytes saved)
 *
 * @param originalSize - Original content size in bytes
 * @param compressedSize - Compressed content size in bytes
 * @returns Compression ratio (0-1 where 1 means 100% compression)
 */
export function getCompressionRatio(originalSize: number, compressedSize: number): number {
  if (originalSize === 0) return 0
  return 1 - compressedSize / originalSize
}

/**
 * Estimates if compression would be beneficial
 *
 * @param content - Content to potentially compress
 * @param minSavingsRatio - Minimum savings ratio to consider compression worthwhile (default: 0.1)
 * @returns True if compression is likely to save space
 */
export function shouldCompress(content: string, minSavingsRatio: number = 0.1): boolean {
  const size = Buffer.byteLength(content, "utf8")

  // Small content doesn't benefit from compression overhead
  if (size < 100) return false

  // Compression overhead is roughly 20 bytes
  // so content needs to be compressible enough to save at least that much
  const estimatedCompressedSize = Math.max(size * 0.5, size - 20)

  return getCompressionRatio(size, estimatedCompressedSize) >= minSavingsRatio
}
