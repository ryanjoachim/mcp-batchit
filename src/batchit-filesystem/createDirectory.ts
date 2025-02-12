
import fs from "fs/promises"
import { validatePathInProcess, type PathValidationConfig } from "./validation.js"

/**
 * Creates a new directory, including parent directories if needed.
 * Succeeds silently if the directory already exists.
 */
export async function createDirectoryOp(
  dirPath: string,
  config: PathValidationConfig
): Promise<void> {
  const validPath = await validatePathInProcess(dirPath, config)
  await fs.mkdir(validPath, { recursive: true })
}
