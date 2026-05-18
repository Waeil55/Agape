import React, { useState, useEffect } from 'react';
import { useGeminiOptimization } from '../config/ai';
import { calculateDistance, calculateETA } from '../utils/mapUtils';
import { Zap, Route, TrendingUp } from 'lucide-react';

const TripOptimizer = ({ trips, currentLocation }) => {
  const [optimizedSequence, setOptimizedSequence] = useState([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const { optimizeRoute } = useGeminiOptimization();

  const handleOptimize = async () => {
    if (trips.length === 0 || !currentLocation) return;

    setIsOptimizing(true);
    try {
      const tripsData = trips.map(trip => ({
        id: trip.id,
        pickupLat: trip.pickupCoordinates?.lat || 0,
        pickupLng: trip.pickupCoordinates?.lng || 0,
        dropoffLat: trip.dropoffCoordinates?.lat || 0,
        dropoffLng: trip.dropoffCoordinates?.lng || 0,
        urgency: trip.urgency || 'low',
        timeWindow: trip.timeWindow || null,
        clientName: trip.clientName
      }));

      const result = await optimizeRoute(tripsData, currentLocation);
      
      if (result && result.optimizedSequence) {
        setOptimizedSequence(result.optimizedSequence);
        setSuggestions(result.suggestions || []);
      }
    } catch (error) {
      console.error('Optimization error:', error);
    } finally {
      setIsOptimizing(false);
    }
  };

  if (trips.length === 0) return null;

  return (
    <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Route size={20} className="text-blue-600" />
          <h3 className="font-bold text-lg">Trip Optimizer</h3>
        </div>
        <button
          onClick={handleOptimize}
          disabled={isOptimizing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
        >
          <Zap size={16} />
          {isOptimizing ? 'Optimizing...' : 'Optimize Route'}
        </button>
      </div>

      {optimizedSequence.length > 0 && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-gray-800 p-3 rounded border-l-4 border-green-500">
            <p className="font-semibold text-green-700 dark:text-green-300 flex items-center gap-2">
              <TrendingUp size={16} />
              Recommended Order:
            </p>
            <ol className="list-decimal list-inside mt-2 space-y-1">
              {optimizedSequence.map((tripId, index) => {
                const trip = trips.find(t => t.id === tripId);
                return (
                  <li key={tripId} className="text-sm text-gray-700 dark:text-gray-300">
                    {index + 1}. <span className="font-semibold">{trip?.clientName}</span> - {trip?.bookingID}
                  </li>
                );
              })}
            </ol>
          </div>

          {suggestions.length > 0 && (
            <div className="bg-white dark:bg-gray-800 p-3 rounded">
              <p className="font-semibold mb-2 text-sm">💡 AI Suggestions:</p>
              <ul className="space-y-1">
                {suggestions.map((suggestion, index) => (
                  <li key={index} className="text-sm text-gray-700 dark:text-gray-300">• {suggestion}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TripOptimizer;