import fs from "fs/promises"
import path from "path"
import { ErrorManager } from "../utils/errorManager.js"
import { getMimeType } from "./fileTypeHandlers.js"
import { validatePathWithSymlinks } from "./pathValidation.js"
import { PathOptions } from "../types/filesystem/paths.js"

/**
 * Represents detailed information about a file or directory
 */
export interface FileInfo {
  size: number
  created: string
  modified: string
  accessed: string
  isDirectory: boolean
  isFile: boolean
  permissions: string
  isSymlink?: boolean
  mimeType?: string
}

/**
 * Gets detailed information about a file or directory
 */
export async function getFileInfo(
  filePath: string,
  config: PathOptions
): Promise<FileInfo> {
  try {
    const validResult = await validatePathWithSymlinks(filePath, config)
    const normalized = validResult.normalizedPath

    // Ensure path exists
    try {
      await fs.access(normalized)
    } catch {
      throw ErrorManager.createNotFoundError("File or directory", normalized)
    }

    // Get file/directory stats
    const stats = await fs.stat(normalized)
    const lstat = await fs.lstat(normalized)

    const info: FileInfo = {
      size: stats.size,
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      accessed: stats.atime.toISOString(),
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      permissions: stats.mode.toString(8).slice(-3),
      isSymlink: lstat.isSymbolicLink(),
    }

    // Add MIME type for files
    if (info.isFile) {
      const mimeType = getMimeType(normalized)
      if (mimeType) {
        info.mimeType = mimeType
      }
    }

    return info
  } catch (error) {
    throw ErrorManager.normalizeError(
      error,
      `Failed to get file info for ${path.basename(filePath)}`
    )
  }
}
