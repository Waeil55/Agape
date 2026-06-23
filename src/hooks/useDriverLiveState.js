import { useEffect, useMemo, useRef, useState } from 'react';
import {
  db,
  auth,
  collection,
  doc,
  getDocsFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from '../config/firebase';
import {
  DRIVER_STATUSES,
  FIRESTORE_COLLECTIONS,
  SESSION_STATUSES,
  SYSTEM_EVENT_TYPES,
} from '../config/firestoreSchema';
import { emitSystemEvent } from '../services/firestoreEventEngine';

const HEARTBEAT_INTERVAL_MS = 5000;
const HEARTBEAT_OFFLINE_MS = 15000;
const HEARTBEAT_FORCE_LOGOUT_MS = 30000;
const DEVICE_ID_KEY = 'agape_device_id';

const ACTIVE_TRIP_STATUSES = new Set([
  'assigned',
  'accepted',
  'in mission',
  'in progress',
  'navigating pickup',
  'at pickup',
  'in transit',
  'navigating dropoff',
  'at dropoff',
  'arrived',
]);

const getDeviceId = () => {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const next = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, next);
    return next;
  } catch {
    return `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
};

const getDriverRuntimeStatus = (driver, currentTrip) => {
  if (!driver?.clockedIn) return DRIVER_STATUSES.OFFLINE;
  if (currentTrip?.id) return DRIVER_STATUSES.ON_TRIP;
  return DRIVER_STATUSES.AVAILABLE;
};

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getCurrentTrip = (trips = []) => (
  (trips || [])
    .filter((trip) => ACTIVE_TRIP_STATUSES.has(String(trip.status || '').toLowerCase()))
    .sort((a, b) => {
      const aTime = Date.parse(a.startedAt || a.updatedAtLocal || a.time || 0) || 0;
      const bTime = Date.parse(b.startedAt || b.updatedAtLocal || b.time || 0) || 0;
      return bTime - aTime;
    })[0] || null
);

export function useDriverLiveState({
  enabled,
  driver,
  trips = [],
  currentUser,
  onInvalidSession,
  resubscribeKey = 0,
}) {
  const [sessionState, setSessionState] = useState({
    sessionId: null,
    deviceId: null,
    valid: true,
    status: SESSION_STATUSES.ACTIVE,
  });
  const [networkOnline, setNetworkOnline] = useState(() => (
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  ));
  const lastStatusRef = useRef('');
  const sessionIdRef = useRef('');
  const unsubSessionRef = useRef(null);
  const sessionInvalidRef = useRef(false);

  const currentTrip = useMemo(() => getCurrentTrip(trips), [trips]);
  const runtimeStatus = useMemo(() => getDriverRuntimeStatus(driver, currentTrip), [driver, currentTrip]);

  useEffect(() => {
    if (!enabled || !driver?.id || !auth.currentUser) return undefined;
    let cancelled = false;
    const deviceId = getDeviceId();
    const sessionId = `${auth.currentUser.uid}_${deviceId}`;
    sessionIdRef.current = sessionId;

    const sessionRef = doc(db, FIRESTORE_COLLECTIONS.SESSIONS, sessionId);
    const heartbeatRef = doc(db, FIRESTORE_COLLECTIONS.HEARTBEAT, driver.id);
    const liveDriverRef = doc(db, FIRESTORE_COLLECTIONS.DRIVERS, driver.id);
    const driverProfileRef = doc(db, 'driverProfiles', driver.id);

    const actor = {
      userId: auth.currentUser.uid,
      email: auth.currentUser.email || currentUser || '',
      role: 'driver',
    };

    const invalidateOldSessions = async () => {
      const sessionsQuery = query(
        collection(db, FIRESTORE_COLLECTIONS.SESSIONS),
        where('driverId', '==', driver.id),
        where('status', '==', SESSION_STATUSES.ACTIVE)
      );
      const snap = await getDocsFromServer(sessionsQuery);
      const batch = writeBatch(db);
      let invalidated = 0;
      snap.forEach((sessionDoc) => {
        if (sessionDoc.id === sessionId) return;
        invalidated += 1;
        batch.set(doc(db, FIRESTORE_COLLECTIONS.SESSIONS, sessionDoc.id), {
          status: SESSION_STATUSES.INVALIDATED,
          invalidatedReason: 'new_login',
          invalidatedBySessionId: sessionId,
          invalidatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });
      if (invalidated > 0) {
        await batch.commit();
        await emitSystemEvent({
          type: SYSTEM_EVENT_TYPES.SESSION_INVALIDATED,
          aggregateType: 'session',
          aggregateId: sessionId,
          driverId: driver.id,
          actor,
          severity: 'warning',
          payload: {
            reason: 'new_login',
            invalidatedSessions: invalidated,
            activeSessionId: sessionId,
            deviceId,
          },
        });
      }
    };

    const writeLiveState = async (isInitial = false) => {
      if (cancelled || sessionInvalidRef.current) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setNetworkOnline(false);
        return;
      }
      setNetworkOnline(true);
      const nowIso = new Date().toISOString();
      const liveState = {
        userId: auth.currentUser?.uid || '',
        email: auth.currentUser?.email || currentUser || '',
        driverId: driver.id,
        name: driver.name || currentUser || 'Driver',
        status: runtimeStatus,
        availability: runtimeStatus === DRIVER_STATUSES.AVAILABLE ? 'available' : 'unavailable',
        clockedIn: runtimeStatus !== DRIVER_STATUSES.OFFLINE,
        currentTripId: currentTrip?.id || null,
        currentTripState: currentTrip?.status || null,
        activeSessionId: sessionId,
        lastHeartbeatAt: serverTimestamp(),
        lastHeartbeatAtLocal: nowIso,
        sessionValid: true,
        updatedAt: serverTimestamp(),
      };

      const sessionPatch = {
          id: sessionId,
          userId: auth.currentUser?.uid || '',
          driverId: driver.id,
          role: 'driver',
          deviceId,
          deviceLabel: navigator.userAgent || 'PWA',
          status: SESSION_STATUSES.ACTIVE,
          invalidatedReason: null,
          lastSeenAt: serverTimestamp(),
          expiresAt: null,
          invalidatedAt: null,
        };
      if (isInitial) sessionPatch.createdAt = serverTimestamp();

      await Promise.all([
        setDoc(sessionRef, sessionPatch, { merge: true }),
        setDoc(heartbeatRef, {
          driverId: driver.id,
          userId: auth.currentUser?.uid || '',
          sessionId,
          status: 'alive',
          lastSeenAt: serverTimestamp(),
          lastSeenAtLocal: nowIso,
          clientTimeMs: Date.now(),
          appVersion: import.meta.env.VITE_APP_VERSION || '1.0.0',
          network: {
            online: navigator.onLine !== false,
            effectiveType: navigator.connection?.effectiveType || '',
          },
          device: {
            id: deviceId,
            platform: navigator.platform || 'web',
          },
        }, { merge: true }),
        setDoc(liveDriverRef, liveState, { merge: true }),
        setDoc(driverProfileRef, {
          userId: auth.currentUser?.uid || '',
          email: auth.currentUser?.email || currentUser || '',
          status: runtimeStatus === DRIVER_STATUSES.ON_TRIP ? 'On Trip' : runtimeStatus === DRIVER_STATUSES.AVAILABLE ? 'Available' : 'Offline',
          clockedIn: runtimeStatus !== DRIVER_STATUSES.OFFLINE,
          currentTripId: currentTrip?.id || null,
          currentTripState: currentTrip?.status || null,
          activeSessionId: sessionId,
          lastHeartbeatAt: serverTimestamp(),
          lastHeartbeatAtLocal: nowIso,
          sessionValid: true,
          updatedAtLocal: nowIso,
        }, { merge: true }),
      ]);

      if (lastStatusRef.current !== runtimeStatus) {
        const previousStatus = lastStatusRef.current || null;
        lastStatusRef.current = runtimeStatus;
        emitSystemEvent({
          type: SYSTEM_EVENT_TYPES.DRIVER_STATUS_CHANGED,
          aggregateType: 'driver',
          aggregateId: driver.id,
          driverId: driver.id,
          tripId: currentTrip?.id || null,
          actor,
          severity: 'info',
          payload: {
            before: previousStatus ? { status: previousStatus } : null,
            after: { status: runtimeStatus, currentTripId: currentTrip?.id || null },
            changedFields: ['status', 'currentTripId', 'activeSessionId'],
          },
        }).catch((err) => console.error('Driver live state event failed:', err));
      }
    };

    sessionInvalidRef.current = false;
    setSessionState({ sessionId, deviceId, valid: true, status: SESSION_STATUSES.ACTIVE });
    invalidateOldSessions()
      .then(() => writeLiveState(true))
      .catch((err) => console.error('Driver session initialization failed:', err));

    unsubSessionRef.current?.();
    unsubSessionRef.current = onSnapshot(sessionRef, (snap) => {
      if (cancelled || !snap.exists()) return;
      const session = snap.data();
      if (session.status !== SESSION_STATUSES.ACTIVE) {
        sessionInvalidRef.current = true;
        setSessionState((prev) => ({ ...prev, valid: false, status: session.status }));
        onInvalidSession?.(session);
      }
    }, (err) => {
      console.error('Driver session refresh failed:', err);
    });

    const heartbeatTimer = setInterval(() => {
      writeLiveState(false).catch((err) => console.error('Driver heartbeat failed:', err));
    }, HEARTBEAT_INTERVAL_MS);

    const fullResync = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setNetworkOnline(false);
        return;
      }
      setNetworkOnline(true);
      writeLiveState(false).catch((err) => console.error('Driver heartbeat resume failed:', err));
    };
    const offlineHandler = () => setNetworkOnline(false);
    window.addEventListener('online', fullResync);
    window.addEventListener('offline', offlineHandler);
    document.addEventListener('visibilitychange', fullResync);

    return () => {
      cancelled = true;
      clearInterval(heartbeatTimer);
      window.removeEventListener('online', fullResync);
      window.removeEventListener('offline', offlineHandler);
      document.removeEventListener('visibilitychange', fullResync);
      unsubSessionRef.current?.();
      unsubSessionRef.current = null;
    };
  }, [enabled, driver?.id, driver?.name, driver?.clockedIn, currentTrip?.id, currentTrip?.status, currentUser, runtimeStatus, onInvalidSession, resubscribeKey]);

  return {
    ...sessionState,
    currentTripId: currentTrip?.id || null,
    currentTripState: currentTrip?.status || null,
    runtimeStatus,
    networkOnline,
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    offlineAfterMs: HEARTBEAT_OFFLINE_MS,
    forceLogoutAfterMs: HEARTBEAT_FORCE_LOGOUT_MS,
  };
}

export function useDriverLivenessMonitor({ enabled, resubscribeKey = 0 }) {
  const heartbeatRef = useRef([]);
  const offlineMarkedRef = useRef(new Set());
  const forceLogoutMarkedRef = useRef(new Set());

  useEffect(() => {
    if (!enabled) return undefined;

    const markOfflineDrivers = () => {
      const now = Date.now();
      heartbeatRef.current.forEach((heartbeat) => {
        const driverId = heartbeat.driverId || heartbeat.id;
        if (!driverId) return;
        const lastSeenMs = toMillis(heartbeat.lastSeenAt) || toMillis(heartbeat.lastSeenAtLocal) || heartbeat.clientTimeMs || 0;
        if (!lastSeenMs || now - lastSeenMs <= HEARTBEAT_OFFLINE_MS) {
          offlineMarkedRef.current.delete(driverId);
          forceLogoutMarkedRef.current.delete(driverId);
          return;
        }

        if (!offlineMarkedRef.current.has(driverId)) {
          offlineMarkedRef.current.add(driverId);

          const offlinePatch = {
            status: DRIVER_STATUSES.OFFLINE,
            availability: 'unavailable',
            clockedIn: false,
            sessionValid: false,
            offlineReason: 'heartbeat_timeout',
            offlineDetectedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          Promise.all([
            setDoc(doc(db, FIRESTORE_COLLECTIONS.DRIVERS, driverId), offlinePatch, { merge: true }),
            setDoc(doc(db, 'driverProfiles', driverId), {
              status: 'Offline',
              clockedIn: false,
              sessionValid: false,
              offlineReason: 'heartbeat_timeout',
              offlineDetectedAt: serverTimestamp(),
              updatedAtLocal: new Date().toISOString(),
            }, { merge: true }),
            setDoc(doc(db, FIRESTORE_COLLECTIONS.HEARTBEAT, driverId), {
              status: 'offline',
              offlineDetectedAt: serverTimestamp(),
            }, { merge: true }),
            emitSystemEvent({
              type: SYSTEM_EVENT_TYPES.HEARTBEAT_MISSED,
              aggregateType: 'driver',
              aggregateId: driverId,
              driverId,
              actor: { userId: 'system', role: 'system' },
              severity: 'warning',
              payload: {
                thresholdMs: HEARTBEAT_OFFLINE_MS,
                lastSeenAt: heartbeat.lastSeenAtLocal || heartbeat.clientTimeMs || null,
              },
            }),
            emitSystemEvent({
              type: SYSTEM_EVENT_TYPES.DRIVER_STATUS_CHANGED,
              aggregateType: 'driver',
              aggregateId: driverId,
              driverId,
              actor: { userId: 'system', role: 'system' },
              severity: 'warning',
              payload: {
                before: { status: 'alive' },
                after: { status: DRIVER_STATUSES.OFFLINE, offlineReason: 'heartbeat_timeout' },
                changedFields: ['status', 'sessionValid', 'offlineReason'],
                lastSeenAt: heartbeat.lastSeenAtLocal || heartbeat.clientTimeMs || null,
              },
            }),
          ]).catch((err) => {
            offlineMarkedRef.current.delete(driverId);
            console.error('Driver offline liveness update failed:', err);
          });
        }

        if (now - lastSeenMs <= HEARTBEAT_FORCE_LOGOUT_MS || forceLogoutMarkedRef.current.has(driverId)) return;
        forceLogoutMarkedRef.current.add(driverId);

        const sessionsQuery = query(
          collection(db, FIRESTORE_COLLECTIONS.SESSIONS),
          where('driverId', '==', driverId),
          where('status', '==', SESSION_STATUSES.ACTIVE)
        );

        getDocsFromServer(sessionsQuery)
          .then(async (snap) => {
            if (snap.empty) return;
            const batch = writeBatch(db);
            snap.forEach((sessionDoc) => {
              batch.set(doc(db, FIRESTORE_COLLECTIONS.SESSIONS, sessionDoc.id), {
                status: SESSION_STATUSES.INVALIDATED,
                invalidatedReason: 'heartbeat_timeout',
                invalidatedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }, { merge: true });
            });
            await batch.commit();
            await emitSystemEvent({
              type: SYSTEM_EVENT_TYPES.SESSION_INVALIDATED,
              aggregateType: 'driver',
              aggregateId: driverId,
              driverId,
              actor: { userId: 'system', role: 'system' },
              severity: 'critical',
              payload: {
                reason: 'heartbeat_timeout',
                thresholdMs: HEARTBEAT_FORCE_LOGOUT_MS,
                invalidatedSessions: snap.size,
                lastSeenAt: heartbeat.lastSeenAtLocal || heartbeat.clientTimeMs || null,
              },
            });
          })
          .catch((err) => {
            forceLogoutMarkedRef.current.delete(driverId);
            console.error('Driver heartbeat force logout failed:', err);
          });
      });
    };

    const unsub = onSnapshot(collection(db, FIRESTORE_COLLECTIONS.HEARTBEAT), (snapshot) => {
      heartbeatRef.current = snapshot.docs.map((heartbeatDoc) => ({ id: heartbeatDoc.id, ...heartbeatDoc.data() }));
      markOfflineDrivers();
    }, (err) => {
      console.error('Driver heartbeat liveness refresh failed:', err);
    });

    const livenessTimer = setInterval(markOfflineDrivers, HEARTBEAT_INTERVAL_MS);
    return () => {
      unsub();
      clearInterval(livenessTimer);
    };
  }, [enabled, resubscribeKey]);
}

export default useDriverLiveState;
