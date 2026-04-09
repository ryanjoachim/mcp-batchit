import Handlebars from "handlebars"

type HandlebarsTemplateDelegate<T = any> = Handlebars.TemplateDelegate<T>

const MAX_CACHE_SIZE = 100

/**
 * Simple cache for compiled Handlebars templates.
 * Evicts the oldest entry when capacity is reached.
 */
export class TemplateCache {
  private cache = new Map<string, HandlebarsTemplateDelegate>()
  private maxSize: number

  constructor(config?: { maxSize?: number }) {
    this.maxSize = config?.maxSize ?? MAX_CACHE_SIZE
  }

  /**
   * Get a compiled template from the cache
   */
  get(key: string): HandlebarsTemplateDelegate | undefined {
    return this.cache.get(key)
  }

  /**
   * Store a compiled template in the cache
   */
  set(key: string, template: HandlebarsTemplateDelegate): void {
    if (this.cache.size >= this.maxSize) {
      // Evict the oldest entry (first key in insertion order)
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) {
        this.cache.delete(oldest)
      }
    }
    this.cache.set(key, template)
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get the current number of entries in the cache
   */
  size(): number {
    return this.cache.size
  }
}
