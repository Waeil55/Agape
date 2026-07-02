import React, { memo } from 'react';
import { Star, MessageSquare } from 'lucide-react';
import { calculateDriverRating, formatRating, getRatingColor, RATING_LABELS } from '../utils/driverRatings';

export function RatingStars({ rating, size = 'sm' }) {
  const sizes = {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };
  const sizeClass = sizes[size] || sizes.sm;
  const stars = [];

  if (!rating) {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <Star key={i} size={12} className="text-slate-300" />
        ))}
      </div>
    );
  }

  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;

  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars.push(<Star key={i} size={12} className="text-amber-400 fill-amber-400" />);
    } else if (i === fullStars && hasHalf) {
      stars.push(
        <span key={i} className="relative inline-block">
          <Star size={12} className="text-slate-300" />
          <span className="absolute inset-0 overflow-hidden w-1/2">
            <Star size={12} className="text-amber-400 fill-amber-400" />
          </span>
        </span>
      );
    } else {
      stars.push(<Star key={i} size={12} className="text-slate-300" />);
    }
  }

  return <div className="flex items-center gap-0.5">{stars}</div>;
}

export const DriverRatingBadge = memo(function DriverRatingBadge({ driver, trips, compact = false }) {
  const rating = calculateDriverRating(trips);

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <Star size={10} className="text-amber-400 fill-amber-400" />
        <span className={`text-[11px] font-bold ${getRatingColor(rating.average)}`}>
          {formatRating(rating.average)}
        </span>
        {rating.count > 0 && (
          <span className="text-[9px] text-slate-400">({rating.count})</span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-amber-50 to-yellow-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
            <Star size={16} className="text-amber-600 fill-amber-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-900">Customer Rating</p>
            <p className="text-[10px] text-slate-500">{driver?.name || 'Driver'}</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <span className={`text-3xl font-black ${getRatingColor(rating.average)}`}>
            {formatRating(rating.average)}
          </span>
          <div>
            <RatingStars rating={rating.average} size="md" />
            <p className="text-[10px] text-slate-500 mt-0.5">{rating.count} ratings</p>
          </div>
        </div>

        {Object.keys(rating.breakdown).length > 0 && (
          <div className="space-y-2">
            {Object.entries(rating.breakdown).map(([category, value]) => (
              <div key={category} className="flex items-center justify-between">
                <span className="text-[11px] text-slate-600">{RATING_LABELS[category] || category}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full"
                      style={{ width: `${(value / 5) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-slate-700 w-6 text-right">{value}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export function TripFeedbackDisplay({ trip }) {
  if (!trip?.feedback) return null;

  return (
    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare size={12} className="text-slate-400" />
        <span className="text-[10px] font-bold text-slate-600 uppercase">Client Feedback</span>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <RatingStars rating={trip.feedback.overall || trip.feedback.average} size="sm" />
        <span className="text-xs font-bold text-slate-700">
          {formatRating(trip.feedback.overall || trip.feedback.average)}
        </span>
      </div>
      {trip.feedback.comment && (
        <p className="text-[11px] text-slate-600 italic">"{trip.feedback.comment}"</p>
      )}
    </div>
  );
}

export default DriverRatingBadge;
