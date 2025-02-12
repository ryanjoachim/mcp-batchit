
import fs from "fs/promises"
import path from "path"
import { minimatch } from "minimatch"
import { validatePathInProcess, type PathValidationConfig } from "./validation.js"

/**
 * Recursively searches for files matching a pattern, ignoring any
 * files/dirs that match excludePatterns.
 */
export async function searchFilesOp(
  rootPath: string,
  pattern: string,
  excludePatterns: string[],
  config: PathValidationConfig
): Promise<string[]> {
  const validRootPath = await validatePathInProcess(rootPath, config)
  const results: string[] = []

  async function search(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name)

      try {
        // Validate each path in the chain
        await validatePathInProcess(fullPath, config)

        const relativePath = path.relative(validRootPath, fullPath)
        // If exclude pattern matches, skip it
        const shouldExclude = excludePatterns.some((exPattern) => {
          const globPattern = exPattern.includes("*")
            ? exPattern
            : `**/${exPattern}/**`
          return minimatch(relativePath, globPattern, { dot: true })
        })
        if (shouldExclude) {
          continue
        }

        if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
          results.push(fullPath)
        }
        if (entry.isDirectory()) {
          await search(fullPath)
        }
      } catch {
        // Skip invalid paths
        continue
      }
    }
  }

  await search(validRootPath)
  return results
}
