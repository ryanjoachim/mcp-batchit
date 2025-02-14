import fs from "fs/promises"
import path from "path"
import { minimatch } from "minimatch"
import {
  validatePathInProcess,
  type PathValidationConfig,
} from "./validation.js"

export interface SearchOptions {
  pattern: string
  excludePatterns?: string[]
  useGlob?: boolean
  useRegex?: boolean
  caseSensitive?: boolean
  wholeWord?: boolean
  maxConcurrent?: number
  onError?: (error: Error, path: string) => void
}

export interface SearchResult {
  path: string
  error?: Error
}

/**
 * Recursively searches for files matching a pattern, ignoring any
 * files/dirs that match excludePatterns.
 */
export async function searchFilesOp(
  rootPath: string,
  options: SearchOptions,
  config: PathValidationConfig
): Promise<SearchResult[]> {
  const validRootPath = await validatePathInProcess(rootPath, config)
  const results: SearchResult[] = []
  const inProgress = new Set<Promise<void>>()
  const maxConcurrent = options.maxConcurrent || 5

  function matchesPattern(name: string): boolean {
    if (options.useGlob) {
      return minimatch(name, options.pattern, {
        nocase: !options.caseSensitive,
      })
    }
    if (options.useRegex) {
      const flags = options.caseSensitive ? "" : "i"
      const regex = new RegExp(options.pattern, flags)
      return regex.test(name)
    }
    if (options.wholeWord) {
      const regex = options.caseSensitive
        ? new RegExp(`\\b${options.pattern}\\b`)
        : new RegExp(`\\b${options.pattern}\\b`, "i")
      return regex.test(name)
    }
    return options.caseSensitive
      ? name.includes(options.pattern)
      : name.toLowerCase().includes(options.pattern.toLowerCase())
  }

  async function search(currentPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name)

        try {
          await validatePathInProcess(fullPath, config)

          const relativePath = path.relative(validRootPath, fullPath)
          const shouldExclude = (options.excludePatterns || []).some(
            (exPattern) => {
              const globPattern = exPattern.includes("*")
                ? exPattern
                : `**/${exPattern}/**`
              return minimatch(relativePath, globPattern, { dot: true })
            }
          )

          if (shouldExclude) continue

          if (matchesPattern(entry.name)) {
            results.push({ path: fullPath })
          }

          if (entry.isDirectory()) {
            // Manage concurrency
            while (inProgress.size >= maxConcurrent) {
              await Promise.race(Array.from(inProgress))
            }

            const searchPromise = search(fullPath)
            inProgress.add(searchPromise)
            searchPromise.finally(() => inProgress.delete(searchPromise))
          }
        } catch (error) {
          const searchError =
            error instanceof Error ? error : new Error(String(error))
          results.push({ path: fullPath, error: searchError })
          options.onError?.(searchError, fullPath)
          continue
        }
      }
    } catch (error) {
      const searchError =
        error instanceof Error ? error : new Error(String(error))
      results.push({ path: currentPath, error: searchError })
      options.onError?.(searchError, currentPath)
    }
  }

  await search(validRootPath)
  // Wait for any remaining searches to complete
  await Promise.all(Array.from(inProgress))

  return results
}
