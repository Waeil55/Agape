/**
 * SagaPattern — Multi-step operations with compensation
 *
 * What Google/Uber/Netflix use:
 * - Long-running operations that span multiple steps
 * - Compensation logic: if step 3 fails, undo steps 1 and 2
 * - Saga orchestrator: manages the workflow state
 * - Timeout handling: auto-compensate if a step takes too long
 * - Audit trail: every step and compensation is logged
 *
 * Architecture:
 *   Saga = Sequence of Steps
 *   Each step has: execute(), compensate(), timeout
 *   If any step fails → run compensations in reverse order
 *   If timeout → auto-compensate
 *
 * Example: Archive trip saga
 *   Step 1: Move trip to trashedTrips (compensate: move back)
 *   Step 2: Update tripLedger (compensate: revert ledger)
 *   Step 3: Send notification (compensate: send un-archive notification)
 *   If step 2 fails → undo step 1 (move trip back)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SAGA STATES
// ═══════════════════════════════════════════════════════════════════════════════

export const SagaState = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  COMPENSATING: 'compensating',
  COMPENSATED: 'compensated',
  FAILED: 'failed',
  TIMED_OUT: 'timed_out',
};

// ═══════════════════════════════════════════════════════════════════════════════
// SAGA STEP
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} SagaStep
 * @property {string} name - Step name
 * @property {Function} execute - Async function to execute the step
 * @property {Function} compensate - Async function to undo the step
 * @property {number} timeout - Max time in ms before auto-compensate
 * @property {Function} [canExecute] - Optional: check if step should run
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SAGA EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════════

class SagaExecutor {
  constructor() {
    this._sagas = new Map(); // sagaId → saga state
    this._listeners = new Set();
    this._history = [];
  }

  /**
   * Execute a saga (sequence of steps with compensation).
   * @param {string} sagaId - Unique identifier for this saga instance
   * @param {SagaStep[]} steps - Array of steps to execute
   * @param {Object} context - Shared context passed to all steps
   * @returns {Object} Saga result
   */
  async execute(sagaId, steps, context = {}) {
    const saga = {
      id: sagaId,
      state: SagaState.RUNNING,
      steps: steps.map(s => ({ name: s.name, state: 'pending', result: null })),
      currentStep: 0,
      context,
      startedAt: Date.now(),
      completedAt: null,
      error: null,
      compensationsRun: [],
    };

    this._sagas.set(sagaId, saga);
    this._notify({ type: 'saga-started', saga: { ...saga } });

    const completedSteps = [];

    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        saga.currentStep = i;
        saga.steps[i].state = 'running';

        // Check if step should execute
        if (step.canExecute && !step.canExecute(context)) {
          saga.steps[i].state = 'skipped';
          this._notify({ type: 'step-skipped', sagaId, step: step.name, index: i });
          continue;
        }

        this._notify({ type: 'step-started', sagaId, step: step.name, index: i });

        try {
          // Execute with timeout
          const result = await this._executeWithTimeout(
            () => step.execute(context),
            step.timeout || 30000,
            step.name
          );

          saga.steps[i].state = 'completed';
          saga.steps[i].result = result;
          completedSteps.push({ step, index: i, result });

          // Update context with step result
          if (result && typeof result === 'object') {
            context = { ...context, ...result };
          }

          this._notify({ type: 'step-completed', sagaId, step: step.name, index: i, result });
        } catch (err) {
          saga.steps[i].state = 'failed';
          saga.steps[i].error = err.message;
          throw err; // Trigger compensation
        }
      }

      // All steps completed
      saga.state = SagaState.COMPLETED;
      saga.completedAt = Date.now();
      this._notify({ type: 'saga-completed', saga: { ...saga } });

      return { success: true, saga: { ...saga }, context };
    } catch (err) {
      saga.state = SagaState.COMPENSATING;
      saga.error = err.message;
      this._notify({ type: 'saga-compensating', saga: { ...saga }, error: err.message });

      // Compensate in reverse order
      for (let i = completedSteps.length - 1; i >= 0; i--) {
        const { step, index } = completedSteps[i];
        try {
          await this._executeWithTimeout(
            () => step.compensate(context, completedSteps[i].result),
            step.timeout || 15000,
            `compensate:${step.name}`
          );
          saga.compensationsRun.push(step.name);
          this._notify({ type: 'compensation-completed', sagaId, step: step.name });
        } catch (compErr) {
          console.error(`[Saga] Compensation failed for ${step.name}:`, compErr);
          this._notify({ type: 'compensation-failed', sagaId, step: step.name, error: compErr.message });
        }
      }

      saga.state = SagaState.COMPENSATED;
      saga.completedAt = Date.now();
      this._notify({ type: 'saga-compensated', saga: { ...saga } });

      return { success: false, saga: { ...saga }, error: err.message };
    }
  }

  /**
   * Get saga state.
   */
  getSaga(sagaId) {
    return this._sagas.get(sagaId) || null;
  }

  /**
   * Get all sagas.
   */
  getAllSagas() {
    return [...this._sagas.values()];
  }

  /**
   * Get saga history.
   */
  getHistory() {
    return [...this._history];
  }

  /**
   * Subscribe to saga events.
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  // ── Private methods ──────────────────────────────────────────────────────

  async _executeWithTimeout(fn, timeoutMs, stepName) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Step '${stepName}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fn().then(result => {
        clearTimeout(timer);
        resolve(result);
      }).catch(err => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  _notify(event) {
    this._history.push({ ...event, timestamp: Date.now() });
    if (this._history.length > 500) this._history.shift();
    this._listeners.forEach(cb => cb(event));
  }
}

export const sagaExecutor = new SagaExecutor();

// ═══════════════════════════════════════════════════════════════════════════════
// PRE-BUILT SAGAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Archive Trip Saga — multi-step with compensation.
 */
