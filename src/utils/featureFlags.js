/**
 * FeatureFlags — Gradual rollout, kill switches, A/B testing
 * 
 * What Google/Lyft/Uber use:
 * - Feature flags for gradual rollout (1% → 10% → 50% → 100%)
 * - Kill switches to instantly disable broken features
 * - A/B testing infrastructure
 * - User segmentation (role-based, percentage-based, cohort-based)
 * - Flag evaluation at <1ms (in-memory, no network)
 * - Audit trail of flag changes
 * 
 * Architecture:
 *   Admin sets flag in Firestore → onSnapshot pushes to all clients
 *   Client evaluates flag locally (in-memory) → instant, no latency
 *   Kill switch: admin flips flag → all clients disable feature immediately
 */

import { db } from '../config/firebase';
import { doc, onSnapshot, setDoc, serverTimestamp } from '../config/firebase';

const FLAGS_DOC = 'systemConfig/featureFlags';

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT FLAGS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_FLAGS = {
  // Kill switches
  'kill.trip_archive': { enabled: true, description: 'Allow trip archiving' },
  'kill.bulk_operations': { enabled: true, description: 'Allow bulk operations' },
  'kill.ai_assignment': { enabled: true, description: 'Allow AI assignment' },
  'kill.data_export': { enabled: true, description: 'Allow data export' },
  'kill.notifications': { enabled: true, description: 'Allow push notifications' },

  // Gradual rollout features
  'feature.advanced_analytics': { enabled: false, rollout: 0, description: 'Advanced analytics dashboard' },
  'feature.route_optimization': { enabled: false, rollout: 0, description: 'AI route optimization' },
  'feature.real_time_traffic': { enabled: false, rollout: 0, description: 'Real-time traffic integration' },
  'feature.driver_scorecard': { enabled: false, rollout: 0, description: 'Driver performance scorecards' },
  'feature.auto_dispatch': { enabled: false, rollout: 0, description: 'Automatic trip dispatching' },

  // A/B tests
  'ab.new_dashboard_layout': { enabled: false, variants: ['control', 'variant_a', 'variant_b'], traffic: 0, description: 'Dashboard layout test' },
  'ab.optimized_trip_cards': { enabled: false, variants: ['control', 'variant_a'], traffic: 0, description: 'Trip card design test' },

  // Role-based flags
  'role.driver_can_add_trips': { enabled: true, roles: ['admin', 'driver'], description: 'Allow drivers to add trips' },
  'role.dispatcher_can_archive': { enabled: true, roles: ['admin', 'dispatcher'], description: 'Allow dispatchers to archive' },
  'role.driver_see_all_trips': { enabled: false, roles: ['admin'], description: 'Drivers see all trips' },

  // Environment flags
  'env.debug_mode': { enabled: false, description: 'Enable debug logging' },
  'env.offline_mode': { enabled: false, description: 'Force offline mode' },
  'env.slow_network_simulation': { enabled: false, description: 'Simulate slow network' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE FLAGS ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

class FeatureFlags {
  constructor() {
    this._flags = { ...DEFAULT_FLAGS };
    this._overrides = new Map(); // Local overrides (for testing)
    this._listeners = new Set();
    this._unsub = null;
    this._initialized = false;
    this._evaluationCache = new Map(); // key → result
    this._changeLog = [];
  }

  /**
   * Initialize: connect to Firestore for real-time flag updates.
   */
  init() {
    if (this._initialized) return;
    this._initialized = true;

    this._unsub = onSnapshot(doc(db, FLAGS_DOC), (snap) => {
      if (snap.exists()) {
        const remoteFlags = snap.data();
        // Merge remote flags with defaults (remote wins)
        for (const [key, value] of Object.entries(remoteFlags)) {
          if (key.startsWith('_')) continue; // Skip metadata
          this._flags[key] = { ...(this._flags[key] || {}), ...value };
        }
        this._evaluationCache.clear(); // Invalidate cache
        this._notify({ type: 'flags-updated', source: 'remote' });
      }
    }, (err) => {
      console.warn('[FeatureFlags] Remote sync failed:', err);
    });
  }

  /**
   * Evaluate a feature flag.
   * @param {string} flagName - The flag to evaluate
   * @param {Object} context - User context { role, userId, email, cohort }
   * @returns {boolean|Object} Whether the feature is enabled, or variant for A/B
   */
  evaluate(flagName, context = {}) {
    // Check cache first
    const cacheKey = `${flagName}:${JSON.stringify(context)}`;
    if (this._evaluationCache.has(cacheKey)) {
      return this._evaluationCache.get(cacheKey);
    }

    // Check local override first
    if (this._overrides.has(flagName)) {
      return this._overrides.get(flagName);
    }

    const flag = this._flags[flagName];
    if (!flag) return false; // Unknown flag = disabled

    // Kill switch: if disabled, feature is OFF for everyone
    if (flagName.startsWith('kill.') && !flag.enabled) {
      return false;
    }

    // Role-based evaluation
    if (flag.roles) {
      if (!context.role || !flag.roles.includes(context.role)) {
        return false;
      }
      return flag.enabled;
    }

    // Percentage rollout
    if (flag.rollout !== undefined) {
      if (!flag.enabled) return false;
      const userHash = this._hashUser(context.userId || context.email || 'anonymous');
      return userHash <= flag.rollout;
    }

    // A/B test
    if (flag.variants) {
      if (!flag.enabled) return { variant: 'control', enabled: false };
      const userHash = this._hashUser(context.userId || context.email || 'anonymous');
      if (userHash > (flag.traffic || 0)) {
        return { variant: 'control', enabled: false };
      }
      const variantIndex = userHash % flag.variants.length;
      return { variant: flag.variants[variantIndex], enabled: true };
    }

    // Simple boolean
    const result = flag.enabled;
    this._evaluationCache.set(cacheKey, result);
    return result;
  }

  /**
   * Check if a feature is enabled (simplified).
   */
  isEnabled(flagName, context = {}) {
    const result = this.evaluate(flagName, context);
    if (typeof result === 'boolean') return result;
    if (result && typeof result === 'object') return result.enabled;
    return false;
  }

  /**
   * Get A/B test variant for a user.
   */
  getVariant(flagName, context = {}) {
    const result = this.evaluate(flagName, context);
    if (result && typeof result === 'object' && result.variant) {
      return result.variant;
    }
    return 'control';
  }

  /**
   * Set a local override (for testing/admin).
   */
  setOverride(flagName, value) {
    this._overrides.set(flagName, value);
    this._evaluationCache.clear();
    this._notify({ type: 'flag-overridden', flag: flagName, value });
  }

  /**
   * Clear a local override.
   */
  clearOverride(flagName) {
    this._overrides.delete(flagName);
    this._evaluationCache.clear();
    this._notify({ type: 'override-cleared', flag: flagName });
  }

  /**
   * Update a flag in Firestore (admin only).
   */
  async updateFlag(flagName, updates) {
    const current = this._flags[flagName] || {};
    const next = { ...current, ...updates, updatedAt: Date.now() };

    try {
      await setDoc(doc(db, FLAGS_DOC), {
        [flagName]: next,
        [`_lastChanged_${flagName}`]: {
          at: serverTimestamp(),
          by: 'admin',
        },
      }, { merge: true });

      this._changeLog.push({
        flag: flagName,
        changes: updates,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('[FeatureFlags] Update failed:', err);
    }
  }

  /**
   * Bulk update flags.
   */
  async bulkUpdate(updates) {
    try {
      const payload = {};
      for (const [flagName, flagUpdates] of Object.entries(updates)) {
        const current = this._flags[flagName] || {};
        payload[flagName] = { ...current, ...flagUpdates, updatedAt: Date.now() };
      }
      await setDoc(doc(db, FLAGS_DOC), payload, { merge: true });
    } catch (err) {
      console.error('[FeatureFlags] Bulk update failed:', err);
    }
  }

  /**
   * Get all flags.
   */
  getAllFlags() {
    return { ...this._flags };
  }

  /**
   * Get flag change log.
   */
  getChangeLog() {
    return [...this._changeLog];
  }

  /**
   * Subscribe to flag changes.
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  // ── Private methods ──────────────────────────────────────────────────────

  /**
   * Deterministic hash of user ID for consistent rollout.
   * Returns 0-100 (percentage).
   */
  _hashUser(userId) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) % 100;
  }

  _notify(event) {
    this._listeners.forEach(cb => cb(event));
  }

  destroy() {
    this._unsub?.();
  }
}

export const featureFlags = new FeatureFlags();
export default featureFlags;
