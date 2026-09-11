import { useState, useEffect, useRef } from 'react';
import { WifiOff, RefreshCw, Check } from 'lucide-react';
import { syncQueueProcessor } from '../../services/syncQueueProcessor';

const OfflineIndicator = ({ compact = false }) => {
  const [isOnline, setIsOnline] = useState(() => (
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  ));
  const [showBanner, setShowBanner] = useState(false);
  const [recentlyRestored, setRecentlyRestored] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ state: 'ready', pending: 0, deadLetter: 0 });
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

  useEffect(() => {
    let cancelled = false;
    const refreshSyncStatus = async () => {
      const next = await syncQueueProcessor.getStatus().catch(() => null);
      if (cancelled || !next || next.state === 'blocked') return;
      setSyncStatus((previous) => (
        previous.state === next.state
          && previous.pending === next.pending
          && previous.deadLetter === next.deadLetter
          ? previous
          : { state: next.state, pending: next.pending, deadLetter: next.deadLetter }
      ));
    };
    void refreshSyncStatus();
    // Queue writes dispatch this event after their IndexedDB transaction
    // commits. Keep only a slow fallback poll so status UI never becomes a
    // constant source of IndexedDB scans and main-thread work.
    const intervalId = window.setInterval(refreshSyncStatus, 30000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshSyncStatus();
    };
    window.addEventListener('online', refreshSyncStatus);
    window.addEventListener('agape:sync-queue-changed', refreshSyncStatus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('online', refreshSyncStatus);
      window.removeEventListener('agape:sync-queue-changed', refreshSyncStatus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const hasSyncFailure = syncStatus.deadLetter > 0;
  const hasPendingWrites = syncStatus.pending > 0;

  if (compact) {
    const label = !isOnline
      ? 'Offline'
      : hasSyncFailure
        ? 'Sync issue'
        : hasPendingWrites
          ? `Saving ${syncStatus.pending}`
          : recentlyRestored ? 'Back online' : 'Synced';
    return (
      <span
        className={`inline-flex min-h-5 shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
          isOnline && !hasSyncFailure ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
        }`}
        role="status"
        aria-live="polite"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${isOnline && !hasSyncFailure ? 'bg-emerald-500' : 'bg-rose-500'}`} aria-hidden="true" />
        {label}
      </span>
    );
  }

  if (!showBanner && !hasPendingWrites && !hasSyncFailure) return null;

  const bannerIsHealthy = isOnline && !hasSyncFailure;
  const bannerTitle = !isOnline
    ? 'You\'re Offline'
    : hasSyncFailure
      ? 'Sync Needs Attention'
      : hasPendingWrites ? 'Saving Changes' : 'Back Online';
  const bannerMessage = !isOnline
    ? 'Changes are protected on this device and will sync when connected.'
    : hasSyncFailure
      ? `${syncStatus.deadLetter} change${syncStatus.deadLetter === 1 ? '' : 's'} could not be accepted by the server. Retry or contact an administrator.`
      : hasPendingWrites
        ? `${syncStatus.pending} protected change${syncStatus.pending === 1 ? '' : 's'} sending to all devices.`
        : 'Connection restored. Changes are synchronized.';

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
          bannerIsHealthy
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}
      >
        <div
          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
            bannerIsHealthy ? 'bg-emerald-100' : 'bg-rose-100'
          }`}
        >
          {bannerIsHealthy ? (
            <Check size={16} className="text-emerald-600" />
          ) : (
            <WifiOff size={16} className="text-rose-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            {bannerTitle}
          </p>
          <p className="text-xs opacity-80 mt-0.5">
            {bannerMessage}
          </p>
        </div>
        {isOnline && hasPendingWrites && !hasSyncFailure && (
          <RefreshCw size={14} className="text-emerald-600 animate-spin shrink-0" />
        )}
      </div>
    </div>
  );
};

export default OfflineIndicator;
