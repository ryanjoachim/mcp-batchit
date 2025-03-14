import path from "path";
import fs from "fs/promises";
import { isBinaryFile } from "isbinaryfile";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { extractTextFromPDF, extractTextFromDOCX } from "./fileTypeHandlers.js";

/**
 * Options for file reading operations
 */
export interface ReadOptions {
  encoding?: BufferEncoding;
  addLineNumbers?: boolean;
  startLineNumber?: number;
  checkBinary?: boolean;     // New option
  fileTypeHandling?: boolean; // New option
}

/**
 * Reads a file with enhanced handling for different file types
 */
export async function readFile(
  filePath: string,
  rootDirectory: string,
  options: ReadOptions = {}
): Promise<string> {
  try {
    // Basic path validation
    if (!path.isAbsolute(filePath)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Path must be absolute: ${filePath}`
      );
    }

    const normalized = path.normalize(filePath);

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

    // Ensure file exists
    try {
      await fs.access(normalized);
    } catch {
      throw new McpError(
        ErrorCode.InvalidParams,
        `File not found: ${normalized}`
      );
    }

    const opts = {
      encoding: options.encoding || "utf-8",
      addLineNumbers: options.addLineNumbers || false,
      startLineNumber: options.startLineNumber || 1,
      checkBinary: options.checkBinary !== false,
      fileTypeHandling: options.fileTypeHandling !== false
    };

    let content: string;
    const fileType = path.extname(normalized).toLowerCase();

    // Handle specific file types if enabled
    if (opts.fileTypeHandling) {
      switch (fileType) {
        case ".pdf":
          content = await extractTextFromPDF(normalized);
          break;
        case ".docx":
          content = await extractTextFromDOCX(normalized);
          break;
        default:
          // Check if file is binary
          if (opts.checkBinary) {
            const isBinary = await isBinaryFile(normalized);
            if (isBinary) {
              throw new McpError(
                ErrorCode.InvalidParams,
                `Cannot read binary file: ${filePath}`
              );
            }
          }

          const rawContent = await fs.readFile(normalized, opts.encoding);
          content = Buffer.isBuffer(rawContent) ?
            rawContent.toString(opts.encoding) : rawContent;
      }
    } else {
      const rawContent = await fs.readFile(normalized, opts.encoding);
      content = Buffer.isBuffer(rawContent) ?
        rawContent.toString(opts.encoding) : rawContent;
    }

    // Add line numbers if requested
    if (opts.addLineNumbers) {
      const lines = content.split('\n');
      const maxLineNumber = opts.startLineNumber + lines.length - 1;
      const numberWidth = maxLineNumber.toString().length;

      content = lines
        .map((line, index) => {
          const lineNumber = (opts.startLineNumber + index)
            .toString()
            .padStart(numberWidth, ' ');
          return `${lineNumber} | ${line}`;
        })
        .join('\n');
    }

    return content;
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Failed to read file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
