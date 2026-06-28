/**
 * Real-time ETA Calculation
 * Calculates ETA to pickup/dropoff based on current position
 */

export function calculateETA(currentLat, currentLng, destLat, destLng, avgSpeedMph = 30) {
  if (!currentLat || !currentLng || !destLat || !destLng) return null;

  const distance = getDistanceMiles(currentLat, currentLng, destLat, destLng);
  if (distance === null) return null;

  const etaMinutes = (distance / avgSpeedMph) * 60;
  const etaArrival = new Date(Date.now() + etaMinutes * 60 * 1000);

  return {
    distance: Math.round(distance * 100) / 100,
    minutes: Math.round(etaMinutes),
    arrival: etaArrival,
    arrivalTime: etaArrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

export function getDistanceMiles(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;

  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

export function formatETAMinutes(minutes) {
  if (!minutes && minutes !== 0) return '--';
  if (minutes < 1) return 'Arriving';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

export function formatETADistance(miles) {
  if (!miles && miles !== 0) return '--';
  if (miles < 0.1) return 'Nearby';
  return `${miles.toFixed(1)} mi`;
}

export function getETAColor(minutes) {
  if (!minutes) return 'text-slate-400';
  if (minutes <= 5) return 'text-emerald-600';
  if (minutes <= 15) return 'text-blue-600';
  if (minutes <= 30) return 'text-amber-600';
  return 'text-slate-600';
}

export function getETABackgroundColor(minutes) {
  if (!minutes) return 'bg-slate-100';
  if (minutes <= 5) return 'bg-emerald-50';
  if (minutes <= 15) return 'bg-blue-50';
  if (minutes <= 30) return 'bg-amber-50';
  return 'bg-slate-50';
}

export default {
  calculateETA,
  getDistanceMiles,
  formatETAMinutes,
  formatETADistance,
  getETAColor,
  getETABackgroundColor,
};
