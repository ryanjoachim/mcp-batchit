
import fs from "fs/promises"
import path from "path"
import { validatePathInProcess, type PathValidationConfig } from "./validation.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { eventBus } from "../utils/eventBus.js"
import { metricsCollector } from "../utils/metricsCollector.js"
import { withRecovery } from "../utils/recovery.js"
import { ConnectionManager } from "./connectionManager.js"
import { DirectoryTreeArgsSchema } from "../schemas/operations.js"
import { performance } from "perf_hooks"

// Initialize connection manager as singleton
const connectionManager = new ConnectionManager()

interface TreeEntry {
  name: string
  type: "file" | "directory"
  children?: TreeEntry[]
  size?: number
  lastModified?: Date
}

interface TreeMetrics {
  fileCount: number
  directoryCount: number
  maxDepth: number
  scanTime: number
  totalTime: number
}

interface TreeResult {
  tree: TreeEntry[]
  metrics: TreeMetrics
}

/**
 * Recursively builds a tree of the directory contents.
 * Tracks metrics and manages connections for each subdirectory.
 */
async function buildTree(
  currentPath: string,
  config: PathValidationConfig,
  depth: number = 0,
  parentContext: { operationId: string, startTime: number }
): Promise<TreeResult> {
  // Get managed connection for current directory
  await connectionManager.getConnection(currentPath)

  const scanStartTime = performance.now()
  const validPath = await validatePathInProcess(currentPath, config)
  const entries = await fs.readdir(validPath, { withFileTypes: true })

  let fileCount = 0
  let directoryCount = 0
  let maxDepth = depth
  const result: TreeEntry[] = []

  eventBus.emit("directoryTree:scanDirectory", {
    ...parentContext,
    currentPath,
    depth,
    entryCount: entries.length
  })

  for (const entry of entries) {
    const entryPath = path.join(currentPath, entry.name)
    const stats = await fs.stat(entryPath)

    const entryData: TreeEntry = {
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
      size: stats.size,
      lastModified: stats.mtime
    }

    if (entry.isDirectory()) {
      directoryCount++
      const subTreeResult = await buildTree(entryPath, config, depth + 1, parentContext)
      entryData.children = subTreeResult.tree
      fileCount += subTreeResult.metrics.fileCount
      directoryCount += subTreeResult.metrics.directoryCount
      maxDepth = Math.max(maxDepth, subTreeResult.metrics.maxDepth)
    } else {
      fileCount++
    }

    result.push(entryData)
  }

  const scanTime = performance.now() - scanStartTime
  metricsCollector.recordMetric("directoryTree.scanDirectory.time", scanTime)
  metricsCollector.recordMetric("directoryTree.directory.files", fileCount)
  metricsCollector.recordMetric("directoryTree.directory.subdirs", directoryCount)
  metricsCollector.recordMetric("directoryTree.directory.depth", depth)

  return {
    tree: result,
    metrics: {
      fileCount,
      directoryCount,
      maxDepth,
      scanTime,
      totalTime: performance.now() - parentContext.startTime
    }
  }
}

/**
 * Builds a recursive tree view of a directory and returns it as JSON.
 * Uses connection pooling, metrics collection, and automatic retry with backoff.
 * @throws {McpError} If validation fails or operation encounters an error
 */
export async function directoryTreeOp(
  dirPath: string,
  config: PathValidationConfig
): Promise<string> {
  const startTime = performance.now()
  const operationId = `dirTree_${Date.now()}`

  // Validate arguments against schema
  const validationResult = DirectoryTreeArgsSchema.safeParse({
    path: dirPath
  })

  if (!validationResult.success) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "Invalid arguments for directory tree operation",
      { validation: validationResult.error.flatten() }
    )
  }

  return withRecovery(async () => {
    const operationContext = {
      operationId,
      dirPath,
      startTime
    }

    eventBus.emit("directoryTree:start", operationContext)

    try {
      const treeResult = await buildTree(dirPath, config, 0, { operationId, startTime })

      const totalTime = performance.now() - startTime
      metricsCollector.recordMetric("directoryTree.total.time", totalTime)
      metricsCollector.recordMetric("directoryTree.total.files", treeResult.metrics.fileCount)
      metricsCollector.recordMetric("directoryTree.total.directories", treeResult.metrics.directoryCount)
      metricsCollector.recordMetric("directoryTree.max.depth", treeResult.metrics.maxDepth)

      eventBus.emit("directoryTree:complete", {
        ...operationContext,
        metrics: treeResult.metrics,
        duration: totalTime
      })

      return JSON.stringify(treeResult.tree, null, 2)
    } catch (error) {
      const duration = performance.now() - startTime
      const errorContext = {
        ...operationContext,
        error: error instanceof Error ? error.message : String(error),
        errorCode: error instanceof McpError ? error.code : ErrorCode.InternalError,
        duration,
        phase: "execution"
      }

      eventBus.emit("directoryTree:error", errorContext)
      metricsCollector.recordMetric("directoryTree.errors", 1)
      metricsCollector.recordMetric("directoryTree.error.duration", duration)

      await connectionManager.recordError(
        dirPath,
        error instanceof Error ? error : new Error(String(error))
      )

      // Propagate McpError with additional context or create new one
      throw error instanceof McpError
        ? new McpError(error.code, error.message, { ...errorContext, originalError: error })
        : new McpError(
            ErrorCode.InternalError,
            `Failed to build directory tree: ${error instanceof Error ? error.message : String(error)}`,
            errorContext
          )
    }
  })
}
