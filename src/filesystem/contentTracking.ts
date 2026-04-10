/**
 * @fileoverview
 * Content tracking utilities for monitoring file changes.
 *
 * This module provides functions to track content modifications and generate diffs
 * between file versions. It supports tracking file size, type, and content changes.
 */
import fs from "fs/promises"
import path from "path"
import { isBinaryFile } from "isbinaryfile"
import { getMimeType } from "./fileTypeHandlers.js"
import { generateDiff } from "./diffGenerator.js"
import { collectMetadata } from "./metadataCollector.js"
import {
  ContentModification,
  ContentTrackingOptions,
  ContentOperationType,
} from "../types/filesystem/contentTracking.js"
import { ErrorManager } from "../utils/errorManager.js"

/**
 * Creates a content modification record for a file operation
 */
export async function trackContentModification(
  filePath: string,
  operation: ContentOperationType,
  rootDirectory: string,
  oldContent?: string,
  options: Partial<ContentTrackingOptions> = { enabled: true }
): Promise<ContentModification> {
  // Ensure options has the required 'enabled' property
  const trackingOptions: ContentTrackingOptions = {
    enabled: options.enabled ?? true,
    trackSize: options.trackSize,
    trackType: options.trackType,
    trackDiff: options.trackDiff,
    diffContextLines: options.diffContextLines,
    diffOptions: options.diffOptions,
    metadata: options.metadata,
    compression: options.compression,
  }
  try {
    const normalized = path.normalize(filePath)

    // Basic path validation
    if (!path.isAbsolute(normalized)) {
      throw ErrorManager.createPathValidationError(
        normalized,
        "Must be absolute path"
      )
    }

    if (normalized.includes("..")) {
      throw ErrorManager.createPathValidationError(
        normalized,
        "Cannot contain parent directory references (..)"
      )
    }

    if (!normalized.startsWith(path.normalize(rootDirectory))) {
      throw ErrorManager.createPathValidationError(
        normalized,
        `Must be within root directory ${rootDirectory}`
      )
    }

    // Create the content modification object using the new type
    const modification: ContentModification = {
      timestamp: new Date().toISOString(),
      path: normalized,
      operation,
    }

    // Don't try to get additional info for deleted files
    if (operation === "delete") {
      return modification
    }

    try {
      const stats = await fs.stat(normalized)

      // Track file size if requested
      if (trackingOptions.trackSize) {
        modification.size = stats.size
      }

      // Track file type if requested
      if (trackingOptions.trackType) {
        if (await isBinaryFile(normalized)) {
          modification.type = "binary"
        } else {
          const mimeType = getMimeType(normalized)
          modification.type = mimeType || "text/plain"
        }
      }

      // Collect extended metadata if requested
      if (trackingOptions.metadata) {
        try {
          modification.metadata = await collectMetadata(
            normalized,
            trackingOptions.metadata
          )
        } catch {
          // Ignore metadata collection errors - non-critical
        }
      }

      // Track diff if requested and this is an update
      if (
        trackingOptions.trackDiff &&
        operation === "update" &&
        oldContent !== undefined
      ) {
        // Read the new content directly from disk
        const newContent = await fs.readFile(normalized, "utf-8")

        // Generate diff in-memory (no temp files)
        const diffResult = await generateDiff(oldContent, newContent, {
          contextLines: trackingOptions.diffContextLines,
          ...trackingOptions.diffOptions,
          compress:
            trackingOptions.compression?.enabled ??
            trackingOptions.diffOptions?.compress,
          compressionLevel:
            trackingOptions.compression?.level ??
            trackingOptions.diffOptions?.compressionLevel,
        })

        if (!diffResult.identical) {
          modification.diff = diffResult.diff
          modification.diffCompressed = diffResult.compressed

          if (diffResult.additions !== undefined) {
            modification.diffStats = {
              additions: diffResult.additions,
              deletions: diffResult.deletions ?? 0,
              linesChanged: diffResult.linesChanged ?? 0,
            }
          }
        }
      }
    } catch (error) {
      // If we can't get additional info, just return basic modification info
      return modification
    }

    return modification
  } catch (error) {
    throw ErrorManager.normalizeError(
      error,
      `Failed to track ${operation} operation for ${path.basename(filePath)}`
    )
  }
}
