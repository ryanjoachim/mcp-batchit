import { eventBus } from './eventBus.js';
import { metricsCollector } from './metricsCollector.js';

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  metadata: {
    operationId: string;
    tool: string;
    [key: string]: unknown;
  };
}

/**
 * Cache for operation results that enables future data passing capabilities
 * between batch operations while maintaining type safety.
 */
export class ResultsCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries: number;

  constructor(maxEntries: number = 1000) {
    this.maxEntries = maxEntries;
  }

  /**
   * Stores an operation result with metadata for potential future reference
   */
  storeResult<T>(
    operationId: string,
    result: T,
    metadata: {
      tool: string;
      [key: string]: unknown;
    }
  ): void {
    if (!operationId) return;

    // Enforce cache size limit
    if (this.cache.size >= this.maxEntries) {
      const oldestEntry = [...this.cache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];

      if (oldestEntry) {
        this.cache.delete(oldestEntry[0]);
        eventBus.emit('resultsCacheEviction', {
          operationId: oldestEntry[0],
          reason: 'cache_full'
        });
      }
    }

    const entry: CacheEntry<T> = {
      value: result,
      timestamp: Date.now(),
      metadata: {
        operationId,
        ...metadata
      }
    };

    this.cache.set(operationId, entry);

    // Record metrics
    metricsCollector.recordMetric('resultsCache.size', this.cache.size);
    metricsCollector.recordMetric(`resultsCache.stored.${metadata.tool}`, 1);

    eventBus.emit('resultsCacheStore', {
      operationId,
      timestamp: entry.timestamp,
      tool: metadata.tool
    });
  }

  /**
   * Retrieves a cached result and its metadata
   */
  getResult<T>(operationId: string): { result: T; metadata: CacheEntry<T>['metadata'] } | undefined {
    const entry = this.cache.get(operationId) as CacheEntry<T> | undefined;

    if (entry) {
      eventBus.emit('resultsCacheHit', {
        operationId,
        tool: entry.metadata.tool
      });
      metricsCollector.recordMetric('resultsCache.hits', 1);

      return {
        result: entry.value,
        metadata: entry.metadata
      };
    }

    metricsCollector.recordMetric('resultsCache.misses', 1);
    return undefined;
  }

  /**
   * Removes a specific result from the cache
   */
  removeResult(operationId: string): void {
    const entry = this.cache.get(operationId);
    if (entry) {
      this.cache.delete(operationId);
      metricsCollector.recordMetric('resultsCache.size', this.cache.size);
      eventBus.emit('resultsCacheRemove', {
        operationId,
        tool: entry.metadata.tool
      });
    }
  }

  /**
   * Queries the cache based on metadata criteria
   */
  query(criteria: Partial<CacheEntry<unknown>['metadata']>): Array<{
    operationId: string;
    result: unknown;
    metadata: CacheEntry<unknown>['metadata'];
  }> {
    return Array.from(this.cache.entries())
      .filter(([_, entry]) =>
        Object.entries(criteria).every(([key, value]) =>
          entry.metadata[key] === value
        )
      )
      .map(([operationId, entry]) => ({
        operationId,
        result: entry.value,
        metadata: entry.metadata
      }));
  }

  /**
   * Clears all results from the cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    if (size > 0) {
      metricsCollector.recordMetric('resultsCache.size', 0);
      eventBus.emit('resultsCacheClear', { previousSize: size });
    }
  }

  /**
   * Gets cache statistics
   */
  getStats(): {
    size: number;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
    toolBreakdown: Record<string, number>;
  } {
    const entries = Array.from(this.cache.values());
    const toolBreakdown = entries.reduce((acc, entry) => {
      const tool = entry.metadata.tool;
      acc[tool] = (acc[tool] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      size: this.cache.size,
      oldestTimestamp: entries.length ? Math.min(...entries.map(e => e.timestamp)) : null,
      newestTimestamp: entries.length ? Math.max(...entries.map(e => e.timestamp)) : null,
      toolBreakdown
    };
  }
}

// Export singleton instance
export const resultsCache = new ResultsCache();
