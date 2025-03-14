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

  /**
   * Debug method to view cache contents
   */
  debug(): { [key: string]: unknown } {
    const contents: { [key: string]: unknown } = {};
    this.cache.forEach((value, key) => {
      contents[key] = value;
    });
    return contents;
  }
}

/**
 * Singleton instance of ResultsCache
 */
export const resultsCache = new ResultsCache();
