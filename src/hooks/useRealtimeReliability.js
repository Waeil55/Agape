import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db, enableNetwork } from '../config/firebase';

export const REALTIME_RESUBSCRIBE_EVENT = 'agape:realtime-resubscribe';

export function requestRealtimeResubscribe(reason = 'manual', detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(REALTIME_RESUBSCRIBE_EVENT, {
    detail: {
      reason,
      at: Date.now(),
      ...detail,
    },
  }));
}

export function useRealtimeReliability({ enabled = true } = {}) {
  const [isOnline, setIsOnline] = useState(() => (
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  ));
  const [resubscribeKey, setResubscribeKey] = useState(0);
  const [lastReconnectAt, setLastReconnectAt] = useState(null);
  const [lastReason, setLastReason] = useState('initial');
  const lastBumpRef = useRef(0);

  const bumpResubscribe = useCallback((reason) => {
    const now = Date.now();
    if (now - lastBumpRef.current < 300) return;
    lastBumpRef.current = now;
    setLastReason(reason);
    setLastReconnectAt(new Date(now).toISOString());
    setResubscribeKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    const bumpOnly = (reason) => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      setIsOnline(true);
      bumpResubscribe(reason);
    };

    const handleOnline = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { setIsOnline(false); return; }
      setIsOnline(true);
      enableNetwork(db).catch((err) => console.warn('Firestore network resume failed:', err));
      bumpResubscribe('online');
    };
    const handleOffline = () => setIsOnline(false);
    const handleVisibility = () => { /* no-op — SDK handles reconnection */ };
    const handlePageShow = () => { /* no-op */ };
    const handleFocus = () => { /* no-op */ };
    const handleControllerChange = () => { /* no-op */ };
    const handleManualResubscribe = (event) => {
      bumpOnly(event.detail?.reason || 'manual');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('swControllerChanged', handleControllerChange);
    window.addEventListener(REALTIME_RESUBSCRIBE_EVENT, handleManualResubscribe);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('swControllerChanged', handleControllerChange);
      window.removeEventListener(REALTIME_RESUBSCRIBE_EVENT, handleManualResubscribe);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, bumpResubscribe]);

  return useMemo(() => ({
    isOnline,
    resubscribeKey,
    lastReconnectAt,
    lastReason,
    requestResubscribe: requestRealtimeResubscribe,
  }), [isOnline, lastReason, lastReconnectAt, resubscribeKey]);
}

export default useRealtimeReliability;
