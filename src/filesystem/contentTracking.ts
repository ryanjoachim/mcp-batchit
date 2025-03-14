import fs from "fs/promises";
import path from "path";
import { isBinaryFile } from "isbinaryfile";
import { getMimeType } from "./fileTypeHandlers.js";
import { compareFiles } from "./lineDiff.js";
import { previewCache } from "./previewCache.js";
import { ContentModification, ContentTrackingOptions } from "../types/operations.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

/**
 * Creates a content modification record for a file operation
 */
export async function trackContentModification(
  filePath: string,
  operation: "create" | "update" | "delete",
  rootDirectory: string,
  oldContent?: string,
  options: ContentTrackingOptions = {}
): Promise<ContentModification> {
  try {
    const normalized = path.normalize(filePath);

    // Basic path validation
    if (!path.isAbsolute(normalized)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Path must be absolute: ${normalized}`
      );
    }

    if (normalized.includes("..")) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Path cannot contain parent directory references (..): ${normalized}`
      );
    }

    if (!normalized.startsWith(path.normalize(rootDirectory))) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Path must be within root directory ${rootDirectory}: ${normalized}`
      );
    }

    const modification: ContentModification = {
      timestamp: new Date().toISOString(),
      path: normalized,
      operation
    };

    // Invalidate preview cache when file is modified or deleted
    if (operation === "update" || operation === "delete") {
      previewCache.invalidate(normalized);
    }

    // Don't try to get additional info for deleted files
    if (operation === "delete") {
      return modification;
    }

    try {
      const stats = await fs.stat(normalized);

      // Track file size if requested
      if (options.trackSize) {
        modification.size = stats.size;
      }

      // Track file type if requested
      if (options.trackType) {
        if (await isBinaryFile(normalized)) {
          modification.type = "binary";
        } else {
          const mimeType = getMimeType(normalized);
          modification.type = mimeType || "text/plain";
        }
      }

      // Track diff if requested and this is an update
      if (options.trackDiff && operation === "update" && oldContent) {
        // Create temporary file for old content
        const tmpOld = path.join(path.dirname(normalized), `.tmp_old_${Date.now()}`);
        try {
          await fs.writeFile(tmpOld, oldContent);
          const { diff } = await compareFiles(tmpOld, normalized, rootDirectory, {
            contextLines: options.diffContextLines
          });
          modification.diff = diff;
        } finally {
          try {
            await fs.unlink(tmpOld);
          } catch {
            // Ignore cleanup errors
          }
        }
      }

    } catch (error) {
      // If we can't get additional info, just return basic modification info
      return modification;
    }

    return modification;
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Failed to track content modification: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Tracks multiple content modifications in batch
 */
export async function trackContentModifications(
  modifications: { path: string; operation: "create" | "update" | "delete"; oldContent?: string }[],
  rootDirectory: string,
  options: ContentTrackingOptions = {}
): Promise<ContentModification[]> {
  const results: ContentModification[] = [];
  const maxConcurrent = 5;

  // Process modifications in batches to control concurrency
  for (let i = 0; i < modifications.length; i += maxConcurrent) {
    const batch = modifications.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(mod =>
        trackContentModification(
          mod.path,
          mod.operation,
          rootDirectory,
          mod.oldContent,
          options
        )
      )
    );
    results.push(...batchResults);
  }

  return results;
}
