
import fs from "fs/promises"
import { validatePathInProcess, type PathValidationConfig } from "./validation.js"

/**
 * Moves or renames a file/directory from source to destination.
 */
export async function moveFileOp(
  sourcePath: string,
  destPath: string,
  config: PathValidationConfig
): Promise<void> {
  const validSourcePath = await validatePathInProcess(sourcePath, config)
  const validDestPath = await validatePathInProcess(destPath, config)
  await fs.rename(validSourcePath, validDestPath)
}
