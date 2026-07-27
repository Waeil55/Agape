import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS, subscribeWellTransLogs, subscribeWellTransSettings, subscribeWellTransWorker } from '../services/welltransService';
import { validateTripForWellTrans } from '../utils/welltransMapping';

export const useWellTransSync = (trips = []) => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [logs, setLogs] = useState([]);
  const [worker, setWorker] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => subscribeWellTransSettings(value => { setSettings(value); setLoading(false); }, () => setLoading(false)), []);
  useEffect(() => subscribeWellTransLogs(setLogs, () => {}), []);
  useEffect(() => subscribeWellTransWorker(setWorker, () => setWorker(null)), []);
  const completedTrips = useMemo(() => trips.filter(trip => ['completed', 'complete'].includes(String(trip.status || '').toLowerCase()) || trip.completedAt), [trips]);
  const latestByTrip = useMemo(() => {
    const map = new Map();
    logs.forEach(log => { if (!map.has(log.tripId)) map.set(log.tripId, log); });
    return map;
  }, [logs]);
  const readyTrips = useMemo(() => completedTrips.filter(trip => validateTripForWellTrans(trip).valid && latestByTrip.get(trip.id)?.status !== 'completed'), [completedTrips, latestByTrip]);
  const heartbeat = worker?.lastSeenAt?.toDate?.() || (worker?.lastSeenAt ? new Date(worker.lastSeenAt) : null);
  const workerOnline = Boolean(heartbeat && Date.now() - heartbeat.getTime() < 45000 && worker?.state === 'online');
  const workerStandby = Boolean(heartbeat && Date.now() - heartbeat.getTime() < 45000 && worker?.state === 'standby');
  return { settings, logs, worker, workerOnline, workerStandby, loading, completedTrips, readyTrips, latestByTrip };
};
