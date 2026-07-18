import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import useGoogleMaps from '../hooks/useGoogleMaps';
import useMapRoute from '../hooks/useMapRoute';
import { lightStyle, darkStyle } from '../utils/mapStyles';
import { Map, Maximize2, Minimize2, Navigation, Sun, Moon, Crosshair, ChevronRight, MapPin, Circle, ExternalLink } from 'lucide-react';

const pulseCss = `
@keyframes pulse-dot {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.5); opacity: 0.5; }
}
@keyframes pulse-ring {
  0% { transform: scale(1); opacity: 0.4; }
  100% { transform: scale(2.5); opacity: 0; }
}
.map-pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
.map-pulse-ring { animation: pulse-ring 2s ease-out infinite; }
`;

const stopIcons = {
  driver: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#2563eb" stroke="#fff" stroke-width="3"/><circle cx="12" cy="12" r="4" fill="#fff"/></svg>'),
  pickup: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40"><path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.268 21.732 0 14 0z" fill="#10b981" stroke="#fff" stroke-width="2"/><text x="14" y="18" text-anchor="middle" fill="#fff" font-size="12" font-weight="bold">P</text></svg>'),
  dropoff: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40"><path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.268 21.732 0 14 0z" fill="#ef4444" stroke="#fff" stroke-width="2"/><text x="14" y="18" text-anchor="middle" fill="#fff" font-size="12" font-weight="bold">D</text></svg>'),
  waypoint: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36"><path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24C24 5.373 18.627 0 12 0z" fill="#6366f1" stroke="#fff" stroke-width="2"/><text x="12" y="16" text-anchor="middle" fill="#fff" font-size="11" font-weight="bold">S</text></svg>'),
};

