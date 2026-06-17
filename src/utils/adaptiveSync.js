/**
 * AdaptiveSyncEngine — Adjusts sync frequency based on network + battery + activity
 * 
 * What Google Maps/Uber/Duolingo use:
 * - Network-aware sync (fast connection → frequent, slow → infrequent)
 * - Battery-aware sync (low battery → reduce sync frequency)
 * - Activity-aware sync (foreground → frequent, background → infrequent)
 * - Data-aware sync (large data → batch, small → immediate)
 * - User behavior learning (predict when user needs fresh data)
 * 
 * Architecture:
 *   Network Quality + Battery Status + App Visibility + User Activity
 *   → Adaptive Sync Interval Calculator → Dynamic Sync Scheduler
 */

import { connectionMonitor, ConnectionState } from './dataStore';
import { networkQuality } from './networkQuality';

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC PROFILES — Predefined sync strategies
// ═══════════════════════════════════════════════════════════════════════════════

export const SyncProfile = {
  AGGRESSIVE: {
    name: 'aggressive',
    baseInterval: 5000,      // 5 seconds
    minInterval: 2000,       // 2 seconds
    maxInterval: 15000,      // 15 seconds
    batchSize: 1,
    priority: 'high',
    description: 'Real-time updates, used for active fleet management',
  },
  NORMAL: {
    name: 'normal',
    baseInterval: 15000,     // 15 seconds
    minInterval: 5000,       // 5 seconds
    maxInterval: 60000,      // 1 minute
    batchSize: 5,
    priority: 'medium',
    description: 'Standard sync for regular operations',
  },
  CONSERVATIVE: {
    name: 'conservative',
    baseInterval: 60000,     // 1 minute
    minInterval: 30000,      // 30 seconds
    maxInterval: 300000,     // 5 minutes
    batchSize: 10,
    priority: 'low',
    description: 'Battery-saving sync for idle/background',
  },
  MINIMAL: {
    name: 'minimal',
    baseInterval: 300000,    // 5 minutes
    minInterval: 60000,      // 1 minute
    maxInterval: 900000,     // 15 minutes
    batchSize: 20,
    priority: 'background',
    description: 'Minimal sync for background/offline',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ADAPTIVE SYNC ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

class AdaptiveSyncEngine {
  constructor() {
    this._currentProfile = SyncProfile.NORMAL;
    this._syncTimer = null;
    this._listeners = new Set();
    this._active = false;
    this._lastSyncAt = 0;
    this._syncHistory = []; // Recent sync timestamps for pattern detection
    this._userActivity = {
      lastInteraction: Date.now(),
      interactionsPerMinute: 0,
      isIdle: false,
    };
    this._batteryInfo = {
      level: 1,
      charging: true,
      chargingTime: Infinity,
      dischargingTime: Infinity,
    };
    this._networkState = ConnectionState.ONLINE;
    this._foreground = true;
    this._pendingWrites = 0;
  }

  /**
   * Start the adaptive sync engine.
   */
  start() {
    if (this._active) return;
    this._active = true;

    // Monitor network state
    this._unsubConnection = connectionMonitor.subscribe(({ state, quality }) => {
      this._networkState = state;
      this._recalculateProfile();
    });

    // Monitor battery
    this._startBatteryMonitor();

    // Monitor user activity
    this._startActivityMonitor();

    // Monitor app visibility
    this._startVisibilityMonitor();

    // Start sync loop
    this._startSyncLoop();
  }

  /**
   * Stop the adaptive sync engine.
   */
  stop() {
    this._active = false;
    if (this._syncTimer) {
      clearTimeout(this._syncTimer);
      this._syncTimer = null;
    }
    this._unsubConnection?.();
    window.removeEventListener('online', this._onOnline);
    window.removeEventListener('offline', this._onOffline);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    window.removeEventListener('mousemove', this._onActivity);
    window.removeEventListener('keydown', this._onActivity);
    window.removeEventListener('touchstart', this._onActivity);
  }

  /**
   * Set pending writes count (affects sync urgency).
   */
  setPendingWrites(count) {
    this._pendingWrites = count;
    this._recalculateProfile();
  }

  /**
   * Get current sync profile.
   */
  getProfile() {
    return { ...this._currentProfile };
  }

  /**
   * Get sync status.
   */
  getStatus() {
    const now = Date.now();
    return {
      profile: this._currentProfile.name,
      nextSyncIn: Math.max(0, this._currentProfile.baseInterval - (now - this._lastSyncAt)),
      lastSyncAt: this._lastSyncAt,
      timeSinceLastSync: now - this._lastSyncAt,
      pendingWrites: this._pendingWrites,
      isIdle: this._userActivity.isIdle,
      isForeground: this._foreground,
      batteryLevel: this._batteryInfo.level,
      isCharging: this._batteryInfo.charging,
      networkState: this._networkState,
    };
  }

  /**
   * Subscribe to profile changes.
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  // ── Private methods ──────────────────────────────────────────────────────

  _startBatteryMonitor() {
    if (!('getBattery' in navigator)) return;

    navigator.getBattery().then((battery) => {
      this._batteryInfo = {
        level: battery.level,
        charging: battery.charging,
        chargingTime: battery.chargingTime,
        dischargingTime: battery.dischargingTime,
      };
      this._recalculateProfile();

      battery.addEventListener('levelchange', () => {
        this._batteryInfo.level = battery.level;
        this._recalculateProfile();
      });
      battery.addEventListener('chargingchange', () => {
        this._batteryInfo.charging = battery.charging;
        this._recalculateProfile();
      });
    }).catch(() => {});
  }

  _startActivityMonitor() {
    this._onActivity = () => {
      this._userActivity.lastInteraction = Date.now();
      this._userActivity.isIdle = false;
      this._recalculateProfile();
    };

    window.addEventListener('mousemove', this._onActivity, { passive: true });
    window.addEventListener('keydown', this._onActivity, { passive: true });
    window.addEventListener('touchstart', this._onActivity, { passive: true });

    // Check for idle every 30 seconds
    setInterval(() => {
      const idleTime = Date.now() - this._userActivity.lastInteraction;
      const wasIdle = this._userActivity.isIdle;
      this._userActivity.isIdle = idleTime > 60000; // 1 minute idle

      if (wasIdle !== this._userActivity.isIdle) {
        this._recalculateProfile();
      }
    }, 30000);
  }

  _startVisibilityMonitor() {
    this._onVisibilityChange = () => {
      this._foreground = document.visibilityState === 'visible';
      this._recalculateProfile();
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  _recalculateProfile() {
    const oldProfile = this._currentProfile;
    this._currentProfile = this._calculateOptimalProfile();

    if (oldProfile.name !== this._currentProfile.name) {
      this._notify({ type: 'profile-change', from: oldProfile.name, to: this._currentProfile.name });
      this._restartSyncLoop();
    }
  }

  _calculateOptimalProfile() {
    // Start with default
    let profile = SyncProfile.NORMAL;

    // Network-based adjustment
    switch (this._networkState) {
      case ConnectionState.OFFLINE:
        return SyncProfile.MINIMAL;
      case ConnectionState.DEGRADED:
        profile = SyncProfile.CONSERVATIVE;
        break;
      case ConnectionState.RECONNECTING:
        profile = SyncProfile.CONSERVATIVE;
        break;
      case ConnectionState.ONLINE:
        profile = SyncProfile.NORMAL;
        break;
    }

    // Battery-based adjustment
    if (!this._batteryInfo.charging) {
      if (this._batteryInfo.level < 0.15) {
        return SyncProfile.MINIMAL;
      } else if (this._batteryInfo.level < 0.3) {
        profile = SyncProfile.CONSERVATIVE;
      }
    }

    // Visibility-based adjustment
    if (!this._foreground) {
      if (profile.name === 'aggressive') profile = SyncProfile.NORMAL;
      if (profile.name === 'normal' && this._userActivity.isIdle) {
        profile = SyncProfile.CONSERVATIVE;
      }
    }

    // Activity-based adjustment
    if (this._foreground && !this._userActivity.isIdle) {
      if (profile.name === 'conservative') profile = SyncProfile.NORMAL;
      if (this._pendingWrites > 0) profile = SyncProfile.AGGRESSIVE;
    }

    // Pending writes urgency
    if (this._pendingWrites > 10) {
      profile = SyncProfile.AGGRESSIVE;
    } else if (this._pendingWrites > 3) {
      if (profile.name === 'conservative') profile = SyncProfile.NORMAL;
    }

    return profile;
  }

  _startSyncLoop() {
    if (this._syncTimer) clearTimeout(this._syncTimer);
    if (!this._active) return;

    const interval = this._currentProfile.baseInterval;

    this._syncTimer = setTimeout(() => {
      if (!this._active) return;

      this._lastSyncAt = Date.now();
      this._syncHistory.push(Date.now());
      if (this._syncHistory.length > 100) this._syncHistory.shift();

      this._notify({
        type: 'sync-trigger',
        profile: this._currentProfile.name,
        interval,
        pendingWrites: this._pendingWrites,
      });

      this._startSyncLoop();
    }, interval);
  }

  _restartSyncLoop() {
    if (this._syncTimer) clearTimeout(this._syncTimer);
    this._startSyncLoop();
  }

  _notify(event) {
    this._listeners.forEach(cb => cb(event));
  }
}

export const adaptiveSync = new AdaptiveSyncEngine();
export default adaptiveSync;
