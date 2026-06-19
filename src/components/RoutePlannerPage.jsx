import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Route, MapPin, Clock, Users, AlertTriangle, ArrowDown, ArrowUp, X, CheckCircle2,
  GripVertical, ChevronRight, Search, Flag, Plus, Trash2,
  Play, BrainCircuit, Loader2,
  Sparkles, Copy, Sun, Moon, Eye, EyeOff, ArrowLeftRight,
  LogIn, LogOut, Filter, ChevronDown, RefreshCw
} from 'lucide-react';
import { timeToMinutes } from '../utils/tripDate';
import { optimizeRoute as geminiOptimizeRoute } from '../config/ai';
import { db, doc, onSnapshot, setDoc, serverTimestamp } from '../config/firebase';

// Safely coerce any value (including legacy {address,phone,time} objects) to a string
function safeStr(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') return val.address || val.name || val.label || val.text || val.value || '';
  return String(val);
}
function sanitizeStop(s) {
  if (!s || typeof s !== 'object') return s;
  return { ...s, address: safeStr(s.address), time: safeStr(s.time), notes: safeStr(s.notes) };
}

const to12hr = (t) => {
  if (!t || t === 'Will Call' || t === 'WC') return t || 'WC';
  const m = String(t).match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (m && m[3]) return t;
  const p = String(t).match(/(\d{1,2}):(\d{2})/);
  if (!p) return t;
  let h = parseInt(p[1]), min = p[2], ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12; else if (h > 12) h -= 12;
  return `${h}:${min} ${ampm}`;
};
const getStopLetter = (i) => String.fromCharCode(65 + i);
const isLate = (time) => { if (!time || time === 'Will Call') return false; const n = new Date(); const m = timeToMinutes(time); const s = new Date(); s.setHours(Math.floor(m / 60), m % 60, 0, 0); return n > s; };
const makeStopId = (tripId, type) => `${tripId}_${type}`;
const STORAGE_KEY = 'agape_routePlanner_v3';
const sanitizePlannerKey = (value) => String(value || 'global').replace(/[^a-zA-Z0-9@._-]/g, '_');

const statusColors = {
  Unassigned: 'bg-slate-100 text-slate-600',
  Assigned: 'bg-blue-100 text-blue-700',
  'In Mission': 'bg-blue-100 text-blue-700',
  'En Route': 'bg-amber-100 text-amber-700',
  'At Pickup': 'bg-cyan-100 text-cyan-700',
  'At Dropoff': 'bg-purple-100 text-purple-700',
  Completed: 'bg-emerald-100 text-emerald-700',
  Cancelled: 'bg-rose-100 text-rose-700',
  'No Show': 'bg-rose-100 text-rose-700',
};

