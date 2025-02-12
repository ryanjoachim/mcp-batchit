import fs from "fs/promises"
import { validatePathInProcess, type PathValidationConfig } from "./validation.js"

/**
 * Creates one or more directories, including parent directories if needed.
 * Continues creating directories if some fail, then reports all errors together.
 */
export async function createDirectoryOp(
  paths: string | string[],
  config: PathValidationConfig
): Promise<void> {
  const pathsToCreate = Array.isArray(paths) ? paths : [paths]
  const errors: string[] = []

  for (const path of pathsToCreate) {
    try {
      const validPath = await validatePathInProcess(path, config)
      await fs.mkdir(validPath, { recursive: true })
    } catch (error) {
      errors.push(`Failed to create directory '${path}': ${(error as Error).message}`)
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }
}
