import { useState, useEffect } from 'react';
import { GOOGLE_MAPS_API_KEY } from '../config/firebase';

let loadingPromise = null;
let loaded = false;
export const GOOGLE_MAPS_AUTH_FAILURE_EVENT = 'agape:google-maps-auth-failure';

const registerAuthFailureBridge = () => {
  if (typeof window === 'undefined' || window.gm_authFailure?.agapeBridge) return;
  const previous = window.gm_authFailure;
  const bridge = () => {
    window.dispatchEvent(new Event(GOOGLE_MAPS_AUTH_FAILURE_EVENT));
    if (typeof previous === 'function') previous();
  };
  bridge.agapeBridge = true;
  window.gm_authFailure = bridge;
};

export function loadGoogleMapsApi() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google Maps requires a browser environment'));
  }
  registerAuthFailureBridge();
  if (window.google?.maps) {
    loaded = true;
    return Promise.resolve(window.google.maps);
  }
  if (loadingPromise) return loadingPromise;
  if (!GOOGLE_MAPS_API_KEY()) return Promise.reject(new Error('Google Maps API key not configured'));

  loadingPromise = new Promise((resolve, reject) => {
    const callbackName = '__agapeGoogleMapsReady';
    const clearCallback = () => {
      try { delete window[callbackName]; } catch { window[callbackName] = undefined; }
    };
    const finish = () => {
      if (!window.google?.maps) {
        loadingPromise = null;
        clearCallback();
        reject(new Error('Google Maps failed to initialize'));
        return;
      }
      loaded = true;
      clearCallback();
      resolve(window.google.maps);
    };
    const fail = () => {
      loadingPromise = null;
      loaded = false;
      clearCallback();
      reject(new Error('Google Maps script failed to load'));
    };
    window[callbackName] = finish;

    const existing = document.getElementById('agape-gm-api');
    if (existing) {
      existing.addEventListener('error', fail, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'agape-gm-api';
    const params = new URLSearchParams({
      key: GOOGLE_MAPS_API_KEY(),
      libraries: 'places,marker',
      loading: 'async',
      callback: callbackName,
      v: 'weekly',
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = fail;
    document.head.appendChild(script);
  });

  return loadingPromise;
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
