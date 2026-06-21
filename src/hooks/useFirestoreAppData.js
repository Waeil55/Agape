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
  buildDriverEvents,
  buildTripEvents,
  emitSystemEvents,
} from '../services/firestoreEventEngine';
import {
  buildOperationalTripRecord,
  isOperationalTrip,
  mergeTripCollections,
} from '../utils/tripLifecycle';

const DATA_DOC = 'appData/agape';
const TRIPS_COLLECTION = 'trips';
const ASSIGNMENTS_COLLECTION = 'assignments';
const TRIP_LEDGER_COLLECTION = 'tripLedger';
const DRIVER_TRIP_PROGRESS_COLLECTION = 'driverTripProgress';

// Deduplicate trips by bookingId — keeps the most advanced status copy
function dedupTripsByBookingId(trips = []) {
  const STATUS_PRIORITY = { 'Completed': 10, 'At Pickup': 9, 'In Mission': 9, 'Navigating Pickup': 8, 'Navigating Dropoff': 8, 'In Transit': 8, 'Assigned': 7, 'No Show': 5, 'Cancelled': 3, 'Unassigned': 1 };
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
const DRIVER_PROFILE_COLLECTION = 'driverProfiles';
const DISPATCHER_PROFILE_COLLECTION = 'dispatcherProfiles';
const VEHICLE_COLLECTION = 'fleetVehicles';
const PHONE_NUMBERS_DOC = 'systemConfig/phoneNumbers';
const MIRRORED_TRIP_FIELDS = new Set(['trips', 'trashedTrips']);

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

function normalizeTrip(trip) {
  if (!trip) return trip;
  const cleanValue = String(trip.bookingId || '').trim();
  if (!cleanValue) return trip;
  if (/^BK-\d+-\d+$/i.test(cleanValue)) return { ...trip, bookingId: null };
  if (/^TRP-\d+$/i.test(cleanValue)) return { ...trip, bookingId: null };
  if (/^TRIP-\d{10,}-\d+$/i.test(cleanValue)) return { ...trip, bookingId: null };
  return trip;
}

function normalizeData(data = {}) {
  return {
    ...DEFAULT_DATA,
    ...data,
    trips: data.trips || [],
    drivers: data.drivers || [],
    dispatchers: data.dispatchers || [],
    vehicles: data.vehicles || [],
    trashedTrips: data.trashedTrips || [],
    logs: data.logs || [],
    phoneNumbers: data.phoneNumbers || DEFAULT_DATA.phoneNumbers,
  };
}

function shouldIgnoreRealtimePermissionError(err) {
  return err?.code === 'permission-denied' && !auth.currentUser;
}

function getTripId(trip, fallbackPrefix, index) {
  return String(trip?.id || trip?.bookingId || `${fallbackPrefix}-${index}-${Date.now()}`);
}

function getCurrentEventActor() {
  const user = auth.currentUser;
  return {
    userId: user?.uid || user?.email || 'system',
    email: user?.email || '',
    role: 'system',
  };
}

async function loadCollectionRecords(collectionName) {
  const snap = await getDocs(collection(db, collectionName));
  const records = [];
  snap.forEach((itemDoc) => {
    records.push({ id: itemDoc.id, ...itemDoc.data() });
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

async function mirrorTripsToLedger(trips = [], trashedTrips = []) {
  const entries = [
    ...trips.map((trip, index) => ({ trip, index, archiveState: 'active' })),
    ...trashedTrips.map((trip, index) => ({ trip, index, archiveState: 'archived' })),
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
  const existingIds = new Set();
  const existingSnap = await getDocs(collection(db, TRIP_LEDGER_COLLECTION));
  existingSnap.forEach((tripDoc) => existingIds.add(tripDoc.id));
  const nextIds = new Set(sanitizedEntries.map(({ id }) => id));
  const staleIds = [...existingIds].filter((id) => !nextIds.has(id));

  for (let i = 0; i < sanitizedEntries.length; i += 450) {
    const batch = writeBatch(db);
    sanitizedEntries.slice(i, i + 450).forEach(({ id, data }) => {
      batch.set(doc(db, TRIP_LEDGER_COLLECTION, id), data, { merge: true });
    });
    await batch.commit();
  }

  for (let i = 0; i < staleIds.length; i += 450) {
    const batch = writeBatch(db);
    staleIds.slice(i, i + 450).forEach((id) => {
      batch.delete(doc(db, TRIP_LEDGER_COLLECTION, id));
    });
    await batch.commit();
  }
}

async function mirrorTripsToOperationalCollection(trips = []) {
  const sanitizedTrips = (trips || [])
    .filter((trip) => trip?.id && isOperationalTrip(trip))
    .map((trip) => ({
      id: String(trip.id),
      data: sanitizeForFirestore(buildOperationalTripRecord(trip)),
    }));

  for (let i = 0; i < sanitizedTrips.length; i += 450) {
    const batch = writeBatch(db);
    sanitizedTrips.slice(i, i + 450).forEach(({ id, data }) => {
      batch.set(doc(db, TRIPS_COLLECTION, id), data, { merge: true });
    });
    await batch.commit();
  }
}

async function markArchivedTripsInOperationalCollection(trashedTrips = []) {
  const archivedTrips = (trashedTrips || [])
    .filter((trip) => trip?.id)
    .map((trip) => ({
      id: String(trip.id),
      data: sanitizeForFirestore({
        ...buildOperationalTripRecord(trip),
        archiveState: 'archived',
        archivedAtLocal: trip.archivedAtLocal || new Date().toISOString(),
      }),
    }));

  for (let i = 0; i < archivedTrips.length; i += 450) {
    const batch = writeBatch(db);
    archivedTrips.slice(i, i + 450).forEach(({ id, data }) => {
      batch.set(doc(db, TRIPS_COLLECTION, id), data, { merge: true });
    });
    await batch.commit();
  }
}

const hasAssignedDriver = (trip = {}) => Boolean(trip.driverId || trip.driverEmail);
const isTerminalTrip = (trip = {}) => ['completed', 'cancelled', 'canceled', 'no show', 'no_show'].includes(
  String(trip.status || trip.lifecycleStatus || '').trim().toLowerCase()
);

const safeIdPart = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');

async function mirrorTripAssignments(trips = []) {
  const assignedTrips = (trips || [])
    .filter((trip) => trip?.id && hasAssignedDriver(trip) && !isTerminalTrip(trip))
    .map((trip) => {
      const id = trip.assignmentId || `trip_${safeIdPart(trip.id)}_${safeIdPart(trip.driverId || trip.driverEmail)}`;
      return {
        id,
        data: sanitizeForFirestore({
          id,
          tripId: String(trip.id),
          driverId: trip.driverId || null,
          driverEmail: String(trip.driverEmail || '').trim().toLowerCase() || null,
          driverName: trip.driverName || null,
          dispatcherId: trip.dispatcherId || null,
          status: trip.assignmentStatus || 'offered',
          priority: trip.priority || 'normal',
          deliveryState: trip.assignmentSeenAt ? 'seen' : 'queued',
          offeredAt: serverTimestamp(),
          offeredAtLocal: trip.assignedAt || trip.updatedAtLocal || new Date().toISOString(),
          updatedAt: serverTimestamp(),
          updatedAtLocal: new Date().toISOString(),
          tripSnapshot: {
            patient: trip.patient || trip.clientName || '',
            time: trip.time || '',
            pickup: trip.pickup || '',
            dropoff: trip.dropoff || '',
            status: trip.status || '',
          },
        }),
      };
    });

  for (let i = 0; i < assignedTrips.length; i += 450) {
    const batch = writeBatch(db);
    assignedTrips.slice(i, i + 450).forEach(({ id, data }) => {
      batch.set(doc(db, ASSIGNMENTS_COLLECTION, id), data, { merge: true });
    });
    await batch.commit();
  }
}

async function buildDataFromTripLedger() {
  const snap = await getDocs(collection(db, TRIP_LEDGER_COLLECTION));
  const trips = [];
  const trashedTrips = [];

  snap.forEach((tripDoc) => {
    const trip = { id: tripDoc.id, ...tripDoc.data() };
    if (trip.archiveState === 'archived') {
      trashedTrips.push(trip);
    } else {
      trips.push(trip);
    }
  });

  if (trips.length === 0 && trashedTrips.length === 0) return null;
  return { ...DEFAULT_DATA, trips: dedupTripsByBookingId(trips), trashedTrips: dedupTripsByBookingId(trashedTrips) };
}

async function buildDataFromMirrors() {
  const [tripData, drivers, dispatchers, vehicles, phoneNumbersSnap] = await Promise.all([
    buildDataFromTripLedger(),
    loadCollectionRecords(DRIVER_PROFILE_COLLECTION),
    loadCollectionRecords(DISPATCHER_PROFILE_COLLECTION),
    loadCollectionRecords(VEHICLE_COLLECTION),
    getDoc(doc(db, PHONE_NUMBERS_DOC)),
  ]);

  return normalizeData({
    ...(tripData || {}),
    drivers,
    dispatchers,
    vehicles,
    phoneNumbers: phoneNumbersSnap.exists()
      ? { ...DEFAULT_DATA.phoneNumbers, ...phoneNumbersSnap.data() }
      : DEFAULT_DATA.phoneNumbers,
  });
}

export function useFirestoreAppData({ resubscribeKey = 0 } = {}) {
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
  });

  const dataRef = useRef(DEFAULT_DATA);
  const tripProgressRef = useRef({});
  const liveTripsRef = useRef([]);
  const pendingWritesRef = useRef(0);
  const mirrorBackfillRef = useRef({
    drivers: false,
    dispatchers: false,
    vehicles: false,
    phoneNumbers: false,
  });

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, DATA_DOC),
      (snap) => {
        if (snap.exists()) {
          const currentData = normalizeData(dataRef.current);
          const d = normalizeData({
            ...snap.data(),
            drivers: (snap.data()?.drivers?.length || 0) > 0 ? snap.data().drivers : currentData.drivers,
            dispatchers: (snap.data()?.dispatchers?.length || 0) > 0 ? snap.data().dispatchers : currentData.dispatchers,
            vehicles: (snap.data()?.vehicles?.length || 0) > 0 ? snap.data().vehicles : currentData.vehicles,
            phoneNumbers: snap.data()?.phoneNumbers && Object.keys(snap.data().phoneNumbers || {}).length > 0
              ? snap.data().phoneNumbers
              : currentData.phoneNumbers,
          });
          const applyData = (nextData) => {
            const mergedTrips = mergeTripCollections(
              nextData.trips,
              liveTripsRef.current,
              tripProgressRef.current
            );
            const mergedData = {
              ...nextData,
              trips: mergedTrips,
            };
            dataRef.current = mergedData;
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
            }));
          };

          const hasTripData = (d.trips?.length || 0) > 0 || (d.trashedTrips?.length || 0) > 0;
          if (hasTripData) {
            applyData(d);
            return;
          }

          buildDataFromTripLedger()
            .then(async (recovered) => {
              if (!recovered || (!recovered.trips.length && !recovered.trashedTrips.length)) {
                applyData(d);
                return;
              }

              const hydrated = normalizeData({
                ...d,
                trips: recovered.trips,
                trashedTrips: recovered.trashedTrips,
              });
              applyData(hydrated);

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
              } catch (recoveryErr) {
                console.error('Ledger recovery patch failed:', recoveryErr);
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
        setState(prev => ({ ...prev, error: err.message, loading: false }));
      }
    );
    return unsub;
  }, [resubscribeKey]);

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

    const hasCustomPhoneNumbers = JSON.stringify(state.phoneNumbers || {}) !== JSON.stringify(DEFAULT_DATA.phoneNumbers);
    if (!mirrorBackfillRef.current.phoneNumbers && hasCustomPhoneNumbers) {
      mirrorBackfillRef.current.phoneNumbers = true;
      setDoc(doc(db, PHONE_NUMBERS_DOC), sanitizeForFirestore(state.phoneNumbers), { merge: true }).catch((err) => {
        mirrorBackfillRef.current.phoneNumbers = false;
        console.error('Phone number backfill failed:', err);
      });
    }
  }, [state.initialized, state.drivers, state.dispatchers, state.vehicles, state.phoneNumbers]);

  useEffect(() => {
    const bindCollection = (field, collectionName) => onSnapshot(
      collection(db, collectionName),
      (snap) => {
        const currentList = dataRef.current[field] || [];
        if (snap.size === 0 && currentList.length > 0) return;
        const nextList = [];
        snap.forEach((itemDoc) => {
          nextList.push({ id: itemDoc.id, ...itemDoc.data() });
        });
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
        console.error(`Realtime ${field} sync failed:`, err);
      }
    );

    const unsubDrivers = bindCollection('drivers', DRIVER_PROFILE_COLLECTION);
    const unsubDispatchers = bindCollection('dispatchers', DISPATCHER_PROFILE_COLLECTION);
    const unsubVehicles = bindCollection('vehicles', VEHICLE_COLLECTION);
    const unsubTrips = onSnapshot(
      collection(db, TRIPS_COLLECTION),
      (snap) => {
        const liveTrips = [];
        snap.forEach((tripDoc) => {
          const trip = { id: tripDoc.id, ...tripDoc.data() };
          if (isOperationalTrip(trip)) liveTrips.push(trip);
        });
        liveTripsRef.current = liveTrips;
        const baseData = normalizeData(dataRef.current);
        const mergedTrips = dedupTripsByBookingId(mergeTripCollections(baseData.trips, liveTrips, tripProgressRef.current));
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
        console.error('Realtime trips sync failed:', err);
      }
    );
    const unsubPhones = onSnapshot(
      doc(db, PHONE_NUMBERS_DOC),
      (snap) => {
        const currentNumbers = dataRef.current.phoneNumbers || DEFAULT_DATA.phoneNumbers;
        if (!snap.exists() && currentNumbers !== DEFAULT_DATA.phoneNumbers) return;
        const phoneNumbers = snap.exists()
          ? { ...DEFAULT_DATA.phoneNumbers, ...snap.data() }
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
        console.error('Realtime phone number sync failed:', err);
      }
    );
    const unsubTripProgress = onSnapshot(
      collection(db, DRIVER_TRIP_PROGRESS_COLLECTION),
      (snap) => {
        const progressByTrip = {};
        snap.forEach((progressDoc) => {
          progressByTrip[progressDoc.id] = {
            id: progressDoc.id,
            ...progressDoc.data(),
          };
          delete progressByTrip[progressDoc.id].tripId;
        });
        tripProgressRef.current = progressByTrip;
        const baseData = normalizeData(dataRef.current);
        const mergedTrips = mergeTripCollections(baseData.trips, liveTripsRef.current, progressByTrip);
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
        console.error('Realtime driver workflow sync failed:', err);
      }
    );

    return () => {
      unsubDrivers();
      unsubDispatchers();
      unsubVehicles();
      unsubTrips();
      unsubPhones();
      unsubTripProgress();
    };
  }, []);

  const writeField = useCallback(async (field, value) => {
    const previousData = normalizeData(dataRef.current);
    const sanitized = sanitizeForFirestore(value);
    dataRef.current = {
      ...previousData,
      [field]: sanitized,
    };

    pendingWritesRef.current += 1;
    setState(prev => ({
      ...prev,
      [field]: sanitized,
      saving: true,
      error: null,
    }));

    try {
      try {
        await setDoc(doc(db, DATA_DOC), {
          [field]: sanitized,
          updatedAt: serverTimestamp(),
          updatedField: field,
          updatedAtLocal: new Date().toISOString(),
        }, { merge: true });
      } catch (appDataErr) {
        if (!MIRRORED_TRIP_FIELDS.has(field) || appDataErr?.code !== 'permission-denied') {
          throw appDataErr;
        }
        console.warn(`Legacy appData write skipped for ${field}; operational trip collections remain authoritative.`, appDataErr);
      }

      if (MIRRORED_TRIP_FIELDS.has(field)) {
        await mirrorTripsToOperationalCollection(dataRef.current.trips || []);
        await mirrorTripAssignments(dataRef.current.trips || []).catch((assignmentErr) => {
          if (assignmentErr?.code === 'permission-denied') {
            console.warn('Assignment mirror skipped for this user; live trip record is already updated.', assignmentErr);
            return;
          }
          throw assignmentErr;
        });
        await markArchivedTripsInOperationalCollection(dataRef.current.trashedTrips || []);
        await mirrorTripsToLedger(dataRef.current.trips || [], dataRef.current.trashedTrips || []).catch((ledgerErr) => {
          if (ledgerErr?.code === 'permission-denied') {
            console.warn('Trip ledger mirror skipped; operational trips collection is already updated.', ledgerErr);
            return;
          }
          throw ledgerErr;
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
      const events = field === 'trips'
        ? buildTripEvents(previousData.trips || [], sanitized || [], actor)
        : field === 'drivers'
          ? buildDriverEvents(previousData.drivers || [], sanitized || [], actor)
          : [];
      if (events.length > 0) {
        emitSystemEvents(events).catch((eventErr) => {
          console.error('Failed to emit system events:', eventErr);
        });
      }

      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      setState(prev => ({
        ...prev,
        saving: pendingWritesRef.current > 0,
        lastSavedAt: new Date().toISOString(),
      }));
      return true;
    } catch (err) {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      console.error(`Failed to save ${field} to Firestore:`, err);
      setState(prev => ({
        ...prev,
        saving: pendingWritesRef.current > 0,
        error: err.message || `Failed to save ${field}`,
      }));
      return false;
    }
  }, [resubscribeKey]);

  const setTrips = useCallback((updater) => {
    const current = dataRef.current.trips || [];
    const next = typeof updater === 'function' ? updater(current) : updater;
    return writeField('trips', next.map(normalizeTrip));
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
      emitSystemEvents(buildDriverEvents([existing], [nextDriver], getCurrentEventActor())).catch((eventErr) => {
        console.error('Failed to emit driver system event:', eventErr);
      });
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

  const setVehicles = useCallback((updater) => {
    const current = dataRef.current.vehicles || [];
    const next = typeof updater === 'function' ? updater(current) : updater;
    return writeField('vehicles', next);
  }, [writeField]);

  const setTrashedTrips = useCallback((updater) => {
    const current = dataRef.current.trashedTrips || [];
    const next = typeof updater === 'function' ? updater(current) : updater;
    return writeField('trashedTrips', next);
  }, [writeField]);

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
      await addDoc(logRef, { ...log, timestamp: serverTimestamp() });
    } catch (err) {
      console.error('Log to cloud failed:', err);
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
    setTrips,
    setDrivers,
    upsertDriverProfile,
    setDispatchers,
    setVehicles,
    setTrashedTrips,
    setLogs,
    setPhoneNumbers,
    addLog,
    initializeAppData,
  };
}

export default useFirestoreAppData;
