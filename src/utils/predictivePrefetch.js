/**
 * PredictivePrefetch — Pre-load data user will need next
 *
 * What Google Maps/Uber/Duolingo use:
 * - Predict user's next action based on patterns
 * - Pre-fetch data before user requests it
 * - Cache warming on app start
 * - Route-based prefetch (user always goes dashboard → operations → drivers)
 * - Time-based prefetch (morning: load today's trips, evening: load reports)
 *
 * Architecture:
 *   User behavior pattern → Prediction engine → Prefetch scheduler → Pre-load data
 *   Startup: warm cache with most-used data
 *   Idle: prefetch likely next pages
 *   Network available: batch prefetch queued items
 */

import { db } from '../config/firebase';
import { doc, getDoc, collection, getDocs, query, where, orderBy, limit } from '../config/firebase';
import { connectionMonitor, ConnectionState } from './connectionMonitor';
import { networkQuality } from './networkQuality';

// ═══════════════════════════════════════════════════════════════════════════════
// PREFETCH PROFILES
// ═══════════════════════════════════════════════════════════════════════════════

export const PrefetchPriority = {
  CRITICAL: 0,  // Must prefetch (app startup data)
  HIGH: 1,      // Prefetch if possible (current page dependencies)
  MEDIUM: 2,    // Prefetch during idle (likely next pages)
  LOW: 3,       // Prefetch only if very idle (nice-to-have)
};

// ═══════════════════════════════════════════════════════════════════════════════
// PREFETCH RULES
// ═══════════════════════════════════════════════════════════════════════════════

