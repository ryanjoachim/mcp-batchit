import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import Handlebars from "handlebars"
import { resultsCache } from "./resultsCache.js"

/**
 * Handlebars templating engine instance with registered helpers
 * for JSON manipulation and timestamp generation
 */
const hbs = Handlebars.create()

/**
 * Cache of precompiled Handlebars templates for improved performance.
 * Templates are compiled once and reused for subsequent operations.
 */
const templateCache = new Map<string, HandlebarsTemplateDelegate>()

/**
 * Clears the template cache. Useful for testing or when templates
 * need to be recompiled (e.g., after template modifications).
 */
export function clearTemplateCache() {
  templateCache.clear()
}

// Configure strict mode for better error handling
hbs.registerHelper("helperMissing", function () {
  throw new Error(`Helper not found: ${arguments[arguments.length - 1].name}`)
})

// Register basic helpers
hbs.registerHelper("json", (context) => {
  // Match project's JSON formatting pattern
  return new Handlebars.SafeString(JSON.stringify(context, null, 2))
})
hbs.registerHelper("parseJson", (str) => {
  try {
    return JSON.parse(str)
  } catch {
    return {}
  }
})
hbs.registerHelper("now", () => new Date().toISOString())

/**
 * Resolves Handlebars templates in operation arguments.
 *
 * Features:
 * - Template caching for improved performance
 * - Access to previous operation results via {{results}}
 * - Current timestamp via {{now}}
 * - JSON manipulation via {{json}} and {{parseJson}} helpers
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

  // Try to get from cache first
  let template = templateCache.get(args.template)

  if (!template) {
    try {
      // Compile the template
      template = hbs.compile(args.template)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      throw new McpError(
        ErrorCode.InvalidParams,
        `Template compilation error: ${errorMessage}`
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
    templateCache.set(args.template, template)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new McpError(
      ErrorCode.InvalidParams,
      `Template runtime error: ${errorMessage}`
    )
  }

  return {
    ...args,
    content: renderedContent,
    template: undefined,
  }
}
