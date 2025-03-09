import path from "path";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

export interface PathValidationConfig {
  rootDirectory: string;
  excludedDirs?: string[];
}

/**
 * Validates a path is absolute, within root directory, and not in excluded directories
 */
export function validatePath(
  filePath: string,
  config: PathValidationConfig
): string {
  const { rootDirectory, excludedDirs = [] } = config;

  if (!path.isAbsolute(filePath)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Path must be absolute: ${filePath}`
    );
  }

  const normalized = path.normalize(filePath);

  // Check if path contains parent directory references
  if (normalized.includes("..")) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Path cannot contain parent directory references (..): ${normalized}`
    );
  }

  // Check if path is within root directory
  if (!normalized.startsWith(path.normalize(rootDirectory))) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Path must be within root directory ${rootDirectory}: ${normalized}`
    );
  }

  // Check for excluded directories
  if (excludedDirs.some(dir => normalized.startsWith(path.normalize(dir)))) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Access denied - path in excluded directory: ${normalized}`
    );
  }

  return normalized;
}
