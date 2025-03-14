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

// Register basic helpers
hbs.registerHelper('json', (context) => {
  // Match project's JSON formatting pattern
  return new Handlebars.SafeString(
    JSON.stringify(context, null, 2)
  )
})
hbs.registerHelper('parseJson', (str) => {
  try { return JSON.parse(str) }
  catch { return {} }
})
hbs.registerHelper('now', () => new Date().toISOString())

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
export function resolveTemplates(args: Record<string, any>): Record<string, any> {
  if (!args.template) return args

  let template = templateCache.get(args.template)
  if (!template) {
    template = hbs.compile(args.template)
    templateCache.set(args.template, template)
  }
  // Include content in template context along with results and now
  const context = {
    content: args.content,
    results: resultsCache.debug(),
    now: new Date().toISOString()
  }
  const result = template(context)

  return {
    ...args,
    content: result,
    template: undefined
  }
}
