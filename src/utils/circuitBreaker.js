/**
 * CircuitBreaker — Stop hammering Firestore when down, auto-recover
 *
 * What Google/Netflix/Uber use:
 * - Circuit breaker pattern (Martin Fowler) to prevent cascading failures
 * - Three states: CLOSED (normal), OPEN (blocking), HALF_OPEN (testing)
 * - Automatic recovery with probe requests
 * - Fallback strategies when circuit is open
 * - Metrics: failure rate, success rate, response time
 *
 * Architecture:
 *   Normal → [failures > threshold] → Open → [timeout] → Half-Open → [probe success] → Closed
 *                                     ↑                          ↓
 *                                     └───── [probe fail] ───────┘
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CIRCUIT STATES
// ═══════════════════════════════════════════════════════════════════════════════

export const CircuitState = {
  CLOSED: 'closed',       // Normal operation, requests pass through
  OPEN: 'open',           // Circuit tripped, requests are blocked
  HALF_OPEN: 'half_open', // Testing if service recovered
};

// ═══════════════════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class CircuitBreaker {
  /**
   * @param {Object} options
   * @param {string} options.name - Name for this circuit (e.g., 'firestore-write')
   * @param {number} options.failureThreshold - Failures before opening (default: 5)
   * @param {number} options.successThreshold - Successes before closing from half-open (default: 3)
   * @param {number} options.timeout - Time before half-open (default: 30s)
   * @param {number} options.monitorWindow - Window for failure rate calculation (default: 60s)
   * @param {Function} options.fallback - Fallback function when circuit is open
   */
  constructor(options = {}) {
    this.name = options.name || 'circuit';
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 3;
    this.timeout = options.timeout || 30000;
    this.monitorWindow = options.monitorWindow || 60000;
    this.fallback = options.fallback || null;

    this._state = CircuitState.CLOSED;
    this._failureCount = 0;
    this._successCount = 0;
    this._lastFailureTime = null;
    this._lastStateChange = Date.now();
    this._history = []; // Recent success/failure records
    this._listeners = new Set();
    this._probeTimer = null;
  }

  /**
   * Get current circuit state.
   */
  getState() {
    return this._state;
  }

  /**
   * Check if the circuit is allowing requests.
   */
  canExecute() {
    if (this._state === CircuitState.CLOSED) return true;

    if (this._state === CircuitState.OPEN) {
      // Check if timeout has elapsed → move to HALF_OPEN
      if (Date.now() - this._lastStateChange >= this.timeout) {
        this._transition(CircuitState.HALF_OPEN);
        return true; // Allow one probe request
      }
      return false; // Still open, block requests
    }

    if (this._state === CircuitState.HALF_OPEN) {
      return true; // Allow probe requests
    }

    return false;
  }

  /**
   * Execute a function with circuit breaker protection.
   * Falls back if circuit is open.
   */
  async execute(fn, fallbackFn = null) {
    if (!this.canExecute()) {
      const fallback = fallbackFn || this.fallback;
      if (fallback) {
        return await fallback();
      }
      throw new Error(`Circuit '${this.name}' is OPEN — requests blocked`);
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure(err);
      throw err;
    }
  }

  /**
   * Record a successful operation.
   */
  recordSuccess() {
    this._recordResult(true);

    if (this._state === CircuitState.HALF_OPEN) {
      this._successCount++;
      if (this._successCount >= this.successThreshold) {
        this._transition(CircuitState.CLOSED);
      }
    } else if (this._state === CircuitState.CLOSED) {
      this._failureCount = Math.max(0, this._failureCount - 1); // Decay failures
    }
  }

  /**
   * Record a failed operation.
   */
  recordFailure(error = null) {
    this._recordResult(false, error);

    if (this._state === CircuitState.HALF_OPEN) {
      // Probe failed → reopen circuit
      this._transition(CircuitState.OPEN);
      return;
    }

    if (this._state === CircuitState.CLOSED) {
      this._failureCount++;
      this._lastFailureTime = Date.now();

      if (this._failureCount >= this.failureThreshold) {
        this._transition(CircuitState.OPEN);
      }
    }
  }

  /**
   * Get circuit metrics.
   */
  getMetrics() {
    const now = Date.now();
    const windowStart = now - this.monitorWindow;
    const recentResults = this._history.filter(r => r.timestamp > windowStart);

    const successes = recentResults.filter(r => r.success).length;
    const failures = recentResults.filter(r => !r.success).length;
    const total = successes + failures;

    return {
      state: this._state,
      failureCount: this._failureCount,
      successCount: this._successCount,
      lastFailureTime: this._lastFailureTime,
      lastStateChange: this._lastStateChange,
      recentSuccessRate: total > 0 ? (successes / total) * 100 : 100,
      recentFailureRate: total > 0 ? (failures / total) * 100 : 0,
      totalOperations: this._history.length,
      recentOperations: total,
      timeInCurrentState: now - this._lastStateChange,
      nextProbeAt: this._state === CircuitState.OPEN
        ? this._lastStateChange + this.timeout
        : null,
    };
  }

  /**
   * Manually reset the circuit to CLOSED.
   */
  reset() {
    this._transition(CircuitState.CLOSED);
    this._failureCount = 0;
    this._successCount = 0;
  }

  /**
   * Subscribe to state changes.
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  // ── Private methods ──────────────────────────────────────────────────────

  _transition(newState) {
    if (this._state === newState) return;
    const oldState = this._state;
    this._state = newState;
    this._lastStateChange = Date.now();

    if (newState === CircuitState.CLOSED) {
      this._failureCount = 0;
      this._successCount = 0;
    } else if (newState === CircuitState.OPEN) {
      this._successCount = 0;
      // Schedule transition to HALF_OPEN
      if (this._probeTimer) clearTimeout(this._probeTimer);
      this._probeTimer = setTimeout(() => {
        if (this._state === CircuitState.OPEN) {
          this._transition(CircuitState.HALF_OPEN);
        }
      }, this.timeout);
    } else if (newState === CircuitState.HALF_OPEN) {
      this._successCount = 0;
    }

    this._notify({ type: 'state-change', from: oldState, to: newState, name: this.name });
  }

  _recordResult(success, error = null) {
    const record = {
      success,
      error: error?.message || null,
      timestamp: Date.now(),
    };

    this._history.push(record);
    if (this._history.length > 200) {
      this._history = this._history.slice(-200);
    }
  }

  _notify(event) {
    this._listeners.forEach(cb => cb(event));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRE-BUILT CIRCUIT BREAKERS
// ═══════════════════════════════════════════════════════════════════════════════

export const firestoreWriteCircuit = new CircuitBreaker({
  name: 'firestore-write',
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 30000,
  monitorWindow: 60000,
  fallback: null,
});

export const firestoreReadCircuit = new CircuitBreaker({
  name: 'firestore-read',
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 15000,
  monitorWindow: 60000,
});

export const indexedDBCircuit = new CircuitBreaker({
  name: 'indexeddb',
  failureThreshold: 10, // Higher threshold — IndexedDB rarely fails
  successThreshold: 2,
  timeout: 5000,
  monitorWindow: 60000,
});

/**
 * Get all circuit breaker metrics.
 */
export function getAllCircuitMetrics() {
  return {
    firestoreWrite: firestoreWriteCircuit.getMetrics(),
    firestoreRead: firestoreReadCircuit.getMetrics(),
    indexedDB: indexedDBCircuit.getMetrics(),
  };
}

/**
 * Reset all circuit breakers.
 */
export function resetAllCircuits() {
  firestoreWriteCircuit.reset();
  firestoreReadCircuit.reset();
  indexedDBCircuit.reset();
}

export default {
  CircuitBreaker,
  CircuitState,
  firestoreWriteCircuit,
  firestoreReadCircuit,
  indexedDBCircuit,
  getAllCircuitMetrics,
  resetAllCircuits,
};
