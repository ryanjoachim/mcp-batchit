import fs from "fs/promises";
import { validatePath, PathValidationConfig } from "./pathValidation.js";
import { applyLineDiff, LineDiffOperation } from "./lineDiff.js";
import { trackContentModification } from "./contentTracking.js";
import { ContentTrackingOptions } from "../types/operations.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { withRecovery } from "../utils/recovery.js";

/**
 * Normalizes line endings from CRLF to LF
 */
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export type ContentOperation =
  | { mode: "overwrite"; content: string; trackOptions?: ContentTrackingOptions }
  | { mode: "append"; content: string; trackOptions?: ContentTrackingOptions }
  | { mode: "diff"; operations: LineDiffOperation[]; trackOptions?: ContentTrackingOptions };

/**
 * Unified interface for different file content manipulation modes
 */
export async function updateFileContent(
  filePath: string,
  operation: ContentOperation,
  config: PathValidationConfig
): Promise<string> {
  return withRecovery(async () => {
    const validPath = validatePath(filePath, config);
    const rootDirectory = config.rootDirectory;

    // Read existing content
    let existingContent: string;
    let hadExistingContent = true;
    try {
      existingContent = normalizeLineEndings(await fs.readFile(validPath, "utf-8"));
    } catch (error) {
      if ((error as any).code === "ENOENT") {
      hadExistingContent = false;
      // File doesn't exist, but that's ok for overwrite mode
      if (operation.mode === "overwrite") {
        existingContent = "";
      } else {
        throw new McpError(
          ErrorCode.InvalidParams,
          `File not found: ${validPath}`
        );
      }
      } else {
        throw error;
      }
    }

    // Apply operation based on mode
    let newContent: string;

    switch (operation.mode) {
      case "overwrite":
        newContent = operation.content;
        break;

      case "append":
        newContent = existingContent + "\n" + operation.content;
        break;

      case "diff":
        newContent = applyLineDiff(existingContent, operation.operations);
        break;

    }

    // Write updated content
    await fs.writeFile(validPath, newContent, "utf-8");

    // Track content modification if options provided
    if (operation.trackOptions?.enabled) {
      const modificationResult = await trackContentModification(
        validPath,
        hadExistingContent ? "update" : "create",
        rootDirectory,
        hadExistingContent ? existingContent : undefined,
        operation.trackOptions
      );

      const summary = `File ${filePath} ${hadExistingContent ? "updated" : "created"} using ${operation.mode} mode`;
      if (modificationResult.diff) {
        return `${summary}\n\nChanges:\n${modificationResult.diff}`;
      }
      return summary;
    }

    // Return simple diff summary if tracking not enabled
    return `File ${filePath} ${hadExistingContent ? "updated" : "created"} using ${operation.mode} mode`;
  });
}
