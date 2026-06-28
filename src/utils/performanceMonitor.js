/**
 * PerformanceMonitor — Real-time sync metrics, latency percentiles, error rates
 * 
 * What Google/Uber/Duolingo use:
 * - Real-time performance dashboards (Google SRE principles)
 * - Latency percentiles (p50, p95, p99) not just averages
 * - Error rate tracking with automatic alerting
 * - Throughput metrics (operations per second)
 * - SLA tracking (99.9% sync success rate)
 * - Custom performance marks for critical paths
 * 
 * Architecture:
 *   Every write/read/sync operation → record timing → compute metrics → emit events
 *   Dashboard subscribes → shows real-time graphs
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PERFORMANCE METRICS
// ═══════════════════════════════════════════════════════════════════════════════

class PerformanceMetrics {
  constructor() {
    this._samples = new Map(); // metric → [{ value, timestamp, metadata }]
    this._counters = new Map(); // metric → { count, total, errors }
    this._listeners = new Set();
    this._maxSamples = 1000;
    this._marks = new Map(); // name → start time
  }

  /**
   * Record a timing sample.
   */
  record(metric, valueMs, metadata = {}) {
    if (!this._samples.has(metric)) {
      this._samples.set(metric, []);
    }
    const samples = this._samples.get(metric);
    samples.push({
      value: valueMs,
      timestamp: Date.now(),
      ...metadata,
    });

    // Trim old samples
    if (samples.length > this._maxSamples) {
      samples.splice(0, samples.length - this._maxSamples);
    }

    // Update counters
    const counter = this._counters.get(metric) || { count: 0, total: 0, errors: 0 };
    counter.count++;
    counter.total += valueMs;
    if (metadata.error) counter.errors++;
    this._counters.set(metric, counter);

    this._notify({ type: 'sample', metric, value: valueMs, metadata });
  }

  /**
   * Record an error.
   */
  recordError(metric, error, context = {}) {
    this.record(metric, 0, { error: error?.message || String(error), ...context });
    this._notify({ type: 'error', metric, error, context });
  }

  /**
   * Start a performance mark.
   */
  mark(name) {
    this._marks.set(name, performance.now());
  }

  /**
   * End a performance mark and record the duration.
   */
  measure(name, metric) {
    const start = this._marks.get(name);
    if (start === undefined) return null;
    const duration = Math.round(performance.now() - start);
    this._marks.delete(name);
    this.record(metric || name, duration);
    return duration;
  }

  /**
   * Get percentile for a metric.
   */
  getPercentile(metric, percentile) {
    const samples = this._samples.get(metric) || [];
    if (samples.length === 0) return null;

    const sorted = [...samples].sort((a, b) => a.value - b.value);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)]?.value || null;
  }

  /**
   * Get statistics for a metric.
   */
  getStats(metric) {
    const samples = this._samples.get(metric) || [];
    const counter = this._counters.get(metric) || { count: 0, total: 0, errors: 0 };

    if (samples.length === 0) {
      return {
        count: counter.count,
        total: counter.total,
        errors: counter.errors,
        errorRate: 0,
        avg: 0,
        min: 0,
        max: 0,
        p50: null,
        p95: null,
        p99: null,
        recent: [],
      };
    }

    const values = samples.map(s => s.value).sort((a, b) => a - b);
    const recent = samples.slice(-10); // Last 10 samples

    return {
      count: counter.count,
      total: counter.total,
      errors: counter.errors,
      errorRate: counter.count > 0 ? (counter.errors / counter.count) * 100 : 0,
      avg: Math.round(counter.total / counter.count),
      min: values[0],
      max: values[values.length - 1],
      p50: this.getPercentile(metric, 50),
      p95: this.getPercentile(metric, 95),
      p99: this.getPercentile(metric, 99),
      recent: recent.map(s => ({ value: s.value, at: s.timestamp })),
    };
  }

  /**
   * Get all metrics with their stats.
   */
  getAllStats() {
    const result = {};
    for (const metric of this._samples.keys()) {
      result[metric] = this.getStats(metric);
    }
    return result;
  }

  /**
   * Get throughput (operations per second) for a metric.
   */
  getThroughput(metric, windowMs = 60000) {
    const samples = this._samples.get(metric) || [];
    const cutoff = Date.now() - windowMs;
    const recent = samples.filter(s => s.timestamp > cutoff);
    return Math.round((recent.length / windowMs) * 1000 * 10) / 10; // ops/sec
  }

  /**
   * Get SLA compliance (percentage of operations under threshold).
   */
  getSLA(metric, thresholdMs) {
    const samples = this._samples.get(metric) || [];
    if (samples.length === 0) return 100; // No data = compliant

    const compliant = samples.filter(s => s.value <= thresholdMs).length;
    return Math.round((compliant / samples.length) * 10000) / 100; // 2 decimal places
  }

  /**
   * Subscribe to metric events.
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  /**
   * Clear all metrics.
   */
  clear() {
    this._samples.clear();
    this._counters.clear();
    this._marks.clear();
    this._notify({ type: 'cleared' });
  }

  _notify(event) {
    this._listeners.forEach(cb => cb(event));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON METRICS INSTANCES
// ═══════════════════════════════════════════════════════════════════════════════

export const firestoreWriteMetrics = new PerformanceMetrics();
export const firestoreReadMetrics = new PerformanceMetrics();
export const indexedDBMetrics = new PerformanceMetrics();
export const syncMetrics = new PerformanceMetrics();
export const uiMetrics = new PerformanceMetrics();

/**
 * Convenience functions for common measurements.
 */
export function measureFirestoreWrite(operation, fn) {
  return async (...args) => {
    firestoreWriteMetrics.mark(`write-${operation}`);
    try {
      const result = await fn(...args);
      firestoreWriteMetrics.measure(`write-${operation}`, `firestore-write`);
      return result;
    } catch (err) {
      firestoreWriteMetrics.recordError(`firestore-write`, err, { operation });
      throw err;
    }
  };
}

export function measureFirestoreRead(operation, fn) {
  return async (...args) => {
    firestoreReadMetrics.mark(`read-${operation}`);
    try {
      const result = await fn(...args);
      firestoreReadMetrics.measure(`read-${operation}`, `firestore-read`);
      return result;
    } catch (err) {
      firestoreReadMetrics.recordError(`firestore-read`, err, { operation });
      throw err;
    }
  };
}

/**
 * Get a dashboard-ready summary of all performance metrics.
 */
export function getPerformanceDashboard() {
  return {
    firestore: {
      writes: firestoreWriteMetrics.getAllStats(),
      reads: firestoreReadMetrics.getAllStats(),
    },
    indexedDB: indexedDBMetrics.getAllStats(),
    sync: syncMetrics.getAllStats(),
    ui: uiMetrics.getAllStats(),
    summary: {
      firestoreWriteSLA: firestoreWriteMetrics.getSLA('firestore-write', 2000),
      firestoreReadSLA: firestoreReadMetrics.getSLA('firestore-read', 500),
      syncSuccessRate: syncMetrics.getStats('sync-complete').errorRate === 0 
        ? 100 
        : 100 - syncMetrics.getStats('sync-complete').errorRate,
      totalOperations: 
        (firestoreWriteMetrics.getStats('firestore-write').count || 0) +
        (firestoreReadMetrics.getStats('firestore-read').count || 0),
    },
    timestamp: Date.now(),
  };
}

export default {
  firestoreWriteMetrics,
  firestoreReadMetrics,
  indexedDBMetrics,
  syncMetrics,
  uiMetrics,
  measureFirestoreWrite,
  measureFirestoreRead,
  getPerformanceDashboard,
};
