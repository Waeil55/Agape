import { useState, useEffect, useCallback, useRef } from 'react';
import {
  doc,
  setDoc,
  collection,
  addDoc,
  serverTimestamp,
  writeBatch,
  runTransaction,
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
import { ASSIGNMENT_STATUSES } from '../config/firestoreSchema';
import { localCalendarYmd } from '../utils/tripDate';
import {
  filterValidTripRecords,
  isCorruptedTripRecord,
} from '../utils/tripIntegrity';
import { findRemovedDocumentIds } from '../utils/firestorePersistence';
import { attachTenantScope, normalizeTenantId, recordBelongsToTenant } from '../utils/tenantScope';
import { hydrateTripDriverIdentities } from '../utils/driverIdentity';

const TRIPS_COLLECTION = 'trips';
const DRIVER_PROFILE_COLLECTION = 'driverProfiles';
const DISPATCHER_PROFILE_COLLECTION = 'dispatcherProfiles';
const VEHICLE_COLLECTION = 'fleetVehicles';
const PHONE_NUMBERS_DOC = 'systemConfig/phoneNumbers';
const DRIVER_TRIP_PROGRESS_COLLECTION = 'driverTripProgress';
const MIRRORED_TRIP_FIELDS = new Set(['trips', 'trashedTrips']);

function dedupTripsByBookingId(trips = []) {
  const STATUS_PRIORITY = { 'Completed': 10, 'At Pickup': 9, 'In Mission': 9, 'Rerouted': 6, 'Transferred': 6, 'Navigating Pickup': 8, 'En Route': 8, 'Navigating Dropoff': 8, 'In Transit': 8, 'In Progress': 8, 'Assigned': 7, 'No Show': 5, 'Cancelled': 3, 'Unassigned': 1 };
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
      const dbFlag = b.driverId ? 1 : 0;
      if (da !== dbFlag) return dbFlag - da;
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

import {
  clearAssignedVehicle,
  planVehicleAssignment,
  reconcileVehicleOwnership,
  resolveDriverVehicle,
  saveAssignedVehicle,
} from '../utils/vehiclePersistence';

function cleanTripCollection(trips = []) {
  const list = Array.isArray(trips) ? trips : [];
  return dedupTripsByBookingId(filterValidTripRecords(list.map(normalizeTrip)));
}

function normalizeData(data = {}) {
  const rawDrivers = data.drivers || [];
  const explicitDrivers = rawDrivers.map(d => {
    // Firestore is authoritative for live fleet ownership. Local memory is only
    // a historical display fallback and must never resurrect an unassignment.
    const resolvedVehicle = resolveDriverVehicle(d, '', { allowRemembered: false });
    return resolvedVehicle !== d.vehicle ? { ...d, vehicle: resolvedVehicle } : d;
  });
  const normalizedDrivers = reconcileVehicleOwnership(explicitDrivers, data.vehicles || []);

  return {
    ...DEFAULT_DATA,
    ...data,
    trips: hydrateTripDriverIdentities(cleanTripCollection(data.trips || []), normalizedDrivers),
    drivers: normalizedDrivers,
    dispatchers: data.dispatchers || [],
    vehicles: data.vehicles || [],
    trashedTrips: hydrateTripDriverIdentities(cleanTripCollection(data.trashedTrips || []), normalizedDrivers),
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
    .replace(/[\\/#?[\]\s]+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 140);
  return cleaned || `${fallbackPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function writeTripsToCollection(trips = [], tenantId) {
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
        data: {
          ...sanitizeForFirestore(
            attachTenantScope(buildOperationalTripRecord({ ...trip, updatedAtLocal: trip.updatedAtLocal || now }), tenantId)
          ),
          updatedAt: serverTimestamp(),
        },
      };
    });

  if (docs.length === 0) return;

  let writtenCount = 0;
  for (let i = 0; i < docs.length; i += 450) {
    const chunk = docs.slice(i, i + 450);
    try {
      const batch = writeBatch(db);
      chunk.forEach(({ id, data }) => {
        batch.set(doc(db, TRIPS_COLLECTION, id), data, { merge: true });
      });
      await batch.commit();
      writtenCount += chunk.length;
    } catch (batchErr) {
      console.error(`[writeTrips] Batch commit failed for chunk ${i}-${i + chunk.length}:`, batchErr.code, batchErr.message);
      let fallbackSuccess = 0;
      for (const { id, data } of chunk) {
        try {
          await setDoc(doc(db, TRIPS_COLLECTION, id), data, { merge: true });
          fallbackSuccess++;
        } catch (singleErr) {
          console.error(`[writeTrips] Individual setDoc failed for doc ${id}:`, singleErr.code, singleErr.message);
          throw singleErr;
        }
      }
      writtenCount += fallbackSuccess;
    }
  }

  if (writtenCount !== docs.length) {
    console.error(`Trip write mismatch: attempted ${docs.length}, confirmed ${writtenCount}`);
    throw new Error(`Trip write mismatch: expected ${docs.length}, wrote ${writtenCount}`);
  }
}

async function writeDriversToCollection(drivers = [], tenantId) {
  const now = new Date().toISOString();
  const docs = (drivers || [])
    .filter((d) => d?.id)
    .map((d) => ({ id: String(d.id), data: sanitizeForFirestore(attachTenantScope({ ...d, updatedAtLocal: d.updatedAtLocal || now }, tenantId)) }));
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

async function writeAssignmentsToCollection(trips = [], tenantId) {
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
      updatedAtLocal: new Date().toISOString(), tenantId: normalizeTenantId(tenantId),
      tripSnapshot: { patient: trip.patient || trip.clientName || '', time: trip.time || '', pickup: trip.pickup || '', dropoff: trip.dropoff || '', status: trip.status || '' },
    }));
  if (assignments.length === 0) return;
  const result = await createAssignmentsFn({ assignments });
  if (result.data.created !== assignments.length) {
    console.warn(`Assignment write mismatch: sent ${assignments.length}, created ${result.data.created}`);
  }
}

export function useFirestoreAppData({ tenantId, resubscribeKey = 0, enabled = true } = {}) {
  const activeTenantId = normalizeTenantId(tenantId);
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
    if (!enabled) return;
    let cancelled = false;
    const unsubscribers = [];

    const applyCollectionData = (field, snap) => {
      if (cancelled) return;
      const nextList = [];
      snap.forEach((itemDoc) => {
        const data = itemDoc.data();
        if (recordBelongsToTenant(data, activeTenantId)) nextList.push({ ...data, id: itemDoc.id });
      });
      const normalized = normalizeData({ ...dataRef.current, [field]: nextList });
      dataRef.current = normalized;
      setState(prev => ({
        ...prev,
        [field]: normalized[field],
        ...((field === 'drivers' || field === 'vehicles') ? {
          drivers: normalized.drivers,
          trips: normalized.trips,
          trashedTrips: normalized.trashedTrips,
        } : {}),
        loading: false,
        initialized: true,
        error: null,
      }));
    };

    const applyTripsSnapshot = (snap) => {
      if (cancelled) return;
      const liveTrips = [];
      const archivedTrips = [];
      const corruptedIds = [];
      const todayKey = localCalendarYmd();
      snap.forEach((tripDoc) => {
        const trip = { ...tripDoc.data(), id: tripDoc.id };
        if (!recordBelongsToTenant(trip, activeTenantId)) return;
        if (trip.archiveState === 'archived') {
          archivedTrips.push(normalizeTrip(trip));
          return;
        }
        if (trip.source === 'dispatch_upload' || trip.source === 'report_upload') {
          if (trip.date && trip.date !== todayKey) {
            const created = trip.createdAt || trip.updatedAtLocal || '';
            if (String(created).includes(todayKey) && trip.status !== 'Completed') {
              console.warn(`[DATE CHECK] Trip ${trip.id} created today but date="${trip.date}" (expected "${todayKey}"). Check for UTC date shift.`);
            }
          }
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
      const baseData = normalizeData(dataRef.current);
      const trashedIds = new Set((baseData.trashedTrips || []).map(t => t.id));
      liveTripsRef.current = liveTrips.filter((t) => !trashedIds.has(t.id));
      const liveKeys = new Set(liveTripsRef.current.map((t) => t.id));
      const mergedTripsBase = cleanTripCollection([
        ...(baseData.trips || []).filter((t) => !liveKeys.has(t.id) && !trashedIds.has(t.id)),
        ...liveTripsRef.current.map((liveTrip) => {
          const progress = tripProgressRef.current[liveTrip.id];
          if (!progress) return liveTrip;
          const progressTime = Date.parse(progress.workflowUpdatedAt || progress.updatedAt || '');
          const liveTime = Date.parse(liveTrip.workflowUpdatedAt || liveTrip.updatedAt || '');
          if (progressTime > liveTime) return { ...liveTrip, ...progress };
          return { ...progress, ...liveTrip };
        }),
      ]);
      const mergedTrips = mergedTripsBase.filter((t) => !trashedIds.has(t.id));
      dataRef.current = { ...baseData, trips: mergedTrips, trashedTrips: archivedTrips };
      setState(prev => ({ ...prev, trips: mergedTrips, trashedTrips: archivedTrips, loading: false, initialized: true, error: null }));

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
        const data = progressDoc.data();
        if (!recordBelongsToTenant(data, activeTenantId)) return;
        progressByTrip[progressDoc.id] = { ...data, id: progressDoc.id };
        delete progressByTrip[progressDoc.id].tripId;
      });
      tripProgressRef.current = progressByTrip;
      const baseData = normalizeData(dataRef.current);
      const trashedIds = new Set((baseData.trashedTrips || []).map(t => t.id));
      const progressSource = (liveTripsRef.current.length > 0 ? liveTripsRef.current : baseData.trips).filter((t) => !trashedIds.has(t.id));
      const sourceKeys = new Set(progressSource.map((t) => t.id));
      const mergedTripsBase = cleanTripCollection([
        ...(baseData.trips || []).filter((t) => !sourceKeys.has(t.id) && !trashedIds.has(t.id)),
        ...progressSource.map((trip) => {
          const progress = progressByTrip[trip.id];
          if (!progress) return trip;
          const progressTime = Date.parse(progress.workflowUpdatedAt || progress.updatedAt || 0);
          const tripTime = Date.parse(trip.workflowUpdatedAt || trip.updatedAt || 0);
          if (progressTime > tripTime) return { ...trip, ...progress };
          return { ...progress, ...trip };
        }),
      ]);
      const mergedTrips = mergedTripsBase.filter((t) => !trashedIds.has(t.id));
      dataRef.current = { ...baseData, trips: mergedTrips };
      setState(prev => ({ ...prev, trips: mergedTrips, loading: false, error: null, initialized: true }));
    };

    const setupListener = (ref, applyFn, label) => {
      let retryCount = 0;
      let retryTimeout = null;
      const MAX_RETRIES = 3;
      const getDelay = () => Math.min(2000 * Math.pow(2, retryCount - 1), 15000);
      const subscribe = () => {
        const unsub = onSnapshot(ref, applyFn, (err) => {
          if (cancelled || shouldIgnoreRealtimePermissionError(err)) return;
          console.error(`${label} listener error (retry ${retryCount}):`, err);
          if (/INTERNAL ASSERTION FAILED|Unexpected state/.test(err?.message || '')) {
            retryCount++;
            if (retryCount > MAX_RETRIES) {
              console.error(`${label} listener: max retries (${MAX_RETRIES}) reached. Giving up.`);
              setState(prev => ({ ...prev, error: `Firestore ${label} sync failed: ${err.message}`, loading: false }));
              return;
            }
            const delay = getDelay();
            console.warn(`${label} listener crashed — re-subscribing in ${delay}ms (retry ${retryCount}/${MAX_RETRIES})`);
            const idx = unsubscribers.indexOf(unsub);
            if (idx !== -1) unsubscribers.splice(idx, 1);
            clearTimeout(retryTimeout);
            retryTimeout = setTimeout(() => {
              if (!cancelled) {
                try { unsub(); } catch (_) {}
                subscribe();
              }
            }, delay);
          } else {
            setState(prev => ({ ...prev, error: `Firestore ${label} sync failed: ${err.message}`, loading: false }));
          }
        });
        unsubscribers.push(unsub);
        return unsub;
      };
      subscribe();
      return () => clearTimeout(retryTimeout);
    };

    const cleanupFns = [];
    cleanupFns.push(setupListener(collection(db, TRIPS_COLLECTION), applyTripsSnapshot, 'Trips'));
    cleanupFns.push(setupListener(collection(db, DRIVER_PROFILE_COLLECTION), (snap) => applyCollectionData('drivers', snap), 'Drivers'));
    cleanupFns.push(setupListener(collection(db, DISPATCHER_PROFILE_COLLECTION), (snap) => applyCollectionData('dispatchers', snap), 'Dispatchers'));
    cleanupFns.push(setupListener(collection(db, VEHICLE_COLLECTION), (snap) => applyCollectionData('vehicles', snap), 'Vehicles'));
    cleanupFns.push(setupListener(collection(db, DRIVER_TRIP_PROGRESS_COLLECTION), applyTripProgressSnapshot, 'TripProgress'));
    cleanupFns.push(setupListener(collection(db, 'logs'), (snap) => applyCollectionData('logs', snap), 'Activity'));

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

    // Hard timeout: if no onSnapshot has fired within 5 seconds, unblock loading.
    // Data will continue streaming in reactively — this just prevents the UI from
    // being permanently stuck on a loading screen due to slow initial Firestore response.
    const loadingTimeoutId = setTimeout(() => {
      if (!cancelled) {
        setState(prev => prev.loading ? { ...prev, loading: false, initialized: true } : prev);
      }
    }, 5000);

    return () => {
      cancelled = true;
      cleanupFns.forEach((fn) => fn());
      clearTimeout(loadingTimeoutId);
      unsubscribers.forEach((unsub) => unsub());
    };

  }, [activeTenantId, resubscribeKey, enabled]);

  const writeField = useCallback(async (field, value) => {
    const previousData = normalizeData(dataRef.current);
    const preparedValue = MIRRORED_TRIP_FIELDS.has(field)
      ? hydrateTripDriverIdentities(cleanTripCollection(value), dataRef.current.drivers || [])
      : value;
    const sanitized = sanitizeForFirestore(preparedValue);
    dataRef.current = { ...previousData, [field]: sanitized };
    pendingWritesRef.current += 1;
    setState(prev => ({ ...prev, [field]: sanitized, saving: true, error: null }));

    try {
      if (MIRRORED_TRIP_FIELDS.has(field)) {
        const archivedTrips = cleanTripCollection(dataRef.current.trashedTrips || [])
          .filter((trip) => trip?.id || trip?.bookingId)
          .map((trip) => ({
            id: String(trip.id || trip.bookingId || `archived_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
            data: sanitizeForFirestore(attachTenantScope({ ...buildOperationalTripRecord(trip), archiveState: 'archived', archivedAtLocal: trip.archivedAtLocal || new Date().toISOString() }, activeTenantId)),
          }));
        for (let i = 0; i < archivedTrips.length; i += 450) {
          const batch = writeBatch(db);
          archivedTrips.slice(i, i + 450).forEach(({ id, data }) => {
            batch.set(doc(db, TRIPS_COLLECTION, id), data, { merge: true });
          });
          await batch.commit();
        }
        const prevTrips = cleanTripCollection(previousData.trips || []);
        const prevMap = new Map(prevTrips.map(t => [t.id, t]));
        const currentTrips = dataRef.current.trips || [];
        const changedTrips = currentTrips.filter(t => {
          const prev = prevMap.get(t.id);
          if (!prev) return true;
          return JSON.stringify(prev) !== JSON.stringify(t);
        });
        try {
          await writeTripsToCollection(changedTrips, activeTenantId);
        } catch (tripsErr) {
          console.error('[writeField] writeTripsToCollection failed:', tripsErr.code, tripsErr.message, tripsErr.stack);
          throw tripsErr;
        }
        await writeAssignmentsToCollection(dataRef.current.trips || [], activeTenantId).catch((err) => {
          console.warn('[writeField] Assignment write non-fatal error:', err?.code, err?.message);
        });
      } else if (field === 'drivers') {
        await writeDriversToCollection(dataRef.current.drivers || [], activeTenantId);
        const removedIds = findRemovedDocumentIds(previousData.drivers, dataRef.current.drivers);
        await deleteDocsById(DRIVER_PROFILE_COLLECTION, removedIds);
      } else if (field === 'dispatchers') {
        const now = new Date().toISOString();
        const docs = (dataRef.current.dispatchers || []).filter((d) => d?.id).map((d) => ({
          id: String(d.id), data: sanitizeForFirestore(attachTenantScope({ ...d, updatedAtLocal: d.updatedAtLocal || now }, activeTenantId)),
        }));
        for (let i = 0; i < docs.length; i += 450) {
          const batch = writeBatch(db);
          docs.slice(i, i + 450).forEach(({ id, data }) => {
            batch.set(doc(db, DISPATCHER_PROFILE_COLLECTION, id), data, { merge: true });
          });
          await batch.commit();
        }
        const removedIds = findRemovedDocumentIds(previousData.dispatchers, dataRef.current.dispatchers);
        await deleteDocsById(DISPATCHER_PROFILE_COLLECTION, removedIds);
      } else if (field === 'vehicles') {
        const now = new Date().toISOString();
        const docs = (dataRef.current.vehicles || []).filter((v) => v?.id).map((v) => ({
          id: String(v.id), data: sanitizeForFirestore(attachTenantScope({ ...v, updatedAtLocal: v.updatedAtLocal || now }, activeTenantId)),
        }));
        for (let i = 0; i < docs.length; i += 450) {
          const batch = writeBatch(db);
          docs.slice(i, i + 450).forEach(({ id, data }) => {
            batch.set(doc(db, VEHICLE_COLLECTION, id), data, { merge: true });
          });
          await batch.commit();
        }
        const removedIds = findRemovedDocumentIds(previousData.vehicles, dataRef.current.vehicles);
        await deleteDocsById(VEHICLE_COLLECTION, removedIds);
      } else if (field === 'phoneNumbers') {
        await setDoc(doc(db, PHONE_NUMBERS_DOC), attachTenantScope(sanitized, activeTenantId), { merge: true });
      } else if (field === 'logs') {
        const logsDoc = doc(db, 'appData', 'logs');
        await setDoc(logsDoc, { logs: sanitized, tenantId: activeTenantId, updatedAt: serverTimestamp() }, { merge: true });
      }

      const actor = getCurrentEventActor();
      const events = field === 'trips' ? buildTripEvents(previousData.trips || [], sanitized || [], actor) :
        field === 'drivers' ? buildDriverEvents(previousData.drivers || [], sanitized || [], actor) : [];
      if (events.length > 0) emitSystemEvents(events).catch((err) => console.error('Event emit failed:', err));

      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      setState(prev => ({ ...prev, saving: pendingWritesRef.current > 0, lastSavedAt: new Date().toISOString() }));
      return true;
    } catch (err) {
      dataRef.current = { ...dataRef.current, [field]: previousData[field] };
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      console.error(`Failed to save ${field}:`, err);
      setState(prev => ({ ...prev, [field]: previousData[field] || [], saving: pendingWritesRef.current > 0, error: err.message || `Failed to save ${field}` }));
      return false;
    }
  }, [activeTenantId]);

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

  const upsertDriverTrip = useCallback(async (tripId, updates = {}) => {
    if (!tripId) return false;
    const now = new Date().toISOString();
    const progressDoc = attachTenantScope({ ...updates, tripId, workflowUpdatedAt: now }, activeTenantId);
    
    // Update local state optimistic UI
    const currentTrips = dataRef.current.trips || [];
    const nextTrips = currentTrips.map(t => t.id === tripId ? { ...t, ...updates } : t);
    dataRef.current = { ...dataRef.current, trips: nextTrips };
    setState(prev => ({ ...prev, trips: nextTrips }));

    try {
      await setDoc(doc(db, DRIVER_TRIP_PROGRESS_COLLECTION, tripId), progressDoc, { merge: true });
      return true;
    } catch (err) {
      console.error('Failed to upsert driver trip progress:', err);
      return false;
    }
  }, [activeTenantId]);

  const upsertDriverProfile = useCallback(async (driverId, updates = {}) => {
    if (!driverId) return false;
    const currentDrivers = dataRef.current.drivers || [];
    const existing = currentDrivers.find((driver) => driver.id === driverId) || { id: driverId };
    const nextDriver = sanitizeForFirestore(attachTenantScope({ ...existing, ...updates, id: driverId, updatedAtLocal: updates.updatedAtLocal || new Date().toISOString() }, activeTenantId));
    const nextDrivers = currentDrivers.some((driver) => driver.id === driverId)
      ? currentDrivers.map((driver) => (driver.id === driverId ? nextDriver : driver))
      : [...currentDrivers, nextDriver];
    dataRef.current = { ...normalizeData(dataRef.current), drivers: nextDrivers };
    setState(prev => ({ ...prev, drivers: nextDrivers, error: null }));
    try {
      await setDoc(doc(db, DRIVER_PROFILE_COLLECTION, driverId), nextDriver, { merge: true });
      if (Object.prototype.hasOwnProperty.call(updates, 'vehicle')) {
        if (nextDriver.vehicle) {
          saveAssignedVehicle(driverId, nextDriver.vehicle);
          if (nextDriver.email) saveAssignedVehicle(nextDriver.email, nextDriver.vehicle);
        } else {
          clearAssignedVehicle(driverId);
          if (nextDriver.email) clearAssignedVehicle(nextDriver.email);
        }
      }
      emitSystemEvents(buildDriverEvents([existing], [nextDriver], getCurrentEventActor())).catch((err) => console.error('Driver event failed:', err));
      return true;
    } catch (err) {
      console.error('Failed to upsert driver profile:', err);
      dataRef.current = { ...normalizeData(dataRef.current), drivers: currentDrivers };
      setState(prev => ({
        ...prev,
        drivers: currentDrivers,
        error: err.message || 'Driver profile could not be saved',
      }));
      return false;
    }
  }, [activeTenantId]);

  const assignVehicleToDriver = useCallback(async (driverId, vehicleName = '') => {
    if (!driverId) throw new Error('A driver is required for vehicle assignment.');
    const currentDrivers = dataRef.current.drivers || [];
    const currentVehicles = dataRef.current.vehicles || [];
    const planned = planVehicleAssignment(currentDrivers, currentVehicles, driverId, vehicleName);
    const timestamp = new Date().toISOString();
    const nextDrivers = planned.nextDrivers.map((item, index) =>
      item.vehicle !== currentDrivers[index]?.vehicle || item.vehicleId !== currentDrivers[index]?.vehicleId
        ? { ...item, updatedAtLocal: timestamp }
        : item);
    const nextVehicles = planned.nextVehicles;

    dataRef.current = { ...normalizeData(dataRef.current), drivers: nextDrivers, vehicles: nextVehicles };
    setState(prev => ({ ...prev, drivers: nextDrivers, vehicles: nextVehicles, saving: true, error: null }));
    try {
      await runTransaction(db, async (transaction) => {
        const targetRef = doc(db, DRIVER_PROFILE_COLLECTION, driverId);
        const targetSnap = await transaction.get(targetRef);
        const targetData = targetSnap.exists() ? targetSnap.data() : (currentDrivers.find(item => item.id === driverId) || {});
        const selectedVehicle = planned.vehicle;
        const selectedRef = selectedVehicle ? doc(db, VEHICLE_COLLECTION, selectedVehicle.id) : null;
        const selectedSnap = selectedRef ? await transaction.get(selectedRef) : null;
        const selectedData = selectedSnap?.exists() ? selectedSnap.data() : selectedVehicle;
        const priorOccupantId = selectedData?.driverId || selectedData?.assignedDriver || '';
        const staleOccupantIds = new Set(nextDrivers
          .filter((item, index) => item.id !== driverId && currentDrivers[index]?.vehicle && !item.vehicle)
          .map(item => item.id));
        if (priorOccupantId && priorOccupantId !== driverId) staleOccupantIds.add(priorOccupantId);

        const occupantEntries = [];
        for (const occupantId of staleOccupantIds) {
          const occupantRef = doc(db, DRIVER_PROFILE_COLLECTION, occupantId);
          const occupantSnap = await transaction.get(occupantRef);
          occupantEntries.push({ occupantRef, occupantSnap });
        }

        const oldVehicleId = targetData.vehicleId || '';
        const oldVehicleRef = oldVehicleId && oldVehicleId !== selectedVehicle?.id
          ? doc(db, VEHICLE_COLLECTION, oldVehicleId)
          : null;
        const oldVehicleSnap = oldVehicleRef ? await transaction.get(oldVehicleRef) : null;

        occupantEntries.forEach(({ occupantRef, occupantSnap }) => {
          if (occupantSnap.exists()) transaction.set(occupantRef, {
            vehicle: '', vehicleId: '', updatedAtLocal: timestamp,
          }, { merge: true });
        });
        transaction.set(targetRef, sanitizeForFirestore(attachTenantScope({
          ...targetData,
          id: driverId,
          vehicle: selectedVehicle?.name || '',
          vehicleId: selectedVehicle?.id || '',
          updatedAtLocal: timestamp,
        }, activeTenantId)), { merge: true });
        if (selectedRef) transaction.set(selectedRef, sanitizeForFirestore(attachTenantScope({
          ...selectedData,
          id: selectedVehicle.id,
          name: selectedVehicle.name,
          driverId,
          assignedDriver: driverId,
          updatedAtLocal: timestamp,
        }, activeTenantId)), { merge: true });
        if (oldVehicleRef && oldVehicleSnap?.exists()) transaction.set(oldVehicleRef, {
          driverId: '', assignedDriver: '', updatedAtLocal: timestamp,
        }, { merge: true });
      });
      for (const item of nextDrivers) {
        if (item.vehicle) {
          saveAssignedVehicle(item.id, item.vehicle);
          if (item.email) saveAssignedVehicle(item.email, item.vehicle);
        } else {
          clearAssignedVehicle(item.id);
          if (item.email) clearAssignedVehicle(item.email);
        }
      }
      setState(prev => ({ ...prev, saving: false, lastSavedAt: new Date().toISOString() }));
      return true;
    } catch (error) {
      dataRef.current = { ...normalizeData(dataRef.current), drivers: currentDrivers, vehicles: currentVehicles };
      setState(prev => ({
        ...prev,
        drivers: currentDrivers,
        vehicles: currentVehicles,
        saving: false,
        error: error.message || 'Vehicle assignment could not be saved',
      }));
      throw error;
    }
  }, [activeTenantId]);


  const setDispatchers = useCallback((updater) => { const current = dataRef.current.dispatchers || []; return writeField('dispatchers', typeof updater === 'function' ? updater(current) : updater); }, [writeField]);
  const setVehicles = useCallback((updater) => { const current = dataRef.current.vehicles || []; return writeField('vehicles', typeof updater === 'function' ? updater(current) : updater); }, [writeField]);
  const setTrashedTrips = useCallback((updater) => { const current = dataRef.current.trashedTrips || []; return writeField('trashedTrips', typeof updater === 'function' ? updater(current) : updater); }, [writeField]);
  const setLogs = useCallback((updater) => { const current = dataRef.current.logs || []; return writeField('logs', typeof updater === 'function' ? updater(current) : updater); }, [writeField]);
  const setPhoneNumbers = useCallback((updater) => { const current = dataRef.current.phoneNumbers || DEFAULT_DATA.phoneNumbers; return writeField('phoneNumbers', typeof updater === 'function' ? updater(current) : updater); }, [writeField]);

  const addLog = useCallback(async (log) => {
    try { await addDoc(collection(db, 'logs'), { ...log, tenantId: activeTenantId, timestamp: serverTimestamp() }); } catch (err) { console.error('Log failed:', err); }
  }, [activeTenantId]);

  const initializeAppData = useCallback(async () => {
    return true;
  }, []);

  return {
    trips: state.trips, drivers: state.drivers, dispatchers: state.dispatchers, vehicles: state.vehicles,
    trashedTrips: state.trashedTrips, logs: state.logs, phoneNumbers: state.phoneNumbers,
    loading: state.loading, saving: state.saving, error: state.error,
    initialized: state.initialized, docExists: state.docExists, lastSavedAt: state.lastSavedAt,
    setTrips, setDrivers, upsertDriverProfile, assignVehicleToDriver, upsertDriverTrip, setDispatchers, setVehicles, setTrashedTrips, setLogs, setPhoneNumbers, addLog, initializeAppData,
  };
}

export default useFirestoreAppData;