const PREFETCH_RULES = [
  // Startup rules — always prefetch
  {
    name: 'startup-drivers',
    trigger: 'startup',
    priority: PrefetchPriority.CRITICAL,
    fetch: () => getDocs(collection(db, 'driverProfiles')),
    cacheKey: 'driverProfiles',
    ttl: 60000,
  },

  // Page-based rules
  {
    name: 'operations-telemetry',
    trigger: 'page:operations',
    priority: PrefetchPriority.HIGH,
    fetch: () => getDocs(collection(db, 'driverTelemetry')),
    cacheKey: 'telemetry',
    ttl: 10000,
  },
  {
    name: 'drivers-profiles',
    trigger: 'page:drivers',
    priority: PrefetchPriority.HIGH,
    fetch: () => getDocs(collection(db, 'driverProfiles')),
    cacheKey: 'driverProfiles',
    ttl: 30000,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PREFETCH CACHE
// ═══════════════════════════════════════════════════════════════════════════════

class PrefetchCache {
  constructor() {
    this._cache = new Map(); // key → { data, timestamp, ttl }
    this._hits = 0;
    this._misses = 0;
  }

  get(key) {
    const entry = this._cache.get(key);
    if (!entry) {
      this._misses++;
      return null;
    }
    if (Date.now() - entry.timestamp > entry.ttl) {
      this._cache.delete(key);
      this._misses++;
      return null;
    }
    this._hits++;
    return entry.data;
  }

  set(key, data, ttl = 30000) {
    this._cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  has(key) {
    return this.get(key) !== null;
  }

  getStats() {
    return {
      size: this._cache.size,
      hits: this._hits,
      misses: this._misses,
      hitRate: this._hits + this._misses > 0
        ? (this._hits / (this._hits + this._misses)) * 100
        : 0,
      keys: [...this._cache.keys()],
    };
  }

  clear() {
    this._cache.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PREDICTIVE PREFETCH ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

class PredictivePrefetch {
  constructor() {
    this._cache = new PrefetchCache();
    this._queue = []; // Pending prefetch tasks
    this._active = false;
    this._listeners = new Set();
    this._prefetchHistory = []; // What was prefetched and when
    this._userPatterns = new Map(); // page → visit count
    this._lastActivity = Date.now();
    this._idleTimer = null;
    this._idleCheckInterval = null;
    this._timeCheckInterval = null;
    this._networkUnsub = null;
    this._currentHour = new Date().getHours();
  }

  /**
   * Start the prefetch engine.
   */
  start() {
    if (this._active) return;
    this._active = true;

    // Startup prefetch (critical data)
    this._triggerRule('startup');

    // Monitor user activity
    this._startActivityMonitor();

    // Monitor time-based triggers
    this._startTimeMonitor();

    // Process queue when network is available
    this._startNetworkMonitor();
  }

  stop() {
    this._active = false;
    if (this._idleTimer) clearTimeout(this._idleTimer);
    if (this._idleCheckInterval) clearInterval(this._idleCheckInterval);
    if (this._timeCheckInterval) clearInterval(this._timeCheckInterval);
    if (this._networkUnsub) this._networkUnsub();
    window.removeEventListener('mousemove', this._onActivity);
    window.removeEventListener('keydown', this._onActivity);
    window.removeEventListener('touchstart', this._onActivity);
  }

  /**
   * Trigger prefetch for a page visit.
   */
  onPageVisit(pageName) {
    // Track pattern
    const count = this._userPatterns.get(pageName) || 0;
    this._userPatterns.set(pageName, count + 1);

    // Trigger page-based rules
    this._triggerRule(`page:${pageName}`);
  }

  /**
   * Get data from prefetch cache (fast path).
   */
  getCached(key) {
    return this._cache.get(key);
  }

  /**
   * Check if data is cached.
   */
  hasCached(key) {
    return this._cache.has(key);
  }

  /**
   * Manually add data to prefetch cache.
   */
  cacheData(key, data, ttl = 30000) {
    this._cache.set(key, data, ttl);
  }

  /**
   * Get prefetch statistics.
   */
  getStats() {
    return {
      cache: this._cache.getStats(),
      queueLength: this._queue.length,
      totalPrefetched: this._prefetchHistory.length,
      patterns: Object.fromEntries(this._userPatterns),
      active: this._active,
    };
  }

  /**
   * Subscribe to prefetch events.
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  // ── Private methods ──────────────────────────────────────────────────────

  _triggerRule(triggerName) {
    const matchingRules = PREFETCH_RULES.filter(r => r.trigger === triggerName);

    for (const rule of matchingRules) {
      // Skip if already cached
      if (this._cache.has(rule.cacheKey)) continue;

      // Add to queue with priority
      this._queue.push({
        rule,
        priority: rule.priority,
        enqueuedAt: Date.now(),
      });
    }

    // Sort by priority (lower = higher priority)
    this._queue.sort((a, b) => a.priority - b.priority);

    // Process queue
    this._processQueue();
  }

  async _processQueue() {
    if (!this._active || !navigator.onLine) return;

    // Check network quality — skip prefetch on slow connections
    const quality = networkQuality.getQuality();
    if (quality.quality === 'slow' || quality.quality === 'offline') return;

    while (this._queue.length > 0) {
      const task = this._queue.shift();

      // Double-check cache (might have been prefetched by another path)
      if (this._cache.has(task.rule.cacheKey)) continue;

      try {
        const data = await task.rule.fetch();
        this._cache.set(task.rule.cacheKey, data, task.rule.ttl);

        this._prefetchHistory.push({
          name: task.rule.name,
          cacheKey: task.rule.cacheKey,
          prefetchedAt: Date.now(),
          priority: task.priority,
        });

        this._notify({
          type: 'prefetch-complete',
          name: task.rule.name,
          cacheKey: task.rule.cacheKey,
        });
      } catch (err) {
        // Non-critical, skip
        this._notify({
          type: 'prefetch-error',
          name: task.rule.name,
          error: err.message,
        });
      }

      // Small delay between prefetches to avoid overwhelming network
      await new Promise(r => setTimeout(r, 100));
    }
  }

  _startActivityMonitor() {
    this._onActivity = () => {
      this._lastActivity = Date.now();
    };

    window.addEventListener('mousemove', this._onActivity, { passive: true });
    window.addEventListener('keydown', this._onActivity, { passive: true });
    window.addEventListener('touchstart', this._onActivity, { passive: true });

    // Check for idle every 30 seconds
    this._idleCheckInterval = setInterval(() => {
      const idleTime = Date.now() - this._lastActivity;

      if (idleTime > 30000) {
        this._triggerRule('idle:30s');
      }
    }, 30000);
  }

  _startTimeMonitor() {
    // Check time-based triggers every 5 minutes
    this._timeCheckInterval = setInterval(() => {
      const hour = new Date().getHours();
      if (hour !== this._currentHour) {
        this._currentHour = hour;

        if (hour >= 6 && hour < 10) {
          this._triggerRule('time:morning');
        } else if (hour >= 17 && hour < 21) {
          this._triggerRule('time:evening');
        }
      }
    }, 300000);
  }

  _startNetworkMonitor() {
    this._networkUnsub = connectionMonitor.subscribe(({ state }) => {
      if (state === ConnectionState.ONLINE && this._queue.length > 0) {
        this._processQueue();
      }
    });
  }

  _notify(event) {
    this._listeners.forEach(cb => cb(event));
  }
}

export const predictivePrefetch = new PredictivePrefetch();
export default predictivePrefetch;