const RoutePlannerPage = ({ trips = [], drivers = [], role, currentUser, onSendToSequencer }) => {
  const [stops, setStops] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(raw) ? raw.map(sanitizeStop) : [];
    } catch { return []; }
  });
  const [routeName, setRouteName] = useState('');
  const [selectedDriver, setSelectedDriver] = useState(() => localStorage.getItem('agape_rp_driver') || '');
  const [dateStr, setDateStr] = useState(() => localStorage.getItem('agape_rp_date') || new Date().toISOString().split('T')[0]);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [optimizing, setOptimizing] = useState(false);
  const [navMode, setNavMode] = useState(false);
  const [navStep, setNavStep] = useState(0);
  const [completed, setCompleted] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('agape_rp_completed_v3') || '[]')); } catch { return new Set(); } });
  const [searchQ, setSearchQ] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [aiMsg, setAiMsg] = useState('');
  const [dark, setDark] = useState(false);
  const cloudReadyRef = useRef(false);
  const saveTimerRef = useRef(null);
  const plannerDocId = useMemo(() => `routePlanner_${sanitizePlannerKey(currentUser || role || 'global')}`, [currentUser, role]);

  useEffect(() => {
    cloudReadyRef.current = false;
    const unsub = onSnapshot(
      doc(db, 'routeData', plannerDocId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() || {};
          if (Array.isArray(data.stops)) setStops(data.stops);
          if (Array.isArray(data.completed)) setCompleted(new Set(data.completed));
          if (typeof data.selectedDriver === 'string') setSelectedDriver(data.selectedDriver);
          if (typeof data.dateStr === 'string' && data.dateStr) setDateStr(data.dateStr);
        }
        cloudReadyRef.current = true;
      },
      (err) => {
        console.error('Route planner cloud sync failed:', err);
        cloudReadyRef.current = true;
      }
    );
    return () => {
      unsub();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [plannerDocId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stops));
    localStorage.setItem('agape_rp_completed_v3', JSON.stringify([...completed]));
    localStorage.setItem('agape_rp_driver', selectedDriver);
    localStorage.setItem('agape_rp_date', dateStr);
    if (!cloudReadyRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setDoc(doc(db, 'routeData', plannerDocId), {
        stops,
        completed: [...completed],
        selectedDriver,
        dateStr,
        updatedAt: serverTimestamp(),
        updatedAtLocal: new Date().toISOString(),
      }, { merge: true }).catch((err) => {
        console.error('Route planner cloud save failed:', err);
      });
    }, 350);
  }, [stops, completed, selectedDriver, dateStr, plannerDocId]);

  const tripStopTypes = useMemo(() => {
    const map = {};
    stops.forEach(s => {
      if (!map[s.tripId]) map[s.tripId] = { pickup: false, dropoff: false };
      map[s.tripId][s.type] = true;
    });
    return map;
  }, [stops]);

  const filteredTrips = useMemo(() => {
    let list = (trips || []).filter(t => t.patient);
    if (filterStatus !== 'all') list = list.filter(t => t.status === filterStatus);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      list = list.filter(t =>
        t.patient?.toLowerCase().includes(q) ||
        t.pickup?.toLowerCase().includes(q) ||
        t.dropoff?.toLowerCase().includes(q) ||
        (t.bookingId || '').includes(q) ||
        (t.driverName || t.driver || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  }, [trips, filterStatus, searchQ]);

  const availTrips = useMemo(() => {
    return filteredTrips.filter(t => {
      const types = tripStopTypes[t.id];
      if (types?.pickup && types?.dropoff) return false;
      return !['Completed', 'Cancelled', 'No Show'].includes(t.status);
    });
  }, [filteredTrips, tripStopTypes]);

  const conflicts = useMemo(() => {
    const c = [];
    for (let i = 0; i < stops.length; i++) {
      for (let j = i + 1; j < stops.length; j++) {
        const ta = timeToMinutes(stops[i].time), tb = timeToMinutes(stops[j].time);
        if (Math.abs(ta - tb) < 15 && ta !== 1440 && tb !== 1440)
          c.push({ a: stops[i].patient, b: stops[j].patient, ta: stops[i].time, tb: stops[j].time });
      }
    }
    return c;
  }, [stops]);

  // === ACTIONS ===

  const addTrip = useCallback((trip) => {
    setStops(prev => [...prev,
      { id: makeStopId(trip.id, 'pu'), tripId: trip.id, type: 'pickup', patient: trip.patient, time: safeStr(trip.time), address: safeStr(trip.pickup), phone: safeStr(trip.pickupPhone || trip.patientPhone), wheelchair: trip.wheelchair, notes: safeStr(trip.notes), bookingId: trip.bookingId },
      { id: makeStopId(trip.id, 'do'), tripId: trip.id, type: 'dropoff', patient: trip.patient, time: safeStr(trip.time), address: safeStr(trip.dropoff), phone: safeStr(trip.dropoffPhone || trip.patientPhone), wheelchair: trip.wheelchair, notes: safeStr(trip.notes), bookingId: trip.bookingId },
    ]);
  }, []);

  const addPickupOnly = useCallback((trip) => {
    setStops(prev => [...prev, { id: makeStopId(trip.id, 'pu'), tripId: trip.id, type: 'pickup', patient: trip.patient, time: safeStr(trip.time), address: safeStr(trip.pickup), phone: safeStr(trip.pickupPhone || trip.patientPhone), wheelchair: trip.wheelchair, notes: safeStr(trip.notes), bookingId: trip.bookingId }]);
  }, []);

  const addDropoffOnly = useCallback((trip) => {
    setStops(prev => [...prev, { id: makeStopId(trip.id, 'do'), tripId: trip.id, type: 'dropoff', patient: trip.patient, time: safeStr(trip.time), address: safeStr(trip.dropoff), phone: safeStr(trip.dropoffPhone || trip.patientPhone), wheelchair: trip.wheelchair, notes: safeStr(trip.notes), bookingId: trip.bookingId }]);
  }, []);

  const removeStop = useCallback((stopId) => {
    setStops(prev => prev.filter(s => s.id !== stopId));
    setCompleted(prev => { const n = new Set(prev); n.delete(stopId); return n; });
  }, []);

  const moveStop = useCallback((idx, dir) => {
    setStops(prev => { const arr = [...prev]; const t = idx + dir; if (t < 0 || t >= arr.length) return arr; [arr[idx], arr[t]] = [arr[t], arr[idx]]; return arr; });
  }, []);

  const handleDragStart = (i) => setDragIdx(i);
  const handleDragOver = (e, i) => { e.preventDefault(); setDragOver(i); };
  const handleDrop = (i) => {
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setDragOver(null); return; }
    setStops(prev => { const arr = [...prev]; const [m] = arr.splice(dragIdx, 1); arr.splice(i, 0, m); return arr; });
    setDragIdx(null); setDragOver(null);
  };

  const toggleStopType = (stopId) => {
    setStops(prev => prev.map(s => {
      if (s.id !== stopId) return s;
      const newType = s.type === 'pickup' ? 'dropoff' : 'pickup';
      const trip = trips.find(t => t.id === s.tripId);
      return { ...s, type: newType, address: newType === 'pickup' ? (trip?.pickup || s.address) : (trip?.dropoff || s.address), phone: newType === 'pickup' ? (trip?.pickupPhone || s.phone) : (trip?.dropoffPhone || s.phone) };
    }));
  };

  const handleOptimize = async () => {
    if (stops.length < 2) { setAiMsg('Add at least 2 stops to optimize.'); return; }
    setOptimizing(true); setAiMsg('');
    const loc = (drivers || []).find(d => (d.id || d.email) === selectedDriver)?.currentZone || 'Dispatch';
    try {
      const tripData = [];
      for (const s of stops) {
        const trip = trips.find(t => t.id === s.tripId);
        if (!trip) continue;
        tripData.push({ id: s.id, patient: s.patient, pickup: trip.pickup || '', dropoff: trip.dropoff || '', address: s.address, type: s.type, time: s.time });
      }
      const ordered = await geminiOptimizeRoute(tripData, loc);
      if (ordered?.length >= 2) {
        const orderMap = ordered.reduce((a, id, i) => { a[id] = i; return a; }, {});
        setStops(prev => [...prev].sort((a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999)));
        setAiMsg('Route optimized by AI.');
      } else {
        setStops(prev => [...prev].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)));
        setAiMsg('Sorted by appointment time.');
      }
    } catch (err) {
      console.error('[RoutePlanner] handleOptimize error:', err);
      setStops(prev => [...prev].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)));
      setAiMsg('AI optimization failed - sorted by time.');
    }
    setOptimizing(false);
  };

  const clearRoute = () => { setStops([]); setCompleted(new Set()); setRouteName(''); setNavMode(false); setAiMsg(''); };

  const completeStop = (stopId) => {
    setCompleted(prev => { const n = new Set(prev); n.add(stopId); return n; });
    const idx = stops.findIndex(s => s.id === stopId);
    if (idx < stops.length - 1) setNavStep(idx + 1);
  };
  const skipStop = () => { if (navStep < stops.length - 1) setNavStep(navStep + 1); };

  const copyRoute = () => {
    const text = stops.map((s, i) =>
      `${getStopLetter(i)}. [${s.type === 'pickup' ? 'PU' : 'DO'}] ${s.patient} (${to12hr(s.time)})\n   ${s.type === 'pickup' ? 'Pickup' : 'Dropoff'}: ${s.address}`
    ).join('\n\n');
    navigator.clipboard.writeText(`${routeName || 'Route'}\n${'='.repeat(20)}\n${text}\n\nDriver: ${drivers.find(d => (d.id || d.email) === selectedDriver)?.name || 'Unassigned'}\nDate: ${dateStr}`).then(() => setAiMsg('Route copied!')).catch(() => {});
  };

  const startNav = () => {
    if (stops.length > 0) { setNavMode(true); const fi = stops.findIndex(s => !completed.has(s.id)); setNavStep(fi >= 0 ? fi : 0); }
  };

  const sendToSequencer = () => {
    if (typeof onSendToSequencer !== 'function' || stops.length === 0) return;
    const groups = new Map();
    stops.forEach((stop) => {
      const id = stop.tripId || stop.id || `manual-${Date.now()}`;
      if (!groups.has(id)) {
        groups.set(id, {
          clientName: stop.patient || 'Route Stop',
          pu: '',
          do: '',
          time: stop.time || '',
          serviceType: stop.wheelchair ? 'WHEELCHAIR' : '',
          bookingId: stop.bookingId || '',
          phone: stop.phone || '',
        });
      }
      const g = groups.get(id);
      if (stop.type === 'pickup') g.pu = stop.address || g.pu;
      if (stop.type === 'dropoff') g.do = stop.address || g.do;
      if (stop.patient && !g.clientName.startsWith('Stop ')) g.clientName = stop.patient;
      if (stop.time && !g.time) g.time = stop.time;
      if (stop.bookingId && !g.bookingId) g.bookingId = stop.bookingId;
      if (stop.phone && !g.phone) g.phone = stop.phone;
    });

    const items = [];
    const sequence = [];
    let groupIdx = 0;
    groups.forEach((g) => {
      const groupId = `seq-${groupIdx++}-${Date.now()}`;
      if (g.pu) {
        items.push({ id: `${groupId}-pu`, address: g.pu, name: g.clientName, pu: g.pu, do: '', time: g.time, serviceType: g.serviceType, bookingId: g.bookingId, phone: g.phone });
        sequence.push({ clientId: `${groupId}-pu`, type: 'PU', leg: 'A' });
      }
      if (g.do) {
        items.push({ id: `${groupId}-do`, address: g.do, name: g.clientName, pu: '', do: g.do, time: g.time, serviceType: g.serviceType, bookingId: g.bookingId, phone: g.phone });
        sequence.push({ clientId: `${groupId}-do`, type: 'DO', leg: 'A' });
      }
    });

    onSendToSequencer({ clients: items, sequence });
    setAiMsg(`${stops.length} stops sent to Route Sequencer.`);
  };

  // === RENDER HELPERS ===

  const bg = dark ? 'bg-slate-900 text-slate-100' : 'bg-slate-100 text-slate-900';
  const cardBg = dark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const inputBg = dark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200 text-slate-800';

  const renderScheduleTrip = (trip) => {
    const existing = tripStopTypes[trip.id] || {};
    const statusClass = statusColors[trip.status] || 'bg-slate-100 text-slate-600';
    const driverName = drivers.find(d => d.id === trip.driverId)?.name || trip.driverName || trip.driver || '';
    return (
      <div key={trip.id} className={`${cardBg} rounded-lg border px-2.5 py-2 text-xs`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold truncate flex-1">{trip.patient}</span>
          <span className="text-slate-400 font-mono text-[9px]">{to12hr(trip.time)}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusClass}`}>{trip.status || 'Unassigned'}</span>
          {driverName && <span className="text-[9px] text-slate-400">{driverName}</span>}
          {trip.wheelchair && <Users size={9} className="text-blue-500" />}
          {trip.bookingId && <span className="text-[8px] text-blue-300 font-mono">{trip.bookingId}</span>}
        </div>
        <div className="flex items-center gap-1 mt-1.5">
          <button onClick={() => addPickupOnly(trip)} disabled={existing.pickup}
            className={`px-2 h-6 text-[9px] font-bold rounded flex items-center gap-1 ${existing.pickup ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700'} active:scale-95`}>
            <LogIn size={9} />{existing.pickup ? '✓' : 'PU'}
          </button>
          <button onClick={() => addDropoffOnly(trip)} disabled={existing.dropoff}
            className={`px-2 h-6 text-[9px] font-bold rounded flex items-center gap-1 ${existing.dropoff ? 'bg-slate-100 text-slate-400' : 'bg-amber-600 text-white hover:bg-amber-700'} active:scale-95`}>
            <LogOut size={9} />{existing.dropoff ? '✓' : 'DO'}
          </button>
          <button onClick={() => addTrip(trip)} disabled={existing.pickup && existing.dropoff}
            className={`px-2 h-6 text-[9px] font-bold rounded ${existing.pickup && existing.dropoff ? 'bg-slate-100 text-slate-400' : 'bg-slate-600 text-white hover:bg-slate-700'} active:scale-95`}>
            +2
          </button>
        </div>
        <div className="text-[9px] text-slate-400 mt-1 leading-tight">
          <div className="truncate"><MapPin size={7} className="inline mr-0.5 text-blue-500" />{trip.pickup}</div>
          <div className="truncate"><Flag size={7} className="inline mr-0.5 text-amber-600" />{trip.dropoff}</div>
        </div>
      </div>
    );
  };

  const renderStopRow = (stop, idx) => {
    const letter = getStopLetter(idx);
    const done = completed.has(stop.id);
    const isDrag = dragIdx === idx;
    const isOver = dragOver === idx;
    const late = isLate(stop.time);
    const isPu = stop.type === 'pickup';

    return (
      <div key={stop.id}
        draggable={!navMode}
        onDragStart={() => handleDragStart(idx)}
        onDragOver={(e) => handleDragOver(e, idx)}
        onDrop={() => handleDrop(idx)}
        onDragEnd={() => { setDragIdx(null); setDragOver(null); }}
        className={`transition-all duration-200 ${isDrag ? 'opacity-40 scale-[1.01]' : ''} ${isOver ? 'translate-y-1' : ''} ${done ? 'opacity-60' : ''}`}>
        <div className={`${cardBg} rounded-xl border shadow-sm hover:shadow-md transition-shadow overflow-hidden ${done ? 'border-emerald-200' : isPu ? 'border-blue-200' : 'border-amber-200'}`}>
          <div className={`h-0.5 w-full ${done ? 'bg-emerald-400' : isPu ? 'bg-blue-400' : 'bg-amber-400'}`} />
          <div className="px-3 py-2.5 flex items-center gap-2.5">
            {!navMode && <div className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500"><GripVertical size={13} /></div>}
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${done ? 'bg-emerald-100 text-emerald-700' : isPu ? 'bg-blue-600 text-white' : 'bg-amber-600 text-white'}`}>
              {done ? <CheckCircle2 size={13} /> : isPu ? 'PU' : 'DO'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-bold truncate max-w-[120px] ${done ? 'line-through text-slate-400' : 'text-slate-800'}`}>{stop.patient}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {to12hr(stop.time)}
                </span>
                {stop.wheelchair && <Users size={10} className="text-blue-500 shrink-0" />}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                {isPu ? <LogIn size={9} className="text-blue-500 shrink-0" /> : <LogOut size={9} className="text-amber-600 shrink-0" />}
                <span className="truncate">{safeStr(stop.address)}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!navMode && !done && (
                <>
                  <button onClick={() => moveStop(idx, -1)} disabled={idx === 0} className="p-1 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded disabled:opacity-20"><ArrowUp size={12} /></button>
                  <button onClick={() => moveStop(idx, 1)} disabled={idx === stops.length - 1} className="p-1 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded disabled:opacity-20"><ArrowDown size={12} /></button>
                  <button onClick={() => toggleStopType(stop.id)} className="p-1 text-slate-300 hover:text-purple-500 hover:bg-purple-50 rounded" title="Toggle PU/DO"><ArrowLeftRight size={11} /></button>
                  <button onClick={() => removeStop(stop.id)} className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded"><X size={12} /></button>
                </>
              )}
            </div>
          </div>
        </div>
        {idx < stops.length - 1 && <div className="w-0.5 h-4 bg-slate-200 ml-5" />}
      </div>
    );
  };

  // ─── NAVIGATION MODE ───
  if (navMode) {
    const current = stops[navStep];
    const progress = stops.length > 0 ? (navStep / stops.length) * 100 : 0;
    if (!current) return (
      <div className={`flex-1 flex items-center justify-center ${bg}`}>
        <div className="text-center p-8">
          <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-500" />
          <p className="text-lg font-bold">Route Complete</p>
          <p className={`text-sm ${muted} mt-1`}>All stops completed.</p>
          <button onClick={() => setNavMode(false)} className="mt-6 px-6 h-11 btn-gradient-primary font-bold text-sm hover:bg-blue-700">Exit</button>
        </div>
      </div>
    );
    const isPuNav = current.type === 'pickup';
    return (
      <div className={`flex-1 flex flex-col min-h-0 ${bg}`}>
        <div className={`sticky top-0 z-10 ${dark ? 'bg-slate-800' : 'bg-white/95 backdrop-blur-sm'} border-b ${dark ? 'border-slate-700' : 'border-slate-100'} px-4 py-3`}>
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setNavMode(false)} className={`p-1.5 rounded-lg ${dark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}><X size={16} /></button>
            <span className={`text-xs font-bold ${muted}`}>{navStep + 1}/{stops.length}</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-lg mx-auto text-center mb-6">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-black mx-auto mb-3 shadow-lg ${isPuNav ? 'bg-blue-600 text-white' : 'bg-amber-600 text-white'}`}>
              {isPuNav ? 'PU' : 'DO'}
            </div>
            <p className={`text-lg font-bold ${dark ? 'text-slate-200' : 'text-slate-800'}`}>{current.patient}</p>
            <p className={`text-sm ${muted} mt-0.5`}>Stop {navStep + 1} - {isPuNav ? 'Pickup' : 'Dropoff'}</p>
          </div>
          <div className={`${cardBg} rounded-2xl border p-4 mb-4 space-y-3 shadow-sm`}>
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-xl ${isPuNav ? 'bg-blue-50' : 'bg-amber-50'} flex items-center justify-center shrink-0`}>
                {isPuNav ? <LogIn size={14} className="text-blue-600" /> : <LogOut size={14} className="text-amber-600" />}
              </div>
              <div className="min-w-0">
                <p className={`text-[10px] font-bold ${muted} uppercase tracking-wider`}>{isPuNav ? 'Pickup' : 'Dropoff'} Address</p>
                <p className={`text-sm font-medium ${dark ? 'text-slate-200' : 'text-slate-800'} mt-0.5`}>{current.address || 'No address'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center shrink-0"><Clock size={14} className="text-amber-600" /></div>
              <div className="min-w-0">
                <p className={`text-[10px] font-bold ${muted} uppercase tracking-wider`}>Time</p>
                <p className={`text-sm font-medium ${dark ? 'text-slate-200' : 'text-slate-800'} mt-0.5`}>{to12hr(current.time)}</p>
              </div>
            </div>
            {current.notes && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><AlertTriangle size={14} className="text-slate-500" /></div>
                <div className="min-w-0">
                  <p className={`text-[10px] font-bold ${muted} uppercase tracking-wider`}>Notes</p>
                  <p className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-800'} mt-0.5`}>{current.notes}</p>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => completeStop(current.id)} className="flex-1 h-12 bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-emerald-700 active:scale-95"><CheckCircle2 size={16} /> Complete</button>
            <button onClick={skipStop} className={`h-12 px-4 rounded-xl font-bold text-sm active:scale-95 ${dark ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Skip</button>
          </div>
          {navStep + 1 < stops.length && (
            <div className="mt-6 pt-4 border-t border-slate-100">
              <p className={`text-[10px] font-bold ${muted} uppercase tracking-wider mb-2`}>Next</p>
              <div className={`flex items-center gap-3 ${cardBg} rounded-xl border p-3`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${stops[navStep + 1].type === 'pickup' ? 'bg-blue-600 text-white' : 'bg-amber-600 text-white'}`}>
                  {stops[navStep + 1].type === 'pickup' ? 'PU' : 'DO'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${dark ? 'text-slate-200' : 'text-slate-700'} truncate`}>{stops[navStep + 1].patient}</p>
                  <p className="text-xs text-slate-400">{to12hr(stops[navStep + 1].time)}</p>
                </div>
                <ChevronRight size={16} className="text-slate-300" />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── MAIN LAYOUT (Schedule + Route Builder) ───
  return (
    <div className={`flex-1 flex min-h-0 ${bg}`}>
      {/* === LEFT: Schedule / Trip List === */}
      <div className={`w-72 xl:w-80 shrink-0 border-r ${dark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'} flex flex-col`}>
        <div className={`sticky top-0 px-3 py-2 border-b ${dark ? 'border-slate-700' : 'border-slate-100'} shrink-0`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-xs font-bold flex items-center gap-1.5 ${dark ? 'text-slate-200' : 'text-slate-700'}`}>
              <Filter size={11} /> Schedule
              <span className="text-[9px] font-normal text-slate-400">({filteredTrips.length})</span>
            </h3>
          </div>
          <div className="flex gap-1 mt-1.5">
            <div className="relative flex-1">
              <Search size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search..." className={`w-full pl-6 pr-1.5 py-1 text-[10px] rounded border outline-none ${inputBg}`} />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={`px-1 py-1 text-[10px] rounded border outline-none max-w-[70px] ${inputBg}`}>
              <option value="all">All</option>
              <option value="Unassigned">Unasgn</option>
              <option value="Assigned">Assign</option>
              <option value="In Mission">Active</option>
            </select>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {availTrips.length === 0 ? (
            <div className="p-4 text-center">
              <p className={`text-xs font-bold ${muted}`}>No trips available</p>
              <p className="text-[10px] text-slate-400 mt-1">All trips are in the route or completed.</p>
            </div>
          ) : availTrips.map(renderScheduleTrip)}
        </div>
      </div>

      {/* === RIGHT: Route Builder === */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Top Bar */}
        <div className={`sticky top-0 z-10 ${dark ? 'bg-slate-800' : 'bg-white/95 backdrop-blur-sm'} border-b ${dark ? 'border-slate-700' : 'border-slate-100'} shrink-0`}>
          <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Route size={16} className="text-blue-600" />
              <input value={routeName} onChange={e => setRouteName(e.target.value)} placeholder="Route name..." className={`text-sm font-bold bg-transparent outline-none w-28 placeholder:text-slate-300 ${dark ? 'text-slate-100' : 'text-slate-900'}`} />
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)} className={`px-1.5 py-1 text-[10px] rounded-lg border outline-none ${inputBg}`} />
              <select value={selectedDriver} onChange={e => setSelectedDriver(e.target.value)} className={`px-1.5 py-1 text-[10px] rounded-lg border outline-none max-w-[90px] ${inputBg}`}>
                <option value="">Driver...</option>
                {(drivers || []).map(d => <option key={d.id || d.email} value={d.id || d.email}>{d.name || d.email}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handleOptimize} disabled={stops.length < 2 || optimizing}
                className="px-2.5 h-7 btn-gradient-primary text-[10px] font-bold flex items-center gap-1 hover:bg-blue-700 active:scale-95 disabled:opacity-30">
                {optimizing ? <Loader2 size={11} className="animate-spin" /> : <BrainCircuit size={11} />} Optimize
              </button>
              <button onClick={copyRoute} disabled={stops.length === 0} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-30" title="Copy route"><Copy size={13} /></button>
              <button onClick={sendToSequencer} disabled={stops.length === 0 || typeof onSendToSequencer !== 'function'} className="px-2.5 h-7 bg-blue-900 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 hover:bg-blue-800 active:scale-95 disabled:opacity-30" title="Send route to sequencer">
                <Route size={11} /> Sequencer
              </button>
              <button onClick={clearRoute} disabled={stops.length === 0} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg disabled:opacity-30" title="Clear route"><Trash2 size={13} /></button>
              <button onClick={() => setDark(v => !v)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">{dark ? <Sun size={13} /> : <Moon size={13} />}</button>
            </div>
          </div>
          {/* Stats bar */}
          <div className={`flex items-center gap-3 px-4 pb-2 text-[10px] ${muted} flex-wrap`}>
            <span><strong className={dark ? 'text-slate-200' : 'text-slate-700'}>{stops.length}</strong> stops</span>
            <span><strong>{stops.filter(s => s.type === 'pickup').length}</strong> PU / <strong>{stops.filter(s => s.type === 'dropoff').length}</strong> DO</span>
            {completed.size > 0 && <span className="text-emerald-600"><strong>{completed.size}</strong> done</span>}
            {conflicts.length > 0 && <span className="text-rose-600 font-bold flex items-center gap-1"><AlertTriangle size={10} />{conflicts.length} clash</span>}
            {stops.length > 0 && (
              <button onClick={startNav} className="ml-auto px-2.5 h-7 bg-emerald-600 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 hover:bg-emerald-700 active:scale-95">
                <Play size={11} /> Navigate
              </button>
            )}
          </div>
        </div>

        {/* AI Message */}
        {aiMsg && (
          <div className={`px-4 py-2 flex items-center gap-2 text-xs border-b ${dark ? 'border-slate-700 bg-slate-800' : 'border-indigo-100 bg-indigo-50'}`}>
            <Sparkles size={12} className="text-indigo-600 shrink-0" />
            <span className={`${dark ? 'text-slate-200' : 'text-indigo-800'} flex-1`}>{aiMsg}</span>
            <button onClick={() => setAiMsg('')} className="text-slate-400 hover:text-slate-600"><X size={12} /></button>
          </div>
        )}

        {/* Stops list */}
        <div className="flex-1 overflow-y-auto p-3">
          {stops.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Route size={40} className="mb-3 opacity-20" />
              <p className="text-sm font-bold text-slate-600">No stops in route</p>
              <p className={`text-xs ${muted} mt-1`}>Add trips from the left panel to build a route.</p>
            </div>
          ) : (
            <div className="max-w-xl mx-auto space-y-0">
              {stops.map((s, i) => renderStopRow(s, i))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoutePlannerPage;
