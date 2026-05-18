import React from 'react';
import { Phone, MapPin, Navigation, ChevronDown, AlertCircle } from 'lucide-react';

const TripCard = ({
  trip,
  isSelected,
  isExpanded,
  onToggleExpand,
  onStart,
  onCallClient,
  onNavigate,
  onSelect
}) => {
  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'high': return 'bg-red-100 border-red-300 text-red-800';
      case 'medium': return 'bg-yellow-100 border-yellow-300 text-yellow-800';
      default: return 'bg-green-100 border-green-300 text-green-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'in_progress': return '🚗';
      case 'completed': return '✅';
      default: return '📋';
    }
  };

  const canRideShare = trip.rideShareable ? '🤝 Can share' : '';

  return (
    <div className="w-full">
      {/* Compact View */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">{getStatusIcon(trip.status)}</span>
            <div>
              <p className="font-bold text-lg">{trip.bookingID}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{trip.clientName}</p>
            </div>
          </div>

          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <MapPin size={16} className="text-blue-500" />
              <span className="text-gray-700 dark:text-gray-300">{trip.pickupAddress}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin size={16} className="text-red-500" />
              <span className="text-gray-700 dark:text-gray-300">{trip.dropoffAddress}</span>
            </div>
          </div>

          {trip.notes && (
            <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded text-sm text-gray-700 dark:text-gray-300">
              📝 {trip.notes}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 ml-2">
          <div className={`px-2 py-1 rounded text-xs font-semibold ${getUrgencyColor(trip.urgency || 'low')}`}>
            {trip.urgency || 'Normal'}
          </div>
          {canRideShare && <div className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">{canRideShare}</div>}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCallClient();
          }}
          className="flex items-center gap-1 px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
        >
          <Phone size={16} /> Call
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            const pickup = trip.pickupCoordinates || { lat: 0, lng: 0 };
            onNavigate(pickup.lat, pickup.lng);
          }}
          className="flex items-center gap-1 px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
        >
          <Navigation size={16} /> Navigate
        </button>
        {trip.status === 'pending' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStart();
            }}
            className="flex-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-semibold text-sm"
          >
            Start Trip
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="px-3 py-2 bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-white rounded hover:bg-gray-400 text-sm"
        >
          <ChevronDown size={16} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </div>
  );
};

export default TripCard;