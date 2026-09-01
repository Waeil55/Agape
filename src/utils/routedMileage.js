import { loadGoogleMapsApi } from '../hooks/useGoogleMaps';

const METERS_PER_MILE = 1609.344;

export async function getGoogleDrivingRouteMiles(origin, destination) {
  if (!origin || !destination) throw new Error('A route origin and destination are required.');
  const maps = await loadGoogleMapsApi();
  if (!maps?.DirectionsService || !maps?.TravelMode?.DRIVING) {
    throw new Error('Google driving directions are unavailable.');
  }

  const response = await new Promise((resolve, reject) => {
    new maps.DirectionsService().route({
      origin,
      destination,
      travelMode: maps.TravelMode.DRIVING,
    }, (result, status) => {
      if (status === 'OK' && result?.routes?.[0]?.legs?.length) resolve(result);
      else reject(new Error(`Google driving route failed: ${status || 'UNKNOWN_ERROR'}`));
    });
  });

  const meters = response.routes[0].legs.reduce((sum, leg) => sum + Number(leg?.distance?.value || 0), 0);
  if (!Number.isFinite(meters) || meters <= 0) throw new Error('Google returned no driving distance for this home route.');
  return meters / METERS_PER_MILE;
}
