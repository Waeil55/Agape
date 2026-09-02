import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auth, db, doc, onSnapshot } from '../config/firebase';

const MINUTE_MS = 60 * 1000;
const CHECK_INTERVAL_MS = 15 * 1000;
const TOKEN_REFRESH_INTERVAL_MS = 5 * MINUTE_MS;
const WARNING_WINDOW_MS = 2 * MINUTE_MS;

export const SESSION_SECURITY_POLICY = Object.freeze({
  admin: { idleMs: 15 * MINUTE_MS, absoluteMs: 12 * 60 * MINUTE_MS },
  dispatcher: { idleMs: 30 * MINUTE_MS, absoluteMs: 12 * 60 * MINUTE_MS },
  driver: { idleMs: 30 * MINUTE_MS, absoluteMs: 18 * 60 * MINUTE_MS },
});

export function isEmploymentAccessActive(profile = {}) {
  const accessStatus = String(profile.accessStatus || profile.employmentStatus || 'active').toLowerCase();
  return profile.disabled !== true
    && profile.active !== false
    && !['disabled', 'inactive', 'revoked', 'suspended', 'terminated', 'separated'].includes(accessStatus);
}

const storageKey = (uid, suffix) => `agape_security_${uid}_${suffix}`;

export function clearSecuritySession(uid) {
  if (!uid) return;
  try {
    window.localStorage.removeItem(storageKey(uid, 'started_at'));
    window.localStorage.removeItem(storageKey(uid, 'last_activity'));
  } catch {}
}

export function beginSecuritySession(uid) {
  if (!uid) return;
  const now = Date.now();
  writeTimestamp(storageKey(uid, 'started_at'), now);
  writeTimestamp(storageKey(uid, 'last_activity'), now);
}

const readTimestamp = (key, fallback) => {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
};

const writeTimestamp = (key, value) => {
  try { window.localStorage.setItem(key, String(value)); } catch {}
};

export default function useEnterpriseSessionSecurity({
  enabled,
  role,
  driverWorking = false,
  onTerminate,
}) {
  const [warning, setWarning] = useState(null);
  const terminatingRef = useRef(false);
  const lastTokenRefreshRef = useRef(0);
  const onTerminateRef = useRef(onTerminate);
  useEffect(() => { onTerminateRef.current = onTerminate; }, [onTerminate]);

  const policy = useMemo(
    () => SESSION_SECURITY_POLICY[role] || SESSION_SECURITY_POLICY.dispatcher,
    [role]
  );

  const terminate = useCallback((reason, message) => {
    if (terminatingRef.current) return;
    terminatingRef.current = true;
    setWarning(null);
    onTerminateRef.current?.({ reason, message });
  }, []);

  const recordActivity = useCallback(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !enabled) return;
    const now = Date.now();
    writeTimestamp(storageKey(uid, 'last_activity'), now);
    setWarning(null);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !auth.currentUser) {
      terminatingRef.current = false;
      return undefined;
    }

    const uid = auth.currentUser.uid;
    const startedKey = storageKey(uid, 'started_at');
    const activityKey = storageKey(uid, 'last_activity');
    const now = Date.now();
    if (!readTimestamp(startedKey, 0)) writeTimestamp(startedKey, now);
    if (!readTimestamp(activityKey, 0)) writeTimestamp(activityKey, now);

    const unsubscribeProfile = onSnapshot(doc(db, 'users', uid), (snapshot) => {
      if (!snapshot.exists() || !isEmploymentAccessActive(snapshot.data())) {
        terminate('access_revoked', 'Your Agape Care access has been disabled. Contact an administrator if this is unexpected.');
      }
    }, () => {
      // Transient Firestore errors (network, permission flicker) should not
      // terminate the session. The next successful snapshot will re-validate.
    });

    const activityEvents = ['pointerdown', 'keydown', 'touchstart', 'focus'];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }));

    const checkSecurityState = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser || terminatingRef.current) return;
      const checkedAt = Date.now();
      const startedAt = readTimestamp(startedKey, checkedAt);
      const lastActivityAt = readTimestamp(activityKey, checkedAt);
      const idleProtectionEnabled = !(role === 'driver' && driverWorking);
      const idleRemaining = idleProtectionEnabled ? policy.idleMs - (checkedAt - lastActivityAt) : Number.POSITIVE_INFINITY;
      const absoluteRemaining = policy.absoluteMs - (checkedAt - startedAt);
      const remainingMs = Math.min(idleRemaining, absoluteRemaining);
      const expiryReason = absoluteRemaining <= idleRemaining ? 'session_limit' : 'idle_timeout';

      if (remainingMs <= 0) {
        terminate(
          expiryReason,
          expiryReason === 'idle_timeout'
            ? 'You were signed out after a period of inactivity.'
            : 'Your secure session reached its maximum duration. Please sign in again.'
        );
        return;
      }

      if (remainingMs <= WARNING_WINDOW_MS) {
        setWarning({ reason: expiryReason, remainingMs });
      } else {
        setWarning(null);
      }

      if (checkedAt - lastTokenRefreshRef.current >= TOKEN_REFRESH_INTERVAL_MS) {
        lastTokenRefreshRef.current = checkedAt;
        try {
          await currentUser.getIdToken(true);
        } catch (error) {
          if (error?.code === 'auth/user-disabled') {
            terminate('access_revoked', 'Your secure session was revoked by an administrator.');
          }
          // auth/invalid-user-token and auth/user-token-expired are transient —
          // Firebase will recover on the next refresh cycle.
        }
      }
    };

    checkSecurityState();
    const interval = window.setInterval(checkSecurityState, CHECK_INTERVAL_MS);
    return () => {
      unsubscribeProfile();
      window.clearInterval(interval);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, recordActivity));
    };
  }, [driverWorking, enabled, policy.absoluteMs, policy.idleMs, recordActivity, role, terminate]);

  return {
    warning,
    recordActivity,
    idleProtectionSuspended: role === 'driver' && driverWorking,
  };
}
