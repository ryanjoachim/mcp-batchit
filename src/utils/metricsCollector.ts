import { eventBus } from "./eventBus.js";

type MetricValue = {
  value: number;
  timestamp: number;
};

class MetricsCollector {
  private metrics: Map<string, MetricValue[]> = new Map();
  private readonly maxDataPoints: number = 1000; // Prevent unbounded growth

  recordMetric(name: string, value: number): void {
    const currentData = this.metrics.get(name) || [];
    const newDataPoint = {
      value,
      timestamp: Date.now()
    };

    // Add new data point while maintaining size limit
    currentData.push(newDataPoint);
    if (currentData.length > this.maxDataPoints) {
      currentData.shift();
    }

    this.metrics.set(name, currentData);

    // Emit event for real-time monitoring
    eventBus.emit('metricRecorded', { name, value, timestamp: newDataPoint.timestamp });
  }

  getMetric(name: string): MetricValue[] | undefined {
    return this.metrics.get(name);
  }

  getMetricAverage(name: string, timeWindowMs?: number): number | undefined {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return undefined;

    let relevantValues = values;
    if (timeWindowMs) {
      const cutoffTime = Date.now() - timeWindowMs;
      relevantValues = values.filter(v => v.timestamp >= cutoffTime);
    }

    if (relevantValues.length === 0) return undefined;

    const sum = relevantValues.reduce((acc, curr) => acc + curr.value, 0);
    return sum / relevantValues.length;
  }

  getAllMetrics(): { [key: string]: MetricValue[] } {
    const result: { [key: string]: MetricValue[] } = {};
    for (const [key, value] of this.metrics.entries()) {
      result[key] = value;
    }
    return result;
  }

  clearMetrics(): void {
    this.metrics.clear();
    eventBus.emit('metricsCleared');
  }
}

// Export singleton instance
export const metricsCollector = new MetricsCollector();
