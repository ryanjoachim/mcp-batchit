/**
 * Cache for storing operation results during batch execution
 */
export class ResultsCache {
  private cache = new Map<string, unknown>();

  /**
   * Store a result for a given operation ID
   */
  storeResult(operationId: string, result: unknown): void {
    if (!operationId) return;
    this.cache.set(operationId, result);
  }

  /**
   * Get a stored result for a given operation ID
   */
  getResult(operationId: string): unknown | undefined {
    return this.cache.get(operationId);
  }

  /**
   * Clear all stored results
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Singleton instance of ResultsCache
 */
export const resultsCache = new ResultsCache();
