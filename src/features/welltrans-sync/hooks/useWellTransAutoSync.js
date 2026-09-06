import { useCallback, useEffect, useRef, useState } from 'react';
import { categorizeFailure, queueWellTransSync } from '../services/welltransService';

const AUTO_QUEUE_DELAY_MS = 3000;

const isWorkerReady = (worker, syncDate) => {
  if (!worker) return false;
  const heartbeat = worker?.lastSeenAt?.toDate?.() || (worker?.lastSeenAt ? new Date(worker.lastSeenAt) : null);
  if (!heartbeat) return false;
  const state = worker?.state;
  return ['online', 'calibrated', 'review_ready', 'idle', 'standby'].includes(state)
    && worker?.selectedDate === syncDate;
};

export const useWellTransAutoSync = ({
  settings,
  worker,
  readyTrips,
  retryableFailed,
  retryCategories,
  syncDate,
  busy,
  workerDateMatches,
}) => {
  const [autoLog, setAutoLog] = useState([]);
  const lastAutoQueueRef = useRef(0);
  const lastAutoRetryRef = useRef(0);
  const runningRef = useRef(false);

  const logEntry = useCallback((msg) => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = { ts, msg, id: Date.now() + Math.random() };
    queueMicrotask(() => setAutoLog(prev => [...prev.slice(-49), entry]));
  }, []);

  // Auto-queue ready trips when worker is ready
  useEffect(() => {
    if (!settings.autoQueue || !settings.enabled || busy || runningRef.current) return;
    if (!workerDateMatches || !syncDate) return;

    const now = Date.now();
    if (now - lastAutoQueueRef.current < AUTO_QUEUE_DELAY_MS) return;

    if (isWorkerReady(worker, syncDate) && readyTrips.length > 0) {
      lastAutoQueueRef.current = now;
      runningRef.current = true;
      logEntry(`Auto-queueing ${readyTrips.length} ready trip(s)...`);
      queueWellTransSync(readyTrips.map(t => t.id), 'queue', syncDate)
        .then(() => logEntry('Auto-queue submitted successfully.'))
        .catch(err => logEntry(`Auto-queue failed: ${err?.message || err}`))
        .finally(() => { runningRef.current = false; });
    }
  }, [settings.autoQueue, settings.enabled, busy, worker, readyTrips, syncDate, workerDateMatches, logEntry]);

  // Auto-retry failed trips
  useEffect(() => {
    if (!settings.autoRetryEnabled || !settings.enabled || busy || runningRef.current) return;
    if (!workerDateMatches || !syncDate) return;

    const now = Date.now();
    const retryDelay = Math.max(10000, Number(settings.autoRetryDelayMs) || 30000);
    if (now - lastAutoRetryRef.current < retryDelay) return;

    const eligibleRetries = retryableFailed.filter(log => retryCategories?.[categorizeFailure(log)] === true);
    if (isWorkerReady(worker, syncDate) && eligibleRetries.length > 0) {
      lastAutoRetryRef.current = now;
      runningRef.current = true;
      logEntry(`Auto-retrying ${eligibleRetries.length} failed trip(s) allowed by the active rules...`);
      queueWellTransSync(eligibleRetries.map(l => l.tripId), 'retry', syncDate)
        .then(() => logEntry('Auto-retry submitted successfully.'))
        .catch(err => logEntry(`Auto-retry failed: ${err?.message || err}`))
        .finally(() => { runningRef.current = false; });
    }
  }, [
    settings.autoRetryDelayMs, settings.autoRetryEnabled, settings.enabled, busy, worker,
    retryableFailed, retryCategories, syncDate, workerDateMatches, logEntry,
  ]);

  return { autoLog, clearAutoLog: () => setAutoLog([]) };
};
