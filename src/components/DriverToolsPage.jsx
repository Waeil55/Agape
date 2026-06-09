import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronRight, ChevronDown, Navigation, Route,
  MapPin, Clock, Copy, Check, XCircle
} from 'lucide-react';
import { GOOGLE_MAPS_API_KEY } from '../config/firebase';

const timeToMinutes = (t) => {
  if (!t || t === 'Will Call' || t === 'WC') return 1440;
  const m = String(t).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return 1440;
  let h = parseInt(m[1], 10);
  let min = parseInt(m[2] || '0', 10);
  const p = m[3];
  if (p) {
    if (p.toUpperCase() === 'PM' && h < 12) h += 12;
    if (p.toUpperCase() === 'AM' && h === 12) h = 0;
  }
  return h * 60 + min;
};

const to12hr = (time) => {
  if (!time || time === 'Will Call' || time === 'WC') return time || 'Will Call';
  const m = String(time).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (m && m[3]) return time;
  const parts = String(time).match(/(\d{1,2}):(\d{2})/);
  if (!parts) return time;
  let h = parseInt(parts[1], 10);
  const min = parts[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${min} ${ampm}`;
};

const formatDuration = (minutes) => {
  if (!minutes || minutes < 0) return '--';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
};

const sanitizeStorageKey = (value) => String(value || 'anon').replace(/[^a-zA-Z0-9@._-]/g, '_');
const cleanRouteAddress = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const stopSignature = (stop) => `${cleanRouteAddress(stop?.label).toLowerCase()}|${stop?.tripId || ''}|${stop?.stopType || ''}`;
const stopTypeRank = (stopType) => (stopType === 'PU' ? 0 : stopType === 'DO' ? 1 : 2);

const createBlankStop = (letter = 'A') => ({
  id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  type: 'stop',
  letter,
  label: '',
  clientName: '',
  stopTime: '',
  stopType: '',
  tripId: null,
  bookingId: '',
  source: 'manual',
});

const normalizeStopOrder = (items = [], driverPosition = null) => {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  const originIndex = safeItems.findIndex((stop) => stop.type === 'origin' || stop.id === 'origin');
  const originSource = originIndex >= 0 ? safeItems[originIndex] : null;
  const positionLabel = driverPosition?.lat && driverPosition?.lng ? `${driverPosition.lat},${driverPosition.lng}` : '';
  const origin = {
    id: 'origin',
    type: 'origin',
    letter: null,
    label: originSource?.label || positionLabel || '',
    clientName: '',
    stopTime: '',
    stopType: 'ORIGIN',
    tripId: null,
    bookingId: '',
    source: originSource?.source || (positionLabel ? 'gps' : 'manual'),
  };
  const rest = safeItems
    .filter((stop) => stop.type !== 'origin' && stop.id !== 'origin')
    .sort((a, b) => {
      const rankDiff = stopTypeRank(a.stopType) - stopTypeRank(b.stopType);
      if (rankDiff !== 0) return rankDiff;
      return timeToMinutes(a.stopTime) - timeToMinutes(b.stopTime);
    })
    .map((stop, index) => ({
      ...stop,
      letter: String.fromCharCode(65 + index),
    }));
  return [origin, ...rest];
};

const normalizeImportedStop = (stop) => ({
  id: `imported-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  type: 'stop',
  letter: '',
  label: stop.address || '',
  clientName: stop.clientName || '',
  stopTime: stop.time || '',
  stopType: stop.stopType || '',
  tripId: stop.tripId || null,
  bookingId: stop.bookingId || '',
  source: 'trip',
});

const readSavedRoutePlan = (storageKey, driverPosition) => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return normalizeStopOrder(parsed, driverPosition);
    }
  } catch {}
  return [createBlankStop('Origin'), createBlankStop('A')];
};

