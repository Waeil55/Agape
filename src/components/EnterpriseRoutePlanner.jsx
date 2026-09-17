import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  MapPin, Navigation, GripVertical, Plus, Trash2, Clock,
  ArrowUpDown, RotateCcw, Check, ChevronRight, X,
  Search, Phone, Sparkles, CheckCircle2, Route, Timer, Users,
  Copy, Play, ArrowDown, ArrowUp, AlertTriangle, Eye, Save,
  SlidersHorizontal, CheckCheck, ListPlus, Send, RefreshCw,
  Wrench, FileText, Share2,
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
  onAssignTrip,
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

  const [mobileTab, setMobileTab] = useState(() => (Array.isArray(initialStops) && initialStops.length > 0 ? 'sequence' : 'available'));

  useEffect(() => {
    if (Array.isArray(initialStops) && initialStops.length > 0) {
      setStops(initialStops.map((s, idx) => ({
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
      })));
      setMobileTab('sequence');
    }
  }, [initialStops]);

  const [dateStr, setDateStr] = useState(getTodayDateString());
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [routeName, setRouteName] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [optimizing, setOptimizing] = useState(false);
  const [assigningDriver, setAssigningDriver] = useState(false);
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

  const addAllFiltered = useCallback(() => {
    if (availTrips.length === 0) return;
    const newStops = [];
    availTrips.forEach((t) => {
      const types = tripStopTypes[t.id] || {};
      const clientPhone = resolveClientPhoneForTrip(t, trips);
      if (!types.pickup && t.pickup) {
        newStops.push({
          id: makeStopId(t.id, 'pu'),
          tripId: t.id,
          type: 'pickup',
          patient: t.patient || 'Client',
          time: t.time || '',
          address: t.pickup || '',
          phone: clientPhone,
          locationPhone: t.pickupPhone || '',
          bookingId: t.bookingId || t.id || '',
          notes: t.notes || '',
        });
      }
      if (!types.dropoff && t.dropoff) {
        newStops.push({
          id: makeStopId(t.id, 'do'),
          tripId: t.id,
          type: 'dropoff',
          patient: t.patient || 'Client',
          time: t.doTime || t.dropoffTime || t.time || '',
          address: t.dropoff || '',
          phone: clientPhone,
          locationPhone: t.dropoffPhone || '',
          bookingId: t.bookingId || t.id || '',
          notes: t.notes || '',
        });
      }
    });
    setStops((prev) => [...prev, ...newStops]);
    setAiMsg(`✓ Added ${newStops.length} stops from filtered trips.`);
    setMobileTab('sequence');
  }, [availTrips, tripStopTypes, trips]);

  const autoFixPickupBeforeDropoff = useCallback(() => {
    setStops((prev) => {
      const copy = [...prev];
      let fixedCount = 0;
      for (let i = 0; i < copy.length; i++) {
        const s = copy[i];
        if (s.type === 'dropoff' && s.tripId) {
          const puIdx = copy.findIndex((item) => item.tripId === s.tripId && item.type === 'pickup');
          if (puIdx > i) {
            const [doStop] = copy.splice(i, 1);
            const newPuIdx = copy.findIndex((item) => item.tripId === s.tripId && item.type === 'pickup');
            copy.splice(newPuIdx + 1, 0, doStop);
            fixedCount += 1;
            i--;
          }
        }
      }
      if (fixedCount > 0) {
        setAiMsg(`✓ Fixed ${fixedCount} dropoff(s) to appear after pickup.`);
      } else {
        setAiMsg('✓ All pickups already precede dropoffs.');
      }
      return copy;
    });
  }, []);

  const clusterByLocality = useCallback(() => {
    setStops((prev) => {
      const copy = [...prev];
      const getLoc = (addr) => {
        if (!addr) return 'zzz';
        const parts = addr.split(',');
        return (parts[parts.length - 2] || parts[0] || '').trim().toLowerCase();
      };
      copy.sort((a, b) => getLoc(a.address).localeCompare(getLoc(b.address)));
      return copy;
    });
    setAiMsg('✓ Clustered stops by locality / neighborhood.');
  }, []);

  const clearRoute = useCallback(() => {
    if (window.confirm('Clear all stops from the current route plan?')) {
      setStops([]);
      setCompleted(new Set());
      setAiMsg('Route plan cleared.');
    }
  }, []);

  const handleDispatchToDriver = async () => {
    if (!selectedDriverId) {
      setAiMsg('Select a driver in the dropdown first.');
      return;
    }
    const uniqueTripIds = [...new Set(stops.map((s) => s.tripId).filter(Boolean))];
    if (uniqueTripIds.length === 0) {
      setAiMsg('No linked trips in itinerary to dispatch.');
      return;
    }
    const targetDriver = drivers.find((d) => d.id === selectedDriverId || d.email === selectedDriverId);
    const driverName = targetDriver?.name || targetDriver?.email || 'Driver';
    if (window.confirm(`Dispatch all ${uniqueTripIds.length} trip(s) in this route to ${driverName}?`)) {
      setAssigningDriver(true);
      try {
        if (typeof onAssignTrip === 'function') {
          for (const tid of uniqueTripIds) {
            await onAssignTrip(tid, targetDriver?.id || selectedDriverId);
          }
        }
        setAiMsg(`✓ Dispatched ${uniqueTripIds.length} trips to ${driverName}.`);
      } catch (err) {
        console.error('Dispatch error:', err);
        setAiMsg('Failed to dispatch trips to driver.');
      }
      setAssigningDriver(false);
    }
  };

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

        {/* Action Toolbar (Desktop only - md and up) */}
        <div className="hidden md:flex mt-2 pt-2 border-t border-slate-100 items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
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
              onClick={autoFixPickupBeforeDropoff}
              disabled={stops.length < 2}
              className="h-7 px-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
              title="Ensure all pickups occur before corresponding dropoffs"
            >
              <CheckCheck size={12} />
              <span>Fix PU→DO</span>
            </button>
            <button
              type="button"
              onClick={clusterByLocality}
              disabled={stops.length < 2}
              className="h-7 px-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
              title="Group stops by city / locality"
            >
              <MapPin size={12} />
              <span>Cluster Area</span>
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
            {selectedDriverId && typeof onAssignTrip === 'function' && stops.length > 0 && (
              <button
                type="button"
                onClick={handleDispatchToDriver}
                disabled={assigningDriver}
                className="h-7 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Users size={12} />
                <span>Dispatch to Driver</span>
              </button>
            )}
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
                onClick={clearRoute}
                className="h-7 px-2 rounded-lg text-rose-600 hover:bg-rose-50 text-xs font-semibold transition-colors cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── MOBILE SEGMENTED VIEW SWITCHER (< md) ── */}
      <div className="flex md:hidden bg-white border-b border-slate-200 px-2 py-1.5 gap-1 shrink-0 shadow-2xs">
        <button
          type="button"
          onClick={() => setMobileTab('available')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
            mobileTab === 'available'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Search size={12} />
          <span>Available ({availTrips.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('sequence')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
            mobileTab === 'sequence'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Route size={12} />
          <span>Stops ({stops.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('tools')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
            mobileTab === 'tools'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Wrench size={12} />
          <span>Tools</span>
        </button>
      </div>

      {/* ── SAVED PLANS MODAL / DRAWER ── */}
      {showSavedPlans && (
        <div className="p-3 bg-white border-b border-slate-200 shadow-sm animate-in slide-in-from-top-1">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Saved Route Plans</h4>
            <button
              type="button"
              onClick={() => setShowSavedPlans(false)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 cursor-pointer"
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

      {/* ── MAIN WORKSPACE ── */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        {/* LEFT PANE: AVAILABLE TRIPS */}
        <div className={`w-full md:w-80 xl:w-96 flex flex-col border-b md:border-b-0 md:border-r border-slate-200 bg-white min-h-0 shrink-0 ${
          mobileTab !== 'available' ? 'hidden md:flex' : 'flex-1 md:flex-none flex'
        }`}>
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/60">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold text-slate-800">Available Trips ({availTrips.length})</span>
              <span className="text-[10px] font-semibold text-slate-500">{dateStr}</span>
            </div>
            <div className="flex items-center gap-1.5 mb-2">
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

            {/* 1-Tap Bulk Add Filtered Trips */}
            {availTrips.length > 0 && (
              <button
                type="button"
                onClick={addAllFiltered}
                className="w-full py-1.5 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <ListPlus size={13} />
                <span>Add All {availTrips.length} Filtered to Plan</span>
              </button>
            )}
          </div>

          {/* Trips List with smooth vertical momentum scrolling */}
          <div
            className="flex-1 overflow-y-auto overscroll-contain p-2 space-y-2 pb-[calc(88px+env(safe-area-inset-bottom,0px))] touch-pan-y"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
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
                          className="flex-1 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-2xs"
                        >
                          <Plus size={11} /> + Both
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
        <div className={`flex-1 flex flex-col min-h-0 bg-slate-50/50 ${
          mobileTab !== 'sequence' ? 'hidden md:flex' : 'flex'
        }`}>
          <div className="p-3 bg-white border-b border-slate-200/80 flex items-center justify-between gap-2 shrink-0">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Stop Sequence ({stops.length})</h3>
              <p className="text-[11px] text-slate-500">Tap PU/DO to toggle. Use arrows to reorder.</p>
            </div>
            {stops.length > 0 && (
              <button
                type="button"
                onClick={() => handleLaunchNavigation(stops[0]?.address)}
                className="h-8 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
              >
                <Navigation size={13} />
                <span>Start Nav</span>
              </button>
            )}
          </div>

          {/* Stops List with smooth vertical momentum scrolling */}
          <div
            className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2 pb-[calc(88px+env(safe-area-inset-bottom,0px))] touch-pan-y"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {stops.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-300 mb-3 shadow-xs">
                  <Route size={28} />
                </div>
                <h4 className="text-sm font-bold text-slate-700">No stops in route plan</h4>
                <p className="text-xs text-slate-400 max-w-xs mt-1">
                  Add trips from the Available tab or select trips in the manifest and click "Plan".
                </p>
                <button
                  type="button"
                  onClick={() => setMobileTab('available')}
                  className="mt-3 md:hidden px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold cursor-pointer"
                >
                  View Available Trips
                </button>
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
                    className={`p-3 rounded-xl border bg-white shadow-2xs transition-all flex items-start gap-2.5 ${
                      isDone ? 'opacity-60 border-slate-200 bg-slate-50' : 'border-slate-200 hover:border-slate-300'
                    } ${dragOver === idx ? 'ring-2 ring-blue-400' : ''}`}
                  >
                    {/* Stop Letter */}
                    <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                      <div className="hidden md:block cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500">
                        <GripVertical size={15} />
                      </div>
                      <div className={`w-6 h-6 rounded-lg text-white flex items-center justify-center text-xs font-black shadow-2xs ${
                        isPu ? 'bg-emerald-600' : 'bg-rose-600'
                      }`}>
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
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide cursor-pointer transition-colors ${
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
                            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
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
                            className="h-7 px-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
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
                            onClick={() => {
                              navigator.clipboard?.writeText(stop.address);
                              setAiMsg(`Copied address for ${stop.patient}`);
                            }}
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
                            className="h-7 w-7 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 flex items-center justify-center cursor-pointer active:scale-95"
                            title="Move Up"
                            aria-label={`Move stop ${getStopLetter(idx)} up`}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveStop(idx, 1)}
                            disabled={idx === stops.length - 1}
                            className="h-7 w-7 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 flex items-center justify-center cursor-pointer active:scale-95"
                            title="Move Down"
                            aria-label={`Move stop ${getStopLetter(idx)} down`}
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeStop(stop.id)}
                            className="h-7 w-7 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 flex items-center justify-center cursor-pointer active:scale-95"
                            title="Remove Stop"
                            aria-label={`Remove stop ${getStopLetter(idx)}`}
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

        {/* ── MOBILE TOOLS PANEL: Dedicated Route Automation & Tools ── */}
        {mobileTab === 'tools' && (
          <div
            className="flex-1 flex flex-col min-h-0 bg-slate-50 md:hidden overflow-y-auto overscroll-contain p-3 space-y-3 pb-[calc(88px+env(safe-area-inset-bottom,0px))] touch-pan-y"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Smart Sequencing & AI</h3>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleAiOptimize}
                  disabled={optimizing || stops.length < 2}
                  className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold transition-all flex items-center justify-between cursor-pointer shadow-xs active:scale-98"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles size={15} className={optimizing ? 'animate-spin' : 'text-indigo-200'} />
                    <span>{optimizing ? 'AI Optimizing Route…' : 'AI Route Optimization'}</span>
                  </div>
                  <ChevronRight size={14} className="text-indigo-200" />
                </button>
                <button
                  type="button"
                  onClick={sortByTime}
                  disabled={stops.length < 2}
                  className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 text-xs font-bold transition-all flex items-center justify-between cursor-pointer active:scale-98"
                >
                  <div className="flex items-center gap-2">
                    <Clock size={15} className="text-blue-600" />
                    <span>Sort Chronologically by Schedule</span>
                  </div>
                  <ChevronRight size={14} className="text-slate-400" />
                </button>
                <button
                  type="button"
                  onClick={autoFixPickupBeforeDropoff}
                  disabled={stops.length < 2}
                  className="w-full py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-40 text-emerald-800 text-xs font-bold transition-all flex items-center justify-between cursor-pointer active:scale-98"
                >
                  <div className="flex items-center gap-2">
                    <CheckCheck size={15} className="text-emerald-600" />
                    <span>Auto-Fix: Pickup Before Dropoff</span>
                  </div>
                  <ChevronRight size={14} className="text-emerald-400" />
                </button>
                <button
                  type="button"
                  onClick={clusterByLocality}
                  disabled={stops.length < 2}
                  className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 text-xs font-bold transition-all flex items-center justify-between cursor-pointer active:scale-98"
                >
                  <div className="flex items-center gap-2">
                    <MapPin size={15} className="text-amber-600" />
                    <span>Cluster by Locality / Neighborhood</span>
                  </div>
                  <ChevronRight size={14} className="text-slate-400" />
                </button>
                <button
                  type="button"
                  onClick={reverseRoute}
                  disabled={stops.length < 2}
                  className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 text-xs font-bold transition-all flex items-center justify-between cursor-pointer active:scale-98"
                >
                  <div className="flex items-center gap-2">
                    <ArrowUpDown size={15} className="text-slate-600" />
                    <span>Reverse / Invert Stop Order</span>
                  </div>
                  <ChevronRight size={14} className="text-slate-400" />
                </button>
              </div>
            </div>

            {/* Driver Assignment Tool */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Driver Dispatch</h3>
              <p className="text-[11px] text-slate-500 mb-2">Assign all {stops.length} stop(s) in this itinerary to the selected driver.</p>
              <button
                type="button"
                onClick={handleDispatchToDriver}
                disabled={assigningDriver || stops.length === 0 || !selectedDriverId}
                className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-98"
              >
                <Users size={14} />
                <span>{assigningDriver ? 'Dispatching…' : selectedDriverId ? 'Dispatch Itinerary to Selected Driver' : 'Select Driver to Dispatch'}</span>
              </button>
            </div>

            {/* Export & Sharing Tools */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Export & Manifest</h3>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={copyManifest}
                  disabled={stops.length === 0}
                  className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 text-xs font-bold transition-all flex items-center justify-between cursor-pointer active:scale-98"
                >
                  <div className="flex items-center gap-2">
                    <Copy size={15} className="text-slate-600" />
                    <span>Copy Full Formatted Itinerary</span>
                  </div>
                  <ChevronRight size={14} className="text-slate-400" />
                </button>
                {typeof onSendToSequencer === 'function' && (
                  <button
                    type="button"
                    onClick={sendPlanToSequencer}
                    disabled={stops.length === 0}
                    className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold transition-all flex items-center justify-between cursor-pointer shadow-xs active:scale-98"
                  >
                    <div className="flex items-center gap-2">
                      <Play size={14} fill="currentColor" />
                      <span>Send to Sequence Engine</span>
                    </div>
                    <ChevronRight size={14} className="text-emerald-200" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearRoute}
                  disabled={stops.length === 0}
                  className="w-full py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:opacity-40 text-rose-700 text-xs font-bold transition-all flex items-center justify-between cursor-pointer active:scale-98"
                >
                  <div className="flex items-center gap-2">
                    <Trash2 size={15} className="text-rose-600" />
                    <span>Clear Route Itinerary</span>
                  </div>
                  <ChevronRight size={14} className="text-rose-400" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
