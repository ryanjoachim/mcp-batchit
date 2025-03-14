import fs from "fs/promises";
import path from "path";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { getMimeType } from "./fileTypeHandlers.js";

/**
 * Represents detailed information about a file or directory
 */
export interface FileInfo {
  size: number;
  created: string;
  modified: string;
  accessed: string;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
  isSymlink?: boolean;
  mimeType?: string;
}

/**
 * Gets detailed information about a file or directory
 */
export async function getFileInfo(
  filePath: string,
  rootDirectory: string
): Promise<FileInfo> {
  try {
    // Basic path validation
    if (!path.isAbsolute(filePath)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Path must be absolute: ${filePath}`
      );
    }

    const normalized = path.normalize(filePath);

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

    // Ensure path exists
    try {
      await fs.access(normalized);
    } catch {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Path not found: ${normalized}`
      );
    }

    // Get file/directory stats
    const stats = await fs.stat(normalized);
    const lstat = await fs.lstat(normalized);

    const info: FileInfo = {
      size: stats.size,
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      accessed: stats.atime.toISOString(),
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      permissions: stats.mode.toString(8).slice(-3),
      isSymlink: lstat.isSymbolicLink()
    };

    // Add MIME type for files
    if (info.isFile) {
      const mimeType = getMimeType(normalized);
      if (mimeType) {
        info.mimeType = mimeType;
      }
    }

    return info;
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Failed to get file info: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
