import { useState, useEffect, useRef, useCallback } from 'react';

export default function useGeolocation(options = {}) {
  const { enableHighAccuracy = true, timeout = 12000, maximumAge = 8000, minInterval = 8000, minDistance = 15 } = options;
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(false);
  const watchId = useRef(null);
  const lastUpdate = useRef(0);
  const lastLat = useRef(0);
  const lastLng = useRef(0);

  const start = useCallback(() => {
    if (!navigator.geolocation) { setError(new Error('Geolocation not supported')); return; }
    if (watchId.current !== null) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const now = Date.now();
        if (now - lastUpdate.current < minInterval) return;
        const dist = Math.sqrt(Math.pow(latitude - lastLat.current, 2) + Math.pow(longitude - lastLng.current, 2)) * 111320;
        if (dist < minDistance && lastUpdate.current > 0) return;
        lastUpdate.current = now;
        lastLat.current = latitude;
        lastLng.current = longitude;
        setPosition({ lat: latitude, lng: longitude, accuracy });
        setActive(true);
        setError(null);
      },
      (err) => {
        setError(err);
        setActive(false);
      },
      { enableHighAccuracy, timeout, maximumAge }
    );
    watchId.current = id;
  }, [enableHighAccuracy, timeout, maximumAge, minInterval, minDistance]);

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setActive(false);
  }, []);

  useEffect(() => {
    return () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); };
  }, []);

  return { position, error, active, start, stop };
}
