/**
 * Network Quality Monitor — Real-time connection quality tracking
 *
 * What Uber/DoorDash do:
 * - Monitor actual throughput, not just online/offline
 * - Show "Slow connection" / "Fast" indicators
 * - Adapt sync frequency based on quality
 * - Detect flaky connections (online but packets dropping)
 */

const SAMPLE_SIZE = 10;
const SPEED_THRESHOLDS = {
  fast: 5000,      // > 5 Mbps → green
  medium: 1000,    // 1-5 Mbps → yellow
  slow: 0,         // < 1 Mbps → red
};

class NetworkQualityMonitor {
  constructor() {
    this.listeners = new Set();
    this.samples = [];
    this.currentQuality = {
      online: navigator.onLine,
      quality: 'unknown',       // 'fast' | 'medium' | 'slow' | 'offline' | 'unknown'
      latencyMs: null,
      downlinkMbps: null,
      effectiveType: null,      // '4g' | '3g' | '2g' | 'slow-2g'
      saveData: false,
      lastCheckedAt: null,
      isFlaky: false,
    };
    this._checkInterval = null;
    this._boundOnLine = () => this._updateOnlineStatus(true);
    this._boundOffLine = () => this._updateOnlineStatus(false);
  }

  start() {
    if (this._checkInterval) return;

    window.addEventListener('online', this._boundOnLine);
    window.addEventListener('offline', this._boundOffLine);

    // Use Network Information API if available (Chrome, Edge, Opera)
    if (navigator.connection) {
      navigator.connection.addEventListener('change', () => this._readConnectionInfo());
    }

    // Initial check
    this._readConnectionInfo();
    this._pingCheck();

    // Periodic quality check every 30 seconds
    this._checkInterval = setInterval(() => {
      this._readConnectionInfo();
      this._pingCheck();
    }, 30000);
  }

  stop() {
    if (this._checkInterval) {
      clearInterval(this._checkInterval);
      this._checkInterval = null;
    }
    window.removeEventListener('online', this._boundOnLine);
    window.removeEventListener('offline', this._boundOffLine);
    if (navigator.connection) {
      navigator.connection.removeEventListener('change', () => this._readConnectionInfo());
    }
  }

  subscribe(callback) {
    this.listeners.add(callback);
    // Emit current state immediately
    callback(this.currentQuality);
    return () => this.listeners.delete(callback);
  }

  getQuality() {
    return { ...this.currentQuality };
  }

  // ── Private methods ──────────────────────────────────────────────────────

  _emit() {
    const snapshot = { ...this.currentQuality };
    this.listeners.forEach(cb => cb(snapshot));
  }

  _updateOnlineStatus(online) {
    this.currentQuality.online = online;
    if (!online) {
      this.currentQuality.quality = 'offline';
      this.currentQuality.isFlaky = false;
    }
    this._emit();
  }

  _readConnectionInfo() {
    const conn = navigator.connection;
    if (!conn) return;

    this.currentQuality.effectiveType = conn.effectiveType || null;
    this.currentQuality.downlinkMbps = conn.downlink ? Math.round(conn.downlink * 1000) : null;
    this.currentQuality.saveData = conn.saveData || false;

    // Detect flaky: connection says online but effectiveType is very slow
    if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') {
      this.currentQuality.isFlaky = true;
    }

    this._classifyQuality();
    this._emit();
  }

  async _pingCheck() {
    if (!navigator.onLine) return;

    const startTime = performance.now();
    try {
      // Use a tiny image request to measure latency (no CORS issues)
      const testUrl = `https://www.gstatic.com/generate_204?_=${Date.now()}`;
      await fetch(testUrl, { mode: 'no-cors', cache: 'no-store' });
      const latencyMs = Math.round(performance.now() - startTime);

      this.currentQuality.latencyMs = latencyMs;
      this.currentQuality.lastCheckedAt = new Date().toISOString();

      // Detect flaky: high latency despite being "online"
      if (latencyMs > 3000) {
        this.currentQuality.isFlaky = true;
      } else if (latencyMs < 1000) {
        this.currentQuality.isFlaky = false;
      }

      this._classifyQuality();
      this._emit();
    } catch {
      // Ping failed — likely flaky connection
      this.currentQuality.isFlaky = true;
      this.currentQuality.latencyMs = null;
      this._emit();
    }
  }

  _classifyQuality() {
    if (!this.currentQuality.online) {
      this.currentQuality.quality = 'offline';
      return;
    }

    // Use Network Information API effectiveType if available
    if (this.currentQuality.effectiveType) {
      switch (this.currentQuality.effectiveType) {
        case '4g':
          this.currentQuality.quality = 'fast';
          break;
        case '3g':
          this.currentQuality.quality = 'medium';
          break;
        case '2g':
        case 'slow-2g':
          this.currentQuality.quality = 'slow';
          break;
        default:
          this.currentQuality.quality = 'fast';
      }
      return;
    }

    // Fallback: use latency
    const latency = this.currentQuality.latencyMs;
    if (latency === null) {
      this.currentQuality.quality = 'unknown';
    } else if (latency < 200) {
      this.currentQuality.quality = 'fast';
    } else if (latency < 1000) {
      this.currentQuality.quality = 'medium';
    } else {
      this.currentQuality.quality = 'slow';
    }
  }
}

// Singleton
export const networkQuality = new NetworkQualityMonitor();

/**
 * React hook for network quality.
 * Usage: const { quality, latencyMs, isFlaky } = useNetworkQuality();
 */
export function useNetworkQuality() {
  // This is a simple hook wrapper — components can import networkQuality directly
  // and call subscribe() in useEffect for real-time updates
  return networkQuality;
}

export default networkQuality;
