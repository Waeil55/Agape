/**
 * DataLineage — Every change tracked with who/what/when/diffs
 * 
 * What Google Docs/Uber/DoorDash use:
 * - Complete audit trail for every data mutation
 * - Diff snapshots (before/after) for every change
 * - Actor identification (user email, role, device)
 * - Temporal queries (what did data look like at time T?)
 * - Anomaly detection (unusual change patterns)
 * 
 * Architecture:
 *   Every write → compute diff → store lineage entry → queryable history
 *   Stored in IndexedDB + mirrored to Firestore for cloud audit
 */

import { db } from '../config/firebase';
import {
  doc,
  setDoc,
  serverTimestamp,
  collection,
  addDoc,
  getDocs,
} from '../config/firebase';
import { getDB, STORES } from './localDB';

const LINEAGE_STORE = 'dataLineage';
const LINEAGE_COLLECTION = 'dataLineage';
const MAX_LINEAGE_ENTRIES = 500;
const MAX_LOCAL_ENTRIES = 200;

// ═══════════════════════════════════════════════════════════════════════════════
// LINEAGE ENTRY STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} LineageEntry
 * @property {string} id - Unique entry ID
 * @property {string} field - What field was changed (trips, drivers, etc.)
 * @property {string} action - What action (create, update, delete, archive, restore)
 * @property {string} entityId - ID of the specific entity changed
 * @property {Object} before - State before the change
 * @property {Object} after - State after the change
 * @property {Array} diffs - Array of { field, before, after } for each changed field
 * @property {string} actor - Who made the change (email)
 * @property {string} actorRole - Role of the actor (admin, dispatcher, driver)
 * @property {string} tabId - Which tab made the change
 * @property {string} device - Device info
 * @property {number} timestamp - When the change was made
 * @property {string} source - Source of the change (ui, sync, import, repair)
 * @property {Object} metadata - Additional context
 */

