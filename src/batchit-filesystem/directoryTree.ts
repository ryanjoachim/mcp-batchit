
import fs from "fs/promises"
import path from "path"
import { validatePathInProcess, type PathValidationConfig } from "./validation.js"

interface TreeEntry {
  name: string
  type: "file" | "directory"
  children?: TreeEntry[]
}

async function buildTree(
  currentPath: string,
  config: PathValidationConfig
): Promise<TreeEntry[]> {
  const validPath = await validatePathInProcess(currentPath, config)
  const entries = await fs.readdir(validPath, { withFileTypes: true })
  const result: TreeEntry[] = []

  for (const entry of entries) {
    const entryData: TreeEntry = {
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
    }

    if (entry.isDirectory()) {
      const subPath = path.join(currentPath, entry.name)
      entryData.children = await buildTree(subPath, config)
    }
    result.push(entryData)
  }
  return result
}

/**
 * Builds a recursive tree view of a directory and returns it as JSON.
 */
export async function directoryTreeOp(
  dirPath: string,
  config: PathValidationConfig
): Promise<string> {
  const treeData = await buildTree(dirPath, config)
  return JSON.stringify(treeData, null, 2)
}
