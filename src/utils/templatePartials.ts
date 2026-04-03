import { hbs } from "./handlebarsInstance.js"

/**
 * Registers a single partial template
 */
export function registerPartial(name: string, template: string): void {
  hbs.registerPartial(name, template)
}

/**
 * Registers multiple partials at once
 */
export function registerPartials(partials: Record<string, string>): void {
  for (const [name, template] of Object.entries(partials)) {
    hbs.registerPartial(name, template)
  }
}

/**
 * Unregisters a partial by name
 */
export function unregisterPartial(name: string): void {
  hbs.unregisterPartial(name)
}

/**
 * Lists all registered partial names
 */
export function listPartials(): string[] {
  return Object.keys(hbs.partials)
}

/**
 * Clears all registered partials
 */
export function clearPartials(): void {
  for (const name of Object.keys(hbs.partials)) {
    hbs.unregisterPartial(name)
  }
}

/**
 * Registers all built-in partials.
 * Currently a no-op since there are no built-in partials,
 * but the API exists for future expansion.
 */
export function registerBuiltInPartials(): void {
  // No built-in partials at this time
}
