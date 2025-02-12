import mammoth from "mammoth"
import { PDFExtract } from 'pdf.js-extract'

/** Supported file extensions */
export type SupportedExtension = 'pdf' | 'docx'

/** File handler function type */
export type FileHandler = (path: string) => Promise<string>

/**
 * Extracts text content from a PDF file
 * @param filePath - Path to the PDF file
 * @returns Promise containing extracted text
 */
export async function extractTextFromPDF(filePath: string): Promise<string> {
  try {
    const pdfExtract = new PDFExtract()
    const options = {} // Optional configuration object

    const data = await pdfExtract.extract(filePath, options)

    // Combine text from all pages with proper spacing
    const text = data.pages
      .map(page =>
        page.content
          .map(item => item.str)
          .join(' ')
      )
      .join('\n\n')

    return text
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`Failed to extract text from PDF: ${errorMessage}`)
  }
}

/**
 * Extracts text content from a DOCX file
 * @param filePath - Path to the DOCX file
 * @returns Promise containing extracted text
 */
export async function extractTextFromDOCX(filePath: string): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to extract text from DOCX: ${errorMessage}`)
  }
}

/**
 * Processes multiple files with their corresponding handlers
 * @param paths - Array of file paths to process
 * @param handlers - Map of file extensions to their handlers
 * @returns Promise containing results for each processed file
 */
export async function handleMultipleFiles(
  paths: string[],
  handlers: Record<SupportedExtension, FileHandler>
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  for (const path of paths) {
    try {
      const extension = path.split('.').pop()?.toLowerCase() as SupportedExtension;
      const handler = handlers[extension];

      if (!handler) {
        console.warn(`No handler found for file: ${path}`);
        continue;
      }

      results[path] = await handler(path);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error processing file ${path}: ${errorMessage}`);
    }
  }

  return results;
}
