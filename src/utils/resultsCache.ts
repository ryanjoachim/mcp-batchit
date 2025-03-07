
export class ResultsCache {
  private cache = new Map<string, unknown>();

  /**
   * Stores an operation result
   */
  storeResult<T>(operationId: string, result: T): void {
    if (!operationId) return;
    this.cache.set(operationId, result);
  }

  /**
   * Retrieves a cached result
   */
  getResult<T>(operationId: string): T | undefined {
    return this.cache.get(operationId) as T | undefined;
  }

  /**
   * Clears all results from the cache
   */
  clear(): void {
    this.cache.clear();
  }
}

// Export singleton instance
export const resultsCache = new ResultsCache();
