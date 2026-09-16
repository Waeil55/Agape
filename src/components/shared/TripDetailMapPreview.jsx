import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Navigation, Maximize, Minimize, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { designTokens } from '../../utils/designTokens';
import { openNavigation } from '../../utils/nativeActions';

const FALLBACK = () => <div className="flex items-center justify-center h-48"><div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>;

const MapPreview = ({ trip, expanded, onToggle, pickup, dropoff }) => {
  const tokens = designTokens;
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});

  const centerLat = trip?.pickup?.lat || trip?.dropoff?.lat || 39.7684;
  const centerLng = trip?.pickup?.lng || trip?.dropoff?.lng || -86.1581;

  const loadMap = useCallback(async () => {
    if (mapLoaded || mapError || !mapContainerRef.current) return;
    
    try {
      const { Map, Marker, InfoWindow } = await import('react-google-maps/api');
      
      const mapOptions = {
        center: { lat: centerLat, lng: centerLng },
        zoom: 13,
        disableDefaultUI: true,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        styles: [
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        ],
      };

      const pickupPos = pickup && trip?.pickup?.lat ? { lat: trip.pickup.lat, lng: trip.pickup.lng } : null;
      const dropoffPos = dropoff && trip?.dropoff?.lat ? { lat: trip.dropoff.lat, lng: trip.dropoff.lng } : null;

      const MapComponent = () => (
        <Map mapContainerStyle={{ width: '100%', height: expanded ? '60vh' : '200px' }} options={mapOptions}>
          {pickupPos && (
            <Marker
              position={pickupPos}
              icon={{ url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#10b981"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>') }}
            />
          )}
          {dropoffPos && (
            <Marker
              position={dropoffPos}
              icon={{ url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fb7185"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>') }}
            />
          )}
        </Map>
      );

      mapRef.current = MapComponent;
      setMapLoaded(true);
    } catch (err) {
      console.error('[MapPreview] Load error:', err);
      setMapError(true);
    }
  }, [centerLat, centerLng, expanded, pickup, dropoff, mapLoaded, mapError]);

  useEffect(() => {
    if (expanded && !mapLoaded && !mapError) {
      loadMap();
    }
  }, [expanded, mapLoaded, mapError, loadMap]);

  const handleNavPickup = () => openNavigation(pickup);
  const handleNavDropoff = () => openNavigation(dropoff);

  return (
    <div className={`rounded-2xl border overflow-hidden ${tokens.colors.background.secondary} ${tokens.elevation.sm}`}>
      <div className="px-4 py-3 flex items-center justify-between border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
            <MapPin size={18} className="text-blue-600" />
          </div>
          <h3 className="font-semibold text-slate-900">Route Map</h3>
        </div>
        <div className="flex items-center gap-2">
          <button 
            type="button" 
            onClick={handleNavPickup}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold touch-manipulation"
          >
            <Navigation size={12} className="inline mr-1" /> Pickup
          </button>
          <button 
            type="button" 
            onClick={handleNavDropoff}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold touch-manipulation"
          >
            <MapPin size={12} className="inline mr-1" /> Dropoff
          </button>
          <button 
            type="button" 
            onClick={onToggle}
            className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 touch-manipulation"
            aria-label={expanded ? 'Collapse map' : 'Expand map'}
          >
            {expanded ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        </div>
      </div>
      
      <div className="relative" style={{ height: expanded ? '60vh' : '200px' }}>
        {mapError ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mb-3">
              <AlertCircle size={24} className="text-rose-600" />
            </div>
            <p className="text-sm font-semibold text-slate-900">Map unavailable</p>
            <p className="text-xs text-slate-500 mt-1">Unable to load map preview</p>
            <div className="flex gap-2 mt-3">
              <button onClick={handleNavPickup} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold">Navigate Pickup</button>
              <button onClick={handleNavDropoff} className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-semibold">Navigate Dropoff</button>
            </div>
          </div>
        ) : !mapLoaded ? (
          <div className="flex items-center justify-center h-full bg-slate-50">
            <FALLBACK />
          </div>
        ) : (
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }}>
            {mapRef.current && React.createElement(mapRef.current)}
          </div>
        )}
        
        {!expanded && (
          <div className="absolute inset-0 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none" />
        )}
      </div>
    </div>
  );
};

export { MapPreview };
export default React.memo(MapPreview);