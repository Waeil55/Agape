import { useState, useEffect, useCallback, useRef } from 'react';
import {
  doc,
  setDoc,
  collection,
  addDoc,
  serverTimestamp,
  writeBatch,
  runTransaction,
  getDocsFromServer,
  getDocFromServer,
  onSnapshot,
} from '../config/firebase';
import { db, auth, firebaseConfig } from '../config/firebase';
import {
  buildDriverEvents,
  buildTripEvents,
  emitSystemEvents,
} from '../services/firestoreEventEngine';
import {
  buildOperationalTripRecord,
  isOperationalTrip,
  mergeTripCollections,
} from '../utils/tripLifecycle';
import {
  filterValidTripRecords,
  isCorruptedTripRecord,
} from '../utils/tripIntegrity';
import {
  todayKey,
  getTripDateKey,
} from '../utils/dateSharding';

const DATA_DOC = 'appData/agape';
const TRIPS_COLLECTION = 'trips';
const TRIP_LEDGER_COLLECTION = 'tripLedger';
const DRIVER_PROFILE_COLLECTION = 'driverProfiles';
const DISPATCHER_PROFILE_COLLECTION = 'dispatcherProfiles';
const VEHICLE_COLLECTION = 'fleetVehicles';
const PHONE_NUMBERS_DOC = 'systemConfig/phoneNumbers';
const DRIVER_TRIP_PROGRESS_COLLECTION = 'driverTripProgress';
const MIRRORED_TRIP_FIELDS = new Set(['trips', 'trashedTrips']);

