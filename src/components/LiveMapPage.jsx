import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Compass,
  Crosshair,
  Gauge,
  Layers,
  Loader2,
  Map,
  MapPin,
  Navigation,
  Phone,
  Radio,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  Target,
  Truck,
  Users,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import { GOOGLE_MAPS_API_KEY, db, collection, query, orderBy, limit as firestoreLimit, getDocs } from '../config/firebase';
import AIInsightsBanner from './AIInsightsBanner';
import { aiOptimizeFleet } from '../config/ai';
import { getDistanceMiles, hasGoogleMapsConfigured } from '../config/maps';
import { timeToMinutes, tripMatchesCalendarDay } from '../utils/tripDate';
import {
  formatMovementState,
  formatTelemetryDuration,
  getDriverTelemetryForDate,
  getLatestDriverTelemetry,
} from '../utils/driverTelemetry';

const ACTIVE_STATUSES = new Set([
  'Assigned',
  'In Mission',
  'In Progress',
  'Navigating Pickup',
  'En Route',
  'At Pickup',
  'In Transit',
  'Navigating Dropoff',
  'At Dropoff',
  'Arrived',
]);

const COMPLETE_STATUSES = new Set(['Completed', 'Cancelled', 'No Show']);

const DRIVER_COLORS = ['blue', 'green', 'orange', 'purple', 'red', 'yellow', 'gray', 'brown'];

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getDriverPoint(driver) {
  const lat = Number(driver?.latitude ?? driver?.lat);
  const lng = Number(driver?.longitude ?? driver?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function formatMiles(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unknown';
  if (value < 0.1) return '<0.1 mi';
  return `${value.toFixed(value < 10 ? 1 : 0)} mi`;
}

function estimateMinutes(distanceMiles) {
  if (typeof distanceMiles !== 'number' || !Number.isFinite(distanceMiles)) return null;
  const urbanAverageMph = distanceMiles < 5 ? 22 : 30;
  return Math.max(2, Math.round((distanceMiles / urbanAverageMph) * 60));
}

function formatEta(minutes) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return 'Unknown';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function formatAge(iso) {
  if (!iso) return 'No live ping';
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return 'No live ping';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function isFreshLocation(driver) {
  const timestamp = new Date(driver?.lastLocationUpdate || driver?.lastUpdate || '').getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp < 10 * 60 * 1000;
}

function tripDriverEmail(trip, drivers) {
  return normalizeEmail(trip?.driverEmail || drivers.find(driver => driver.id === trip?.driverId)?.email);
}

function isTripForDriver(trip, driver, drivers) {
  if (!trip || !driver) return false;
  return trip.driverId === driver.id || tripDriverEmail(trip, drivers) === normalizeEmail(driver.email);
}

function sortTripsByTime(trips) {
  return [...trips].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
}

function getTripPhase(trip) {
  if (!trip) return { label: 'No active trip', color: 'slate', destination: null };
  if (['Assigned', 'In Mission', 'In Progress', 'Navigating Pickup', 'En Route'].includes(trip.status)) {
    return { label: 'Going to pickup', color: 'blue', destination: trip.pickup };
  }
  if (['At Pickup', 'In Transit', 'Navigating Dropoff', 'At Dropoff', 'Arrived'].includes(trip.status)) {
    return { label: 'Going to dropoff', color: 'emerald', destination: trip.dropoff };
  }
  return { label: trip.status || 'Active', color: 'amber', destination: trip.pickup || trip.dropoff };
}

function getPhaseIconClass(color) {
  const classes = {
    blue: 'text-blue-600',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    slate: 'text-slate-500',
  };
  return classes[color] || classes.slate;
}

function openDirections(origin, destination) {
  if (!destination) return;
  const params = new URLSearchParams({
    api: '1',
    destination,
    travelmode: 'driving',
  });
  if (origin) params.set('origin', origin);
  window.open(`https://www.google.com/maps/dir/?${params.toString()}`, '_blank', 'noopener,noreferrer');
}

function buildStaticMapUrl(drivers, selectedDriver, selectedTrip, trailPoints = []) {
  if (!hasGoogleMapsConfigured()) return null;

  const driverMarkers = drivers
    .map((driver, index) => ({ driver, point: getDriverPoint(driver), index }))
    .filter(item => item.point)
    .map(({ driver, point, index }) => {
      const color = driver.id === selectedDriver?.id ? 'red' : DRIVER_COLORS[index % DRIVER_COLORS.length];
      const label = String(driver?.name || 'D').trim().charAt(0).toUpperCase() || 'D';
      return `markers=color:${color}%7Clabel:${encodeURIComponent(label)}%7C${point.lat},${point.lng}`;
    });

  const tripMarkers = [];
  if (selectedTrip?.pickup) {
    tripMarkers.push(`markers=color:green%7Clabel:P%7C${encodeURIComponent(selectedTrip.pickup)}`);
  }
  if (selectedTrip?.dropoff) {
    tripMarkers.push(`markers=color:orange%7Clabel:D%7C${encodeURIComponent(selectedTrip.dropoff)}`);
  }

  const markers = [...driverMarkers, ...tripMarkers];

  // Add driver breadcrumb trail as polyline
  let trailPath = '';
  if (trailPoints.length >= 2) {
    const pathCoords = trailPoints.map((p) => `${p.lat},${p.lng}`).join('|');
    trailPath = `&path=color:0x4285F4|weight:3|fillcolor:0x4285F420|${pathCoords}`;
  }

  if (markers.length === 0 && !trailPath) return null;

  const center = selectedDriver ? getDriverPoint(selectedDriver) : null;
  const params = new URLSearchParams({
    size: '1280x720',
    scale: '2',
    maptype: 'roadmap',
    key: GOOGLE_MAPS_API_KEY(),
  });
  if (center) {
    params.set('center', `${center.lat},${center.lng}`);
    params.set('zoom', selectedTrip ? '12' : '11');
  }

  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}&${markers.join('&')}${trailPath}`;
}

function buildRideShareCandidates(trips) {
  const openTrips = sortTripsByTime(trips.filter(t => !COMPLETE_STATUSES.has(t.status)));
  const pairs = [];

  for (let i = 0; i < openTrips.length; i += 1) {
    for (let j = i + 1; j < openTrips.length; j += 1) {
      const a = openTrips[i];
      const b = openTrips[j];
      const aTime = timeToMinutes(a.time);
      const bTime = timeToMinutes(b.time);
      const timeGap = Math.abs(aTime - bTime);
      const samePickupZip = String(a.pickup || '').match(/\b\d{5}\b/)?.[0] === String(b.pickup || '').match(/\b\d{5}\b/)?.[0];
      const sameDropZip = String(a.dropoff || '').match(/\b\d{5}\b/)?.[0] === String(b.dropoff || '').match(/\b\d{5}\b/)?.[0];
      const sameFacility = String(a.dropoff || '').slice(0, 18).toLowerCase() === String(b.dropoff || '').slice(0, 18).toLowerCase();
      const score = (samePickupZip ? 35 : 0) + (sameDropZip ? 25 : 0) + (sameFacility ? 25 : 0) + Math.max(0, 25 - Math.floor(timeGap / 3));

      if (score >= 35) {
        pairs.push({
          id: `${a.id}-${b.id}`,
          a,
          b,
          score,
          reason: sameFacility ? 'same destination' : samePickupZip ? 'near pickup zone' : 'compatible timing',
          timeGap,
        });
      }
    }
  }

  return pairs.sort((a, b) => b.score - a.score).slice(0, 6);
}

const StatusPill = ({ children, tone = 'slate' }) => {
  const classes = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    slate: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold ${classes[tone] || classes.slate}`}>
      {children}
    </span>
  );
};

