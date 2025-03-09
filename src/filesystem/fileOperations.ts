import fs from "fs/promises";
import { validatePath, PathValidationConfig } from "./pathValidation.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { withRecovery } from "../utils/recovery.js";

export interface ReadOptions {
  encoding?: BufferEncoding;
  addLineNumbers?: boolean;
  startLineNumber?: number;
}

/**
 * Adds line numbers to content
 */
function addLineNumbers(content: string, startLine: number = 1): string {
  const lines = content.split("\n");
  const maxLineNumberWidth = String(startLine + lines.length - 1).length;
  return lines
    .map((line, index) => {
      const lineNumber = String(startLine + index).padStart(maxLineNumberWidth, " ");
      return `${lineNumber} | ${line}`;
    })
    .join("\n");
}

/**
 * Reads file content with formatting options
 */
export async function readFile(
  filePath: string,
  config: PathValidationConfig,
  options: ReadOptions = {}
): Promise<string> {
  return withRecovery(async () => {
    const validPath = validatePath(filePath, config);
    const opts = {
      encoding: options.encoding || "utf-8",
      addLineNumbers: options.addLineNumbers || false,
      startLineNumber: options.startLineNumber || 1
    };

    try {
      await fs.access(validPath);
    } catch {
      throw new McpError(
        ErrorCode.InvalidParams,
        `File not found: ${validPath}`
      );
    }

    const content = await fs.readFile(validPath, opts.encoding);
    const textContent = Buffer.isBuffer(content) ?
      content.toString(opts.encoding) : content;

    if (opts.addLineNumbers) {
      return addLineNumbers(textContent, opts.startLineNumber);
    }

    return textContent;
  });
}

/**
 * Writes content to a file
 */
export async function writeFile(
  filePath: string,
  content: string,
  config: PathValidationConfig
): Promise<void> {
  return withRecovery(async () => {
    const validPath = validatePath(filePath, config);
    await fs.writeFile(validPath, content, "utf-8");
  });
}
