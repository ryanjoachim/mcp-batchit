import fs from "fs/promises"
import { validatePathWithSymlinks } from "./pathValidation.js"
import { PathOptions } from "../types/filesystem/paths.js"
import { withRecovery } from "../utils/recovery.js"

/**
 * Creates directories, including parent directories if needed
 */
export async function createDirectory(
  dirPath: string | string[],
  config: PathOptions
): Promise<void> {
  return withRecovery(async () => {
    const paths = Array.isArray(dirPath) ? dirPath : [dirPath]

    for (const p of paths) {
      const validResult = await validatePathWithSymlinks(p, config)
      const validPath = validResult.normalizedPath
      await fs.mkdir(validPath, { recursive: true })
    }
  })
}

/**
 * Lists contents of a directory
 */
export async function listDirectory(
  dirPath: string,
  config: PathOptions
): Promise<string> {
  return withRecovery(async () => {
    const validResult = await validatePathWithSymlinks(dirPath, config)
    const validPath = validResult.normalizedPath

    const entries = await fs.readdir(validPath, { withFileTypes: true })

    return entries
      .map(
        (entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`
      )
      .join("\n")
  })
}