// ═══════════════════════════════════════════════════════════════════════════════
// DATA LINEAGE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class DataLineage {
  constructor() {
    this._entries = [];
    this._listeners = new Set();
    this._initialized = false;
    this._deviceInfo = this._getDeviceInfo();
  }

  /**
   * Initialize lineage tracking.
   */
  async init() {
    if (this._initialized) return;
    this._initialized = true;

    // Load recent entries from IndexedDB
    try {
      const db = await getDB();
      const entries = await db.getAll(LINEAGE_STORE);
      this._entries = (entries || [])
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, MAX_LOCAL_ENTRIES);
    } catch {
      // Store might not exist yet
    }
  }

  /**
   * Track a data change.
   */
  track(params) {
    const {
      field,
      action,
      entityId = null,
      before = null,
      after = null,
      actor = 'system',
      actorRole = 'system',
      tabId = null,
      source = 'ui',
      metadata = {},
    } = params;

    // Compute diffs
    const diffs = this._computeDiffs(before, after);

    const entry = {
      id: `lin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      field,
      action,
      entityId,
      before: this._sanitizeForStorage(before),
      after: this._sanitizeForStorage(after),
      diffs,
      actor,
      actorRole,
      tabId: tabId || `tab-${Date.now()}`,
      device: this._deviceInfo,
      timestamp: Date.now(),
      source,
      metadata,
    };

    // Add to local cache
    this._entries.unshift(entry);
    if (this._entries.length > MAX_LOCAL_ENTRIES) {
      this._entries.pop();
    }

    // Persist to IndexedDB (async, non-blocking)
    this._persistEntry(entry).catch(() => {});

    // Mirror to Firestore (async, non-blocking)
    this._mirrorToFirestore(entry).catch(() => {});

    // Notify listeners
    this._notify(entry);

    return entry;
  }

  /**
   * Track a bulk operation (e.g., bulk archive).
   */
  trackBulk(params) {
    const { entries: bulkEntries, ...rest } = params;
    return bulkEntries.map(entry => this.track({ ...entry, ...rest }));
  }

  /**
   * Get lineage for a specific entity.
   */
  getEntityLineage(entityId, limit = 50) {
    return this._entries
      .filter(e => e.entityId === entityId)
      .slice(0, limit);
  }

  /**
   * Get lineage for a specific field.
   */
  getFieldLineage(field, limit = 100) {
    return this._entries
      .filter(e => e.field === field)
      .slice(0, limit);
  }

  /**
   * Get lineage for a specific actor.
   */
  getActorLineage(actor, limit = 100) {
    return this._entries
      .filter(e => e.actor === actor)
      .slice(0, limit);
  }

  /**
   * Get lineage within a time range.
   */
  getTimeRangeLineage(startTime, endTime, limit = 200) {
    return this._entries
      .filter(e => e.timestamp >= startTime && e.timestamp <= endTime)
      .slice(0, limit);
  }

  /**
   * Get recent lineage.
   */
  getRecent(limit = 50) {
    return this._entries.slice(0, limit);
  }

  /**
   * Get anomaly detections (unusual change patterns).
   */
  detectAnomalies() {
    const anomalies = [];
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    // Detect rapid changes (more than 20 changes in 1 hour)
    const recentHour = this._entries.filter(e => now - e.timestamp < oneHour);
    if (recentHour.length > 20) {
      anomalies.push({
        type: 'rapid_changes',
        count: recentHour.length,
        period: '1 hour',
        actors: [...new Set(recentHour.map(e => e.actor))],
      });
    }

    // Detect large diffs (more than 50 fields changed)
    const largeDiffs = this._entries.filter(e => e.diffs?.length > 50);
    if (largeDiffs.length > 0) {
      anomalies.push({
        type: 'large_diffs',
        entries: largeDiffs.map(e => ({ id: e.id, field: e.field, diffCount: e.diffs.length })),
      });
    }

    // Detect off-hours changes (before 6am or after 10pm)
    const offHours = this._entries.filter(e => {
      const hour = new Date(e.timestamp).getHours();
      return hour < 6 || hour > 22;
    });
    if (offHours.length > 0) {
      anomalies.push({
        type: 'off_hours_changes',
        count: offHours.length,
        actors: [...new Set(offHours.map(e => e.actor))],
      });
    }

    return anomalies;
  }

  /**
   * Get a summary of all changes.
   */
  getSummary() {
    const entries = this._entries;
    const byField = {};
    const byActor = {};
    const byAction = {};

    for (const entry of entries) {
      byField[entry.field] = (byField[entry.field] || 0) + 1;
      byActor[entry.actor] = (byActor[entry.actor] || 0) + 1;
      byAction[entry.action] = (byAction[entry.action] || 0) + 1;
    }

    return {
      total: entries.length,
      byField,
      byActor,
      byAction,
      timeRange: entries.length > 0
        ? { from: entries[entries.length - 1].timestamp, to: entries[0].timestamp }
        : null,
    };
  }

  /**
   * Subscribe to new lineage entries.
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  // ── Private methods ──────────────────────────────────────────────────────

  _computeDiffs(before, after) {
    if (!before || !after) return [];
    if (typeof before !== 'object' || typeof after !== 'object') return [];

    const diffs = [];
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of allKeys) {
      const bVal = before[key];
      const aVal = after[key];
      if (String(bVal) !== String(aVal)) {
        diffs.push({
          field: key,
          before: bVal,
          after: aVal,
        });
      }
    }

    return diffs;
  }

  _sanitizeForStorage(data) {
    if (!data) return data;
    if (typeof data !== 'object') return data;

    // Limit depth and size for storage
    try {
      const json = JSON.stringify(data);
      if (json.length > 10000) {
        return { _truncated: true, _size: json.length, _keys: Object.keys(data).slice(0, 20) };
      }
      return JSON.parse(json);
    } catch {
      return { _error: 'Failed to serialize' };
    }
  }

  async _persistEntry(entry) {
    try {
      const db = await getDB();
      if (!db.objectStoreNames.contains(LINEAGE_STORE)) {
        // Store doesn't exist yet, skip
        return;
      }
      await db.put(LINEAGE_STORE, entry, entry.id);

      // Trim old entries
      const all = await db.getAll(LINEAGE_STORE);
      if (all.length > MAX_LINEAGE_ENTRIES) {
        const toDelete = all
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(MAX_LINEAGE_ENTRIES);
        for (const old of toDelete) {
          await db.delete(LINEAGE_STORE, old.id);
        }
      }
    } catch {
      // IndexedDB might not have this store yet
    }
  }

  async _mirrorToFirestore(entry) {
    try {
      await addDoc(collection(db, LINEAGE_COLLECTION), {
        ...entry,
        mirroredAt: serverTimestamp(),
      });
    } catch {
      // Non-critical, fail silently
    }
  }

  _getDeviceInfo() {
    const ua = navigator.userAgent;
    let device = 'Unknown';
    if (/iPhone/.test(ua)) device = 'iPhone';
    else if (/iPad/.test(ua)) device = 'iPad';
    else if (/Android/.test(ua)) device = 'Android';
    else if (/Windows/.test(ua)) device = 'Windows';
    else if (/Mac/.test(ua)) device = 'Mac';
    else if (/Linux/.test(ua)) device = 'Linux';

    let browser = 'Unknown';
    if (/Chrome/.test(ua) && !/Edg/.test(ua)) browser = 'Chrome';
    else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
    else if (/Firefox/.test(ua)) browser = 'Firefox';
    else if (/Edg/.test(ua)) browser = 'Edge';

    return `${device}/${browser}`;
  }

  _notify(entry) {
    this._listeners.forEach(cb => cb(entry));
  }
}

export const dataLineage = new DataLineage();
export default dataLineage;
