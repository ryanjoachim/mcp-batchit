import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { resultsCache } from "./resultsCache.js"
import { TemplateCache } from "./templateCache.js"
import { validateTemplate, type ValidationResult } from "./templateValidator.js"
import { hbs } from "./handlebarsInstance.js"
// Ensure built-in helpers are registered at module load time
import "./templateHelpers.js"

/**
 * Cache of precompiled Handlebars templates for improved performance.
 */
const templateCache = new TemplateCache()

/**
 * Configuration for template resolution
 */
interface ResolveTemplatesConfig {
  /** Validate template before execution (default: false) */
  validateBeforeExecution?: boolean
}

let globalConfig: ResolveTemplatesConfig = {
  validateBeforeExecution: false,
}

/**
 * Configure template resolution behavior
 */
export function configureTemplateResolution(
  config: ResolveTemplatesConfig
): void {
  globalConfig = { ...globalConfig, ...config }
}

/**
 * Clears the template cache. Useful for testing or when templates
 * need to be recompiled (e.g., after template modifications).
 */
export function clearTemplateCache(): void {
  templateCache.clear()
}

// Register existing helpers only if not already present
if (!hbs.helpers["json"]) {
  hbs.registerHelper("json", (context) => {
    return new hbs.SafeString(JSON.stringify(context, null, 2))
  })
}
if (!hbs.helpers["parseJson"]) {
  hbs.registerHelper("parseJson", (str) => {
    try {
      return JSON.parse(str)
    } catch {
      return {}
    }
  })
}
if (!hbs.helpers["now"]) {
  hbs.registerHelper("now", () => new Date().toISOString())
}

// Register all built-in helpers from templateHelpers
// Helpers are registered at module load time via templateHelpers.ts

/**
 * Enhances a template error with line number and snippet context
 */
export function enhanceTemplateError(error: Error, template: string): McpError {
  const errorMessage = error.message

  // Try to extract line number from error message
  const lineMatch = errorMessage.match(/line (\d+)/)
  const lineNumber = lineMatch ? parseInt(lineMatch[1], 10) : undefined

  let enhancedMessage = `Template error: ${errorMessage}`

  if (lineNumber !== undefined) {
    enhancedMessage += `\n  at line ${lineNumber}`

    // Try to show the problematic line
    const lines = template.split("\n")
    if (lineNumber >= 1 && lineNumber <= lines.length) {
      const snippet = lines[lineNumber - 1]
      enhancedMessage += `\n  ${snippet}`
    }
  }

  return new McpError(ErrorCode.InvalidParams, enhancedMessage)
}

/**
 * Resolves Handlebars templates in operation arguments.
 *
 * Features:
 * - Template caching for improved performance (LRU eviction)
 * - Access to previous operation results via {{results}}
 * - Current timestamp via {{now}}
 * - JSON manipulation via {{json}} and {{parseJson}} helpers
 * - Built-in helpers: uppercase, lowercase, capitalize, trim, eq, ne, and, or, not, etc.
 * - Optional template validation before execution
 *
 * @example
 * ```typescript
 * const args = {
 *   template: "Created: {{now}}, Data: {{json results.previousOp}}"
 * };
 * const resolved = resolveTemplates(args);
 * // resolved.content will contain the rendered template
 * // template is cached for future use with the same content
 * ```
 *
 * @param args - Operation arguments containing optional template
 * @returns Arguments with resolved template content
 */
export function resolveTemplates(
  args: Record<string, any>
): Record<string, any> {
  if (!args.template) return args

  const templateStr = args.template

  // Optional validation before execution
  if (globalConfig.validateBeforeExecution) {
    const validationResult: ValidationResult = validateTemplate(templateStr)
    if (!validationResult.valid) {
      const firstError = validationResult.errors[0]
      const errorMessage =
        firstError.message +
        (firstError.line ? ` at line ${firstError.line}` : "")
      throw new McpError(
        ErrorCode.InvalidParams,
        `Template validation error: ${errorMessage}`
      )
    }
  }

  // Try to get from cache first
  let template = templateCache.get(templateStr)

  if (!template) {
    try {
      // Compile the template
      template = hbs.compile(templateStr)
    } catch (error) {
      if (error instanceof Error) {
        throw enhanceTemplateError(error, templateStr)
      }
      throw new McpError(
        ErrorCode.InvalidParams,
        `Template compilation error: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  // Prepare the context
  const context = {
    ...args.content, // Spread content properties directly into context
    content: args.content, // Keep original content for backward compatibility
    results: resultsCache.debug(),
    now: new Date().toISOString(),
  }

  let renderedContent: string
  try {
    // Execute the template
    renderedContent = template(context)
    // Only cache if execution succeeds
    templateCache.set(templateStr, template)
  } catch (error) {
    if (error instanceof Error) {
      throw enhanceTemplateError(error, templateStr)
    }
    throw new McpError(
      ErrorCode.InvalidParams,
      `Template runtime error: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  return {
    ...args,
    content: renderedContent,
    template: undefined,
  }
}

// Export validateTemplate for external use
export { validateTemplate }
