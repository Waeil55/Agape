import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SETTINGS, isWellTransFailureRetryable, subscribeWellTransLogs,
  subscribeWellTransManifest, subscribeWellTransSettings, subscribeWellTransWorker,
  subscribeWellTransCanary, subscribeWellTransOperations, subscribeWellTransWorkers,
} from '../services/welltransService';
import {
  buildWellTransCoverage, normalizeServiceDate, validateTripForWellTrans,
} from '../utils/welltransMapping';
import { isWorkerVersionAtLeast } from '../utils/welltransVersion';

const logMillis = log => log?.updatedAt?.toMillis?.()
  || log?.createdAt?.toMillis?.()
  || log?.updatedAt?.toDate?.()?.getTime?.()
  || log?.createdAt?.toDate?.()?.getTime?.()
  || 0;
const REQUIRED_WORKER_VERSION = '4.0.2';

export const useWellTransSync = (trips = [], serviceDate = '', driverScopeId = '') => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [logs, setLogs] = useState([]);
  const [primaryWorker, setPrimaryWorker] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [operations, setOperations] = useState(null);
  const [canary, setCanary] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => subscribeWellTransSettings(value => { setSettings(value); setLoading(false); }, () => setLoading(false)), []);
  useEffect(() => subscribeWellTransLogs(serviceDate, setLogs, () => setLogs([])), [serviceDate]);
  useEffect(() => subscribeWellTransWorker(setPrimaryWorker, () => setPrimaryWorker(null)), []);
  useEffect(() => subscribeWellTransWorkers(setWorkers, () => setWorkers([])), []);
  useEffect(() => subscribeWellTransOperations(setOperations, () => setOperations(null)), []);
  useEffect(() => subscribeWellTransCanary(setCanary, () => setCanary(null)), []);
  useEffect(() =>
    subscribeWellTransManifest(serviceDate, setManifest, () => setManifest(null)), [serviceDate]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const scopedLogs = useMemo(() => logs.filter(log => log.serviceDate === serviceDate), [logs, serviceDate]);
  const dateTrips = useMemo(() => trips.filter(trip =>
    serviceDate && normalizeServiceDate(trip) === serviceDate), [trips, serviceDate]);
  const allCompletedTrips = useMemo(() => dateTrips.filter(trip => {
    const lifecycle = [
      trip.status, trip.operationalStatus, trip.lifecycleStatus, trip.lifecycleStep,
    ].map(value => String(value || '').toLowerCase().trim()).join(' ');
    if (/cancell?ed/.test(lifecycle)) return false;
    const s = String(trip.status || '').toLowerCase().trim();
    return s === 'completed' || s === 'complete' || s === 'done' || s.includes('completed') || s.includes('complete') || trip.completedAt;
  }), [dateTrips]);
  const completedTrips = useMemo(() => driverScopeId
    ? allCompletedTrips.filter(trip => String(trip.driverId || '') === String(driverScopeId))
    : allCompletedTrips,
  [allCompletedTrips, driverScopeId]);
  const latestByTrip = useMemo(() => {
    const map = new Map();
    scopedLogs.forEach(log => {
      const current = map.get(log.tripId);
      if (!current || logMillis(log) > logMillis(current)) map.set(log.tripId, log);
    });
    return map;
  }, [scopedLogs]);
  const readyTrips = useMemo(() => completedTrips.filter(trip =>
    validateTripForWellTrans(trip).valid
      && !['pending', 'processing', 'completed', 'awaiting_review'].includes(latestByTrip.get(trip.id)?.status)
      && (latestByTrip.get(trip.id)?.status !== 'failed'
        || isWellTransFailureRetryable(latestByTrip.get(trip.id)))),
  [completedTrips, latestByTrip]);

  const workerFleet = useMemo(() => workers.map(item => {
    const lastSeenMs = item.lastSeenAt?.toMillis?.()
      || item.lastSeenAt?.toDate?.()?.getTime?.()
      || (item.lastSeenAt ? new Date(item.lastSeenAt).getTime() : 0)
      || 0;
    const ageMs = lastSeenMs ? Math.max(0, now - lastSeenMs) : Number.POSITIVE_INFINITY;
    return {
      ...item,
      lastSeenMs,
      ageMs,
      online: ageMs < 45_000,
      standby: ['standby', 'lease_standby'].includes(item.state),
    };
  }), [now, workers]);
  const visibleWorkers = useMemo(() => {
    const newestByDevice = new Map();
    workerFleet.forEach(item => {
      const device = String(item.workerId || item.deviceId || item.id || '').trim().toLowerCase();
      const current = newestByDevice.get(device);
      if (!current || item.lastSeenMs > current.lastSeenMs) newestByDevice.set(device, item);
    });
    return [...newestByDevice.values()]
      .filter(item => item.online)
      .sort((left, right) => right.lastSeenMs - left.lastSeenMs);
  }, [workerFleet]);
  const primaryLastSeenMs = primaryWorker?.lastSeenAt?.toMillis?.()
    || primaryWorker?.lastSeenAt?.toDate?.()?.getTime?.()
    || (primaryWorker?.lastSeenAt ? new Date(primaryWorker.lastSeenAt).getTime() : 0)
    || 0;
  const freshestDeviceWorker = visibleWorkers[0] || null;
  const worker = freshestDeviceWorker && freshestDeviceWorker.lastSeenMs >= primaryLastSeenMs
    ? freshestDeviceWorker
    : primaryWorker;
  const heartbeatMs = worker?.lastSeenAt?.toMillis?.()
    || worker?.lastSeenAt?.toDate?.()?.getTime?.()
    || (worker?.lastSeenAt ? new Date(worker.lastSeenAt).getTime() : 0)
    || 0;

  const workerOnline = Boolean(heartbeatMs && now - heartbeatMs < 45000
    && [
      'online', 'connecting', 'waiting_for_login', 'date_selection_required',
      'processing', 'staging', 'indexing_schedule', 'verifying_applied_records',
      'verifying_staged_records', 'reconciling_authoritative_trips', 'inspection',
      'running_portal_canary', 'recovering_clean_session', 'restarting_safe_session',
      'calibrated', 'review_ready', 'review_batch_ready',
      'review_ready_verified', 'review_batch_verified', 'paused_review_ready',
      'batch_apply_confirmed', 'reconciliation_blocked',
      'reconciliation_blocked_do_not_apply', 'review_error',
    ].includes(worker?.state));
  const workerUpgradeRequired = Boolean(workerOnline
    && !isWorkerVersionAtLeast(worker?.version, REQUIRED_WORKER_VERSION));
  const workerCalibrated = Boolean(workerOnline
    && !workerUpgradeRequired
    && [
      'calibrated', 'staging', 'verifying_applied_records',
      'running_portal_canary',
      'review_ready', 'review_batch_ready', 'review_ready_verified',
      'review_batch_verified', 'paused_review_ready',
      'batch_apply_confirmed', 'reconciliation_blocked',
    ].includes(worker?.state)
    && worker?.selectedDate);
  const workerStandby = Boolean(heartbeatMs && now - heartbeatMs < 45000
    && ['standby', 'lease_standby'].includes(worker?.state));

  const scopedTripIds = useMemo(
    () => new Set(completedTrips.map(trip => String(trip.id))),
    [completedTrips],
  );
  const currentLogs = useMemo(() => [...latestByTrip.values()]
    .filter(log => scopedTripIds.has(String(log.tripId))), [latestByTrip, scopedTripIds]);
  const successfulCount = useMemo(() => currentLogs.filter(log =>
    log.status === 'completed' && log.portalVerification?.verified === true).length, [currentLogs]);
  const failedCount = useMemo(() => currentLogs.filter(log => log.status === 'failed').length, [currentLogs]);
  const coverage = useMemo(
    () => buildWellTransCoverage(completedTrips, latestByTrip),
    [completedTrips, latestByTrip],
  );
  const healthScore = coverage.coveragePercent;
  const activeWorkers = visibleWorkers;
  const standbyWorkers = activeWorkers.filter(item => item.standby);

  return {
    settings, logs: scopedLogs, worker, workers: visibleWorkers, activeWorkers, standbyWorkers, operations, canary,
    manifest, coverage, workerOnline, workerCalibrated,
    workerUpgradeRequired, requiredWorkerVersion: REQUIRED_WORKER_VERSION,
    workerStandby, loading, dateTrips, allCompletedTrips, completedTrips, readyTrips, latestByTrip,
    healthScore, successfulCount, failedCount,
  };
};
