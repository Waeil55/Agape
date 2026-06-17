/**
 * CrossTabSync — Real-time multi-tab coordination via BroadcastChannel
 * 
 * What Google Docs/Figma/Notion use:
 * - BroadcastChannel API for instant cross-tab communication
 * - Tab heartbeat to detect stale/duplicate sessions
 * - Data consistency across tabs (one tab writes, all tabs update)
 * - Tab versioning to prevent stale data reads
 * - Cursor/presence awareness (who's on which tab)
 * 
 * Architecture:
 *   Tab A writes data → BroadcastChannel → Tab B/C/D receive update → apply locally
 *   Tab heartbeat every 5s → detect dead tabs → clean up presence
 */

const CHANNEL_NAME = 'agape-fleet-sync';
const HEARTBEAT_INTERVAL = 5000;
const STALE_THRESHOLD = 15000; // Tab considered dead after 15s without heartbeat

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export const MessageType = {
  HEARTBEAT: 'heartbeat',
  DATA_UPDATE: 'data_update',
  DATA_REQUEST: 'data_request',
  DATA_RESPONSE: 'data_response',
  FIELD_UPDATE: 'field_update',
  FIELD_REQUEST: 'field_request',
  TAB_JOIN: 'tab_join',
  TAB_LEAVE: 'tab_leave',
  CONFLICT: 'conflict',
  PRESENCE: 'presence',
  SYNC_COMPLETE: 'sync_complete',
  FORCE_RELOAD: 'force_reload',
};

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-TAB SYNC CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class CrossTabSync {
  constructor() {
    this._tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this._channel = null;
    this._listeners = new Map(); // type → Set<callback>
    this._globalListeners = new Set();
    this._heartbeatTimer = null;
    this._activeTabs = new Map(); // tabId → { lastSeen, info }
    this._dataVersion = 0;
    this._fieldVersions = new Map(); // field → version
    this._presence = new Map(); // tabId → { user, role, tab, lastSeen }
    this._initialized = false;
  }

  /**
   * Initialize the cross-tab sync channel.
   */
  init() {
    if (this._initialized || !('BroadcastChannel' in window)) return;
    this._initialized = true;

    this._channel = new BroadcastChannel(CHANNEL_NAME);
    this._channel.onmessage = (event) => this._handleMessage(event.data);

    // Start heartbeat
    this._startHeartbeat();

    // Announce tab join
    this._send(MessageType.TAB_JOIN, {
      tabId: this._tabId,
      joinedAt: Date.now(),
    });

    // Handle tab close
    window.addEventListener('beforeunload', () => {
      this._send(MessageType.TAB_LEAVE, { tabId: this._tabId });
    });

    // Handle visibility change (tab switch)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this._send(MessageType.HEARTBEAT, this._getHeartbeatData());
      }
    });
  }

  /**
   * Broadcast a data update to all other tabs.
   */
  broadcastDataUpdate(field, value, metadata = {}) {
    this._dataVersion++;
    this._fieldVersions.set(field, this._dataVersion);

    this._send(MessageType.DATA_UPDATE, {
      field,
      value,
      version: this._dataVersion,
      tabId: this._tabId,
      timestamp: Date.now(),
      ...metadata,
    });
  }

  /**
   * Broadcast a field-level update (more efficient than full data).
   */
  broadcastFieldUpdate(field, updater, metadata = {}) {
    const currentVersion = this._fieldVersions.get(field) || 0;
    this._fieldVersions.set(field, currentVersion + 1);

    this._send(MessageType.FIELD_UPDATE, {
      field,
      updater: typeof updater === 'function' ? updater.toString() : updater,
      version: currentVersion + 1,
      tabId: this._tabId,
      timestamp: Date.now(),
      ...metadata,
    });
  }

  /**
   * Request current data from another tab (e.g., on tab focus).
   */
  requestData() {
    this._send(MessageType.DATA_REQUEST, {
      tabId: this._tabId,
      timestamp: Date.now(),
    });
  }

  /**
   * Update presence information (which user is on which tab).
   */
  updatePresence(info) {
    this._presence.set(this._tabId, {
      ...info,
      lastSeen: Date.now(),
    });

    this._send(MessageType.PRESENCE, {
      tabId: this._tabId,
      presence: Object.fromEntries(this._presence),
      timestamp: Date.now(),
    });
  }

  /**
   * Subscribe to specific message types.
   */
  on(type, callback) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type).add(callback);
    return () => this._listeners.get(type)?.delete(callback);
  }

  /**
   * Subscribe to all messages.
   */
  onAll(callback) {
    this._globalListeners.add(callback);
    return () => this._globalListeners.delete(callback);
  }

  /**
   * Get all active tabs.
   */
  getActiveTabs() {
    this._cleanupStaleTabs();
    return Object.fromEntries(this._activeTabs);
  }

  /**
   * Get presence info for all tabs.
   */
  getPresence() {
    return Object.fromEntries(this._presence);
  }

  /**
   * Get the current tab ID.
   */
  getTabId() {
    return this._tabId;
  }

  /**
   * Destroy the cross-tab sync channel.
   */
  destroy() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
    }
    this._send(MessageType.TAB_LEAVE, { tabId: this._tabId });
    this._channel?.close();
    this._initialized = false;
  }

  // ── Private methods ──────────────────────────────────────────────────────

  _send(type, data) {
    if (!this._channel) return;
    try {
      this._channel.postMessage({ type, data, senderTabId: this._tabId });
    } catch (err) {
      console.warn('[CrossTabSync] Send failed:', err);
    }
  }

  _handleMessage(message) {
    const { type, data, senderTabId } = message;

    // Ignore messages from self
    if (senderTabId === this._tabId) return;

    // Notify type-specific listeners
    const typeListeners = this._listeners.get(type);
    if (typeListeners) {
      typeListeners.forEach(cb => cb(data, senderTabId));
    }

    // Notify global listeners
    this._globalListeners.forEach(cb => cb({ type, data, senderTabId }));

    // Handle specific message types
    switch (type) {
      case MessageType.HEARTBEAT:
        this._handleHeartbeat(data, senderTabId);
        break;
      case MessageType.TAB_JOIN:
        this._handleTabJoin(data, senderTabId);
        break;
      case MessageType.TAB_LEAVE:
        this._handleTabLeave(data, senderTabId);
        break;
      case MessageType.DATA_UPDATE:
      case MessageType.FIELD_UPDATE:
        this._handleDataUpdate(data, senderTabId);
        break;
      case MessageType.DATA_REQUEST:
        this._handleDataRequest(senderTabId);
        break;
      case MessageType.PRESENCE:
        this._handlePresence(data, senderTabId);
        break;
      case MessageType.FORCE_RELOAD:
        window.location.reload();
        break;
    }
  }

  _handleHeartbeat(data, senderTabId) {
    this._activeTabs.set(senderTabId, {
      lastSeen: Date.now(),
      info: data,
    });
  }

  _handleTabJoin(data, senderTabId) {
    this._activeTabs.set(senderTabId, {
      lastSeen: Date.now(),
      info: data,
    });

    // Respond with our presence
    this._send(MessageType.HEARTBEAT, this._getHeartbeatData());
  }

  _handleTabLeave(data, senderTabId) {
    this._activeTabs.delete(senderTabId);
    this._presence.delete(senderTabId);
  }

  _handleDataUpdate(data, senderTabId) {
    const { field, version } = data;

    // Version check: only apply if remote is newer
    const localVersion = this._fieldVersions.get(field) || 0;
    if (version <= localVersion) return;

    this._fieldVersions.set(field, version);
    // The actual data application is handled by the React hook subscriber
  }

  _handleDataRequest(senderTabId) {
    // Another tab is requesting data — respond with current state
    // This is handled by the subscriber that provides the data
    this._listeners.get(MessageType.DATA_REQUEST)?.forEach(cb => cb({ requesterTabId: senderTabId }));
  }

  _handlePresence(data, senderTabId) {
    if (data?.presence) {
      for (const [tabId, info] of Object.entries(data.presence)) {
        this._presence.set(tabId, info);
      }
    }
  }

  _startHeartbeat() {
    this._heartbeatTimer = setInterval(() => {
      this._send(MessageType.HEARTBEAT, this._getHeartbeatData());
      this._cleanupStaleTabs();
    }, HEARTBEAT_INTERVAL);
  }

  _getHeartbeatData() {
    return {
      tabId: this._tabId,
      timestamp: Date.now(),
      url: window.location.pathname,
      title: document.title,
    };
  }

  _cleanupStaleTabs() {
    const now = Date.now();
    for (const [tabId, info] of this._activeTabs) {
      if (now - info.lastSeen > STALE_THRESHOLD) {
        this._activeTabs.delete(tabId);
        this._presence.delete(tabId);
      }
    }
  }
}

export const crossTabSync = new CrossTabSync();
export default crossTabSync;
