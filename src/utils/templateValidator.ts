import Handlebars from "handlebars"

/**
 * Type of validation error
 */
export type ValidationErrorType = "syntax" | "helper" | "partial" | "other"

/**
 * A validation error with location and type information
 */
export interface ValidationError {
  /** Human-readable error message */
  message: string
  /** Line number where error occurred (1-indexed), if available */
  line?: number
  /** Column number where error occurred (1-indexed), if available */
  column?: number
  /** Type of error */
  type: ValidationErrorType
}

/**
 * Result of template validation
 */
export interface ValidationResult {
  /** Whether the template is valid */
  valid: boolean
  /** List of validation errors, empty if valid */
  errors: ValidationError[]
}

/**
 * Options for template validation
 */
export interface ValidateTemplateOptions {
  /** Check if referenced helpers are registered (default: true) */
  checkHelpers?: boolean
  /** Check if referenced partials are registered (default: true) */
  checkPartials?: boolean
  /** Additional context for error messages */
  expectedContext?: Record<string, unknown>
}

/**
 * Extracts line and column from a Handlebars compile error
 */
function extractLocation(error: Error): { line?: number; column?: number } {
  const match = error.message.match(/line (\d+), column (\d+)/)
  if (match) {
    return {
      line: parseInt(match[1], 10),
      column: parseInt(match[2], 10),
    }
  }
  const lineMatch = error.message.match(/line (\d+)/)
  if (lineMatch) {
    return { line: parseInt(lineMatch[1], 10) }
  }
  return {}
}

/**
 * Scans template source for unregistered helper calls
 */
function findHelperCalls(template: string): string[] {
  // Match {{helperName}} or {{helperName arg1 arg2}} but not partials ({{> partialName}})
  const helperPattern = /\{\{([^}]+)\}\}/g
  const helpers = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = helperPattern.exec(template)) !== null) {
    const content = match[1].trim()
    // Skip partials (start with >) and block helpers (start with #)
    if (content.startsWith(">") || content.startsWith("#")) continue
    // Extract helper name (first word)
    const firstWord = content.split(/\s+/)[0]
    if (firstWord && !Handlebars.helpers[firstWord]) {
      helpers.add(firstWord)
    }
  }

  return Array.from(helpers)
}

/**
 * Scans template source for unregistered partial references
 */
function findPartialCalls(template: string): string[] {
  // Match {{> partialName}} syntax
  const partialPattern = /\{\{>\s*(\S+)/g
  const partials = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = partialPattern.exec(template)) !== null) {
    const partialName = match[1]
    if (!Handlebars.partials[partialName]) {
      partials.add(partialName)
    }
  }

  return Array.from(partials)
}

/**
 * Validates a Handlebars template for syntax errors and optionally
 * checks that referenced helpers and partials are registered.
 *
 * @param template - The template string to validate
 * @param options - Validation options
 * @returns Validation result with errors if any
 */
export function validateTemplate(
  template: string,
  options?: ValidateTemplateOptions
): ValidationResult {
  const errors: ValidationError[] = []
  const checkHelpers = options?.checkHelpers ?? true
  const checkPartials = options?.checkPartials ?? true

  // Step 1: Compile check (catches syntax errors)
  try {
    Handlebars.compile(template)
  } catch (error) {
    if (error instanceof Error) {
      const location = extractLocation(error)
      errors.push({
        message: error.message,
        line: location.line,
        column: location.column,
        type: "syntax",
      })
    }
    return { valid: false, errors }
  }

  // Step 2: Check for unregistered helpers
  if (checkHelpers) {
    const missingHelpers = findHelperCalls(template)
    for (const helper of missingHelpers) {
      errors.push({
        message: `Helper not found: ${helper}`,
        type: "helper",
      })
    }
  }

  // Step 3: Check for unregistered partials
  if (checkPartials) {
    const missingPartials = findPartialCalls(template)
    for (const partial of missingPartials) {
      errors.push({
        message: `Partial not found: ${partial}`,
        type: "partial",
      })
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
