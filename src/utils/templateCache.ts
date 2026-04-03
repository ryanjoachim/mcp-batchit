import Handlebars from "handlebars"
type HandlebarsTemplateDelegate<T = any> = Handlebars.TemplateDelegate<T>

/**
 * Configuration for the template cache
 */
export interface TemplateCacheConfig {
  /** Maximum number of entries in the cache (default: 1000) */
  maxSize?: number
  /** Fraction of entries to evict when cache is full (default: 0.1) */
  evictionRate?: number
  /** Enable metrics tracking (default: false) */
  enableMetrics?: boolean
}

/**
 * Metrics tracking for cache performance
 */
export interface TemplateCacheMetrics {
  /** Number of successful cache hits */
  hits: number
  /** Number of cache misses */
  misses: number
  /** Number of entries evicted */
  evictions: number
  /** Current number of entries in cache */
  size: number
  /** Hit rate as a fraction (0-1) */
  hitRate: number
}

/**
 * Internal cache entry with metadata
 */
interface CacheEntry {
  /** The compiled template */
  template: HandlebarsTemplateDelegate
  /** Timestamp of last access */
  lastAccessed: number
  /** Number of times this entry was accessed */
  accessCount: number
}

/**
 * LRU Template Cache with metrics and configurable eviction
 */
export class TemplateCache {
  private cache = new Map<string, CacheEntry>()
  private config: Required<TemplateCacheConfig>
  private metrics: TemplateCacheMetrics

  constructor(config: TemplateCacheConfig = {}) {
    this.config = {
      maxSize: config.maxSize ?? 1000,
      evictionRate: config.evictionRate ?? 0.1,
      enableMetrics: config.enableMetrics ?? false,
    }
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      hitRate: 0,
    }
  }

  /**
   * Get a compiled template from the cache
   */
  get(key: string): HandlebarsTemplateDelegate | undefined {
    const entry = this.cache.get(key)
    if (entry === undefined) {
      this.recordMiss()
      return undefined
    }

    // Update LRU metadata
    entry.lastAccessed = Date.now()
    entry.accessCount++
    this.recordHit()

    return entry.template
  }

  /**
   * Store a compiled template in the cache
   */
  set(key: string, template: HandlebarsTemplateDelegate): void {
    // If key exists, update it
    if (this.cache.has(key)) {
      this.cache.set(key, {
        template,
        lastAccessed: Date.now(),
        accessCount: 1,
      })
      return
    }

    // Evict if necessary before adding new entry
    while (this.cache.size >= this.config.maxSize) {
      this.evictLRU()
    }

    this.cache.set(key, {
      template,
      lastAccessed: Date.now(),
      accessCount: 1,
    })
    this.updateSizeMetric()
  }

  /**
   * Delete a specific entry from the cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key)
    if (deleted) {
      this.updateSizeMetric()
    }
    return deleted
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear()
    this.updateSizeMetric()
  }

  /**
   * Get the current number of entries in the cache
   */
  size(): number {
    return this.cache.size
  }

  /**
   * Get current cache metrics
   */
  getMetrics(): TemplateCacheMetrics {
    return { ...this.metrics }
  }

  /**
   * Reset all metrics to zero
   */
  resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: this.cache.size,
      hitRate: 0,
    }
  }

  /**
   * Record a cache hit
   */
  private recordHit(): void {
    if (!this.config.enableMetrics) return
    this.metrics.hits++
    this.updateHitRate()
  }

  /**
   * Record a cache miss
   */
  private recordMiss(): void {
    if (!this.config.enableMetrics) return
    this.metrics.misses++
    this.updateHitRate()
  }

  /**
   * Update the hit rate metric
   */
  private updateHitRate(): void {
    const total = this.metrics.hits + this.metrics.misses
    this.metrics.hitRate = total > 0 ? this.metrics.hits / total : 0
  }

  /**
   * Update the size metric
   */
  private updateSizeMetric(): void {
    this.metrics.size = this.cache.size
  }

  /**
   * Evict the least-recently-used entries
   */
  private evictLRU(): void {
    const evictionCount = Math.ceil(this.cache.size * this.config.evictionRate)
    if (evictionCount === 0) return

    // Sort entries by lastAccessed (oldest first)
    const entries = Array.from(this.cache.entries()).sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed
    )

    // Remove the oldest entries
    for (let i = 0; i < evictionCount && i < entries.length; i++) {
      this.cache.delete(entries[i][0])
      if (this.config.enableMetrics) {
        this.metrics.evictions++
      }
    }

    this.updateSizeMetric()
  }
}
