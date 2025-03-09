import fs from "fs/promises";
import { validatePath, PathValidationConfig } from "./pathValidation.js";
import { withRecovery } from "../utils/recovery.js";

/**
 * Creates directories, including parent directories if needed
 */
export async function createDirectory(
  dirPath: string | string[],
  config: PathValidationConfig
): Promise<void> {
  return withRecovery(async () => {
    const paths = Array.isArray(dirPath) ? dirPath : [dirPath];

    for (const p of paths) {
      const validPath = validatePath(p, config);
      await fs.mkdir(validPath, { recursive: true });
    }
  });
}

/**
 * Lists contents of a directory
 */
export async function listDirectory(
  dirPath: string,
  config: PathValidationConfig
): Promise<string> {
  return withRecovery(async () => {
    const validPath = validatePath(dirPath, config);

    const entries = await fs.readdir(validPath, { withFileTypes: true });

    return entries
      .map(entry => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
      .join("\n");
  });
}
