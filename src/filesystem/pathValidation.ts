/**
 * @fileoverview
 * Path validation utilities for ensuring secure file operations.
 *
 * This module provides functions to validate file paths against security constraints
 * such as directory traversal and root directory containment.
 *
 * Migration Guide:
 * - Replace PathValidationConfig with PathOptions from "../types/filesystem/paths.js"
 * - Use validatePathWithResult for more detailed validation results
 */

import path from "path"
import fs from "fs/promises"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { ErrorManager } from "../utils/errorManager.js"
import { PathOptions, PathValidationResult } from "../types/filesystem/paths.js"

/**
 * Creates a PathValidationResult from path validation information.
 *
 * @param normalizedPath The normalized absolute path
 * @param isDirectory Whether the path points to a directory
 * @param isWithinRoot Whether the path is contained within the root directory
 * @param error Optional error message if validation failed but a result was still returned
 * @returns A PathValidationResult object
 */
function createPathValidationResult(
  normalizedPath: string,
  isDirectory: boolean,
  isWithinRoot: boolean,
  error?: string
): PathValidationResult {
  return {
    normalizedPath,
    isDirectory,
    isWithinRoot,
    ...(error ? { error } : {}),
  }
}

/**
 * Enhanced path validation that returns a result object instead of throwing
 *
 * @param filePath The path to validate
 * @param options Path validation options
 * @returns A PathValidationResult object
 */
export function validatePathWithResult(
  filePath: string,
  options: PathOptions
): PathValidationResult {
  try {
    const { rootDirectory, excludedDirs = [], allowRelative = false } = options

    if (!filePath) {
      throw ErrorManager.createMissingParamError("path", "Path validation")
    }

    if (!rootDirectory) {
      throw ErrorManager.createMissingParamError(
        "rootDirectory",
        "Path validation options"
      )
    }

    // Handle relative paths if allowed
    let absolutePath = filePath
    if (!path.isAbsolute(filePath)) {
      if (allowRelative) {
        absolutePath = path.resolve(rootDirectory, filePath)
      } else {
        throw ErrorManager.createPathValidationError(
          filePath,
          "Path must be absolute"
        )
      }
    }

    const normalized = path.normalize(absolutePath)

    // Check if path contains parent directory references
    if (normalized.includes("..")) {
      throw ErrorManager.createPathValidationError(
        normalized,
        "Path cannot contain parent directory references (..)"
      )
    }

    // Check if path is within root directory
    const normalizedRoot = path.normalize(rootDirectory)
    const isWithinRoot = normalized.startsWith(normalizedRoot)
    if (!isWithinRoot) {
      throw ErrorManager.createPathValidationError(
        normalized,
        `Must be within root directory ${rootDirectory}`
      )
    }

    // Check for excluded directories
    if (
      excludedDirs.some((dir) => normalized.startsWith(path.normalize(dir)))
    ) {
      throw ErrorManager.createPermissionError(
        "access",
        `${normalized} (in excluded directory)`
      )
    }

    // Check if path is a directory (ends with separator or is exactly the root directory)
    const isDirectory =
      normalized.endsWith(path.sep) || normalized === normalizedRoot

    return createPathValidationResult(normalized, isDirectory, isWithinRoot)
  } catch (error) {
    if (error instanceof McpError && error.code === ErrorCode.InvalidParams) {
      // For path outside root directory
      if (error.message.includes("Must be within root directory")) {
        return createPathValidationResult(
          path.normalize(filePath),
          false,
          false,
          error.message
        )
      }
    }

    // Re-throw other errors
    throw error
  }
}

/**
 * Async path validation that includes symlink resolution.
 * Wraps validatePathWithResult and adds fs.realpath checks.
 * Call this after validatePathWithResult for full security.
 *
 * @param filePath The path to validate
 * @param options Path validation options
 * @returns A PathValidationResult object
 */
export async function validatePathWithSymlinks(
  filePath: string,
  options: PathOptions
): Promise<PathValidationResult> {
  const result = validatePathWithResult(filePath, options)

  // If basic validation already failed, return early
  if (!result.isWithinRoot) {
    return result
  }

  // Skip symlink resolution if disabled
  if (options.resolveSymlinks === false) {
    return result
  }

  const normalizedRoot = path.normalize(options.rootDirectory)

  try {
    const realRoot = await fs.realpath(normalizedRoot)
    try {
      const realPath = await fs.realpath(result.normalizedPath)
      if (!realPath.startsWith(realRoot)) {
        throw ErrorManager.createPathValidationError(
          result.normalizedPath,
          "Resolved path escapes root directory (possible symlink)"
        )
      }
    } catch (realpathError) {
      // If the path doesn't exist yet (ENOENT), resolve the parent instead
      if (
        realpathError instanceof Error &&
        (realpathError as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        const parentDir = path.dirname(result.normalizedPath)
        try {
          const realParent = await fs.realpath(parentDir)
          if (!realParent.startsWith(realRoot)) {
            throw ErrorManager.createPathValidationError(
              result.normalizedPath,
              "Resolved parent path escapes root directory (possible symlink)"
            )
          }
        } catch {
          // Parent doesn't exist either, skip symlink check
        }
      }
      // Other errors (e.g., permissions) are not symlink issues, skip
    }
  } catch (error) {
    if (error instanceof McpError) throw error
    // If realpath on root fails, skip symlink resolution
  }

  return result
}
