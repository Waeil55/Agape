import { useState, useEffect } from 'react';
import { GOOGLE_MAPS_API_KEY } from '../config/firebase';

let loadingPromise = null;
let loaded = false;

export default function useGoogleMaps() {
  const [ready, setReady] = useState(loaded);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (loaded) return;
    if (loadingPromise) {
      loadingPromise.then(() => { setReady(true); }).catch(setError);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,directions,geometry&v=weekly`;
    script.async = true;
    script.defer = true;
    loadingPromise = new Promise((resolve, reject) => {
      script.onload = () => { loaded = true; setReady(true); resolve(); };
      script.onerror = () => { const e = new Error('Google Maps API failed to load'); setError(e); reject(e); };
    });
    document.head.appendChild(script);
    return () => { /* keep script loaded */ };
  }, []);

  return { ready, error };
}
