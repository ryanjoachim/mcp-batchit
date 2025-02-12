
import fs from "fs/promises"
import { validatePathInProcess, type PathValidationConfig } from "./validation.js"

/**
 * Retrieves detailed file or directory metadata.
 */
export async function getFileInfoOp(
  filePath: string,
  config: PathValidationConfig
): Promise<string> {
  const validPath = await validatePathInProcess(filePath, config)
  const stats = await fs.stat(validPath)

  const info = {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    permissions: stats.mode.toString(8).slice(-3),
  }

  return Object.entries(info)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")
}
