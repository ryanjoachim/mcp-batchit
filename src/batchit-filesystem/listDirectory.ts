
import fs from "fs/promises"
import { validatePathInProcess, type PathValidationConfig } from "./validation.js"

/**
 * Lists a directory's contents with [DIR] or [FILE] prefixes.
 */
export async function listDirectoryOp(
  dirPath: string,
  config: PathValidationConfig
): Promise<string> {
  const validPath = await validatePathInProcess(dirPath, config)
  const entries = await fs.readdir(validPath, { withFileTypes: true })
  return entries
    .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
    .join("\n")
}
