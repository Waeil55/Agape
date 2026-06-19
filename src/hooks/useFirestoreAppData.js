import { useState, useEffect, useCallback, useRef } from 'react';
import {
  doc,
  onSnapshot,
  setDoc,
  collection,
  addDoc,
  serverTimestamp,
  runTransaction,
  getDocs,
  getDoc,
  writeBatch,
} from '../config/firebase';
import { db, auth } from '../config/firebase';
import {
  readAppData,
  saveAppData,
  saveField as saveFieldLocal,
  queueSyncOperation,
  getPendingSyncOperations,
  completeSyncOperation,
  failSyncOperation,
} from '../utils/localDB';

// Enterprise modules — Wave 1 (foundation)
import { backgroundSync } from '../utils/backgroundSync';
import { crossTabSync, MessageType } from '../utils/crossTabSync';
import { firestoreWriteMetrics, syncMetrics, indexedDBMetrics } from '../utils/performanceMonitor';
import { dataLineage } from '../utils/dataLineage';
import { adaptiveSync } from '../utils/adaptiveSync';

// Enterprise modules — Wave 2 (advanced)
import { eventSourcing, EventType } from '../utils/eventSourcing';
import { firestoreWriteCircuit, CircuitState } from '../utils/circuitBreaker';
import { predictivePrefetch } from '../utils/predictivePrefetch';
import { retryQueue } from '../utils/retryQueue';
import { distributedLock } from '../utils/distributedLock';

// Enterprise modules — Wave 3 (enterprise-grade)
import { sagaExecutor, SagaState } from '../utils/sagaPattern';
import { observability } from '../utils/observability';
import { rateLimiter } from '../utils/rateLimiter';
import { requestDedup } from '../utils/requestDedup';

const DATA_DOC = 'appData/agape';
const TRIPS_COLLECTION = 'trips';
const TRASHED_TRIPS_COLLECTION = 'trashedTrips';
const TRIP_LEDGER_COLLECTION = 'tripLedger';
const DRIVER_TRIP_PROGRESS_COLLECTION = 'driverTripProgress';
const DRIVER_PROFILE_COLLECTION = 'driverProfiles';
const DISPATCHER_PROFILE_COLLECTION = 'dispatcherProfiles';
const VEHICLE_COLLECTION = 'fleetVehicles';
const LOG_COLLECTION = 'logs';
const PHONE_NUMBERS_DOC = 'systemConfig/phoneNumbers';
const BACKUP_COLLECTION = 'systemBackups';
const MIRRORED_TRIP_FIELDS = new Set(['trips', 'trashedTrips']);

// Firestore single-document size limit is 1 MiB. We stop embedding the full
// trips/trashedTrips arrays in appData/agape once we cross this threshold and
// instead use the root collections as the source of truth.
const APP_DATA_SIZE_THRESHOLD_BYTES = 800 * 1024;

const DEFAULT_DATA = {
  trips: [],
  drivers: [],
  dispatchers: [],
  vehicles: [],
  trashedTrips: [],
  logs: [
    { t: 'System Initialized', d: 'Agape Care Cloud OS is now online.', c: 'emerald', type: 'system' }
  ],
  phoneNumbers: { dispatcher: '', routing: '' },
};

function sanitizeForFirestore(obj) {
  return JSON.parse(JSON.stringify(obj, (_key, value) => value === undefined ? null : value));
}

// Convert Firestore Timestamp objects ({seconds, nanoseconds}) to ISO strings.
// Prevents React error #31 when Timestamps are rendered as JSX children.
function convertFirestoreTimestamps(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (typeof obj.toDate === 'function') {
    try { return obj.toDate().toISOString(); } catch { return null; }
  }
  if (obj.seconds !== undefined && obj.nanoseconds !== undefined) {
    try { return new Date(obj.seconds * 1000 + obj.nanoseconds / 1000000).toISOString(); } catch { return null; }
  }
  if (Array.isArray(obj)) return obj.map(convertFirestoreTimestamps);
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = convertFirestoreTimestamps(value);
  }
  return result;
}

function normalizeTrip(trip) {
  if (!trip) return trip;
  const cleanValue = String(trip.bookingId || '').trim();
  if (!cleanValue) return trip;
  if (/^BK-\d+-\d+$/i.test(cleanValue)) return { ...trip, bookingId: null };
  if (/^TRP-\d+$/i.test(cleanValue)) return { ...trip, bookingId: null };
  if (/^TRIP-\d{10,}-\d+$/i.test(cleanValue)) return { ...trip, bookingId: null };
  return trip;
}

// Safely convert any value to a plain string.
// Handles the legacy {address, phone, time} shape stored in old CSV-imported trips.
// React error #31 is thrown when an object is rendered as a JSX child.
function safeStr(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    return val.address || val.name || val.label || val.text || val.value || '';
  }
  return String(val);
}

function sanitizeTripFields(trip) {
  if (!trip || typeof trip !== 'object') return trip;
  return {
    ...trip,
    pickup:  safeStr(trip.pickup),
    dropoff: safeStr(trip.dropoff),
    time:    typeof trip.time === 'string' ? trip.time : safeStr(trip.time),
    notes:   safeStr(trip.notes),
    status:  typeof trip.status === 'string' ? trip.status : safeStr(trip.status),
    date:    typeof trip.date === 'string' ? trip.date : safeStr(trip.date),
  };
}

function normalizeData(data = {}) {
  const drivers = data.drivers || [];
  const buildSafeTrips = (tripArr) => (tripArr || []).map(trip => {
    if (!trip) return trip;

    let safePatient = trip?.patient;
    if (safePatient && typeof safePatient === 'object') {
      safePatient = 'Unknown Client';
    }

    let dName = trip?.driverName;
    if (dName && typeof dName === 'string' && dName.toLowerCase().includes('agape care medical')) {
      dName = '';
    }
    
    // Auto-resolve missing driver name and email from the admin users/drivers list
    if (!dName) {
      const matchedDriver = 
        (trip.driverId && drivers.find(d => d.id === trip.driverId)) ||
        (trip.driverEmail && drivers.find(d => d.email === trip.driverEmail));
      
      if (matchedDriver && matchedDriver.name) {
        dName = matchedDriver.name;
      }
    } else if (!trip.driverId) {
      // Auto-resolve missing driverId from driverName
      const exactMatch = drivers.find(d => d.name && d.name.trim().toLowerCase() === dName.trim().toLowerCase());
      if (exactMatch) {
        trip.driverId = exactMatch.id;
        if (exactMatch.email) trip.driverEmail = exactMatch.email;
      } else {
        const partialMatch = drivers.find(d => d.name && d.name.trim().toLowerCase().startsWith(dName.trim().toLowerCase()));
        if (partialMatch) {
          trip.driverId = partialMatch.id;
          if (partialMatch.email) trip.driverEmail = partialMatch.email;
        }
      }
    }

    // Auto-resolve missing driverEmail from driverId
    if ((!trip.driverEmail || trip.driverEmail === '') && trip.driverId) {
      const matchedById = drivers.find(d => d.id === trip.driverId);
      if (matchedById && matchedById.email) {
        trip.driverEmail = matchedById.email;
      }
    }

    return sanitizeTripFields({ ...trip, driverName: dName || '', patient: safePatient });
  });

  return {
    ...DEFAULT_DATA,
    ...data,
    trips: buildSafeTrips(data.trips),
    drivers: data.drivers || [],
    dispatchers: data.dispatchers || [],
    vehicles: data.vehicles || [],
    trashedTrips: buildSafeTrips(data.trashedTrips),
    logs: data.logs || [],
    phoneNumbers: data.phoneNumbers || DEFAULT_DATA.phoneNumbers,
  };
}

// Merge multiple trip arrays by stable ID. Prefers the trip that was updated most
// recently (by `updatedAtLocal` or `updatedAt`). If timestamps are equal or missing,
// the trip with the more advanced workflow status wins (Completed > At Pickup > …).
// This prevents a slow root-collection snapshot from overwriting a driver's
// just-finished trip with its stale cloud state.
function mergeTripsById(...arrays) {
  const merged = new Map();
  arrays.forEach((arr) => {
    (arr || []).forEach((trip, index) => {
      if (!trip) return;
      const id = getStableRecordId(trip, 'trip', index);
      const existing = merged.get(id);
      if (!existing) {
        merged.set(id, { ...trip, id });
        return;
      }
      const timeExisting = tripRecordTime(existing);
      const timeNew = tripRecordTime(trip);
      if (timeNew > timeExisting) {
        merged.set(id, { ...trip, id });
        return;
      }
      if (timeNew < timeExisting) return;
      // Timestamps equal (or both zero) — prefer the more advanced workflow status
      const spExisting = STATUS_PRIORITY[existing?.status] || 0;
      const spNew = STATUS_PRIORITY[trip?.status] || 0;
      if (spNew > spExisting) merged.set(id, { ...trip, id });
    });
  });
  return [...merged.values()];
}

