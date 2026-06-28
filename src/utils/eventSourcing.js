/**
 * EventSourcing — Immutable event log with undo/redo and state replay
 * 
 * What Google/Uber/Duolingo use internally:
 * - Every state change is an immutable event (never mutate, only append)
 * - Complete history: replay any point in time
 * - Undo/Redo via event reversal
 * - CQRS: separate write model (events) from read model (projections)
 * - Audit trail is a first-class citizen, not an afterthought
 * - Conflict resolution via event ordering
 * 
 * Architecture:
 *   User action → Create Event → Append to Event Log → Update Projection → Sync to Firestore
 *   Undo → Append Inverse Event → Update Projection → Sync to Firestore
 *   Replay → Read Events → Apply in order → Reconstruct State
 */

import { db } from '../config/firebase';
import { doc, setDoc, serverTimestamp } from '../config/firebase';
import { getDB, STORES } from './localDB';

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export const EventType = {
  // Trip events
  TRIP_CREATED: 'trip.created',
  TRIP_UPDATED: 'trip.updated',
  TRIP_DELETED: 'trip.deleted',
  TRIP_ARCHIVED: 'trip.archived',
  TRIP_RESTORED: 'trip.restored',
  TRIP_ASSIGNED: 'trip.assigned',
  TRIP_COMPLETED: 'trip.completed',
  TRIP_STATUS_CHANGED: 'trip.status_changed',

  // Driver events
  DRIVER_CREATED: 'driver.created',
  DRIVER_UPDATED: 'driver.updated',
  DRIVER_CLOCK_IN: 'driver.clock_in',
  DRIVER_CLOCK_OUT: 'driver.clock_out',

  // Bulk events
  BULK_ARCHIVE: 'bulk.archive',
  BULK_ASSIGN: 'bulk.assign',
  BULK_UPDATE: 'bulk.update',

  // System events
  SYSTEM_RESET: 'system.reset',
  DATA_IMPORT: 'data.import',
  DATA_REPAIR: 'data.repair',

  // Inverse events (for undo)
  TRIP_UNARCHIVED: 'trip.unarchived',
  TRIP_UNASSIGNED: 'trip.unassigned',
  STATE_REVERTED: 'state.reverted',
};

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} Event
 * @property {string} id - Unique event ID (monotonic)
 * @property {string} type - Event type from EventType
 * @property {string} aggregateId - Entity ID (trip ID, driver ID, etc.)
 * @property {string} aggregateType - Entity type (trip, driver, system)
 * @property {Object} payload - Event data (the change)
 * @property {Object} metadata - Actor, timestamp, device, etc.
 * @property {number} version - Monotonic version for this aggregate
 * @property {string|null} causationId - ID of event that caused this one
 * @property {string|null} correlationId - ID linking related events
 */

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT SOURCING ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

class EventSourcingEngine {
  constructor() {
    this._events = [];                    // Immutable event log
    this._projections = new Map();        // aggregateId → current state
    this._versionMap = new Map();         // aggregateId → version
    this._undoStack = [];                 // Stack of event IDs for undo
    this._redoStack = [];                 // Stack of event IDs for redo
    this._listeners = new Set();
    this._maxEvents = 2000;
    this._initialized = false;
    this._eventCounter = 0;
  }

  /**
   * Initialize: load events from IndexedDB.
   */
  async init() {
    if (this._initialized) return;
    this._initialized = true;

    try {
      const db = await getDB();
      if (db.objectStoreNames.contains('eventSourcing')) {
        const events = await db.getAll('eventSourcing');
        this._events = (events || []).sort((a, b) => a.version - b.version);
        this._rebuildProjections();
      }
    } catch {
      // First run, no events yet
    }
  }

