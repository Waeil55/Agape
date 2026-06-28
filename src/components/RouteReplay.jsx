import React, { useState, useEffect, useMemo } from 'react';
import { Play, Pause, RotateCcw, Clock, Navigation, MapPin, Gauge } from 'lucide-react';

export default function RouteReplay({ trip, breadcrumbs = [], stopEvents = [] }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speed, setSpeed] = useState(1);

  const points = useMemo(() => {
    if (!breadcrumbs || breadcrumbs.length === 0) return [];
    return breadcrumbs
      .filter(b => b.lat && b.lng)
      .sort((a, b) => new Date(a.timestamp || a.time || 0) - new Date(b.timestamp || b.time || 0));
  }, [breadcrumbs]);

  useEffect(() => {
    if (!isPlaying || points.length === 0) return;

    const interval = setInterval(() => {
      setCurrentIndex(prev => {
        if (prev >= points.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1000 / speed);

    return () => clearInterval(interval);
  }, [isPlaying, points.length, speed]);

  const currentPoint = points[currentIndex];
  const progress = points.length > 0 ? (currentIndex / (points.length - 1)) * 100 : 0;

  const handlePlay = () => {
    if (currentIndex >= points.length - 1) {
      setCurrentIndex(0);
    }
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentIndex(0);
  };

  if (points.length === 0) {
    return (
      <div className="bg-slate-50 rounded-xl p-6 text-center">
        <MapPin size={32} className="mx-auto text-slate-300 mb-3" />
        <p className="text-sm text-slate-500">No route data available for this trip</p>
        <p className="text-[11px] text-slate-400 mt-1">Route will be recorded during the trip</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Map Placeholder */}
      <div className="relative h-64 bg-slate-100 overflow-hidden">
        {/* Route path visualization */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 250">
          {/* Route line */}
          {points.length > 1 && (
            <polyline
              points={points.map((p, i) => {
                const x = (i / (points.length - 1)) * 380 + 10;
                const y = 125 + Math.sin(i * 0.3) * 50;
                return `${x},${y}`;
              }).join(' ')}
              fill="none"
              stroke="#23568E"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.6"
            />
          )}

          {/* Current position */}
          {currentPoint && (
            <circle
              cx={10 + (currentIndex / Math.max(1, points.length - 1)) * 380}
              cy={125 + Math.sin(currentIndex * 0.3) * 50}
              r="8"
              fill="#23568E"
              stroke="white"
              strokeWidth="3"
            />
          )}

          {/* Start marker */}
          <circle cx="10" cy="125" r="6" fill="#10b981" stroke="white" strokeWidth="2" />

          {/* End marker */}
          <circle cx="390" cy="125" r="6" fill="#ef4444" stroke="white" strokeWidth="2" />
        </svg>

        {/* Info overlay */}
        {currentPoint && (
          <div className="absolute bottom-3 left-3 right-3 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-sm">
            <div className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-2">
                <Gauge size={12} className="text-blue-600" />
                <span className="font-bold text-slate-900">{currentPoint.speed || 0} mph</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={12} className="text-slate-400" />
                <span className="text-slate-600">
                  {currentPoint.timestamp ? new Date(currentPoint.timestamp).toLocaleTimeString() : 
                   currentPoint.time ? new Date(currentPoint.time).toLocaleTimeString() : '--'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={12} className="text-emerald-600" />
                <span className="text-slate-600">
                  {currentPoint.lat?.toFixed(4)}, {currentPoint.lng?.toFixed(4)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-4 py-3 border-t border-slate-100">
        <div className="flex items-center gap-3">
          <button
            onClick={handlePlay}
            className="w-10 h-10 rounded-xl bg-[#23568E] text-white flex items-center justify-center hover:bg-[#1a4270] transition"
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button
            onClick={handleReset}
            className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 transition"
          >
            <RotateCcw size={18} />
          </button>

          {/* Progress bar */}
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#23568E] rounded-full transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Speed control */}
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="px-2 py-1 text-[11px] font-bold bg-slate-100 rounded-lg border-none"
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={5}>5x</option>
            <option value={10}>10x</option>
          </select>
        </div>

        {/* Trip info */}
        {trip && (
          <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-[10px] text-slate-500">Points</p>
              <p className="text-xs font-bold text-slate-900">{points.length}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500">Distance</p>
              <p className="text-xs font-bold text-slate-900">{trip.distance || '--'} mi</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500">Duration</p>
              <p className="text-xs font-bold text-slate-900">{trip.tripDurationMinutes || '--'} min</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500">Avg Speed</p>
              <p className="text-xs font-bold text-slate-900">
                {trip.tripDurationMinutes && trip.distance 
                  ? Math.round(trip.distance / (trip.tripDurationMinutes / 60)) 
                  : '--'} mph
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