const LiveMapPage = ({
  role = 'dispatcher',
  currentUser = '',
  drivers = [],
  trips = [],
  driverTelemetry = [],
  onUpdateDriverLocation,
  assignTripToDriver,
  triggerSmartAssign,
  setManualAssignTrip,
  makeCall,
  sendSMS,
}) => {
  const [selectedDriverId, setSelectedDriverId] = useState(() => drivers[0]?.id || '');
  const [mapError, setMapError] = useState(false);
  const [gpsActive, setGpsActive] = useState(false);
  const [nearestTrips, setNearestTrips] = useState([]);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [lastIntelRefresh, setLastIntelRefresh] = useState(null);
  const [intelRefreshToken, setIntelRefreshToken] = useState(0);
  const [fleetAiResult, setFleetAiResult] = useState(null);
  const [fleetAiLoading, setFleetAiLoading] = useState(false);
  const [driverTrailPoints, setDriverTrailPoints] = useState([]);
  const [trailLoading, setTrailLoading] = useState(false);
  const [showTrail, setShowTrail] = useState(true);

  const runFleetAiAnalysis = useCallback(async () => {
    setFleetAiLoading(true);
    const result = await aiOptimizeFleet(trips, drivers);
    setFleetAiResult(result);
    setFleetAiLoading(false);
  }, [trips, drivers]);

  const watchIdRef = useRef(null);

  const today = todayLocal();
  const selectedDriver = useMemo(
    () => drivers.find(driver => driver.id === selectedDriverId) || drivers[0] || null,
    [drivers, selectedDriverId]
  );

  useEffect(() => {
    if (!selectedDriverId && drivers[0]?.id) setSelectedDriverId(drivers[0].id);
    if (selectedDriverId && drivers.length > 0 && !drivers.some(driver => driver.id === selectedDriverId)) {
      setSelectedDriverId(drivers[0].id);
    }
  }, [drivers, selectedDriverId]);

  // Fetch driver breadcrumb trail when a driver is selected
  useEffect(() => {
    if (!selectedDriver?.id) { setDriverTrailPoints([]); return; }
    let cancelled = false;
    setTrailLoading(true);
    const trailRef = collection(db, 'driver_locations', selectedDriver.id, 'trail');
    const trailQuery = query(trailRef, orderBy('capturedAt', 'desc'), firestoreLimit(60));
    getDocs(trailQuery)
      .then((snap) => {
        if (cancelled) return;
        const points = snap.docs
          .map((d) => ({ lat: Number(d.data().lat), lng: Number(d.data().lng), capturedAt: d.data().capturedAt }))
          .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
          .reverse();
        setDriverTrailPoints(points);
        setTrailLoading(false);
      })
      .catch(() => { if (!cancelled) { setDriverTrailPoints([]); setTrailLoading(false); } });
    return () => { cancelled = true; };
  }, [selectedDriver?.id]);

  const myDriverProfile = useMemo(() => {
    const email = normalizeEmail(currentUser);
    return drivers.find(driver => normalizeEmail(driver.email) === email) || null;
  }, [currentUser, drivers]);

  const todaysTrips = useMemo(
    () => trips.filter(trip => tripMatchesCalendarDay(trip.date, today) || !trip.date),
    [trips, today]
  );

  const driverSummaries = useMemo(() => drivers.map(driver => {
    const driverTrips = todaysTrips.filter(trip => isTripForDriver(trip, driver, drivers));
    const activeTrips = sortTripsByTime(driverTrips.filter(trip => ACTIVE_STATUSES.has(trip.status)));
    const completed = driverTrips.filter(trip => trip.status === 'Completed').length;
    const upcoming = sortTripsByTime(driverTrips.filter(trip => trip.status === 'Assigned' || trip.status === 'In Mission'));
    const currentTrip = activeTrips[0] || null;
    const phase = getTripPhase(currentTrip);
    const point = getDriverPoint(driver);
    const tracking = getDriverTelemetryForDate(driverTelemetry, driver.id, today) || getLatestDriverTelemetry(driverTelemetry, driver.id);
    const fresh = isFreshLocation(driver);
    const movementState = fresh ? (driver?.movementState || tracking?.movementState || driver?.telemetry?.movementState || 'unknown') : 'unknown';
    const dwellMinutes = fresh ? Number(driver?.currentDwellMinutes ?? tracking?.currentDwellMinutes ?? driver?.telemetry?.dwellMinutes ?? 0) : 0;
    const movingMinutes = fresh ? Number(driver?.currentMovingMinutes ?? tracking?.currentMovingMinutes ?? driver?.telemetry?.movingMinutes ?? 0) : 0;
    return {
      driver,
      point,
      activeTrips,
      currentTrip,
      phase,
      completed,
      upcoming,
      totalTrips: driverTrips.length,
      fresh: isFreshLocation(driver),
      lastPing: driver.lastLocationUpdate || driver.lastUpdate,
      tracking,
      movementState,
      dwellMinutes,
      movingMinutes,
    };
  }), [driverTelemetry, drivers, todaysTrips, today]);

  const selectedSummary = driverSummaries.find(summary => summary.driver.id === selectedDriver?.id) || null;
  const selectedTrip = selectedSummary?.currentTrip || selectedSummary?.upcoming?.[0] || null;
  const selectedPoint = selectedDriver ? getDriverPoint(selectedDriver) : null;
  const selectedTracking = selectedSummary?.tracking || null;
  const unassignedTrips = useMemo(
    () => sortTripsByTime(todaysTrips.filter(trip => trip.status === 'Unassigned')),
    [todaysTrips]
  );
  const rideShareCandidates = useMemo(() => buildRideShareCandidates(todaysTrips), [todaysTrips]);

  const fleetStats = useMemo(() => {
    const live = driverSummaries.filter(summary => summary.point).length;
    const fresh = driverSummaries.filter(summary => summary.fresh).length;
    const active = driverSummaries.filter(summary => summary.currentTrip).length;
    const moving = driverSummaries.filter(summary => summary.movementState === 'moving').length;
    const stopped = driverSummaries.filter(summary => summary.movementState === 'stopped').length;
    const complete = todaysTrips.filter(trip => trip.status === 'Completed').length;
    const remaining = todaysTrips.filter(trip => !COMPLETE_STATUSES.has(trip.status)).length;
    return { live, fresh, active, moving, stopped, complete, remaining };
  }, [driverSummaries, todaysTrips]);

  useEffect(() => {
    let cancelled = false;
    async function refreshNearestTrips() {
      if (!selectedPoint) {
        setNearestTrips([]);
        return;
      }
      setDistanceLoading(true);
      const candidates = [
        ...unassignedTrips,
        ...(selectedSummary?.upcoming || []),
      ].filter((trip, index, array) => array.findIndex(item => item.id === trip.id) === index).slice(0, 10);

      const enriched = await Promise.all(candidates.map(async (trip) => {
        let miles = null;
        try {
          miles = await getDistanceMiles(selectedPoint, trip.pickup);
        } catch {
          miles = null;
        }
        return {
          trip,
          miles,
          etaMinutes: estimateMinutes(miles),
        };
      }));

      if (!cancelled) {
        setNearestTrips(enriched.sort((a, b) => (a.miles ?? 9999) - (b.miles ?? 9999)).slice(0, 8));
        setDistanceLoading(false);
        setLastIntelRefresh(new Date().toISOString());
      }
    }

    refreshNearestTrips();
    return () => {
      cancelled = true;
    };
  }, [selectedPoint?.lat, selectedPoint?.lng, selectedSummary?.driver?.id, selectedSummary?.upcoming, unassignedTrips, intelRefreshToken]);

  const mapUrl = buildStaticMapUrl(drivers, selectedDriver, selectedTrip, showTrail ? driverTrailPoints : []);
  const selectedDestination = getTripPhase(selectedTrip).destination;

  const startMyGpsTracking = () => {
    if (!navigator.geolocation || !myDriverProfile?.id || watchIdRef.current !== null) return;
    let lastUpdate = 0;
    let lastLat = 0;
    let lastLng = 0;
    const stationaryHeartbeatMs = 60000;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const now = Date.now();
        if (now - lastUpdate < 8000) return;
        const movedMeters = Math.sqrt((latitude - lastLat) ** 2 + (longitude - lastLng) ** 2) * 111320;
        if (movedMeters < 15 && lastUpdate > 0 && now - lastUpdate < stationaryHeartbeatMs) return;
        lastUpdate = now;
        lastLat = latitude;
        lastLng = longitude;
        onUpdateDriverLocation?.(myDriverProfile.id, latitude, longitude, {
          accuracy: pos.coords.accuracy || null,
          speedMph: typeof pos.coords.speed === 'number' ? Math.round(pos.coords.speed * 2.23694) : null,
          heading: pos.coords.heading || null,
          actorRole: role || 'driver',
          source: 'map-command-share',
          recordedAt: new Date(pos.timestamp || now).toISOString(),
        });
        setGpsActive(true);
      },
      () => setGpsActive(false),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 8000 }
    );
  };

  const stopMyGpsTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setGpsActive(false);
  };

  useEffect(() => () => stopMyGpsTracking(), []);

  return (
    <div className="h-full min-h-0 bg-slate-50 text-slate-900">
      <div className="h-full min-h-0 flex flex-col">
        <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 sticky top-0 z-20">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={role === 'admin' ? 'blue' : 'emerald'}>
                  <ShieldCheck size={12} /> {role === 'admin' ? 'CEO full fleet' : 'Assigned fleet'}
                </StatusPill>
                <StatusPill tone={hasGoogleMapsConfigured() ? 'emerald' : 'amber'}>
                  <Map size={12} /> {hasGoogleMapsConfigured() ? 'Google Maps active' : 'Maps key needed'}
                </StatusPill>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Exact fleet location, dwell time, current destination, ETA, remaining work, nearest pickup, and ride-share opportunities.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {myDriverProfile && (
                gpsActive ? (
                  <button type="button" onClick={stopMyGpsTracking} className="inline-flex h-9 items-center gap-2 rounded-lg bg-rose-600 px-3 text-xs font-bold text-white transition hover:bg-rose-700">
                    <WifiOff size={14} /> Stop my GPS
                  </button>
                ) : (
                  <button type="button" onClick={startMyGpsTracking} className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white transition hover:bg-emerald-700">
                    <Wifi size={14} /> Share my GPS
                  </button>
                )
              )}
              <button type="button" onClick={runFleetAiAnalysis} disabled={fleetAiLoading} className="inline-flex h-9 items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50">
                {fleetAiLoading ? <Loader2 size={14} className="animate-spin" /> : <BrainCircuit size={14} />} {fleetAiLoading ? 'Analyzing...' : 'Fleet AI Analysis'}
              </button>
              <button type="button" onClick={() => setIntelRefreshToken(token => token + 1)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50">
                <RefreshCw size={14} /> Refresh view
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase text-slate-400">Live drivers</p>
              <p className="mt-1 text-xl font-black tabular-nums">{fleetStats.live}/{drivers.length}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase text-slate-400">Fresh pings</p>
              <p className="mt-1 text-xl font-black tabular-nums">{fleetStats.fresh}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase text-slate-400">Moving now</p>
              <p className="mt-1 text-xl font-black tabular-nums">{fleetStats.moving}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase text-slate-400">Stopped now</p>
              <p className="mt-1 text-xl font-black tabular-nums">{fleetStats.stopped}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase text-slate-400">Moving work</p>
              <p className="mt-1 text-xl font-black tabular-nums">{fleetStats.active}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase text-slate-400">Remaining</p>
              <p className="mt-1 text-xl font-black tabular-nums">{fleetStats.remaining}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase text-slate-400">Completed</p>
              <p className="mt-1 text-xl font-black tabular-nums">{fleetStats.complete}</p>
            </div>
          </div>
        </div>

        {fleetAiResult && (
          <div className="px-4 py-2 bg-white border-b border-slate-200">
            <AIInsightsBanner insights={fleetAiResult} onClose={() => setFleetAiResult(null)} compact />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)_360px]">
            <aside className="min-h-0 overflow-y-auto border-r border-slate-200 bg-white p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">Drivers</h3>
                <StatusPill tone="slate">{drivers.length} visible</StatusPill>
              </div>
              <div className="space-y-2">
                {driverSummaries.map(({ driver, currentTrip, phase, point, fresh, completed, upcoming, totalTrips, movementState, dwellMinutes, movingMinutes }) => (
                  <button
                    type="button"
                    key={driver.id}
                    onClick={() => setSelectedDriverId(driver.id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      selectedDriver?.id === driver.id
                        ? 'border-blue-300 bg-blue-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-black ${
                          fresh ? 'bg-emerald-100 text-emerald-700' : point ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {String(driver?.name || 'D').charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-950">{driver.name || 'Unnamed driver'}</p>
                          <p className="truncate text-xs font-medium text-slate-500">{driver.vehicle || 'No vehicle'} | {driver.status || 'Unknown'}</p>
                        </div>
                      </div>
                      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${fresh ? 'bg-emerald-500' : point ? 'bg-amber-500' : 'bg-slate-300'}`} />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-1 text-center">
                      <div className="rounded-md bg-white px-2 py-1">
                        <p className="text-[10px] font-bold text-slate-400">Done</p>
                        <p className="text-xs font-black">{completed}</p>
                      </div>
                      <div className="rounded-md bg-white px-2 py-1">
                        <p className="text-[10px] font-bold text-slate-400">Next</p>
                        <p className="text-xs font-black">{upcoming.length}</p>
                      </div>
                      <div className="rounded-md bg-white px-2 py-1">
                        <p className="text-[10px] font-bold text-slate-400">Total</p>
                        <p className="text-xs font-black">{totalTrips}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-start gap-2 rounded-md bg-slate-50 p-2">
                      <Navigation size={13} className={`mt-0.5 shrink-0 ${getPhaseIconClass(phase.color)}`} />
                      <div className="min-w-0">
                        <p className="text-[11px] font-black text-slate-700">{phase.label}</p>
                        <p className="truncate text-[11px] font-medium text-slate-500">{currentTrip?.patient || currentTrip?.pickup || 'No moving assignment'}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                      <StatusPill tone={movementState === 'moving' ? 'emerald' : movementState === 'stopped' ? 'amber' : 'slate'}>
                        <Activity size={11} /> {formatMovementState(movementState)}
                      </StatusPill>
                      <span className="truncate font-semibold text-slate-500">
                        {movementState === 'stopped'
                          ? `Stopped ${formatTelemetryDuration(dwellMinutes)}`
                          : movementState === 'moving'
                            ? `Moving ${formatTelemetryDuration(movingMinutes)}`
                            : 'Waiting for telemetry'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            <main className="min-h-0 overflow-y-auto bg-slate-100">
              <div className="p-3">
                <div className="relative overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
                  {mapUrl && !mapError ? (
                    <div className="relative min-h-[520px]">
                      <img
                        src={mapUrl}
                        alt="Live fleet map"
                        className="h-[520px] w-full object-cover"
                        onError={() => setMapError(true)}
                      />
                      <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                        <StatusPill tone={selectedSummary?.fresh ? 'emerald' : selectedPoint ? 'amber' : 'rose'}>
                          <Radio size={12} /> {selectedSummary?.fresh ? 'Live ping' : selectedPoint ? 'Stale ping' : 'No GPS'}
                        </StatusPill>
                        <StatusPill tone="blue">
                          <Crosshair size={12} /> {selectedDriver?.name || 'No driver selected'}
                        </StatusPill>
                        {selectedDriver && driverTrailPoints.length >= 2 && (
                          <button
                            onClick={() => setShowTrail(prev => !prev)}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold transition-colors ${
                              showTrail
                                ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-100'
                            }`}
                          >
                            {trailLoading ? <RefreshCw size={12} className="animate-spin" /> : <Map size={12} />}
                            {showTrail ? `${driverTrailPoints.length} trail pts` : 'Trail hidden'}
                          </button>
                        )}
                      </div>

                      <div className="absolute bottom-3 left-3 right-3 grid gap-2 md:grid-cols-3">
                        <div className="rounded-lg border border-white/20 bg-slate-950/85 p-3 text-white shadow-lg backdrop-blur">
                          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Exact location</p>
                          <p className="mt-1 font-mono text-xs">{selectedPoint ? `${selectedPoint.lat.toFixed(6)}, ${selectedPoint.lng.toFixed(6)}` : 'No coordinates'}</p>
                          <p className="mt-1 text-[11px] font-medium text-slate-300">{formatAge(selectedSummary?.lastPing)} | {formatMovementState(selectedSummary?.movementState)}</p>
                        </div>
                        <div className="rounded-lg border border-white/20 bg-slate-950/85 p-3 text-white shadow-lg backdrop-blur">
                          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Motion / dwell</p>
                          <p className="mt-1 truncate text-xs font-black">{selectedTrip?.patient || 'No active destination'}</p>
                          <p className="mt-1 truncate text-[11px] font-medium text-slate-300">
                            {selectedSummary?.movementState === 'stopped'
                              ? `Stopped ${formatTelemetryDuration(selectedSummary?.dwellMinutes)} | ${selectedDestination || 'Waiting for assignment'}`
                              : selectedSummary?.movementState === 'moving'
                                ? `Moving ${formatTelemetryDuration(selectedSummary?.movingMinutes)} | ${selectedDestination || 'Driving route'}`
                                : (selectedDestination || 'Waiting for assignment')}
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/20 bg-slate-950/85 p-3 text-white shadow-lg backdrop-blur">
                          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Next pickup / tracked miles</p>
                          <p className="mt-1 text-xs font-black">{nearestTrips[0] ? `${formatEta(nearestTrips[0].etaMinutes)} | ${formatMiles(nearestTrips[0].miles)}` : 'No route data'}</p>
                          <p className="mt-1 text-[11px] font-medium text-slate-300">
                            {nearestTrips[0]?.trip?.patient || 'Select a live driver'}
                            {selectedTracking ? ` | ${Number(selectedTracking.totalTrackedMiles || 0).toFixed(1)} mi today` : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-[520px] items-center justify-center p-8 text-center">
                      <div>
                        <Map size={42} className="mx-auto text-slate-400" />
                        <h3 className="mt-3 text-base font-black text-slate-900">Map needs live driver coordinates</h3>
                        <p className="mt-1 max-w-md text-sm font-medium text-slate-500">
                          Drivers must allow GPS in the driver console. Firestore will then stream exact coordinates here for dispatch and CEO control.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <section className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-xs font-black uppercase text-slate-600"><Target size={14} /> Nearest pickup queue</h3>
                      <StatusPill tone={distanceLoading ? 'amber' : 'emerald'}>
                        {distanceLoading ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        {distanceLoading ? 'Calculating' : 'Ready'}
                      </StatusPill>
                    </div>
                    <div className="space-y-2">
                      {nearestTrips.length === 0 && (
                        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm font-medium text-slate-500">
                          Select a driver with GPS to rank the closest pickups.
                        </div>
                      )}
                      {nearestTrips.map(({ trip, miles, etaMinutes }, index) => (
                        <div key={trip.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600 text-xs font-black text-white">{index + 1}</span>
                                <p className="truncate text-sm font-black text-slate-950">{trip.patient || 'Unknown client'}</p>
                                <StatusPill tone={trip.status === 'Unassigned' ? 'amber' : 'blue'}>{trip.status || 'Open'}</StatusPill>
                              </div>
                              <p className="mt-2 line-clamp-2 text-xs font-medium text-slate-600">{trip.pickup}</p>
                              <p className="mt-1 text-[11px] font-bold text-slate-400">{trip.time || 'Will Call'} | {formatMiles(miles)} | {formatEta(etaMinutes)}</p>
                            </div>
                            <div className="flex shrink-0 flex-col gap-1">
                              <button type="button" onClick={() => openDirections(selectedPoint ? `${selectedPoint.lat},${selectedPoint.lng}` : '', trip.pickup)} className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-2 text-[11px] font-bold text-white">
                                <Navigation size={12} /> Route
                              </button>
                              {trip.status === 'Unassigned' && selectedDriver && assignTripToDriver && (
                                <button type="button" onClick={() => assignTripToDriver(trip.id, selectedDriver.id)} className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-600 px-2 text-[11px] font-bold text-white">
                                  <CheckCircle2 size={12} /> Assign
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-xs font-black uppercase text-slate-600"><Users size={14} /> Ride-share savings</h3>
                      <StatusPill tone="blue"><BrainCircuit size={12} /> Smart pairs</StatusPill>
                    </div>
                    <div className="space-y-2">
                      {rideShareCandidates.length === 0 && (
                        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm font-medium text-slate-500">
                          No strong ride-share matches for today yet.
                        </div>
                      )}
                      {rideShareCandidates.map(candidate => (
                        <div key={candidate.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Zap size={14} className="shrink-0 text-amber-500" />
                                <p className="truncate text-sm font-black text-slate-950">{candidate.a.patient} + {candidate.b.patient}</p>
                              </div>
                              <p className="mt-2 text-xs font-medium text-slate-600">
                                {candidate.reason} | {candidate.timeGap} minute time gap | score {candidate.score}
                              </p>
                              <p className="mt-1 line-clamp-1 text-[11px] font-medium text-slate-500">{candidate.a.pickup}</p>
                              <p className="line-clamp-1 text-[11px] font-medium text-slate-500">{candidate.b.pickup}</p>
                            </div>
                            <button type="button" onClick={() => setManualAssignTrip?.(candidate.a)} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-blue-600 px-2 text-[11px] font-bold text-white">
                              <Route size={12} /> Work
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </main>

            <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-white p-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase text-slate-400">Selected driver</p>
                    <h3 className="mt-1 truncate text-lg font-black text-slate-950">{selectedDriver?.name || 'No driver'}</h3>
                    <p className="truncate text-xs font-medium text-slate-500">{selectedDriver?.email || selectedDriver?.vehicle || ''}</p>
                  </div>
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${selectedSummary?.fresh ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    <Truck size={18} />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-white p-2">
                    <p className="text-[10px] font-black uppercase text-slate-400">Status</p>
                    <p className="mt-1 text-xs font-black">{selectedDriver?.status || 'Unknown'}</p>
                  </div>
                  <div className="rounded-md bg-white p-2">
                    <p className="text-[10px] font-black uppercase text-slate-400">GPS age</p>
                    <p className="mt-1 text-xs font-black">{formatAge(selectedSummary?.lastPing)}</p>
                  </div>
                  <div className="rounded-md bg-white p-2">
                    <p className="text-[10px] font-black uppercase text-slate-400">Motion</p>
                    <p className="mt-1 text-xs font-black">{formatMovementState(selectedSummary?.movementState)}</p>
                  </div>
                  <div className="rounded-md bg-white p-2">
                    <p className="text-[10px] font-black uppercase text-slate-400">Stopped / moving</p>
                    <p className="mt-1 text-xs font-black">
                      {selectedSummary?.movementState === 'stopped'
                        ? formatTelemetryDuration(selectedSummary?.dwellMinutes)
                        : formatTelemetryDuration(selectedSummary?.movingMinutes)}
                    </p>
                  </div>
                  <div className="rounded-md bg-white p-2">
                    <p className="text-[10px] font-black uppercase text-slate-400">Speed</p>
                    <p className="mt-1 text-xs font-black">{selectedDriver?.speedMph ?? selectedDriver?.telemetry?.speedMph ?? 0} mph</p>
                  </div>
                  <div className="rounded-md bg-white p-2">
                    <p className="text-[10px] font-black uppercase text-slate-400">Accuracy</p>
                    <p className="mt-1 text-xs font-black">{selectedDriver?.locationAccuracy ? `${Math.round(selectedDriver.locationAccuracy)} m` : 'Unknown'}</p>
                  </div>
                  <div className="rounded-md bg-white p-2">
                    <p className="text-[10px] font-black uppercase text-slate-400">Tracked miles</p>
                    <p className="mt-1 text-xs font-black">{selectedTracking ? `${Number(selectedTracking.totalTrackedMiles || 0).toFixed(1)} mi` : '0.0 mi'}</p>
                  </div>
                  <div className="rounded-md bg-white p-2">
                    <p className="text-[10px] font-black uppercase text-slate-400">Stops today</p>
                    <p className="mt-1 text-xs font-black">{selectedTracking?.stopCount || 0}</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-slate-200 bg-white p-2">
                    <p className="text-[10px] font-black uppercase text-slate-400">Moving time today</p>
                    <p className="mt-1 text-xs font-black">{formatTelemetryDuration(selectedTracking?.totalMovingMinutes || 0)}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white p-2">
                    <p className="text-[10px] font-black uppercase text-slate-400">Stopped time today</p>
                    <p className="mt-1 text-xs font-black">{formatTelemetryDuration(selectedTracking?.totalStoppedMinutes || 0)}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white p-2">
                    <p className="text-[10px] font-black uppercase text-slate-400">Longest stop</p>
                    <p className="mt-1 text-xs font-black">{formatTelemetryDuration(selectedTracking?.longestStopMinutes || 0)}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white p-2">
                    <p className="text-[10px] font-black uppercase text-slate-400">Ping count</p>
                    <p className="mt-1 text-xs font-black">{selectedTracking?.totalPings || 0}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedDriver?.phone && (
                    <>
                      <button type="button" onClick={() => makeCall?.(selectedDriver.phone, selectedDriver.name)} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700">
                        <Phone size={12} /> Call
                      </button>
                      <button type="button" onClick={() => sendSMS?.(selectedDriver.phone, selectedDriver.name)} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700">
                        <Radio size={12} /> Text
                      </button>
                    </>
                  )}
                  {selectedDestination && (
                    <button type="button" onClick={() => openDirections(selectedPoint ? `${selectedPoint.lat},${selectedPoint.lng}` : '', selectedDestination)} className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-2 text-[11px] font-bold text-white">
                      <Compass size={12} /> Open route
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-slate-600"><Layers size={14} /> Current work</h3>
                {selectedSummary?.activeTrips.length ? (
                  <div className="space-y-2">
                    {selectedSummary.activeTrips.map(trip => {
                      const phase = getTripPhase(trip);
                      return (
                        <div key={trip.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-slate-950">{trip.patient || 'Unknown client'}</p>
                              <p className="mt-1 text-[11px] font-bold text-slate-500">{trip.time || 'Will Call'} | {trip.status}</p>
                            </div>
                            <StatusPill tone={phase.color}>{phase.label}</StatusPill>
                          </div>
                          <div className="mt-3 space-y-2 text-xs font-medium text-slate-600">
                            <div className="flex gap-2">
                              <MapPin size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                              <span className="line-clamp-2">{trip.pickup}</span>
                            </div>
                            <div className="flex gap-2">
                              <ArrowRight size={13} className="mt-0.5 shrink-0 text-orange-600" />
                              <span className="line-clamp-2">{trip.dropoff}</span>
                            </div>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button type="button" onClick={() => openDirections(selectedPoint ? `${selectedPoint.lat},${selectedPoint.lng}` : '', phase.destination)} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md bg-slate-900 px-2 text-[11px] font-bold text-white">
                              <Navigation size={12} /> Navigate
                            </button>
                            {triggerSmartAssign && (
                              <button type="button" onClick={() => triggerSmartAssign(trip)} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md bg-indigo-600 px-2 text-[11px] font-bold text-white">
                                <BrainCircuit size={12} /> AI
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm font-medium text-slate-500">
                    This driver has no active moving work.
                  </div>
                )}
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-slate-600"><Clock size={14} /> Upcoming</h3>
                <div className="space-y-2">
                  {(selectedSummary?.upcoming || []).slice(0, 5).map(trip => (
                    <div key={trip.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="truncate text-sm font-black text-slate-950">{trip.patient || 'Unknown client'}</p>
                      <p className="mt-1 text-[11px] font-bold text-slate-500">{trip.time || 'Will Call'} | {trip.status}</p>
                      <p className="mt-2 line-clamp-2 text-xs font-medium text-slate-600">{trip.pickup}</p>
                    </div>
                  ))}
                  {(selectedSummary?.upcoming || []).length === 0 && (
                    <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm font-medium text-slate-500">No upcoming trips assigned.</p>
                  )}
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-slate-600"><Crosshair size={14} /> Recent breadcrumbs</h3>
                <div className="space-y-2">
                  {(selectedTracking?.breadcrumbs || []).slice(-8).reverse().map((sample) => (
                    <div key={`${sample.at}-${sample.lat}-${sample.lng}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-black text-slate-900">{formatMovementState(sample.state)}</p>
                          <p className="mt-1 font-mono text-[11px] text-slate-500">{sample.lat?.toFixed?.(6) || sample.lat}, {sample.lng?.toFixed?.(6) || sample.lng}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] font-bold text-slate-700">{sample.speedMph || 0} mph</p>
                          <p className="text-[10px] text-slate-400">{formatAge(sample.at)}</p>
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-1 text-[11px] font-medium text-slate-500">{sample.destination || sample.patient || 'No active destination'}</p>
                    </div>
                  ))}
                  {(selectedTracking?.breadcrumbs || []).length === 0 && (
                    <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm font-medium text-slate-500">No breadcrumb history yet for this driver.</p>
                  )}
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-slate-600"><Clock size={14} /> Stop events</h3>
                <div className="space-y-2">
                  {(selectedTracking?.stopEvents || []).slice(-6).reverse().map((stop, index) => (
                    <div key={`${stop.startedAt || index}-${stop.lat}-${stop.lng}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-900">{formatTelemetryDuration(stop.minutes || 0)} stop</p>
                          <p className="mt-1 line-clamp-1 text-[11px] font-medium text-slate-500">{stop.destination || stop.patient || 'Waiting location'}</p>
                        </div>
                        <div className="text-right text-[10px] font-medium text-slate-400">
                          <p>{formatAge(stop.startedAt)}</p>
                          <p>{stop.endedAt ? 'Closed' : 'Live'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(selectedTracking?.stopEvents || []).length === 0 && (
                    <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm font-medium text-slate-500">No stop events recorded yet today.</p>
                  )}
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-950 p-3 text-white">
                <h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-slate-300"><Gauge size={14} /> Command notes</h3>
                <div className="space-y-2 text-xs font-medium text-slate-300">
                  <p>Fresh GPS means the driver pinged in the last 10 minutes.</p>
                  <p>Stopped drivers now keep sending heartbeat pings so dispatch can see dwell time instead of losing visibility when the car is not moving.</p>
                  <p>Nearest pickup uses the selected driver's current coordinates and Google distance data when available.</p>
                  <p>Dispatchers only see the drivers and trips scoped to their assignment.</p>
                  {lastIntelRefresh && <p className="text-slate-400">Last intelligence refresh: {formatAge(lastIntelRefresh)}</p>}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveMapPage;
