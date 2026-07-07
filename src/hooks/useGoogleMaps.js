import { useState, useEffect } from 'react';
import { GOOGLE_MAPS_API_KEY } from '../config/firebase';

let loadingPromise = null;
let loaded = false;

export function loadGoogleMapsApi() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) { resolve(window.google.maps); return; }
    const existing = document.getElementById('agape-gm-api');
    if (existing) {
      if (window.google && window.google.maps) { resolve(window.google.maps); return; }
      existing.addEventListener('load', () => {
        if (window.google && window.google.maps) resolve(window.google.maps);
        else reject(new Error('Google Maps failed to initialize'));
      }, { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Maps script failed to load')), { once: true });
      return;
    }
    if (!GOOGLE_MAPS_API_KEY()) { reject(new Error('Google Maps API key not configured')); return; }
    const script = document.createElement('script');
    script.id = 'agape-gm-api';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY()}&libraries=places,directions,geometry,drawing&v=weekly`;
    script.async = true;
    script.defer = true;
    loadingPromise = new Promise((res, rej) => {
      script.onload = () => {
        loaded = true;
        if (window.google && window.google.maps) res(window.google.maps);
        else rej(new Error('Google Maps failed to initialize'));
      };
      script.onerror = () => { loadingPromise = null; loaded = false; rej(new Error('Google Maps script failed to load')); };
    });
    document.head.appendChild(script);
    loadingPromise.then(resolve).catch(reject);
  });
}

export default function useGoogleMaps() {
  const [ready, setReady] = useState(loaded);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (loaded) return;
    if (loadingPromise) {
      loadingPromise.then(() => { setReady(true); }).catch(setError);
      return;
    }
    loadGoogleMapsApi().then(() => setReady(true)).catch(setError);
  }, []);

  return { ready, error };
}
