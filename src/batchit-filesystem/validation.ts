
import path from "path"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import type { VFileMessage } from "vfile-message"
import type { Processor } from "unified"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { validatePath } from "../utils/pathUtils.js"

/**
 * Configuration for path validation including root directory and optional exclusions
 */
export interface PathValidationConfig {
  rootDirectory: string
  excludedDirs?: string[]
  bypassRootCheck?: boolean
}

/**
 * Enforces that the given file path is within the rootDirectory and not in any excluded directories,
 * then handles symlinks (ensuring they also resolve within allowed paths).
 * Returns the absolute, validated path or throws an error if disallowed.
 */
export async function validatePathInProcess(
  filePath: string,
  config: PathValidationConfig
): Promise<string> {
  const { rootDirectory, excludedDirs = [] } = config

  // Use the centralized path validation
  const validated = await validatePath(filePath, {
    requireAbsolute: true,
    rootDirectory,
    checkSymlinks: true,
    bypassRootCheck: config.bypassRootCheck
  })

  // Additional check for excluded directories
  if (excludedDirs.some(dir =>
    validated.normalized.startsWith(path.normalize(dir))
  )) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Access denied - path in excluded directory: ${validated.normalized}`
    )
  }

  return validated.normalized
}

/**
 * Validates multiple paths against the given configuration
 */
export async function validateMultiplePaths(
  paths: string[],
  config: PathValidationConfig
): Promise<string[]> {
  return Promise.all(paths.map(p => validatePathInProcess(p, config)))
}

/**
 * Validates markdown content structure and formatting
 */
export async function validateMarkdown(content: string): Promise<string[]> {
  try {
    const processor = unified().use(remarkParse).use(remarkGfm) as Processor

    const result = await processor.process(content)
    return result.messages.map((m: VFileMessage) => m.message)
  } catch (error) {
    return [(error as Error).message]
  }
}