const STATUS_PRIORITY = {
  'Completed': 10,
  'At Pickup': 9,
  'In Mission': 9,
  'Assigned': 8,
  'No Show': 7,
  'Cancelled': 7,
  'Rerouted': 7,
  'Unassigned': 1,
};

function tripContentKey(trip) {
  if (!trip) return '';
  const bk = String(trip.bookingId || '').trim();
  if (bk && !/^BK-\d+-\d+$/i.test(bk) && !/^TRP-\d+$/i.test(bk) && !/^TRIP-\d{10,}-\d+$/i.test(bk)) {
    return `bk::${bk.toLowerCase()}`;
  }
  const parts = [
    String(trip.patient || '').trim().toLowerCase(),
    String(trip.date || '').trim(),
    String(trip.time || '').trim(),
    String(trip.pickup || '').trim().toLowerCase().replace(/\s+/g, ' '),
    String(trip.dropoff || '').trim().toLowerCase().replace(/\s+/g, ' '),
  ];
  if (parts.some(Boolean)) return `cmp::${parts.join('|')}`;
  const id = String(trip.id || '').trim();
  return id ? `id::${id}` : '';
}

function tripRecordTime(trip) {
  const raw = trip?.updatedAtLocal || trip?.updatedAt || trip?.createdAt || trip?.completedAt;
  if (raw?.toMillis) return raw.toMillis();
  if (raw?.seconds) return raw.seconds * 1000;
  const parsed = Date.parse(raw || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

// Remove duplicate trips that represent the same logical ride. Keeps the most
// "advanced" record (Completed > active statuses > Unassigned) and prefers one
// with a driver assignment or the most recent update.
function dedupTripsByContent(trips = []) {
  const groups = new Map();
  (trips || []).forEach((trip) => {
    if (!trip) return;
    const key = tripContentKey(trip);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(trip);
  });

  const result = [];
  groups.forEach((group) => {
    if (group.length === 1) {
      result.push(group[0]);
      return;
    }
    const sorted = group.sort((a, b) => {
      const pa = STATUS_PRIORITY[a?.status] || 0;
      const pb = STATUS_PRIORITY[b?.status] || 0;
      if (pa !== pb) return pb - pa;
      const da = a?.driverId ? 1 : 0;
      const db = b?.driverId ? 1 : 0;
      if (da !== db) return db - da;
      return tripRecordTime(b) - tripRecordTime(a);
    });
    result.push(sorted[0]);
  });
  return result;
}

async function loadCollectionTrips(collectionName) {
  const snap = await getDocs(collection(db, collectionName));
  const trips = [];
  snap.forEach((tripDoc) => {
    trips.push(convertFirestoreTimestamps({ id: tripDoc.id, ...tripDoc.data() }));
  });
  return trips;
}

// Estimate the byte size a JSON payload would have once written to Firestore.
function estimateJsonBytes(value) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return 0;
  }
}

function mergeTripProgress(trips = [], progressByTrip = {}) {
  return (trips || []).map((trip) => {
    const progress = progressByTrip?.[trip?.id];
    return progress ? { ...trip, ...progress } : trip;
  });
}

function shouldIgnoreRealtimePermissionError(err) {
  return err?.code === 'permission-denied' && !auth.currentUser;
}

function getTripId(trip, fallbackPrefix, index) {
  // Always prefer the trip's own stable ID (from Firestore document).
  // Fall back to bookingId (from CSV import). Never use array position or Date.now().
  if (trip?.id) return String(trip.id);
  if (trip?.bookingId) return `BK-${trip.bookingId}`;
  return `${fallbackPrefix}-${index}`;
}

function getStableRecordId(record, fallbackPrefix, index) {
  return String(record?.id || record?.bookingId || `${fallbackPrefix}-${index}`);
}

function mergeRecordsById(primary = [], fallback = [], fallbackPrefix = 'record') {
  const merged = new Map();

  (fallback || []).forEach((record, index) => {
    const id = getStableRecordId(record, fallbackPrefix, index);
    merged.set(id, { ...record, id });
  });

  (primary || []).forEach((record, index) => {
    const id = getStableRecordId(record, fallbackPrefix, index);
    merged.set(id, { ...(merged.get(id) || {}), ...record, id });
  });

  return [...merged.values()];
}

