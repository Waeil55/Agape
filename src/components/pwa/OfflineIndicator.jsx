import React, { useState, useEffect, useRef } from 'react';
import { WifiOff, RefreshCw, Check } from 'lucide-react';

const OfflineIndicator = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBanner, setShowBanner] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    const clearHideTimer = () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        setShowBanner(true);
        clearHideTimer();
        hideTimerRef.current = setTimeout(() => {
          setShowBanner(false);
          setWasOffline(false);
        }, 3000);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
      setShowBanner(true);
      clearHideTimer();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!navigator.onLine) {
      setWasOffline(true);
      setShowBanner(true);
    }

    return () => {
      clearHideTimer();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline]);

  if (!showBanner) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9997] pointer-events-none"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
      role="status"
      aria-live="polite"
    >
      <div
        className={`mx-2 sm:mx-4 rounded-xl shadow-lg border px-4 py-3 flex items-center gap-3 pointer-events-auto ${
          isOnline
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}
      >
        <div
          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
            isOnline ? 'bg-emerald-100' : 'bg-rose-100'
          }`}
        >
          {isOnline ? (
            <Check size={16} className="text-emerald-600" />
          ) : (
            <WifiOff size={16} className="text-rose-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            {isOnline ? 'Back Online' : 'You\'re Offline'}
          </p>
          <p className="text-xs opacity-80 mt-0.5">
            {isOnline
              ? 'Connection restored. Syncing data...'
              : 'Working offline. Data will sync when connected.'}
          </p>
        </div>
        {isOnline && (
          <RefreshCw size={14} className="text-emerald-600 animate-spin shrink-0" />
        )}
      </div>
    </div>
  );
};

export default OfflineIndicator;
