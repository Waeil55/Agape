import React, { useEffect, useState } from 'react';
import { MapPin, AlertCircle } from 'lucide-react';

const LocationTracker = ({ onLocationUpdate }) => {
  const [location, setLocation] = useState(null);
  coif (!navigator.geolocation) {
      setError('Geolocation not supported');
      return;
    }

    const updateLocation = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy: acc } = position.coords;
          const locationData = {
            lat: latitude,
            lng: longitude,
            timestamp: new Date().toISOString()
          };
          setLocation(locationData);
          setAccuracy(Math.round(acc));
          setError(null);
          onLocationUpdate?.(locationData);
        },
        (err) => {
          console.error('Geolocation error:', err);
          setError('Unable to get location');
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    };

    updateLocation();
    const interval = setInterval(updateLocation, 5000);

    return () => clearInterval(interval);
  }, [onLocationUpdatenst interval = setInterval(updateLocation, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-blue-100 dark:bg-blue-900 border-b-2 border-blue-500 p-3">
      <div className="flex items-center gap-2">
        <MapPin size={18} className="text-blue-600 dark:text-blue-400" />
        {error ? (
          <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
            <AlertCircle size={16} />
            <span className="text-sm">{error}</span>
          </div>
        ) : location ? (
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <span>📍 {location.lat.toFixed(4)}, {location.lng.toFixed(4)}</span>
            {accuracy && <span className="ml-2 text-xs opacity-75">Accuracy: ±{accuracy}m</span>}
          </div>
        ) : (
          <span className="text-sm text-blue-700 dark:text-blue-300">📍 Getting location...</span>\n        )}\n      </div>\n    </div>\n  );
};

export default LocationTracker;