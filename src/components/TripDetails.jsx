import React from 'react';
import { Clock, Phone, MapPin, FileText, User } from 'lucide-react';

const TripDetails = ({ trip }) => {
  return (
    <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded space-y-3 border-t border-gray-300 dark:border-gray-700">
      <h4 className="font-bold text-lg mb-3">Trip Details</h4>
      
      {/* Client Information */}
      <div className="space-y-2">
        <h5 className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-2">
          <User size={16} /> Client Information
        </h5>
        <div className="ml-6 space-y-1 text-sm">
          <p><strong>Name:</strong> {trip.clientName}</p>
          <p><strong>Phone:</strong> {trip.clientPhone}</p>
          <p><strong>Email:</strong> {trip.clientEmail || 'N/A'}</p>
          <p><strong>Booking ID:</strong> {trip.bookingID}</p>
        </div>
      </div>

      {/* Location Details */}
      <div className="space-y-2">
        <h5 className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-2">
          <MapPin size={16} /> Location Details
        </h5>
        <div className="ml-6 space-y-2 text-sm">
          <div>
            <p className="font-semibold text-blue-500">Pickup Location:</p>
            <p className="text-gray-700 dark:text-gray-300">{trip.pickupAddress}</p>
            {trip.pickupCoordinates && (
              <p className="text-xs text-gray-500">
                {trip.pickupCoordinates.lat.toFixed(4)}, {trip.pickupCoordinates.lng.toFixed(4)}
              </p>
            )}
          </div>
          <div>
            <p className="font-semibold text-red-500">Dropoff Location:</p>
            <p className="text-gray-700 dark:text-gray-300">{trip.dropoffAddress}</p>
            {trip.dropoffCoordinates && (
              <p className="text-xs text-gray-500">
                {trip.dropoffCoordinates.lat.toFixed(4)}, {trip.dropoffCoordinates.lng.toFixed(4)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Time Information */}
      <div className="space-y-2">
        <h5 className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-2">
          <Clock size={16} /> Schedule
        </h5>
        <div className="ml-6 space-y-1 text-sm">
          <p><strong>Scheduled Pickup:</strong> {trip.scheduledPickupTime ? new Date(trip.scheduledPickupTime).toLocaleString() : 'N/A'}</p>
          <p><strong>Time Window:</strong> {trip.timeWindow || 'Flexible'}</p>
          {trip.startTime && <p><strong>Started:</strong> {new Date(trip.startTime).toLocaleString()}</p>}
          {trip.endTime && <p><strong>Completed:</strong> {new Date(trip.endTime).toLocaleString()}</p>}
        </div>
      </div>

      {/* Odometer Details */}
      {(trip.startOdometer || trip.endOdometer) && (
        <div className="space-y-2">
          <h5 className="font-semibold text-blue-600 dark:text-blue-400">Odometer Readings</h5>
          <div className="ml-6 space-y-1 text-sm">
            {trip.startOdometer && <p><strong>Start:</strong> {trip.startOdometer} km</p>}
            {trip.endOdometer && <p><strong>End:</strong> {trip.endOdometer} km</p>}
            {trip.startOdometer && trip.endOdometer && (
              <p className="font-semibold text-green-600">Distance: {trip.endOdometer - trip.startOdometer} km</p>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      {trip.notes && (
        <div className="space-y-2">
          <h5 className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-2">
            <FileText size={16} /> Notes
          </h5>
          <p className="ml-6 text-sm bg-yellow-50 dark:bg-yellow-900 p-2 rounded text-gray-700 dark:text-gray-300">
            {trip.notes}
          </p>
        </div>
      )}

      {/* Dispatcher Confirmation Section */}
      <div className="border-t pt-3 mt-3">
        <h5 className="font-semibold text-blue-600 dark:text-blue-400">Dispatcher Signature Confirmation</h5>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          ✓ Physical paper signature collected at pickup location
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          ✓ Digital confirmation pending from dispatcher/admin
        </p>
      </div>

      {/* Ride Share Info */}
      {trip.rideShareable && (
        <div className="bg-purple-50 dark:bg-purple-900 p-2 rounded text-sm text-purple-800 dark:text-purple-200">
          🤝 This trip can be combined with nearby trips for ride-sharing
        </div>
      )}
    </div>
  );
};

export default TripDetails;
