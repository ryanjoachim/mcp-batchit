import { z } from "zod";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { eventBus } from "../utils/eventBus.js";
import { withRecovery, RecoveryConfigSchema } from "../utils/recovery.js";
import { metricsCollector } from "../utils/metricsCollector.js";
import { ConnectionPool } from "../utils/connectionPool.js";

// Connection options schema
const ConnectionOptionsSchema = z.object({
  pool: z.object({
    maxSize: z.number().default(100),
    minSize: z.number().default(1),
    idleTimeout: z.number().default(300000), // 5 minutes
    maxLifetime: z.number().default(3600000), // 1 hour
    acquireTimeout: z.number().default(30000), // 30 seconds
    validationInterval: z.number().default(60000) // 1 minute
  }).default({}),
  maxErrors: z.number().default(3),
  recovery: RecoveryConfigSchema.default({})
});

type ConnectionOptions = z.infer<typeof ConnectionOptionsSchema>;

// Connection metrics schema with complete metric fields
const ConnectionMetricsSchema = z.object({
  retryCount: z.number(),
  lastRetryDelay: z.number(),
  created: z.date(),
  lastUsed: z.date(),
  useCount: z.number(),
  errors: z.number(),
  avgResponseTime: z.number(),
  status: z.enum(["active", "idle", "error"]),
  successfulConnections: z.number(),
  failedConnections: z.number(),
  totalOperations: z.number()
});

// Include ConnectionMetrics type in the exported interface
export type ConnectionMetrics = z.infer<typeof ConnectionMetricsSchema>;

// Connection cache entry schema updated to use ConnectionMetrics
const CacheEntrySchema = z.object({
  id: z.string(),
  metrics: ConnectionMetricsSchema,
  maxIdleTime: z.number().default(300000),
  maxErrors: z.number().default(3)
});

type CacheEntry = z.infer<typeof CacheEntrySchema>;

/**
 * Manages filesystem connection lifecycle including caching,
 * reuse policies, and automatic recovery
 */
export class ConnectionManager {
  private pool: ConnectionPool;

  constructor(private readonly options: ConnectionOptions = {
    pool: {
      maxSize: 100,
      minSize: 1,
      idleTimeout: 300000,
      maxLifetime: 3600000,
      acquireTimeout: 30000,
      validationInterval: 60000
    },
    maxErrors: 3,
    recovery: {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2
    }
  }) {
    const validated = ConnectionOptionsSchema.parse(options);
    this.options = validated;
    this.pool = ConnectionPool.getInstance(this.options.pool);
  }

  /**
   * Get or create a connection using the connection pool
   */
  public async getConnection(id: string): Promise<CacheEntry> {
    return withRecovery(async () => {
      const connection = await this.pool.acquire(id);
      const entry: CacheEntry = {
        id: connection.id,
        metrics: {
          created: connection.createdAt,
          lastUsed: connection.lastUsedAt,
          useCount: connection.useCount,
          errors: 0,
          avgResponseTime: 0,
          status: connection.isActive ? ("active" as const) : ("idle" as const),
          retryCount: 0,
          lastRetryDelay: 0,
          successfulConnections: 1,
          failedConnections: 0,
          totalOperations: connection.useCount
        },
        maxIdleTime: this.options.pool.idleTimeout,
        maxErrors: this.options.maxErrors
      };

      // Record metrics
      metricsCollector.recordMetric(`connection.${id}.useCount`, entry.metrics.useCount);
      metricsCollector.recordMetric(`connection.${id}.errors`, entry.metrics.errors);

      return entry;
    }, this.options.recovery);
  }

  /**
   * Record error for connection with centralized error handling and pool integration
   */
  public async recordError(id: string, error: Error): Promise<void> {
    await withRecovery(async () => {
      const entry = await this.getConnection(id);

      entry.metrics.errors++;
      entry.metrics.retryCount++;

      metricsCollector.recordMetric(`connection.${id}.errors`, entry.metrics.errors);
      eventBus.emit('connectionError', { id, error, retryCount: entry.metrics.retryCount });

      if (entry.metrics.retryCount <= this.options.recovery.maxRetries) {
        const delay = Math.min(
          this.options.recovery.initialDelay * Math.pow(
            this.options.recovery.backoffFactor,
            entry.metrics.retryCount - 1
          ),
          this.options.recovery.maxDelay
        );

        entry.metrics.lastRetryDelay = delay;
        entry.metrics.status = "active";

        await new Promise(resolve => setTimeout(resolve, delay));
        entry.metrics.errors--;
        return;
      }

      entry.metrics.status = "error";
      entry.metrics.failedConnections++;
      eventBus.emit('connectionFailed', { id, error, retryCount: entry.metrics.retryCount });

      // Release the connection back to the pool in error state
      this.pool.release(id);

      throw new McpError(
        ErrorCode.InvalidParams,
        `Connection ${id} failed: exceeded retry limit (${this.options.recovery.maxRetries})`
      );
    }, this.options.recovery);
  }

  /**
   * Get metrics from the connection pool
   */
  public getAggregateMetrics(): ConnectionMetrics {
    const poolMetrics = this.pool.getMetrics();
    return {
      retryCount: 0,
      lastRetryDelay: 0,
      created: new Date(),
      lastUsed: new Date(),
      useCount: poolMetrics.acquireCount,
      errors: poolMetrics.acquireFailCount,
      avgResponseTime: poolMetrics.avgAcquireTime,
      status: "active",
      successfulConnections: poolMetrics.totalCreated,
      failedConnections: poolMetrics.acquireFailCount,
      totalOperations: poolMetrics.acquireCount
    };
  }

  /**
   * Clean up resources including the connection pool
   */
  public destroy(): void {
    this.pool.destroy();
    eventBus.emit('connectionManagerDestroyed');
  }
}

// Export schemas for documentation
export {
  ConnectionMetricsSchema,
  CacheEntrySchema
};
