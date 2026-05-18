// Google Maps Distance Matrix and Utilities

export const calculateDistance = (lat1, lng1, lat2, lng2) => {
  // Haversine formula for approximate distance
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

export const calculateETA = (distance, avgSpeed = 40) => {
  // Calculate ETA in minutes based on average speed (km/h)
  return Math.round((distance / avgSpeed) * 60);
};

export const getGoogleMapsUrl = (lat, lng) => {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
};

export const getDirectionsUrl = (origin, destination, mode = 'driving') => {
  const encodedOrigin = encodeURIComponent(origin);
  const encodedDestination = encodeURIComponent(destination);
  return `https://www.google.com/maps/dir/?api=1&origin=${encodedOrigin}&destination=${encodedDestination}&travelmode=${mode}`;
};

export const calculateOptimalRoute = (startPoint, locations) => {
  // Simple nearest neighbor algorithm for route optimization
  const visited = new Set();
  const route = [];
  let current = startPoint;

  while (visited.size < locations.length) {
    let nearestIndex = -1;
    let nearestDistance = Infinity;

    locations.forEach((location, index) => {
      if (!visited.has(index)) {
        const distance = calculateDistance(
          current.lat,
          current.lng,
          location.lat,
          location.lng
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      }
    });

    if (nearestIndex !== -1) {
      visited.add(nearestIndex);
      route.push(locations[nearestIndex]);
      current = locations[nearestIndex];
    }
  }

  return route;
};

export const formatETA = (minutes) => {
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${Math.round(mins)}m`;
};

export const getLocationDistance = (location1, location2) => {
  return calculateDistance(
    location1.lat,
    location1.lng,
    location2.lat,
    location2.lng
  );
};
