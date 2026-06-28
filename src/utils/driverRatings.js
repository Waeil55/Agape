/**
 * Customer Ratings & Feedback System
 * Allows clients to rate trips and provide feedback
 */

export const RATING_CATEGORIES = {
  PUNCTUALITY: 'punctuality',
  PROFESSIONALISM: 'professionalism',
  VEHICLE_CLEANLINESS: 'vehicleCleanliness',
  DRIVING_SAFETY: 'drivingSafety',
  COMMUNICATION: 'communication',
};

export const RATING_LABELS = {
  [RATING_CATEGORIES.PUNCTUALITY]: 'Punctuality',
  [RATING_CATEGORIES.PROFESSIONALISM]: 'Professionalism',
  [RATING_CATEGORIES.VEHICLE_CLEANLINESS]: 'Vehicle Cleanliness',
  [RATING_CATEGORIES.DRIVING_SAFETY]: 'Driving Safety',
  [RATING_CATEGORIES.COMMUNICATION]: 'Communication',
};

export function calculateAverageRating(feedback) {
  if (!feedback || Object.keys(feedback).length === 0) return null;
  const values = Object.values(feedback).filter(v => typeof v === 'number' && v > 0);
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

export function calculateDriverRating(trips) {
  const ratedTrips = trips.filter(t => t.feedback && t.status === 'Completed');
  if (ratedTrips.length === 0) return { average: null, count: 0, breakdown: {} };

  const allRatings = {};
  let totalAverage = 0;

  ratedTrips.forEach(trip => {
    const avg = calculateAverageRating(trip.feedback);
    if (avg) {
      totalAverage += avg;
      Object.entries(trip.feedback).forEach(([category, rating]) => {
        if (typeof rating === 'number' && rating > 0) {
          if (!allRatings[category]) allRatings[category] = { sum: 0, count: 0 };
          allRatings[category].sum += rating;
          allRatings[category].count++;
        }
      });
    }
  });

  const breakdown = {};
  Object.entries(allRatings).forEach(([category, data]) => {
    breakdown[category] = Math.round((data.sum / data.count) * 10) / 10;
  });

  return {
    average: Math.round((totalAverage / ratedTrips.length) * 10) / 10,
    count: ratedTrips.length,
    breakdown,
  };
}

export function getRatingStars(rating) {
  if (!rating) return [];
  const stars = [];
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;

  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars.push('full');
    } else if (i === fullStars && hasHalf) {
      stars.push('half');
    } else {
      stars.push('empty');
    }
  }
  return stars;
}

export function formatRating(rating) {
  if (!rating) return 'No ratings';
  return rating.toFixed(1);
}

export function getRatingColor(rating) {
  if (!rating) return 'text-slate-400';
  if (rating >= 4.5) return 'text-emerald-600';
  if (rating >= 4.0) return 'text-green-600';
  if (rating >= 3.5) return 'text-amber-600';
  if (rating >= 3.0) return 'text-orange-600';
  return 'text-rose-600';
}

export default {
  RATING_CATEGORIES,
  RATING_LABELS,
  calculateAverageRating,
  calculateDriverRating,
  getRatingStars,
  formatRating,
  getRatingColor,
};
