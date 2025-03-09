import fs from "fs/promises";
import { validatePath, PathValidationConfig } from "./pathValidation.js";
import { applyLineDiff, LineDiffOperation } from "./lineDiff.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { withRecovery } from "../utils/recovery.js";

/**
 * Normalizes line endings from CRLF to LF
 */
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export type ContentOperation =
  | { mode: "overwrite"; content: string }
  | { mode: "append"; content: string }
  | { mode: "diff"; operations: LineDiffOperation[] }
  | { mode: "edit"; patterns: Array<{ oldText: string; newText: string }> };

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

    // Read existing content
    let existingContent: string;
    try {
      existingContent = normalizeLineEndings(await fs.readFile(validPath, "utf-8"));
    } catch (error) {
      if ((error as any).code === "ENOENT") {
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

      case "edit":
        newContent = existingContent;
        for (const pattern of operation.patterns) {
          const normalizedOld = normalizeLineEndings(pattern.oldText);
          const normalizedNew = normalizeLineEndings(pattern.newText);

          // Try exact match first
          if (newContent.includes(normalizedOld)) {
            newContent = newContent.replace(normalizedOld, normalizedNew);
            continue;
          }

          // Attempt line-by-line matching for fuzzy replacement
          const oldLines = normalizedOld.split("\n");
          const contentLines = newContent.split("\n");
          let matchFound = false;

          for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
            const potentialMatch = contentLines.slice(i, i + oldLines.length);

            // Check if all lines match ignoring whitespace
            const isMatch = oldLines.every((oldLine, j) => {
              const contentLine = potentialMatch[j];
              return oldLine.trim() === contentLine.trim();
            });

            if (isMatch) {
              // Preserve indentation of first line
              const firstLineIndent = contentLines[i].match(/^\s*/)?.[0] || "";
              const newLines = normalizedNew.split("\n").map((line, j) => {
                // First line gets original indentation
                if (j === 0) return firstLineIndent + line.trimStart();

                // Other lines maintain relative indentation
                const oldIndent = oldLines[j]?.match(/^\s*/)?.[0] || "";
                const newIndent = line.match(/^\s*/)?.[0] || "";

                if (oldIndent && newIndent) {
                  const relativeIndent = newIndent.length - oldIndent.length;
                  return firstLineIndent + " ".repeat(Math.max(0, relativeIndent)) + line.trimStart();
                }

                return line;
              });

              contentLines.splice(i, oldLines.length, ...newLines);
              newContent = contentLines.join("\n");
              matchFound = true;
              break;
            }
          }

          if (!matchFound) {
            throw new McpError(
              ErrorCode.InvalidParams,
              `Could not find match for pattern: ${pattern.oldText.substring(0, 40)}...`
            );
          }
        }
        break;
    }

    // Write updated content
    await fs.writeFile(validPath, newContent, "utf-8");

    // Return simple diff summary
    return `File ${filePath} updated using ${operation.mode} mode`;
  });
}
