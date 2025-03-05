import { z } from "zod"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"

/**
 * Recovery event types for logging and monitoring
 */
export enum RecoveryEventType {
  RetryAttempt = "retry_attempt",
  RetrySuccess = "retry_success",
  RetryFailure = "retry_failure",
  MaxRetriesExceeded = "max_retries_exceeded"
}

/**
 * Recovery event interface for detailed logging
 */
export interface RecoveryEvent {
  type: RecoveryEventType
  connectionId: string
  timestamp: Date
  retryCount: number
  delay?: number
  error?: Error
}

type RecoveryEventHandler = (event: RecoveryEvent) => void

// Recovery configuration schema
const RecoveryConfigSchema = z.object({
  maxRetries: z.number().default(3),
  initialDelay: z.number().default(1000),
  maxDelay: z.number().default(30000),
  backoffFactor: z.number().default(2)
})

type RecoveryConfig = z.infer<typeof RecoveryConfigSchema>

// Connection options schema
const ConnectionOptionsSchema = z.object({
  cleanupInterval: z.number().default(60000), // 1 minute
  maxCacheSize: z.number().default(10),
  maxIdleTime: z.number().default(300000), // 5 minutes
  maxErrors: z.number().default(3),
  recovery: RecoveryConfigSchema.default({})
})

type ConnectionOptions = z.infer<typeof ConnectionOptionsSchema>

// Connection metrics schema
const ConnectionMetricsSchema = z.object({
  retryCount: z.number(),
  lastRetryDelay: z.number(),
  created: z.date(),
  lastUsed: z.date(),
  useCount: z.number(),
  errors: z.number(),
  avgResponseTime: z.number(),
  status: z.enum(["active", "idle", "error"])
})

type ConnectionMetrics = z.infer<typeof ConnectionMetricsSchema>

// Connection cache entry schema
const CacheEntrySchema = z.object({
  id: z.string(),
  metrics: ConnectionMetricsSchema,
  maxIdleTime: z.number().default(300000), // 5 minutes default
  maxErrors: z.number().default(3)
})

type CacheEntry = z.infer<typeof CacheEntrySchema>

/**
 * Manages filesystem connection lifecycle including caching,
 * reuse policies, and automatic recovery
 */
export class ConnectionManager {
  private connectionCache: Map<string, CacheEntry> = new Map()
  private metricsCollector: NodeJS.Timeout
  private eventHandlers: Set<RecoveryEventHandler> = new Set()

  constructor(private readonly options: ConnectionOptions = {
    cleanupInterval: 60000, // 1 minute
    maxCacheSize: 10,
    maxIdleTime: 300000, // 5 minutes
    maxErrors: 3,
    recovery: {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2
    }
  }) {
    // Validate options
    const validated = ConnectionOptionsSchema.parse(options)
    this.options = validated

    // Start metrics collection
    this.metricsCollector = setInterval(() => {
      this.collectMetrics()
    }, this.options.cleanupInterval)
  }

  /**
   * Get or create a cached connection
   */
  public async getConnection(id: string): Promise<CacheEntry> {
    let entry = this.connectionCache.get(id)

    if (!entry) {
      entry = {
        id,
        metrics: {
          created: new Date(),
          lastUsed: new Date(),
          useCount: 0,
          errors: 0,
          avgResponseTime: 0,
          status: "active",
          retryCount: 0,
          lastRetryDelay: 0
        },
        maxIdleTime: this.options.maxIdleTime,
        maxErrors: this.options.maxErrors
      }
      this.connectionCache.set(id, entry)
    }

    // Update metrics
    entry.metrics.lastUsed = new Date()
    entry.metrics.useCount++

    return entry
  }

  /**
   * Record error for connection
   */
  public async recordError(id: string, error: Error): Promise<void> {
    const entry = this.connectionCache.get(id)
    if (!entry) return

    entry.metrics.errors++
    entry.metrics.retryCount++

    // Check if we can retry
    if (entry.metrics.retryCount <= this.options.recovery.maxRetries) {
      // Calculate backoff delay
      const delay = Math.min(
        this.options.recovery.initialDelay * Math.pow(
          this.options.recovery.backoffFactor,
          entry.metrics.retryCount - 1
        ),
        this.options.recovery.maxDelay
      )

      entry.metrics.lastRetryDelay = delay
      entry.metrics.status = "active" // Reset status for retry

      // Wait for backoff delay
      await new Promise(resolve => setTimeout(resolve, delay))

      // Decrease error count since we're retrying
      entry.metrics.errors--
      return
    }

    // Max retries exceeded, mark as error
    entry.metrics.status = "error"
    throw new McpError(
      ErrorCode.InvalidParams,
      `Connection ${id} failed: exceeded retry limit (${this.options.recovery.maxRetries})`
    )
  }

  /**
   * Collect metrics and cleanup idle connections
   */
  private collectMetrics(): void {
    const now = new Date()

    for (const [id, entry] of this.connectionCache.entries()) {
      // Check idle timeout
      const idleTime = now.getTime() - entry.metrics.lastUsed.getTime()
      if (idleTime > entry.maxIdleTime) {
        this.connectionCache.delete(id)
        continue
      }

      // Clean up error state connections
      if (entry.metrics.status === "error") {
        this.connectionCache.delete(id)
        continue
      }

      // Update status
      if (idleTime > 60000) { // 1 minute idle threshold
        entry.metrics.status = "idle"
      }
    }

    // Enforce cache size limit
    if (this.connectionCache.size > this.options.maxCacheSize) {
      // Remove oldest idle connections first
      const sortedEntries = [...this.connectionCache.entries()]
        .sort((a, b) => a[1].metrics.lastUsed.getTime() - b[1].metrics.lastUsed.getTime())

      for (const [id] of sortedEntries) {
        if (this.connectionCache.size <= this.options.maxCacheSize) break
        this.connectionCache.delete(id)
      }
    }
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    clearInterval(this.metricsCollector)
    this.connectionCache.clear()
  }
}

// Export schemas for documentation
export {
  ConnectionMetricsSchema,
  CacheEntrySchema
}
