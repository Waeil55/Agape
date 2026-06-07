// Agape Care — Session Security & Device Control (Task 11)
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { emitSystemEvent, SYSTEM_EVENT_TYPES } from './firestoreEventEngine';
import { COLLECTIONS } from '../config/firestoreSchema';

const getDeviceId = () => {
  let id = localStorage.getItem('agape_device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2) + '_' + Date.now();
    localStorage.setItem('agape_device_id', id);
  }
  return id;
};

export async function registerSession(userId, role) {
  const deviceId = getDeviceId();
  const sessionData = {
    userId,
    role,
    deviceId,
    active: true,
    createdAt: serverTimestamp(),
    lastActiveAt: serverTimestamp(),
    userAgent: navigator.userAgent.slice(0, 200),
  };

  try {
    await setDoc(doc(db, COLLECTIONS.SESSIONS, userId), sessionData, { merge: false }); // overwrite = single session
    emitSystemEvent(SYSTEM_EVENT_TYPES.SESSION_STARTED, { userId, deviceId, role });
    return deviceId;
  } catch (err) {
    console.error('[SessionManager] registerSession failed:', err);
    return deviceId;
  }
}

export async function invalidateSession(userId) {
  try {
    await setDoc(doc(db, COLLECTIONS.SESSIONS, userId), {
      active: false,
      invalidatedAt: serverTimestamp(),
    }, { merge: true });
    emitSystemEvent(SYSTEM_EVENT_TYPES.SESSION_INVALIDATED, { userId });
  } catch (err) {
    console.error('[SessionManager] invalidateSession failed:', err);
  }
}

/**
 * Watch the session document. If another device logs in (deviceId changes), call onForceLogout.
 */
export function watchSessionValidity(userId, onForceLogout) {
  const myDeviceId = getDeviceId();
  if (!userId) return () => {};

  const unsub = onSnapshot(doc(db, COLLECTIONS.SESSIONS, userId), (snap) => {
    if (!snap.exists()) return;
    const session = snap.data();
    // If session is inactive or device changed, force logout
    if (!session.active || (session.deviceId && session.deviceId !== myDeviceId)) {
      onForceLogout('Another device has signed in. You have been logged out for security.');
    }
  });

  return unsub;
}
