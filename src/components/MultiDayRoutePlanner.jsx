import React, { useState, useMemo } from 'react';
import {
  Calendar, Copy, Trash2, Plus, MapPin, Clock,
  Navigation, Save, ChevronLeft, ChevronRight,
} from 'lucide-react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const EST_MILES_PER_STOP = 8;
const EST_MINUTES_PER_STOP = 12;

const emptyWeek = () => Object.fromEntries(DAYS.map((d) => [d, []]));

const MultiDayRoutePlanner = ({ trips = [], onSave }) => {
  const [selectedDay, setSelectedDay] = useState('Mon');
  const [dayRoutes, setDayRoutes] = useState(() => {
    if (!trips?.length) return emptyWeek();
    const grouped = emptyWeek();
    trips.forEach((trip) => {
      const dow = new Date(trip.date).getDay();
      const idx = dow === 0 ? 6 : dow - 1;
      grouped[DAYS[idx]]?.push({
        id: trip.id || `trip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        pickup: trip.pickup || trip.pickupAddress || '',
        dropoff: trip.dropoff || trip.dropoffAddress || '',
        time: trip.time || '',
        passenger: trip.passenger || trip.patientName || '',
      });
    });
    return grouped;
  });
  const [copySource, setCopySource] = useState(null);

  const summary = useMemo(() => {
    const out = {};
    DAYS.forEach((d) => {
      const stops = dayRoutes[d];
      out[d] = {
        stops: stops.length,
        miles: stops.length * EST_MILES_PER_STOP,
        time: stops.length * EST_MINUTES_PER_STOP,
      };
    });
    return out;
  }, [dayRoutes]);

  const totalWeek = useMemo(() => {
    return DAYS.reduce(
      (acc, d) => ({
        stops: acc.stops + summary[d].stops,
        miles: acc.miles + summary[d].miles,
        time: acc.time + summary[d].time,
      }),
      { stops: 0, miles: 0, time: 0 },
    );
  }, [summary]);

  const addStop = () => {
    setDayRoutes((prev) => ({
      ...prev,
      [selectedDay]: [
        ...prev[selectedDay],
        { id: `new-${Date.now()}`, pickup: '', dropoff: '', time: '', passenger: '' },
      ],
    }));
  };

  const updateStop = (day, stopId, field, value) => {
    setDayRoutes((prev) => ({
      ...prev,
      [day]: prev[day].map((s) => (s.id === stopId ? { ...s, [field]: value } : s)),
    }));
  };

  const removeStop = (day, stopId) => {
    setDayRoutes((prev) => ({
      ...prev,
      [day]: prev[day].filter((s) => s.id !== stopId),
    }));
  };

  const copyDay = (fromDay) => {
    setCopySource(fromDay);
  };

  const pasteDay = (toDay) => {
    if (!copySource || copySource === toDay) return;
    setDayRoutes((prev) => ({
      ...prev,
      [toDay]: [...prev[copySource].map((s) => ({ ...s, id: `${s.id}-copy-${Date.now()}` }))],
    }));
    setCopySource(null);
  };

  const clearDay = (day) => {
    setDayRoutes((prev) => ({ ...prev, [day]: [] }));
  };

  const handleSave = () => {
    onSave?.(dayRoutes);
  };

  const currentIdx = DAYS.indexOf(selectedDay);

  const formatTime = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-slate-800">Multi-Day Route Planner</h2>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Save className="w-4 h-4" />
          Save Plan
        </button>
      </div>

      {/* Week Selector */}
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 overflow-x-auto">
        {DAYS.map((d, i) => {
          const sel = d === selectedDay;
          const copied = copySource === d;
          const count = summary[d].stops;
          return (
            <div key={d} className="flex items-center gap-1">
              <button
                onClick={() => setSelectedDay(d)}
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                  sel
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {d}
                {count > 0 && (
                  <span
                    className={`ml-1.5 text-xs font-bold rounded-full px-1.5 py-0.5 ${
                      sel ? 'bg-blue-500 text-blue-100' : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
              {i < DAYS.length - 1 && <span className="text-slate-300 text-xs">-</span>}
            </div>
          );
        })}
      </div>

      {/* Route Summary Bar */}
      <div className="px-5 py-3 border-b border-slate-100 grid grid-cols-4 gap-4 text-center">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase">Day Stops</p>
          <p className="text-lg font-semibold text-slate-800">{summary[selectedDay].stops}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase">Est. Miles</p>
          <p className="text-lg font-semibold text-slate-800">{summary[selectedDay].miles}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase">Est. Time</p>
          <p className="text-lg font-semibold text-slate-800">{formatTime(summary[selectedDay].time)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase">Week Total</p>
          <p className="text-lg font-semibold text-blue-600">{totalWeek.stops} stops</p>
        </div>
      </div>

      {/* Day Content */}
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedDay(DAYS[(currentIdx + 6) % 7])}
              className="p-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-slate-500" />
            </button>
            <h3 className="text-base font-semibold text-slate-700">{DAY_LABELS[currentIdx]}</h3>
            <button
              onClick={() => setSelectedDay(DAYS[(currentIdx + 1) % 7])}
              className="p-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {copySource && (
              <button
                onClick={() => pasteDay(selectedDay)}
                className="flex items-center gap-1 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs font-semibold rounded-lg transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Paste from {copySource}
              </button>
            )}
            <button
              onClick={() => copyDay(selectedDay)}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy Day
            </button>
            {dayRoutes[selectedDay].length > 0 && (
              <button
                onClick={() => clearDay(selectedDay)}
                className="flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>

        {dayRoutes[selectedDay].length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-semibold">No stops for {DAY_LABELS[currentIdx]}</p>
            <p className="text-xs mt-1">Click the button below to add a stop.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {dayRoutes[selectedDay].map((stop, idx) => (
              <div
                key={stop.id}
                className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100"
              >
                <span className="flex items-center justify-center w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full mt-1 shrink-0">
                  {idx + 1}
                </span>
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Pickup address"
                    value={stop.pickup}
                    onChange={(e) => updateStop(selectedDay, stop.id, 'pickup', e.target.value)}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                  <input
                    type="text"
                    placeholder="Dropoff address"
                    value={stop.dropoff}
                    onChange={(e) => updateStop(selectedDay, stop.id, 'dropoff', e.target.value)}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                  <input
                    type="text"
                    placeholder="Time"
                    value={stop.time}
                    onChange={(e) => updateStop(selectedDay, stop.id, 'time', e.target.value)}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                  <input
                    type="text"
                    placeholder="Passenger"
                    value={stop.passenger}
                    onChange={(e) => updateStop(selectedDay, stop.id, 'passenger', e.target.value)}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                </div>
                <button
                  onClick={() => removeStop(selectedDay, stop.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors mt-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={addStop}
          className="mt-4 flex items-center gap-1.5 px-4 py-2 border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50 text-slate-500 hover:text-blue-600 text-sm font-semibold rounded-lg transition-colors w-full justify-center"
        >
          <Plus className="w-4 h-4" />
          Add Stop
        </button>
      </div>

      {/* Week Overview Footer */}
      <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-4 overflow-x-auto">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 shrink-0">
          <Navigation className="w-3.5 h-3.5" />
          Week Overview:
        </div>
        {DAYS.map((d) => (
          <div
            key={d}
            className={`text-xs font-semibold px-2 py-1 rounded ${
              summary[d].stops > 0 ? 'bg-blue-50 text-blue-600' : 'text-slate-400'
            }`}
          >
            {d}: {summary[d].stops}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MultiDayRoutePlanner;
