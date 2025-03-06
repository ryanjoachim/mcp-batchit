import { z } from "zod";
import { eventBus } from "./eventBus.js";
import { metricsCollector } from "./metricsCollector.js";

// Connection pool configuration schema
const PoolConfigSchema = z.object({
  maxSize: z.number().default(100),
  minSize: z.number().default(1),
  idleTimeout: z.number().default(300000), // 5 minutes
  maxLifetime: z.number().default(3600000), // 1 hour
  acquireTimeout: z.number().default(30000), // 30 seconds
  validationInterval: z.number().default(60000) // 1 minute
});

export type PoolConfig = z.infer<typeof PoolConfigSchema>;

// Pool metrics schema
const PoolMetricsSchema = z.object({
  activeConnections: z.number(),
  idleConnections: z.number(),
  totalCreated: z.number(),
  totalReleased: z.number(),
  acquireCount: z.number(),
  acquireFailCount: z.number(),
  maxAcquireTime: z.number(),
  avgAcquireTime: z.number()
});

export type PoolMetrics = z.infer<typeof PoolMetricsSchema>;

interface PooledConnection {
  id: string;
  createdAt: Date;
  lastUsedAt: Date;
  useCount: number;
  isActive: boolean;
}

/**
 * Manages a pool of reusable connections with metrics and lifecycle management
 */
export class ConnectionPool {
  private static instance: ConnectionPool;
  private connections: Map<string, PooledConnection> = new Map();
  private metrics: PoolMetrics = {
    activeConnections: 0,
    idleConnections: 0,
    totalCreated: 0,
    totalReleased: 0,
    acquireCount: 0,
    acquireFailCount: 0,
    maxAcquireTime: 0,
    avgAcquireTime: 0
  };
  private validationTimer: NodeJS.Timeout;

  private constructor(private readonly config: PoolConfig) {
    const validated = PoolConfigSchema.parse(config);
    this.config = validated;

    // Start validation timer
    this.validationTimer = setInterval(() => {
      this.validateConnections();
    }, this.config.validationInterval);

    // Start metrics collection
    setInterval(() => {
      metricsCollector.recordMetric('pool.activeConnections', this.metrics.activeConnections);
      metricsCollector.recordMetric('pool.idleConnections', this.metrics.idleConnections);
      metricsCollector.recordMetric('pool.acquireCount', this.metrics.acquireCount);
      metricsCollector.recordMetric('pool.avgAcquireTime', this.metrics.avgAcquireTime);
    }, this.config.validationInterval);
  }

  /**
   * Get the singleton instance of the connection pool
   */
  public static getInstance(config?: PoolConfig): ConnectionPool {
    if (!ConnectionPool.instance) {
      ConnectionPool.instance = new ConnectionPool(config || {
        maxSize: 100,
        minSize: 1,
        idleTimeout: 300000,
        maxLifetime: 3600000,
        acquireTimeout: 30000,
        validationInterval: 60000
      });
    }
    return ConnectionPool.instance;
  }

  /**
   * Acquire a connection from the pool
   */
  public async acquire(id: string): Promise<PooledConnection> {
    const startTime = Date.now();

    try {
      let connection = this.connections.get(id);

      if (!connection) {
        if (this.connections.size >= this.config.maxSize) {
          // Try to clean up idle connections first
          this.validateConnections();

          if (this.connections.size >= this.config.maxSize) {
            throw new Error('Connection pool is full');
          }
        }

        // Create new connection
        connection = {
          id,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          useCount: 0,
          isActive: true
        };

        this.connections.set(id, connection);
        this.metrics.totalCreated++;
        this.metrics.activeConnections++;

        eventBus.emit('poolConnectionCreated', { id, timestamp: connection.createdAt });
      }

      // Update connection state
      connection.lastUsedAt = new Date();
      connection.useCount++;
      connection.isActive = true;

      // Update metrics
      this.metrics.acquireCount++;
      const acquireTime = Date.now() - startTime;
      this.metrics.maxAcquireTime = Math.max(this.metrics.maxAcquireTime, acquireTime);
      this.metrics.avgAcquireTime = (this.metrics.avgAcquireTime * (this.metrics.acquireCount - 1) + acquireTime) / this.metrics.acquireCount;

      metricsCollector.recordMetric(`pool.connection.${id}.useCount`, connection.useCount);

      return connection;
    } catch (error) {
      this.metrics.acquireFailCount++;
      eventBus.emit('poolAcquireFailed', { id, error });
      throw error;
    }
  }

  /**
   * Release a connection back to the pool
   */
  public release(id: string): void {
    const connection = this.connections.get(id);
    if (!connection) return;

    connection.isActive = false;
    connection.lastUsedAt = new Date();
    this.metrics.activeConnections--;
    this.metrics.idleConnections++;
    this.metrics.totalReleased++;

    eventBus.emit('poolConnectionReleased', { id, timestamp: connection.lastUsedAt });
  }

  /**
   * Validate connections and clean up stale ones
   */
  private validateConnections(): void {
    const now = new Date();

    for (const [id, connection] of this.connections.entries()) {
      const idleTime = now.getTime() - connection.lastUsedAt.getTime();
      const lifetime = now.getTime() - connection.createdAt.getTime();

      if (!connection.isActive && (
          idleTime > this.config.idleTimeout ||
          lifetime > this.config.maxLifetime ||
          this.connections.size > this.config.maxSize
      )) {
        this.connections.delete(id);
        this.metrics.idleConnections--;
        eventBus.emit('poolConnectionClosed', {
          id,
          reason: lifetime > this.config.maxLifetime ? 'max_lifetime' : 'idle_timeout'
        });
      }
    }

    // Record current metrics
    metricsCollector.recordMetric('pool.size', this.connections.size);
    metricsCollector.recordMetric('pool.activeConnections', this.metrics.activeConnections);
    metricsCollector.recordMetric('pool.idleConnections', this.metrics.idleConnections);
  }

  /**
   * Get current pool metrics
   */
  public getMetrics(): PoolMetrics {
    return { ...this.metrics };
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    clearInterval(this.validationTimer);
    this.connections.clear();
    eventBus.emit('poolDestroyed');
  }
}

// Export schemas for documentation
export {
  PoolConfigSchema,
  PoolMetricsSchema
};
