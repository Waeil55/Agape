import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS, subscribeWellTransLogs, subscribeWellTransSettings } from '../services/welltransService';
import { validateTripForWellTrans } from '../utils/welltransMapping';

export const useWellTransSync = (trips = []) => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => subscribeWellTransSettings(value => { setSettings(value); setLoading(false); }, () => setLoading(false)), []);
  useEffect(() => subscribeWellTransLogs(setLogs, () => {}), []);
  const completedTrips = useMemo(() => trips.filter(trip => ['completed', 'complete'].includes(String(trip.status || '').toLowerCase()) || trip.completedAt), [trips]);
  const latestByTrip = useMemo(() => {
    const map = new Map();
    logs.forEach(log => { if (!map.has(log.tripId)) map.set(log.tripId, log); });
    return map;
  }, [logs]);
  const readyTrips = useMemo(() => completedTrips.filter(trip => validateTripForWellTrans(trip).valid && latestByTrip.get(trip.id)?.status !== 'completed'), [completedTrips, latestByTrip]);
  return { settings, logs, loading, completedTrips, readyTrips, latestByTrip };
};