function getRecordTime(record) {
  const raw = record?.timestamp || record?.updatedAt || record?.updatedAtLocal || record?.createdAt || record?.t;
  if (raw?.toMillis) return raw.toMillis();
  if (raw?.seconds) return raw.seconds * 1000;
  const parsed = Date.parse(raw || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortNewestFirst(records = []) {
  return [...records].sort((a, b) => getRecordTime(b) - getRecordTime(a));
}

function mergeDataWithLedger(data, ledgerData) {
  if (!ledgerData) return normalizeData(data);

  const activeApp = data.trips || [];
  const archivedApp = data.trashedTrips || [];
  const activeAppIds = new Set(activeApp.map((trip, index) => getStableRecordId(trip, 'active', index)));
  const archivedAppIds = new Set(archivedApp.map((trip, index) => getStableRecordId(trip, 'archived', index)));

  const ledgerActive = (ledgerData.trips || []).filter((trip, index) => {
    const id = getStableRecordId(trip, 'active', index);
    return !archivedAppIds.has(id);
  });
  const ledgerArchived = (ledgerData.trashedTrips || []).filter((trip, index) => {
    const id = getStableRecordId(trip, 'archived', index);
    return !activeAppIds.has(id);
  });

  return normalizeData({
    ...data,
    trips: dedupTripsByContent(mergeRecordsById(activeApp, ledgerActive, 'active')),
    trashedTrips: dedupTripsByContent(mergeRecordsById(archivedApp, ledgerArchived, 'archived')),
  });
}

function hasRecoveredLedgerRecords(baseData, mergedData) {
  const baseActiveIds = new Set((baseData.trips || []).map((trip, index) => getStableRecordId(trip, 'active', index)));
  const baseArchivedIds = new Set((baseData.trashedTrips || []).map((trip, index) => getStableRecordId(trip, 'archived', index)));
  const hasNewActiveId = (mergedData.trips || []).some((trip, index) => !baseActiveIds.has(getStableRecordId(trip, 'active', index)));
  const hasNewArchivedId = (mergedData.trashedTrips || []).some((trip, index) => !baseArchivedIds.has(getStableRecordId(trip, 'archived', index)));

  return (
    (mergedData.trips?.length || 0) > (baseData.trips?.length || 0) ||
    (mergedData.trashedTrips?.length || 0) > (baseData.trashedTrips?.length || 0) ||
    hasNewActiveId ||
    hasNewArchivedId
  );
}

async function loadCollectionRecords(collectionName) {
  const snap = await getDocs(collection(db, collectionName));
  const records = [];
  snap.forEach((itemDoc) => {
    records.push(convertFirestoreTimestamps({ id: itemDoc.id, ...itemDoc.data() }));
  });
  return records;
}

async function mirrorRecordsToCollection(collectionName, records = []) {
  const sanitizedRecords = (records || [])
    .filter((record) => record?.id)
    .map((record) => ({
      id: String(record.id),
      data: sanitizeForFirestore({
        ...record,
        updatedAtLocal: record.updatedAtLocal || new Date().toISOString(),
      }),
    }));

  const existingIds = new Set();
  const existingSnap = await getDocs(collection(db, collectionName));
  existingSnap.forEach((recordDoc) => existingIds.add(recordDoc.id));
  const nextIds = new Set(sanitizedRecords.map(({ id }) => id));
  const staleIds = [...existingIds].filter((id) => !nextIds.has(id));

  for (let i = 0; i < sanitizedRecords.length; i += 450) {
    const batch = writeBatch(db);
    sanitizedRecords.slice(i, i + 450).forEach(({ id, data }) => {
      batch.set(doc(db, collectionName, id), data, { merge: true });
    });
    await batch.commit();
  }

  for (let i = 0; i < staleIds.length; i += 450) {
    const batch = writeBatch(db);
    staleIds.slice(i, i + 450).forEach((id) => {
      batch.delete(doc(db, collectionName, id));
    });
    await batch.commit();
  }
}

async function mirrorLogsToCollection(logs = []) {
  const sanitizedLogs = (logs || [])
    .filter(Boolean)
    .map((log, index) => {
      const base = String(log?.id || `${getRecordTime(log) || Date.now()}-${log?.t || log?.action || 'log'}-${index}`)
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .slice(0, 140);
      return {
        id: base || `log-${Date.now()}-${index}`,
        data: sanitizeForFirestore({
          ...log,
          id: log?.id || base,
          mirroredAtLocal: new Date().toISOString(),
        }),
      };
    });

  for (let i = 0; i < sanitizedLogs.length; i += 450) {
    const batch = writeBatch(db);
    sanitizedLogs.slice(i, i + 450).forEach(({ id, data }) => {
      batch.set(doc(db, LOG_COLLECTION, id), data, { merge: true });
    });
    await batch.commit();
  }
}

async function mirrorTripsToLedger(trips = [], trashedTrips = []) {
  const activeTrips = dedupTripsByContent(trips);
  const archivedTrips = dedupTripsByContent(trashedTrips);
  const entries = [
    ...activeTrips.map((trip, index) => ({ trip, index, archiveState: 'active' })),
    ...archivedTrips.map((trip, index) => ({ trip, index, archiveState: 'archived' })),
  ];

  const sanitizedEntries = entries
    .filter(({ trip }) => trip)
    .map(({ trip, index, archiveState }) => ({
      id: getTripId(trip, archiveState, index),
      data: sanitizeForFirestore({
        ...trip,
        archiveState,
        mirroredAt: new Date().toISOString(),
      }),
    }));
  for (let i = 0; i < sanitizedEntries.length; i += 450) {
    const batch = writeBatch(db);
    sanitizedEntries.slice(i, i + 450).forEach(({ id, data }) => {
      batch.set(doc(db, TRIP_LEDGER_COLLECTION, id), data, { merge: true });
    });
    await batch.commit();
  }
}

async function buildDataFromTripLedger() {
  // Prefer the root trips/trashedTrips collections as the primary source of truth.
  // Fall back to the legacy tripLedger only if the collections are empty.
  const [activeTrips, archivedTrips, ledgerSnap] = await Promise.all([
    loadCollectionTrips(TRIPS_COLLECTION),
    loadCollectionTrips(TRASHED_TRIPS_COLLECTION),
    getDocs(collection(db, TRIP_LEDGER_COLLECTION)),
  ]);

  let trips = activeTrips || [];
  let trashedTrips = archivedTrips || [];

  if (trips.length === 0 || trashedTrips.length === 0) {
    const ledgerTrips = [];
    const ledgerArchived = [];
    ledgerSnap.forEach((tripDoc) => {
      const trip = convertFirestoreTimestamps({ id: tripDoc.id, ...tripDoc.data() });
      if (trip.archiveState === 'archived') {
        ledgerArchived.push(trip);
      } else {
        ledgerTrips.push(trip);
      }
    });
    if (trips.length === 0) trips = ledgerTrips;
    if (trashedTrips.length === 0) trashedTrips = ledgerArchived;
  }

  if (trips.length === 0 && trashedTrips.length === 0) return null;
  return { ...DEFAULT_DATA, trips: dedupTripsByContent(trips), trashedTrips: dedupTripsByContent(trashedTrips) };
}

async function buildDataFromMirrors() {
  const [tripData, drivers, dispatchers, vehicles, logs, phoneNumbersSnap] = await Promise.all([
    buildDataFromTripLedger(),
    loadCollectionRecords(DRIVER_PROFILE_COLLECTION),
    loadCollectionRecords(DISPATCHER_PROFILE_COLLECTION),
    loadCollectionRecords(VEHICLE_COLLECTION),
    loadCollectionRecords(LOG_COLLECTION).catch(() => []),
    getDoc(doc(db, PHONE_NUMBERS_DOC)),
  ]);

  return normalizeData({
    ...(tripData || {}),
    drivers,
    dispatchers,
    vehicles,
    logs: sortNewestFirst(logs),
    phoneNumbers: phoneNumbersSnap.exists()
      ? convertFirestoreTimestamps({ ...DEFAULT_DATA.phoneNumbers, ...phoneNumbersSnap.data() })
      : DEFAULT_DATA.phoneNumbers,
  });
}

export function useFirestoreAppData() {
  const [state, setState] = useState({
    trips: [],
    drivers: [],
    dispatchers: [],
    vehicles: [],
    trashedTrips: [],
    logs: [],
    phoneNumbers: DEFAULT_DATA.phoneNumbers,
    loading: true,
    saving: false,
    error: null,
    initialized: false,
    docExists: false,
    lastSavedAt: null,
    lastLoadedAt: null,
    lastRecoveredAt: null,
    lastBackupAt: null,
    lastRepairAt: null,
    listenerStatus: {},
  });

  const dataRef = useRef(DEFAULT_DATA);
  const tripProgressRef = useRef({});
  const pendingWritesRef = useRef(0);
  const recoveringRef = useRef(false);
  const indexedDBLoadedRef = useRef(false);
  const lastFirestoreSyncRef = useRef(null);
  const mirrorBackfillRef = useRef({
    drivers: false,
    dispatchers: false,
    vehicles: false,
    logs: false,
    phoneNumbers: false,
  });

  // Root trips/trashedTrips collections are the primary source of truth once loaded.
  // appData/agape.trips is kept as a legacy fallback for old clients and for metadata.
  const tripsCollectionRef = useRef([]);
  const trashedCollectionRef = useRef([]);
  const tripsCollectionLoadedRef = useRef(false);
  const trashedCollectionLoadedRef = useRef(false);

  // Small helper: wait up to ~5s for a collection listener to deliver its first snapshot.
  // This prevents stale IndexedDB data from overwriting cloud data on initial load.
  const waitForCollectionSync = useCallback(async (loadedRef) => {
    if (loadedRef.current) return;
    let attempts = 0;
    while (!loadedRef.current && attempts < 50) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts += 1;
    }
  }, []);

  // ── IndexedDB: Load from local DB on mount for instant startup ────────────
  useEffect(() => {
    if (indexedDBLoadedRef.current) return;
    indexedDBLoadedRef.current = true;

    // Initialize enterprise modules — Wave 1 (foundation)
    crossTabSync.init();
    dataLineage.init();
    backgroundSync.start();
    adaptiveSync.start();

    // Initialize enterprise modules — Wave 2 (advanced)
    eventSourcing.init();
    predictivePrefetch.start();
    retryQueue.start();

    // Initialize enterprise modules — Wave 3 (enterprise-grade)
    // observability and rateLimiter are singletons — auto-initialized on import
    // requestDedup is a singleton — auto-initialized on import

    readAppData().then((localData) => {
      if (!localData) return;
      // Apply local data immediately — user sees data in <10ms
      const normalized = normalizeData(localData);
      dataRef.current = normalized;
      setState(prev => ({
        ...prev,
        trips: normalized.trips || [],
        drivers: normalized.drivers || [],
        dispatchers: normalized.dispatchers || [],
        vehicles: normalized.vehicles || [],
        trashedTrips: normalized.trashedTrips || [],
        logs: normalized.logs || [],
        phoneNumbers: normalized.phoneNumbers || DEFAULT_DATA.phoneNumbers,
        loading: false,
        initialized: true,
        docExists: true,
        lastLoadedAt: localData._lastLocalSync || new Date().toISOString(),
      }));
    }).catch(() => {});

    // Process any pending sync operations from previous offline sessions
    processSyncQueue().catch(() => {});
  }, []);

  // ── Background sync queue processor ────────────────────────────────────────
  const processSyncQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    const pending = await getPendingSyncOperations();
    if (pending.length === 0) return;

    for (const op of pending) {
      // Check if next retry time has passed
      if (op.nextRetryAt && new Date(op.nextRetryAt) > new Date()) continue;

      try {
        if (op.type === 'setDoc') {
          await setDoc(doc(db, op.collection, op.docId), op.data, { merge: true });
        } else if (op.type === 'setField') {
          await setDoc(doc(db, DATA_DOC), {
            [op.field]: op.value,
            updatedAt: serverTimestamp(),
            updatedField: op.field,
            updatedAtLocal: new Date().toISOString(),
          }, { merge: true });
        }
        await completeSyncOperation(op.id);
      } catch (err) {
        await failSyncOperation(op.id, err);
      }
    }
  }, []);

  // Re-process sync queue when connection comes back online
  useEffect(() => {
    const handleOnline = () => processSyncQueue();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [processSyncQueue]);

  // Cross-tab sync: listen for updates from other tabs
  useEffect(() => {
    const unsub = crossTabSync.on(MessageType.DATA_UPDATE, (data, senderTabId) => {
      const { field, value } = data;
      if (!field || value === undefined) return;

      // Apply the update from the other tab
      dataRef.current = {
        ...normalizeData(dataRef.current),
        [field]: value,
      };
      setState(prev => ({
        ...prev,
        [field]: value,
      }));
    });
    return unsub;
  }, []);

  const setListenerStatus = useCallback((name, status, err = null) => {
    setState(prev => ({
      ...prev,
      listenerStatus: {
        ...prev.listenerStatus,
        [name]: {
          status,
          at: new Date().toISOString(),
          error: err ? (err.message || String(err)) : null,
        },
      },
    }));
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, DATA_DOC),
      (snap) => {
        setListenerStatus('appData', 'live');
        if (snap.exists()) {
          const currentData = normalizeData(dataRef.current);
          const snapData = convertFirestoreTimestamps(snap.data());

          // Root trips/trashedTrips collections are the primary source of truth.
          // appData/agape trips are kept only as a legacy fallback.
          const tripsFromCollection = tripsCollectionLoadedRef.current ? tripsCollectionRef.current : null;
          const trashedFromCollection = trashedCollectionLoadedRef.current ? trashedCollectionRef.current : null;

          const d = normalizeData({
            ...snapData,
            trips: Array.isArray(tripsFromCollection) && tripsFromCollection.length > 0
              ? tripsFromCollection
              : (snapData?.trips?.length || 0) > 0 ? snapData.trips : currentData.trips,
            trashedTrips: Array.isArray(trashedFromCollection) && trashedFromCollection.length > 0
              ? trashedFromCollection
              : (snapData?.trashedTrips?.length || 0) > 0 ? snapData.trashedTrips : currentData.trashedTrips,
            drivers: (snapData?.drivers?.length || 0) > 0 ? snapData.drivers : currentData.drivers,
            dispatchers: (snapData?.dispatchers?.length || 0) > 0 ? snapData.dispatchers : currentData.dispatchers,
            vehicles: (snapData?.vehicles?.length || 0) > 0 ? snapData.vehicles : currentData.vehicles,
            phoneNumbers: snapData?.phoneNumbers && Object.keys(snapData.phoneNumbers || {}).length > 0
              ? snapData.phoneNumbers
              : currentData.phoneNumbers,
          });

          const applyData = (nextData) => {
            // Always prefer the live root collections for trips/trashedTrips.
            const effectiveTrips = dedupTripsByContent(
              tripsCollectionLoadedRef.current && tripsCollectionRef.current.length > 0
                ? tripsCollectionRef.current
                : nextData.trips
            );
            const effectiveTrashed = dedupTripsByContent(
              trashedCollectionLoadedRef.current && trashedCollectionRef.current.length > 0
                ? trashedCollectionRef.current
                : nextData.trashedTrips
            );

            const mergedData = {
              ...nextData,
              trips: mergeTripProgress(effectiveTrips, tripProgressRef.current),
              trashedTrips: effectiveTrashed,
            };
            dataRef.current = mergedData;
            lastFirestoreSyncRef.current = new Date().toISOString();
            setState(prev => ({
              ...prev,
              trips: mergedData.trips,
              drivers: mergedData.drivers,
              dispatchers: mergedData.dispatchers,
              vehicles: mergedData.vehicles,
              trashedTrips: mergedData.trashedTrips,
              logs: mergedData.logs,
              phoneNumbers: mergedData.phoneNumbers,
              loading: false,
              error: null,
              initialized: true,
              docExists: true,
              lastLoadedAt: new Date().toISOString(),
              lastFirestoreSync: lastFirestoreSyncRef.current,
            }));
            // Write-through to IndexedDB for instant startup next time
            Promise.resolve(saveAppData({
              trips: mergedData.trips,
              drivers: mergedData.drivers,
              dispatchers: mergedData.dispatchers,
              vehicles: mergedData.vehicles,
              trashedTrips: mergedData.trashedTrips,
              logs: mergedData.logs,
              phoneNumbers: mergedData.phoneNumbers,
              _lastLocalSync: new Date().toISOString(),
            })).catch(() => {});
          };

          buildDataFromTripLedger()
            .then(async (recovered) => {
              if (!recovered || (!recovered.trips.length && !recovered.trashedTrips.length)) {
                applyData(d);
                return;
              }

              const hydrated = mergeDataWithLedger(d, recovered);
              applyData(hydrated);

              if (recoveringRef.current) return;
              if (!hasRecoveredLedgerRecords(d, hydrated)) return;

              recoveringRef.current = true;
              try {
                // First ensure the root collections contain the recovered trips.
                await Promise.all([
                  ...(hydrated.trips || []).map(trip => trip?.id
                    ? setDoc(doc(db, TRIPS_COLLECTION, String(trip.id)), sanitizeForFirestore(trip))
                    : Promise.resolve()),
                  ...(hydrated.trashedTrips || []).map(trip => trip?.id
                    ? setDoc(doc(db, TRASHED_TRIPS_COLLECTION, String(trip.id)), sanitizeForFirestore(trip))
                    : Promise.resolve()),
                ]);

                // Try to patch appData/agape; if too large, metadata-only.
                try {
                  await setDoc(doc(db, DATA_DOC), {
                    trips: sanitizeForFirestore(hydrated.trips),
                    trashedTrips: sanitizeForFirestore(hydrated.trashedTrips),
                    recoveredFromLedger: true,
                    recoveredAt: new Date().toISOString(),
                    updatedAt: serverTimestamp(),
                    updatedField: 'trips',
                    updatedAtLocal: new Date().toISOString(),
                  }, { merge: true });
                } catch (patchErr) {
                  console.warn('Ledger recovery patch to appData failed (likely size limit). Root collections are now authoritative.', patchErr);
                  await setDoc(doc(db, DATA_DOC), {
                    recoveredFromLedger: true,
                    recoveredAt: new Date().toISOString(),
                    updatedAt: serverTimestamp(),
                    updatedField: 'trips-recovery-metadata',
                    updatedAtLocal: new Date().toISOString(),
                  }, { merge: true });
                }
                setState(prev => ({ ...prev, lastRecoveredAt: new Date().toISOString() }));
              } catch (recoveryErr) {
                console.warn('Ledger recovery patch failed, but data is loaded locally.', recoveryErr);
              } finally {
                recoveringRef.current = false;
              }
            })
            .catch((recoveryErr) => {
              console.error('Trip ledger recovery failed:', recoveryErr);
              applyData(d);
            });
        } else {
          buildDataFromMirrors()
            .then((recovered) => {
              const seed = recovered || DEFAULT_DATA;
              return runTransaction(db, async (transaction) => {
                const ref = doc(db, DATA_DOC);
                const freshSnap = await transaction.get(ref);
                if (!freshSnap.exists()) {
                  transaction.set(ref, sanitizeForFirestore({
                    ...seed,
                    initializedAt: new Date().toISOString(),
                    recoveredFromLedger: Boolean(recovered),
                  }));
                }
              });
            })
            .catch((err) => {
              console.error('App data initialization failed:', err);
              setState(prev => ({ ...prev, error: err.message || 'App data initialization failed' }));
            });
          setState(prev => ({ ...prev, loading: false, initialized: false, docExists: false }));
        }
      },
      (err) => {
        setListenerStatus('appData', 'error', err);
        setState(prev => ({ ...prev, error: err.message, loading: false }));
      }
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (!state.initialized) return;

    if (!mirrorBackfillRef.current.drivers && state.drivers.length > 0) {
      mirrorBackfillRef.current.drivers = true;
      mirrorRecordsToCollection(DRIVER_PROFILE_COLLECTION, state.drivers).catch((err) => {
        mirrorBackfillRef.current.drivers = false;
        console.error('Driver profile backfill failed:', err);
      });
    }

    if (!mirrorBackfillRef.current.dispatchers && state.dispatchers.length > 0) {
      mirrorBackfillRef.current.dispatchers = true;
      mirrorRecordsToCollection(DISPATCHER_PROFILE_COLLECTION, state.dispatchers).catch((err) => {
        mirrorBackfillRef.current.dispatchers = false;
        console.error('Dispatcher profile backfill failed:', err);
      });
    }

    if (!mirrorBackfillRef.current.vehicles && state.vehicles.length > 0) {
      mirrorBackfillRef.current.vehicles = true;
      mirrorRecordsToCollection(VEHICLE_COLLECTION, state.vehicles).catch((err) => {
        mirrorBackfillRef.current.vehicles = false;
        console.error('Vehicle backfill failed:', err);
      });
    }

    if (!mirrorBackfillRef.current.logs && state.logs.length > 0) {
      mirrorBackfillRef.current.logs = true;
      mirrorLogsToCollection(state.logs).catch((err) => {
        mirrorBackfillRef.current.logs = false;
        console.error('Log backfill failed:', err);
      });
    }

    const hasCustomPhoneNumbers = JSON.stringify(state.phoneNumbers || {}) !== JSON.stringify(DEFAULT_DATA.phoneNumbers);
    if (!mirrorBackfillRef.current.phoneNumbers && hasCustomPhoneNumbers) {
      mirrorBackfillRef.current.phoneNumbers = true;
      setDoc(doc(db, PHONE_NUMBERS_DOC), sanitizeForFirestore(state.phoneNumbers), { merge: true }).catch((err) => {
        mirrorBackfillRef.current.phoneNumbers = false;
        console.error('Phone number backfill failed:', err);
      });
    }
  }, [state.initialized, state.drivers, state.dispatchers, state.vehicles, state.logs, state.phoneNumbers]);

  useEffect(() => {
    const bindCollection = (field, collectionName) => onSnapshot(
      collection(db, collectionName),
      (snap) => {
        setListenerStatus(collectionName, 'live');
        const currentList = dataRef.current[field] || [];
        if (snap.size === 0 && currentList.length > 0) return;
        const snapshotList = [];
        snap.forEach((itemDoc) => {
          snapshotList.push(convertFirestoreTimestamps({ id: itemDoc.id, ...itemDoc.data() }));
        });
        const nextList = mergeRecordsById(snapshotList, currentList, field);
        dataRef.current = {
          ...normalizeData(dataRef.current),
          [field]: nextList,
        };
        setState(prev => ({
          ...prev,
          [field]: nextList,
          loading: false,
          error: null,
        }));
      },
      (err) => {
        if (shouldIgnoreRealtimePermissionError(err)) return;
        setListenerStatus(collectionName, 'error', err);
        console.error(`Realtime ${field} sync failed:`, err);
      }
    );

    const unsubDrivers = bindCollection('drivers', DRIVER_PROFILE_COLLECTION);
    const unsubDispatchers = bindCollection('dispatchers', DISPATCHER_PROFILE_COLLECTION);
    const unsubVehicles = bindCollection('vehicles', VEHICLE_COLLECTION);
    const unsubLogs = onSnapshot(
      collection(db, LOG_COLLECTION),
      (snap) => {
        setListenerStatus(LOG_COLLECTION, 'live');
        const currentList = dataRef.current.logs || [];
        if (snap.size === 0 && currentList.length > 0) return;
        const snapshotList = [];
        snap.forEach((itemDoc) => {
          snapshotList.push(convertFirestoreTimestamps({ id: itemDoc.id, ...itemDoc.data() }));
        });
        const logs = sortNewestFirst(mergeRecordsById(snapshotList, currentList, 'log'));
        dataRef.current = {
          ...normalizeData(dataRef.current),
          logs,
        };
        setState(prev => ({
          ...prev,
          logs,
          loading: false,
          error: null,
        }));
      },
      (err) => {
        if (shouldIgnoreRealtimePermissionError(err)) return;
        setListenerStatus(LOG_COLLECTION, 'error', err);
        console.error('Realtime logs sync failed:', err);
      }
    );
    const unsubPhones = onSnapshot(
      doc(db, PHONE_NUMBERS_DOC),
      (snap) => {
        setListenerStatus('phoneNumbers', 'live');
        const currentNumbers = dataRef.current.phoneNumbers || DEFAULT_DATA.phoneNumbers;
        if (!snap.exists() && currentNumbers !== DEFAULT_DATA.phoneNumbers) return;
        const phoneNumbers = snap.exists()
          ? convertFirestoreTimestamps({ ...DEFAULT_DATA.phoneNumbers, ...snap.data() })
          : DEFAULT_DATA.phoneNumbers;
        dataRef.current = {
          ...normalizeData(dataRef.current),
          phoneNumbers,
        };
        setState(prev => ({
          ...prev,
          phoneNumbers,
          loading: false,
          error: null,
        }));
      },
      (err) => {
        if (shouldIgnoreRealtimePermissionError(err)) return;
        setListenerStatus('phoneNumbers', 'error', err);
        console.error('Realtime phone number sync failed:', err);
      }
    );
    const unsubTripProgress = onSnapshot(
      collection(db, DRIVER_TRIP_PROGRESS_COLLECTION),
      (snap) => {
        setListenerStatus(DRIVER_TRIP_PROGRESS_COLLECTION, 'live');
        const progressByTrip = {};
        snap.forEach((progressDoc) => {
          progressByTrip[progressDoc.id] = convertFirestoreTimestamps({
            id: progressDoc.id,
            ...progressDoc.data(),
          });
          delete progressByTrip[progressDoc.id].tripId;
        });
        tripProgressRef.current = progressByTrip;
        const baseData = normalizeData(dataRef.current);
        const mergedTrips = mergeTripProgress(baseData.trips, progressByTrip);
        dataRef.current = {
          ...baseData,
          trips: mergedTrips,
        };
        setState(prev => ({
          ...prev,
          trips: mergedTrips,
          loading: false,
          error: null,
        }));
      },
      (err) => {
        if (shouldIgnoreRealtimePermissionError(err)) return;
        setListenerStatus(DRIVER_TRIP_PROGRESS_COLLECTION, 'error', err);
        console.error('Realtime driver workflow sync failed:', err);
      }
    );
    const unsubTripLedger = onSnapshot(
      collection(db, TRIP_LEDGER_COLLECTION),
      (snap) => {
        setListenerStatus(TRIP_LEDGER_COLLECTION, 'live');
        const ledgerTrips = [];
        const ledgerArchived = [];
        snap.forEach((tripDoc) => {
          const trip = convertFirestoreTimestamps({ id: tripDoc.id, ...tripDoc.data() });
          if (trip.archiveState === 'archived') {
            ledgerArchived.push(trip);
          } else {
            ledgerTrips.push(trip);
          }
        });
        if (ledgerTrips.length === 0 && ledgerArchived.length === 0) return;

        const baseData = normalizeData(dataRef.current);
        const useLedgerTrips = !(tripsCollectionLoadedRef.current && tripsCollectionRef.current.length > 0);
        const useLedgerArchived = !(trashedCollectionLoadedRef.current && trashedCollectionRef.current.length > 0);
        if (!useLedgerTrips && !useLedgerArchived) return;

        const mergedData = mergeDataWithLedger(baseData, {
          ...DEFAULT_DATA,
          trips: useLedgerTrips ? ledgerTrips : [],
          trashedTrips: useLedgerArchived ? ledgerArchived : [],
        });
        const patched = {
          ...mergedData,
          trips: mergeTripProgress(mergedData.trips, tripProgressRef.current),
        };
        dataRef.current = patched;
        setState(prev => ({
          ...prev,
          trips: patched.trips,
          trashedTrips: patched.trashedTrips,
          loading: false,
          error: null,
        }));

          if (!recoveringRef.current && hasRecoveredLedgerRecords(baseData, patched)) {
            recoveringRef.current = true;

            // Push recovered trips into the root collections first.
            Promise.all([
              ...(patched.trips || []).map(trip => trip?.id
                ? setDoc(doc(db, TRIPS_COLLECTION, String(trip.id)), sanitizeForFirestore(trip))
                : Promise.resolve()),
              ...(patched.trashedTrips || []).map(trip => trip?.id
                ? setDoc(doc(db, TRASHED_TRIPS_COLLECTION, String(trip.id)), sanitizeForFirestore(trip))
                : Promise.resolve()),
            ]).then(() => setDoc(doc(db, DATA_DOC), {
              trips: sanitizeForFirestore(patched.trips),
              trashedTrips: sanitizeForFirestore(patched.trashedTrips),
              recoveredFromLedger: true,
              recoveredAt: new Date().toISOString(),
              updatedAt: serverTimestamp(),
              updatedField: 'trips',
              updatedAtLocal: new Date().toISOString(),
            }, { merge: true })).catch((err) => {
              console.warn('Live ledger recovery patch failed (likely size limit). Root collections are authoritative.', err);
              return setDoc(doc(db, DATA_DOC), {
                recoveredFromLedger: true,
                recoveredAt: new Date().toISOString(),
                updatedAt: serverTimestamp(),
                updatedField: 'trips-recovery-metadata',
                updatedAtLocal: new Date().toISOString(),
              }, { merge: true });
            }).then(() => {
              recoveringRef.current = false;
              setState(prev => ({ ...prev, lastRecoveredAt: new Date().toISOString() }));
            });
          }
      },
      (err) => {
        if (shouldIgnoreRealtimePermissionError(err)) return;
        setListenerStatus(TRIP_LEDGER_COLLECTION, 'error', err);
        console.error('Realtime trip ledger sync failed:', err);
      }
    );

    // Primary real-time source of truth for trips
    const unsubTripsCollection = onSnapshot(
      collection(db, TRIPS_COLLECTION),
      (snap) => {
        setListenerStatus(TRIPS_COLLECTION, 'live');
        const snapshotList = [];
        snap.forEach((tripDoc) => {
          snapshotList.push(convertFirestoreTimestamps({ id: tripDoc.id, ...tripDoc.data() }));
        });
        const dedupedSnapshot = dedupTripsByContent(snapshotList);
        tripsCollectionRef.current = dedupedSnapshot;
        tripsCollectionLoadedRef.current = true;

        const baseData = normalizeData(dataRef.current);
        const mergedTrips = dedupedSnapshot.length > 0 ? dedupedSnapshot : baseData.trips;
        const patched = {
          ...baseData,
          trips: mergeTripProgress(mergedTrips, tripProgressRef.current),
        };
        dataRef.current = patched;
        setState(prev => ({
          ...prev,
          trips: patched.trips,
          loading: false,
          error: null,
        }));
      },
      (err) => {
        if (shouldIgnoreRealtimePermissionError(err)) return;
        setListenerStatus(TRIPS_COLLECTION, 'error', err);
        console.error('Realtime trips collection sync failed:', err);
      }
    );

    // Primary real-time source of truth for trashed trips
    const unsubTrashedCollection = onSnapshot(
      collection(db, TRASHED_TRIPS_COLLECTION),
      (snap) => {
        setListenerStatus(TRASHED_TRIPS_COLLECTION, 'live');
        const snapshotList = [];
        snap.forEach((tripDoc) => {
          snapshotList.push(convertFirestoreTimestamps({ id: tripDoc.id, ...tripDoc.data() }));
        });
        const dedupedSnapshot = dedupTripsByContent(snapshotList);
        trashedCollectionRef.current = dedupedSnapshot;
        trashedCollectionLoadedRef.current = true;

        const baseData = normalizeData(dataRef.current);
        const mergedTrashed = dedupedSnapshot.length > 0 ? dedupedSnapshot : baseData.trashedTrips;
        dataRef.current = {
          ...baseData,
          trashedTrips: mergedTrashed,
        };
        setState(prev => ({
          ...prev,
          trashedTrips: mergedTrashed,
          loading: false,
          error: null,
        }));
      },
      (err) => {
        if (shouldIgnoreRealtimePermissionError(err)) return;
        setListenerStatus(TRASHED_TRIPS_COLLECTION, 'error', err);
        console.error('Realtime trashedTrips collection sync failed:', err);
      }
    );

    return () => {
      unsubDrivers();
      unsubDispatchers();
      unsubVehicles();
      unsubLogs();
      unsubPhones();
      unsubTripProgress();
      unsubTripLedger();
      unsubTripsCollection();
      unsubTrashedCollection();
    };
  }, [setListenerStatus]);

  const writeField = useCallback(async (field, value) => {
    const raw = sanitizeForFirestore(value);
    const sanitized = field === 'trips'
      ? (raw || []).map(t => sanitizeTripFields(t))
      : raw;
    const beforeData = dataRef.current[field];

    // Update local state optimistically FIRST
    dataRef.current = {
      ...normalizeData(dataRef.current),
      [field]: sanitized,
    };
    pendingWritesRef.current += 1;
    try { adaptiveSync.setPendingWrites(pendingWritesRef.current); } catch (_) {}
    setState(prev => ({
      ...prev,
      [field]: sanitized,
      saving: true,
      error: null,
    }));

    try {
      if (MIRRORED_TRIP_FIELDS.has(field)) {
        const isTripsField = field === 'trips';
        const tripList = sanitized || [];
        const companionTrips = isTripsField ? (dataRef.current.trashedTrips || []) : (dataRef.current.trips || []);
        const rootCollection = isTripsField ? TRIPS_COLLECTION : TRASHED_TRIPS_COLLECTION;

        // 1. Write each trip to the root collection (primary source of truth).
        for (const trip of tripList) {
          if (trip?.id) {
            setDoc(doc(db, rootCollection, String(trip.id)), sanitizeForFirestore(trip)).catch((tripErr) => {
              console.warn(`Root ${rootCollection}/${trip.id} mirror failed; continuing.`, tripErr);
            });
          }
        }

        // 2. Legacy tripLedger mirror (non-blocking).
        try {
          if (isTripsField) await mirrorTripsToLedger(tripList, companionTrips);
          else await mirrorTripsToLedger(companionTrips, tripList);
        } catch (mirrorErr) {
          console.warn(`Trip ledger mirror failed for ${field}; continuing with core save.`, mirrorErr);
        }

        // 3. Try to keep appData/agape in sync for backwards-compatible clients.
        // If the document is too large (near Firestore's 1 MiB limit), fall back to
        // a metadata-only write so the onSnapshot still fires and new clients reload
        // from the root collections.
        try {
          await setDoc(doc(db, DATA_DOC), {
            [field]: sanitized,
            updatedAt: serverTimestamp(),
            updatedField: field,
            updatedAtLocal: new Date().toISOString(),
          }, { merge: true });
        } catch (docErr) {
          console.warn(`DATA_DOC full ${field} save failed (likely size limit). Writing metadata-only.`, docErr);
          await setDoc(doc(db, DATA_DOC), {
            updatedAt: serverTimestamp(),
            updatedField: `${field}-metadata`,
            updatedAtLocal: new Date().toISOString(),
          }, { merge: true });
        }
      } else {
        // Non-trip fields: write directly to appData/agape as before.
        await setDoc(doc(db, DATA_DOC), {
          [field]: sanitized,
          updatedAt: serverTimestamp(),
          updatedField: field,
          updatedAtLocal: new Date().toISOString(),
        }, { merge: true });
      }

      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      try { adaptiveSync.setPendingWrites(pendingWritesRef.current); } catch (_) {}
      setState(prev => ({
        ...prev,
        saving: pendingWritesRef.current > 0,
        lastSavedAt: new Date().toISOString(),
      }));

      // Non-blocking middleware — fire and forget, never block the save.
      // Each call is individually wrapped in try-catch so a middleware failure
      // cannot propagate and incorrectly set state.error.
      try { firestoreWriteMetrics.mark(`write-${field}`); } catch (_) { /* non-critical */ }
      try { indexedDBMetrics.mark(`idb-${field}`); } catch (_) { /* non-critical */ }
      try { eventSourcing.emit(
        EventType.TRIP_UPDATED, field, 'field',
        { before: beforeData, after: sanitized },
        { actor: auth.currentUser?.email || 'system', source: 'ui' }
      ); } catch (_) { /* non-critical */ }
      try { dataLineage.track({
        field, action: 'update', before: beforeData, after: sanitized,
        actor: auth.currentUser?.email || 'system', actorRole: auth.currentUser?.role || 'system', source: 'ui',
      }); } catch (_) { /* non-critical */ }
      try { crossTabSync.broadcastDataUpdate(field, sanitized, { action: 'update' }); } catch (_) { /* non-critical */ }
      try { Promise.resolve(saveFieldLocal(field, sanitized)).catch(() => {}); } catch (_) { /* non-critical */ }

      if (field === 'drivers') {
        try { Promise.resolve(mirrorRecordsToCollection(DRIVER_PROFILE_COLLECTION, dataRef.current.drivers || [])).catch(() => {}); } catch (_) { /* non-critical */ }
      } else if (field === 'dispatchers') {
        try { Promise.resolve(mirrorRecordsToCollection(DISPATCHER_PROFILE_COLLECTION, dataRef.current.dispatchers || [])).catch(() => {}); } catch (_) { /* non-critical */ }
      } else if (field === 'vehicles') {
        try { Promise.resolve(mirrorRecordsToCollection(VEHICLE_COLLECTION, dataRef.current.vehicles || [])).catch(() => {}); } catch (_) { /* non-critical */ }
      } else if (field === 'logs') {
        try { Promise.resolve(mirrorLogsToCollection(sanitized)).catch(() => {}); } catch (_) { /* non-critical */ }
      } else if (field === 'phoneNumbers') {
        try { Promise.resolve(setDoc(doc(db, PHONE_NUMBERS_DOC), sanitized, { merge: true })).catch(() => {}); } catch (_) { /* non-critical */ }
      }
      return true;
    } catch (err) {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      try { adaptiveSync.setPendingWrites(pendingWritesRef.current); } catch (_) {}
      console.error(`Failed to save ${field} to Firestore:`, err);
      setState(prev => ({
        ...prev,
        saving: pendingWritesRef.current > 0,
        error: err.message || `Failed to save ${field}`,
      }));
      // Queue for retry (wrapped for safety)
      try { Promise.resolve(retryQueue.enqueue({ type: 'setField', field, value: sanitized, collection: DATA_DOC }, err)).catch(() => {}); } catch (_) {}
      try { Promise.resolve(backgroundSync.queue({ type: 'setField', field, value: sanitized, collection: DATA_DOC })).catch(() => {}); } catch (_) {}
      try { Promise.resolve(saveFieldLocal(field, sanitized)).catch(() => {}); } catch (_) {}
      return false;
    }
  }, []);

  const setTrips = useCallback(async (updater) => {
    await waitForCollectionSync(tripsCollectionLoadedRef);
    const current = dataRef.current.trips || [];
    const next = dedupTripsByContent(typeof updater === 'function' ? updater(current) : updater);
    return writeField('trips', next.map(normalizeTrip));
  }, [writeField, waitForCollectionSync]);

  const setDrivers = useCallback((updater) => {
    const current = dataRef.current.drivers || [];
    const next = typeof updater === 'function' ? updater(current) : updater;
    return writeField('drivers', next);
  }, [writeField]);

  const upsertDriverProfile = useCallback(async (driverId, updates = {}) => {
    if (!driverId) return false;
    const currentDrivers = dataRef.current.drivers || [];
    const existing = currentDrivers.find((driver) => driver.id === driverId) || { id: driverId };
    const nextDriver = sanitizeForFirestore({
      ...existing,
      ...updates,
      id: driverId,
      updatedAtLocal: updates.updatedAtLocal || new Date().toISOString(),
    });
    const nextDrivers = currentDrivers.some((driver) => driver.id === driverId)
      ? currentDrivers.map((driver) => (driver.id === driverId ? nextDriver : driver))
      : [...currentDrivers, nextDriver];

    dataRef.current = {
      ...normalizeData(dataRef.current),
      drivers: nextDrivers,
    };
    setState(prev => ({
      ...prev,
      drivers: nextDrivers,
      error: null,
    }));

    try {
      await setDoc(doc(db, DRIVER_PROFILE_COLLECTION, driverId), nextDriver, { merge: true });
      return true;
    } catch (err) {
      console.error('Failed to upsert driver profile:', err);
      setState(prev => ({
        ...prev,
        error: err.message || 'Failed to update driver profile',
      }));
      return false;
    }
  }, []);

  const setDispatchers = useCallback((updater) => {
    const current = dataRef.current.dispatchers || [];
    const next = typeof updater === 'function' ? updater(current) : updater;
    return writeField('dispatchers', next);
  }, [writeField]);

  const upsertDispatcherProfile = useCallback(async (dispatcherId, updates = {}) => {
    if (!dispatcherId) return false;
    const currentDispatchers = dataRef.current.dispatchers || [];
    const existing = currentDispatchers.find((d) => d.id === dispatcherId) || { id: dispatcherId };
    const nextDispatcher = sanitizeForFirestore({
      ...existing,
      ...updates,
      id: dispatcherId,
      updatedAtLocal: updates.updatedAtLocal || new Date().toISOString(),
    });
    const nextDispatchers = currentDispatchers.some((d) => d.id === dispatcherId)
      ? currentDispatchers.map((d) => (d.id === dispatcherId ? nextDispatcher : d))
      : [...currentDispatchers, nextDispatcher];

    dataRef.current = {
      ...normalizeData(dataRef.current),
      dispatchers: nextDispatchers,
    };
    setState(prev => ({
      ...prev,
      dispatchers: nextDispatchers,
      error: null,
    }));

    try {
      await setDoc(doc(db, DISPATCHER_PROFILE_COLLECTION, dispatcherId), nextDispatcher, { merge: true });
      return true;
    } catch (err) {
      console.error('Failed to upsert dispatcher profile:', err);
      setState(prev => ({
        ...prev,
        error: err.message || 'Failed to update dispatcher profile',
      }));
      return false;
    }
  }, []);

  const setVehicles = useCallback((updater) => {
    const current = dataRef.current.vehicles || [];
    const next = typeof updater === 'function' ? updater(current) : updater;
    return writeField('vehicles', next);
  }, [writeField]);

  const setTrashedTrips = useCallback(async (updater) => {
    await waitForCollectionSync(trashedCollectionLoadedRef);
    const current = dataRef.current.trashedTrips || [];
    const next = dedupTripsByContent(typeof updater === 'function' ? updater(current) : updater);
    return writeField('trashedTrips', next);
  }, [writeField, waitForCollectionSync]);

  const writeTripsBatch = useCallback(async (nextTrips, nextTrashed) => {
    const sanitizedTrips = sanitizeForFirestore(dedupTripsByContent(nextTrips));
    const sanitizedTrashed = sanitizeForFirestore(dedupTripsByContent(nextTrashed));
    const beforeTrips = dataRef.current.trips;
    const beforeTrashed = dataRef.current.trashedTrips;
    dataRef.current = {
      ...normalizeData(dataRef.current),
      trips: sanitizedTrips,
      trashedTrips: sanitizedTrashed,
    };
    pendingWritesRef.current += 1;
    try { adaptiveSync.setPendingWrites(pendingWritesRef.current); } catch (_) {}
    setState(prev => ({
      ...prev,
      trips: sanitizedTrips,
      trashedTrips: sanitizedTrashed,
      saving: true,
      error: null,
    }));

    // Performance timing (wrapped for safety)
    try { firestoreWriteMetrics.mark('write-trips-batch'); } catch (_) {}

    try {
      // 1. Root collections are the primary source of truth.
      for (const trip of (sanitizedTrips || [])) {
        if (trip?.id) {
          setDoc(doc(db, TRIPS_COLLECTION, String(trip.id)), sanitizeForFirestore(trip)).catch((tripErr) => {
            console.warn(`Root ${TRIPS_COLLECTION}/${trip.id} mirror failed; continuing.`, tripErr);
          });
        }
      }
      for (const trip of (sanitizedTrashed || [])) {
        if (trip?.id) {
          setDoc(doc(db, TRASHED_TRIPS_COLLECTION, String(trip.id)), sanitizeForFirestore(trip)).catch((tripErr) => {
            console.warn(`Root ${TRASHED_TRIPS_COLLECTION}/${trip.id} mirror failed; continuing.`, tripErr);
          });
        }
      }

      // 2. Legacy tripLedger mirror (non-blocking).
      try {
        await mirrorTripsToLedger(sanitizedTrips || [], sanitizedTrashed || []);
      } catch (mirrorErr) {
        console.warn('Trip ledger mirror failed for writeTripsBatch; continuing with core save.', mirrorErr);
      }

      // 3. Backwards-compatible appData/agape write with size guard.
      try {
        await setDoc(doc(db, DATA_DOC), {
          trips: sanitizedTrips,
          trashedTrips: sanitizedTrashed,
          updatedAt: serverTimestamp(),
          updatedField: 'trips+trashed',
          updatedAtLocal: new Date().toISOString(),
        }, { merge: true });
      } catch (docErr) {
        console.warn('DATA_DOC write-trips-batch failed (likely size limit). Writing metadata-only.', docErr);
        await setDoc(doc(db, DATA_DOC), {
          updatedAt: serverTimestamp(),
          updatedField: 'trips+trashed-metadata',
          updatedAtLocal: new Date().toISOString(),
        }, { merge: true });
      }

      try { firestoreWriteMetrics.measure('write-trips-batch', 'firestore-write'); } catch (_) {}

      // Data lineage: track batch change (wrapped for safety)
      try { dataLineage.track({
        field: 'trips',
        action: 'batch-update',
        before: { tripsCount: beforeTrips?.length, trashedCount: beforeTrashed?.length },
        after: { tripsCount: sanitizedTrips?.length, trashedCount: sanitizedTrashed?.length },
        actor: auth.currentUser?.email || 'system',
        actorRole: auth.currentUser?.role || 'system',
        source: 'ui',
      }); } catch (_) {}

      // Cross-tab sync (wrapped for safety)
      try { crossTabSync.broadcastDataUpdate('trips', sanitizedTrips, { action: 'batch' }); } catch (_) {}
      try { crossTabSync.broadcastDataUpdate('trashedTrips', sanitizedTrashed, { action: 'batch' }); } catch (_) {}

      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      try { adaptiveSync.setPendingWrites(pendingWritesRef.current); } catch (_) {}
      try { syncMetrics.record('sync-complete', 1, { field: 'trips+trashed' }); } catch (_) {}
      setState(prev => ({
        ...prev,
        saving: pendingWritesRef.current > 0,
        lastSavedAt: new Date().toISOString(),
      }));
      return true;
    } catch (err) {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      try { adaptiveSync.setPendingWrites(pendingWritesRef.current); } catch (_) {}
      try { syncMetrics.recordError('sync-complete', err, { field: 'trips+trashed' }); } catch (_) {}
      console.error('Failed to save trips+trashed to Firestore:', err);
      setState(prev => ({
        ...prev,
        saving: pendingWritesRef.current > 0,
        error: err.message || 'Failed to save trips',
      }));
      return false;
    }
  }, []);

  const setTripsAndTrashed = useCallback(async (tripsUpdater, trashedUpdater) => {
    await waitForCollectionSync(tripsCollectionLoadedRef);
    await waitForCollectionSync(trashedCollectionLoadedRef);
    const currentTrips = dataRef.current.trips || [];
    const currentTrashed = dataRef.current.trashedTrips || [];
    const nextTrips = typeof tripsUpdater === 'function' ? tripsUpdater(currentTrips) : tripsUpdater;
    const nextTrashed = typeof trashedUpdater === 'function' ? trashedUpdater(currentTrashed) : trashedUpdater;
    return writeTripsBatch(nextTrips, nextTrashed);
  }, [writeTripsBatch, waitForCollectionSync]);

  const setLogs = useCallback((updater) => {
    const current = dataRef.current.logs || [];
    const next = typeof updater === 'function' ? updater(current) : updater;
    return writeField('logs', next);
  }, [writeField]);

  const setPhoneNumbers = useCallback((updater) => {
    const current = dataRef.current.phoneNumbers || DEFAULT_DATA.phoneNumbers;
    const next = typeof updater === 'function' ? updater(current) : updater;
    return writeField('phoneNumbers', next);
  }, [writeField]);

  const addLog = useCallback(async (log) => {
    try {
      const logRef = collection(db, 'logs');
      const logDoc = await addDoc(logRef, { ...log, timestamp: serverTimestamp(), createdAtLocal: new Date().toISOString() });
      const localLog = { id: logDoc.id, ...log, createdAtLocal: new Date().toISOString() };
      const nextLogs = sortNewestFirst([localLog, ...(dataRef.current.logs || [])]);
      dataRef.current = {
        ...normalizeData(dataRef.current),
        logs: nextLogs,
      };
      setState(prev => ({
        ...prev,
        logs: nextLogs,
        error: null,
      }));
    } catch (err) {
      console.error('Log to cloud failed:', err);
    }
  }, []);

  const repairCloudMirrors = useCallback(async () => {
    setState(prev => ({ ...prev, saving: true, error: null }));
    try {
      const mirrorData = await buildDataFromMirrors();
      const current = normalizeData(dataRef.current);
      const merged = normalizeData({
        ...current,
        trips: dedupTripsByContent(mergeRecordsById(current.trips, mirrorData.trips, 'active')),
        trashedTrips: dedupTripsByContent(mergeRecordsById(current.trashedTrips, mirrorData.trashedTrips, 'archived')),
        drivers: mergeRecordsById(current.drivers, mirrorData.drivers, 'drivers'),
        dispatchers: mergeRecordsById(current.dispatchers, mirrorData.dispatchers, 'dispatchers'),
        vehicles: mergeRecordsById(current.vehicles, mirrorData.vehicles, 'vehicles'),
        logs: sortNewestFirst(mergeRecordsById(current.logs, mirrorData.logs, 'logs')),
        phoneNumbers: {
          ...DEFAULT_DATA.phoneNumbers,
          ...(mirrorData.phoneNumbers || {}),
          ...(current.phoneNumbers || {}),
        },
      });

      // Write trips/trashedTrips to their root collections first (primary source).
      await Promise.all([
        ...(merged.trips || []).map(trip => trip?.id
          ? setDoc(doc(db, TRIPS_COLLECTION, String(trip.id)), sanitizeForFirestore(trip))
          : Promise.resolve()),
        ...(merged.trashedTrips || []).map(trip => trip?.id
          ? setDoc(doc(db, TRASHED_TRIPS_COLLECTION, String(trip.id)), sanitizeForFirestore(trip))
          : Promise.resolve()),
      ]);

      // Write the core document. If it's too large because of trips, strip the
      // trip arrays and only write metadata + other collections.
      try {
        await setDoc(doc(db, DATA_DOC), {
          ...sanitizeForFirestore(merged),
          repairedAt: new Date().toISOString(),
          updatedAt: serverTimestamp(),
          updatedField: 'repair',
          updatedAtLocal: new Date().toISOString(),
        }, { merge: true });
      } catch (docErr) {
        console.warn('DATA_DOC repair failed (likely size limit). Writing metadata-only repair.', docErr);
        const { trips, trashedTrips, ...metadata } = sanitizeForFirestore(merged);
        await setDoc(doc(db, DATA_DOC), {
          ...metadata,
          repairedAt: new Date().toISOString(),
          updatedAt: serverTimestamp(),
          updatedField: 'repair-metadata',
          updatedAtLocal: new Date().toISOString(),
        }, { merge: true });
      }

      await Promise.all([
        mirrorTripsToLedger(merged.trips, merged.trashedTrips),
        mirrorRecordsToCollection(DRIVER_PROFILE_COLLECTION, merged.drivers),
        mirrorRecordsToCollection(DISPATCHER_PROFILE_COLLECTION, merged.dispatchers),
        mirrorRecordsToCollection(VEHICLE_COLLECTION, merged.vehicles),
        mirrorLogsToCollection(merged.logs),
        setDoc(doc(db, PHONE_NUMBERS_DOC), sanitizeForFirestore(merged.phoneNumbers), { merge: true }),
      ]);

      dataRef.current = merged;
      setState(prev => ({
        ...prev,
        ...merged,
        saving: false,
        error: null,
        lastRepairAt: new Date().toISOString(),
        lastSavedAt: new Date().toISOString(),
      }));
      return { ok: true, message: 'Cloud mirrors repaired successfully.' };
    } catch (err) {
      console.error('Cloud mirror repair failed:', err);
      setState(prev => ({
        ...prev,
        saving: false,
        error: err.message || 'Cloud mirror repair failed',
      }));
      return { ok: false, message: err.message || 'Cloud mirror repair failed.' };
    }
  }, []);

  const createCloudBackup = useCallback(async (reason = 'manual') => {
    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    const backupId = reason === 'automatic' ? `daily-${dayKey}` : `manual-${dayKey}-${now.getTime()}`;
    const snapshot = sanitizeForFirestore({
      ...normalizeData(dataRef.current),
      backedUpAt: now.toISOString(),
      reason,
      counts: {
        trips: dataRef.current.trips?.length || 0,
        trashedTrips: dataRef.current.trashedTrips?.length || 0,
        drivers: dataRef.current.drivers?.length || 0,
        dispatchers: dataRef.current.dispatchers?.length || 0,
        vehicles: dataRef.current.vehicles?.length || 0,
        logs: dataRef.current.logs?.length || 0,
      },
    });

    try {
      await setDoc(doc(db, BACKUP_COLLECTION, backupId), {
        ...snapshot,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setState(prev => ({
        ...prev,
        lastBackupAt: now.toISOString(),
      }));
      return { ok: true, id: backupId, message: 'Cloud backup created.' };
    } catch (err) {
      console.error('Cloud backup failed:', err);
      setState(prev => ({ ...prev, error: err.message || 'Cloud backup failed' }));
      return { ok: false, id: backupId, message: err.message || 'Cloud backup failed.' };
    }
  }, []);

  const initializeAppData = useCallback(async () => {
    await runTransaction(db, async (transaction) => {
      const ref = doc(db, DATA_DOC);
      const snap = await transaction.get(ref);
      if (!snap.exists()) {
        transaction.set(ref, sanitizeForFirestore({
          ...DEFAULT_DATA,
          initializedAt: new Date().toISOString(),
        }));
      }
    });
  }, []);

  return {
    trips: state.trips,
    drivers: state.drivers,
    dispatchers: state.dispatchers,
    vehicles: state.vehicles,
    trashedTrips: state.trashedTrips,
    logs: state.logs,
    phoneNumbers: state.phoneNumbers,
    loading: state.loading,
    saving: state.saving,
    error: state.error,
    initialized: state.initialized,
    docExists: state.docExists,
    lastSavedAt: state.lastSavedAt,
    lastFirestoreSync: state.lastFirestoreSync,
    syncHealth: {
      loading: state.loading,
      saving: state.saving,
      error: state.error,
      initialized: state.initialized,
      docExists: state.docExists,
      lastSavedAt: state.lastSavedAt,
      lastLoadedAt: state.lastLoadedAt,
      lastFirestoreSync: state.lastFirestoreSync,
      lastRecoveredAt: state.lastRecoveredAt,
      lastBackupAt: state.lastBackupAt,
      lastRepairAt: state.lastRepairAt,
      listenerStatus: state.listenerStatus,
      pendingWrites: pendingWritesRef.current,
    },
    // Enterprise modules exposed for UI
    enterprise: {
      // Wave 1 (foundation)
      backgroundSync,
      crossTabSync,
      dataLineage,
      adaptiveSync,
      performance: {
        writes: firestoreWriteMetrics,
        sync: syncMetrics,
        indexedDB: indexedDBMetrics,
      },
      // Wave 2 (advanced)
      eventSourcing,
      circuitBreaker: firestoreWriteCircuit,
      predictivePrefetch,
      retryQueue,
      distributedLock,
      // Wave 3 (enterprise-grade)
      sagaExecutor,
      SagaState,
      observability,
      rateLimiter,
      requestDedup,
    },
    setTrips,
    setDrivers,
    upsertDriverProfile,
    setDispatchers,
    upsertDispatcherProfile,
    setVehicles,
    setTrashedTrips,
    setTripsAndTrashed,
    setLogs,
    setPhoneNumbers,
    addLog,
    processSyncQueue,
    initializeAppData,
    repairCloudMirrors,
    createCloudBackup,
  };
}

export default useFirestoreAppData;
