import { useCallback, useEffect, useRef, useState } from 'react';
import { categorizeFailure, queueWellTransSync } from '../services/welltransService';

const WORKER_OFFLINE_THRESHOLD_MS = 60000;
const AUTO_START_INTERVAL_MS = 30000;
const AUTO_QUEUE_DELAY_MS = 3000;

const isWorkerOffline = (worker, now) => {
  if (!worker) return true;
  const heartbeat = worker?.lastSeenAt?.toDate?.() || (worker?.lastSeenAt ? new Date(worker.lastSeenAt) : null);
  const state = worker?.state;
  return !heartbeat || (now - heartbeat.getTime() > WORKER_OFFLINE_THRESHOLD_MS) || state === 'error' || state === 'offline';
};

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
  const lastAutoStartRef = useRef(0);
  const lastAutoQueueRef = useRef(0);
  const lastAutoRetryRef = useRef(0);
  const autoStartAttemptRef = useRef(0);
  const runningRef = useRef(false);

  const logEntry = useCallback((msg) => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = { ts, msg, id: Date.now() + Math.random() };
    queueMicrotask(() => setAutoLog(prev => [...prev.slice(-49), entry]));
  }, []);

  // Auto-start worker when offline
  useEffect(() => {
    if (!settings.autoStart || !settings.enabled) return;

    const interval = setInterval(() => {
      const now = Date.now();
      if (isWorkerOffline(worker, now)) {
        if (now - lastAutoStartRef.current < AUTO_START_INTERVAL_MS) return;
        lastAutoStartRef.current = now;
        autoStartAttemptRef.current += 1;
        logEntry(`Auto-starting worker (attempt ${autoStartAttemptRef.current})...`);
        try {
          window.location.href = 'agape-welltrans://start';
          logEntry('Worker start command sent.');
        } catch {
          logEntry('Failed to send worker start command.');
        }
      } else {
        autoStartAttemptRef.current = 0;
      }
    }, AUTO_START_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [settings.autoStart, settings.enabled, worker, logEntry]);

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

  // Self-heal: detect dead worker and trigger restart
  useEffect(() => {
    if (!settings.autoStart || !settings.enabled) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const heartbeat = worker?.lastSeenAt?.toDate?.() || (worker?.lastSeenAt ? new Date(worker.lastSeenAt) : null);
      const deadFor = heartbeat ? now - heartbeat.getTime() : Infinity;

      if (deadFor > WORKER_OFFLINE_THRESHOLD_MS * 2 && autoStartAttemptRef.current === 0) {
        logEntry('Worker appears dead. Triggering self-heal restart...');
        autoStartAttemptRef.current = 1;
        lastAutoStartRef.current = now;
        try {
          window.location.href = 'agape-welltrans://start';
          logEntry('Self-heal restart command sent.');
        } catch {
          logEntry('Self-heal restart failed.');
        }
      }
    }, WORKER_OFFLINE_THRESHOLD_MS);

    return () => clearInterval(interval);
  }, [settings.autoStart, settings.enabled, worker, logEntry]);

  return { autoLog, clearAutoLog: () => setAutoLog([]) };
};
