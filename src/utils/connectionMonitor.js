export const ConnectionState = {
  CONNECTING: 'connecting',
  ONLINE: 'online',
  RECONNECTING: 'reconnecting',
  DEGRADED: 'degraded',
  OFFLINE: 'offline',
  UNKNOWN: 'unknown',
};

const STATE_TRANSITIONS = {
  [ConnectionState.CONNECTING]: [ConnectionState.ONLINE, ConnectionState.OFFLINE, ConnectionState.UNKNOWN],
  [ConnectionState.ONLINE]: [ConnectionState.RECONNECTING, ConnectionState.DEGRADED, ConnectionState.OFFLINE],
  [ConnectionState.RECONNECTING]: [ConnectionState.ONLINE, ConnectionState.DEGRADED, ConnectionState.OFFLINE],
  [ConnectionState.DEGRADED]: [ConnectionState.ONLINE, ConnectionState.OFFLINE],
  [ConnectionState.OFFLINE]: [ConnectionState.CONNECTING, ConnectionState.RECONNECTING],
  [ConnectionState.UNKNOWN]: [ConnectionState.CONNECTING, ConnectionState.ONLINE, ConnectionState.OFFLINE],
};

class ConnectionMonitor {
  constructor() {
    this.state = navigator.onLine ? ConnectionState.CONNECTING : ConnectionState.OFFLINE;
    this.listeners = new Set();
    this.quality = { latencyMs: null, downlink: null, effectiveType: null };
    this._lastPing = 0;
    this._pingFailures = 0;
  }

  start() {
    window.addEventListener('online', () => this._transition(ConnectionState.RECONNECTING));
    window.addEventListener('offline', () => this._transition(ConnectionState.OFFLINE));

    if (navigator.connection) {
      navigator.connection.addEventListener('change', () => this._readQuality());
    }

    this._readQuality();
    this._pingLoop();

    if (this.state === ConnectionState.CONNECTING) {
      setTimeout(() => {
        if (this.state === ConnectionState.CONNECTING) {
          this._transition(ConnectionState.ONLINE);
        }
      }, 3000);
    }
  }

  subscribe(callback) {
    this.listeners.add(callback);
    callback({ state: this.state, quality: { ...this.quality } });
    return () => this.listeners.delete(callback);
  }

  getState() {
    return { state: this.state, quality: { ...this.quality } };
  }

  _transition(newState) {
    const valid = STATE_TRANSITIONS[this.state] || [];
    if (!valid.includes(newState)) return;
    const old = this.state;
    this.state = newState;
    this._emit({ from: old, to: newState });
  }

  _emit(change) {
    const snapshot = { state: this.state, quality: { ...this.quality }, change };
    this.listeners.forEach(cb => cb(snapshot));
  }

  _readQuality() {
    const conn = navigator.connection;
    if (!conn) return;
    this.quality.effectiveType = conn.effectiveType || null;
    this.quality.downlink = conn.downlink || null;
    this.quality.saveData = conn.saveData || false;
  }

  async _pingLoop() {
    for (;;) {
      await new Promise(r => setTimeout(r, 15000));
      if (!navigator.onLine) continue;

      const start = performance.now();
      try {
        await fetch('https://www.gstatic.com/generate_204?_t=' + Date.now(), {
          mode: 'no-cors',
          cache: 'no-store',
        });
        const latency = Math.round(performance.now() - start);
        this.quality.latencyMs = latency;
        this._pingFailures = 0;

        if (this.state === ConnectionState.RECONNECTING) {
          this._transition(ConnectionState.ONLINE);
        } else if (this.state === ConnectionState.ONLINE && latency > 2000) {
          this._transition(ConnectionState.DEGRADED);
        } else if (this.state === ConnectionState.DEGRADED && latency < 500) {
          this._transition(ConnectionState.ONLINE);
        }
      } catch {
        this._pingFailures++;
        this.quality.latencyMs = null;
        if (this._pingFailures >= 3 && this.state !== ConnectionState.OFFLINE) {
          this._transition(ConnectionState.DEGRADED);
        }
      }
      this._emit();
    }
  }
}

export const connectionMonitor = new ConnectionMonitor();
export default connectionMonitor;
