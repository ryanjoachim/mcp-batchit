import fs from "fs/promises"
import path from "path"
import { isBinaryFile } from "isbinaryfile"
import { validatePathInProcess, type PathValidationConfig } from "./validation.js"
import { addLineNumbers } from "./utils.js"
import { extractTextFromPDF, extractTextFromDOCX } from "./fileTypeHandlers.js"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"

export interface ReadOptions {
  encoding?: BufferEncoding
  maxConcurrent?: number
  checkBinary?: boolean
  addLineNumbers?: boolean
  fileTypeHandling?: boolean
  startLineNumber?: number
}

export const defaultOptions: ReadOptions = {
  encoding: 'utf-8',
  maxConcurrent: 5,
  checkBinary: true,
  addLineNumbers: true,
  fileTypeHandling: true,
  startLineNumber: 1
}

interface FileResult {
  path: string
  content?: string
  error?: string
  fileType?: string
  lineCount?: number
  encoding: string
}

export async function readFileOp(
  filePath: string,
  config: PathValidationConfig,
  options: ReadOptions = defaultOptions
): Promise<string> {
  try {
    const validPath = await validatePathInProcess(filePath, config)
    const opts = { ...defaultOptions, ...options }

    try {
      await fs.access(validPath)
    } catch {
      throw new McpError(ErrorCode.InternalError, `File not found: ${validPath}`)
    }

    if (opts.fileTypeHandling) {
      const fileExtension = path.extname(validPath).toLowerCase()

      switch (fileExtension) {
        case '.pdf':
          return await extractTextFromPDF(validPath)
        case '.docx':
          return await extractTextFromDOCX(validPath)
        default:
          if (opts.checkBinary) {
            try {
              const isBinary = await isBinaryFile(validPath)
              if (isBinary) {
                throw new McpError(
                  ErrorCode.InvalidParams,
                  `Cannot read binary file: ${validPath}`
                )
              }
            } catch (error) {
              throw new McpError(
                ErrorCode.InternalError,
                `Failed to check binary status: ${validPath}`
              )
            }
          }
      }
    }

    const rawContent = await fs.readFile(validPath, opts.encoding)
    let content = Buffer.isBuffer(rawContent) ?
      rawContent.toString(opts.encoding) : rawContent

    if (opts.addLineNumbers) {
      content = addLineNumbers(content, opts.startLineNumber)
    }

    return content

  } catch (error) {
    if (error instanceof McpError) throw error
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to read file: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function readMultipleFilesOp(
  paths: string[],
  config: PathValidationConfig,
  options: ReadOptions = defaultOptions
): Promise<FileResult[]> {
  const opts = { ...defaultOptions, ...options }
  const batchSize = opts.maxConcurrent || 1
  const results: FileResult[] = []
  const errors: McpError[] = []

  try {
    for (let i = 0; i < paths.length; i += batchSize) {
      const batch = paths.slice(i, i + batchSize)
      const batchPromises = batch.map(async (filePath): Promise<FileResult> => {
        try {
          const content = await readFileOp(filePath, config, opts)
          return {
            path: filePath,
            content,
            fileType: path.extname(filePath).toLowerCase(),
            lineCount: content.split('\n').length,
            encoding: opts.encoding || 'utf-8'
          }
        } catch (error) {
          const mcpError = error instanceof McpError ?
            error :
            new McpError(
              ErrorCode.InternalError,
              `Failed to read file: ${error instanceof Error ? error.message : String(error)}`
            )
          errors.push(mcpError)
          return {
            path: filePath,
            error: mcpError.message,
            fileType: path.extname(filePath).toLowerCase(),
            encoding: opts.encoding || 'utf-8'
          }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
    }

    if (errors.length > 0) {
      console.error(`Encountered ${errors.length} errors while reading files`)
    }

    return results

  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to process files: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
