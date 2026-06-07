// Agape Care — Driver Live State Engine (Tasks 3 & 4)
import { useEffect, useRef, useCallback } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { emitSystemEvent, SYSTEM_EVENT_TYPES } from '../services/firestoreEventEngine';
import { HEARTBEAT_INTERVAL_MS, COLLECTIONS } from '../config/firestoreSchema';

const generateDeviceId = () => {
  let id = localStorage.getItem('agape_device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2) + '_' + Date.now();
    localStorage.setItem('agape_device_id', id);
  }
  return id;
};

export const useDriverLiveState = (driverId, clockedIn = false, activeTripId = null) => {
  const heartbeatRef = useRef(null);
  const deviceId = useRef(generateDeviceId());
  const isActiveRef = useRef(false);
  
  // Use refs to keep track of dynamic state without triggering effect re-runs
  const stateRef = useRef({ clockedIn, activeTripId });
  useEffect(() => {
    stateRef.current = { clockedIn, activeTripId };
  }, [clockedIn, activeTripId]);

  const sendHeartbeat = useCallback(async () => {
    if (!driverId || document.hidden || !navigator.onLine) return;
    try {
      const payload = {
        driverId,
        deviceId: deviceId.current,
        clockedIn: stateRef.current.clockedIn,
        activeTripId: stateRef.current.activeTripId || null,
        online: true,
        lastHeartbeat: serverTimestamp(),
        lastHeartbeatLocal: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, COLLECTIONS.HEARTBEAT, driverId), payload, { merge: true });
      await setDoc(doc(db, COLLECTIONS.DRIVERS, driverId), {
        online: true,
        lastSeen: serverTimestamp(),
        lastSeenLocal: new Date().toISOString(),
        deviceId: deviceId.current,
      }, { merge: true });
    } catch (err) {
      console.warn('[Heartbeat] send failed:', err.message);
    }
  }, [driverId]);

  useEffect(() => {
    if (!driverId) return;
    isActiveRef.current = true;
    sendHeartbeat();
    heartbeatRef.current = setInterval(() => {
      if (isActiveRef.current && navigator.onLine) sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    const handleVisibility = () => {
      if (!document.hidden && isActiveRef.current) sendHeartbeat();
    };
    const handleOnline = () => {
      if (isActiveRef.current) sendHeartbeat();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      isActiveRef.current = false;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      // Mark offline ONLY on unmount
      if (driverId) {
        setDoc(doc(db, COLLECTIONS.HEARTBEAT, driverId), {
          online: false,
          lastSeen: serverTimestamp(),
        }, { merge: true }).catch(() => {});
        setDoc(doc(db, COLLECTIONS.DRIVERS, driverId), {
          online: false,
          lastSeen: serverTimestamp(),
        }, { merge: true }).catch(() => {});
      }
    };
  }, [driverId, sendHeartbeat]);

  return { deviceId: deviceId.current };
};
