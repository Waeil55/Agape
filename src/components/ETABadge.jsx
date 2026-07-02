import React, { memo } from 'react';
import { Clock, Navigation, MapPin } from 'lucide-react';
import { calculateETA, formatETAMinutes, formatETADistance, getETAColor, getETABackgroundColor } from '../utils/eta';

export const ETABadge = memo(function ETABadge({ currentLat, currentLng, destLat, destLng, label, compact = false }) {
  const eta = calculateETA(currentLat, currentLng, destLat, destLng);

  if (!eta) return null;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${getETABackgroundColor(eta.minutes)} ${getETAColor(eta.minutes)}`}>
        <Clock size={10} />
        {formatETAMinutes(eta.minutes)}
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${getETABackgroundColor(eta.minutes)}`}>
      <Clock size={14} className={getETAColor(eta.minutes)} />
      <div>
        <p className={`text-xs font-bold ${getETAColor(eta.minutes)}`}>
          {formatETAMinutes(eta.minutes)}
        </p>
        <p className="text-[9px] text-slate-500">
          {formatETADistance(eta.distance)} · ETA {eta.arrivalTime}
        </p>
      </div>
    </div>
  );
}

export function TripETADisplay({ trip, driverPosition }) {
  if (!trip || !driverPosition) return null;

  const pickupCoords = trip.pickupLat && trip.pickupLng ? { lat: trip.pickupLat, lng: trip.pickupLng } : null;
  const dropoffCoords = trip.dropoffLat && trip.dropoffLng ? { lat: trip.dropoffLat, lng: trip.dropoffLng } : null;

  const isNavigating = ['Navigating Pickup', 'En Route', 'In Progress'].includes(trip.status);
  const isAtPickup = ['At Pickup', 'Arrived'].includes(trip.status);
  const isInTransit = ['In Transit', 'Navigating Dropoff', 'Transporting'].includes(trip.status);

  if (isNavigating && pickupCoords) {
    return (
      <ETABadge
        currentLat={driverPosition.lat}
        currentLng={driverPosition.lng}
        destLat={pickupCoords.lat}
        destLng={pickupCoords.lng}
        label="To Pickup"
      />
    );
  }

  if ((isAtPickup || isInTransit) && dropoffCoords) {
    return (
      <ETABadge
        currentLat={driverPosition.lat}
        currentLng={driverPosition.lng}
        destLat={dropoffCoords.lat}
        destLng={dropoffCoords.lng}
        label="To Dropoff"
      />
    );
  }

  return null;
});

export default ETABadge;
