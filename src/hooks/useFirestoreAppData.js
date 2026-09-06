import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, setDoc, collection, serverTimestamp, writeBatch, runTransaction, onSnapshot, query, orderBy, limit } from '../config/firebase';
import { db, auth, functions, httpsCallable } from '../config/firebase';
import {
  buildDriverEvents,
  buildTripEvents,
  emitSystemEvents,
} from '../services/firestoreEventEngine';
import { buildOperationalTripRecord, isOperationalTrip } from '../utils/tripLifecycle';
import { localCalendarYmd, tripCalendarDateKey } from '../utils/tripDate';
import {
  filterValidTripRecords,
  isCorruptedTripRecord,
} from '../utils/tripIntegrity';
import {
  applyFirestoreDocumentChanges,
  firestoreRecordFingerprint,
  planCollectionMutations,
  rollbackOptimisticValue,
} from '../utils/firestorePersistence';
import { attachTenantScope, normalizeTenantId, recordBelongsToTenant } from '../utils/tenantScope';
import { hydrateTripDriverIdentities } from '../utils/driverIdentity';
import { readAppData, saveField as saveLocalField, saveFieldWithSyncOperations } from '../utils/localDB';
import { createSerializedOperationQueue } from '../utils/serializedOperationQueue';
import { buildAssignmentMutations } from '../utils/assignmentPersistence';
import { isPermanentSyncFailure } from '../services/syncQueueProcessor';
import { sanitizeFirestorePayload } from '../utils/firestorePayload';
import { buildTripWorkflowPersistenceRecords } from '../utils/tripWorkflowPersistence';

const TRIPS_COLLECTION = 'trips';
const DRIVER_PROFILE_COLLECTION = 'driverProfiles';
const DISPATCHER_PROFILE_COLLECTION = 'dispatcherProfiles';
const VEHICLE_COLLECTION = 'fleetVehicles';
const PHONE_NUMBERS_DOC = 'systemConfig/phoneNumbers';
const DRIVER_TRIP_PROGRESS_COLLECTION = 'driverTripProgress';
const TRIP_LEDGER_COLLECTION = 'tripLedger';
const MIRRORED_TRIP_FIELDS = new Set(['trips', 'trashedTrips']);

const yieldBeforePersistenceWork = () => {
  if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
};

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

const sanitizeForFirestore = sanitizeFirestorePayload;

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

function driverIdentityFingerprint(drivers = []) {
  return (drivers || [])
    .map((driver) => [driver.id, driver.uid, driver.email, driver.name, driver.vehicle, driver.vehicleId]
      .map((value) => String(value || '').trim().toLowerCase()).join('|'))
    .sort()
    .join('::');
}



function shouldIgnoreRealtimePermissionError(err) {
  return err?.code === 'permission-denied' && !auth.currentUser;
}

function getCurrentEventActor() {
  const user = auth.currentUser;
  return { userId: user?.uid || user?.email || 'system', email: user?.email || '', role: 'system' };
}

async function writeDocumentMutations(collectionName, upserts = [], removedIds = [], mapData = (item) => item) {
  const mutations = [
    ...(upserts || []).filter((item) => item?.id).map((item) => ({ type: 'set', id: String(item.id), data: mapData(item) })),
    ...(removedIds || []).filter(Boolean).map((id) => ({ type: 'delete', id: String(id) })),
  ];
  for (let i = 0; i < mutations.length; i += 450) {
    const batch = writeBatch(db);
    mutations.slice(i, i + 450).forEach((mutation) => {
      const ref = doc(db, collectionName, mutation.id);
      if (mutation.type === 'delete') batch.delete(ref);
      else batch.set(ref, mutation.data, { merge: true });
    });
    await batch.commit();
  }
  return mutations.length;
}



async function writeTripsToCollection(trips = [], tenantId, { strictAtomic = false } = {}) {
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

  if (docs.length === 0) return 0;
  if (strictAtomic && docs.length > 450) {
    throw new Error('Atomic trip import is limited to 450 records per confirmed operation. Split the file and retry.');
  }

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
      if (strictAtomic) throw batchErr;
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
  return writtenCount;
}

const createAssignmentsFn = httpsCallable(functions, 'createAssignments');