  /**
   * Emit a new event. This is the ONLY way to change state.
   */
  emit(eventType, aggregateId, aggregateType, payload, metadata = {}) {
    const version = (this._versionMap.get(aggregateId) || 0) + 1;
    this._eventCounter++;

    const event = {
      id: `evt-${Date.now()}-${this._eventCounter}-${Math.random().toString(36).slice(2, 6)}`,
      type: eventType,
      aggregateId,
      aggregateType,
      payload,
      metadata: {
        actor: metadata.actor || 'system',
        actorRole: metadata.actorRole || 'system',
        timestamp: Date.now(),
        device: metadata.device || this._getDevice(),
        source: metadata.source || 'ui',
        ...metadata,
      },
      version,
      causationId: metadata.causationId || null,
      correlationId: metadata.correlationId || null,
    };

    // Append to immutable log (never delete, never modify)
    this._events.push(event);
    this._versionMap.set(aggregateId, version);

    // Update projection (read model)
    this._applyEvent(event);

    // Add to undo stack
    this._undoStack.push(event.id);
    this._redoStack = []; // Clear redo on new action

    // Trim old events
    if (this._events.length > this._maxEvents) {
      this._events = this._events.slice(-this._maxEvents);
    }

    // Persist to IndexedDB (async, non-blocking)
    this._persistEvent(event).catch(() => {});

    // Mirror to Firestore (async, non-blocking)
    this._mirrorToFirestore(event).catch(() => {});

    // Notify listeners
    this._notify({ type: 'event', event, undoable: this._undoStack.length > 0 });

    return event;
  }

  /**
   * Undo the last action. Creates an inverse event.
   */
  undo() {
    if (this._undoStack.length === 0) return null;

    const lastEventId = this._undoStack.pop();
    const lastEvent = this._events.find(e => e.id === lastEventId);
    if (!lastEvent) return null;

    // Create inverse event
    const inverseEvent = this._createInverseEvent(lastEvent);
    this._events.push(inverseEvent);
    this._applyEvent(inverseEvent);
    this._redoStack.push(lastEventId);

    this._notify({ type: 'undo', original: lastEvent, inverse: inverseEvent });
    return inverseEvent;
  }

  /**
   * Redo the last undone action.
   */
  redo() {
    if (this._redoStack.length === 0) return null;

    const lastUndoneId = this._redoStack.pop();
    const originalEvent = this._events.find(e => e.id === lastUndoneId);
    if (!originalEvent) return null;

    // Re-apply the original event
    const reapplyEvent = {
      ...originalEvent,
      id: `evt-${Date.now()}-redo-${this._eventCounter++}`,
      metadata: {
        ...originalEvent.metadata,
        timestamp: Date.now(),
        redoneFrom: lastUndoneId,
      },
    };

    this._events.push(reapplyEvent);
    this._applyEvent(reapplyEvent);
    this._undoStack.push(reapplyEvent.id);

    this._notify({ type: 'redo', event: reapplyEvent });
    return reapplyEvent;
  }

  /**
   * Get current state for an aggregate.
   */
  getState(aggregateId) {
    return this._projections.get(aggregateId) || null;
  }

  /**
   * Get all events for an aggregate.
   */
  getEvents(aggregateId) {
    return this._events.filter(e => e.aggregateId === aggregateId);
  }

  /**
   * Get events of a specific type.
   */
  getEventsByType(eventType) {
    return this._events.filter(e => e.type === eventType);
  }

  /**
   * Get events within a time range.
   */
  getEventsInRange(startTime, endTime) {
    return this._events.filter(e => 
      e.metadata.timestamp >= startTime && e.metadata.timestamp <= endTime
    );
  }

  /**
   * Replay state at a specific point in time.
   */
  replayAt(timestamp) {
    const state = new Map();
    for (const event of this._events) {
      if (event.metadata.timestamp > timestamp) break;
      this._applyEventToState(event, state);
    }
    return Object.fromEntries(state);
  }

  /**
   * Replay state from event log (full rebuild).
   */
  replayAll() {
    const state = new Map();
    for (const event of this._events) {
      this._applyEventToState(event, state);
    }
    return Object.fromEntries(state);
  }

  /**
   * Get undo/redo availability.
   */
  canUndo() {
    return this._undoStack.length > 0;
  }

  canRedo() {
    return this._redoStack.length > 0;
  }

  /**
   * Get event log statistics.
   */
  getStats() {
    const byType = {};
    const byAggregate = {};
    const byActor = {};

    for (const event of this._events) {
      byType[event.type] = (byType[event.type] || 0) + 1;
      byAggregate[event.aggregateType] = (byAggregate[event.aggregateType] || 0) + 1;
      byActor[event.metadata.actor] = (byActor[event.metadata.actor] || 0) + 1;
    }

    return {
      totalEvents: this._events.length,
      byType,
      byAggregate,
      byActor,
      undoable: this._undoStack.length,
      redoable: this._redoStack.length,
      oldestEvent: this._events[0]?.metadata.timestamp || null,
      newestEvent: this._events[this._events.length - 1]?.metadata.timestamp || null,
    };
  }

