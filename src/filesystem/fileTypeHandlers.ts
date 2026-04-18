import { promises as fs } from "fs"
import path from "path"
import { ErrorManager } from "../utils/errorManager.js"
import { extractText, getDocumentProxy } from "unpdf"
import { FileMetadata } from "../types/filesystem/fileInfo.js"
import { DEFAULT_MAX_FILE_SIZE } from "../types/filesystem/paths.js"

/**
 * Detects the MIME type of a file based on its extension
 */
export function getMimeType(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    ".txt": "text/plain",
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".xml": "application/xml",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".wav": "audio/wav",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx":
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  }

  return mimeTypes[ext]
}

/**
 * Checks if a file exceeds the maximum allowed size.
 */
export async function checkFileSize(
  filePath: string,
  maxBytes: number = DEFAULT_MAX_FILE_SIZE
): Promise<void> {
  const stats = await fs.stat(filePath)
  if (stats.size > maxBytes) {
    throw ErrorManager.createInvalidFormatError(
      "File",
      `File ${filePath} exceeds maximum size limit (${stats.size} bytes > ${maxBytes} bytes)`
    )
  }
}

/**
 * Extracts text content from a PDF file using unpdf
 */
export async function extractTextFromPDF(filePath: string): Promise<string> {
  await checkFileSize(filePath)
  try {
    const dataBuffer = await fs.readFile(filePath)
    const pdf = await getDocumentProxy(new Uint8Array(dataBuffer))
    const { text } = await extractText(pdf, { mergePages: true })
    return text
  } catch (error) {
    throw ErrorManager.createInvalidFormatError(
      "PDF",
      `Failed to extract text: ${ErrorManager.getErrorMessage(error)}`
    )
  }
}

/**
 * Extracts text content from a DOCX file
 */
export async function extractTextFromDOCX(filePath: string): Promise<string> {
  await checkFileSize(filePath)
  try {
    const mammoth = await import("mammoth")
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value
  } catch (error) {
    throw ErrorManager.createInvalidFormatError(
      "DOCX",
      `Failed to extract text: ${ErrorManager.getErrorMessage(error)}`
    )
  }
}

/**
 * Extract metadata from any file using the new FileMetadata type
 */
export async function extractFileMetadata(
  filePath: string
): Promise<FileMetadata> {
  await checkFileSize(filePath)
  try {
    const mimeType = getMimeType(filePath) || "application/octet-stream"

    // Initialize with standard metadata fields
    const metadata: FileMetadata = {
      mimeType,
    }

    // Extract additional metadata based on file type
    if (mimeType.startsWith("image/")) {
      try {
        const sharp = (await import("sharp")).default
        const imageInfo = await sharp(filePath).metadata()
        metadata.dimensions = {
          width: imageInfo.width || 0,
          height: imageInfo.height || 0,
        }
        metadata["format"] = imageInfo.format
      } catch {
        // sharp not installed — skip image metadata
      }
    } else if (mimeType === "application/pdf") {
      const dataBuffer = await fs.readFile(filePath)
      const pdf = await getDocumentProxy(new Uint8Array(dataBuffer))
      metadata.pageCount = pdf.numPages
    }

    return metadata
  } catch (error) {
    const fileType = path.extname(filePath).toLowerCase().slice(1)
    throw ErrorManager.createInvalidFormatError(
      fileType || "file",
      `Failed to extract metadata: ${ErrorManager.getErrorMessage(error)}`
    )
  }
}
