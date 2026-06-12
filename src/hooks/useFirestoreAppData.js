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

const DATA_DOC = 'appData/agape';
const TRIP_LEDGER_COLLECTION = 'tripLedger';
const DRIVER_TRIP_PROGRESS_COLLECTION = 'driverTripProgress';
const DRIVER_PROFILE_COLLECTION = 'driverProfiles';
const DISPATCHER_PROFILE_COLLECTION = 'dispatcherProfiles';
const VEHICLE_COLLECTION = 'fleetVehicles';
const LOG_COLLECTION = 'logs';
const PHONE_NUMBERS_DOC = 'systemConfig/phoneNumbers';
const BACKUP_COLLECTION = 'systemBackups';
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
  const drivers = data.drivers || [];
  const safeTrips = (data.trips || []).map(trip => {
    let safePatient = trip?.patient;
    if (safePatient && typeof safePatient === 'object') {
      safePatient = 'Unknown Client';
    }

    let dName = trip?.driverName;
    if (dName && typeof dName === 'string' && dName.toLowerCase().includes('agape care medical')) {
      dName = '';
    }
    
    // Auto-resolve missing driver name from the admin users/drivers list
    if (!dName) {
      const matchedDriver = 
        (trip.driverId && drivers.find(d => d.id === trip.driverId)) ||
        (trip.driverEmail && drivers.find(d => d.email === trip.driverEmail));
      
      if (matchedDriver && matchedDriver.name) {
        dName = matchedDriver.name;
      }
    }

    return { ...trip, driverName: dName || '', patient: safePatient };
  });

  return {
    ...DEFAULT_DATA,
    ...data,
    trips: safeTrips,
    drivers: data.drivers || [],
    dispatchers: data.dispatchers || [],
    vehicles: data.vehicles || [],
    trashedTrips: data.trashedTrips || [],
    logs: data.logs || [],
    phoneNumbers: data.phoneNumbers || DEFAULT_DATA.phoneNumbers,
  };
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
  return String(trip?.id || trip?.bookingId || `${fallbackPrefix}-${index}-${Date.now()}`);
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
    trips: mergeRecordsById(activeApp, ledgerActive, 'active'),
    trashedTrips: mergeRecordsById(archivedApp, ledgerArchived, 'archived'),
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
  return { ...DEFAULT_DATA, trips, trashedTrips };
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
      ? { ...DEFAULT_DATA.phoneNumbers, ...phoneNumbersSnap.data() }
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
  const mirrorBackfillRef = useRef({
    drivers: false,
    dispatchers: false,
    vehicles: false,
    logs: false,
    phoneNumbers: false,
  });

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
  }, [setListenerStatus]);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, DATA_DOC),
      (snap) => {
        setListenerStatus('appData', 'live');
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
            const mergedData = {
              ...nextData,
              trips: mergeTripProgress(nextData.trips, tripProgressRef.current),
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
              lastLoadedAt: new Date().toISOString(),
            }));
          };

          buildDataFromTripLedger()
            .then(async (recovered) => {
              if (!recovered || (!recovered.trips.length && !recovered.trashedTrips.length)) {
                applyData(d);
                return;
              }

              const hydrated = mergeDataWithLedger(d, recovered);
              applyData(hydrated);

              if (!hasRecoveredLedgerRecords(d, hydrated)) return;

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
                setState(prev => ({ ...prev, lastRecoveredAt: new Date().toISOString() }));
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
          snapshotList.push({ id: itemDoc.id, ...itemDoc.data() });
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
          snapshotList.push({ id: itemDoc.id, ...itemDoc.data() });
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
          progressByTrip[progressDoc.id] = {
            id: progressDoc.id,
            ...progressDoc.data(),
          };
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
          const trip = { id: tripDoc.id, ...tripDoc.data() };
          if (trip.archiveState === 'archived') {
            ledgerArchived.push(trip);
          } else {
            ledgerTrips.push(trip);
          }
        });
        if (ledgerTrips.length === 0 && ledgerArchived.length === 0) return;

        const baseData = normalizeData(dataRef.current);
        const mergedData = mergeDataWithLedger(baseData, {
          ...DEFAULT_DATA,
          trips: ledgerTrips,
          trashedTrips: ledgerArchived,
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

        if (hasRecoveredLedgerRecords(baseData, patched)) {
          setDoc(doc(db, DATA_DOC), {
            trips: sanitizeForFirestore(patched.trips),
            trashedTrips: sanitizeForFirestore(patched.trashedTrips),
            recoveredFromLedger: true,
            recoveredAt: new Date().toISOString(),
            updatedAt: serverTimestamp(),
            updatedField: 'trips',
            updatedAtLocal: new Date().toISOString(),
          }, { merge: true }).catch((err) => {
            console.error('Live ledger recovery patch failed:', err);
          }).then(() => {
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

    return () => {
      unsubDrivers();
      unsubDispatchers();
      unsubVehicles();
      unsubLogs();
      unsubPhones();
      unsubTripProgress();
      unsubTripLedger();
    };
  }, [setListenerStatus]);

  const writeField = useCallback(async (field, value) => {
    const sanitized = sanitizeForFirestore(value);
    dataRef.current = {
      ...normalizeData(dataRef.current),
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
      await setDoc(doc(db, DATA_DOC), {
        [field]: sanitized,
        updatedAt: serverTimestamp(),
        updatedField: field,
        updatedAtLocal: new Date().toISOString(),
      }, { merge: true });

      if (MIRRORED_TRIP_FIELDS.has(field)) {
        await mirrorTripsToLedger(dataRef.current.trips || [], dataRef.current.trashedTrips || []);
      } else if (field === 'drivers') {
        await mirrorRecordsToCollection(DRIVER_PROFILE_COLLECTION, dataRef.current.drivers || []);
      } else if (field === 'dispatchers') {
        await mirrorRecordsToCollection(DISPATCHER_PROFILE_COLLECTION, dataRef.current.dispatchers || []);
      } else if (field === 'vehicles') {
        await mirrorRecordsToCollection(VEHICLE_COLLECTION, dataRef.current.vehicles || []);
      } else if (field === 'logs') {
        await mirrorLogsToCollection(sanitized);
      } else if (field === 'phoneNumbers') {
        await setDoc(doc(db, PHONE_NUMBERS_DOC), sanitized, { merge: true });
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
  }, []);

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
        trips: mergeRecordsById(current.trips, mirrorData.trips, 'active'),
        trashedTrips: mergeRecordsById(current.trashedTrips, mirrorData.trashedTrips, 'archived'),
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

      await setDoc(doc(db, DATA_DOC), {
        ...sanitizeForFirestore(merged),
        repairedAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
        updatedField: 'repair',
        updatedAtLocal: new Date().toISOString(),
      }, { merge: true });
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
    syncHealth: {
      loading: state.loading,
      saving: state.saving,
      error: state.error,
      initialized: state.initialized,
      docExists: state.docExists,
      lastSavedAt: state.lastSavedAt,
      lastLoadedAt: state.lastLoadedAt,
      lastRecoveredAt: state.lastRecoveredAt,
      lastBackupAt: state.lastBackupAt,
      lastRepairAt: state.lastRepairAt,
      listenerStatus: state.listenerStatus,
      pendingWrites: pendingWritesRef.current,
    },
    setTrips,
    setDrivers,
    upsertDriverProfile,
    setDispatchers,
    upsertDispatcherProfile,
    setVehicles,
    setTrashedTrips,
    setLogs,
    setPhoneNumbers,
    addLog,
    initializeAppData,
    repairCloudMirrors,
    createCloudBackup,
  };
}

export default useFirestoreAppData;
