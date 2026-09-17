import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  MapPin, Navigation, GripVertical, Plus, Trash2, Clock,
  ArrowUpDown, RotateCcw, Check, ChevronRight, X,
  Search, Phone, Sparkles, CheckCircle2, Route, Timer, Users,
  Copy, Play, ArrowDown, ArrowUp, AlertTriangle, Eye, Save,
} from 'lucide-react';
import { openNavigation, makeCall } from '../utils/nativeActions';
import { timeToMinutes } from '../utils/tripDate';
import { tripMatchesRoutePlannerServiceDate } from '../utils/portalSelectors';
import { optimizeRoute as geminiOptimizeRoute } from '../config/ai';
import { tripMatchesSearch } from '../utils/search';
import { resolveClientPhoneForTrip } from '../utils/clientPhoneResolution';

const to12hr = (t) => {
  if (!t || t === 'Will Call' || t === 'WC') return t || 'WC';
  const m = String(t).match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (m && m[3]) return t;
  const p = String(t).match(/(\d{1,2}):(\d{2})/);
  if (!p) return t;
  let h = parseInt(p[1], 10), min = p[2], ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12; else if (h > 12) h -= 12;
  return `${h}:${min} ${ampm}`;
};

const getStopLetter = (i) => String.fromCharCode(65 + (i % 26));
const makeStopId = (tripId, type) => `${tripId}_${type}`;
const TERMINAL_STATUSES = new Set(['Completed', 'Cancelled', 'No Show', 'Rerouted', 'Archived']);
const isActivePlanningStatus = (status) => !TERMINAL_STATUSES.has(status || '');

const getTodayDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function EnterpriseRoutePlanner({
  trips = [],
  drivers = [],
  appSettings = {},
  onOpenInNav,
  onSendToSequencer,
  initialStops = null,
}) {
  const [stops, setStops] = useState(() => {
    if (Array.isArray(initialStops) && initialStops.length > 0) {
      return initialStops.map((s, idx) => ({
        id: s.id || `stop-${idx}-${Date.now()}`,
        tripId: s.tripId || '',
        type: (s.stopType || s.type || 'PU').toLowerCase() === 'do' || (s.stopType || s.type || 'PU').toLowerCase() === 'dropoff' ? 'dropoff' : 'pickup',
        patient: s.clientName || s.patient || 'Client',
        time: s.time || '',
        address: s.address || '',
        phone: s.phone || '',
        locationPhone: s.locationPhone || '',
        bookingId: s.bookingId || '',
        notes: s.notes || '',
      }));
    }
    return [];
  });

  const [dateStr, setDateStr] = useState(getTodayDateString());
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [routeName, setRouteName] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [optimizing, setOptimizing] = useState(false);
  const [aiMsg, setAiMsg] = useState('');
  const [completed, setCompleted] = useState(() => new Set());
  const [savedPlans, setSavedPlans] = useState([]);
  const [showSavedPlans, setShowSavedPlans] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  // Active trips for selected service date
  const activeTrips = useMemo(() => {
    const selectedDate = dateStr || getTodayDateString();
    return (trips || [])
      .filter((trip) => trip?.patient)
      .filter((trip) => isActivePlanningStatus(trip.status))
      .filter((trip) => tripMatchesRoutePlannerServiceDate(trip, selectedDate));
  }, [trips, dateStr]);

  const tripStopTypes = useMemo(() => {
    const map = {};
    stops.forEach((s) => {
      if (!map[s.tripId]) map[s.tripId] = { pickup: false, dropoff: false };
      map[s.tripId][s.type] = true;
    });
    return map;
  }, [stops]);

  // Filtered trips for left pane
  const filteredTrips = useMemo(() => {
    let list = [...activeTrips];
    if (selectedDriverId) {
      const d = (drivers || []).find((entry) => entry.id === selectedDriverId || entry.email === selectedDriverId);
      if (d) {
        list = list.filter((t) => t.driverId === d.id || t.assignedDriverId === d.id || t.driverEmail === d.email);
      }
    }
    if (filterStatus !== 'all') {
      list = list.filter((t) => t.status === filterStatus);
    }
    if (searchQ.trim()) {
      list = list.filter((t) => tripMatchesSearch(t, searchQ));
    }
    return list.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  }, [activeTrips, selectedDriverId, drivers, filterStatus, searchQ]);

  // Trips available to add
  const availTrips = useMemo(() => {
    return filteredTrips.filter((t) => {
      const types = tripStopTypes[t.id];
      if (types?.pickup && types?.dropoff) return false;
      return true;
    });
  }, [filteredTrips, tripStopTypes]);

  // Metrics summary
  const summary = useMemo(() => {
    let totalMiles = 0;
    stops.forEach((s) => {
      if (s.tripId) {
        const tr = trips.find((t) => t.id === s.tripId);
        const dist = parseFloat(tr?.distance || tr?.details?.distance || 0);
        if (!isNaN(dist) && dist > 0) totalMiles += dist / 2;
      }
    });
    const estMinutes = Math.round(totalMiles * 2.4 + stops.length * 5);
    return {
      stopsCount: stops.length,
      miles: totalMiles > 0 ? totalMiles.toFixed(1) : (stops.length * 3.2).toFixed(1),
      estMinutes: estMinutes > 0 ? estMinutes : stops.length * 15,
      activeTripsCount: activeTrips.length,
    };
  }, [stops, trips, activeTrips]);

  // Stop Actions
  const addTripBoth = useCallback((trip) => {
    const clientPhone = resolveClientPhoneForTrip(trip, trips);
    setStops((prev) => [
      ...prev,
      { id: makeStopId(trip.id, 'pu'), tripId: trip.id, type: 'pickup', patient: trip.patient, time: trip.time, address: trip.pickup || '', phone: clientPhone, locationPhone: trip.pickupPhone || '', notes: trip.notes || '', bookingId: trip.bookingId || trip.id || '' },
      { id: makeStopId(trip.id, 'do'), tripId: trip.id, type: 'dropoff', patient: trip.patient, time: trip.doTime || trip.dropoffTime || trip.time, address: trip.dropoff || '', phone: clientPhone, locationPhone: trip.dropoffPhone || '', notes: trip.notes || '', bookingId: trip.bookingId || trip.id || '' },
    ]);
  }, [trips]);

  const addPickupOnly = useCallback((trip) => {
    const clientPhone = resolveClientPhoneForTrip(trip, trips);
    setStops((prev) => [
      ...prev,
      { id: makeStopId(trip.id, 'pu'), tripId: trip.id, type: 'pickup', patient: trip.patient, time: trip.time, address: trip.pickup || '', phone: clientPhone, locationPhone: trip.pickupPhone || '', notes: trip.notes || '', bookingId: trip.bookingId || trip.id || '' },
    ]);
  }, [trips]);

  const addDropoffOnly = useCallback((trip) => {
    const clientPhone = resolveClientPhoneForTrip(trip, trips);
    setStops((prev) => [
      ...prev,
      { id: makeStopId(trip.id, 'do'), tripId: trip.id, type: 'dropoff', patient: trip.patient, time: trip.doTime || trip.dropoffTime || trip.time, address: trip.dropoff || '', phone: clientPhone, locationPhone: trip.dropoffPhone || '', notes: trip.notes || '', bookingId: trip.bookingId || trip.id || '' },
    ]);
  }, [trips]);

  const removeStop = useCallback((stopId) => {
    setStops((prev) => prev.filter((s) => s.id !== stopId));
    setCompleted((prev) => {
      const next = new Set(prev);
      next.delete(stopId);
      return next;
    });
  }, []);

  const moveStop = useCallback((idx, dir) => {
    setStops((prev) => {
      const arr = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr;
    });
  }, []);

  const toggleStopType = useCallback((stopId) => {
    setStops((prev) =>
      prev.map((s) => {
        if (s.id !== stopId) return s;
        const newType = s.type === 'pickup' ? 'dropoff' : 'pickup';
        const trip = trips.find((t) => t.id === s.tripId);
        const clientPhone = trip ? resolveClientPhoneForTrip(trip, trips) : s.phone;
        return {
          ...s,
          type: newType,
          address: newType === 'pickup' ? (trip?.pickup || s.address) : (trip?.dropoff || s.address),
          phone: clientPhone,
          locationPhone: newType === 'pickup' ? (trip?.pickupPhone || '') : (trip?.dropoffPhone || ''),
        };
      })
    );
  }, [trips]);

  const reverseRoute = useCallback(() => {
    if (stops.length < 2) return;
    setStops((prev) => [...prev].reverse());
    setAiMsg('Route inverted.');
  }, [stops.length]);

  const sortByTime = useCallback(() => {
    setStops((prev) => [...prev].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)));
    setAiMsg('Sorted chronologically by schedule.');
  }, []);

  const handleAiOptimize = async () => {
    if (stops.length < 2) {
      setAiMsg('Add at least 2 stops to optimize.');
      return;
    }
    setOptimizing(true);
    setAiMsg('');
    const matchedDriver = (drivers || []).find((d) => d.id === selectedDriverId || d.email === selectedDriverId);
    const origin = matchedDriver?.currentZone || 'Agape Dispatch Base';
    try {
      const tripData = stops.map((s) => ({
        id: s.id,
        patient: s.patient,
        pickup: s.type === 'pickup' ? s.address : '',
        dropoff: s.type === 'dropoff' ? s.address : '',
        address: s.address,
        type: s.type,
        time: s.time,
      }));
      const ordered = await geminiOptimizeRoute(tripData, origin);
      if (ordered && Array.isArray(ordered) && ordered.length >= 2) {
        const orderMap = ordered.reduce((acc, id, i) => { acc[id] = i; return acc; }, {});
        setStops((prev) => [...prev].sort((a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999)));
        setAiMsg('✓ Route optimized by AI.');
      } else {
        sortByTime();
      }
    } catch (err) {
      console.warn('[RoutePlanner] AI optimize fallback to time sort:', err);
      sortByTime();
    }
    setOptimizing(false);
  };

  const copyManifest = useCallback(() => {
    if (stops.length === 0) return;
    const lines = [
      `ROUTE PLAN: ${routeName || 'Scheduled Itinerary'}`,
      `Date: ${dateStr}`,
      `Stops: ${stops.length} | Est. Miles: ${summary.miles} mi`,
      '='.repeat(40),
      ...stops.map((s, idx) => {
        const tag = s.type === 'pickup' ? 'PU' : 'DO';
        return `${idx + 1}. [${tag}] ${s.patient} (${to12hr(s.time)})\n   Address: ${s.address}${s.phone ? `\n   Phone: ${s.phone}` : ''}`;
      }),
      '='.repeat(40),
    ];
    navigator.clipboard?.writeText(lines.join('\n\n'));
    setAiMsg('✓ Route itinerary copied to clipboard.');
  }, [stops, routeName, dateStr, summary.miles]);

  const handleLaunchNavigation = (address) => {
    if (!address) return;
    if (typeof onOpenInNav === 'function') {
      onOpenInNav(address);
    } else {
      openNavigation(address);
    }
  };

  const savePlan = useCallback(() => {
    if (stops.length === 0) {
      setAiMsg('Add stops before saving a plan.');
      return;
    }
    const name = routeName.trim() || `Plan ${dateStr} (${stops.length} stops)`;
    const newPlan = {
      id: `plan-${Date.now()}`,
      name,
      date: dateStr,
      driverId: selectedDriverId,
      stopsCount: stops.length,
      stops,
      savedAt: new Date().toISOString(),
    };
    setSavedPlans((prev) => [newPlan, ...prev.filter((p) => p.name !== name || p.date !== dateStr)].slice(0, 20));
    setRouteName(name);
    setAiMsg(`✓ Saved "${name}".`);
    setShowSavedPlans(true);
  }, [stops, routeName, dateStr, selectedDriverId]);

  const loadPlan = useCallback((plan) => {
    setRouteName(plan.name || '');
    setDateStr(plan.date || getTodayDateString());
    setSelectedDriverId(plan.driverId || '');
    setStops(Array.isArray(plan.stops) ? plan.stops : []);
    setCompleted(new Set());
    setShowSavedPlans(false);
    setAiMsg(`✓ Loaded "${plan.name}".`);
  }, []);

  const sendPlanToSequencer = useCallback(() => {
    if (typeof onSendToSequencer !== 'function' || stops.length === 0) return;
    const items = stops.map((s) => ({
      id: s.id,
      name: s.patient,
      pu: s.type === 'pickup' ? s.address : '',
      do: s.type === 'dropoff' ? s.address : '',
      address: s.address,
      time: s.time,
      bookingId: s.bookingId,
      phone: s.phone,
    }));
    const sequence = stops.map((s) => ({
      clientId: s.id,
      type: s.type === 'pickup' ? 'PU' : 'DO',
      leg: 'A',
    }));
    onSendToSequencer(items, sequence);
  }, [onSendToSequencer, stops]);

  return (
    <div
      className="flex-1 min-h-0 flex flex-col bg-slate-100 overflow-hidden touch-pan-y"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {/* ── TOP HEADER / TOOLBAR ── */}
      <header className="shrink-0 bg-white border-b border-slate-200 shadow-2xs px-3 py-2 sm:px-4 sm:py-2.5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          {/* Title + Route Name */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-sm">
              <Route size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600">Route Planner</span>
                {aiMsg && (
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md truncate animate-in fade-in">
                    {aiMsg}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                placeholder="Name your route (e.g. Morning East Route)..."
                className="w-full text-sm font-bold text-slate-800 bg-transparent placeholder:text-slate-400 focus:outline-none truncate"
              />
            </div>
          </div>

          {/* Scope Controls: Date + Driver Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="h-8 px-2.5 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:bg-white focus:outline-none"
              title="Service Date"
              aria-label="Service Date"
            />
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="h-8 px-2 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:bg-white focus:outline-none max-w-[140px] truncate"
              aria-label="Driver Filter"
            >
              <option value="">All Drivers</option>
              {(drivers || []).map((d) => (
                <option key={d.id || d.email} value={d.id || d.email}>
                  {d.name || d.email}
                </option>
              ))}
            </select>

            {/* Quick Metrics */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200/80 text-[11px] font-bold text-slate-700">
              <span>{summary.stopsCount} stops</span>
              <span className="text-slate-300">•</span>
              <span>{summary.miles} mi</span>
              <span className="text-slate-300">•</span>
              <span>~{summary.estMinutes}m</span>
            </div>

            {/* Save / Plans Buttons */}
            <button
              type="button"
              onClick={savePlan}
              disabled={stops.length === 0}
              className="h-8 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Save size={12} />
              <span>Save</span>
            </button>
            <button
              type="button"
              onClick={() => setShowSavedPlans(!showSavedPlans)}
              className="h-8 px-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Eye size={12} />
              <span>Plans ({savedPlans.length})</span>
            </button>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleAiOptimize}
              disabled={optimizing || stops.length < 2}
              className="h-7 px-2.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles size={13} className={optimizing ? 'animate-spin' : 'text-indigo-600'} />
              <span>{optimizing ? 'Optimizing…' : 'AI Optimize'}</span>
            </button>
            <button
              type="button"
              onClick={sortByTime}
              disabled={stops.length < 2}
              className="h-7 px-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Clock size={12} />
              <span>Sort Time</span>
            </button>
            <button
              type="button"
              onClick={reverseRoute}
              disabled={stops.length < 2}
              className="h-7 px-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
            >
              <ArrowUpDown size={12} />
              <span>Reverse</span>
            </button>
            <button
              type="button"
              onClick={copyManifest}
              disabled={stops.length === 0}
              className="h-7 px-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Copy size={12} />
              <span>Copy Itinerary</span>
            </button>
            {typeof onSendToSequencer === 'function' && (
              <button
                type="button"
                onClick={sendPlanToSequencer}
                disabled={stops.length === 0}
                className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Play size={11} fill="currentColor" />
                <span>To Sequencer</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {stops.length > 0 && (
              <button
                type="button"
                onClick={() => { setStops([]); setCompleted(new Set()); setAiMsg('Cleared route.'); }}
                className="h-7 px-2 rounded-lg text-rose-600 hover:bg-rose-50 text-xs font-semibold transition-colors cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── SAVED PLANS MODAL / DRAWER ── */}
      {showSavedPlans && (
        <div className="p-3 bg-white border-b border-slate-200 shadow-sm animate-in slide-in-from-top-1">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Saved Route Plans</h4>
            <button
              type="button"
              onClick={() => setShowSavedPlans(false)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          </div>
          {savedPlans.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">No saved plans in this session.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {savedPlans.map((p) => (
                <div
                  key={p.id}
                  onClick={() => loadPlan(p)}
                  className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-blue-50/50 hover:border-blue-300 transition-colors cursor-pointer flex items-center justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 truncate">{p.name}</p>
                    <p className="text-[10px] text-slate-500">{p.date} • {p.stopsCount} stops</p>
                  </div>
                  <ChevronRight size={14} className="text-slate-400 shrink-0 ml-2" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MAIN WORKSPACE: DUAL-PANE ── */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        {/* LEFT PANE: AVAILABLE TRIPS */}
        <div className="w-full md:w-80 xl:w-96 flex flex-col border-b md:border-b-0 md:border-r border-slate-200 bg-white min-h-0 shrink-0">
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/60">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold text-slate-800">Available Trips ({availTrips.length})</span>
              <span className="text-[10px] font-semibold text-slate-500">{dateStr}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Filter client, address, ID..."
                  className="w-full pl-7 pr-2 py-1 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="text-xs font-semibold px-2 py-1 rounded-lg border border-slate-200 bg-white focus:outline-none"
              >
                <option value="all">All</option>
                <option value="Unassigned">Unassigned</option>
                <option value="Assigned">Assigned</option>
              </select>
            </div>
          </div>

          {/* Trips List */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-2 space-y-2">
            {availTrips.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Route size={28} className="mx-auto mb-2 opacity-40 text-slate-400" />
                <p className="text-xs font-semibold">No available trips for {dateStr}</p>
                <p className="text-[11px] text-slate-400 mt-1">Select another date or clear search filters</p>
              </div>
            ) : (
              availTrips.map((trip) => {
                const types = tripStopTypes[trip.id] || {};
                const hasPu = types.pickup;
                const hasDo = types.dropoff;

                return (
                  <div
                    key={trip.id}
                    className="p-2.5 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 shadow-2xs transition-colors"
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-xs font-extrabold text-blue-700">{trip.time || 'TBD'}</span>
                      <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        #{trip.bookingId || trip.id}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-800 truncate mb-1.5">
                      {trip.patient || 'Unknown Client'}
                    </div>

                    {/* Route Preview */}
                    <div className="text-[11px] text-slate-600 space-y-0.5 mb-2">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-[9px] font-black text-emerald-600 shrink-0">PU:</span>
                        <span className="truncate">{trip.pickup || '—'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-[9px] font-black text-rose-600 shrink-0">DO:</span>
                        <span className="truncate">{trip.dropoff || '—'}</span>
                      </div>
                    </div>

                    {/* Add Buttons */}
                    <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-100">
                      {!hasPu && !hasDo && (
                        <button
                          type="button"
                          onClick={() => addTripBoth(trip)}
                          className="flex-1 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Plus size={11} /> Both
                        </button>
                      )}
                      {!hasPu && (
                        <button
                          type="button"
                          onClick={() => addPickupOnly(trip)}
                          className="flex-1 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Plus size={11} /> PU
                        </button>
                      )}
                      {!hasDo && (
                        <button
                          type="button"
                          onClick={() => addDropoffOnly(trip)}
                          className="flex-1 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Plus size={11} /> DO
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANE: ORDERED ITINERARY */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50">
          <div className="p-3 bg-white border-b border-slate-200/80 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Stop Sequence ({stops.length})</h3>
              <p className="text-[11px] text-slate-500">Drag or use arrows to reorder stops. Tap PU/DO badge to toggle type.</p>
            </div>
            {stops.length > 0 && (
              <button
                type="button"
                onClick={() => handleLaunchNavigation(stops[0]?.address)}
                className="h-8 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Navigation size={13} />
                <span>Start Nav</span>
              </button>
            )}
          </div>

          {/* Stops List */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2">
            {stops.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-300 mb-3 shadow-xs">
                  <Route size={28} />
                </div>
                <h4 className="text-sm font-bold text-slate-700">No stops in route plan</h4>
                <p className="text-xs text-slate-400 max-w-xs mt-1">
                  Add trips from the left panel or select trips in the manifest and click "Send to Plan".
                </p>
              </div>
            ) : (
              stops.map((stop, idx) => {
                const isPu = stop.type === 'pickup';
                const isDone = completed.has(stop.id);

                return (
                  <div
                    key={stop.id}
                    draggable
                    onDragStart={() => setDragIdx(idx)}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(idx); }}
                    onDrop={() => {
                      if (dragIdx === null || dragIdx === idx) return;
                      setStops((prev) => {
                        const copy = [...prev];
                        const [moved] = copy.splice(dragIdx, 1);
                        copy.splice(idx, 0, moved);
                        return copy;
                      });
                      setDragIdx(null);
                      setDragOver(null);
                    }}
                    className={`p-3 rounded-2xl border bg-white shadow-2xs transition-all flex items-start gap-3 ${
                      isDone ? 'opacity-60 border-slate-200 bg-slate-50' : 'border-slate-200 hover:border-slate-300'
                    } ${dragOver === idx ? 'ring-2 ring-blue-400' : ''}`}
                  >
                    {/* Drag Handle + Stop Letter */}
                    <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                      <div className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500">
                        <GripVertical size={16} />
                      </div>
                      <div className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center text-xs font-black">
                        {getStopLetter(idx)}
                      </div>
                    </div>

                    {/* Stop Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5 mb-1">
                        <div className="flex items-center gap-1.5 truncate">
                          {/* Toggleable PU/DO Pill */}
                          <button
                            type="button"
                            onClick={() => toggleStopType(stop.id)}
                            title="Click to toggle Pickup / Dropoff"
                            className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide cursor-pointer transition-colors ${
                              isPu
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                            }`}
                          >
                            {isPu ? 'Pickup' : 'Dropoff'}
                          </button>
                          <span className="text-xs font-extrabold text-slate-800 truncate">{stop.patient}</span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {stop.time && (
                            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                              {to12hr(stop.time)}
                            </span>
                          )}
                          {stop.bookingId && (
                            <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              #{stop.bookingId}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Full Address */}
                      <div className="text-xs text-slate-600 font-medium truncate mb-2">
                        {stop.address || 'No address specified'}
                      </div>

                      {/* Stop Actions */}
                      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleLaunchNavigation(stop.address)}
                            className="h-7 px-2.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Navigation size={11} />
                            <span>Navigate</span>
                          </button>
                          {stop.phone && (
                            <button
                              type="button"
                              onClick={() => makeCall(stop.phone, stop.patient)}
                              className="h-7 w-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
                              title="Call Client"
                            >
                              <Phone size={12} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => navigator.clipboard?.writeText(stop.address)}
                            className="h-7 w-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                            title="Copy Address"
                          >
                            <Copy size={12} />
                          </button>
                        </div>

                        {/* Move & Delete */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveStop(idx, -1)}
                            disabled={idx === 0}
                            className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 flex items-center justify-center cursor-pointer"
                            title="Move Up"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveStop(idx, 1)}
                            disabled={idx === stops.length - 1}
                            className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 flex items-center justify-center cursor-pointer"
                            title="Move Down"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeStop(stop.id)}
                            className="h-7 w-7 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 flex items-center justify-center cursor-pointer"
                            title="Remove Stop"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
