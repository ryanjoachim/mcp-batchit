import fs from "fs/promises"
import path from "path"
import { minimatch } from "minimatch"
import { validatePathInProcess, type PathValidationConfig } from "./validation.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { eventBus } from "../utils/eventBus.js"
import { metricsCollector } from "../utils/metricsCollector.js"
import { withRecovery } from "../utils/recovery.js"
import { ConnectionManager } from "./connectionManager.js"
import { SearchFilesArgsSchema } from "../schemas/operations.js"
import { performance } from "perf_hooks"

export interface SearchOptions {
  pattern: string
  excludePatterns?: string[]
  useGlob?: boolean
  useRegex?: boolean
  caseSensitive?: boolean
  wholeWord?: boolean
  maxConcurrent?: number
}

export interface SearchResult {
  path: string
  error?: Error
  metrics?: {
    searchTime: number
    validationTime: number
    totalTime: number
  }
}

// Initialize connection manager as singleton
const connectionManager = new ConnectionManager()

/**
 * Recursively searches for files matching a pattern, ignoring any
 * files/dirs that match excludePatterns.
 * Uses connection pooling, metrics collection, and automatic retry with backoff.
 * @throws {McpError} If validation fails or operation encounters an error
 */
export async function searchFilesOp(
  rootPath: string,
  options: SearchOptions,
  config: PathValidationConfig
): Promise<SearchResult[]> {
  const startTime = performance.now()
  const operationId = `search_${Date.now()}`

  // Validate arguments against schema
  const validationResult = SearchFilesArgsSchema.safeParse({
    path: rootPath,
    pattern: options.pattern,
    excludePatterns: options.excludePatterns,
    useGlob: options.useGlob,
    useRegex: options.useRegex,
    caseSensitive: options.caseSensitive,
    wholeWord: options.wholeWord,
    maxConcurrent: options.maxConcurrent
  })

  if (!validationResult.success) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "Invalid arguments for search operation",
      { validation: validationResult.error.flatten() }
    )
  }

  return withRecovery(async () => {
    // Get managed connection for root path
    await connectionManager.getConnection(rootPath)

    const operationContext = {
      operationId,
      rootPath,
      options,
      startTime
    }

    eventBus.emit("searchOperation:start", operationContext)

    const validRootPath = await validatePathInProcess(rootPath, config)
    const results: SearchResult[] = []
    const inProgress = new Set<Promise<void>>()
    const maxConcurrent = options.maxConcurrent || 5
    let totalMatches = 0
    let totalFilesScanned = 0
    let totalDirectoriesScanned = 0

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
      const searchStartTime = performance.now()

      try {
        // Get managed connection for current directory
        await connectionManager.getConnection(currentPath)

        const entries = await fs.readdir(currentPath, { withFileTypes: true })
        totalFilesScanned += entries.filter(entry => entry.isFile()).length
        totalDirectoriesScanned += entries.filter(entry => entry.isDirectory()).length

        metricsCollector.recordMetric("search.directory.files", entries.filter(entry => entry.isFile()).length)
        metricsCollector.recordMetric("search.directory.subdirs", entries.filter(entry => entry.isDirectory()).length)

        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name)

          try {
            const entryStartTime = performance.now()

            // Get managed connection for entry
            await connectionManager.getConnection(fullPath)

            const validationStartTime = performance.now()
            await validatePathInProcess(fullPath, config)
            const validationTime = performance.now() - validationStartTime

            const relativePath = path.relative(validRootPath, fullPath)
            const shouldExclude = (options.excludePatterns || []).some(
              (exPattern) => {
                const globPattern = exPattern.includes("*")
                  ? exPattern
                  : `**/${exPattern}/**`
                return minimatch(relativePath, globPattern, { dot: true })
              }
            )

            if (shouldExclude) {
              metricsCollector.recordMetric("search.excluded.count", 1)
              continue
            }

            if (matchesPattern(entry.name)) {
              totalMatches++
              const totalTime = performance.now() - entryStartTime
              results.push({
                path: fullPath,
                metrics: {
                  searchTime: performance.now() - searchStartTime,
                  validationTime,
                  totalTime
                }
              })

              eventBus.emit("searchOperation:match", {
                ...operationContext,
                matchPath: fullPath,
                relativePath,
                duration: totalTime
              })
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
            const duration = performance.now() - searchStartTime
            const errorContext = {
              ...operationContext,
              currentPath: fullPath,
              error: error instanceof Error ? error.message : String(error),
              errorCode: error instanceof McpError ? error.code : ErrorCode.InternalError,
              duration,
              phase: "entry_processing"
            }

            eventBus.emit("searchOperation:error", errorContext)
            metricsCollector.recordMetric("search.entry.errors", 1)

            await connectionManager.recordError(
              fullPath,
              error instanceof Error ? error : new Error(String(error))
            )

            results.push({
              path: fullPath,
              error: error instanceof Error ? error : new Error(String(error))
            })
            continue
          }
        }
      } catch (error) {
        const duration = performance.now() - searchStartTime
        const errorContext = {
          ...operationContext,
          currentPath,
          error: error instanceof Error ? error.message : String(error),
          errorCode: error instanceof McpError ? error.code : ErrorCode.InternalError,
          duration,
          phase: "directory_processing"
        }

        eventBus.emit("searchOperation:error", errorContext)
        metricsCollector.recordMetric("search.directory.errors", 1)

        await connectionManager.recordError(
          currentPath,
          error instanceof Error ? error : new Error(String(error))
        )

        results.push({
          path: currentPath,
          error: error instanceof Error ? error : new Error(String(error))
        })
      }
    }

    await search(validRootPath)
    // Wait for any remaining searches to complete
    await Promise.all(Array.from(inProgress))

    const totalTime = performance.now() - startTime

    metricsCollector.recordMetric("search.total.time", totalTime)
    metricsCollector.recordMetric("search.total.matches", totalMatches)
    metricsCollector.recordMetric("search.total.files", totalFilesScanned)
    metricsCollector.recordMetric("search.total.directories", totalDirectoriesScanned)

    eventBus.emit("searchOperation:complete", {
      ...operationContext,
      duration: totalTime,
      totalMatches,
      totalFiles: totalFilesScanned,
      totalDirectories: totalDirectoriesScanned,
      resultsCount: results.length
    })

    return results
  })
}