async function writeAssignmentsToCollection(trips = [], tenantId, previousTrips = []) {
  const assignments = buildAssignmentMutations(
    cleanTripCollection(trips),
    cleanTripCollection(previousTrips),
    tenantId,
  );
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
  const pendingTripImportsRef = useRef(new Set());
  const enqueueTripPersistenceRef = useRef(null);
  if (!enqueueTripPersistenceRef.current) enqueueTripPersistenceRef.current = createSerializedOperationQueue();
  const enqueueTripPersistence = enqueueTripPersistenceRef.current;
  const fieldPersistenceQueuesRef = useRef(new Map());
  const enqueueFieldPersistence = useCallback((field, operation) => {
    if (field === 'trips' || field === 'trashedTrips') return enqueueTripPersistence(operation);
    if (!fieldPersistenceQueuesRef.current.has(field)) {
      fieldPersistenceQueuesRef.current.set(field, createSerializedOperationQueue());
    }
    return fieldPersistenceQueuesRef.current.get(field)(operation);
  }, [enqueueTripPersistence]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let remoteSnapshotReceived = false;
    let localSaveTimer = null;
    let localSaveIdleCallback = null;
    const pendingLocalFields = new Map();
    const unsubscribers = [];
    const collectionRecords = new Map();
    let remoteTripRecords = [];
    let remoteProgressRecords = [];
    let tripsSnapshotInitialized = false;

    const persistLocalSnapshot = (field, value, previousValue) => {
      const pending = pendingLocalFields.get(field);
      pendingLocalFields.set(field, {
        value,
        previousValue: pending ? pending.previousValue : previousValue,
      });
      clearTimeout(localSaveTimer);
      if (localSaveIdleCallback !== null && window.cancelIdleCallback) {
        window.cancelIdleCallback(localSaveIdleCallback);
      }
      if (window.requestIdleCallback) {
        localSaveIdleCallback = window.requestIdleCallback(() => void flushLocalFields(), { timeout: 800 });
      } else {
        localSaveTimer = setTimeout(() => void flushLocalFields(), 150);
      }
    };

    const saveField = (field, value, { previousValue } = {}) => (
      saveLocalField(field, value, { previousValue, tenantId: activeTenantId })
    );

    const flushLocalFields = async () => {
      localSaveTimer = null;
      localSaveIdleCallback = null;
      const fields = [...pendingLocalFields.entries()];
      pendingLocalFields.clear();
      for (const [field, { value, previousValue }] of fields) {
        if (cancelled) return;
        try {
          await saveField(field, value, { previousValue });
        } catch (error) {
          console.error(`Offline ${field} snapshot could not be saved:`, error);
        }
      }
    };

    // Render the last authoritative snapshot immediately, including after an
    // offline reload. Realtime listeners replace it when Firebase is reachable.
    readAppData(activeTenantId).then((cached) => {
      if (cancelled || remoteSnapshotReceived || !cached) return;
      const normalized = normalizeData(cached);
      dataRef.current = normalized;
      liveTripsRef.current = normalized.trips || [];
      setState(prev => ({
        ...prev,
        ...normalized,
        loading: false,
        initialized: true,
        error: null,
        lastSavedAt: cached._lastLocalWrite || cached._lastSyncedAt || null,
      }));
    }).catch((error) => console.warn('Offline snapshot could not be restored:', error));

    const applyCollectionData = (field, snap) => {
      if (cancelled) return;
      remoteSnapshotReceived = true;
      const nextList = applyFirestoreDocumentChanges(
        collectionRecords.get(field) || [],
        snap.docChanges({ includeMetadataChanges: false }),
        (itemDoc) => {
          const data = itemDoc.data();
          return recordBelongsToTenant(data, activeTenantId) ? { ...data, id: itemDoc.id } : null;
        },
      );
      collectionRecords.set(field, nextList);
      const previousValue = dataRef.current[field];
      const isFleetField = field === 'drivers' || field === 'vehicles';
      const driverIdentityChanged = isFleetField && (
        field === 'vehicles'
        || driverIdentityFingerprint(previousValue) !== driverIdentityFingerprint(nextList)
      );
      const normalized = isFleetField && !driverIdentityChanged
        ? { ...dataRef.current, [field]: nextList }
        : normalizeData({ ...dataRef.current, [field]: nextList });
      dataRef.current = normalized;
      setState(prev => ({
        ...prev,
        [field]: normalized[field],
        ...(driverIdentityChanged ? {
          drivers: normalized.drivers,
          trips: normalized.trips,
          trashedTrips: normalized.trashedTrips,
        } : {}),
        loading: false,
        initialized: true,
        error: null,
      }));
      persistLocalSnapshot(
        field,
        normalized[field],
        previousValue,
      );
    };

    const applyTripsSnapshot = (snap) => {
      if (cancelled) return;
      const materialChanges = snap.docChanges({ includeMetadataChanges: false });
      const isInitialSnapshot = !tripsSnapshotInitialized;
      tripsSnapshotInitialized = true;
      if (!isInitialSnapshot && materialChanges.length === 0 && pendingTripImportsRef.current.size === 0) return;
      remoteSnapshotReceived = true;
      materialChanges.forEach((change) => pendingTripImportsRef.current.delete(change.doc.id));
      remoteTripRecords = applyFirestoreDocumentChanges(
        remoteTripRecords,
        materialChanges,
        (tripDoc) => {
          const trip = { ...tripDoc.data(), id: tripDoc.id };
          return recordBelongsToTenant(trip, activeTenantId) ? trip : null;
        },
      );
      const liveTrips = [];
      const archivedTrips = [];
      const corruptedIds = [];
      const todayKey = localCalendarYmd();
      remoteTripRecords.forEach((trip) => {
        if (trip.archiveState === 'archived') {
          archivedTrips.push(normalizeTrip(trip));
          return;
        }
        if (trip.source === 'dispatch_upload' || trip.source === 'report_upload') {
          if (trip.date && tripCalendarDateKey(trip.date) !== todayKey) {
            const created = trip.createdAt || trip.updatedAtLocal || '';
            if (String(created).includes(todayKey) && trip.status !== 'Completed') {
              console.warn(`[DATE CHECK] Trip ${trip.id} created today but date="${trip.date}" (expected "${todayKey}"). Check for UTC date shift.`);
            }
          }
          liveTrips.push(normalizeTrip(trip));
          return;
        }
        if (isCorruptedTripRecord(trip)) {
          corruptedIds.push(trip.id);
          return;
        }
        if (isOperationalTrip(trip)) liveTrips.push(normalizeTrip(trip));
      });
      if (corruptedIds.length > 0) {
        console.error('Blocked corrupted trip records; no records were deleted automatically:', corruptedIds);
      }
      const baseData = normalizeData(dataRef.current);
      const previousTrips = baseData.trips;
      const previousTrashedTrips = baseData.trashedTrips;
      // The current Firestore snapshot is authoritative for archive state.
      // Using the previous local archive list here suppresses a just-restored
      // trip until some unrelated later snapshot happens to arrive.
      const trashedIds = new Set(archivedTrips.map(t => t.id));
      liveTripsRef.current = liveTrips.filter((t) => !trashedIds.has(t.id));
      const mergedTripsBase = cleanTripCollection([
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
      persistLocalSnapshot('trips', mergedTrips, previousTrips);
      persistLocalSnapshot('trashedTrips', archivedTrips, previousTrashedTrips);

    };

    const applyTripProgressSnapshot = (snap) => {
      if (cancelled) return;
      remoteSnapshotReceived = true;
      remoteProgressRecords = applyFirestoreDocumentChanges(
        remoteProgressRecords,
        snap.docChanges({ includeMetadataChanges: false }),
        (progressDoc) => {
          const data = progressDoc.data();
          return recordBelongsToTenant(data, activeTenantId) ? { ...data, id: progressDoc.id } : null;
        },
      );
      const progressByTrip = {};
      remoteProgressRecords.forEach((progress) => {
        progressByTrip[progress.id] = { ...progress };
        delete progressByTrip[progress.id].tripId;
      });
      tripProgressRef.current = progressByTrip;
      const baseData = normalizeData(dataRef.current);
      const previousTrips = baseData.trips;
      const trashedIds = new Set((baseData.trashedTrips || []).map(t => t.id));
      const progressSource = (tripsSnapshotInitialized ? liveTripsRef.current : baseData.trips).filter((t) => !trashedIds.has(t.id));
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
      persistLocalSnapshot('trips', mergedTrips, previousTrips);
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
          const cacheCorruption = /Target ID already exists|delete range from database without an in-progress transaction/i.test(err?.message || '');
          if (cacheCorruption) {
            setState(prev => ({
              ...prev,
              error: 'The local Firestore cache became invalid. Close and reopen Agape Care to reconnect with a clean live cache.',
              loading: false,
            }));
            return;
          }
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
    cleanupFns.push(setupListener(
      query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(250)),
      (snap) => applyCollectionData('logs', snap),
      'Activity',
    ));

    const unsubPhones = onSnapshot(doc(db, PHONE_NUMBERS_DOC), (snap) => {
      if (cancelled) return;
      remoteSnapshotReceived = true;
      const phoneNumbers = snap.exists() ? { ...DEFAULT_DATA.phoneNumbers, ...snap.data() } : DEFAULT_DATA.phoneNumbers;
      const previousPhoneNumbers = dataRef.current.phoneNumbers;
      dataRef.current = { ...normalizeData(dataRef.current), phoneNumbers };
      setState(prev => ({ ...prev, phoneNumbers, loading: false, error: null }));
      persistLocalSnapshot('phoneNumbers', phoneNumbers, previousPhoneNumbers);
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
      clearTimeout(localSaveTimer);
      if (localSaveIdleCallback !== null && window.cancelIdleCallback) window.cancelIdleCallback(localSaveIdleCallback);
      unsubscribers.forEach((unsub) => unsub());
    };

  }, [activeTenantId, resubscribeKey, enabled]);

  const writeField = useCallback(async (field, value) => {
    const previousData = dataRef.current;
    const previousValue = previousData[field];
    if (previousValue === value) return true;

    dataRef.current = { ...previousData, [field]: value };
    pendingWritesRef.current += 1;
    setState(prev => ({ ...prev, [field]: value, saving: true, error: null }));
    await yieldBeforePersistenceWork();

    const preparedValue = MIRRORED_TRIP_FIELDS.has(field)
      ? hydrateTripDriverIdentities(cleanTripCollection(value), previousData.drivers || [])
      : value;
    const sanitized = Array.isArray(preparedValue)
      ? preparedValue.map((item) => sanitizeForFirestore(item))
      : sanitizeForFirestore(preparedValue);
    if (firestoreRecordFingerprint(previousValue) === firestoreRecordFingerprint(sanitized)) {
      dataRef.current = { ...dataRef.current, [field]: sanitized };
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      setState(prev => ({ ...prev, [field]: sanitized, saving: pendingWritesRef.current > 0 }));
      return true;
    }

    const allowDeletes = field === 'drivers' || field === 'dispatchers' || field === 'vehicles';
    const mutationPlan = Array.isArray(sanitized)
      ? planCollectionMutations(previousValue || [], sanitized, { allowDeletes })
      : { upserts: [], removedIds: [], changed: true };
    const now = new Date().toISOString();
    const previousById = new Map((previousValue || []).filter((item) => item?.id).map((item) => [String(item.id), item]));
    const priorChangedRecords = mutationPlan.upserts.map((item) => previousById.get(String(item.id))).filter(Boolean);
    const assignmentMutations = field === 'trips'
      ? buildAssignmentMutations(mutationPlan.upserts, priorChangedRecords, activeTenantId)
      : [];
    const vehiclePayload = (vehicle) => {
      const payload = { ...vehicle, updatedAtLocal: vehicle.updatedAtLocal || now };
      if (previousById.has(String(vehicle.id))) {
        ['odometer', 'odometerUpdatedAt', 'odometerSourceTripId'].forEach((key) => { delete payload[key]; });
      } else {
        payload.odometer = Math.max(0, Number(vehicle.odometer || 0));
        payload.odometerUpdatedAt = payload.odometerUpdatedAt || now;
      }
      return sanitizeForFirestore(attachTenantScope(payload, activeTenantId));
    };
    const scopedPayload = (item) => sanitizeForFirestore(attachTenantScope({
      ...item,
      updatedAtLocal: item.updatedAtLocal || now,
    }, activeTenantId));
    const archivedPayload = (item) => sanitizeForFirestore(attachTenantScope({
      ...buildOperationalTripRecord(item),
      archiveState: 'archived',
      archivedAtLocal: item.archivedAtLocal || now,
    }, activeTenantId));
    const offlineOperations = [];
    const targetByField = {
      trips: TRIPS_COLLECTION,
      trashedTrips: TRIPS_COLLECTION,
      drivers: DRIVER_PROFILE_COLLECTION,
      dispatchers: DISPATCHER_PROFILE_COLLECTION,
      vehicles: VEHICLE_COLLECTION,
    };
    const targetCollection = targetByField[field];
    if (targetCollection) {
      mutationPlan.upserts.forEach((item) => {
        const data = field === 'trashedTrips'
          ? archivedPayload(item)
          : field === 'vehicles'
            ? vehiclePayload(item)
            : field === 'trips'
              ? sanitizeForFirestore(attachTenantScope(buildOperationalTripRecord(item), activeTenantId))
              : scopedPayload(item);
        offlineOperations.push({ type: 'setDoc', collection: targetCollection, docId: String(item.id), data });
      });
      mutationPlan.removedIds.forEach((id) => {
        offlineOperations.push({ type: 'deleteDoc', collection: targetCollection, docId: String(id) });
      });
      if (field === 'trips') {
        assignmentMutations.forEach((assignment) => {
          offlineOperations.push({
            type: 'setDoc',
            collection: 'assignments',
            docId: String(assignment.id),
            data: assignment,
          });
        });
      }
    } else if (field === 'phoneNumbers') {
      offlineOperations.push({
        type: 'setDoc', collection: 'systemConfig', docId: 'phoneNumbers',
        data: attachTenantScope(sanitized, activeTenantId),
      });
    }

    dataRef.current = { ...dataRef.current, [field]: sanitized };

    try {
      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (isOffline) {
        await saveFieldWithSyncOperations(field, sanitized, offlineOperations, {
          tenantId: activeTenantId,
          userId: auth.currentUser?.uid || '',
        });
      } else {
        if (field === 'trips') {
          mutationPlan.upserts.forEach((trip) => pendingTripImportsRef.current.add(String(trip.id)));
          try {
            await writeTripsToCollection(mutationPlan.upserts, activeTenantId);
          } catch (error) {
            mutationPlan.upserts.forEach((trip) => pendingTripImportsRef.current.delete(String(trip.id)));
            throw error;
          }
          await writeAssignmentsToCollection(mutationPlan.upserts, activeTenantId, priorChangedRecords).catch((error) => {
            console.warn('[writeField] Assignment write non-fatal error:', error?.code, error?.message);
          });
        } else if (field === 'trashedTrips') {
          await writeDocumentMutations(TRIPS_COLLECTION, mutationPlan.upserts, [], archivedPayload);
        } else if (field === 'drivers') {
          await writeDocumentMutations(DRIVER_PROFILE_COLLECTION, mutationPlan.upserts, mutationPlan.removedIds, scopedPayload);
        } else if (field === 'dispatchers') {
          await writeDocumentMutations(DISPATCHER_PROFILE_COLLECTION, mutationPlan.upserts, mutationPlan.removedIds, scopedPayload);
        } else if (field === 'vehicles') {
          await writeDocumentMutations(VEHICLE_COLLECTION, mutationPlan.upserts, mutationPlan.removedIds, vehiclePayload);
        } else if (field === 'phoneNumbers') {
          await setDoc(doc(db, PHONE_NUMBERS_DOC), attachTenantScope(sanitized, activeTenantId), { merge: true });
        }
        await saveLocalField(field, sanitized, { previousValue, tenantId: activeTenantId });
      }

      const actor = getCurrentEventActor();
      const events = field === 'trips'
        ? buildTripEvents(priorChangedRecords, mutationPlan.upserts, actor)
        : field === 'drivers'
          ? buildDriverEvents(priorChangedRecords, mutationPlan.upserts, actor)
          : [];
      if (events.length > 0) emitSystemEvents(events).catch((error) => console.error('Event emit failed:', error));

      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      setState(prev => ({ ...prev, saving: pendingWritesRef.current > 0, lastSavedAt: new Date().toISOString() }));
      return true;
    } catch (error) {
      const canRetryInBackground = !isPermanentSyncFailure(error)
        && offlineOperations.length > 0
        && Boolean(auth.currentUser?.uid);
      if (canRetryInBackground) {
        try {
          await saveFieldWithSyncOperations(field, sanitized, offlineOperations, {
            tenantId: activeTenantId,
            userId: auth.currentUser.uid,
          });
          pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
          setState(prev => ({
            ...prev,
            saving: pendingWritesRef.current > 0,
            lastSavedAt: new Date().toISOString(),
            error: null,
          }));
          return true;
        } catch (queueError) {
          console.error(`Failed to queue ${field} for synchronization:`, queueError);
        }
      }
      const rollbackValue = rollbackOptimisticValue(
        dataRef.current[field],
        previousValue,
        sanitized,
        mutationPlan,
      );
      dataRef.current = { ...dataRef.current, [field]: rollbackValue };
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      console.error(`Failed to save ${field}:`, error);
      setState(prev => ({
        ...prev,
        [field]: rollbackValue ?? (Array.isArray(sanitized) ? [] : {}),
        saving: pendingWritesRef.current > 0,
        error: error.message || `Failed to save ${field}`,
      }));
      return false;
    }
  }, [activeTenantId]);

  const setTrips = useCallback((updater) => {
    return enqueueFieldPersistence('trips', () => {
      const current = dataRef.current.trips || [];
      const next = typeof updater === 'function' ? updater(current) : updater;
      return writeField('trips', next);
    });
  }, [enqueueFieldPersistence, writeField]);

  const archiveTripsById = useCallback((tripIds = []) => {
    return enqueueTripPersistence(async () => {
      const selectedIds = new Set((tripIds || []).filter(Boolean).map(String));
      if (selectedIds.size === 0) return { archivedCount: 0, archivedTrips: [] };
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('Archiving requires a verified connection. Reconnect and retry; no trips were changed.');
      }
      const baseData = normalizeData(dataRef.current);
      const selectedTrips = baseData.trips.filter((trip) => selectedIds.has(String(trip.id)));
      if (selectedTrips.length !== selectedIds.size) {
        throw new Error('One or more selected trips are no longer active. Refresh the manifest and retry.');
      }
      const archivedAtLocal = new Date().toISOString();
      const plan = {
        archivePatches: selectedTrips.map((trip) => ({
          id: String(trip.id),
          archiveState: 'archived',
          archivedAtLocal,
        })),
      };
      const batch = writeBatch(db);
      plan.archivePatches.forEach((patch) => {
        batch.set(doc(db, TRIPS_COLLECTION, patch.id), attachTenantScope({
          archiveState: patch.archiveState,
          archivedAtLocal: patch.archivedAtLocal,
          updatedAtLocal: archivedAtLocal,
          updatedAt: serverTimestamp(),
        }, activeTenantId), { merge: true });
      });
      await batch.commit();

      const archivedRecords = selectedTrips.map((trip) => ({ ...trip, archiveState: 'archived', archivedAtLocal }));
      const nextTrips = baseData.trips.filter((trip) => !selectedIds.has(String(trip.id)));
      const existingArchiveIds = new Set(baseData.trashedTrips.map((trip) => String(trip.id)));
      const nextTrashedTrips = [
        ...archivedRecords.filter((trip) => !existingArchiveIds.has(String(trip.id))),
        ...baseData.trashedTrips,
      ];
      dataRef.current = { ...baseData, trips: nextTrips, trashedTrips: nextTrashedTrips };
      setState((previous) => ({ ...previous, trips: nextTrips, trashedTrips: nextTrashedTrips, error: null, lastSavedAt: archivedAtLocal }));
      await Promise.all([
        saveLocalField('trips', nextTrips, { previousValue: baseData.trips, tenantId: activeTenantId }),
        saveLocalField('trashedTrips', nextTrashedTrips, { previousValue: baseData.trashedTrips, tenantId: activeTenantId }),
      ]);
      return { archivedCount: archivedRecords.length, archivedTrips: archivedRecords };
    });
  }, [activeTenantId, enqueueTripPersistence]);

  const persistUploadedTrips = useCallback((newTrips = []) => {
    return enqueueTripPersistence(async () => {
      if (!Array.isArray(newTrips) || newTrips.length === 0) return { importedCount: 0, trips: [] };
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('Trip import requires a verified connection. Reconnect and retry; no trips were changed.');
      }
      const baseData = normalizeData(dataRef.current);
      const makeKey = (trip) => {
        const bookingId = String(trip?.bookingId || '').trim();
        if (bookingId && !/^(BK-\d+-\d+|TRP-\d+|TRIP-\d{10,}-\d+)$/i.test(bookingId)) return `booking::${bookingId}`;
        return ['patient', 'date', 'time', 'pickup', 'dropoff']
          .map((field) => String(trip?.[field] || '').trim().toLowerCase().replace(/\s+/g, ' '))
          .join('|');
      };
      const activeByKey = new Map(baseData.trips.map((trip) => [makeKey(trip), trip]));
      const archivedByKey = new Map(baseData.trashedTrips.map((trip) => [makeKey(trip), trip]));
      const importedTrips = newTrips.map((incoming) => {
        const match = activeByKey.get(makeKey(incoming)) || archivedByKey.get(makeKey(incoming));
        const meaningfulIncoming = Object.fromEntries(Object.entries(incoming).filter(([, value]) => value !== '' && value !== null && value !== undefined));
        const fallbackId = incoming.id || incoming.bookingId || `trip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const merged = { ...(match || {}), ...meaningfulIncoming, id: match?.id || fallbackId };
        return { ...merged, archiveState: null, archivedAtLocal: null };
      });
      const reactivatedIds = new Set(importedTrips.map((trip) => String(trip.id)));
      const plan = {
        archivePatches: importedTrips.filter((trip) => archivedByKey.has(makeKey(trip))).map((trip) => ({ id: String(trip.id), archiveState: null })),
      };
      plan.archivePatches.forEach((patch) => {
        const imported = importedTrips.find((trip) => String(trip.id) === patch.id);
        if (imported) imported.archiveState = patch.archiveState;
      });
      await writeTripsToCollection(importedTrips, activeTenantId, { strictAtomic: true });

      const mergedById = new Map(baseData.trips.map((trip) => [String(trip.id), trip]));
      importedTrips.forEach((trip) => mergedById.set(String(trip.id), trip));
      const nextTrips = cleanTripCollection([...mergedById.values()]);
      const nextTrashedTrips = baseData.trashedTrips.filter((trip) => !reactivatedIds.has(String(trip.id)));
      const savedAt = new Date().toISOString();
      dataRef.current = { ...baseData, trips: nextTrips, trashedTrips: nextTrashedTrips };
      setState((previous) => ({ ...previous, trips: nextTrips, trashedTrips: nextTrashedTrips, error: null, lastSavedAt: savedAt }));
      await Promise.all([
        saveLocalField('trips', nextTrips, { previousValue: baseData.trips, tenantId: activeTenantId }),
        saveLocalField('trashedTrips', nextTrashedTrips, { previousValue: baseData.trashedTrips, tenantId: activeTenantId }),
      ]);
      return { importedCount: importedTrips.length, trips: importedTrips };
    });
  }, [activeTenantId, enqueueTripPersistence]);

  const setDrivers = useCallback((updater) => enqueueFieldPersistence('drivers', () => {
    const current = dataRef.current.drivers || [];
    const next = typeof updater === 'function' ? updater(current) : updater;
    return writeField('drivers', next);
  }), [enqueueFieldPersistence, writeField]);

  const upsertDriverTrip = useCallback((tripId, updates = {}) => enqueueFieldPersistence('trips', async () => {
    if (!tripId) return false;
    const now = new Date().toISOString();
    const currentTrips = dataRef.current.trips || [];
    const currentTrip = currentTrips.find((trip) => String(trip.id) === String(tripId));
    let records;
    try {
      records = buildTripWorkflowPersistenceRecords({
        tripId,
        currentTrip,
        updates,
        tenantId: activeTenantId,
        nowIso: now,
      });
    } catch (error) {
      setState((previous) => ({
        ...previous,
        error: error.message || 'Trip progress could not be prepared for saving',
      }));
      return false;
    }

    const { authoritativeTrip, authoritativePatch, progressPatch, ledgerPatch } = records;
    const nextTrips = currentTrips.map((trip) => (
      String(trip.id) === String(tripId) ? authoritativeTrip : trip
    ));
    const workflowOperations = [{
      type: 'setDocs',
      writes: [
        { collection: TRIPS_COLLECTION, docId: String(tripId), data: authoritativePatch },
        { collection: DRIVER_TRIP_PROGRESS_COLLECTION, docId: String(tripId), data: progressPatch },
        { collection: TRIP_LEDGER_COLLECTION, docId: String(tripId), data: ledgerPatch },
      ],
    }];
    dataRef.current = { ...dataRef.current, trips: nextTrips };
    setState(prev => ({ ...prev, trips: nextTrips }));

    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await saveFieldWithSyncOperations('trips', nextTrips, workflowOperations, {
          tenantId: activeTenantId,
          userId: auth.currentUser?.uid || '',
        });
        return true;
      }
      await saveLocalField('trips', nextTrips, { previousValue: currentTrips, tenantId: activeTenantId });
      const batch = writeBatch(db);
      batch.set(doc(db, TRIPS_COLLECTION, String(tripId)), {
        ...authoritativePatch,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      batch.set(doc(db, DRIVER_TRIP_PROGRESS_COLLECTION, String(tripId)), {
        ...progressPatch,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      batch.set(doc(db, TRIP_LEDGER_COLLECTION, String(tripId)), {
        ...ledgerPatch,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await batch.commit();
      const events = buildTripEvents([currentTrip], [authoritativeTrip], getCurrentEventActor());
      if (events.length > 0) {
        emitSystemEvents(events).catch((error) => console.error('Driver trip event emit failed:', error));
      }
      return true;
    } catch (err) {
      if (!isPermanentSyncFailure(err) && auth.currentUser?.uid) {
        try {
          await saveFieldWithSyncOperations('trips', nextTrips, workflowOperations, {
            tenantId: activeTenantId,
            userId: auth.currentUser.uid,
          });
          return true;
        } catch (queueError) {
          console.error('Failed to queue driver trip progress:', queueError);
        }
      }
      const rollbackTrips = rollbackOptimisticValue(
        dataRef.current.trips,
        currentTrips,
        nextTrips,
        planCollectionMutations(currentTrips, nextTrips, { allowDeletes: false }),
      );
      dataRef.current = { ...dataRef.current, trips: rollbackTrips };
      setState(prev => ({ ...prev, trips: rollbackTrips, error: err.message || 'Trip progress could not be saved' }));
      console.error('Failed to upsert driver trip progress:', err);
      return false;
    }
  }), [activeTenantId, enqueueFieldPersistence]);

  const upsertDriverProfile = useCallback((driverId, updates = {}) => enqueueFieldPersistence('drivers', async () => {
    if (!driverId) return false;
    const currentDrivers = dataRef.current.drivers || [];
    const existing = currentDrivers.find((driver) => driver.id === driverId) || { id: driverId };
    const nextDriver = sanitizeForFirestore(attachTenantScope({ ...existing, ...updates, id: driverId, updatedAtLocal: updates.updatedAtLocal || new Date().toISOString() }, activeTenantId));
    const nextDrivers = currentDrivers.some((driver) => driver.id === driverId)
      ? currentDrivers.map((driver) => (driver.id === driverId ? nextDriver : driver))
      : [...currentDrivers, nextDriver];
    dataRef.current = { ...normalizeData(dataRef.current), drivers: nextDrivers };
    setState(prev => ({ ...prev, drivers: nextDrivers, error: null }));
    const profileOperation = {
      type: 'setDoc', collection: DRIVER_PROFILE_COLLECTION,
      docId: String(driverId), data: nextDriver,
    };
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await saveFieldWithSyncOperations('drivers', nextDrivers, [profileOperation], { tenantId: activeTenantId, userId: auth.currentUser?.uid || '' });
        return true;
      }
      await saveLocalField('drivers', nextDrivers, { previousValue: currentDrivers, tenantId: activeTenantId });
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
      if (!isPermanentSyncFailure(err) && auth.currentUser?.uid) {
        try {
          await saveFieldWithSyncOperations('drivers', nextDrivers, [profileOperation], {
            tenantId: activeTenantId,
            userId: auth.currentUser.uid,
          });
          return true;
        } catch (queueError) {
          console.error('Failed to queue driver profile:', queueError);
        }
      }
      console.error('Failed to upsert driver profile:', err);
      const rollbackDrivers = rollbackOptimisticValue(
        dataRef.current.drivers,
        currentDrivers,
        nextDrivers,
        planCollectionMutations(currentDrivers, nextDrivers),
      );
      dataRef.current = { ...normalizeData(dataRef.current), drivers: rollbackDrivers };
      setState(prev => ({
        ...prev,
        drivers: rollbackDrivers,
        error: err.message || 'Driver profile could not be saved',
      }));
      return false;
    }
  }), [activeTenantId, enqueueFieldPersistence]);

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


  const setDispatchers = useCallback((updater) => enqueueFieldPersistence('dispatchers', () => { const current = dataRef.current.dispatchers || []; return writeField('dispatchers', typeof updater === 'function' ? updater(current) : updater); }), [enqueueFieldPersistence, writeField]);
  const setVehicles = useCallback((updater) => enqueueFieldPersistence('vehicles', () => { const current = dataRef.current.vehicles || []; return writeField('vehicles', typeof updater === 'function' ? updater(current) : updater); }), [enqueueFieldPersistence, writeField]);
  const setTrashedTrips = useCallback((updater) => enqueueFieldPersistence('trashedTrips', () => { const current = dataRef.current.trashedTrips || []; return writeField('trashedTrips', typeof updater === 'function' ? updater(current) : updater); }), [enqueueFieldPersistence, writeField]);
  const setPhoneNumbers = useCallback((updater) => enqueueFieldPersistence('phoneNumbers', () => { const current = dataRef.current.phoneNumbers || DEFAULT_DATA.phoneNumbers; return writeField('phoneNumbers', typeof updater === 'function' ? updater(current) : updater); }), [enqueueFieldPersistence, writeField]);

  const addLog = useCallback((log) => enqueueFieldPersistence('logs', async () => {
    const logRef = doc(collection(db, 'logs'));
    const timestampLocal = new Date().toISOString();
    const localLog = sanitizeForFirestore({
      ...log,
      id: logRef.id,
      tenantId: activeTenantId,
      timestampLocal,
    });
    const previousLogs = dataRef.current.logs || [];
    const nextLogs = [localLog, ...previousLogs.filter((item) => item.id !== logRef.id)].slice(0, 250);
    const operation = {
      type: 'setDoc',
      collection: 'logs',
      docId: logRef.id,
      data: localLog,
    };
    dataRef.current = { ...dataRef.current, logs: nextLogs };
    setState(prev => ({ ...prev, logs: nextLogs, error: null }));
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await saveFieldWithSyncOperations('logs', nextLogs, [operation], {
          tenantId: activeTenantId,
          userId: auth.currentUser?.uid || '',
        });
        return true;
      }
      await setDoc(logRef, { ...localLog, timestamp: serverTimestamp() });
      await saveLocalField('logs', nextLogs, { previousValue: previousLogs, tenantId: activeTenantId });
      return true;
    } catch (error) {
      if (!isPermanentSyncFailure(error) && auth.currentUser?.uid) {
        try {
          await saveFieldWithSyncOperations('logs', nextLogs, [operation], {
            tenantId: activeTenantId,
            userId: auth.currentUser.uid,
          });
          return true;
        } catch (queueError) {
          console.error('Failed to queue activity log:', queueError);
        }
      }
      const currentLogs = dataRef.current.logs || [];
      const rollbackLogs = currentLogs.filter((item) => item.id !== logRef.id);
      dataRef.current = { ...dataRef.current, logs: rollbackLogs };
      setState(prev => ({ ...prev, logs: rollbackLogs, error: error.message || 'Activity log could not be synchronized' }));
      console.error('Log failed:', error);
      return false;
    }
  }), [activeTenantId, enqueueFieldPersistence]);

  const initializeAppData = useCallback(async () => {
    return true;
  }, []);

  return {
    trips: state.trips, drivers: state.drivers, dispatchers: state.dispatchers, vehicles: state.vehicles,
    trashedTrips: state.trashedTrips, logs: state.logs, phoneNumbers: state.phoneNumbers,
    loading: state.loading, saving: state.saving, error: state.error,
    initialized: state.initialized, docExists: state.docExists, lastSavedAt: state.lastSavedAt,
    setTrips, archiveTripsById, persistUploadedTrips, setDrivers, upsertDriverProfile, assignVehicleToDriver, upsertDriverTrip, setDispatchers, setVehicles, setTrashedTrips, setPhoneNumbers, addLog, initializeAppData,
  };
}

export default useFirestoreAppData;
