import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SETTINGS, isWellTransFailureRetryable, subscribeWellTransLogs,
  subscribeWellTransManifest, subscribeWellTransSettings, subscribeWellTransWorker,
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
const REQUIRED_WORKER_VERSION = '2.6.0';

export const useWellTransSync = (trips = [], serviceDate = '') => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [logs, setLogs] = useState([]);
  const [worker, setWorker] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => subscribeWellTransSettings(value => { setSettings(value); setLoading(false); }, () => setLoading(false)), []);
  useEffect(() => subscribeWellTransLogs(serviceDate, setLogs, () => setLogs([])), [serviceDate]);
  useEffect(() => subscribeWellTransWorker(setWorker, () => setWorker(null)), []);
  useEffect(() =>
    subscribeWellTransManifest(serviceDate, setManifest, () => setManifest(null)), [serviceDate]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const scopedLogs = useMemo(() => logs.filter(log => log.serviceDate === serviceDate), [logs, serviceDate]);
  const dateTrips = useMemo(() => trips.filter(trip =>
    serviceDate && normalizeServiceDate(trip) === serviceDate), [trips, serviceDate]);
  const completedTrips = useMemo(() => dateTrips.filter(trip => {
    const lifecycle = [
      trip.status, trip.operationalStatus, trip.lifecycleStatus, trip.lifecycleStep,
    ].map(value => String(value || '').toLowerCase().trim()).join(' ');
    if (/cancell?ed/.test(lifecycle)) return false;
    const s = String(trip.status || '').toLowerCase().trim();
    return s === 'completed' || s === 'complete' || s === 'done' || s.includes('completed') || s.includes('complete') || trip.completedAt;
  }), [dateTrips]);
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

  const heartbeat = worker?.lastSeenAt?.toDate?.() || (worker?.lastSeenAt ? new Date(worker.lastSeenAt) : null);

  const workerOnline = Boolean(heartbeat && now - heartbeat.getTime() < 45000
    && [
      'online', 'connecting', 'waiting_for_login', 'date_selection_required',
      'processing', 'calibrated', 'review_ready', 'reconciliation_blocked', 'review_error',
    ].includes(worker?.state));
  const workerUpgradeRequired = Boolean(workerOnline
    && !isWorkerVersionAtLeast(worker?.version, REQUIRED_WORKER_VERSION));
  const workerCalibrated = Boolean(workerOnline
    && !workerUpgradeRequired
    && ['calibrated', 'review_ready', 'reconciliation_blocked'].includes(worker?.state)
    && worker?.selectedDate);
  const workerStandby = Boolean(heartbeat && now - heartbeat.getTime() < 45000 && worker?.state === 'standby');

  const currentLogs = useMemo(() => [...latestByTrip.values()], [latestByTrip]);
  const successfulCount = useMemo(() => currentLogs.filter(log => log.status === 'completed').length, [currentLogs]);
  const failedCount = useMemo(() => currentLogs.filter(log => log.status === 'failed').length, [currentLogs]);
  const coverage = useMemo(
    () => buildWellTransCoverage(completedTrips, latestByTrip),
    [completedTrips, latestByTrip],
  );
  const healthScore = coverage.coveragePercent;

  return {
    settings, logs: scopedLogs, worker, manifest, coverage, workerOnline, workerCalibrated,
    workerUpgradeRequired, requiredWorkerVersion: REQUIRED_WORKER_VERSION,
    workerStandby, loading, dateTrips, completedTrips, readyTrips, latestByTrip,
    healthScore, successfulCount, failedCount,
  };
};
