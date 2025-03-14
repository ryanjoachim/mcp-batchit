/**
 * Interface representing the data returned by pdf-parse
 */
export interface PDFData {
  text: string
  numpages: number
  info: Record<string, any>
  metadata: Record<string, any>
  version: string
}

/**
 * Wrapper for pdf-parse that avoids running debug/self-test code by using dynamic imports
 * @param dataBuffer Buffer containing the PDF data
 * @param options Options for pdf-parse
 * @returns Parsed PDF data
 */
export default async function parse(
  dataBuffer: Buffer,
  options?: any
): Promise<PDFData> {
  // Dynamically import pdf-parse only when needed
  const pdfParse = await import("pdf-parse").then((module) => module.default)
  return pdfParse(dataBuffer, options)
}
