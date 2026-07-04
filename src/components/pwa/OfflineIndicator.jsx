import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, Check } from 'lucide-react';

const OfflineIndicator = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBanner, setShowBanner] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        setShowBanner(true);
        setTimeout(() => {
          setShowBanner(false);
          setWasOffline(false);
        }, 3000);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
      setShowBanner(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!navigator.onLine) {
      setShowBanner(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline]);

  if (!showBanner) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[9997] transition-all duration-300 ${
        isOnline ? 'translate-y-0' : 'translate-y-0'
      }`}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div
        className={`mx-2 mt-2 sm:mx-4 sm:mt-3 rounded-2xl shadow-lg border px-4 py-3 flex items-center gap-3 ${
          isOnline
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}
      >
        <div
          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
            isOnline ? 'bg-green-100' : 'bg-amber-100'
          }`}
        >
          {isOnline ? (
            <Check size={16} className="text-green-600" />
          ) : (
            <WifiOff size={16} className="text-amber-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">
            {isOnline ? 'Back Online' : 'You\'re Offline'}
          </p>
          <p className="text-xs opacity-80 mt-0.5">
            {isOnline
              ? 'Connection restored. Syncing data...'
              : 'Working offline. Data will sync when connected.'}
          </p>
        </div>
        {isOnline && (
          <RefreshCw size={14} className="text-green-600 animate-spin shrink-0" />
        )}
      </div>
    </div>
  );
};

export default OfflineIndicator;
