import { createHash } from "crypto";

/**
 * Interface for preview options used in cache key generation
 */
interface PreviewOptions {
  maxWidth?: number;
  maxHeight?: number;
  format?: 'jpeg' | 'png' | 'webp';
  quality?: number;
}

/**
 * Interface for cached preview entries
 */
interface CacheEntry {
  buffer: Buffer;
  timestamp: number;
  options: PreviewOptions;
}

/**
 * In-memory cache for file previews
 */
class PreviewCache {
  private static instance: PreviewCache;
  private cache: Map<string, CacheEntry>;
  private readonly maxEntries: number;
  private readonly maxAgeMs: number;

  private constructor() {
    this.cache = new Map();
    this.maxEntries = 1000; // Maximum number of cached previews
    this.maxAgeMs = 60 * 60 * 1000; // 1 hour cache lifetime
  }

  /**
   * Gets the singleton instance of PreviewCache
   */
  public static getInstance(): PreviewCache {
    if (!PreviewCache.instance) {
      PreviewCache.instance = new PreviewCache();
    }
    return PreviewCache.instance;
  }

  /**
   * Generates a cache key from file path and preview options
   */
  private generateCacheKey(filePath: string, options: PreviewOptions): string {
    const optionsStr = JSON.stringify(options);
    return createHash('md5')
      .update(`${filePath}:${optionsStr}`)
      .digest('hex');
  }

  /**
   * Gets a cached preview if it exists and is valid
   */
  public get(filePath: string, options: PreviewOptions): Buffer | undefined {
    const key = this.generateCacheKey(filePath, options);
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if cache entry has expired
    const now = Date.now();
    if (now - entry.timestamp > this.maxAgeMs) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.buffer;
  }

  /**
   * Stores a preview in the cache
   */
  public set(filePath: string, options: PreviewOptions, buffer: Buffer): void {
    const key = this.generateCacheKey(filePath, options);

    // If cache is full, remove oldest entries
    if (this.cache.size >= this.maxEntries) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const entriesToRemove = Math.ceil(this.maxEntries * 0.1); // Remove 10% of entries
      entries.slice(0, entriesToRemove).forEach(([k]) => this.cache.delete(k));
    }

    this.cache.set(key, {
      buffer,
      timestamp: Date.now(),
      options
    });
  }

  /**
   * Invalidates cache entries for a specific file
   */
  public invalidate(filePath: string): void {
    const keys = Array.from(this.cache.keys());
    keys.forEach(key => {
      if (key.includes(filePath)) {
        this.cache.delete(key);
      }
    });
  }

  /**
   * Clear all entries from the cache
   */
  public clear(): void {
    this.cache.clear();
  }

  /**
   * Gets the current size of the cache
   */
  public size(): number {
    return this.cache.size;
  }
}

export const previewCache = PreviewCache.getInstance();
