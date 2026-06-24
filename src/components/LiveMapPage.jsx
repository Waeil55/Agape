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
  Search,
  ShieldCheck,
  Target,
  Truck,
  Users,
  Wifi,
  WifiOff,
  X,
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
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailTab, setDetailTab] = useState('overview');
  const [hudSearch, setHudSearch] = useState('');

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
    <div className="h-screen w-full min-h-0 bg-slate-950 flex flex-col overflow-hidden select-none">
      {/* ===== HUD BAR (36px) ===== */}
      <header className="shrink-0 h-9 bg-slate-950 border-b border-white/[0.06] flex items-center gap-2 px-3 z-30">
        <span className="text-[11px] font-black text-white tracking-[0.08em]">AGAPE</span>
        <div className="w-px h-3 bg-white/[0.08]" />
        <span className="flex items-center gap-1 text-[11px]"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /><span className="text-slate-300 font-medium">{fleetStats.live}/{drivers.length} live</span></span>
        <span className="flex items-center gap-1 text-[11px]"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" /><span className="text-blue-300 font-medium">{fleetStats.moving} moving</span></span>
        <span className="flex items-center gap-1 text-[11px]"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /><span className="text-amber-300 font-medium">{fleetStats.stopped} stopped</span></span>
        <span className="text-emerald-400 text-[11px] font-bold">&#10003;{fleetStats.complete}</span>
        <span className="text-slate-600 text-[11px] font-medium">| {fleetStats.remaining} remaining</span>
        <div className="flex-1" />
        <div className="relative flex items-center">
          <Search size={12} className="absolute left-2 text-slate-500 pointer-events-none" />
          <input
            value={hudSearch}
            onChange={(e) => setHudSearch(e.target.value)}
            placeholder="Search drivers..."
            className="w-36 h-6 rounded-md bg-white/[0.06] border border-white/[0.08] pl-6 pr-2 text-[11px] text-white placeholder-slate-500 outline-none focus:border-blue-500/40 transition-colors"
          />
          {hudSearch && <X size={12} className="absolute right-2 text-slate-500 cursor-pointer hover:text-white" onClick={() => setHudSearch('')} />}
        </div>
        <div className="w-px h-3 bg-white/[0.06]" />
        {myDriverProfile && (
          gpsActive ? (
            <button type="button" onClick={stopMyGpsTracking} className="flex items-center gap-1 h-6 px-2 rounded-md bg-rose-600/20 text-rose-400 text-[10px] font-bold hover:bg-rose-600/30 transition-colors" title="Stop sharing GPS">
              <WifiOff size={11} /> Stop
            </button>
          ) : (
            <button type="button" onClick={startMyGpsTracking} className="flex items-center gap-1 h-6 px-2 rounded-md bg-emerald-600/20 text-emerald-400 text-[10px] font-bold hover:bg-emerald-600/30 transition-colors" title="Share your GPS location on the map">
              <Wifi size={11} /> Share GPS
            </button>
          )
        )}
        <button type="button" onClick={runFleetAiAnalysis} disabled={fleetAiLoading} className="flex items-center gap-1 h-6 px-2 rounded-md bg-indigo-600/20 text-indigo-400 text-[10px] font-bold hover:bg-indigo-600/30 disabled:opacity-40 transition-colors">
          {fleetAiLoading ? <Loader2 size={11} className="animate-spin" /> : <BrainCircuit size={11} />} AI
        </button>
        <button type="button" onClick={() => setIntelRefreshToken(t => t + 1)} className="flex items-center justify-center h-6 w-6 rounded-md bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors" title="Refresh view">
          <RefreshCw size={12} />
        </button>
      </header>

      {/* ===== MAP AREA (fills remaining space) ===== */}
      <div className="flex-1 relative overflow-hidden bg-slate-900">
        {/* Map image */}
        {mapUrl && !mapError ? (
          <img
            src={mapUrl}
            alt="Live fleet map"
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setMapError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Map size={48} className="mx-auto text-slate-700" />
              <h3 className="mt-3 text-base font-black text-slate-400">Fleet Command Center</h3>
              <p className="mt-1 max-w-md text-sm font-medium text-slate-500">
                {hasGoogleMapsConfigured() ? 'Waiting for driver GPS data...' : 'Configure Google Maps API key to enable the map.'}
              </p>
            </div>
          </div>
        )}

        {/* Gradient edge fade */}
        <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-slate-950/40 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/60 to-transparent pointer-events-none" />

        {/* ===== RIGHT FLOATING PANEL (driver list) ===== */}
        <div className="absolute right-3 top-3 z-20 flex flex-col items-end">
          {/* Collapsed toggle badge */}
          {!rightPanelOpen && (
            <button
              type="button"
              onClick={() => setRightPanelOpen(true)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-900/90 backdrop-blur-md border border-white/10 text-white text-xs font-bold shadow-lg hover:bg-slate-800 transition-colors"
            >
              <Users size={14} /> {drivers.length}
            </button>
          )}

          {/* Expanded panel */}
          {rightPanelOpen && (
            <div className="w-64 rounded-xl bg-slate-900/95 backdrop-blur-xl border border-white/[0.08] shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
                <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5"><Users size={13} /> Drivers <span className="text-slate-500 font-medium">({drivers.length})</span></span>
                <button type="button" onClick={() => setRightPanelOpen(false)} className="text-slate-500 hover:text-white transition-colors"><X size={13} /></button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto overscroll-contain py-1">
                {driverSummaries
                  .filter(s => !hudSearch || s.driver.name?.toLowerCase().includes(hudSearch.toLowerCase()) || s.driver.vehicle?.toLowerCase().includes(hudSearch.toLowerCase()))
                  .map(({ driver, currentTrip, phase, point, fresh, completed, movementState, dwellMinutes, movingMinutes }) => (
                  <button
                    type="button"
                    key={driver.id}
                    onClick={() => setSelectedDriverId(driver.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                      selectedDriver?.id === driver.id ? 'bg-blue-500/10' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className={`w-2 h-2 shrink-0 rounded-full ${fresh && movementState === 'moving' ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]' : fresh ? 'bg-amber-400' : 'bg-slate-600'}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[13px] font-bold ${selectedDriver?.id === driver.id ? 'text-white' : 'text-slate-300'}`}>{driver.name || 'Unnamed'}</p>
                      <p className="truncate text-[10px] font-medium text-slate-500">
                        {movementState === 'moving' ? `Moving ${formatTelemetryDuration(movingMinutes)}` : movementState === 'stopped' ? `Stopped ${formatTelemetryDuration(dwellMinutes)}` : 'Waiting for telemetry'}
                        {currentTrip?.patient ? ` · ${currentTrip.patient}` : ''}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold ${completed > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>{completed}</span>
                  </button>
                ))}
                {driverSummaries.length === 0 && (
                  <p className="px-3 py-6 text-center text-xs text-slate-500">No drivers available.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Trail toggle (when driver selected) */}
        {selectedDriver && driverTrailPoints.length >= 2 && (
          <button
            type="button"
            onClick={() => setShowTrail(p => !p)}
            className="absolute left-3 top-3 z-20 flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-slate-900/80 backdrop-blur-sm border border-white/10 text-[10px] font-bold shadow-lg transition-colors hover:bg-slate-800"
            style={{ color: showTrail ? '#60A5FA' : '#94A3B8' }}
          >
            {trailLoading ? <Loader2 size={11} className="animate-spin" /> : <Map size={11} />}
            {showTrail ? `${driverTrailPoints.length} trail` : 'Trail'}
          </button>
        )}

        {/* Trail loading indicator */}
        {trailLoading && (
          <div className="absolute left-3 top-12 z-20 flex items-center gap-1.5 h-6 px-2 rounded-md bg-slate-900/80 backdrop-blur-sm border border-white/10 text-[10px] text-slate-400 font-medium">
            <Loader2 size={10} className="animate-spin" /> Loading trail...
          </div>
        )}

        {/* ===== BOTTOM INFO BAR ===== */}
        {selectedDriverId && selectedDriver && selectedPoint && (
          <div className="absolute bottom-4 left-4 right-4 z-20 animate-in slide-in-from-bottom-2 duration-200">
            <div className="rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-white/[0.08] p-4 shadow-2xl">
              <div className="flex items-center gap-4">
                {/* Left: driver identity */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black text-sm ${
                    selectedSummary?.fresh && selectedSummary?.movementState === 'moving'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : selectedSummary?.fresh
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-slate-700 text-slate-400'
                  }`}>
                    {String(selectedDriver?.name || 'D').charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-black text-white">{selectedDriver.name || 'Unnamed driver'}</p>
                      <span className={`flex items-center gap-1 text-[10px] font-bold ${
                        selectedSummary?.fresh ? 'text-emerald-400' : 'text-amber-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${selectedSummary?.fresh ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                        {selectedSummary?.fresh ? 'Live' : 'Stale'}
                      </span>
                    </div>
                    <p className="truncate text-[11px] font-medium text-slate-400">
                      {formatMovementState(selectedSummary?.movementState)}
                      {selectedSummary?.movementState === 'moving' && ` · ${formatTelemetryDuration(selectedSummary?.movingMinutes)}`}
                      {selectedSummary?.movementState === 'stopped' && ` · ${formatTelemetryDuration(selectedSummary?.dwellMinutes)}`}
                      {selectedTracking?.totalTrackedMiles ? ` · ${Number(selectedTracking.totalTrackedMiles).toFixed(1)} mi` : ''}
                    </p>
                  </div>
                </div>

                {/* Center: destination + ETA */}
                <div className="hidden md:block min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-300">
                    <ArrowRight size={12} className="inline mr-1 text-blue-400" />
                    {selectedDestination || selectedTrip?.patient || 'No active destination'}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                    {selectedSummary?.lastPing ? `${formatAge(selectedSummary.lastPing)}` : ''}
                    {nearestTrips[0] ? ` · ETA ${formatEta(nearestTrips[0].etaMinutes)} · ${formatMiles(nearestTrips[0].miles)}` : ''}
                  </p>
                </div>

                {/* Right: stats */}
                <div className="flex items-center gap-4 text-[11px] shrink-0">
                  <div className="text-center">
                    <p className="text-slate-500 font-medium">Moving</p>
                    <p className="text-white font-bold tabular-nums">{formatTelemetryDuration(selectedSummary?.movingMinutes || 0)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-500 font-medium">Stopped</p>
                    <p className="text-white font-bold tabular-nums">{formatTelemetryDuration(selectedSummary?.dwellMinutes || 0)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-500 font-medium">Trips</p>
                    <p className="text-emerald-400 font-bold tabular-nums">&#10003;{selectedSummary?.completed || 0}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {selectedDriver?.phone && (
                    <>
                      <button type="button" onClick={() => makeCall?.(selectedDriver.phone, selectedDriver.name)} className="flex items-center gap-1 h-8 px-2.5 rounded-lg bg-white/[0.06] text-slate-300 text-[11px] font-bold hover:bg-white/[0.1] transition-colors" title="Call driver">
                        <Phone size={13} />
                      </button>
                      <button type="button" onClick={() => sendSMS?.(selectedDriver.phone, selectedDriver.name)} className="flex items-center gap-1 h-8 px-2.5 rounded-lg bg-white/[0.06] text-slate-300 text-[11px] font-bold hover:bg-white/[0.1] transition-colors" title="Text driver">
                        <Radio size={13} />
                      </button>
                    </>
                  )}
                  {selectedDestination && (
                    <button type="button" onClick={() => openDirections(selectedPoint ? `${selectedPoint.lat},${selectedPoint.lng}` : '', selectedDestination)} className="flex items-center gap-1 h-8 px-2.5 rounded-lg bg-white/[0.06] text-slate-300 text-[11px] font-bold hover:bg-white/[0.1] transition-colors" title="Open in Google Maps">
                      <Compass size={13} />
                    </button>
                  )}
                  <button type="button" onClick={() => setShowDetailModal(true)} className="flex items-center gap-1 h-8 px-3 rounded-lg bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-500 transition-colors">
                    <Target size={13} /> Detail
                  </button>
                  <button type="button" onClick={() => { setSelectedDriverId(''); setShowDetailModal(false); }} className="flex items-center justify-center h-8 w-8 rounded-lg bg-white/[0.04] text-slate-500 hover:text-white hover:bg-white/[0.08] transition-colors">
                    <X size={13} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== DETAIL MODAL (full report) ===== */}
      {showDetailModal && selectedDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowDetailModal(false)}>
          <div className="relative w-full max-w-2xl max-h-[85vh] mx-4 rounded-2xl bg-slate-900 border border-white/[0.08] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl font-black text-sm ${
                  selectedSummary?.fresh && selectedSummary?.movementState === 'moving'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : selectedSummary?.fresh ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'
                }`}>
                  {String(selectedDriver?.name || 'D').charAt(0)}
                </div>
                <div>
                  <h2 className="text-sm font-black text-white">{selectedDriver.name || 'Unnamed driver'}</h2>
                  <p className="text-[11px] font-medium text-slate-400">{selectedDriver.vehicle || 'No vehicle'} · {formatAge(selectedSummary?.lastPing)}</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowDetailModal(false)} className="flex items-center justify-center h-8 w-8 rounded-lg bg-white/[0.04] text-slate-500 hover:text-white hover:bg-white/[0.08] transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/[0.06]">
              {[
                { id: 'overview', label: 'Overview', icon: Gauge },
                { id: 'trips', label: 'Trips', icon: Route },
                { id: 'timeline', label: 'Timeline', icon: Activity },
              ].map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" onClick={() => setDetailTab(id)} className={`flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-bold transition-colors ${
                  detailTab === id ? 'text-white border-b-2 border-blue-500 bg-blue-500/5' : 'text-slate-500 hover:text-slate-300'
                }`}>
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="max-h-[60vh] overflow-y-auto p-5 space-y-4">
              {/* OVERVIEW TAB */}
              {detailTab === 'overview' && (
                <>
                  {/* Time stats grid */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                      <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">Moving</p>
                      <p className="mt-1 text-lg font-black text-blue-400 tabular-nums">{formatTelemetryDuration(selectedTracking?.totalMovingMinutes || selectedSummary?.movingMinutes || 0)}</p>
                      <p className="text-[10px] text-slate-600">today</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                      <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">Stopped</p>
                      <p className="mt-1 text-lg font-black text-amber-400 tabular-nums">{formatTelemetryDuration(selectedTracking?.totalStoppedMinutes || selectedSummary?.dwellMinutes || 0)}</p>
                      <p className="text-[10px] text-slate-600">today</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                      <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">Longest</p>
                      <p className="mt-1 text-lg font-black text-rose-400 tabular-nums">{formatTelemetryDuration(selectedTracking?.longestStopMinutes || 0)}</p>
                      <p className="text-[10px] text-slate-600">stop</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                      <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">Miles</p>
                      <p className="mt-1 text-lg font-black text-emerald-400 tabular-nums">{selectedTracking ? `${Number(selectedTracking.totalTrackedMiles || 0).toFixed(1)}` : '0.0'}</p>
                      <p className="text-[10px] text-slate-600">tracked</p>
                    </div>
                  </div>

                  {/* Current status card */}
                  <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">Current status</p>
                        <p className="mt-1 text-sm font-black text-white">{formatMovementState(selectedSummary?.movementState)}</p>
                        {selectedTrip && (
                          <>
                            <p className="mt-2 text-xs font-medium text-slate-400 flex items-center gap-1">
                              <Navigation size={12} className="text-blue-400" />
                              {selectedTrip.patient || 'Unknown patient'}
                            </p>
                            <p className="mt-1 text-[11px] font-medium text-slate-500">{selectedTrip.pickup} → {selectedTrip.dropoff}</p>
                          </>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">Last ping</p>
                        <p className="mt-1 text-sm font-black text-white tabular-nums">{formatAge(selectedSummary?.lastPing)}</p>
                        <p className="text-[10px] text-slate-600 mt-1">{selectedDriver?.speedMph ?? selectedDriver?.telemetry?.speedMph ?? 0} mph</p>
                      </div>
                    </div>
                  </div>

                  {/* Stops + upcoming summary */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                      <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">Stops</p>
                      <p className="mt-1 text-lg font-black text-white tabular-nums">{selectedTracking?.stopCount || 0}</p>
                      <p className="text-[10px] text-slate-600">today</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                      <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">Trips done</p>
                      <p className="mt-1 text-lg font-black text-emerald-400 tabular-nums">{selectedSummary?.completed || 0}</p>
                      <p className="text-[10px] text-slate-600">{selectedSummary?.upcoming?.length || 0} upcoming</p>
                    </div>
                  </div>

                  {/* Location coordinates */}
                  <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                    <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">Coordinates</p>
                    <p className="mt-1 font-mono text-xs text-slate-300">{selectedPoint ? `${selectedPoint.lat.toFixed(6)}, ${selectedPoint.lng.toFixed(6)}` : 'No coordinates'}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">Accuracy: {selectedDriver?.locationAccuracy ? `${Math.round(selectedDriver.locationAccuracy)}m` : 'Unknown'}</p>
                  </div>
                </>
              )}

              {/* TRIPS TAB */}
              {detailTab === 'trips' && (
                <>
                  {/* Active trips */}
                  {selectedSummary?.activeTrips && selectedSummary.activeTrips.length > 0 && (
                    <div>
                      <h4 className="text-[11px] font-bold uppercase text-slate-400 tracking-wide mb-2">Active trips</h4>
                      <div className="space-y-2">
                        {selectedSummary.activeTrips.map(trip => {
                          const phase = getTripPhase(trip);
                          return (
                            <div key={trip.id} className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-black text-white">{trip.patient || 'Unknown client'}</p>
                                  <p className="text-[11px] font-medium text-slate-400">{trip.time || 'Will Call'} · {trip.status}</p>
                                </div>
                                <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                  phase.color === 'blue' ? 'bg-blue-500/20 text-blue-400' :
                                  phase.color === 'emerald' ? 'bg-emerald-500/20 text-emerald-400' :
                                  'bg-amber-500/20 text-amber-400'
                                }`}>{phase.label}</span>
                              </div>
                              <div className="mt-2 space-y-1 text-xs text-slate-400">
                                <p className="flex items-start gap-1"><MapPin size={12} className="mt-0.5 shrink-0 text-emerald-500" /> <span className="line-clamp-2">{trip.pickup}</span></p>
                                <p className="flex items-start gap-1"><ArrowRight size={12} className="mt-0.5 shrink-0 text-orange-500" /> <span className="line-clamp-2">{trip.dropoff}</span></p>
                              </div>
                              <div className="mt-3 flex gap-2">
                                <button type="button" onClick={() => openDirections(selectedPoint ? `${selectedPoint.lat},${selectedPoint.lng}` : '', phase.destination)} className="flex items-center gap-1 h-7 px-2.5 rounded-lg bg-white/[0.06] text-slate-300 text-[10px] font-bold hover:bg-white/[0.1] transition-colors">
                                  <Navigation size={11} /> Navigate
                                </button>
                                {triggerSmartAssign && (
                                  <button type="button" onClick={() => triggerSmartAssign(trip)} className="flex items-center gap-1 h-7 px-2.5 rounded-lg bg-indigo-600/20 text-indigo-400 text-[10px] font-bold hover:bg-indigo-600/30 transition-colors">
                                    <BrainCircuit size={11} /> AI
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Nearest pickup queue */}
                  <div>
                    <h4 className="text-[11px] font-bold uppercase text-slate-400 tracking-wide mb-2">Nearest pickups</h4>
                    <div className="space-y-2">
                      {nearestTrips.length === 0 && (
                        <p className="text-xs text-slate-500 py-4 text-center border border-dashed border-white/[0.06] rounded-xl">Select a driver with GPS to show nearest pickups.</p>
                      )}
                      {nearestTrips.slice(0, 5).map(({ trip, miles, etaMinutes }, index) => (
                        <div key={trip.id} className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-600 text-[10px] font-black text-white shrink-0">{index + 1}</span>
                                <p className="truncate text-sm font-black text-white">{trip.patient || 'Unknown client'}</p>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">{trip.status || 'Open'}</span>
                              </div>
                              <p className="mt-1 text-xs text-slate-400 line-clamp-2">{trip.pickup}</p>
                              <p className="mt-1 text-[11px] font-medium text-slate-500">{trip.time || 'Will Call'} · {formatMiles(miles)} · {formatEta(etaMinutes)}</p>
                            </div>
                            <div className="flex flex-col gap-1 shrink-0">
                              <button type="button" onClick={() => openDirections(selectedPoint ? `${selectedPoint.lat},${selectedPoint.lng}` : '', trip.pickup)} className="flex items-center gap-1 h-7 px-2 rounded-lg bg-white/[0.06] text-slate-300 text-[10px] font-bold hover:bg-white/[0.1]">
                                <Navigation size={11} /> Route
                              </button>
                              {trip.status === 'Unassigned' && selectedDriver && assignTripToDriver && (
                                <button type="button" onClick={() => assignTripToDriver(trip.id, selectedDriver.id)} className="flex items-center gap-1 h-7 px-2 rounded-lg bg-emerald-600/20 text-emerald-400 text-[10px] font-bold hover:bg-emerald-600/30">
                                  <CheckCircle2 size={11} /> Assign
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Upcoming trips */}
                  {selectedSummary?.upcoming && selectedSummary.upcoming.length > 0 && (
                    <div>
                      <h4 className="text-[11px] font-bold uppercase text-slate-400 tracking-wide mb-2">Upcoming ({selectedSummary.upcoming.length})</h4>
                      <div className="space-y-2">
                        {selectedSummary.upcoming.slice(0, 5).map(trip => (
                          <div key={trip.id} className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                            <p className="truncate text-sm font-black text-white">{trip.patient || 'Unknown client'}</p>
                            <p className="text-[11px] font-medium text-slate-400">{trip.time || 'Will Call'} · {trip.status}</p>
                            <p className="mt-1 line-clamp-2 text-xs text-slate-500">{trip.pickup}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Ride-share savings */}
                  {rideShareCandidates.length > 0 && (
                    <div>
                      <h4 className="text-[11px] font-bold uppercase text-slate-400 tracking-wide mb-2">Ride-share savings</h4>
                      <div className="space-y-2">
                        {rideShareCandidates.map(candidate => (
                          <div key={candidate.id} className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-black text-white"><Zap size={13} className="inline text-amber-400 mr-1" />{candidate.a.patient} + {candidate.b.patient}</p>
                                <p className="text-xs text-slate-400 mt-1">{candidate.reason} · {candidate.timeGap}min gap · score {candidate.score}</p>
                                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{candidate.a.pickup}</p>
                                <p className="text-[11px] text-slate-500 line-clamp-1">{candidate.b.pickup}</p>
                              </div>
                              <button type="button" onClick={() => setManualAssignTrip?.(candidate.a)} className="flex items-center gap-1 h-7 px-2.5 rounded-lg bg-blue-600/20 text-blue-400 text-[10px] font-bold hover:bg-blue-600/30 shrink-0">
                                <Route size={11} /> Work
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* TIMELINE TAB */}
              {detailTab === 'timeline' && (
                <>
                  {/* Breadcrumb trail */}
                  <div>
                    <h4 className="text-[11px] font-bold uppercase text-slate-400 tracking-wide mb-2">Breadcrumb trail</h4>
                    <div className="space-y-1">
                      {(selectedTracking?.breadcrumbs || []).slice(-12).reverse().map((sample, idx) => (
                        <div key={`${sample.at}-${idx}`} className="flex items-center gap-3 rounded-lg bg-white/[0.03] border border-white/[0.04] px-3 py-2">
                          <span className={`w-2 h-2 shrink-0 rounded-full ${
                            sample.state === 'moving' ? 'bg-blue-400' : sample.state === 'stopped' ? 'bg-amber-400' : 'bg-slate-500'
                          }`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-white">{formatMovementState(sample.state)}</p>
                            <p className="text-[10px] font-medium text-slate-500">{sample.lat?.toFixed?.(4) || sample.lat}, {sample.lng?.toFixed?.(4) || sample.lng}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[11px] font-bold text-slate-300 tabular-nums">{sample.speedMph || 0} mph</p>
                            <p className="text-[10px] text-slate-500">{formatAge(sample.at)}</p>
                          </div>
                        </div>
                      ))}
                      {(!selectedTracking?.breadcrumbs || selectedTracking.breadcrumbs.length === 0) && (
                        <p className="text-xs text-slate-500 py-4 text-center border border-dashed border-white/[0.06] rounded-xl">No breadcrumb history yet.</p>
                      )}
                    </div>
                  </div>

                  {/* Stop events */}
                  <div>
                    <h4 className="text-[11px] font-bold uppercase text-slate-400 tracking-wide mb-2">Stop events</h4>
                    <div className="space-y-1">
                      {(selectedTracking?.stopEvents || []).slice(-6).reverse().map((stop, index) => (
                        <div key={`${stop.startedAt || index}`} className="flex items-center gap-3 rounded-lg bg-white/[0.03] border border-white/[0.04] px-3 py-2">
                          <span className="w-2 h-2 shrink-0 rounded-full bg-amber-400" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-white">{formatTelemetryDuration(stop.minutes || 0)} stop</p>
                            <p className="text-[10px] font-medium text-slate-500 line-clamp-1">{stop.destination || stop.patient || 'Waiting location'}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[11px] font-bold text-slate-300">{formatAge(stop.startedAt)}</p>
                            <p className="text-[10px] text-slate-500">{stop.endedAt ? 'Closed' : 'Live'}</p>
                          </div>
                        </div>
                      ))}
                      {(!selectedTracking?.stopEvents || selectedTracking.stopEvents.length === 0) && (
                        <p className="text-xs text-slate-500 py-4 text-center border border-dashed border-white/[0.06] rounded-xl">No stop events recorded today.</p>
                      )}
                    </div>
                  </div>

                  {/* Telemetry stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                      <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">Ping count</p>
                      <p className="mt-1 text-lg font-black text-white tabular-nums">{selectedTracking?.totalPings || 0}</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                      <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">GPS age</p>
                      <p className="mt-1 text-lg font-black text-white tabular-nums">{formatAge(selectedSummary?.lastPing)}</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                      <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">Speed</p>
                      <p className="mt-1 text-lg font-black text-white tabular-nums">{selectedDriver?.speedMph ?? selectedDriver?.telemetry?.speedMph ?? 0} mph</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveMapPage;
