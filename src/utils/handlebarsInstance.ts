import Handlebars from "handlebars"

/**
 * Shared Handlebars instance used across all template modules.
 * This ensures helpers and partials registered in one module
 * are visible to all others.
 */
export const hbs = Handlebars.create()

// Configure strict mode for better error handling
hbs.registerHelper("helperMissing", function () {
  throw new Error(`Helper not found: ${arguments[arguments.length - 1].name}`)
})