const LiveRouteMap = React.memo(({
  driverPosition,
  trips = [],
  aiSequence,
  activeTripId,
  theme = 'light',
  onOpenInNav,
  currentUser,
  role,
}) => {
  const { ready, error: mapsError } = useGoogleMaps();
  const { route, loading: routeLoading, error: routeError, calculate: calcRoute, clear: clearRoute } = useMapRoute();

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const dirRenderer = useRef(null);
  const driverMarker = useRef(null);
  const markersRef = useRef([]);
  const boundsRef = useRef(null);
  const resizeObs = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [mapTheme, setMapTheme] = useState(theme);
  const [selectedStop, setSelectedStop] = useState(null);
  const [initError, setInitError] = useState(null);
  const mapReady = useRef(false);

  const ordered = useMemo(() => {
    if (aiSequence && aiSequence.length) {
      return [...trips].sort((a, b) => aiSequence.indexOf(a.id) - aiSequence.indexOf(b.id));
    }
    return trips;
  }, [trips, aiSequence]);

  const stops = useMemo(() => {
    const s = [];
    ordered.forEach((t, i) => {
      if (t.pickupLat && t.pickupLng) {
        s.push({ id: `${t.id}-pickup`, lat: t.pickupLat, lng: t.pickupLng, label: `${i + 1}`, type: 'pickup', patient: t.patient, address: t.pickup, trip: t });
      } else if (t.pickup) {
        s.push({ id: `${t.id}-pickup`, address: t.pickup, label: `${i + 1}`, type: 'pickup', patient: t.patient, trip: t });
      }
      if (t.dropoffLat && t.dropoffLng) {
        s.push({ id: `${t.id}-dropoff`, lat: t.dropoffLat ?? null, lng: t.dropoffLng ?? null, label: `${i + 1}D`, type: 'dropoff', patient: t.patient, address: t.dropoff, trip: t });
      } else if (t.dropoff) {
        s.push({ id: `${t.id}-dropoff`, address: t.dropoff, label: `${i + 1}D`, type: 'dropoff', patient: t.patient, trip: t });
      }
    });
    return s;
  }, [ordered]);

  const hasGeoStops = useMemo(() => stops.some(s => s.lat && s.lng), [stops]);

  // Init map
  useEffect(() => {
    if (!ready || mapInstance.current) return;
    mapReady.current = false;
    const el = mapRef.current;
    if (!el) return;
    if (!window.google?.maps) { setInitError('Google Maps API not available'); return; }

    let observer = null;
    let map = null;
    let timeoutId = null;
    try {
      map = new window.google.maps.Map(el, {
        center: driverPosition ? { lat: driverPosition.lat, lng: driverPosition.lng } : { lat: 39.8283, lng: -98.5795 },
        zoom: 12,
        mapTypeId: 'roadmap',
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: { position: window.google.maps.ControlPosition.RIGHT_CENTER },
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: 'greedy',
        styles: mapTheme === 'dark' ? darkStyle : lightStyle,
        minZoom: 3,
      });

      // Google Maps constructor does NOT throw for invalid key/billing — it renders an
      // error overlay ("Oops! Something went wrong...") synchronously into the container.
      // Detect and show our fallback instead.
      const errorText = el.textContent || '';
      if (errorText.includes('Oops') || errorText.includes('Something went wrong')) {
        setInitError('Maps JavaScript API is not enabled or billing is not set up for this API key.');
      } else {
        mapInstance.current = map;
        boundsRef.current = new window.google.maps.LatLngBounds();

        dirRenderer.current = new window.google.maps.DirectionsRenderer({
          suppressMarkers: true,
          preserveViewport: false,
          polylineOptions: {
            strokeColor: '#3b82f6',
            strokeOpacity: 0.9,
            strokeWeight: 5,
          },
        });
        dirRenderer.current.setMap(map);

        mapReady.current = true;
        setInitError(null);

        // Watch for any delayed error overlay injection
        observer = new MutationObserver(() => {
          if (el && (el.textContent.includes('Oops') || el.textContent.includes('Something went wrong'))) {
            observer.disconnect();
            if (timeoutId) clearTimeout(timeoutId);
            setInitError('Maps JavaScript API is not enabled or billing is not set up for this API key.');
            mapReady.current = false;
            mapInstance.current = null;
            dirRenderer.current = null;
          }
        });
        observer.observe(el, { childList: true, subtree: true, characterData: true });

        // Backup: check again after a short delay in case the overlay is deferred
        timeoutId = setTimeout(() => {
          if (el && (el.textContent.includes('Oops') || el.textContent.includes('Something went wrong'))) {
            observer.disconnect();
            setInitError('Maps JavaScript API is not enabled or billing is not set up for this API key.');
            mapReady.current = false;
            mapInstance.current = null;
            dirRenderer.current = null;
          }
        }, 2000);
      }
    } catch (e) {
      setInitError('Google Maps initialization failed — check API key and billing.');
    }

    // ResizeObserver for container resizing
    try {
      resizeObs.current = new ResizeObserver(() => {
        if (mapInstance.current) window.google.maps.event.trigger(mapInstance.current, 'resize');
      });
      if (el) resizeObs.current.observe(el);
    } catch {}

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (observer) observer.disconnect();
      if (resizeObs.current) { resizeObs.current.disconnect(); resizeObs.current = null; }
      if (dirRenderer.current) { dirRenderer.current.setMap(null); dirRenderer.current = null; }
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];
      if (driverMarker.current) {
        if (driverMarker.current.pulseOverlay) driverMarker.current.pulseOverlay.setMap(null);
        if (driverMarker.current.dot) driverMarker.current.dot.setMap(null);
        driverMarker.current = null;
      }
      if (mapInstance.current) { mapInstance.current = null; }
      mapReady.current = false;
    };
  }, [ready]);

  // Update map theme
  useEffect(() => {
    if (!mapInstance.current) return;
    mapInstance.current.setOptions({ styles: mapTheme === 'dark' ? darkStyle : lightStyle });
  }, [mapTheme]);

  // Driver marker
  useEffect(() => {
    if (!mapInstance.current || !driverPosition) return;
    const pos = new window.google.maps.LatLng(driverPosition.lat, driverPosition.lng);
    if (driverMarker.current) {
      driverMarker.current.pulseOverlay.setPosition(pos);
      driverMarker.current.dot.setPosition(pos);
      return;
    }
    const pulseOverlay = new window.google.maps.Marker({
      position: pos,
      map: mapInstance.current,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 14,
        fillColor: '#3b82f6',
        fillOpacity: 0.15,
        strokeColor: '#3b82f6',
        strokeOpacity: 0.3,
        strokeWeight: 3,
      },
      zIndex: 1000,
      title: 'You',
    });
    const dot = new window.google.maps.Marker({
      position: pos,
      map: mapInstance.current,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: '#3b82f6',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 3,
      },
      zIndex: 1001,
      title: 'You',
      label: {
        text: '●',
        color: '#3b82f6',
        fontSize: '24px',
        fontWeight: 'bold',
        className: 'map-pulse-dot',
      },
    });
    driverMarker.current = { pulseOverlay, dot };
  }, [driverPosition]);

  // Stop markers
  useEffect(() => {
    if (!mapInstance.current || !mapReady.current) return;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    if (!boundsRef.current) boundsRef.current = new window.google.maps.LatLngBounds();

    const gm = window.google.maps;
    stops.forEach((s, i) => {
      if (!s.lat || !s.lng) return;
      const pos = new gm.LatLng(s.lat, s.lng);
      boundsRef.current.extend(pos);
      const color = s.type === 'pickup' ? '#10b981' : '#ef4444';
      const marker = new gm.Marker({
        position: pos,
        map: mapInstance.current,
        title: `${s.patient} (${s.type})`,
        zIndex: 100 - i,
        icon: {
          path: gm.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 3,
        },
        label: {
          text: s.label,
          color: '#fff',
          fontSize: '10px',
          fontWeight: 'bold',
        },
      });
      marker.addListener('click', () => setSelectedStop(s));
      markersRef.current.push(marker);
    });

    // Fit bounds
    if (stops.some(s => s.lat && s.lng) || driverPosition) {
      if (driverPosition) boundsRef.current.extend(new gm.LatLng(driverPosition.lat, driverPosition.lng));
      if (stops.some(s => s.lat && s.lng)) {
        mapInstance.current.fitBounds(boundsRef.current, 80);
      } else if (driverPosition) {
        mapInstance.current.setCenter(new gm.LatLng(driverPosition.lat, driverPosition.lng));
        mapInstance.current.setZoom(13);
      }
    }
  }, [stops]);

  // Directions route
  useEffect(() => {
    if (!mapInstance.current || !mapReady.current) return;
    if (ordered.length === 0 || !hasGeoStops) { clearRoute(); return; }

    const firstWithGeo = ordered.find(t => t.pickupLat && t.pickupLng);
    const lastWithGeo = [...ordered].reverse().find(t => t.dropoffLat && t.dropoffLng);
    if (!firstWithGeo || !lastWithGeo) return;

    const origin = driverPosition
      ? { lat: driverPosition.lat, lng: driverPosition.lng }
      : { lat: firstWithGeo.pickupLat, lng: firstWithGeo.pickupLng };

    const waypoints = [];
    ordered.forEach(t => {
      if (t.pickupLat && t.pickupLng) {
        const isFirst = t.id === ordered[0].id;
        if (!isFirst) waypoints.push({ lat: t.pickupLat, lng: t.pickupLng });
      }
      if (t.dropoffLat && t.dropoffLng) {
        const isLast = t.id === ordered[ordered.length - 1].id;
        if (!isLast) waypoints.push({ lat: t.dropoffLat, lng: t.dropoffLng });
      }
    });

    const destination = { lat: lastWithGeo.dropoffLat, lng: lastWithGeo.dropoffLng };
    calcRoute(origin, waypoints, destination);
  }, [ordered, hasGeoStops, driverPosition]);

  // Apply route to DirectionsRenderer
  useEffect(() => {
    if (!dirRenderer.current || !mapReady.current) return;
    if (route) {
      dirRenderer.current.setDirections(route);
    } else {
      dirRenderer.current.setMap(mapInstance.current);
      dirRenderer.current.setDirections({ routes: [] });
    }
  }, [route]);

  // Recenter
  const handleRecenter = useCallback(() => {
    if (!mapInstance.current || !driverPosition) return;
    mapInstance.current.setCenter({ lat: driverPosition.lat, lng: driverPosition.lng });
    mapInstance.current.setZoom(15);
  }, [driverPosition]);

  // Fullscreen
  const toggleFullscreen = useCallback(() => {
    const el = mapRef.current?.parentElement;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const etaText = useMemo(() => {
    if (!route || !route.routes?.[0]?.legs) return null;
    const legs = route.routes[0].legs;
    const totalSec = legs.reduce((s, l) => s + (l.duration?.value || 0), 0);
    const totalMi = legs.reduce((s, l) => s + (l.distance?.value || 0), 0) / 1609.344;
    const mins = Math.round(totalSec / 60);
    if (mins < 60) return `${mins} min • ${totalMi.toFixed(1)} mi`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m • ${totalMi.toFixed(1)} mi`;
  }, [route]);

  const showFallback = mapsError || initError || (!ready && typeof window.google?.maps === 'undefined' && !document.querySelector('script[src*="maps.googleapis.com"]'));

  if (showFallback) {
    const fallbackMsg = initError || mapsError?.message || 'Google Maps is not available for your account.';
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
        <Map size={28} className="mx-auto text-amber-400 mb-2" />
        <p className="text-sm font-semibold text-amber-800">Maps Unavailable</p>
        <p className="text-xs text-amber-600 mt-1 leading-relaxed max-w-xs mx-auto">{fallbackMsg}</p>
        <div className="flex gap-2 mt-3 justify-center">
          {ordered.length > 0 && (
            <>
              <button onClick={() => onOpenInNav && onOpenInNav(ordered[0]?.pickup)}
                className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95">
                <Navigation size={12} /> Start Route
              </button>
              {ordered.length > 1 && (
                <button onClick={() => onOpenInNav && onOpenInNav(ordered[ordered.length - 1]?.dropoff)}
                  className="px-3 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95">
                  <Navigation size={12} /> Last Drop
                </button>
              )}
            </>
          )}
          <a href="https://console.cloud.google.com/apis/enableflow?apiid=maps-backend.googleapis.com&project=agape-95c9f"
            target="_blank" rel="noopener noreferrer"
            className="px-3 py-2 bg-white border border-amber-300 text-amber-700 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95">
            <ExternalLink size={12} /> Enable API
          </a>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
        <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs font-medium text-slate-500">Loading map...</p>
      </div>
    );
  }

  return (
    <>
      <style>{pulseCss}</style>
      <div className={`relative rounded-xl overflow-hidden border border-slate-200/60 shadow-sm ${fullscreen ? 'fixed inset-0 z-[200] rounded-none border-0' : ''}`}>
        {/* Map Controls Overlay */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
          <button onClick={() => setMapTheme(p => p === 'light' ? 'dark' : 'light')}
            className="w-8 h-8 bg-white/90 backdrop-blur-md rounded-xl shadow-sm flex items-center justify-center text-slate-600 hover:bg-white active:scale-90 transition border border-slate-200/50">
            {mapTheme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
          </button>
          <button onClick={handleRecenter}
            className="w-8 h-8 bg-white/90 backdrop-blur-md rounded-xl shadow-sm flex items-center justify-center text-slate-600 hover:bg-white active:scale-90 transition border border-slate-200/50">
            <Crosshair size={14} />
          </button>
          <button onClick={toggleFullscreen}
            className="w-8 h-8 bg-white/90 backdrop-blur-md rounded-xl shadow-sm flex items-center justify-center text-slate-600 hover:bg-white active:scale-90 transition border border-slate-200/50">
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>

        {/* ETA Badge */}
        {etaText && (
          <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur-md rounded-xl px-3 py-1.5 shadow-sm border border-slate-200/50 flex items-center gap-1.5">
            <Navigation size={12} className="text-blue-600" />
            <span className="text-xs font-semibold text-slate-800">{etaText}</span>
          </div>
        )}

        {/* Route Loading */}
        {routeLoading && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-indigo-600/90 backdrop-blur-md rounded-xl px-3 py-1.5 shadow-sm flex items-center gap-1.5">
            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="text-xs font-semibold text-white">Calculating route...</span>
          </div>
        )}

        {/* Route Error */}
        {routeError && routeError !== 'ZERO_RESULTS' && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-rose-600/90 backdrop-blur-md rounded-xl px-3 py-1.5 shadow-sm">
            <span className="text-xs font-semibold text-white">Route unavailable</span>
          </div>
        )}

        {/* Stop Sequence Info */}
        {stops.length > 0 && !fullscreen && (
          <div className="absolute bottom-3 left-3 right-12 z-10">
            <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-sm border border-slate-200/50 p-2 max-h-20 overflow-x-auto flex items-center gap-1">
              {ordered.map((t, i) => {
                const isActive = t.id === activeTripId;
                const done = ['Completed', 'Cancelled', 'No Show'].includes(t.status);
                return (
                  <div key={t.id} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${isActive ? 'bg-blue-100 text-blue-700' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {done ? <Circle size={8} className="fill-emerald-500 text-emerald-500" /> : <span className="w-3.5 h-3.5 rounded-full bg-current text-white flex items-center justify-center text-xs leading-none">{i + 1}</span>}
                    <span className="break-words">{t.patient}</span>
                    {t.bookingId && <span className="rounded-full bg-white/80 px-1 py-0.5 text-[10px] font-black text-blue-700">{t.bookingId}</span>}
                    {i < ordered.length - 1 && <ChevronRight size={8} className="text-slate-300 shrink-0" />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected Stop Info */}
        {selectedStop && (
          <div className="absolute bottom-16 left-3 right-3 z-10" onClick={() => setSelectedStop(null)}>
            <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-sm border border-slate-200/50 p-3 flex items-center gap-3 cursor-pointer" onClick={e => e.stopPropagation()}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white ${selectedStop.type === 'pickup' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                {selectedStop.type === 'pickup' ? 'P' : 'D'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-900 break-words">{selectedStop.patient}</p>
                {selectedStop.trip?.bookingId && (
                  <p className="text-[10px] font-semibold text-blue-700">{selectedStop.trip.bookingId}</p>
                )}
                <p className="text-xs text-slate-500 truncate">{selectedStop.address}</p>
              </div>
              <button onClick={() => onOpenInNav && onOpenInNav(selectedStop.address)}
                className="px-3 h-7 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 active:scale-90 shrink-0">
                <Navigation size={9} /> Nav
              </button>
              <button onClick={() => setSelectedStop(null)} className="text-slate-300 hover:text-slate-500 shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* Map Container */}
        <div ref={mapRef} className={`w-full ${fullscreen ? 'h-full' : 'h-64 sm:h-80 md:h-96'}`} />

        {/* Attribution */}
        <div className="absolute bottom-1 right-2 z-10 text-xs text-slate-400 opacity-50 pointer-events-none select-none">
          &copy; Google Maps
        </div>
      </div>
    </>
  );
});

LiveRouteMap.displayName = 'LiveRouteMap';
export default LiveRouteMap;
