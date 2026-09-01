import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db, enableNetwork } from '../config/firebase';

const REALTIME_RESUBSCRIBE_EVENT = 'agape:realtime-resubscribe';

function requestRealtimeResubscribe(reason = 'manual', detail = {}) {
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
    const handleManualResubscribe = (event) => {
      bumpOnly(event.detail?.reason || 'manual');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener(REALTIME_RESUBSCRIBE_EVENT, handleManualResubscribe);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(REALTIME_RESUBSCRIBE_EVENT, handleManualResubscribe);
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
