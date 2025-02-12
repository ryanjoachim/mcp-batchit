
import fs from "fs/promises"
import { validatePathInProcess, type PathValidationConfig } from "./validation.js"

/**
 * Creates a new file or overwrites an existing file with new content.
 */
export async function writeFileOp(
  filePath: string,
  content: string,
  config: PathValidationConfig
): Promise<void> {
  const validPath = await validatePathInProcess(filePath, config)
  await fs.writeFile(validPath, content, "utf-8")
}
