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
 * Safe operation wrapper for validation operations
 * @param operationName - Name of the operation for error context
 * @param operation - Async operation to execute
 * @returns Result of the operation
 * @throws {McpError} with enhanced error context
 */
export async function safeValidationOperation<T>(
  operationName: string,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InvalidParams,
      `Validation operation '${operationName}' failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Validates a path with standardized error handling
 * @param filePath - Path to validate
 * @param config - Validation configuration
 * @returns Validated path string
 * @throws {McpError} with detailed context on validation failure
 */
export async function validatePathWithErrorHandling(
  filePath: string,
  config: PathValidationConfig
): Promise<string> {
  return safeValidationOperation('validatePath', async () => {
    return await validatePathInProcess(filePath, config);
  });
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
  return safeValidationOperation('validatePathInProcess', async () => {
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
  });
}

/**
 * Validates multiple paths against the given configuration with enhanced error handling
 * @param paths - Array of paths to validate
 * @param config - Validation configuration
 * @returns Array of validated paths
 * @throws {McpError} with detailed context if any path validation fails
 */
export async function validateMultiplePaths(
  paths: string[],
  config: PathValidationConfig
): Promise<string[]> {
  return safeValidationOperation('validateMultiplePaths', async () => {
    return await Promise.all(paths.map(async (p) => {
      try {
        return await validatePathWithErrorHandling(p, config);
      } catch (error) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Validation failed for path '${p}' in batch: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }));
  });
}

/**
 * Validates markdown content structure and formatting with enhanced error handling
 * @param content - Markdown content to validate
 * @returns Array of validation messages
 * @throws {McpError} with detailed context on validation failure
 */
export async function validateMarkdown(content: string): Promise<string[]> {
  return safeValidationOperation('validateMarkdown', async () => {
    const processor = unified().use(remarkParse).use(remarkGfm) as Processor

    const result = await processor.process(content)
    const messages = result.messages.map((m: VFileMessage) => m.message)

    // If there are validation messages, format them clearly
    if (messages.length > 0) {
      return messages.map((msg, index) =>
        `${index + 1}. ${msg}`
      );
    }

    return [];
  });
}
