// Agape Care — PWA Real-Time Reliability Layer (Task 7)
import { useEffect, useState, useCallback } from 'react';
import { enableNetwork, disableNetwork } from 'firebase/firestore';
import { db } from '../config/firebase';

export const useRealtimeReliability = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [resubscribeKey, setResubscribeKey] = useState(0);

  const reconnect = useCallback(async () => {
    try {
      await enableNetwork(db);
      setResubscribeKey(prev => prev + 1);
      console.log('[RealtimeReliability] Firestore reconnected.');
    } catch (err) {
      console.error('[RealtimeReliability] Reconnect failed:', err);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await disableNetwork(db);
      console.log('[RealtimeReliability] Firestore disconnected.');
    } catch (err) {
      console.error('[RealtimeReliability] Disconnect failed:', err);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); reconnect(); };
    const handleOffline = () => { setIsOnline(false); disconnect(); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [reconnect, disconnect]);

  return { isOnline, resubscribeKey };
};
