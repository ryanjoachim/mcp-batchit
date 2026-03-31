import fs from "fs/promises"
import path from "path"
import { minimatch } from "minimatch"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"

/**
 * Options for file search operations
 */
export interface SearchOptions {
  pattern: string
  excludePatterns?: string[]
  useGlob?: boolean
  useRegex?: boolean
  caseSensitive?: boolean
  wholeWord?: boolean
  maxConcurrent?: number
  includeContent?: boolean
  maxContentPreview?: number
}

/**
 * Represents a search match with file information and optional content preview
 */
export interface SearchMatch {
  path: string
  type: "file" | "directory"
  size?: number
  lastModified?: string
  contentMatches?: {
    line: number
    content: string
    previewBefore?: string
    previewAfter?: string
  }[]
  error?: string
}

/**
 * Searches for files and their contents based on various criteria
 */
export async function searchFiles(
  rootPath: string,
  options: SearchOptions,
  basePath: string
): Promise<SearchMatch[]> {
  try {
    // Basic path validation
    if (!path.isAbsolute(rootPath)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Path must be absolute: ${rootPath}`
      )
    }

    const normalized = path.normalize(rootPath)

    if (normalized.includes("..")) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Path cannot contain parent directory references (..): ${normalized}`
      )
    }

    if (!normalized.startsWith(path.normalize(basePath))) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Path must be within root directory ${basePath}: ${normalized}`
      )
    }

    const opts = {
      pattern: options.pattern,
      excludePatterns: options.excludePatterns || [],
      useGlob: options.useGlob || false,
      useRegex: options.useRegex || false,
      caseSensitive: options.caseSensitive || false,
      wholeWord: options.wholeWord || false,
      maxConcurrent: options.maxConcurrent || 5,
      includeContent: options.includeContent || false,
      maxContentPreview: options.maxContentPreview || 100,
    }

    const results: SearchMatch[] = []
    const processedPaths = new Set<string>()

    // Function to check if a path should be excluded
    function isExcluded(filePath: string): boolean {
      return opts.excludePatterns.some((pattern) => {
        const globPattern = pattern.includes("*") ? pattern : `**/${pattern}/**`
        return minimatch(filePath, globPattern, { dot: true })
      })
    }

    // Function to check if content matches the pattern
    function getContentMatches(content: string): SearchMatch["contentMatches"] {
      const matches: SearchMatch["contentMatches"] = []
      const lines = content.split("\n")

      let pattern: RegExp
      if (opts.useRegex) {
        const flags = opts.caseSensitive ? "" : "i"
        pattern = new RegExp(opts.pattern, flags)
      } else {
        const escapedPattern = opts.pattern.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )
        const flags = opts.caseSensitive ? "" : "i"
        pattern = opts.wholeWord
          ? new RegExp(`\\b${escapedPattern}\\b`, flags)
          : new RegExp(escapedPattern, flags)
      }

      lines.forEach((line, index) => {
        if (pattern.test(line)) {
          const match = {
            line: index + 1,
            content: line,
            previewBefore: undefined as string | undefined,
            previewAfter: undefined as string | undefined,
          }

          // Add context before and after the match if available
          const contextSize = 2
          if (index > 0) {
            match.previewBefore = lines
              .slice(Math.max(0, index - contextSize), index)
              .join("\n")
          }
          if (index < lines.length - 1) {
            match.previewAfter = lines
              .slice(index + 1, Math.min(lines.length, index + 1 + contextSize))
              .join("\n")
          }

          matches.push(match)
        }
      })

      return matches.length > 0 ? matches : undefined
    }

    // Function to check if a name matches the pattern
    function matchesPattern(name: string): boolean {
      if (opts.useGlob) {
        return minimatch(name, opts.pattern, {
          nocase: !opts.caseSensitive,
        })
      }

      if (opts.useRegex) {
        const flags = opts.caseSensitive ? "" : "i"
        const regex = new RegExp(opts.pattern, flags)
        return regex.test(name)
      }

      if (opts.wholeWord) {
        const regex = opts.caseSensitive
          ? new RegExp(`\\b${opts.pattern}\\b`)
          : new RegExp(`\\b${opts.pattern}\\b`, "i")
        return regex.test(name)
      }

      return opts.caseSensitive
        ? name.includes(opts.pattern)
        : name.toLowerCase().includes(opts.pattern.toLowerCase())
    }

    // Recursive search function
    async function search(currentPath: string): Promise<void> {
      // Prevent processing the same path twice (handles symlinks)
      if (processedPaths.has(currentPath)) {
        return
      }
      processedPaths.add(currentPath)

      let stats
      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true })
        stats = await fs.stat(currentPath)

        // Process entries in batches to control concurrency
        for (let i = 0; i < entries.length; i += opts.maxConcurrent) {
          const batch = entries.slice(i, i + opts.maxConcurrent)
          await Promise.all(
            batch.map(async (entry) => {
              const fullPath = path.join(currentPath, entry.name)
              const relativePath = path.relative(normalized, fullPath)

              if (isExcluded(relativePath)) {
                return
              }

              try {
                const entryStats = await fs.stat(fullPath)

                if (matchesPattern(entry.name)) {
                  const match: SearchMatch = {
                    path: fullPath,
                    type: entry.isDirectory() ? "directory" : "file",
                    size: entryStats.size,
                    lastModified: entryStats.mtime.toISOString(),
                  }

                  if (opts.includeContent && entry.isFile()) {
                    try {
                      const content = await fs.readFile(fullPath, "utf-8")
                      match.contentMatches = getContentMatches(content)
                    } catch (error) {
                      match.error = `Failed to read file content: ${
                        error instanceof Error ? error.message : String(error)
                      }`
                    }
                  }

                  results.push(match)
                } else if (opts.includeContent && entry.isFile()) {
                  // Check file content even if name doesn't match
                  try {
                    const content = await fs.readFile(fullPath, "utf-8")
                    const contentMatches = getContentMatches(content)
                    if (contentMatches) {
                      results.push({
                        path: fullPath,
                        type: "file",
                        size: entryStats.size,
                        lastModified: entryStats.mtime.toISOString(),
                        contentMatches,
                      })
                    }
                  } catch (error) {
                    // Silently skip content search errors for files that don't match by name
                  }
                }

                if (entry.isDirectory()) {
                  await search(fullPath)
                }
              } catch (error) {
                results.push({
                  path: fullPath,
                  type: entry.isDirectory() ? "directory" : "file",
                  error: error instanceof Error ? error.message : String(error),
                })
              }
            })
          )
        }
      } catch (error) {
        results.push({
          path: currentPath,
          type: stats?.isDirectory() ? "directory" : "file",
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    await search(normalized)

    // Sort results: directories first, then files, both alphabetically
    results.sort((a, b) => {
      if (a.type === b.type) {
        return a.path.localeCompare(b.path)
      }
      return a.type === "directory" ? -1 : 1
    })

    return results
  } catch (error) {
    if (error instanceof McpError) {
      throw error
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Failed to search files: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
