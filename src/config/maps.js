import { GOOGLE_MAPS_API_KEY } from './firebase';

export function hasGoogleMapsConfigured() {
  return Boolean(GOOGLE_MAPS_API_KEY());
}

export function extractZipFromAddress(address) {
  const match = String(address || '').match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : '';
}

export function haversineMiles(pointA, pointB) {
  if (pointA?.lat == null || pointA?.lng == null || pointB?.lat == null || pointB?.lng == null) return null;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(pointB.lat - pointA.lat);
  const dLng = toRad(pointB.lng - pointA.lng);
  const lat1 = toRad(pointA.lat);
  const lat2 = toRad(pointB.lat);

  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

function toLocationQuery(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.lat === 'number' && typeof value.lng === 'number') return `${value.lat},${value.lng}`;
  return '';
}

export async function geocodeAddress(address) {
  if (!hasGoogleMapsConfigured() || !address) return null;

  try {
    const resp = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY()}`
    );
    const data = await resp.json();
    const result = data?.results?.[0];
    if (!result?.geometry?.location) return null;

    const postalCode = result.address_components?.find((part) => part.types?.includes('postal_code'))?.long_name || extractZipFromAddress(address);
    const city = result.address_components?.find((part) => part.types?.includes('locality'))?.long_name || '';
    const state = result.address_components?.find((part) => part.types?.includes('administrative_area_level_1'))?.short_name || '';

    return {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formattedAddress: result.formatted_address || address,
      placeId: result.place_id || null,
      postalCode,
      city,
      state,
    };
  } catch (err) {
    console.error('[Google Maps] geocodeAddress failed:', err);
    return null;
  }
}

export async function getDistanceMatrix(origins, destinations) {
  const originQueries = origins.map(toLocationQuery).filter(Boolean);
  const destinationQueries = destinations.map(toLocationQuery).filter(Boolean);
  if (!hasGoogleMapsConfigured() || originQueries.length === 0 || destinationQueries.length === 0) return null;

  try {
    const params = new URLSearchParams({
      origins: originQueries.join('|'),
      destinations: destinationQueries.join('|'),
      units: 'imperial',
      key: GOOGLE_MAPS_API_KEY(),
    });
    const resp = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`);
    const data = await resp.json();
    if (data?.status !== 'OK') {
      console.warn('[Google Maps] Distance Matrix API error:', data?.status, data?.error_message);
      return null;
    }
    return data.rows || null;
  } catch (err) {
    console.error('[Google Maps] getDistanceMatrix failed:', err);
    return null;
  }
}

export async function getTravelDuration(origin, destination) {
  if (!origin || !destination) return null;
  const rows = await getDistanceMatrix([origin], [destination]);
  const durationSeconds = rows?.[0]?.elements?.[0]?.duration?.value;
  const distanceMeters = rows?.[0]?.elements?.[0]?.distance?.value;
  if (typeof durationSeconds !== 'number' || typeof distanceMeters !== 'number') return null;
  return {
    durationSeconds,
    durationText: rows[0].elements[0].duration.text,
    distanceMiles: distanceMeters / 1609.344,
    distanceText: rows[0].elements[0].distance.text,
  };
}

export async function getDistanceMiles(origin, destination) {
  if (!origin || !destination) return null;

  if (typeof origin !== 'string' && typeof destination !== 'string' && origin.lat != null && origin.lng != null && destination.lat != null && destination.lng != null) {
    return haversineMiles(origin, destination);
  }

  const rows = await getDistanceMatrix([origin], [destination]);
  const distanceMeters = rows?.[0]?.elements?.[0]?.distance?.value;
  if (typeof distanceMeters !== 'number') return null;
  return distanceMeters / 1609.344;
}

export function buildStaticMapUrl(markers = []) {
  if (!hasGoogleMapsConfigured() || markers.length === 0) return null;

  const serializedMarkers = markers
    .filter((marker) => typeof marker.lat === 'number' && typeof marker.lng === 'number')
    .map((marker) => `markers=color:${marker.color || 'blue'}%7Clabel:${marker.label || 'T'}%7C${marker.lat},${marker.lng}`)
    .join('&');

  if (!serializedMarkers) return null;
    return `https://maps.googleapis.com/maps/api/staticmap?size=1200x700&maptype=roadmap&${serializedMarkers}&key=${GOOGLE_MAPS_API_KEY()}`;
}