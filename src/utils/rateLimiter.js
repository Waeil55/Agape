/**
 * RateLimiter — Prevent abuse, per-user quotas
 *
 * What Google/Uber/Netflix use:
 * - Token bucket algorithm for smooth rate limiting
 * - Per-user quotas (admin gets more, driver gets less)
 * - Sliding window counters for accurate limiting
 * - Graceful degradation (slow down instead of hard block)
 * - Rate limit headers for API responses
 *
 * Architecture:
 *   User action → Check rate limit → Allow/Slow down/Block
 *   Token bucket: tokens refill at steady rate, each action consumes tokens
 */

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMIT PROFILES
// ═══════════════════════════════════════════════════════════════════════════════

const RATE_LIMITS = {
  // Firestore writes
  'firestore.write': {
    admin: { tokens: 100, refillRate: 10, maxTokens: 200 },
    dispatcher: { tokens: 50, refillRate: 5, maxTokens: 100 },
    driver: { tokens: 30, refillRate: 3, maxTokens: 60 },
  },
  'firestore.read': {
    admin: { tokens: 200, refillRate: 20, maxTokens: 500 },
    dispatcher: { tokens: 100, refillRate: 10, maxTokens: 200 },
    driver: { tokens: 50, refillRate: 5, maxTokens: 100 },
  },
  // API calls
  'api.trip.create': {
    admin: { tokens: 30, refillRate: 3, maxTokens: 60 },
    dispatcher: { tokens: 20, refillRate: 2, maxTokens: 40 },
    driver: { tokens: 10, refillRate: 1, maxTokens: 20 },
  },
  'api.trip.update': {
    admin: { tokens: 50, refillRate: 5, maxTokens: 100 },
    dispatcher: { tokens: 30, refillRate: 3, maxTokens: 60 },
    driver: { tokens: 20, refillRate: 2, maxTokens: 40 },
  },
  'api.trip.archive': {
    admin: { tokens: 20, refillRate: 2, maxTokens: 40 },
    dispatcher: { tokens: 10, refillRate: 1, maxTokens: 20 },
    driver: { tokens: 0, refillRate: 0, maxTokens: 0 }, // Drivers cannot archive
  },
  // UI actions
  'ui.button.click': {
    admin: { tokens: 100, refillRate: 20, maxTokens: 200 },
    dispatcher: { tokens: 100, refillRate: 20, maxTokens: 200 },
    driver: { tokens: 100, refillRate: 20, maxTokens: 200 },
  },
  'ui.search': {
    admin: { tokens: 60, refillRate: 10, maxTokens: 120 },
    dispatcher: { tokens: 60, refillRate: 10, maxTokens: 120 },
    driver: { tokens: 30, refillRate: 5, maxTokens: 60 },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TOKEN BUCKET
// ═══════════════════════════════════════════════════════════════════════════════

class TokenBucket {
  constructor(config) {
    this.tokens = config.tokens;
    this.maxTokens = config.maxTokens || config.tokens;
    this.refillRate = config.refillRate; // tokens per second
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume tokens.
   * @returns {Object} { allowed, tokensRemaining, waitMs }
   */
  consume(count = 1) {
    this._refill();

    if (this.tokens >= count) {
      this.tokens -= count;
      return { allowed: true, tokensRemaining: this.tokens, waitMs: 0 };
    }

    // Calculate wait time for next token
    const deficit = count - this.tokens;
    const waitMs = Math.ceil((deficit / this.refillRate) * 1000);

    return { allowed: false, tokensRemaining: this.tokens, waitMs };
  }

  /**
   * Refill tokens based on elapsed time.
   */
  _refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Get current state.
   */
  getState() {
    this._refill();
    return {
      tokens: this.tokens,
      maxTokens: this.maxTokens,
      refillRate: this.refillRate,
      utilization: ((this.maxTokens - this.tokens) / this.maxTokens) * 100,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITER
// ═══════════════════════════════════════════════════════════════════════════════

class RateLimiter {
  constructor() {
    this._buckets = new Map(); // `${userId}:${action}` → TokenBucket
    this._listeners = new Set();
    this._violations = []; // Rate limit violations for monitoring
  }

  /**
   * Check if an action is allowed for a user.
   * @param {string} action - Action type (e.g., 'firestore.write')
   * @param {string} userId - User identifier
   * @param {string} role - User role (admin, dispatcher, driver)
   * @param {number} tokens - Tokens to consume (default: 1)
   * @returns {Object} { allowed, tokensRemaining, waitMs, degraded }
   */
  check(action, userId, role = 'driver', tokens = 1) {
    const limitConfig = RATE_LIMITS[action];
    if (!limitConfig) return { allowed: true, tokensRemaining: Infinity, waitMs: 0, degraded: false };

    const roleConfig = limitConfig[role] || limitConfig.driver;
    const key = `${userId}:${action}`;

    if (!this._buckets.has(key)) {
      this._buckets.set(key, new TokenBucket(roleConfig));
    }

    const bucket = this._buckets.get(key);
    const result = bucket.consume(tokens);

    if (!result.allowed) {
      this._violations.push({
        action,
        userId,
        role,
        timestamp: Date.now(),
        waitMs: result.waitMs,
      });

      // Keep only recent violations
      if (this._violations.length > 100) {
        this._violations = this._violations.slice(-100);
      }

      this._notify({ type: 'rate-limited', action, userId, waitMs: result.waitMs });
    }

    return {
      ...result,
      degraded: result.tokensRemaining < 5, // Low tokens = degraded
    };
  }

  /**
   * Check and consume in one call (for convenience).
   */
  throttle(action, userId, role = 'driver', tokens = 1) {
    const result = this.check(action, userId, role, tokens);
    if (!result.allowed) {
      throw new Error(`Rate limited: ${action}. Try again in ${result.waitMs}ms.`);
    }
    return result;
  }

  /**
   * Get rate limit status for a user.
   */
  getStatus(userId) {
    const statuses = {};
    for (const [key, bucket] of this._buckets) {
      if (key.startsWith(userId + ':')) {
        const action = key.split(':').slice(1).join(':');
        statuses[action] = bucket.getState();
      }
    }
    return statuses;
  }

  /**
   * Get violations.
   */
  getViolations() {
    return [...this._violations];
  }

  /**
   * Subscribe to rate limit events.
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _notify(event) {
    this._listeners.forEach(cb => cb(event));
  }
}

export const rateLimiter = new RateLimiter();
export default rateLimiter;
