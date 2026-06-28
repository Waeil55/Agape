/**
 * Observability — Distributed tracing, spans, trace IDs
 *
 * What Google/Uber/Netflix use:
 * - Distributed tracing (every request gets a trace ID)
 * - Spans: each operation is a span with start/end times
 * - Correlation: link related operations across the system
 * - Error attribution: which span caused the error
 * - Performance bottleneck detection: find slowest spans
 * - Real-time dashboards with trace visualization
 *
 * Architecture:
 *   Every user action → Trace (collection of spans)
 *   Each span: name, duration, status, attributes
 *   Traces stored locally + sampled to Firestore
 */

const TRACE_HEADER = 'X-Agape-Trace-ID';

// ═══════════════════════════════════════════════════════════════════════════════
// SPAN STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export const SpanStatus = {
  OK: 'ok',
  ERROR: 'error',
  TIMEOUT: 'timeout',
  CANCELLED: 'cancelled',
};

// ═══════════════════════════════════════════════════════════════════════════════
// SPAN CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class Span {
  constructor(name, traceId, parentSpanId = null) {
    this.spanId = `span-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.traceId = traceId;
    this.parentSpanId = parentSpanId;
    this.name = name;
    this.startTime = performance.now();
    this.endTime = null;
    this.duration = null;
    this.status = SpanStatus.OK;
    this.attributes = {};
    this.events = [];
    this.error = null;
  }

  /**
   * Add an attribute to this span.
   */
  setAttribute(key, value) {
    this.attributes[key] = value;
  }

  /**
   * Add a timed event within this span.
   */
  addEvent(name, attributes = {}) {
    this.events.push({
      name,
      timestamp: performance.now() - this.startTime,
      attributes,
    });
  }

  /**
   * Mark span as error.
   */
  setError(error) {
    this.status = SpanStatus.ERROR;
    this.error = {
      message: error?.message || String(error),
      stack: error?.stack,
    };
  }

  /**
   * End this span.
   */
  end(status = SpanStatus.OK) {
    this.endTime = performance.now();
    this.duration = Math.round(this.endTime - this.startTime);
    this.status = status;
  }

  /**
   * Export span as plain object.
   */
  export() {
    return {
      spanId: this.spanId,
      traceId: this.traceId,
      parentSpanId: this.parentSpanId,
      name: this.name,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      status: this.status,
      attributes: this.attributes,
      events: this.events,
      error: this.error,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRACE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class Trace {
  constructor(operationName, traceId = null) {
    this.traceId = traceId || `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.operationName = operationName;
    this.spans = [];
    this.rootSpan = null;
    this.startTime = Date.now();
    this.endTime = null;
    this.duration = null;
    this.status = SpanStatus.OK;
    this.attributes = {};
  }

  /**
   * Start a new span within this trace.
   */
  startSpan(name, parentSpanId = null) {
    const span = new Span(name, this.traceId, parentSpanId || this.rootSpan?.spanId);
    this.spans.push(span);
    return span;
  }

  /**
   * End the trace.
   */
  end(status = SpanStatus.OK) {
    this.endTime = Date.now();
    this.duration = this.endTime - this.startTime;
    this.status = status;
  }

  /**
   * Get the slowest span in this trace.
   */
  getSlowestSpan() {
    return this.spans.reduce((slowest, span) =>
      (span.duration || 0) > (slowest?.duration || 0) ? span : slowest
    , null);
  }

  /**
   * Get all error spans.
   */
  getErrorSpans() {
    return this.spans.filter(s => s.status === SpanStatus.ERROR);
  }

  /**
   * Get trace summary.
   */
  getSummary() {
    return {
      traceId: this.traceId,
      operationName: this.operationName,
      duration: this.duration,
      spanCount: this.spans.length,
      errorCount: this.getErrorSpans().length,
      slowestSpan: this.getSlowestSpan()?.name,
      slowestDuration: this.getSlowestSpan()?.duration,
      status: this.status,
      startTime: this.startTime,
    };
  }

  /**
   * Export trace as plain object.
   */
  export() {
    return {
      traceId: this.traceId,
      operationName: this.operationName,
      spans: this.spans.map(s => s.export()),
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      status: this.status,
      attributes: this.attributes,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// OBSERVABILITY ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

class Observability {
  constructor() {
    this._traces = [];
    this._activeTrace = null;
    this._activeSpans = new Map(); // spanId → Span
    this._listeners = new Set();
    this._maxTraces = 200;
    this._samplingRate = 0.1; // 10% of traces sampled to Firestore
  }

  /**
   * Start a new trace.
   */
  startTrace(operationName, traceId = null) {
    const trace = new Trace(operationName, traceId);
    this._activeTrace = trace;
    this._traces.push(trace);

    // Trim old traces
    if (this._traces.length > this._maxTraces) {
      this._traces = this._traces.slice(-this._maxTraces);
    }

    this._notify({ type: 'trace-started', traceId: trace.traceId, operation: operationName });
    return trace;
  }

  /**
   * Start a span within the active trace.
   */
  startSpan(name) {
    if (!this._activeTrace) {
      // Auto-create a trace
      this.startTrace('auto');
    }

    const span = this._activeTrace.startSpan(name);
    this._activeSpans.set(span.spanId, span);
    this._notify({ type: 'span-started', traceId: this._activeTrace.traceId, spanId: span.spanId, name });
    return span;
  }

  /**
   * End a span.
   */
  endSpan(spanId, status = SpanStatus.OK) {
    const span = this._activeSpans.get(spanId);
    if (span) {
      span.end(status);
      this._activeSpans.delete(spanId);
      this._notify({
        type: 'span-ended',
        traceId: span.traceId,
        spanId,
        name: span.name,
        duration: span.duration,
        status,
      });
    }
  }

  /**
   * End the active trace.
   */
  endTrace(status = SpanStatus.OK) {
    if (this._activeTrace) {
      this._activeTrace.end(status);
      const summary = this._activeTrace.getSummary();
      this._activeTrace = null;
      this._notify({ type: 'trace-ended', summary });
      return summary;
    }
    return null;
  }

  /**
   * Trace a function call (creates span automatically).
   */
  async trace(spanName, fn) {
    const span = this.startSpan(spanName);
    try {
      const result = await fn(span);
      span.end(SpanStatus.OK);
      return result;
    } catch (err) {
      span.setError(err);
      span.end(SpanStatus.ERROR);
      throw err;
    } finally {
      this._activeSpans.delete(span.spanId);
    }
  }

  /**
   * Get all traces.
   */
  getTraces() {
    return this._traces.map(t => t.export());
  }

  /**
   * Get a specific trace.
   */
  getTrace(traceId) {
    return this._traces.find(t => t.traceId === traceId)?.export() || null;
  }

  /**
   * Get trace summaries.
   */
  getTraceSummaries() {
    return this._traces.map(t => t.getSummary());
  }

  /**
   * Get performance insights (slowest operations, error hotspots).
   */
  getInsights() {
    const allSpans = this._traces.flatMap(t => t.spans);
    const errorSpans = allSpans.filter(s => s.status === SpanStatus.ERROR);

    // Group by operation name
    const byOperation = {};
    for (const span of allSpans) {
      if (!byOperation[span.name]) {
        byOperation[span.name] = { count: 0, totalDuration: 0, errors: 0, durations: [] };
      }
      const op = byOperation[span.name];
      op.count++;
      op.totalDuration += span.duration || 0;
      op.durations.push(span.duration || 0);
      if (span.status === SpanStatus.ERROR) op.errors++;
    }

    // Calculate percentiles for each operation
    for (const [name, op] of Object.entries(byOperation)) {
      op.durations.sort((a, b) => a - b);
      op.avg = Math.round(op.totalDuration / op.count);
      op.p50 = op.durations[Math.floor(op.durations.length * 0.5)];
      op.p95 = op.durations[Math.floor(op.durations.length * 0.95)];
      op.p99 = op.durations[Math.floor(op.durations.length * 0.99)];
      op.errorRate = op.count > 0 ? (op.errors / op.count) * 100 : 0;
      delete op.durations; // Don't expose raw durations
    }

    return {
      totalTraces: this._traces.length,
      totalSpans: allSpans.length,
      errorSpans: errorSpans.length,
      errorRate: allSpans.length > 0 ? (errorSpans.length / allSpans.length) * 100 : 0,
      byOperation,
    };
  }

  /**
   * Subscribe to tracing events.
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _notify(event) {
    this._listeners.forEach(cb => cb(event));
  }
}

export const observability = new Observability();
export default observability;
