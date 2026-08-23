import React, { useState, useEffect, useRef } from 'react';
import { WifiOff, RefreshCw, Check } from 'lucide-react';

const OfflineIndicator = ({ compact = false }) => {
  const [isOnline, setIsOnline] = useState(() => (
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  ));
  const [showBanner, setShowBanner] = useState(false);
  const [recentlyRestored, setRecentlyRestored] = useState(false);
  const wasOfflineRef = useRef(!isOnline);
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
      if (wasOfflineRef.current) {
        setRecentlyRestored(true);
        setShowBanner(true);
        clearHideTimer();
        hideTimerRef.current = setTimeout(() => {
          setShowBanner(false);
          setRecentlyRestored(false);
          wasOfflineRef.current = false;
        }, 3000);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setRecentlyRestored(false);
      wasOfflineRef.current = true;
      setShowBanner(true);
      clearHideTimer();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!navigator.onLine) {
      wasOfflineRef.current = true;
      setShowBanner(true);
    }

    return () => {
      clearHideTimer();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (compact) {
    const label = !isOnline ? 'Offline' : recentlyRestored ? 'Back online' : 'Online';
    return (
      <span
        className={`inline-flex min-h-5 shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
          isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
        }`}
        role="status"
        aria-live="polite"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} aria-hidden="true" />
        {label}
      </span>
    );
  }

  if (!showBanner) return null;

  // In-flow banner (not fixed): it pushes page content down instead of
  // covering the pinned trip header (client name / trip id).
  return (
    <div
      className="hidden shrink-0 z-[9997] md:block"
      role="status"
      aria-live="polite"
    >
      <div
        className={`mx-2 mt-2 sm:mx-4 sm:mt-3 rounded-xl shadow-lg border px-4 py-3 flex items-center gap-3 ${
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
