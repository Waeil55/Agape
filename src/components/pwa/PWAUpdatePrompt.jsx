import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, X, ArrowUp } from 'lucide-react';

const PWAUpdatePrompt = () => {
  const [showUpdate, setShowUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const handler = () => setShowUpdate(true);
    window.onNewVersionAvailable = handler;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) {
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  setShowUpdate(true);
                }
              });
            }
          });
        }
      });
    }

    return () => {
      window.onNewVersionAvailable = null;
    };
  }, []);

  const handleUpdate = useCallback(async () => {
    setIsUpdating(true);
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err) {
      console.error('[PWA] Update failed:', err);
      setIsUpdating(false);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setShowUpdate(false);
  }, []);

  if (!showUpdate) return null;

  return (
    <div className="fixed top-[calc(1rem+env(safe-area-inset-top,0px))] left-4 right-4 z-[9998] sm:left-auto sm:right-4 sm:w-96">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-slide-down">
        <div className="flex items-center gap-3 p-4">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <ArrowUp size={18} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900">Update Available</p>
            <p className="text-xs text-slate-500 mt-0.5">A new version of Agape Care is ready</p>
          </div>
          <button
            onClick={handleDismiss}
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={handleDismiss}
            className="flex-1 h-10 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50 active:scale-95 transition-all"
          >
            Later
          </button>
          <button
            onClick={handleUpdate}
            disabled={isUpdating}
            className="flex-1 h-10 rounded-xl bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {isUpdating ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <RefreshCw size={12} />
                Update Now
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PWAUpdatePrompt;
