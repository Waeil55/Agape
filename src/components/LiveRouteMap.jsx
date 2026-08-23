import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GOOGLE_MAPS_AUTH_FAILURE_EVENT, loadGoogleMapsApi } from '../hooks/useGoogleMaps';

const pointFromPosition = (position) => {
  const lat = Number(position?.lat);
  const lng = Number(position?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

const routeLocation = (stop) => {
  const point = pointFromPosition(stop);
  return point || String(stop?.label || stop?.address || '').trim() || null;
};

const LiveRouteMap = ({ ordered = [], driverPosition = null, className = '' }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const rendererRef = useRef(null);
  const observerRef = useRef(null);
  const resizeFrame = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [routeError, setRouteError] = useState('');

  const hasGeoStops = ordered.some((stop) => routeLocation(stop));
  const routePlanKey = useMemo(() => JSON.stringify({
    driver: pointFromPosition(driverPosition),
    stops: ordered.map((stop) => ({
      id: stop?.id || '',
      location: routeLocation(stop),
    })),
  }), [driverPosition?.lat, driverPosition?.lng, ordered]);

  const clearRoute = useCallback(() => {
    rendererRef.current?.set('directions', null);
    setRouteError('');
  }, []);

  const calcRoute = useCallback(async () => {
    if (!mapReady || !rendererRef.current || !hasGeoStops) return;
    const locations = ordered.map(routeLocation).filter(Boolean);
    const fallbackOrigin = pointFromPosition(driverPosition);
    if (locations.length === 1 && fallbackOrigin) locations.unshift(fallbackOrigin);
    if (locations.length < 2) {
      clearRoute();
      return;
    }
    if (locations.length > 25) {
      clearRoute();
      setRouteError('Map preview supports 25 locations. Split this route before navigation.');
      return;
    }

    try {
      const maps = window.google.maps;
      const response = await new maps.DirectionsService().route({
        origin: locations[0],
        destination: locations[locations.length - 1],
        waypoints: locations.slice(1, -1).map((location) => ({ location, stopover: true })),
        travelMode: maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      });
      rendererRef.current.setDirections(response);
      setRouteError('');
    } catch (error) {
      clearRoute();
      setRouteError(error?.message || 'Route preview is unavailable.');
    }
  }, [clearRoute, driverPosition, hasGeoStops, mapReady, ordered]);

  useEffect(() => {
    let cancelled = false;
    const handleAuthFailure = () => {
      if (!cancelled) setRouteError('Google Maps rejected this site. Navigation controls remain available.');
    };
    window.addEventListener(GOOGLE_MAPS_AUTH_FAILURE_EVENT, handleAuthFailure);
    Promise.resolve(loadGoogleMapsApi()).then(() => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      if (!window.google?.maps) return;
      const maps = window.google.maps;
      const center = pointFromPosition(driverPosition) || { lat: 39.7684, lng: -86.1581 };
      mapRef.current = new maps.Map(containerRef.current, {
        center,
        zoom: 11,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
      });
      rendererRef.current = new maps.DirectionsRenderer({
        map: mapRef.current,
        suppressMarkers: false,
        preserveViewport: false,
        polylineOptions: { strokeColor: '#2563eb', strokeOpacity: 0.86, strokeWeight: 5 },
      });

      // Observe only startup so we can announce a ready map without leaving it attached.
      let observer = new MutationObserver(() => {
        if (!containerRef.current?.querySelector('.gm-style')) return;
        observer?.disconnect();
        observer = null;
        observerRef.current = null;
        if (!cancelled) setMapReady(true);
      });
      observerRef.current = observer;
      observer.observe(containerRef.current, { childList: true, subtree: true });
      window.setTimeout(() => {
        observer?.disconnect();
        observer = null;
        observerRef.current = null;
        if (!cancelled) setMapReady(true);
      }, 3000);
    }).catch(() => {
      if (!cancelled) setRouteError('Map preview could not be loaded. Navigation controls remain available.');
    });

    return () => {
      cancelled = true;
      window.removeEventListener(GOOGLE_MAPS_AUTH_FAILURE_EVENT, handleAuthFailure);
      observerRef.current?.disconnect();
      observerRef.current = null;
      rendererRef.current?.setMap(null);
      rendererRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return undefined;
    const handleResize = () => {
      if (resizeFrame.current !== null) cancelAnimationFrame(resizeFrame.current);
      resizeFrame.current = requestAnimationFrame(() => {
        resizeFrame.current = null;
        if (mapRef.current) window.google.maps.event.trigger(mapRef.current, 'resize');
      });
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeFrame.current !== null) cancelAnimationFrame(resizeFrame.current);
      resizeFrame.current = null;
    };
  }, [mapReady]);

  useEffect(() => {
    if (!routePlanKey) return;
    void calcRoute();
    return clearRoute;
  }, [calcRoute, clearRoute, routePlanKey]);

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ${className}`}>
      <div ref={containerRef} className="h-48 w-full" role="region" aria-label="Live route preview" />
      {routeError && <div role="status" className="border-t border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{routeError}</div>}
    </div>
  );
};

export default React.memo(LiveRouteMap);
