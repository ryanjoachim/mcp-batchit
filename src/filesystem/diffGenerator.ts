/**
 * @fileoverview
 * In-memory diff generation without temporary files.
 *
 * This module provides efficient diff generation directly from content strings,
 * eliminating the need for temporary files and improving performance.
 */
import { createTwoFilesPatch } from "diff"
import { promisify } from "util"
import { gzip } from "zlib"

const gzipAsync = promisify(gzip)

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
 * Normalizes line endings and optionally handles whitespace and case
 */
function normalizeContent(
  content: string,
  options: DiffGenerationOptions = {}
): string {
  let result = content.replace(/\r\n/g, "\n")

  if (options.normalizeWhitespace !== false) {
    result = result.replace(/[ \t]+/g, " ").trim()
  }

  if (options.ignoreCase) {
    result = result.toLowerCase()
  }

  return result
}

/**
 * Parses diff statistics from a diff string
 */
function parseDiffStats(diff: string): {
  additions: number
  deletions: number
  linesChanged: number
} {
  const lines = diff.split("\n")
  let additions = 0
  let deletions = 0

  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      additions++
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      deletions++
    }
  }

  return {
    additions,
    deletions,
    linesChanged: additions + deletions,
  }
}

/**
 * Compresses a diff string using gzip
 */
async function compressDiff(diff: string, level: number = 6): Promise<Buffer> {
  const buffer = Buffer.from(diff, "utf8")
  return await gzipAsync(buffer, { level })
}

/**
 * Generates a diff from content strings directly (no temp files)
 *
 * @param oldContent - The original content
 * @param newContent - The new content
 * @param options - Diff generation options
 * @returns DiffResult with diff and metadata
 */
export async function generateDiff(
  oldContent: string,
  newContent: string,
  options: DiffGenerationOptions = {}
): Promise<DiffResult> {
  const {
    contextLines = 3,
    compress = false,
    compressionLevel = 6,
    maxDiffSize = 1024 * 1024, // 1MB
    normalizeWhitespace = true,
    ignoreCase = false,
  } = options

  // Early termination for identical content
  if (oldContent === newContent) {
    return {
      diff: "",
      compressed: false,
      identical: true,
      linesChanged: 0,
      additions: 0,
      deletions: 0,
    }
  }

  // Normalize content if requested
  let oldNorm = oldContent
  let newNorm = newContent

  if (normalizeWhitespace) {
    oldNorm = normalizeContent(oldNorm, options)
    newNorm = normalizeContent(newNorm, options)
  }

  if (ignoreCase) {
    oldNorm = oldNorm.toLowerCase()
    newNorm = newNorm.toLowerCase()
  }

  // Check again after normalization
  if (oldNorm === newNorm) {
    return {
      diff: "",
      compressed: false,
      identical: true,
      linesChanged: 0,
      additions: 0,
      deletions: 0,
    }
  }

  // Generate unified diff using the diff library
  const diffString = createTwoFilesPatch(
    "old",
    "new",
    oldNorm,
    newNorm,
    undefined,
    undefined,
    { context: contextLines }
  )

  // Parse statistics
  const stats = parseDiffStats(diffString)

  // Check size and truncate if needed
  let finalDiff = diffString
  if (diffString.length > maxDiffSize) {
    finalDiff = diffString.substring(0, maxDiffSize) + "\n... [diff truncated]"
  }

  // Compress if requested
  let compressed = false
  let originalSize: number | undefined
  let compressedSize: number | undefined

  if (compress) {
    originalSize = Buffer.byteLength(finalDiff, "utf8")
    const compressedBuffer = await compressDiff(finalDiff, compressionLevel)
    compressedSize = compressedBuffer.length

    // Only use compression if it saves space
    if (compressedSize < originalSize) {
      finalDiff = compressedBuffer.toString("base64")
      compressed = true
    }
  }

  return {
    diff: finalDiff,
    compressed,
    originalSize,
    compressedSize,
    identical: false,
    linesChanged: stats.linesChanged,
    additions: stats.additions,
    deletions: stats.deletions,
  }
}
