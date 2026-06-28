import { useState, useRef, useCallback } from 'react';

export default function useMapRoute() {
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const directionsRef = useRef(null);
  const lastReq = useRef(0);

  const clear = useCallback(() => {
    setRoute(null);
    setError(null);
  }, []);

  const calculate = useCallback((origin, waypoints, destination) => {
    if (!window.google || !origin || !destination) return;
    const now = Date.now();
    if (now - lastReq.current < 2000) return;
    lastReq.current = now;

    setLoading(true);
    setError(null);

    const waypointObjs = (waypoints || []).filter(Boolean).map(w => ({
      location: typeof w === 'string' ? w : `${w.lat},${w.lng}`,
      stopover: true,
    }));

    const svc = new window.google.maps.DirectionsService();
    svc.route(
      {
        origin: typeof origin === 'string' ? origin : `${origin.lat},${origin.lng}`,
        destination: typeof destination === 'string' ? destination : `${destination.lat},${destination.lng}`,
        waypoints: waypointObjs,
        travelMode: window.google.maps.TravelMode.DRIVING,
        drivingOptions: { departureTime: new Date(), trafficModel: 'bestguess' },
        unitSystem: window.google.maps.UnitSystem.IMPERIAL,
        optimizeWaypoints: false,
      },
      (result, status) => {
        setLoading(false);
        if (status === 'OK') {
          setRoute(result);
          setError(null);
        } else {
          setError(status);
          setRoute(null);
        }
      }
    );
  }, []);

  return { route, loading, error, calculate, clear, directionsRef };
}
