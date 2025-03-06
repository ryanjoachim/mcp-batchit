import { z } from "zod";
import { eventBus } from "./eventBus.js";
import { metricsCollector } from "./metricsCollector.js";

// Analysis configuration schema
const AnalysisConfigSchema = z.object({
  // Time windows for analysis (in milliseconds)
  timeWindows: z.object({
    short: z.number().default(60000),    // 1 minute
    medium: z.number().default(300000),   // 5 minutes
    long: z.number().default(3600000)     // 1 hour
  }).default({}),

  // Performance thresholds
  thresholds: z.object({
    errorRate: z.number().default(0.05),           // 5% error rate threshold
    responseTime: z.number().default(200),         // 200ms response time threshold
    resourceUtilization: z.number().default(0.8),  // 80% resource utilization threshold
    connectionLimit: z.number().default(50)        // Maximum concurrent connections
  }).default({}),

  // Analysis intervals
  analysisInterval: z.number().default(60000)      // Run analysis every minute
});

type AnalysisConfig = z.infer<typeof AnalysisConfigSchema>;

// Performance metrics types
interface TimeWindowStats {
  min: number;
  max: number;
  avg: number;
  p95: number;
  count: number;
}

interface PerformanceMetrics {
  errorRate: TimeWindowStats;
  responseTime: TimeWindowStats;
  connectionCount: TimeWindowStats;
  resourceUtilization: TimeWindowStats;
}

interface AnalysisResult {
  timestamp: string;
  timeWindow: number;
  metrics: PerformanceMetrics;
  thresholdViolations: Array<{
    metric: string;
    threshold: number;
    value: number;
  }>;
}

/**
 * Analyzes metrics data to provide performance insights and monitoring
 */
export class MetricsAnalyzer {
  private static instance: MetricsAnalyzer;
  private analysisTimer: NodeJS.Timeout;

  private constructor(private readonly config: AnalysisConfig) {
    const validated = AnalysisConfigSchema.parse(config);
    this.config = validated;

    // Start periodic analysis
    this.analysisTimer = setInterval(() => {
      this.analyze().catch(error => {
        console.error("[MetricsAnalyzer] Analysis error:", error);
        eventBus.emit("metricsAnalyzer.error", { error });
      });
    }, this.config.analysisInterval);
  }

  /**
   * Get singleton instance of the metrics analyzer
   */
  public static getInstance(config?: AnalysisConfig): MetricsAnalyzer {
    if (!MetricsAnalyzer.instance) {
      MetricsAnalyzer.instance = new MetricsAnalyzer(config || {
        timeWindows: {
          short: 60000,
          medium: 300000,
          long: 3600000
        },
        thresholds: {
          errorRate: 0.05,
          responseTime: 200,
          resourceUtilization: 0.8,
          connectionLimit: 50
        },
        analysisInterval: 60000
      });
    }
    return MetricsAnalyzer.instance;
  }

  /**
   * Analyze metrics for a specific time window
   */
  private analyzeTimeWindow(metrics: Array<{ value: number; timestamp: number }>, timeWindow: number): TimeWindowStats {
    const now = Date.now();
    const relevantMetrics = metrics
      .filter(m => m.timestamp >= now - timeWindow)
      .map(m => m.value)
      .sort((a, b) => a - b);

    if (relevantMetrics.length === 0) {
      return {
        min: 0,
        max: 0,
        avg: 0,
        p95: 0,
        count: 0
      };
    }

    const sum = relevantMetrics.reduce((a, b) => a + b, 0);
    const p95Index = Math.floor(relevantMetrics.length * 0.95);

    return {
      min: relevantMetrics[0],
      max: relevantMetrics[relevantMetrics.length - 1],
      avg: sum / relevantMetrics.length,
      p95: relevantMetrics[p95Index],
      count: relevantMetrics.length
    };
  }

  /**
   * Check for threshold violations
   */
  private checkThresholds(metrics: PerformanceMetrics): Array<{metric: string; threshold: number; value: number}> {
    const violations: Array<{metric: string; threshold: number; value: number}> = [];

    if (metrics.errorRate.avg > this.config.thresholds.errorRate) {
      violations.push({
        metric: "errorRate",
        threshold: this.config.thresholds.errorRate,
        value: metrics.errorRate.avg
      });
    }

    if (metrics.responseTime.p95 > this.config.thresholds.responseTime) {
      violations.push({
        metric: "responseTime",
        threshold: this.config.thresholds.responseTime,
        value: metrics.responseTime.p95
      });
    }

    if (metrics.resourceUtilization.avg > this.config.thresholds.resourceUtilization) {
      violations.push({
        metric: "resourceUtilization",
        threshold: this.config.thresholds.resourceUtilization,
        value: metrics.resourceUtilization.avg
      });
    }

    if (metrics.connectionCount.max > this.config.thresholds.connectionLimit) {
      violations.push({
        metric: "connectionCount",
        threshold: this.config.thresholds.connectionLimit,
        value: metrics.connectionCount.max
      });
    }

    return violations;
  }

  /**
   * Analyze all metrics and generate performance report
   */
  public async analyze(): Promise<AnalysisResult> {
    const allMetrics = metricsCollector.getAllMetrics();
    const timeWindow = this.config.timeWindows.medium; // Use medium window as default

    // Calculate performance metrics
    const performanceMetrics: PerformanceMetrics = {
      errorRate: this.analyzeTimeWindow(
        Object.entries(allMetrics)
          .filter(([key]) => key.includes(".errors"))
          .map(([, values]) => values[0]),
        timeWindow
      ),
      responseTime: this.analyzeTimeWindow(
        Object.entries(allMetrics)
          .filter(([key]) => key.includes(".responseTime"))
          .map(([, values]) => values[0]),
        timeWindow
      ),
      connectionCount: this.analyzeTimeWindow(
        Object.entries(allMetrics)
          .filter(([key]) => key.includes(".connections."))
          .map(([, values]) => values[0]),
        timeWindow
      ),
      resourceUtilization: this.analyzeTimeWindow(
        Object.entries(allMetrics)
          .filter(([key]) => key.includes(".utilization"))
          .map(([, values]) => values[0]),
        timeWindow
      )
    };

    // Check for threshold violations
    const violations = this.checkThresholds(performanceMetrics);

    // Create analysis result
    const result: AnalysisResult = {
      timestamp: new Date().toISOString(),
      timeWindow,
      metrics: performanceMetrics,
      thresholdViolations: violations
    };

    // Emit results
    eventBus.emit("metricsAnalyzer.result", result);

    // Record aggregate metrics
    metricsCollector.recordMetric("analysis.errorRate", performanceMetrics.errorRate.avg);
    metricsCollector.recordMetric("analysis.responseTime.p95", performanceMetrics.responseTime.p95);
    metricsCollector.recordMetric("analysis.connectionCount.max", performanceMetrics.connectionCount.max);
    metricsCollector.recordMetric("analysis.thresholdViolations", violations.length);

    return result;
  }

  /**
   * Get performance report for specific time window
   */
  public async getPerformanceReport(timeWindow?: number): Promise<AnalysisResult> {
    const result = await this.analyze();
    if (timeWindow) {
      result.timeWindow = timeWindow;
    }
    return result;
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    clearInterval(this.analysisTimer);
    eventBus.emit("metricsAnalyzer.destroyed");
  }
}

// Export schemas for documentation
export {
  AnalysisConfigSchema
};
