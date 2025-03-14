import fs from "fs/promises";
import path from "path";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

/**
 * Options for move operations
 */
export interface MoveOptions {
  overwrite?: boolean;
  createPath?: boolean;
}

/**
 * Moves a file or directory to a new location
 */
export async function moveFile(
  sourcePath: string,
  destPath: string,
  rootDirectory: string,
  options: MoveOptions = {}
): Promise<void> {
  try {
    // Basic path validation for source
    if (!path.isAbsolute(sourcePath)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Source path must be absolute: ${sourcePath}`
      );
    }

    const normalizedSource = path.normalize(sourcePath);

    if (normalizedSource.includes("..")) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Source path cannot contain parent directory references (..): ${normalizedSource}`
      );
    }

    if (!normalizedSource.startsWith(path.normalize(rootDirectory))) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Source path must be within root directory ${rootDirectory}: ${normalizedSource}`
      );
    }

    // Basic path validation for destination
    if (!path.isAbsolute(destPath)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Destination path must be absolute: ${destPath}`
      );
    }

    const normalizedDest = path.normalize(destPath);

    if (normalizedDest.includes("..")) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Destination path cannot contain parent directory references (..): ${normalizedDest}`
      );
    }

    if (!normalizedDest.startsWith(path.normalize(rootDirectory))) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Destination path must be within root directory ${rootDirectory}: ${normalizedDest}`
      );
    }

    // Ensure source exists
    try {
      await fs.access(normalizedSource);
    } catch {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Source path not found: ${normalizedSource}`
      );
    }

    // Check if destination exists
    try {
      await fs.access(normalizedDest);
      if (!options.overwrite) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Destination already exists: ${normalizedDest}`
        );
      }

      // If overwrite is true, remove existing destination
      await fs.rm(normalizedDest, { recursive: true, force: true });
    } catch (error) {
      // Ignore error if destination doesn't exist
      if (error instanceof McpError) {
        throw error;
      }
    }

    // Create destination directory if needed
    if (options.createPath) {
      const destDir = path.dirname(normalizedDest);
      await fs.mkdir(destDir, { recursive: true });
    }

    // Check if moving a directory
    const stats = await fs.stat(normalizedSource);
    if (stats.isDirectory()) {
      // For directories, we need to ensure the parent directory exists
      await fs.mkdir(path.dirname(normalizedDest), { recursive: true });
    }

    try {
      // Attempt atomic move
      await fs.rename(normalizedSource, normalizedDest);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EXDEV") {
        // Cross-device move not supported, fallback to copy + delete
        await copyRecursive(normalizedSource, normalizedDest);
        await fs.rm(normalizedSource, { recursive: true, force: true });
      } else {
        throw error;
      }
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Failed to move file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Recursively copies a file or directory
 */
async function copyRecursive(src: string, dest: string): Promise<void> {
  const stats = await fs.stat(src);

  if (stats.isDirectory()) {
    // Create destination directory
    await fs.mkdir(dest, { recursive: true });

    // Copy all contents
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await copyRecursive(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  } else {
    // Ensure parent directory exists
    await fs.mkdir(path.dirname(dest), { recursive: true });

    // Copy the file
    await fs.copyFile(src, dest);
  }
}
