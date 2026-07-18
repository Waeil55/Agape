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
import { loadGoogleMapsApi } from '../hooks/useGoogleMaps';
import { openMapLink } from '../utils/nativeActions';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
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

import CommandSidebar from './CommandSidebar';

const DRIVER_COLORS = ['blue', 'green', 'orange', 'purple', 'red', 'yellow', 'gray', 'brown'];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

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
  const googleWeb = `https://www.google.com/maps/dir/?${params.toString()}`;
  const googleIntent = `intent://maps.google.com/maps/dir/?${params.toString()}#Intent;scheme=https;package=com.google.android.apps.maps;S.browser_fallback_url=${encodeURIComponent(googleWeb)};end;`;
  openMapLink(googleIntent, googleWeb);
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

const DARK_MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#475569' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#64748b' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
];

function createMarkerIcon(mapsLib, initial, fillColor, isSelected = false, isPulsing = false) {
  const size = isSelected ? 36 : 28;
  const fontSize = isSelected ? 13 : 11;
  const pulseAnim = isPulsing ? `<animate attributeName="r" from="${size / 2 - 2}" to="${size / 2 + 10}" dur="1.5s" repeatCount="indefinite"/><animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite"/>` : '';
  const ring = (isSelected || isPulsing)
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 + 5}" fill="none" stroke="${fillColor}" stroke-width="2" opacity="0.4">${pulseAnim}</circle>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${ring}<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${fillColor}" stroke="#ffffff" stroke-width="2" /><text x="${size / 2}" y="${size / 2 + fontSize / 3}" text-anchor="middle" fill="#ffffff" font-size="${fontSize}" font-weight="bold" font-family="system-ui">${initial}</text></svg>`;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new mapsLib.Size(size, size),
    anchor: new mapsLib.Point(size / 2, size / 2),
  };
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
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${classes[tone] || classes.slate}`}>
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
  const [mapReady, setMapReady] = useState(false);
  const [mapsLoadError, setMapsLoadError] = useState(false);
  const [showTraffic, setShowTraffic] = useState(false);
  const [showClusters, setShowClusters] = useState(true);
  const [streetViewLoc, setStreetViewLoc] = useState(null);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const clustererRef = useRef(null);
  const trafficLayerRef = useRef(null);
  const svContainerRef = useRef(null);
  const svInstanceRef = useRef(null);
  const trailPolyRef = useRef(null);
  const infoWindowRef = useRef(null);

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
    () => trips.filter(trip => tripMatchesCalendarDay(trip.date, today)),
    [trips, today]
  );

  const driverMarkerKey = useMemo(() => {
    return drivers.map(d => `${d.id}:${d.name}:${d.vehicle}:${d.status}:${d.lastLocationUpdate || d.lastUpdate || ''}:${d.lat || ''}:${d.lng || ''}:${d.pickupLat || ''}:${d.pickupLng || ''}`).join('|');
  }, [drivers]);

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

  const selectedDestination = getTripPhase(selectedTrip).destination;

  // Map initialization
  useEffect(() => {
    if (!hasGoogleMapsConfigured()) { setMapsLoadError(true); return; }
    let cancelled = false;
    loadGoogleMapsApi()
      .then((mapsLib) => {
        if (cancelled || mapRef.current) return;
        const el = mapContainerRef.current;
        if (!el) return;
        try {
          const map = new mapsLib.Map(el, {
            zoom: 11,
            center: { lat: 38.9072, lng: -77.0369 },
            mapTypeId: 'roadmap',
            styles: DARK_MAP_STYLES,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            zoomControl: true,
            zoomControlOptions: { position: mapsLib.ControlPosition.RIGHT_BOTTOM },
          });
          mapRef.current = map;
          infoWindowRef.current = new mapsLib.InfoWindow({
            pixelOffset: new mapsLib.Size(0, -18),
          });
          if (!cancelled) setMapReady(true);
        } catch (err) {
          console.error('[LiveMap] Error initializing map', err);
          if (!cancelled) setMapsLoadError(true);
        }
      })
      .catch(() => { if (!cancelled) setMapsLoadError(true); });
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current = null;
      }
    };
  }, []);

  // Traffic Layer update
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const mapsLib = window.google.maps;
    if (showTraffic) {
      if (!trafficLayerRef.current) trafficLayerRef.current = new mapsLib.TrafficLayer();
      trafficLayerRef.current.setMap(mapRef.current);
    } else if (trafficLayerRef.current) {
      trafficLayerRef.current.setMap(null);
    }
  }, [mapReady, showTraffic]);

  // Street View Side-panel update
  useEffect(() => {
    if (!svContainerRef.current || !streetViewLoc) return;
    const mapsLib = window.google.maps;
    if (!svInstanceRef.current) {
      svInstanceRef.current = new mapsLib.StreetViewPanorama(svContainerRef.current, {
        position: streetViewLoc,
        pov: { heading: 0, pitch: 0 },
        zoom: 1,
        addressControl: false,
        linksControl: false,
        panControl: false,
        enableCloseButton: false,
        fullscreenControl: false,
      });
      mapRef.current?.setStreetView(svInstanceRef.current);
    } else {
      svInstanceRef.current.setPosition(streetViewLoc);
    }
  }, [streetViewLoc]);

  // Markers update
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const mapsLib = window.google.maps;

    // Clear old markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    // Build driver markers
    drivers.forEach((driver) => {
      const point = getDriverPoint(driver);
      if (!point) return;
      const initial = String(driver?.name || 'D').charAt(0).toUpperCase();
      const colors = { blue: '#3B82F6', green: '#22C55E', orange: '#F97316', purple: '#A855F7', red: '#EF4444', yellow: '#EAB308', gray: '#64748B', brown: '#78716C' };
      const colorIdx = drivers.indexOf(driver) % DRIVER_COLORS.length;
      const baseColor = colors[DRIVER_COLORS[colorIdx]] || '#64748B';
      const isPulsing = ACTIVE_STATUSES.has(driver.status) || driver.status === 'Delayed';

      try {
        const marker = new mapsLib.Marker({
          position: point,
          map: showClusters ? null : mapRef.current,
          title: driver.name || 'Driver',
          icon: createMarkerIcon(mapsLib, initial, driver.id === selectedDriverId ? '#3B82F6' : baseColor, driver.id === selectedDriverId, isPulsing),
          zIndex: driver.id === selectedDriverId ? 100 : 10,
        });

        marker.addListener('click', () => {
          setSelectedDriverId(driver.id);
          infoWindowRef.current?.setContent(`
            <div style="font-family:system-ui;color:#e2e8f0;font-size:12px;line-height:1.4;min-width:160px">
              <div style="font-weight:800;font-size:14px;color:#f8fafc;margin-bottom:2px">${escapeHtml(driver.name || 'Unnamed')}</div>
              <div style="color:#94a3b8;font-size:11px">${escapeHtml(driver.vehicle || 'No vehicle')}</div>
              <div style="color:#64748b;font-size:10px;margin-top:4px">${formatAge(driver.lastLocationUpdate || driver.lastUpdate)}</div>
            </div>
          `);
          infoWindowRef.current?.open(mapRef.current, marker);
        });

        markersRef.current.push(marker);
      } catch (err) {
        console.error('[LiveMap] Error creating marker for', driver.name, err);
      }
    });

    if (showClusters) {
      if (!clustererRef.current) {
        clustererRef.current = new MarkerClusterer({ map: mapRef.current, markers: markersRef.current });
      } else {
        clustererRef.current.clearMarkers();
        clustererRef.current.addMarkers(markersRef.current);
      }
    } else if (clustererRef.current) {
      clustererRef.current.clearMarkers();
    }

    // Auto-pan to selected driver
    const selPoint = selectedDriver ? getDriverPoint(selectedDriver) : null;
    if (selPoint) {
      mapRef.current.panTo(selPoint);
    }
  }, [mapReady, driverMarkerKey, selectedDriverId, showClusters]);

  // Trail polyline update
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const mapsLib = window.google.maps;

    // Remove old trail
    if (trailPolyRef.current) {
      trailPolyRef.current.setMap(null);
      trailPolyRef.current = null;
    }

    if (!showTrail || driverTrailPoints.length < 2) return;

    try {
      const path = driverTrailPoints.map((p) => ({ lat: p.lat, lng: p.lng }));
      trailPolyRef.current = new mapsLib.Polyline({
        path,
        geodesic: true,
        strokeColor: '#4285F4',
        strokeOpacity: 0.8,
        strokeWeight: 3,
        map: mapRef.current,
      });
    } catch (err) {
      console.error('[LiveMap] Error creating trail polyline', err);
    }
  }, [mapReady, driverTrailPoints, showTrail]);

  // Resize handler
  useEffect(() => {
    if (!mapRef.current) return;
    const handler = () => { if (mapRef.current && window.google?.maps) window.google.maps.event.trigger(mapRef.current, 'resize'); };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [mapReady]);

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

  const handleOpenStreetView = (destStr) => {
    if (!destStr) return;
    const mapsLib = window.google.maps;
    if (!mapsLib) return;
    const geocoder = new mapsLib.Geocoder();
    geocoder.geocode({ address: destStr }, (results, status) => {
      if (status === 'OK' && results[0]) {
        setStreetViewLoc(results[0].geometry.location);
      } else {
        console.warn('Geocode failed for street view:', status);
      }
    });
  };

  return (
    <div className="h-full w-full min-h-0 bg-slate-50 flex flex-col overflow-hidden select-none font-outfit">
      {/* ===== HUD BAR (36px) ===== */}
      <header className="shrink-0 min-h-10 bg-white border-b border-slate-200 shadow-sm flex flex-wrap items-center gap-2 px-3 py-2 z-30 sm:flex-nowrap sm:gap-3 sm:px-4 sm:py-0">
        <div className="hidden items-center gap-2 md:flex">
          <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
            <img src="/agape.png" alt="Agape Care" className="w-5 h-5 object-contain" />
          </div>
          <span className="text-[12px] font-semibold text-slate-900 tracking-wide">Agape Care</span>
        </div>
        <div className="hidden h-4 w-px bg-slate-200 sm:block" />
        <span className="flex items-center gap-1.5 text-[11px] font-semibold"><span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm" /><span className="text-slate-600">{fleetStats.live}/{drivers.length} live</span></span>
        <span className="hidden items-center gap-1.5 text-[11px] font-semibold sm:flex"><span className="w-2 h-2 rounded-full bg-blue-500 shadow-sm" /><span className="text-blue-700">{fleetStats.moving} moving</span></span>
        <span className="hidden items-center gap-1.5 text-[11px] font-semibold sm:flex"><span className="w-2 h-2 rounded-full bg-amber-400 shadow-sm" /><span className="text-amber-700">{fleetStats.stopped} stopped</span></span>
        <span className="text-emerald-600 text-[11px] font-black flex items-center gap-0.5"><span className="text-emerald-500">✓</span> {fleetStats.complete}</span>
        <span className="text-slate-400 text-[11px] font-semibold">| {fleetStats.remaining} remaining</span>
        <div className="hidden flex-1 sm:block" />
        <div className="relative flex items-center flex-1 max-w-[150px] sm:flex-initial sm:w-auto">
          <Search size={14} className="absolute left-2.5 text-slate-400 pointer-events-none" />
          <input
            value={hudSearch}
            onChange={(e) => setHudSearch(e.target.value)}
            placeholder="Search drivers..."
            className="h-7 w-full rounded-lg bg-slate-100 border border-slate-200 pl-8 pr-2 text-[11px] font-semibold text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all sm:w-40"
          />
          {hudSearch && <X size={14} className="absolute right-2 text-slate-400 cursor-pointer hover:text-slate-700" onClick={() => setHudSearch('')} />}
        </div>
        <div className="hidden h-4 w-px bg-slate-200 sm:block" />
        {myDriverProfile && (
          gpsActive ? (
            <button type="button" onClick={stopMyGpsTracking} className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-rose-50 text-rose-600 border border-rose-200 text-[11px] font-bold hover:bg-rose-100 transition-colors" title="Stop sharing GPS">
              <WifiOff size={13} /> Stop
            </button>
          ) : (
            <button type="button" onClick={startMyGpsTracking} className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold hover:bg-emerald-100 transition-colors" title="Share your GPS location on the map">
              <Wifi size={13} /> Share GPS
            </button>
          )
        )}
        <button type="button" onClick={runFleetAiAnalysis} disabled={fleetAiLoading} className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold hover:bg-indigo-100 disabled:opacity-50 transition-colors">
          {fleetAiLoading ? <Loader2 size={13} className="animate-spin" /> : <BrainCircuit size={13} />} AI
        </button>
        <button type="button" onClick={() => setIntelRefreshToken(t => t + 1)} className="flex items-center justify-center h-7 w-7 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors" title="Refresh view">
          <RefreshCw size={13} />
        </button>
      </header>

      {/* ===== COMMAND CENTER LAYOUT ===== */}
      <div className="flex-1 flex flex-col-reverse overflow-hidden bg-slate-50 md:flex-row">
        
        {/* ===== LEFT DATA PANEL ===== */}
        <CommandSidebar 
          driverSummaries={driverSummaries}
          todaysTrips={todaysTrips}
          unassignedTrips={unassignedTrips}
          selectedDriverId={selectedDriverId}
          setSelectedDriverId={setSelectedDriverId}
          setShowDetailModal={setShowDetailModal}
          hudSearch={hudSearch}
        />

        {/* ===== MAP AREA ===== */}
        <div className="flex-1 relative overflow-hidden bg-slate-100">
          {/* Interactive map container */}
          <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

          {/* Maps loading / error overlay */}
          {!mapsLoadError && !mapReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10">
              <div className="text-center">
                <Loader2 size={48} className="mx-auto text-blue-500 animate-spin" />
                <h3 className="mt-4 text-lg font-black text-slate-800">Loading Map...</h3>
              </div>
            </div>
          )}
          {mapsLoadError && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10">
              <div className="text-center bg-white p-8 rounded-3xl shadow-xl border border-slate-200">
                <Map size={48} className="mx-auto text-rose-500 mb-4" />
                <h3 className="text-xl font-black text-slate-900">Fleet Command Center</h3>
                <p className="mt-2 max-w-md text-sm font-medium text-slate-500">
                  {hasGoogleMapsConfigured() ? 'Could not load Google Maps. Check API key.' : 'Configure Google Maps API key to enable the map.'}
                </p>
              </div>
            </div>
          )}
          
          {/* Map Overlays */}
          <div className="absolute left-3 right-3 top-3 flex flex-wrap gap-2 z-20 md:left-4 md:right-auto md:top-4">
            <button type="button" onClick={() => setShowTraffic(t => !t)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md backdrop-blur-md border ${showTraffic ? 'bg-amber-500/90 text-white border-amber-400' : 'bg-white/90 text-slate-700 border-slate-200/50 hover:bg-white'}`}>
              🚦 Live Traffic
            </button>
            <button type="button" onClick={() => setShowClusters(c => !c)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md backdrop-blur-md border ${showClusters ? 'bg-indigo-500/90 text-white border-indigo-400' : 'bg-white/90 text-slate-700 border-slate-200/50 hover:bg-white'}`}>
              🌐 Clustering
            </button>
          </div>

          {/* Street View Split Panel */}
          {streetViewLoc && (
            <div className="absolute inset-x-0 bottom-0 h-[50%] z-30 bg-white border-t border-slate-200 flex flex-col shadow-2xl md:inset-x-auto md:bottom-auto md:right-0 md:top-0 md:h-full md:w-[450px] md:max-w-[90vw] md:border-l md:border-t-0">
              <div className="flex items-center justify-between px-4 h-14 border-b border-slate-200 bg-slate-50 shrink-0">
                <span className="text-slate-900 text-sm font-semibold flex items-center gap-2"><MapPin size={16} className="text-blue-600" /> Street View Entrance</span>
                <button onClick={() => setStreetViewLoc(null)} className="text-slate-400 hover:text-slate-700 p-1.5 bg-white rounded-md hover:bg-slate-100 transition-colors shadow-sm border border-slate-200"><X size={16} /></button>
              </div>
              <div ref={svContainerRef} className="flex-1 w-full bg-slate-100" />
            </div>
          )}

          {/* Trail toggle (when driver selected) */}
          {selectedDriver && driverTrailPoints.length >= 2 && (
            <button
              type="button"
              onClick={() => setShowTrail(p => !p)}
              className={`absolute right-4 bottom-8 z-20 flex items-center gap-1.5 h-9 px-4 rounded-xl bg-white/90 backdrop-blur-md border border-slate-200 text-xs font-bold shadow-lg transition-colors hover:bg-white ${showTrail ? 'text-blue-600' : 'text-slate-500'}`}
            >
              {trailLoading ? <Loader2 size={14} className="animate-spin" /> : <Map size={14} />}
              {showTrail ? `${driverTrailPoints.length} trail` : 'Show Trail'}
            </button>
          )}

          {/* Trail loading indicator */}
          {trailLoading && (
            <div className="absolute right-4 bottom-20 z-20 flex items-center gap-1.5 h-8 px-3 rounded-xl bg-white/90 backdrop-blur-md border border-slate-200 text-[11px] text-slate-500 font-medium shadow-lg">
              <Loader2 size={12} className="animate-spin" /> Loading trail...
            </div>
          )}
        </div>
      </div>

      {/* ===== DETAIL MODAL (full report) ===== */}
      {showDetailModal && selectedDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowDetailModal(false)}>
          <div className="relative w-full max-w-2xl max-h-[90dvh] mx-3 rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden font-outfit sm:mx-4 sm:max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-slate-100 bg-slate-50/50 sm:px-6 sm:py-5">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl font-black text-xl shadow-sm border ${
                  selectedSummary?.fresh && selectedSummary?.movementState === 'moving'
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    : selectedSummary?.fresh ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}>
                  {String(selectedDriver?.name || 'D').charAt(0)}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-black text-slate-900 leading-none mb-1 sm:text-xl">{selectedDriver.name || 'Unnamed driver'}</h2>
                  <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">{selectedDriver.vehicle || 'No vehicle'} <span className="text-slate-300">•</span> {formatAge(selectedSummary?.lastPing)}</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowDetailModal(false)} className="flex items-center justify-center h-8 w-8 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all shadow-sm">
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex overflow-x-auto px-4 pt-2 border-b border-slate-100 bg-white sm:px-6">
              {[
                { id: 'overview', label: 'Overview', icon: Gauge },
                { id: 'trips', label: 'Trips', icon: Route },
                { id: 'timeline', label: 'Timeline', icon: Activity },
              ].map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" onClick={() => setDetailTab(id)} className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold transition-all border-b-2 ${
                  detailTab === id ? 'text-blue-600 border-blue-600' : 'text-slate-500 border-transparent hover:text-slate-800'
                }`}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="max-h-[62dvh] overflow-y-auto overscroll-contain p-4 space-y-4 bg-slate-50/30 sm:max-h-[60vh] sm:p-6 sm:space-y-6">
              {/* OVERVIEW TAB */}
              {detailTab === 'overview' && (
                <>
                  {/* Time stats grid */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                    <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Moving</p>
                      <p className="mt-1 text-2xl font-black text-blue-600 tabular-nums">{formatTelemetryDuration(selectedTracking?.totalMovingMinutes || selectedSummary?.movingMinutes || 0)}</p>
                      <p className="text-[10px] font-semibold text-slate-500 mt-0.5 uppercase">today</p>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Stopped</p>
                      <p className="mt-1 text-2xl font-black text-amber-500 tabular-nums">{formatTelemetryDuration(selectedTracking?.totalStoppedMinutes || selectedSummary?.dwellMinutes || 0)}</p>
                      <p className="text-[10px] font-semibold text-slate-500 mt-0.5 uppercase">today</p>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Longest</p>
                      <p className="mt-1 text-2xl font-black text-rose-500 tabular-nums">{formatTelemetryDuration(selectedTracking?.longestStopMinutes || 0)}</p>
                      <p className="text-[10px] font-semibold text-slate-500 mt-0.5 uppercase">stop</p>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Miles</p>
                      <p className="mt-1 text-2xl font-black text-emerald-600 tabular-nums">{selectedTracking ? `${Number(selectedTracking.totalTrackedMiles || 0).toFixed(1)}` : '0.0'}</p>
                      <p className="text-[10px] font-semibold text-slate-500 mt-0.5 uppercase">tracked</p>
                    </div>
                  </div>

                  {/* Current status card */}
                  <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Current status</p>
                        <p className="mt-1 text-lg font-black text-slate-900">{formatMovementState(selectedSummary?.movementState)}</p>
                        {selectedTrip && (
                          <>
                            <p className="mt-2 text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                              <Navigation size={14} className="text-blue-500" />
                              {selectedTrip.patient || 'Unknown patient'}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">{selectedTrip.pickup} → {selectedTrip.dropoff}</p>
                          </>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Last ping</p>
                        <p className="mt-1 text-lg font-black text-slate-900 tabular-nums">{formatAge(selectedSummary?.lastPing)}</p>
                        <p className="text-xs font-semibold text-slate-500 mt-1">{selectedDriver?.speedMph ?? selectedDriver?.telemetry?.speedMph ?? 0} mph</p>
                      </div>
                    </div>
                  </div>

                  {/* Stops + upcoming summary */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                    <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Stops</p>
                      <p className="mt-1 text-2xl font-black text-slate-900 tabular-nums">{selectedTracking?.stopCount || 0}</p>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase mt-0.5">today</p>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Trips done</p>
                      <p className="mt-1 text-2xl font-black text-emerald-600 tabular-nums">{selectedSummary?.completed || 0}</p>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase mt-0.5">{selectedSummary?.upcoming?.length || 0} upcoming</p>
                    </div>
                  </div>

                  {/* Location coordinates */}
                  <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Coordinates</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-slate-700">{selectedPoint ? `${selectedPoint.lat.toFixed(6)}, ${selectedPoint.lng.toFixed(6)}` : 'No coordinates'}</p>
                    <p className="text-[11px] font-semibold text-slate-500 mt-1">Accuracy: {selectedDriver?.locationAccuracy ? `${Math.round(selectedDriver.locationAccuracy)}m` : 'Unknown'}</p>
                  </div>
                </>
              )}

              {/* TRIPS TAB */}
              {detailTab === 'trips' && (
                <>
                  {/* Active trips */}
                  {selectedSummary?.activeTrips && selectedSummary.activeTrips.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Active trips</h4>
                      <div className="space-y-3">
                        {selectedSummary.activeTrips.map(trip => {
                          const phase = getTripPhase(trip);
                          return (
                            <div key={trip.id} className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-base font-black text-slate-900 leading-tight">{trip.patient || 'Unknown client'}</p>
                                  <p className="text-xs font-semibold text-slate-500 mt-1">{trip.time || 'Will Call'} · {trip.status}</p>
                                </div>
                                <span className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-md border ${
                                  phase.color === 'blue' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                  phase.color === 'emerald' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                  'bg-amber-50 text-amber-700 border-amber-200'
                                }`}>{phase.label}</span>
                              </div>
                              <div className="mt-3 space-y-1.5 text-xs font-medium text-slate-600">
                                <p className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0 text-emerald-500" /> <span className="line-clamp-2">{trip.pickup}</span></p>
                                <p className="flex items-start gap-2"><ArrowRight size={14} className="mt-0.5 shrink-0 text-orange-500" /> <span className="line-clamp-2">{trip.dropoff}</span></p>
                              </div>
                              <div className="mt-4 flex gap-2">
                                <button type="button" onClick={() => openDirections(selectedPoint ? `${selectedPoint.lat},${selectedPoint.lng}` : '', phase.destination)} className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200 transition-colors">
                                  <Navigation size={13} /> Navigate
                                </button>
                                {triggerSmartAssign && (
                                  <button type="button" onClick={() => triggerSmartAssign(trip)} className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold hover:bg-indigo-100 transition-colors">
                                    <BrainCircuit size={13} /> AI
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
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Nearest pickups</h4>
                    <div className="space-y-3">
                      {nearestTrips.length === 0 && (
                        <p className="text-sm font-semibold text-slate-500 py-6 text-center border-2 border-dashed border-slate-200 rounded-xl">Select a driver with GPS to show nearest pickups.</p>
                      )}
                      {nearestTrips.slice(0, 5).map(({ trip, miles, etaMinutes }, index) => (
                        <div key={trip.id} className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-600 text-[10px] font-black text-white shrink-0">{index + 1}</span>
                                <p className="truncate text-base font-black text-slate-900">{trip.patient || 'Unknown client'}</p>
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-100 text-amber-700">{trip.status || 'Open'}</span>
                              </div>
                              <p className="mt-2 text-xs font-semibold text-slate-500 line-clamp-2">{trip.pickup}</p>
                              <p className="mt-1.5 text-[11px] font-semibold text-slate-600">{trip.time || 'Will Call'} · {formatMiles(miles)} · {formatEta(etaMinutes)}</p>
                            </div>
                            <div className="flex flex-col gap-2 shrink-0">
                              <button type="button" onClick={() => openDirections(selectedPoint ? `${selectedPoint.lat},${selectedPoint.lng}` : '', trip.pickup)} className="flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200 transition-colors">
                                <Navigation size={13} /> Route
                              </button>
                              {trip.status === 'Unassigned' && selectedDriver && assignTripToDriver && (
                                <button type="button" onClick={() => assignTripToDriver(trip.id, selectedDriver.id)} className="flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 transition-colors">
                                  <CheckCircle2 size={13} /> Assign
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
                      <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Upcoming ({selectedSummary.upcoming.length})</h4>
                      <div className="space-y-3">
                        {selectedSummary.upcoming.slice(0, 5).map(trip => (
                          <div key={trip.id} className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                            <p className="truncate text-base font-black text-slate-900">{trip.patient || 'Unknown client'}</p>
                            <p className="text-[11px] font-semibold text-slate-500 mt-1">{trip.time || 'Will Call'} · {trip.status}</p>
                            <p className="mt-2 line-clamp-2 text-xs font-medium text-slate-600">{trip.pickup}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Ride-share savings */}
                  {rideShareCandidates.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Ride-share savings</h4>
                      <div className="space-y-3">
                        {rideShareCandidates.map(candidate => (
                          <div key={candidate.id} className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-base font-black text-slate-900"><Zap size={14} className="inline text-amber-500 mr-1.5 mb-0.5" />{candidate.a.patient} + {candidate.b.patient}</p>
                                <p className="text-xs font-semibold text-slate-500 mt-1">{candidate.reason} · {candidate.timeGap}min gap · score {candidate.score}</p>
                                <p className="text-xs font-medium text-slate-600 mt-2 line-clamp-1">{candidate.a.pickup}</p>
                                <p className="text-xs font-medium text-slate-600 line-clamp-1">{candidate.b.pickup}</p>
                              </div>
                              <button type="button" onClick={() => setManualAssignTrip?.(candidate.a)} className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold hover:bg-blue-100 shrink-0 transition-colors">
                                <Route size={13} /> Work
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
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Breadcrumb trail</h4>
                    <div className="space-y-2">
                      {(selectedTracking?.breadcrumbs || []).slice(-12).reverse().map((sample, idx) => (
                        <div key={`${sample.at}-${idx}`} className="flex items-center gap-4 rounded-xl bg-white border border-slate-100 p-3 shadow-sm">
                          <span className={`w-2.5 h-2.5 shrink-0 rounded-full shadow-sm ${
                            sample.state === 'moving' ? 'bg-blue-500' : sample.state === 'stopped' ? 'bg-amber-400' : 'bg-slate-400'
                          }`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-black text-slate-900">{formatMovementState(sample.state)}</p>
                            <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{sample.lat?.toFixed?.(4) || sample.lat}, {sample.lng?.toFixed?.(4) || sample.lng}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-black text-slate-700 tabular-nums">{sample.speedMph || 0} mph</p>
                            <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{formatAge(sample.at)}</p>
                          </div>
                        </div>
                      ))}
                      {(!selectedTracking?.breadcrumbs || selectedTracking.breadcrumbs.length === 0) && (
                        <p className="text-sm font-semibold text-slate-500 py-6 text-center border-2 border-dashed border-slate-200 rounded-xl">No breadcrumb history yet.</p>
                      )}
                    </div>
                  </div>

                  {/* Stop events */}
                  <div>
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Stop events</h4>
                    <div className="space-y-2">
                      {(selectedTracking?.stopEvents || []).slice(-6).reverse().map((stop, index) => (
                        <div key={`${stop.startedAt || index}`} className="flex items-center gap-4 rounded-xl bg-white border border-slate-100 p-3 shadow-sm">
                          <span className="w-2.5 h-2.5 shrink-0 rounded-full bg-amber-400 shadow-sm" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-black text-slate-900">{formatTelemetryDuration(stop.minutes || 0)} stop</p>
                            <p className="text-[11px] font-semibold text-slate-500 mt-0.5 line-clamp-1">{stop.destination || stop.patient || 'Waiting location'}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[11px] font-black text-slate-700">{formatAge(stop.startedAt)}</p>
                            <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{stop.endedAt ? 'Closed' : 'Live'}</p>
                          </div>
                        </div>
                      ))}
                      {(!selectedTracking?.stopEvents || selectedTracking.stopEvents.length === 0) && (
                        <p className="text-sm font-semibold text-slate-500 py-6 text-center border-2 border-dashed border-slate-200 rounded-xl">No stop events recorded today.</p>
                      )}
                    </div>
                  </div>

                  {/* Telemetry stats */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Ping count</p>
                      <p className="mt-1 text-2xl font-black text-slate-900 tabular-nums">{selectedTracking?.totalPings || 0}</p>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">GPS age</p>
                      <p className="mt-1 text-2xl font-black text-slate-900 tabular-nums">{formatAge(selectedSummary?.lastPing)}</p>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Speed</p>
                      <p className="mt-1 text-2xl font-black text-slate-900 tabular-nums">{selectedDriver?.speedMph ?? selectedDriver?.telemetry?.speedMph ?? 0} mph</p>
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
