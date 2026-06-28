/**
 * RequestDeduplication — Prevent duplicate writes from double-clicks
 * 
 * What Google/Uber/Netflix use:
 * - Idempotency keys: every write gets a unique key
 * - In-flight tracking: don't send the same request twice
 * - Coalescing: multiple rapid triggers → one execution
 * - Debounced deduplication for rapid UI interactions
 * 
 * Architecture:
 *   Button click → Generate idempotency key → Check in-flight map
 *   If key exists → skip (duplicate)
 *   If key new → execute, add to in-flight, remove on completion
 */

// ═══════════════════════════════════════════════════════════════════════════════
// DEDUPLICATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

class RequestDeduplication {
  constructor() {
    this._inflight = new Map();    // idempotencyKey → { promise, timestamp, operation }
    this._completed = new Map();   // idempotencyKey → result (for recent results)
    this._listeners = new Set();
    this._completedExpiry = 30000; // Keep completed entries for 30s
    this._inflightExpiry = 60000;  // Force-expire in-flight after 60s
  }

  /**
   * Generate a unique idempotency key.
   * @param {string} operation - Operation name
   * @param {Object} params - Operation parameters (used for dedup)
   * @returns {string} Idempotency key
   */
  generateKey(operation, params = {}) {
    const paramHash = JSON.stringify(params, Object.keys(params).sort());
    let hash = 0;
    for (let i = 0; i < paramHash.length; i++) {
      const chr = paramHash.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return `${operation}:${hash}:${Date.now()}`;
  }

  /**
   * Execute an operation with deduplication.
   * @param {string} idempotencyKey - Unique key for this request
   * @param {Function} fn - Async function to execute
   * @returns {Object} { executed, result }
   */
  async execute(idempotencyKey, fn) {
    // Check if already in-flight
    if (this._inflight.has(idempotencyKey)) {
      this._notify({ type: 'dedup-blocked', key: idempotencyKey, reason: 'in-flight' });
      return { executed: false, result: null, reason: 'in-flight' };
    }

    // Check if recently completed
    if (this._completed.has(idempotencyKey)) {
      this._notify({ type: 'dedup-blocked', key: idempotencyKey, reason: 'recently-completed' });
      return { executed: false, result: this._completed.get(idempotencyKey), reason: 'recently-completed' };
    }

    // Execute
    const entry = { promise: null, timestamp: Date.now(), operation: idempotencyKey.split(':')[0] };
    this._inflight.set(idempotencyKey, entry);
    this._notify({ type: 'dedup-started', key: idempotencyKey });

    try {
      const result = await fn();
      entry.result = result;
      this._completed.set(idempotencyKey, result);
      this._cleanup();
      this._notify({ type: 'dedup-completed', key: idempotencyKey });
      return { executed: true, result };
    } catch (err) {
      this._notify({ type: 'dedup-error', key: idempotencyKey, error: err.message });
      throw err;
    } finally {
      this._inflight.delete(idempotencyKey);
    }
  }

  /**
   * Check if an operation is in-flight.
   */
  isInflight(idempotencyKey) {
    return this._inflight.has(idempotencyKey);
  }

  /**
   * Get all in-flight operations.
   */
  getInflight() {
    return [...this._inflight.entries()].map(([key, entry]) => ({
      key,
      operation: entry.operation,
      age: Date.now() - entry.timestamp,
    }));
  }

  /**
   * Cancel an in-flight operation (best effort).
   */
  cancel(idempotencyKey) {
    const entry = this._inflight.get(idempotencyKey);
    if (entry) {
      this._inflight.delete(idempotencyKey);
      this._notify({ type: 'dedup-cancelled', key: idempotencyKey });
      return true;
    }
    return false;
  }

  /**
   * Subscribe to dedup events.
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  _cleanup() {
    const now = Date.now();
    // Remove expired completed entries
    for (const [key, entry] of this._completed) {
      if (entry && entry.timestamp && now - entry.timestamp > this._completedExpiry) {
        this._completed.delete(key);
      }
    }
    // Force-expire old in-flight entries
    for (const [key, entry] of this._inflight) {
      if (now - entry.timestamp > this._inflightExpiry) {
        this._inflight.delete(key);
        this._notify({ type: 'dedup-expired', key });
      }
    }
  }

  _notify(event) {
    this._listeners.forEach(cb => cb(event));
  }
}

export const requestDedup = new RequestDeduplication();

// ═══════════════════════════════════════════════════════════════════════════════
// DEBOUNCE DEDUP — For rapid UI interactions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a deduplicated debounced function.
 * Multiple rapid calls within `delay` ms → only one execution.
 */
export function createDedupedDebounce(fn, delay = 300) {
  let timeoutId = null;
  let lastArgs = null;
  let lastPromise = null;

  return function dedupedFn(...args) {
    lastArgs = args;

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    return new Promise((resolve, reject) => {
      timeoutId = setTimeout(async () => {
        try {
          const result = await fn(...lastArgs);
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          timeoutId = null;
          lastArgs = null;
        }
      }, delay);
    });
  };
}

export default requestDedup;
