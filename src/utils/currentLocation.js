const LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 12000,
  maximumAge: 0,
};

export const normalizeCurrentPosition = (position) => {
  const coordinates = position?.coords || position;
  const lat = Number(coordinates?.latitude ?? coordinates?.lat);
  const lng = Number(coordinates?.longitude ?? coordinates?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const accuracy = Number(coordinates?.accuracy);
  const timestamp = Number(position?.timestamp);
  return {
    lat,
    lng,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    capturedAt: new Date(Number.isFinite(timestamp) ? timestamp : Date.now()).toISOString(),
  };
};

export const requestFreshCurrentLocation = async () => {
  const capacitorGeolocation = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()
    ? window.Capacitor?.plugins?.Geolocation
    : null;
  if (capacitorGeolocation?.getCurrentPosition) {
    try {
      const position = await capacitorGeolocation.getCurrentPosition(LOCATION_OPTIONS);
      const normalized = normalizeCurrentPosition(position);
      if (normalized) return normalized;
    } catch (_) {
      // Fall through to the browser API when the native bridge is unavailable.
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation?.getCurrentPosition) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(normalizeCurrentPosition(position)),
      () => resolve(null),
      LOCATION_OPTIONS,
    );
  });
};
