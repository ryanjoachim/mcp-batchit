import mammoth from "mammoth"
import sharp from "sharp"
import { promises as fs } from "fs"
import path from "path"
import { ErrorManager } from "../utils/errorManager.js"
import { previewCache } from "./previewCache.js"
import pdfParse from "./pdfParseWrapper.js"
import { FileMetadata, PreviewOptions } from "../types/filesystem/fileInfo.js"

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
 * Extracts text content from a PDF file
 */
export async function extractTextFromPDF(filePath: string): Promise<string> {
  try {
    // Read the PDF file as a buffer
    const dataBuffer = await fs.readFile(filePath)

    // Extract text from PDF
    const data = await pdfParse(dataBuffer)

    // Return the extracted text
    return data.text
  } catch (error) {
    throw ErrorManager.createInvalidFormatError(
      "PDF",
      `Failed to extract text: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Extracts text content from a DOCX file
 */
export async function extractTextFromDOCX(filePath: string): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value
  } catch (error) {
    throw ErrorManager.createInvalidFormatError(
      "DOCX",
      `Failed to extract text: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Extract metadata from any file using the new FileMetadata type
 */
export async function extractFileMetadata(
  filePath: string
): Promise<FileMetadata> {
  try {
    const mimeType = getMimeType(filePath) || "application/octet-stream"

    // Initialize with standard metadata fields
    const metadata: FileMetadata = {
      mimeType,
    }

    // Extract additional metadata based on file type
    if (mimeType.startsWith("image/")) {
      const imageInfo = await sharp(filePath).metadata()
      metadata.dimensions = {
        width: imageInfo.width || 0,
        height: imageInfo.height || 0,
      }
      // Using index signature for custom property
      metadata["format"] = imageInfo.format
    } else if (mimeType === "application/pdf") {
      const dataBuffer = await fs.readFile(filePath)
      const pdfData = await pdfParse(dataBuffer)
      metadata.pageCount = pdfData.numpages
    }

    return metadata
  } catch (error) {
    const fileType = path.extname(filePath).toLowerCase().slice(1)
    throw ErrorManager.createInvalidFormatError(
      fileType || "file",
      `Failed to extract metadata: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Generate a preview/thumbnail for supported file types with caching
 *
 * @param filePath Path to the file
 * @param options Preview generation options
 * @returns Buffer containing the preview image or undefined if preview generation is not supported
 */
export async function generatePreview(
  filePath: string,
  options: PreviewOptions = {}
): Promise<Buffer | undefined> {
  const mimeType = getMimeType(filePath)

  if (!mimeType?.startsWith("image/")) {
    return undefined
  }

  try {
    // Check cache first
    const cachedPreview = previewCache.get(filePath, options)
    if (cachedPreview) {
      return cachedPreview
    }

    // Generate new preview
    const preview = await sharp(filePath)
      .resize(options.maxWidth, options.maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .toFormat(options.format || "jpeg", {
        quality: options.quality || 80,
      })
      .toBuffer()

    // Cache the preview
    previewCache.set(filePath, options, preview)

    return preview
  } catch (error) {
    throw ErrorManager.createInvalidFormatError(
      "image",
      `Failed to generate preview: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
