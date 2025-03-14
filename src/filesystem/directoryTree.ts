import fs from "fs/promises";
import path from "path";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

/**
 * Represents a file or directory entry in the tree
 */
interface TreeEntry {
  name: string;
  type: "file" | "directory";
  children?: TreeEntry[];
  size?: number;
  lastModified?: string;
}

/**
 * Recursively builds a tree structure for a directory
 */
async function buildTree(
  currentPath: string,
  rootDirectory: string
): Promise<TreeEntry[]> {
  try {
    // Basic path validation
    if (!path.isAbsolute(currentPath)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Path must be absolute: ${currentPath}`
      );
    }

    const normalized = path.normalize(currentPath);

    if (normalized.includes("..")) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Path cannot contain parent directory references (..): ${normalized}`
      );
    }

    if (!normalized.startsWith(path.normalize(rootDirectory))) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Path must be within root directory ${rootDirectory}: ${normalized}`
      );
    }

    const entries = await fs.readdir(normalized, { withFileTypes: true });
    const result: TreeEntry[] = [];

    for (const entry of entries) {
      const entryPath = path.join(normalized, entry.name);
      const stats = await fs.stat(entryPath);

      const treeEntry: TreeEntry = {
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
        size: stats.size,
        lastModified: stats.mtime.toISOString()
      };

      if (entry.isDirectory()) {
        treeEntry.children = await buildTree(entryPath, rootDirectory);
      }

      result.push(treeEntry);
    }

    // Sort entries: directories first, then files, both alphabetically
    result.sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name);
      }
      return a.type === "directory" ? -1 : 1;
    });

    return result;
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Failed to build directory tree: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Generates a directory tree structure with file metadata
 */
export async function directoryTree(
  dirPath: string,
  rootDirectory: string,
  format: "json" | "text" = "json"
): Promise<string> {
  try {
    const tree = await buildTree(dirPath, rootDirectory);

    if (format === "text") {
      // Generate text representation
      const formatTree = (entries: TreeEntry[], prefix = ""): string => {
        let result = "";
        const len = entries.length;

        entries.forEach((entry, index) => {
          const isLast = index === len - 1;
          const connector = isLast ? "└── " : "├── ";
          const childPrefix = isLast ? "    " : "│   ";

          result += prefix + connector + entry.name;
          if (entry.type === "file") {
            const size = entry.size ? ` (${formatSize(entry.size)})` : "";
            result += size;
          }
          result += "\n";

          if (entry.children) {
            result += formatTree(entry.children, prefix + childPrefix);
          }
        });

        return result;
      };

      return formatTree(tree);
    }

    // Return JSON representation
    return JSON.stringify(tree, null, 2);
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Failed to generate directory tree: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Formats file size in human-readable format
 */
function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