function dedupTripsByBookingId(trips = []) {
  const STATUS_PRIORITY = { 'Completed': 10, 'At Pickup': 9, 'In Mission': 9, 'Navigating Pickup': 8, 'En Route': 8, 'Navigating Dropoff': 8, 'In Transit': 8, 'In Progress': 8, 'Assigned': 7, 'No Show': 5, 'Cancelled': 3, 'Unassigned': 1 };
  const groups = {};
  (trips || []).forEach(t => {
    if (!t) return;
    const key = String(t.bookingId || t.id);
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  return Object.values(groups).map(copies => {
    if (copies.length === 1) return copies[0];
    copies.sort((a, b) => {
      const pa = STATUS_PRIORITY[a.status] || 0;
      const pb = STATUS_PRIORITY[b.status] || 0;
      if (pa !== pb) return pb - pa;
      const da = a.driverId ? 1 : 0;
      const db = b.driverId ? 1 : 0;
      if (da !== db) return db - da;
      const ta = Date.parse(a.updatedAtLocal || a.updatedAt || a.createdAt || '');
      const tb = Date.parse(b.updatedAtLocal || b.updatedAt || b.createdAt || '');
      return tb - ta;
    });
    return copies[0];
  });
}

const DEFAULT_DATA = {
  trips: [],
  drivers: [],
  dispatchers: [],
  vehicles: [],
  trashedTrips: [],
  logs: [{ t: 'System Initialized', d: 'Agape Care Cloud OS is now online.', c: 'emerald', type: 'system' }],
  phoneNumbers: { dispatcher: '', routing: '' },
};

const FIRESTORE_SDK_IMPORT_TIMEOUT_MS = 10000;
const FIRESTORE_REST_IMPORT_TIMEOUT_MS = 15000;

function sanitizeForFirestore(obj) {
  return JSON.parse(JSON.stringify(obj, (_key, value) => value === undefined ? null : value));
}

function normalizeTrip(trip) {
  if (!trip) return trip;
  const cleanValue = String(trip.bookingId || '').trim();
  if (!cleanValue) return trip;
  if (/^BK-\d+-\d+$/i.test(cleanValue)) return { ...trip, bookingId: null };
  if (/^TRP-\d+$/i.test(cleanValue)) return { ...trip, bookingId: null };
  return trip;
}

function cleanTripCollection(trips = []) {
  const list = Array.isArray(trips) ? trips : [];
  return dedupTripsByBookingId(filterValidTripRecords(list.map(normalizeTrip)));
}

function safeFirestoreDocId(value, fallbackPrefix = 'upload') {
  const cleaned = String(value || '')
    .trim()
    .replace(/[\\/#?\[\]\s]+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 140);
  return cleaned || `${fallbackPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function tripMergeKey(trip = {}) {
  const bookingId = String(trip.bookingId || '').trim();
  if (bookingId && !/^(BK-\d+-\d+|TRP-\d+|TRIP-\d{10,}-\d+)$/i.test(bookingId)) {
    return `bk::${bookingId}`;
  }
  return [
    trip.patient || trip.clientName || '',
    trip.date || trip.scheduleDate || '',
    trip.time || trip.scheduledTime || '',
    trip.pickup || trip.pickupAddress || '',
    trip.dropoff || trip.dropoffAddress || '',
  ]
    .map((value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' '))
    .join('|');
}

function mergeTripLists(existingTrips = [], incomingTrips = []) {
  const merged = [...(existingTrips || [])];
  const byId = new Map();
  const byKey = new Map();

  merged.forEach((trip, index) => {
    if (trip?.id) byId.set(String(trip.id), index);
    byKey.set(tripMergeKey(trip), index);
  });

  (incomingTrips || []).forEach((trip) => {
    if (!trip) return;
    const idMatch = trip.id ? byId.get(String(trip.id)) : undefined;
    const keyMatch = byKey.get(tripMergeKey(trip));
    const index = idMatch ?? keyMatch;

    if (index !== undefined) {
      merged[index] = { ...merged[index], ...trip, id: merged[index].id || trip.id };
      return;
    }

    merged.push(trip);
    const nextIndex = merged.length - 1;
    if (trip.id) byId.set(String(trip.id), nextIndex);
    byKey.set(tripMergeKey(trip), nextIndex);
  });

  return cleanTripCollection(merged);
}

function withTimeout(promise, ms, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function firestoreRestValue(value) {
  if (value === undefined || value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { nullValue: null };
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(firestoreRestValue) } };
  }
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return { timestampValue: value.toDate().toISOString() };
    return { mapValue: { fields: firestoreRestFields(value) } };
  }
  return { stringValue: String(value) };
}

function firestoreRestFields(obj = {}) {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, firestoreRestValue(value)])
  );
}

async function fetchJsonWithTimeout(url, options, timeoutMs, timeoutMessage) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(body?.error?.message || `Firestore import failed with status ${response.status}`);
    }
    return body;
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(timeoutMessage);
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function commitTripChunkViaRest(trips = []) {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in before importing trips.');
  const projectId = firebaseConfig.projectId;
  if (!projectId) throw new Error('Firebase project is not configured.');

  const token = await withTimeout(
    user.getIdToken(),
    8000,
    'Could not confirm your sign-in before saving trips. Please refresh and sign in again.'
  );
  const writes = trips.map((trip) => {
    const fields = firestoreRestFields(trip);
    return {
      update: {
        name: `projects/${projectId}/databases/(default)/documents/${TRIPS_COLLECTION}/${trip.id}`,
        fields,
      },
      updateMask: { fieldPaths: Object.keys(fields) },
    };
  });

  await fetchJsonWithTimeout(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes }),
    },
    FIRESTORE_REST_IMPORT_TIMEOUT_MS,
    'Trip import could not reach Firestore in time. Check the connection and try again.'
  );
}

async function commitTripChunk(trips = []) {
  const batch = writeBatch(db);
  trips.forEach((trip) => {
    batch.set(doc(db, TRIPS_COLLECTION, String(trip.id)), trip, { merge: true });
  });

  try {
    await withTimeout(
      batch.commit(),
      FIRESTORE_SDK_IMPORT_TIMEOUT_MS,
      'Firestore SDK import stalled; retrying through direct Firestore API.'
    );
  } catch (err) {
    console.warn('Firestore SDK import failed or stalled; using REST fallback:', err);
    await commitTripChunkViaRest(trips);
  }
}

function normalizeData(data = {}) {
  return {
    ...DEFAULT_DATA,
    ...data,
    trips: cleanTripCollection(data.trips || []),
    drivers: data.drivers || [],
    dispatchers: data.dispatchers || [],
    vehicles: data.vehicles || [],
    trashedTrips: cleanTripCollection(data.trashedTrips || []),
    logs: data.logs || [],
    phoneNumbers: data.phoneNumbers || DEFAULT_DATA.phoneNumbers,
  };
}

function shouldIgnoreRealtimePermissionError(err) {
  return err?.code === 'permission-denied' && !auth.currentUser;
}

async function deleteDocsById(collectionName, ids = []) {
  const cleanIds = [...new Set((ids || []).filter(Boolean).map(String))];
  for (let i = 0; i < cleanIds.length; i += 450) {
    const batch = writeBatch(db);
    cleanIds.slice(i, i + 450).forEach((id) => {
      batch.delete(doc(db, collectionName, id));
    });
    await batch.commit();
  }
}

function getCurrentEventActor() {
  const user = auth.currentUser;
  return { userId: user?.uid || user?.email || 'system', email: user?.email || '', role: 'system' };
}

async function mirrorTripsToOperationalCollection(trips = []) {
  const sanitizedTrips = cleanTripCollection(trips)
    .filter((trip) => {
      if (!trip?.id) return false;
      if (trip.source === 'dispatch_upload' || trip.source === 'report_upload') return true;
      return isOperationalTrip(trip);
    })
    .map((trip) => {
      const dateKey = getTripDateKey(trip) || todayKey();
      return { id: String(trip.id), data: sanitizeForFirestore({ ...buildOperationalTripRecord(trip), dateKey }) };
    });
  for (let i = 0; i < sanitizedTrips.length; i += 450) {
    const batch = writeBatch(db);
    sanitizedTrips.slice(i, i + 450).forEach(({ id, data }) => {
      batch.set(doc(db, TRIPS_COLLECTION, id), data, { merge: true });
    });
    await batch.commit();
  }
}

const hasAssignedDriver = (trip = {}) => Boolean(trip.driverId || trip.driverEmail);
const isTerminalTrip = (trip = {}) => ['completed', 'cancelled', 'canceled', 'no show', 'no_show'].includes(String(trip.status || trip.lifecycleStatus || '').trim().toLowerCase());
const safeIdPart = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');

async function mirrorTripAssignments(trips = []) {
  const { ASSIGNMENT_STATUSES } = await import('../config/firestoreSchema');
  const assignedTrips = cleanTripCollection(trips)
    .filter((trip) => trip?.id && hasAssignedDriver(trip) && !isTerminalTrip(trip))
    .map((trip) => {
      const id = trip.assignmentId || `trip_${safeIdPart(trip.id)}_${safeIdPart(trip.driverId || trip.driverEmail)}`;
      return {
        id,
        data: sanitizeForFirestore({
          id, tripId: String(trip.id), driverId: trip.driverId || null,
          driverEmail: String(trip.driverEmail || '').trim().toLowerCase() || null,
          driverName: trip.driverName || null, dispatcherId: trip.dispatcherId || null,
          status: trip.assignmentStatus || ASSIGNMENT_STATUSES.OFFERED,
          priority: trip.priority || 'normal', deliveryState: trip.assignmentSeenAt ? 'seen' : 'queued',
          offeredAt: serverTimestamp(), offeredAtLocal: trip.assignedAt || trip.updatedAtLocal || new Date().toISOString(),
          updatedAt: serverTimestamp(), updatedAtLocal: new Date().toISOString(),
          tripSnapshot: { patient: trip.patient || trip.clientName || '', time: trip.time || '', pickup: trip.pickup || '', dropoff: trip.dropoff || '', status: trip.status || '' },
        }),
      };
    });
  for (let i = 0; i < assignedTrips.length; i += 450) {
    const batch = writeBatch(db);
    assignedTrips.slice(i, i + 450).forEach(({ id, data }) => {
      batch.set(doc(db, 'assignments', id), data, { merge: true });
    });
    await batch.commit();
  }
}

async function mirrorTripsToLedger(trips = [], trashedTrips = []) {
  const entries = [
    ...cleanTripCollection(trips).map((trip) => ({ trip, archiveState: 'active' })),
    ...cleanTripCollection(trashedTrips).map((trip) => ({ trip, archiveState: 'archived' })),
  ]
    .filter(({ trip }) => trip?.id)
    .map(({ trip, archiveState }) => {
      const dateKey = getTripDateKey(trip) || todayKey();
      return {
        id: String(trip.id),
        data: sanitizeForFirestore({
          ...buildOperationalTripRecord({ ...trip, dateKey }),
          archiveState,
          dateKey,
          mirroredAtLocal: new Date().toISOString(),
        }),
      };
    });

  for (let i = 0; i < entries.length; i += 450) {
    const batch = writeBatch(db);
    entries.slice(i, i + 450).forEach(({ id, data }) => {
      batch.set(doc(db, TRIP_LEDGER_COLLECTION, id), data, { merge: true });
    });
    await withTimeout(batch.commit(), 8000, 'Trip ledger mirror took too long.');
  }
}

async function buildDataFromTripLedger() {
  const snap = await withTimeout(
    getDocsFromServer(collection(db, TRIP_LEDGER_COLLECTION)),
    8000,
    'Trip ledger recovery took too long.'
  );
  const trips = [];
  const trashedTrips = [];
  snap.forEach((tripDoc) => {
    const trip = { id: tripDoc.id, ...tripDoc.data() };
    if (trip.archiveState === 'archived') trashedTrips.push(trip);
    else trips.push(trip);
  });
  if (trips.length === 0 && trashedTrips.length === 0) return null;
  return { trips: cleanTripCollection(trips), trashedTrips: cleanTripCollection(trashedTrips) };
}

async function markArchivedTripsInOperationalCollection(trashedTrips = []) {
  const archivedTrips = cleanTripCollection(trashedTrips)
    .filter((trip) => trip?.id)
    .map((trip) => {
      const dateKey = getTripDateKey(trip) || todayKey();
      return {
        id: String(trip.id),
        data: sanitizeForFirestore({ ...buildOperationalTripRecord(trip), archiveState: 'archived', archivedAtLocal: trip.archivedAtLocal || new Date().toISOString(), dateKey }),
      };
    });
  for (let i = 0; i < archivedTrips.length; i += 450) {
    const batch = writeBatch(db);
    archivedTrips.slice(i, i + 450).forEach(({ id, data }) => {
      batch.set(doc(db, TRIPS_COLLECTION, id), data, { merge: true });
    });
    await batch.commit();
  }
}

async function mirrorRecordsToCollection(collectionName, records = []) {
  const sanitizedRecords = (records || [])
    .filter((record) => record?.id)
    .map((record) => ({
      id: String(record.id),
      data: sanitizeForFirestore({ ...record, updatedAtLocal: record.updatedAtLocal || new Date().toISOString() }),
    }));
  for (let i = 0; i < sanitizedRecords.length; i += 450) {
    const batch = writeBatch(db);
    sanitizedRecords.slice(i, i + 450).forEach(({ id, data }) => {
      batch.set(doc(db, collectionName, id), data, { merge: true });
    });
    await batch.commit();
  }
}

export function useFirestoreAppData({ enabled = true, resubscribeKey = 0 } = {}) {
  const [state, setState] = useState({
    trips: [], drivers: [], dispatchers: [], vehicles: [], trashedTrips: [], logs: [],
    phoneNumbers: DEFAULT_DATA.phoneNumbers,
    loading: true, saving: false, error: null, initialized: false, docExists: false, lastSavedAt: null,
  });

  const dataRef = useRef(DEFAULT_DATA);
  const tripProgressRef = useRef({});
  const liveTripsRef = useRef([]);
  const pendingWritesRef = useRef(0);

  useEffect(() => {
    if (enabled) return;
    dataRef.current = DEFAULT_DATA;
    tripProgressRef.current = {};
    liveTripsRef.current = [];
    pendingWritesRef.current = 0;
    setState({
      trips: [],
      drivers: [],
      dispatchers: [],
      vehicles: [],
      trashedTrips: [],
      logs: [],
      phoneNumbers: DEFAULT_DATA.phoneNumbers,
      loading: false,
      saving: false,
      error: null,
      initialized: false,
      docExists: false,
      lastSavedAt: null,
    });
  }, [enabled]);

  // Effect 1: Load initial data from appData/agape (legacy boot path)
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let inFlight = null;

    const applyData = (nextData) => {
      if (cancelled) return;
      const mergedTrips = mergeTripCollections(nextData.trips, liveTripsRef.current, tripProgressRef.current);
      const mergedData = { ...nextData, trips: cleanTripCollection(mergedTrips), trashedTrips: cleanTripCollection(nextData.trashedTrips) };
      dataRef.current = mergedData;
      setState(prev => ({ ...prev, trips: mergedData.trips, drivers: mergedData.drivers, dispatchers: mergedData.dispatchers, vehicles: mergedData.vehicles, trashedTrips: mergedData.trashedTrips, logs: mergedData.logs, phoneNumbers: mergedData.phoneNumbers, loading: false, error: null, initialized: true, docExists: true }));
    };

    const refreshAppData = async () => {
      if (inFlight) return inFlight;
      inFlight = (async () => {
        try {
          const snap = await getDocFromServer(doc(db, DATA_DOC));
          if (cancelled) return;
          if (snap.exists()) {
            const snapData = snap.data() || {};
            const currentData = normalizeData(dataRef.current);
            const d = normalizeData({
              ...snapData,
              drivers: (snapData?.drivers?.length || 0) > 0 ? snapData.drivers : currentData.drivers,
              dispatchers: (snapData?.dispatchers?.length || 0) > 0 ? snapData.dispatchers : currentData.dispatchers,
              vehicles: (snapData?.vehicles?.length || 0) > 0 ? snapData.vehicles : currentData.vehicles,
              phoneNumbers: snapData?.phoneNumbers && Object.keys(snapData.phoneNumbers || {}).length > 0 ? snapData.phoneNumbers : currentData.phoneNumbers,
            });
            if ((d.trips || []).length === 0 && (d.trashedTrips || []).length === 0) {
              try {
                const recovered = await buildDataFromTripLedger();
                if (recovered && !cancelled) {
                  applyData(normalizeData({ ...d, ...recovered }));
                  return;
                }
              } catch (recoveryErr) {
                if (recoveryErr?.code !== 'permission-denied') {
                  console.warn('Trip ledger recovery skipped:', recoveryErr);
                }
              }
            }
            applyData(d);
          } else {
            if (!cancelled) setState(prev => ({ ...prev, loading: false, initialized: false, docExists: false }));
          }
        } catch (err) {
          if (!cancelled) {
            console.error('App data refresh failed:', err);
            setState(prev => ({ ...prev, error: err.message || 'App data refresh failed', loading: false }));
          }
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    };

    refreshAppData();
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      refreshAppData();
    }, 12000);
    window.addEventListener('online', refreshAppData);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('online', refreshAppData); };
  }, [enabled, resubscribeKey]);

  // Effect 2: Real-time listeners on mirror collections
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    const applyCollectionData = (field, snap) => {
      if (cancelled) return;
      const currentList = dataRef.current[field] || [];
      if (snap.size === 0 && currentList.length > 0) return;
      const nextList = [];
      snap.forEach((itemDoc) => nextList.push({ id: itemDoc.id, ...itemDoc.data() }));
      dataRef.current = { ...normalizeData(dataRef.current), [field]: nextList };
      setState(prev => ({ ...prev, [field]: nextList, loading: false, error: null }));
    };

    const applyTripsSnapshot = (snap) => {
      if (cancelled) return;
      const liveTrips = [];
      const corruptedIds = [];
      snap.forEach((tripDoc) => {
        const trip = { id: tripDoc.id, ...tripDoc.data() };
        if (trip.source === 'dispatch_upload' || trip.source === 'report_upload') { liveTrips.push(normalizeTrip(trip)); return; }
        if (isCorruptedTripRecord(trip)) { corruptedIds.push(tripDoc.id); return; }
        if (isOperationalTrip(trip)) liveTrips.push(normalizeTrip(trip));
      });
      if (corruptedIds.length > 0) {
        deleteDocsById(TRIPS_COLLECTION, corruptedIds).catch((err) => {
          if (shouldIgnoreRealtimePermissionError(err) || err?.code === 'permission-denied') return;
          console.error('Corrupted trip cleanup failed:', err);
        });
      }
      liveTripsRef.current = liveTrips;
      const baseData = normalizeData(dataRef.current);
      const mergedTrips = cleanTripCollection(mergeTripCollections(baseData.trips, liveTrips, tripProgressRef.current));
      dataRef.current = { ...baseData, trips: mergedTrips };
      setState(prev => ({ ...prev, trips: mergedTrips, loading: false, error: null }));
    };

    const applyTripProgressSnapshot = (snap) => {
      if (cancelled) return;
      const currentProgress = tripProgressRef.current || {};
      if (snap.size === 0 && Object.keys(currentProgress).length > 0) return;
      const progressByTrip = {};
      snap.forEach((progressDoc) => {
        progressByTrip[progressDoc.id] = { id: progressDoc.id, ...progressDoc.data() };
        delete progressByTrip[progressDoc.id].tripId;
      });
      tripProgressRef.current = progressByTrip;
      const baseData = normalizeData(dataRef.current);
      const mergedTrips = cleanTripCollection(mergeTripCollections(baseData.trips, liveTripsRef.current, progressByTrip));
      dataRef.current = { ...baseData, trips: mergedTrips };
      setState(prev => ({ ...prev, trips: mergedTrips, loading: false, error: null }));
    };

    const applyPhonesSnapshot = (snap) => {
      if (cancelled) return;
      const currentNumbers = dataRef.current.phoneNumbers || DEFAULT_DATA.phoneNumbers;
      if (!snap.exists() && currentNumbers !== DEFAULT_DATA.phoneNumbers) return;
      const phoneNumbers = snap.exists() ? { ...DEFAULT_DATA.phoneNumbers, ...snap.data() } : DEFAULT_DATA.phoneNumbers;
      dataRef.current = { ...normalizeData(dataRef.current), phoneNumbers };
      setState(prev => ({ ...prev, phoneNumbers, loading: false, error: null }));
    };

    const setupListener = (ref, applyFn, label) => {
      return onSnapshot(ref, applyFn, (err) => {
        if (cancelled || shouldIgnoreRealtimePermissionError(err)) return;
        console.error(`${label} listener error:`, err);
      });
    };

    const unsubTrips = setupListener(collection(db, TRIPS_COLLECTION), applyTripsSnapshot, 'Trips');
    const unsubDrivers = setupListener(collection(db, DRIVER_PROFILE_COLLECTION), (snap) => applyCollectionData('drivers', snap), 'Drivers');
    const unsubDispatchers = setupListener(collection(db, DISPATCHER_PROFILE_COLLECTION), (snap) => applyCollectionData('dispatchers', snap), 'Dispatchers');
    const unsubVehicles = setupListener(collection(db, VEHICLE_COLLECTION), (snap) => applyCollectionData('vehicles', snap), 'Vehicles');
    const unsubProgress = setupListener(collection(db, DRIVER_TRIP_PROGRESS_COLLECTION), applyTripProgressSnapshot, 'TripProgress');
    const unsubPhones = setupListener(doc(db, PHONE_NUMBERS_DOC), applyPhonesSnapshot, 'Phones');

    return () => {
      cancelled = true;
      unsubTrips();
      unsubDrivers();
      unsubDispatchers();
      unsubVehicles();
      unsubProgress();
      unsubPhones();
    };
  }, [enabled, resubscribeKey]);

  const writeField = useCallback(async (field, value) => {
    const previousData = normalizeData(dataRef.current);
    const preparedValue = MIRRORED_TRIP_FIELDS.has(field) ? cleanTripCollection(value) : value;
    const sanitized = sanitizeForFirestore(preparedValue);
    dataRef.current = { ...previousData, [field]: sanitized };
    pendingWritesRef.current += 1;
    setState(prev => ({ ...prev, [field]: sanitized, saving: true, error: null }));

    try {
      if (MIRRORED_TRIP_FIELDS.has(field)) {
        await mirrorTripsToOperationalCollection(dataRef.current.trips || []);
        await mirrorTripAssignments(dataRef.current.trips || []).catch((err) => {
          if (err?.code === 'permission-denied') { console.warn('Assignment mirror skipped.', err); return; }
          throw err;
        });
        await markArchivedTripsInOperationalCollection(dataRef.current.trashedTrips || []);
        mirrorTripsToLedger(dataRef.current.trips || [], dataRef.current.trashedTrips || []).catch((err) => {
          if (err?.code === 'permission-denied') {
            console.warn('Trip ledger mirror skipped for this user.', err);
            return;
          }
          console.warn('Trip ledger mirror failed:', err);
        });
      } else if (field === 'drivers') {
        await mirrorRecordsToCollection(DRIVER_PROFILE_COLLECTION, dataRef.current.drivers || []);
      } else if (field === 'dispatchers') {
        await mirrorRecordsToCollection(DISPATCHER_PROFILE_COLLECTION, dataRef.current.dispatchers || []);
      } else if (field === 'vehicles') {
        await mirrorRecordsToCollection(VEHICLE_COLLECTION, dataRef.current.vehicles || []);
      } else if (field === 'phoneNumbers') {
        await setDoc(doc(db, PHONE_NUMBERS_DOC), sanitized, { merge: true });
      }

      const actor = getCurrentEventActor();
      const events = field === 'trips' ? buildTripEvents(previousData.trips || [], sanitized || [], actor) : field === 'drivers' ? buildDriverEvents(previousData.drivers || [], sanitized || [], actor) : [];
      if (events.length > 0) emitSystemEvents(events).catch((err) => console.error('Failed to emit system events:', err));

      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      setState(prev => ({ ...prev, saving: pendingWritesRef.current > 0, lastSavedAt: new Date().toISOString() }));
      return true;
    } catch (err) {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      console.error(`Failed to save ${field} to Firestore:`, err);
      setState(prev => ({ ...prev, saving: pendingWritesRef.current > 0, error: err.message || `Failed to save ${field}` }));
      return false;
    }
  }, []);

  const setTrips = useCallback((updater) => {
    const current = dataRef.current.trips || [];
    const next = typeof updater === 'function' ? updater(current) : updater;
    return writeField('trips', next);
  }, [writeField]);

  const importTrips = useCallback(async (tripsToImport = []) => {
    if (!auth.currentUser) {
      setState(prev => ({ ...prev, error: 'You must be signed in before importing trips.' }));
      return false;
    }
    const now = new Date().toISOString();
    const preparedTrips = cleanTripCollection(tripsToImport)
      .map((trip, index) => {
        const originalId = String(trip.id || trip.bookingId || '').trim();
        const id = safeFirestoreDocId(originalId, `upload_${index}`);
        const dateKey = getTripDateKey(trip) || todayKey();
        return sanitizeForFirestore({
          ...buildOperationalTripRecord({
            ...trip,
            id,
            source: trip.source || 'dispatch_upload',
            externalTripId: originalId && originalId !== id ? originalId : trip.externalTripId || null,
            dateKey,
            updatedAtLocal: trip.updatedAtLocal || now,
          }),
          dateKey,
        });
      })
      .filter((trip) => trip?.id);

    if (preparedTrips.length === 0) {
      setState(prev => ({ ...prev, error: 'No valid trips were available to import.' }));
      return false;
    }

    pendingWritesRef.current += 1;
    setState(prev => ({ ...prev, saving: true, error: null }));

    try {
      for (let i = 0; i < preparedTrips.length; i += 450) {
        await commitTripChunk(preparedTrips.slice(i, i + 450));
      }

      mirrorTripAssignments(preparedTrips).catch((err) => {
        if (err?.code === 'permission-denied') {
          console.warn('Assignment mirror skipped for imported trips.', err);
          return;
        }
        console.error('Imported trip assignment mirror failed:', err);
      });
      mirrorTripsToLedger(preparedTrips, []).catch((err) => {
        if (err?.code === 'permission-denied') {
          console.warn('Trip ledger mirror skipped for imported trips.', err);
          return;
        }
        console.warn('Imported trip ledger mirror failed:', err);
      });

      const previousData = normalizeData(dataRef.current);
      const mergedTrips = mergeTripLists(previousData.trips || [], preparedTrips);
      dataRef.current = { ...previousData, trips: mergedTrips };
      setState(prev => ({
        ...prev,
        trips: mergedTrips,
        loading: false,
        initialized: true,
        docExists: true,
        error: null,
        lastSavedAt: now,
      }));

      const events = buildTripEvents(previousData.trips || [], mergedTrips, getCurrentEventActor());
      if (events.length > 0) {
        emitSystemEvents(events).catch((err) => console.error('Failed to emit imported trip events:', err));
      }

      return true;
    } catch (err) {
      console.error('Failed to import trips to Firestore:', err);
      setState(prev => ({ ...prev, error: err.message || 'Failed to import trips' }));
      return false;
    } finally {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      setState(prev => ({ ...prev, saving: pendingWritesRef.current > 0 }));
    }
  }, []);

  const setDrivers = useCallback((updater) => {
    const current = dataRef.current.drivers || [];
    const next = typeof updater === 'function' ? updater(current) : updater;
    return writeField('drivers', next);
  }, [writeField]);

  const upsertDriverProfile = useCallback(async (driverId, updates = {}) => {
    if (!driverId) return false;
    const currentDrivers = dataRef.current.drivers || [];
    const existing = currentDrivers.find((driver) => driver.id === driverId) || { id: driverId };
    const nextDriver = sanitizeForFirestore({ ...existing, ...updates, id: driverId, updatedAtLocal: updates.updatedAtLocal || new Date().toISOString() });
    const nextDrivers = currentDrivers.some((driver) => driver.id === driverId) ? currentDrivers.map((driver) => (driver.id === driverId ? nextDriver : driver)) : [...currentDrivers, nextDriver];
    dataRef.current = { ...normalizeData(dataRef.current), drivers: nextDrivers };
    setState(prev => ({ ...prev, drivers: nextDrivers, error: null }));
    try {
      await setDoc(doc(db, DRIVER_PROFILE_COLLECTION, driverId), nextDriver, { merge: true });
      emitSystemEvents(buildDriverEvents([existing], [nextDriver], getCurrentEventActor())).catch((err) => console.error('Failed to emit driver system event:', err));
      return true;
    } catch (err) {
      console.error('Failed to upsert driver profile:', err);
      setState(prev => ({ ...prev, error: err.message || 'Failed to update driver profile' }));
      return false;
    }
  }, []);

  const setDispatchers = useCallback((updater) => { const current = dataRef.current.dispatchers || []; return writeField('dispatchers', typeof updater === 'function' ? updater(current) : updater); }, [writeField]);
  const setVehicles = useCallback((updater) => { const current = dataRef.current.vehicles || []; return writeField('vehicles', typeof updater === 'function' ? updater(current) : updater); }, [writeField]);
  const setTrashedTrips = useCallback((updater) => { const current = dataRef.current.trashedTrips || []; return writeField('trashedTrips', typeof updater === 'function' ? updater(current) : updater); }, [writeField]);
  const setLogs = useCallback((updater) => { const current = dataRef.current.logs || []; return writeField('logs', typeof updater === 'function' ? updater(current) : updater); }, [writeField]);
  const setPhoneNumbers = useCallback((updater) => { const current = dataRef.current.phoneNumbers || DEFAULT_DATA.phoneNumbers; return writeField('phoneNumbers', typeof updater === 'function' ? updater(current) : updater); }, [writeField]);

  const addLog = useCallback(async (log) => {
    try { await addDoc(collection(db, 'logs'), { ...log, timestamp: serverTimestamp() }); } catch (err) { console.error('Log to cloud failed:', err); }
  }, []);

  const initializeAppData = useCallback(async () => {
    try {
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
      return true;
    } catch (err) {
      if (err?.code === 'permission-denied') {
        console.warn('App data initialization skipped for this user role.', err);
        return false;
      }
      throw err;
    }
  }, []);

  return {
    trips: state.trips, drivers: state.drivers, dispatchers: state.dispatchers, vehicles: state.vehicles,
    trashedTrips: state.trashedTrips, logs: state.logs, phoneNumbers: state.phoneNumbers,
    loading: state.loading, saving: state.saving, error: state.error,
    initialized: state.initialized, docExists: state.docExists, lastSavedAt: state.lastSavedAt,
    setTrips, importTrips, setDrivers, upsertDriverProfile, setDispatchers, setVehicles, setTrashedTrips, setLogs, setPhoneNumbers, addLog, initializeAppData,
  };
}

export default useFirestoreAppData;