export function createArchiveTripSaga(trip, setTripsAndTrashed, addAuditLog, user) {
  return {
    id: `archive-trip-${trip.id}-${Date.now()}`,
    steps: [
      {
        name: 'move-to-trash',
        timeout: 10000,
        execute: async (ctx) => {
          const { trips, trashedTrips } = ctx;
          const newTrips = trips.filter(t => t.id !== trip.id);
          const newTrashed = [trip, ...trashedTrips];
          await setTripsAndTrashed(newTrips, newTrashed);
          return { newTrips, newTrashed };
        },
        compensate: async (ctx, result) => {
          if (result) {
            await setTripsAndTrashed(result.newTrips, result.newTrashed);
          }
        },
      },
      {
        name: 'audit-log',
        timeout: 5000,
        execute: async (ctx) => {
          addAuditLog('Trip Archived', `${user} archived trip ${trip.id} (${trip.patient}).`, 'rose');
        },
        compensate: async (ctx) => {
          addAuditLog('Archive Reverted', `Archive of trip ${trip.id} was reverted.`, 'emerald');
        },
      },
    ],
    context: {
      trip,
      trips: [], // Will be populated from current state
      trashedTrips: [],
    },
  };
}

/**
 * Bulk Archive Saga — multi-step with compensation.
 */
export function createBulkArchiveSaga(trips, setTripsAndTrashed, addAuditLog, user) {
  return {
    id: `bulk-archive-${Date.now()}`,
    steps: [
      {
        name: 'bulk-move-to-trash',
        timeout: 30000,
        execute: async (ctx) => {
          const { currentTrips, currentTrashed } = ctx;
          const tripIds = new Set(trips.map(t => t.id));
          const newTrips = currentTrips.filter(t => !tripIds.has(t.id));
          const newTrashed = [...trips, ...currentTrashed];
          await setTripsAndTrashed(newTrips, newTrashed);
          return { newTrips, newTrashed };
        },
        compensate: async (ctx, result) => {
          if (result) {
            await setTripsAndTrashed(result.newTrips, result.newTrashed);
          }
        },
      },
      {
        name: 'bulk-audit-log',
        timeout: 5000,
        execute: async (ctx) => {
          addAuditLog('Bulk Archive', `${user} archived ${trips.length} trips.`, 'rose');
        },
        compensate: async (ctx) => {
          addAuditLog('Bulk Archive Reverted', `Archive of ${trips.length} trips was reverted.`, 'emerald');
        },
      },
    ],
    context: {
      currentTrips: [],
      currentTrashed: [],
    },
  };
}

export default {
  SagaExecutor,
  SagaState,
  sagaExecutor,
  createArchiveTripSaga,
  createBulkArchiveSaga,
};
