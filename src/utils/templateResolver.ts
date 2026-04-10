import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { resultsCache } from "./resultsCache.js"
import { hbs } from "./handlebarsInstance.js"
// Ensure built-in helpers are registered at module load time
import "./templateHelpers.js"

/** Maximum number of compiled templates to keep in cache. */
const MAX_CACHE_SIZE = 100

/**
 * Cache of precompiled Handlebars templates.
 * Evicts the oldest entry when capacity is reached.
 */
const templateCache = new Map<string, HandlebarsTemplateDelegate>()

/**
 * Clears the template cache. Useful for testing or when templates
 * need to be recompiled.
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

/**
 * Enhances a template error with line number and snippet context
 */
function enhanceTemplateError(error: Error, template: string): McpError {
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
 * - Template caching for improved performance
 * - Access to previous operation results via {{results}}
 * - Current timestamp via {{now}}
 * - JSON manipulation via {{json}} and {{parseJson}} helpers
 * - Built-in helpers: uppercase, lowercase, capitalize, trim, eq, ne, and, or, not, etc.
 *
 * @param args - Operation arguments containing optional template
 * @returns Arguments with resolved template content
 */
export function resolveTemplates(
  args: Record<string, any>
): Record<string, any> {
  if (!args.template) return args

  const templateStr = args.template

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
    // Only cache if execution succeeds — evict oldest if at capacity
    if (!templateCache.has(templateStr)) {
      if (templateCache.size >= MAX_CACHE_SIZE) {
        const oldest = templateCache.keys().next().value
        if (oldest !== undefined) templateCache.delete(oldest)
      }
      templateCache.set(templateStr, template)
    }
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
