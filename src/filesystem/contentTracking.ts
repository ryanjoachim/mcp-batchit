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
import { FileSystem } from "./FileSystem.js"
import { getMimeType } from "./fileTypeHandlers.js"
import { compareFiles } from "./lineDiff.js"
import { previewCache } from "./previewCache.js"
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

    // Invalidate preview cache when file is modified or deleted
    if (operation === "update" || operation === "delete") {
      previewCache.invalidate(normalized)
    }

    // Don't try to get additional info for deleted files
    if (operation === "delete") {
      return modification
    }

    const fileSystem = new FileSystem({
      rootDirectory,
      excludedDirs: [], // Explicitly provide empty excludedDirs for clarity
    })

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

      // Track diff if requested and this is an update
      if (trackingOptions.trackDiff && operation === "update" && oldContent) {
        // Create temporary file for old content
        const tmpOld = path.join(
          path.dirname(normalized),
          `.tmp_old_${Date.now()}`
        )
        try {
          await fileSystem.writeFile(tmpOld, oldContent)
          const { diff } = await compareFiles(
            tmpOld,
            normalized,
            rootDirectory,
            {
              contextLines: trackingOptions.diffContextLines,
            }
          )
          modification.diff = diff
        } finally {
          try {
            await fileSystem.deleteFile(tmpOld)
          } catch {
            // Ignore cleanup errors
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

/**
 * Tracks multiple content modifications in batch
 */
export async function trackContentModifications(
  modifications: {
    path: string
    operation: ContentOperationType
    oldContent?: string
  }[],
  rootDirectory: string,
  options: Partial<ContentTrackingOptions> = { enabled: true }
): Promise<ContentModification[]> {
  // Ensure options has the required 'enabled' property
  const trackingOptions: ContentTrackingOptions = {
    enabled: options.enabled ?? true,
    trackSize: options.trackSize,
    trackType: options.trackType,
    trackDiff: options.trackDiff,
    diffContextLines: options.diffContextLines,
  }
  const results: ContentModification[] = []
  const maxConcurrent = 5

  // Process modifications in batches to control concurrency
  for (let i = 0; i < modifications.length; i += maxConcurrent) {
    const batch = modifications.slice(i, i + maxConcurrent)
    const batchResults = await Promise.all(
      batch.map((mod) =>
        trackContentModification(
          mod.path,
          mod.operation,
          rootDirectory,
          mod.oldContent,
          trackingOptions
        )
      )
    )
    results.push(...batchResults)
  }

  return results
}
