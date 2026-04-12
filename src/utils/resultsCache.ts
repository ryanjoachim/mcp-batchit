/**
 * Cache for storing operation results during batch execution.
 * Each BatchExecutor.executeBatch call creates a fresh instance,
 * so concurrent batches never interfere with each other's results.
 */
export class ResultsCache {
  private cache = new Map<string, unknown>()

  /**
   * Store a result for a given operation ID
   */
  storeResult(operationId: string, result: unknown): void {
    if (!operationId) return
    this.cache.set(operationId, result)
  }

  /**
   * Get a stored result for a given operation ID
   */
  getResult(operationId: string): unknown | undefined {
    return this.cache.get(operationId)
  }

  /**
   * Check if a result exists for a given operation ID
   * Distinguishes between "key missing" and "key present with undefined value"
   */
  hasResult(operationId: string): boolean {
    return this.cache.has(operationId)
  }

  /**
   * Clear all stored results
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Debug method to view cache contents
   */
  debug(): { [key: string]: unknown } {
    const contents: { [key: string]: unknown } = {}
    this.cache.forEach((value, key) => {
      contents[key] = value
    })
    return contents
  }
}
