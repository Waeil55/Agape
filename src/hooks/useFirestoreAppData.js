import { useState, useEffect, useCallback, useRef } from 'react';
import {
  doc,
  setDoc,
  collection,
  addDoc,
  serverTimestamp,
  writeBatch,
  getDocs,
  getDoc,
  onSnapshot,
} from '../config/firebase';
import { db, auth, functions, httpsCallable } from '../config/firebase';
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

const TRIPS_COLLECTION = 'trips';
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
  logs: [],
  phoneNumbers: { dispatcher: '', routing: '' },
};

function sanitizeForFirestore(obj) {
  return JSON.parse(JSON.stringify(obj, (_key, value) => {
    if (value === undefined) return null;
    return value;
  }));
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

function cleanTripCollection(trips = []) {
  const list = Array.isArray(trips) ? trips : [];
  return dedupTripsByBookingId(filterValidTripRecords(list.map(normalizeTrip)));
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

function getCurrentEventActor() {
  const user = auth.currentUser;
  return { userId: user?.uid || user?.email || 'system', email: user?.email || '', role: 'system' };
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

async function safeFirestoreDocId(value, fallbackPrefix = 'trip') {
  const cleaned = String(value || '')
    .trim()
    .replace(/[\\/#?\[\]\s]+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 140);
  return cleaned || `${fallbackPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function writeTripsToCollection(trips = []) {
  const now = new Date().toISOString();
  const docs = cleanTripCollection(trips)
    .filter((trip) => trip?.id || trip?.bookingId)
    .map((trip) => {
      let docId = String(trip.id || '');
      const bk = String(trip.bookingId || '').trim();
      if (!docId && bk) docId = bk;
      else if (/^TRIP-\d{13,}-\d+$/i.test(docId) && bk && !/^(BK-\d+-\d+|TRP-\d+)$/i.test(bk)) docId = bk;
      if (!docId) docId = `trip_${now.replace(/[^0-9]/g, '').slice(0, 10)}_${Math.random().toString(36).slice(2, 8)}`;
      return {
        id: docId,
        data: sanitizeForFirestore(buildOperationalTripRecord({ ...trip, updatedAtLocal: trip.updatedAtLocal || now })),
      };
    });

  if (docs.length === 0) return;

  let writtenCount = 0;
  for (let i = 0; i < docs.length; i += 450) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + 450);
    chunk.forEach(({ id, data }) => {
      batch.set(doc(db, TRIPS_COLLECTION, id), data, { merge: true });
    });
    await batch.commit();
    writtenCount += chunk.length;
  }

  if (writtenCount !== docs.length) {
    console.error(`Trip write mismatch: attempted ${docs.length}, confirmed ${writtenCount}`);
    throw new Error(`Trip write mismatch: expected ${docs.length}, wrote ${writtenCount}`);
  }
}

async function writeDriversToCollection(drivers = []) {
  const now = new Date().toISOString();
  const docs = (drivers || [])
    .filter((d) => d?.id)
    .map((d) => ({ id: String(d.id), data: sanitizeForFirestore({ ...d, updatedAtLocal: d.updatedAtLocal || now }) }));
  for (let i = 0; i < docs.length; i += 450) {
    const batch = writeBatch(db);
    docs.slice(i, i + 450).forEach(({ id, data }) => {
      batch.set(doc(db, DRIVER_PROFILE_COLLECTION, id), data, { merge: true });
    });
    await batch.commit();
  }
}

const hasAssignedDriver = (trip = {}) => Boolean(trip.driverId || trip.driverEmail);
const isTerminalTrip = (trip = {}) => ['completed', 'cancelled', 'canceled', 'no show', 'no_show'].includes(String(trip.status || trip.lifecycleStatus || '').trim().toLowerCase());
const safeIdPart = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');

const createAssignmentsFn = httpsCallable(functions, 'createAssignments');

async function writeAssignmentsToCollection(trips = []) {
  const { ASSIGNMENT_STATUSES } = await import('../config/firestoreSchema');
  const assignments = cleanTripCollection(trips)
    .filter((trip) => trip?.id && hasAssignedDriver(trip) && !isTerminalTrip(trip))
    .map((trip) => ({
      id: trip.assignmentId || `trip_${safeIdPart(trip.id)}_${safeIdPart(trip.driverId || trip.driverEmail)}`,
      tripId: String(trip.id), driverId: trip.driverId || null,
      driverEmail: String(trip.driverEmail || '').trim().toLowerCase() || null,
      driverName: trip.driverName || null, dispatcherId: trip.dispatcherId || null,
      status: trip.assignmentStatus || ASSIGNMENT_STATUSES.OFFERED,
      priority: trip.priority || 'normal', deliveryState: trip.assignmentSeenAt ? 'seen' : 'queued',
      offeredAtLocal: trip.assignedAt || trip.updatedAtLocal || new Date().toISOString(),
      updatedAtLocal: new Date().toISOString(),
      tripSnapshot: { patient: trip.patient || trip.clientName || '', time: trip.time || '', pickup: trip.pickup || '', dropoff: trip.dropoff || '', status: trip.status || '' },
    }));
  if (assignments.length === 0) return;
  const result = await createAssignmentsFn({ assignments });
  if (result.data.created !== assignments.length) {
    console.warn(`Assignment write mismatch: sent ${assignments.length}, created ${result.data.created}`);
  }
}

export function useFirestoreAppData({ resubscribeKey = 0 } = {}) {
  const [state, setState] = useState({
    trips: [], drivers: [], dispatchers: [], vehicles: [], trashedTrips: [], logs: [],
    phoneNumbers: DEFAULT_DATA.phoneNumbers,
    loading: true, saving: false, error: null, initialized: false, docExists: false, lastSavedAt: null,
  });

  const dataRef = useRef(DEFAULT_DATA);
  const tripProgressRef = useRef({});
  const liveTripsRef = useRef([]);
  const pendingWritesRef = useRef(0);
  const prevTripCountRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const unsubscribers = [];

    const applyCollectionData = (field, snap) => {
      if (cancelled) return;
      const nextList = [];
      snap.forEach((itemDoc) => nextList.push({ id: itemDoc.id, ...itemDoc.data() }));
      dataRef.current = { ...normalizeData(dataRef.current), [field]: nextList };
      setState(prev => ({ ...prev, [field]: nextList, loading: false, initialized: true, error: null }));
    };

    const applyTripsSnapshot = (snap) => {
      if (cancelled) return;
      const liveTrips = [];
      const corruptedIds = [];
      snap.forEach((tripDoc) => {
        const trip = { id: tripDoc.id, ...tripDoc.data() };
        if (trip.source === 'dispatch_upload' || trip.source === 'report_upload') {
          liveTrips.push(normalizeTrip(trip));
          return;
        }
        if (isCorruptedTripRecord(trip)) {
          corruptedIds.push(tripDoc.id);
          return;
        }
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
      const mergedTrips = cleanTripCollection(
        liveTrips.map((liveTrip) => {
          const progress = tripProgressRef.current[liveTrip.id];
          if (!progress) return liveTrip;
          const progressTime = Date.parse(progress.workflowUpdatedAt || progress.updatedAt || 0);
          const liveTime = Date.parse(liveTrip.workflowUpdatedAt || liveTrip.updatedAt || 0);
          if (progressTime > liveTime) return { ...liveTrip, ...progress };
          return { ...progress, ...liveTrip };
        })
      );
      dataRef.current = { ...baseData, trips: mergedTrips };
      setState(prev => ({ ...prev, trips: mergedTrips, loading: false, initialized: true, error: null }));

      const prevCount = prevTripCountRef.current;
      const currentCount = mergedTrips.length;
      if (prevCount > 10 && currentCount < prevCount * 0.5) {
        console.warn(`Trip count dropped from ${prevCount} to ${currentCount} — potential data loss. Verify Firestore.`);
      }
      prevTripCountRef.current = currentCount;
    };

    const applyTripProgressSnapshot = (snap) => {
      if (cancelled) return;
      const progressByTrip = {};
      snap.forEach((progressDoc) => {
        progressByTrip[progressDoc.id] = { id: progressDoc.id, ...progressDoc.data() };
        delete progressByTrip[progressDoc.id].tripId;
      });
      tripProgressRef.current = progressByTrip;
      const baseData = normalizeData(dataRef.current);
      const mergedTrips = cleanTripCollection(
        (liveTripsRef.current.length > 0 ? liveTripsRef.current : baseData.trips).map((trip) => {
          const progress = progressByTrip[trip.id];
          if (!progress) return trip;
          const progressTime = Date.parse(progress.workflowUpdatedAt || progress.updatedAt || 0);
          const tripTime = Date.parse(trip.workflowUpdatedAt || trip.updatedAt || 0);
          if (progressTime > tripTime) return { ...trip, ...progress };
          return { ...progress, ...trip };
        })
      );
      dataRef.current = { ...baseData, trips: mergedTrips };
      setState(prev => ({ ...prev, trips: mergedTrips, loading: false, error: null }));
    };

    const setupListener = (ref, applyFn, label) => {
      let retryTimeout = null;
      const subscribe = () => {
        const unsub = onSnapshot(ref, applyFn, (err) => {
          if (cancelled || shouldIgnoreRealtimePermissionError(err)) return;
          console.error(`${label} listener error:`, err);
          setState(prev => ({ ...prev, error: `Firestore ${label} sync failed: ${err.message}` }));
          if (/INTERNAL ASSERTION FAILED|Unexpected state/.test(err?.message || '')) {
            console.warn(`${label} listener crashed — re-subscribing in 2s`);
            clearTimeout(retryTimeout);
            retryTimeout = setTimeout(() => {
              if (!cancelled) { unsub(); subscribe(); }
            }, 2000);
          }
        });
        return unsub;
      };
      const unsub = subscribe();
      unsubscribers.push(unsub);
    };

    setupListener(collection(db, TRIPS_COLLECTION), applyTripsSnapshot, 'Trips');
    setupListener(collection(db, DRIVER_PROFILE_COLLECTION), (snap) => applyCollectionData('drivers', snap), 'Drivers');
    setupListener(collection(db, DISPATCHER_PROFILE_COLLECTION), (snap) => applyCollectionData('dispatchers', snap), 'Dispatchers');
    setupListener(collection(db, VEHICLE_COLLECTION), (snap) => applyCollectionData('vehicles', snap), 'Vehicles');
    setupListener(collection(db, DRIVER_TRIP_PROGRESS_COLLECTION), applyTripProgressSnapshot, 'TripProgress');

    const unsubPhones = onSnapshot(doc(db, PHONE_NUMBERS_DOC), (snap) => {
      if (cancelled) return;
      const phoneNumbers = snap.exists() ? { ...DEFAULT_DATA.phoneNumbers, ...snap.data() } : DEFAULT_DATA.phoneNumbers;
      dataRef.current = { ...normalizeData(dataRef.current), phoneNumbers };
      setState(prev => ({ ...prev, phoneNumbers, loading: false, error: null }));
    }, (err) => {
      if (cancelled || shouldIgnoreRealtimePermissionError(err)) return;
      console.error('Phones listener error:', err);
    });
    unsubscribers.push(unsubPhones);

    return () => {
      cancelled = true;
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [resubscribeKey]);

  const writeField = useCallback(async (field, value) => {
    const previousData = normalizeData(dataRef.current);
    const preparedValue = MIRRORED_TRIP_FIELDS.has(field) ? cleanTripCollection(value) : value;
    const sanitized = sanitizeForFirestore(preparedValue);
    dataRef.current = { ...previousData, [field]: sanitized };
    pendingWritesRef.current += 1;
    setState(prev => ({ ...prev, [field]: sanitized, saving: true, error: null }));

    try {
      if (MIRRORED_TRIP_FIELDS.has(field)) {
        await writeTripsToCollection(dataRef.current.trips || []);
        await writeAssignmentsToCollection(dataRef.current.trips || []).catch((err) => {
          if (err?.code === 'permission-denied') { console.warn('Assignment write skipped:', err); return; }
          throw err;
        });
        const archivedTrips = cleanTripCollection(dataRef.current.trashedTrips || [])
          .filter((trip) => trip?.id || trip?.bookingId)
          .map((trip) => ({
            id: String(trip.id || trip.bookingId || `archived_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
            data: sanitizeForFirestore({ ...buildOperationalTripRecord(trip), archiveState: 'archived', archivedAtLocal: trip.archivedAtLocal || new Date().toISOString() }),
          }));
        for (let i = 0; i < archivedTrips.length; i += 450) {
          const batch = writeBatch(db);
          archivedTrips.slice(i, i + 450).forEach(({ id, data }) => {
            batch.set(doc(db, TRIPS_COLLECTION, id), data, { merge: true });
          });
          await batch.commit();
        }
      } else if (field === 'drivers') {
        await writeDriversToCollection(dataRef.current.drivers || []);
      } else if (field === 'dispatchers') {
        const now = new Date().toISOString();
        const docs = (dataRef.current.dispatchers || []).filter((d) => d?.id).map((d) => ({
          id: String(d.id), data: sanitizeForFirestore({ ...d, updatedAtLocal: d.updatedAtLocal || now }),
        }));
        for (let i = 0; i < docs.length; i += 450) {
          const batch = writeBatch(db);
          docs.slice(i, i + 450).forEach(({ id, data }) => {
            batch.set(doc(db, DISPATCHER_PROFILE_COLLECTION, id), data, { merge: true });
          });
          await batch.commit();
        }
      } else if (field === 'vehicles') {
        const now = new Date().toISOString();
        const docs = (dataRef.current.vehicles || []).filter((v) => v?.id).map((v) => ({
          id: String(v.id), data: sanitizeForFirestore({ ...v, updatedAtLocal: v.updatedAtLocal || now }),
        }));
        for (let i = 0; i < docs.length; i += 450) {
          const batch = writeBatch(db);
          docs.slice(i, i + 450).forEach(({ id, data }) => {
            batch.set(doc(db, VEHICLE_COLLECTION, id), data, { merge: true });
          });
          await batch.commit();
        }
      } else if (field === 'phoneNumbers') {
        await setDoc(doc(db, PHONE_NUMBERS_DOC), sanitized, { merge: true });
      }

      const actor = getCurrentEventActor();
      const events = field === 'trips' ? buildTripEvents(previousData.trips || [], sanitized || [], actor) :
        field === 'drivers' ? buildDriverEvents(previousData.drivers || [], sanitized || [], actor) : [];
      if (events.length > 0) emitSystemEvents(events).catch((err) => console.error('Event emit failed:', err));

      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      setState(prev => ({ ...prev, saving: pendingWritesRef.current > 0, lastSavedAt: new Date().toISOString() }));
      return true;
    } catch (err) {
      dataRef.current = previousData;
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      console.error(`Failed to save ${field}:`, err);
      setState(prev => ({ ...prev, [field]: previousData[field] || [], saving: pendingWritesRef.current > 0, error: err.message || `Failed to save ${field}` }));
      return false;
    }
  }, []);

  const setTrips = useCallback((updater) => {
    const current = dataRef.current.trips || [];
    const next = typeof updater === 'function' ? updater(current) : updater;
    return writeField('trips', next);
  }, [writeField]);

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
    const nextDrivers = currentDrivers.some((driver) => driver.id === driverId)
      ? currentDrivers.map((driver) => (driver.id === driverId ? nextDriver : driver))
      : [...currentDrivers, nextDriver];
    dataRef.current = { ...normalizeData(dataRef.current), drivers: nextDrivers };
    setState(prev => ({ ...prev, drivers: nextDrivers, error: null }));
    try {
      await setDoc(doc(db, DRIVER_PROFILE_COLLECTION, driverId), nextDriver, { merge: true });
      emitSystemEvents(buildDriverEvents([existing], [nextDriver], getCurrentEventActor())).catch((err) => console.error('Driver event failed:', err));
      return true;
    } catch (err) {
      console.error('Failed to upsert driver profile:', err);
      return false;
    }
  }, []);

  const setDispatchers = useCallback((updater) => { const current = dataRef.current.dispatchers || []; return writeField('dispatchers', typeof updater === 'function' ? updater(current) : updater); }, [writeField]);
  const setVehicles = useCallback((updater) => { const current = dataRef.current.vehicles || []; return writeField('vehicles', typeof updater === 'function' ? updater(current) : updater); }, [writeField]);
  const setTrashedTrips = useCallback((updater) => { const current = dataRef.current.trashedTrips || []; return writeField('trashedTrips', typeof updater === 'function' ? updater(current) : updater); }, [writeField]);
  const setLogs = useCallback((updater) => { const current = dataRef.current.logs || []; return writeField('logs', typeof updater === 'function' ? updater(current) : updater); }, [writeField]);
  const setPhoneNumbers = useCallback((updater) => { const current = dataRef.current.phoneNumbers || DEFAULT_DATA.phoneNumbers; return writeField('phoneNumbers', typeof updater === 'function' ? updater(current) : updater); }, [writeField]);

  const addLog = useCallback(async (log) => {
    try { await addDoc(collection(db, 'logs'), { ...log, timestamp: serverTimestamp() }); } catch (err) { console.error('Log failed:', err); }
  }, []);

  const initializeAppData = useCallback(async () => {
    console.log('[AppData] Initialized — onSnapshot listeners already active');
    return true;
  }, []);

  return {
    trips: state.trips, drivers: state.drivers, dispatchers: state.dispatchers, vehicles: state.vehicles,
    trashedTrips: state.trashedTrips, logs: state.logs, phoneNumbers: state.phoneNumbers,
    loading: state.loading, saving: state.saving, error: state.error,
    initialized: state.initialized, docExists: state.docExists, lastSavedAt: state.lastSavedAt,
    setTrips, setDrivers, upsertDriverProfile, setDispatchers, setVehicles, setTrashedTrips, setLogs, setPhoneNumbers, addLog, initializeAppData,
  };
}

export default useFirestoreAppData;