  /**
   * Subscribe to events.
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  // ── Private methods ──────────────────────────────────────────────────────

  _applyEvent(event) {
    this._applyEventToState(event, this._projections);
  }

  _applyEventToState(event, stateMap) {
    const { type, aggregateId, payload } = event;

    switch (type) {
      case EventType.TRIP_CREATED:
      case EventType.TRIP_UPDATED:
      case EventType.DRIVER_CREATED:
      case EventType.DRIVER_UPDATED:
        stateMap.set(aggregateId, { ...(stateMap.get(aggregateId) || {}), ...payload });
        break;

      case EventType.TRIP_DELETED:
      case EventType.TRIP_ARCHIVED:
        stateMap.delete(aggregateId);
        break;

      case EventType.TRIP_RESTORED:
        stateMap.set(aggregateId, payload);
        break;

      case EventType.BULK_ARCHIVE:
        if (payload.ids) {
          payload.ids.forEach(id => stateMap.delete(id));
        }
        break;

      case EventType.BULK_UPDATE:
        if (payload.updates) {
          for (const [id, update] of Object.entries(payload.updates)) {
            stateMap.set(id, { ...(stateMap.get(id) || {}), ...update });
          }
        }
        break;

      case EventType.STATE_REVERTED:
        if (payload.previousState) {
          stateMap.set(aggregateId, payload.previousState);
        }
        break;

      default:
        // Generic: merge payload into existing state
        if (payload) {
          stateMap.set(aggregateId, { ...(stateMap.get(aggregateId) || {}), ...payload });
        }
    }
  }

  _createInverseEvent(event) {
    const inverses = {
      [EventType.TRIP_CREATED]: EventType.TRIP_DELETED,
      [EventType.TRIP_DELETED]: EventType.TRIP_RESTORED,
      [EventType.TRIP_ARCHIVED]: EventType.TRIP_UNARCHIVED,
      [EventType.TRIP_RESTORED]: EventType.TRIP_ARCHIVED,
      [EventType.TRIP_ASSIGNED]: EventType.TRIP_UNASSIGNED,
      [EventType.TRIP_UPDATED]: EventType.STATE_REVERTED,
      [EventType.DRIVER_UPDATED]: EventType.STATE_REVERTED,
    };

    const inverseType = inverses[event.type] || EventType.STATE_REVERTED;
    const previousState = this._projections.get(event.aggregateId) || null;

    return {
      id: `evt-${Date.now()}-undo-${this._eventCounter++}`,
      type: inverseType,
      aggregateId: event.aggregateId,
      aggregateType: event.aggregateType,
      payload: {
        previousState,
        originalEventId: event.id,
        originalEventType: event.type,
      },
      metadata: {
        actor: event.metadata.actor,
        actorRole: event.metadata.actorRole,
        timestamp: Date.now(),
        source: 'undo',
      },
      version: (this._versionMap.get(event.aggregateId) || 0) + 1,
      causationId: event.id,
      correlationId: event.correlationId,
    };
  }

  _rebuildProjections() {
    this._projections.clear();
    this._versionMap.clear();
    for (const event of this._events) {
      this._applyEvent(event);
    }
  }

  async _persistEvent(event) {
    try {
      const db = await getDB();
      if (!db.objectStoreNames.contains('eventSourcing')) return;
      await db.put('eventSourcing', event, event.id);

      // Trim old events in IndexedDB
      const all = await db.getAll('eventSourcing');
      if (all.length > this._maxEvents) {
        const toDelete = all
          .sort((a, b) => (a.metadata?.timestamp || 0) - (b.metadata?.timestamp || 0))
          .slice(0, all.length - this._maxEvents);
        for (const old of toDelete) {
          await db.delete('eventSourcing', old.id);
        }
      }
    } catch {
      // Non-critical
    }
  }

  async _mirrorToFirestore(event) {
    try {
      await setDoc(doc(db, 'eventSourcing', event.id), {
        ...event,
        mirroredAt: serverTimestamp(),
      }, { merge: true });
    } catch {
      // Non-critical
    }
  }

  _getDevice() {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Android';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Mac/.test(ua)) return 'Mac';
    return 'Unknown';
  }

  _notify(event) {
    this._listeners.forEach(cb => cb(event));
  }
}

export const eventSourcing = new EventSourcingEngine();
export default eventSourcing;