const RoutePlanSection = ({
  routePlanStops = null,
  onSetRoutePlanStops = null,
  appSettings = {},
  onSendToSequencer = null,
  onOpenSequencer = null,
  currentUser = 'driver',
  driverPosition = null,
}) => {
  const storageKey = `agape_routePlan_${sanitizeStorageKey(currentUser)}`;
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const [stops, setStops] = useState(() => readSavedRoutePlan(storageKey, driverPosition));
  const [routeSummary, setRouteSummary] = useState({ duration: '0 min', distance: '--', legs: [] });
  const [isCalculating, setIsCalculating] = useState(false);
  const [expanded, setExpanded] = useState(() => localStorage.getItem(`${storageKey}:expanded`) !== '0');
  const [gettingLocation, setGettingLocation] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [routeNotice, setRouteNotice] = useState('');
  const [copiedRoute, setCopiedRoute] = useState(false);

  const loadGoogleMapsScript = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps) { resolve(); return; }
      const existing = document.getElementById('gm-script');
      if (existing) { existing.addEventListener('load', resolve); existing.addEventListener('error', reject); return; }
      const s = document.createElement('script');
      s.id = 'gm-script';
      s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY()}`;
      s.async = true; s.defer = true;
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }, []);

  const getCurrentAddress = useCallback(() => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(''); return; }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude, longitude } = pos.coords;
            const res = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY()}`
            );
            const data = await res.json();
            if (data.results?.[0]) resolve(data.results[0].formatted_address);
            else resolve(`${latitude}, ${longitude}`);
          } catch { resolve(`${pos.coords.latitude}, ${pos.coords.longitude}`); }
        },
        () => resolve(''),
        { timeout: 8000, enableHighAccuracy: true }
      );
    });
  }, []);

  const updateStops = (newStops) => {
    setStops(normalizeStopOrder(newStops, driverPosition));
  };

  const handleMoveUp = (index) => {
    if (index <= 1) return;
    const copy = [...stops];
    [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]];
    updateStops(copy);
  };

  const handleMoveDown = (index) => {
    if (index === 0 || index === stops.length - 1) return;
    const copy = [...stops];
    [copy[index], copy[index + 1]] = [copy[index + 1], copy[index]];
    updateStops(copy);
  };

  const handleDelete = (index) => {
    if (index === 0) return;
    const newStops = stops.filter((_, i) => i !== index);
    updateStops(newStops.length > 1 ? newStops : [newStops[0], createBlankStop('A')]);
  };

  const handleTextChange = (index, newText) => {
    setStops(prev => normalizeStopOrder(prev.map((s, i) => i === index ? { ...s, label: newText, source: s.source || 'manual' } : s), driverPosition));
  };

  const handleAddStop = () => {
    setStops(prev => normalizeStopOrder([...prev, createBlankStop(String.fromCharCode(64 + prev.length))], driverPosition));
  };

  const handleUseCurrentLocation = async () => {
    setGettingLocation(true);
    setRouteError('');
    const address = await getCurrentAddress();
    setGettingLocation(false);
    if (!address) {
      setRouteError('Unable to read current location. Enter a starting point manually.');
      return;
    }
    setStops(prev => normalizeStopOrder(prev.map((stop, index) => index === 0 ? { ...stop, label: address, source: 'gps' } : s => s), driverPosition));
    setRouteNotice('Starting point updated from current location.');
  };

  const handleDragStart = (index) => {
    if (index === 0) return;
    dragItem.current = index;
  };

  const handleDragEnter = (index) => {
    if (index === 0) return;
    dragOverItem.current = index;
  };

  const handleDragEnd = () => {
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      const copy = [...stops];
      const dragged = copy.splice(dragItem.current, 1)[0];
      copy.splice(dragOverItem.current, 0, dragged);
      updateStops(copy);
    }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const routeValidation = useMemo(() => {
    const origin = stops[0] || {};
    const routeStops = stops.slice(1).filter(stop => cleanRouteAddress(stop.label));
    const labels = [origin, ...routeStops].map(stop => cleanRouteAddress(stop.label)).filter(Boolean);
    const errors = [];
    const warnings = [];
    const duplicateAddresses = [];
    const seen = new Set();
    routeStops.forEach((stop) => {
      const key = cleanRouteAddress(stop.label).toLowerCase();
      if (!key) return;
      if (seen.has(key) && !duplicateAddresses.includes(stop.label)) duplicateAddresses.push(stop.label);
      seen.add(key);
    });

    if (!cleanRouteAddress(origin.label)) errors.push('Add a starting point before navigating the full route.');
    if (routeStops.length === 0) errors.push('Add at least one destination stop.');
    if (duplicateAddresses.length > 0) warnings.push(`${duplicateAddresses.length} duplicate address${duplicateAddresses.length > 1 ? 'es' : ''} found.`);

    const tripGroups = new Map();
    routeStops.forEach((stop) => {
      if (!stop.tripId) return;
      if (!tripGroups.has(stop.tripId)) tripGroups.set(stop.tripId, { pu: false, do: false, name: stop.clientName || stop.tripId });
      const group = tripGroups.get(stop.tripId);
      if (stop.stopType === 'PU') group.pu = true;
      if (stop.stopType === 'DO') group.do = true;
      if (stop.clientName) group.name = stop.clientName;
    });
    const incompleteTrips = [...tripGroups.values()].filter(group => !group.pu || !group.do);
    if (incompleteTrips.length > 0) {
      warnings.push(`${incompleteTrips.length} trip${incompleteTrips.length > 1 ? 's are' : ' is'} missing a pickup or dropoff stop.`);
    }

    return {
      ready: errors.length === 0,
      labels,
      origin,
      routeStops,
      errors,
      warnings,
      duplicateAddresses,
      tripCount: tripGroups.size,
      pickupCount: routeStops.filter(stop => stop.stopType === 'PU').length,
      dropoffCount: routeStops.filter(stop => stop.stopType === 'DO').length,
    };
  }, [stops]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(stops));
      localStorage.setItem(`${storageKey}:expanded`, expanded ? '1' : '0');
    } catch {}
  }, [storageKey, stops, expanded]);

  useEffect(() => {
    if (!routePlanStops || routePlanStops.length === 0) return;
    const imported = routePlanStops.map(normalizeImportedStop).filter(stop => cleanRouteAddress(stop.label));
    if (imported.length === 0) {
      setRouteError('No usable addresses were found in the selected trips.');
      if (onSetRoutePlanStops) onSetRoutePlanStops(null);
      return;
    }

    setStops(prev => {
      const base = normalizeStopOrder(prev, driverPosition);
      const keep = base.filter((stop, index) => index === 0 || cleanRouteAddress(stop.label));
      const signatures = new Set(keep.slice(1).map(stopSignature));
      const additions = imported.filter((stop) => {
        const key = stopSignature(stop);
        if (signatures.has(key)) return false;
        signatures.add(key);
        return true;
      });
      return normalizeStopOrder([...keep, ...additions], driverPosition);
    });
    setExpanded(true);
    setRouteError('');
    setRouteNotice(`${imported.length} stop${imported.length !== 1 ? 's' : ''} added from selected trips.`);
    if (onSetRoutePlanStops) onSetRoutePlanStops(null);
  }, [routePlanStops, driverPosition, onSetRoutePlanStops]);

  useEffect(() => {
    if (!expanded) return;
    const calculateTripTime = async () => {
      if (!routeValidation.ready || routeValidation.labels.length < 2) {
        setRouteSummary({ duration: '0 min', distance: '--', legs: [] });
        return;
      }
      const labels = routeValidation.labels;
      setIsCalculating(true);
      const origin = labels[0];
      const destination = labels[labels.length - 1];
      const waypoints = labels.slice(1, -1);

      try {
        await loadGoogleMapsScript();
        const directionsService = new window.google.maps.DirectionsService();
        const formattedWaypoints = waypoints.map(wp => ({ location: wp, stopover: true }));
        const summary = await new Promise((resolve, reject) => {
          directionsService.route({
            origin, destination, waypoints: formattedWaypoints,
            travelMode: window.google.maps.TravelMode.DRIVING
          }, (response, status) => {
            if (status === 'OK' && response.routes?.[0]) {
              let seconds = 0;
              let meters = 0;
              const legs = response.routes[0].legs.map((leg) => {
                seconds += leg.duration?.value || 0;
                meters += leg.distance?.value || 0;
                return {
                  duration: leg.duration?.text || '',
                  distance: leg.distance?.text || '',
                };
              });
              const mins = Math.round(seconds / 60);
              const duration = mins >= 60 ? `${Math.floor(mins / 60)} hr ${mins % 60} min` : `${mins} min`;
              const miles = meters / 1609.344;
              resolve({ duration, distance: miles > 0 ? `${miles.toFixed(1)} mi` : '--', legs });
            } else {
              reject(new Error(status));
            }
          });
        });
        setRouteSummary(summary);
      } catch {
        setRouteSummary({ duration: 'Unavailable', distance: '--', legs: [] });
      }
      setIsCalculating(false);
    };
    calculateTripTime();
  }, [expanded, routeValidation.ready, routeValidation.labels, loadGoogleMapsScript]);

  const handleCopyRoute = () => {
    const lines = stops.map((stop, i) => {
      const prefix = i === 0 ? 'START' : `${i}.`;
      const tag = stop.stopType ? ` [${stop.stopType}]` : '';
      return `${prefix} ${stop.label}${tag}`;
    });
    navigator.clipboard?.writeText(lines.join('\n'));
    setCopiedRoute(true);
    setTimeout(() => setCopiedRoute(false), 1500);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50/50 transition cursor-pointer">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center">
            <Route size={17} className="text-indigo-600" />
          </div>
          <div className="text-left">
            <h3 className="text-[13px] font-extrabold text-slate-900 tracking-tight">Route Plan</h3>
            <p className="text-[11px] font-semibold text-slate-400">{stops.length - 1} stop{stops.length - 1 !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-4 space-y-3">
          {/* Summary bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5">
              <Clock size={11} className="text-slate-400" />
              <span className="text-[11px] font-bold text-slate-600">{isCalculating ? '...' : routeSummary.duration}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5">
              <Navigation size={11} className="text-slate-400" />
              <span className="text-[11px] font-bold text-slate-600">{routeSummary.distance}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5">
              <MapPin size={11} className="text-slate-400" />
              <span className="text-[11px] font-bold text-slate-600">{routeValidation.pickupCount}PU / {routeValidation.dropoffCount}DO</span>
            </div>
          </div>

          {/* Errors */}
          {routeError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-[11px] font-semibold text-rose-600">{routeError}</div>
          )}

          {/* Notices */}
          {routeNotice && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-[11px] font-semibold text-emerald-600">{routeNotice}</div>
          )}

          {/* Stops list */}
          <div className="space-y-2">
            {stops.map((stop, index) => (
              <div key={stop.id} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[9px] font-extrabold ${
                  index === 0 ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
                }`}>
                  {index === 0 ? 'ORG' : stop.letter}
                </div>
                <input
                  type="text"
                  value={stop.label}
                  onChange={(e) => handleTextChange(index, e.target.value)}
                  placeholder={index === 0 ? 'Starting point...' : `Stop ${stop.letter}...`}
                  className="flex-1 h-9 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[12px] font-semibold text-slate-700 placeholder-slate-300 focus:outline-none focus:border-indigo-400 min-w-0"
                />
                {index > 0 && (
                  <div className="flex gap-0.5 shrink-0">
                    <button onClick={() => handleMoveUp(index)} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer">▲</button>
                    <button onClick={() => handleMoveDown(index)} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer">▼</button>
                    <button onClick={() => handleDelete(index)} className="w-7 h-7 flex items-center justify-center text-rose-400 hover:text-rose-600 cursor-pointer">✕</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={handleAddStop}
              className="flex-1 h-9 bg-slate-50 text-slate-600 rounded-xl text-[11px] font-extrabold border border-slate-200 active:bg-slate-100 transition cursor-pointer">
              + Add Stop
            </button>
            <button onClick={handleUseCurrentLocation} disabled={gettingLocation}
              className="flex-1 h-9 bg-indigo-50 text-indigo-700 rounded-xl text-[11px] font-extrabold border border-indigo-100 active:bg-indigo-100 transition cursor-pointer">
              {gettingLocation ? 'Locating...' : '📍 Current Location'}
            </button>
          </div>

          {/* Navigation buttons */}
          {routeValidation.ready && (
            <div className="flex gap-2">
              <button onClick={handleCopyRoute}
                className="flex-1 h-9 bg-slate-50 text-slate-600 rounded-xl text-[11px] font-extrabold border border-slate-200 flex items-center justify-center gap-1 active:bg-slate-100 transition cursor-pointer">
                {copiedRoute ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                {copiedRoute ? 'Copied!' : 'Copy'}
              </button>
              <button onClick={() => {
                if (onSendToSequencer) {
                  const seqStops = stops.slice(1).map((stop, i) => ({
                    address: stop.label,
                    clientName: stop.clientName || `Stop ${stop.letter}`,
                    stopType: stop.stopType || '',
                    time: stop.stopTime || '',
                    tripId: stop.tripId || null,
                    bookingId: stop.bookingId || '',
                  }));
                  onSendToSequencer(seqStops, stops[0]?.label || '');
                } else if (onOpenSequencer) {
                  onOpenSequencer();
                }
              }}
                className="flex-1 h-9 bg-indigo-600 text-white rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1 active:bg-indigo-700 transition shadow-md shadow-indigo-200 cursor-pointer">
                <Navigation size={11} /> Open in Sequencer
              </button>
            </div>
          )}

          {/* Warnings */}
          {routeValidation.warnings.length > 0 && (
            <div className="space-y-1">
              {routeValidation.warnings.map((w, i) => (
                <p key={i} className="text-[10px] font-semibold text-amber-600 bg-amber-50 rounded-lg px-2.5 py-1.5">{w}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const DriverToolsPage = ({
  trips = [],
  activeTrips = [],
  aiOptimizing = false,
  guidedMode = false,
  guidedStepIndex = 0,
  guidedSteps = [],
  driverPosition,
  appSettings,
  currentUser,
  role,
  onSetGuidedMode,
  onSetGuidedStepIndex,
  onRunAiOptimization,
  onSelectAllTrips,
  selectedTrips = [],
  onSetSelectedTrips,
  etas = {},
  onOpenInNav,
  onOpenSequencer,
  requestAuthAction = () => {},
  routePlanStops = null,
  onSetRoutePlanStops = null,
  onSendToSequencer = null
}) => {
  const [expandedSection, setExpandedSection] = useState('etas');

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-28 px-3 pt-2 space-y-3" style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)' }}>

      {/* Route Plan */}
      <RoutePlanSection
        routePlanStops={routePlanStops}
        onSetRoutePlanStops={onSetRoutePlanStops}
        appSettings={appSettings}
        onSendToSequencer={onSendToSequencer}
        onOpenSequencer={onOpenSequencer}
        currentUser={currentUser}
        driverPosition={driverPosition}
      />

      {/* Trip ETAs */}
      {activeTrips.length > 0 && Object.keys(etas).length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <button onClick={() => toggleSection('etas')}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50/50 transition cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center">
                <Clock size={16} className="text-amber-600" />
              </div>
              <span className="text-[13px] font-extrabold text-slate-900 tracking-tight">Trip ETAs</span>
            </div>
            <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${expandedSection === 'etas' ? 'rotate-180' : ''}`} />
          </button>
          {expandedSection === 'etas' && (
            <div className="border-t border-slate-100 divide-y divide-slate-100/50">
              {activeTrips.map(trip => {
                const eta = etas[trip.id];
                if (eta === undefined) return null;
                return (
                  <div key={trip.id} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-bold text-slate-700">{trip.patient}</span>
                      {trip.bookingId && (
                        <span className="mt-1 inline-flex rounded-lg border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold text-blue-700">
                          {trip.bookingId}
                        </span>
                      )}
                    </div>
                    <span className="text-[12px] font-extrabold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg shrink-0 ml-2">{formatDuration(eta)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="h-2" />
    </div>
  );
};

export default DriverToolsPage;
