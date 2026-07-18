import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  BrainCircuit, Play, ChevronRight, X, Navigation, Map as MapIcon,
  Route, Repeat, AlertTriangle, Zap, ChevronDown, ChevronUp,
  Timer, Copy, CheckSquare, Trash2, ArrowUp, ArrowDown
} from 'lucide-react';
import { impact } from '../utils/haptics';
import { openMapLink } from '../utils/nativeActions';
import { GOOGLE_MAPS_API_KEY } from '../config/firebase';
import { loadGoogleMapsApi } from '../hooks/useGoogleMaps';
import PlacesAutocompleteInput from './PlacesAutocompleteInput';

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
    .filter((_, index) => index !== originIndex)
    .filter((stop) => stop.id !== 'origin' && stop.type !== 'origin')
    .map((stop, index) => ({
      ...createBlankStop(String.fromCharCode(65 + index)),
      ...stop,
      type: 'stop',
      letter: String.fromCharCode(65 + index),
    }));

  return [origin, ...rest];
};

const normalizeImportedStop = (item, index) => {
  const source = typeof item === 'string' ? { address: item } : (item || {});
  const address = cleanRouteAddress(source.address || source.label || source.pickup || source.dropoff || '');
  return {
    id: source.id || `${source.tripId || 'manual'}-${source.stopType || 'stop'}-${Date.now()}-${index}`,
    type: 'stop',
    letter: '',
    label: address,
    clientName: source.clientName || source.patient || source.name || '',
    stopTime: source.time || source.stopTime || '',
    stopType: source.stopType || source.type || '',
    tripId: source.tripId || null,
    bookingId: source.bookingId || '',
    serviceType: source.serviceType || source.req || '',
    source: source.source || (source.tripId ? 'trip' : 'manual'),
  };
};

const readSavedRoutePlan = (storageKey, driverPosition) => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (Array.isArray(saved) && saved.length > 0) {
      return normalizeStopOrder(saved, driverPosition);
    }
  } catch {}
  return normalizeStopOrder([createBlankStop('A')], driverPosition);
};

const copyRouteText = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textArea = document.createElement('textarea');
  textArea.value = text;
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
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
    setStops(prev => normalizeStopOrder(prev.map((stop, index) => index === 0 ? { ...stop, label: address, source: 'gps' } : stop), driverPosition));
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
  }, [routePlanStops, onSetRoutePlanStops, driverPosition]);

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
        await loadGoogleMapsApi();
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
        try {
          const geminiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
          if (!geminiKey) { setRouteSummary({ duration: 'Unavailable', distance: '--', legs: [] }); return; }
          const prompt = `Calculate driving time from "${origin}" to "${destination}"${waypoints.length ? ` with stops at "${waypoints.join(', ')}"` : ''}. Reply only with the time like '45 min'.`;
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
          });
          if (!res.ok) throw new Error();
          const data = await res.json();
          setRouteSummary({ duration: data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Unavailable', distance: '--', legs: [] });
        } catch {
          setRouteSummary({ duration: 'Unavailable', distance: '--', legs: [] });
        }
      } finally {
        setIsCalculating(false);
      }
    };
    const id = setTimeout(calculateTripTime, 900);
    return () => clearTimeout(id);
  }, [routeValidation, expanded]);

  const handleSmartSort = () => {
    const sorted = [...stops.slice(1)]
      .filter(stop => cleanRouteAddress(stop.label))
      .sort((a, b) => {
        const timeDiff = timeToMinutes(a.stopTime) - timeToMinutes(b.stopTime);
        if (timeDiff !== 0) return timeDiff;
        const tripDiff = String(a.tripId || '').localeCompare(String(b.tripId || ''));
        if (tripDiff !== 0) return tripDiff;
        return stopTypeRank(a.stopType) - stopTypeRank(b.stopType);
      });
    updateStops([stops[0], ...sorted]);
    setRouteNotice('Stops sorted by scheduled time with pickup before dropoff.');
  };

  const handleReverseStops = () => {
    const usable = stops.slice(1).filter(stop => cleanRouteAddress(stop.label));
    updateStops([stops[0], ...usable.reverse()]);
    setRouteNotice('Stop order reversed.');
  };

  const handleRemoveDuplicates = () => {
    const seen = new Set();
    const filtered = [stops[0], ...stops.slice(1).filter((stop) => {
      const key = stopSignature(stop);
      if (!cleanRouteAddress(stop.label)) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })];
    updateStops(filtered.length > 1 ? filtered : [stops[0], createBlankStop('A')]);
    setRouteNotice('Duplicate and blank stops removed.');
  };

  const handleClearPlan = () => {
    updateStops([stops[0], createBlankStop('A')]);
    setRouteSummary({ duration: '0 min', distance: '--', legs: [] });
    setRouteError('');
    setRouteNotice('Route Plan cleared.');
  };

  const handleCopyPlan = async () => {
    const lines = stops
      .filter(stop => cleanRouteAddress(stop.label))
      .map((stop, index) => `${index + 1}. ${stop.type === 'origin' ? 'Start' : (stop.stopType || stop.letter)} - ${cleanRouteAddress(stop.label)}${stop.clientName ? ` (${stop.clientName})` : ''}`);
    if (lines.length === 0) return;
    await copyRouteText(lines.join('\n'));
    setRouteNotice('Route copied to clipboard.');
  };

  const openFullRoute = () => {
    if (!routeValidation.ready || routeValidation.labels.length < 2) {
      setRouteError(routeValidation.errors[0] || 'Add a starting point and destination first.');
      return;
    }

    const labels = routeValidation.labels;
    const navApp = appSettings?.routePlanNavApp || appSettings?.navigationApp || 'google';
    const origin = labels[0];
    const destination = labels[labels.length - 1];
    const waypoints = labels.slice(1, -1);

    if (navApp === 'waze' && labels.length === 2) {
      const encodedDest = encodeURIComponent(destination);
      const wazeWeb = `https://www.waze.com/ul?q=${encodedDest}&navigate=yes`;
      const primary = `intent://waze.com/ul?q=${encodedDest}&navigate=yes#Intent;scheme=https;package=com.waze;S.browser_fallback_url=${encodeURIComponent(wazeWeb)};end;`;
      openMapLink(primary, wazeWeb);
      return;
    }
    if (navApp === 'apple' && labels.length === 2) {
      const appleUrl = `http://maps.apple.com/?saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(destination)}&dirflg=d`;
      openMapLink(appleUrl, appleUrl);
      return;
    }

    if (navApp !== 'google' && labels.length > 2) {
      setRouteNotice('Opening Google Maps for the full multi-stop route because it supports all stops in one link.');
    }
    const originEnc = encodeURIComponent(origin);
    const destEnc = encodeURIComponent(destination);
    const wps = waypoints.map(w => encodeURIComponent(w)).join('|');
    const googleWeb = `https://www.google.com/maps/dir/?api=1&origin=${originEnc}&destination=${destEnc}${wps ? `&waypoints=${wps}` : ''}&travelmode=driving`;
    const googleIntent = `intent://maps.google.com/maps/dir/?api=1&origin=${originEnc}&destination=${destEnc}${wps ? `&waypoints=${wps}` : ''}&travelmode=driving#Intent;scheme=https;package=com.google.android.apps.maps;S.browser_fallback_url=${encodeURIComponent(googleWeb)};end;`;
    openMapLink(googleIntent, googleWeb);
  };

  const sendToSequencer = () => {
    const openSequencerFallback = () => {
      if (typeof onOpenSequencer === 'function') {
        onOpenSequencer();
        return true;
      }
      return false;
    };

    if (typeof onSendToSequencer !== 'function') {
      if (openSequencerFallback()) {
        setRouteNotice('Route Plan opened.');
        return;
      }
      setRouteError('Route Plan is not available from this screen.');
      return;
    }

    const sequencerOrigin = routeValidation.origin?.label ? cleanRouteAddress(routeValidation.origin.label) : '';
    const sequencerStops = stops.slice(1).map((stop, index) => ({
      address: cleanRouteAddress(stop?.label || ''),
      clientName: stop?.clientName || '',
      time: stop?.stopTime || '',
      stopType: stop?.stopType || '',
      tripId: stop?.tripId || null,
      bookingId: stop?.bookingId || '',
      serviceType: stop?.serviceType || '',
      sequenceIndex: index + 1,
      source: stop?.source || 'route-plan',
    })).filter(stop => stop.address);

    if (sequencerStops.length === 0) {
      if (openSequencerFallback()) {
        setRouteNotice('Route Plan opened. Add stops in Tools or return to Route Plan.');
        return;
      }
      setRouteError('Add at least one stop before opening Route Plan.');
      return;
    }
    setRouteError('');
    onSendToSequencer(sequencerStops, sequencerOrigin || null);
    setRouteNotice(`${sequencerStops.length} route stop${sequencerStops.length !== 1 ? 's' : ''} sent to Route Plan.`);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
            <MapIcon size={17} />
          </div>
          <div className="text-left min-w-0">
            <span className="block text-sm font-semibold text-slate-900">Route Plan</span>
            <span className="block text-xs font-semibold text-slate-400 truncate">
              {routeValidation.routeStops.length} stops / {routeValidation.tripCount} trips / {isCalculating ? 'calculating' : routeSummary.duration}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`hidden sm:inline-flex px-2 py-1 rounded-lg text-xs font-bold border ${routeValidation.ready ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
            {routeValidation.ready ? 'Ready' : 'Needs info'}
          </span>
          {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-slate-100 px-3 py-3">
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[
              ['Stops', routeValidation.routeStops.length],
              ['Trips', routeValidation.tripCount],
              ['Time', isCalculating ? '...' : routeSummary.duration],
              ['Miles', routeSummary.distance],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                <div className="text-xs font-semibold text-slate-900 truncate">{value}</div>
              </div>
            ))}
          </div>

          {(routeError || routeNotice || routeValidation.errors.length > 0 || routeValidation.warnings.length > 0) && (
            <div className="space-y-1.5 mb-3">
              {(routeError || routeValidation.errors[0]) && (
                <div className="rounded-xl bg-rose-50 border border-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 flex items-start gap-2">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {routeError || routeValidation.errors[0]}
                </div>
              )}
              {!routeError && routeValidation.warnings[0] && (
                <div className="rounded-xl bg-orange-50 border border-orange-100 px-3 py-2 text-xs font-semibold text-orange-700 flex items-start gap-2">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {routeValidation.warnings[0]}
                </div>
              )}
              {routeNotice && (
                <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2 text-xs font-semibold text-blue-700 flex items-start gap-2">
                  <CheckSquare size={13} className="mt-0.5 shrink-0" /> {routeNotice}
                </div>
              )}
            </div>
          )}

          <div className="w-full font-sans space-y-1.5">
            {stops.map((stop, index) => (
              <React.Fragment key={stop.id}>
                <div
                  className={`flex items-center w-full rounded-xl border bg-white px-2 py-2 shadow-sm transition ${index === 0 ? 'border-blue-100' : 'border-slate-100 hover:border-slate-200'}`}
                  draggable={index > 0}
                  onDragStart={() => handleDragStart(index)}
                  onDragEnter={() => handleDragEnter(index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <div className="flex items-center w-[58px] shrink-0 pr-2">
                    <div className="w-8 flex justify-center">
                      {index > 0 && (
                        <div className="flex flex-col gap-0.5 text-slate-400">
                          <button onClick={() => handleMoveUp(index)} className="cursor-pointer hover:bg-slate-100 rounded p-0.5 transition-colors disabled:opacity-30" disabled={index <= 1}>
                            <ArrowUp size={14} className="text-slate-500" />
                          </button>
                          <button onClick={() => handleMoveDown(index)} className="cursor-pointer hover:bg-slate-100 rounded p-0.5 transition-colors disabled:opacity-30" disabled={index === stops.length - 1}>
                            <ArrowDown size={14} className="text-slate-500" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="w-6 flex justify-center items-center">
                      {stop.type === 'origin' ? (
                        <div className="w-[22px] h-[22px] border border-blue-200 rounded-full bg-blue-50 flex items-center justify-center">
                          <span className="text-xs font-semibold text-blue-700 leading-none">O</span>
                        </div>
                      ) : (
                        <div className="w-[22px] h-[22px] border border-slate-300 rounded-full bg-white flex items-center justify-center">
                          <span className="text-xs font-semibold text-slate-800 leading-none">{stop.letter}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    {(stop.clientName || stop.stopTime || stop.stopType) && (
                      <div className="flex items-center gap-1 mb-0.5 min-w-0">
                        {stop.stopType && stop.stopType !== 'ORIGIN' && (
                          <span className={`text-[7px] font-semibold px-1 py-[0px] rounded ${stop.stopType === 'PU' ? 'bg-blue-100 text-blue-700' : stop.stopType === 'DO' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                            {stop.stopType}
                          </span>
                        )}
                        {stop.clientName && <span className="text-[7px] font-semibold text-slate-800 truncate">{stop.clientName}</span>}
                        {stop.stopTime && <span className="text-[7px] font-semibold text-slate-400">{to12hr(stop.stopTime)}</span>}
                      </div>
                    )}
                    <PlacesAutocompleteInput
                      value={stop.label}
                      onChange={(v) => handleTextChange(index, v)}
                      placeholder={index === 0 ? 'Starting point or current location' : `Stop ${stop.letter} address`}
                      className="text-[7px] font-normal text-slate-400 placeholder:text-slate-300 truncate bg-transparent outline-none w-full"
                    />
                  </div>
                  <div className="w-8 flex justify-end shrink-0 pl-2">
                    {index > 0 && <button onClick={() => handleDelete(index)} className="cursor-pointer hover:bg-rose-50 p-1 rounded-full transition-colors">
                      <Trash2 size={14} className="text-slate-400" />
                    </button>}
                  </div>
                </div>
              </React.Fragment>
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={handleAddStop}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl active:scale-95 transition hover:bg-emerald-100"
              >
                <span className="text-base leading-none">+</span> Add stop
              </button>
              <button
                onClick={handleUseCurrentLocation}
                disabled={gettingLocation}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-100 rounded-xl active:scale-95 transition hover:bg-blue-100 disabled:opacity-50"
              >
                <Navigation size={13} /> {gettingLocation ? 'Getting...' : 'Use GPS'}
              </button>
              <button
                onClick={handleSmartSort}
                disabled={routeValidation.routeStops.length < 2}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl active:scale-95 transition hover:bg-indigo-100 disabled:opacity-40"
              >
                <Zap size={13} /> Smart sort
              </button>
              <button onClick={handleReverseStops} disabled={routeValidation.routeStops.length < 2} className="flex-shrink-0 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40">
                Reverse
              </button>
              <button onClick={handleRemoveDuplicates} className="flex-shrink-0 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">
                Clean
              </button>
              <button onClick={handleCopyPlan} className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">
                <Copy size={13} /> Copy
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <button
                onClick={openFullRoute}
                disabled={!routeValidation.ready}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold text-white bg-slate-900 rounded-xl active:scale-95 transition hover:bg-slate-800 shadow-sm disabled:opacity-40"
              >
                <Navigation size={14} /> Navigate All
              </button>
              <button
                type="button"
                onClick={sendToSequencer}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold text-white bg-blue-600 rounded-xl active:scale-95 transition hover:bg-blue-700 shadow-sm"
              >
                <Route size={14} /> Send {routeValidation.routeStops.length} to Plan
              </button>
            </div>
            <div className="flex justify-between items-center mt-3 px-1">
              <div className="text-xs text-slate-500 font-semibold">
                {routeValidation.pickupCount} pickups / {routeValidation.dropoffCount} dropoffs
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleClearPlan} className="text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors flex items-center gap-1">
                  <Trash2 size={13} /> Clear
                </button>
                <button onClick={() => setExpanded(false)} className="text-emerald-600 font-semibold text-xs hover:text-emerald-700 transition-colors">
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DriverToolsPage = ({
  trips, activeTrips, aiSequence, aiSuggestions, aiRideShare, conflicts,
  aiOptimizing, guidedMode, guidedStepIndex, guidedSteps,
  driverPosition, appSettings, currentUser, role,
  onSetGuidedMode, onSetGuidedStepIndex, onSetAiSequence, onSetAiSuggestions,
  onRunAiOptimization, onSelectAllTrips, selectedTrips, onSetSelectedTrips, etas = {},
  onOpenInNav,
  onOpenSequencer,
  requestAuthAction = () => {},
  routePlanStops = null,
  onSetRoutePlanStops = null,
  onSendToSequencer = null
}) => {
  const [expandedSection, setExpandedSection] = useState('route');

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain pb-[calc(7rem+env(safe-area-inset-bottom,0px))] px-3 pt-2 space-y-2">
      {/* Guided Mode Progress Header */}
      {guidedMode && aiSequence && aiSequence.length > 0 && guidedStepIndex < aiSequence.length && (() => {
        const currentTripId = aiSequence[guidedStepIndex];
        const currentTrip = trips.find(t => t.id === currentTripId);
        const nextTripId = guidedStepIndex + 1 < aiSequence.length ? aiSequence[guidedStepIndex + 1] : null;
        const nextTrip = nextTripId ? trips.find(t => t.id === nextTripId) : null;
        const pct = Math.round((guidedStepIndex / aiSequence.length) * 100);
        return (
          <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-xl p-3 shadow-md shadow-indigo-200/40 sticky top-0 z-10">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 bg-white/20 rounded-lg flex items-center justify-center text-xs font-bold text-white">{guidedStepIndex + 1}</span>
                <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">of {aiSequence.length}</span>
              </div>
              <button onClick={() => { onSetGuidedMode(false); }} className="text-xs text-white/60 font-semibold uppercase hover:text-white/90">Exit</button>
            </div>
            <div className="h-1 bg-white/20 rounded-full overflow-hidden mb-1.5">
              <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-white truncate flex-1 min-w-0">
                {currentTrip?.patient || 'Loading...'}
                <span className="text-white/60 font-medium ml-1 text-xs">· {currentTrip ? (['Assigned','Unassigned'].includes(currentTrip.status) ? 'Not started' : currentTrip.status) : ''}</span>
              </p>
              {nextTrip && (
                <span className="text-xs text-white/50 font-medium ml-2 shrink-0">Next: {nextTrip.patient}</span>
              )}
            </div>
          </div>
        );
      })()}

      {/* Conflict Warning */}
      {conflicts.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-rose-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-rose-800">{conflicts.length} time conflict{conflicts.length > 1 ? 's' : ''}</p>
              <div className="mt-1 space-y-0.5">
                {conflicts.slice(0, 5).map((c, i) => {
                  const tA = c.timeA || '';
                  const tB = c.timeB || '';
                  const gap = c.gap || Math.abs(timeToMinutes(tA) - timeToMinutes(tB));
                  return (
                    <p key={i} className="text-xs text-rose-600 truncate">{c.aName || c.patientA || ''} ↔ {c.bName || c.patientB || ''} ({gap} min gap)</p>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ride-Share Alerts */}
      {aiRideShare.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          <div className="flex items-start gap-2">
            <Repeat size={14} className="text-emerald-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-emerald-800">{aiRideShare.length} shared ride{aiRideShare.length > 1 ? 's' : ''}</p>
              <div className="mt-1 space-y-0.5">
                {aiRideShare.slice(0, 3).map((r, i) => (
                  <p key={i} className="text-xs text-emerald-600 truncate">{r.tripA?.patient || r.patientA || ''} + {r.tripB?.patient || r.patientB || ''}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Optimize Button */}
      {selectedTrips.length >= 1 && (
        <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-3 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-blue-700">{selectedTrips.length} selected</span>
          <div className="flex gap-2">
            <button onClick={() => onSelectAllTrips()} className="px-3 h-8 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition border border-blue-100 hover:bg-blue-100">
              <CheckSquare size={12} /> {selectedTrips.length === activeTrips.length ? 'Deselect All' : 'Select All'}
            </button>
            {selectedTrips.length >= 2 && (
              <button onClick={() => onRunAiOptimization()} disabled={aiOptimizing}
                className="px-3 h-8 bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition">
                <BrainCircuit size={12} /> {aiOptimizing ? 'Analyzing...' : 'AI Optimize'}
              </button>
            )}
            <button onClick={() => onSetSelectedTrips([])} className="px-3 h-8 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold active:scale-95 transition">Clear</button>
          </div>
        </div>
      )}

      {/* Advanced Tools Section */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden mb-2">
        <button
          onClick={onOpenSequencer}
          className="w-full flex items-center justify-between px-4 py-4 hover:bg-slate-50 transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Route size={16} className="text-indigo-600" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-slate-800">Route Plan</h3>
              <p className="text-xs font-semibold text-slate-400">Advanced planning engine & templates</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-slate-300" />
        </button>
      </div>

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

      {/* Smart Route Panel */}
      {aiSequence && aiSequence.length >= 2 && !guidedMode && (
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-xl p-[1.5px] shadow-lg shadow-indigo-200/50">
          <div className="bg-white rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <BrainCircuit size={16} className="text-indigo-600" />
              <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Smart Route</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              {aiSequence.map((id, i) => {
                const t = trips.find(t => t.id === id);
                return (
                  <React.Fragment key={id}>
                    {i > 0 && <ChevronRight size={11} className="text-slate-300 shrink-0" />}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${t && !['Assigned','Unassigned'].includes(t.status) ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                      {t?.patient || id}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
              <div className="flex gap-2">
              <button onClick={() => { onSetGuidedMode(true); onSetGuidedStepIndex(0); onSetAiSuggestions([]); }}
                className="flex-1 h-10 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 shadow-sm">
                <Play size={13} /> Start Smart Route
              </button>
              <button
                onClick={() => {
                  // Require password for drivers to dismiss an assigned sequence
                  if (role === 'driver' && requestAuthAction) {
                    requestAuthAction('dismiss_assigned_route', () => { onSetAiSequence(null); onSetAiSuggestions([]); });
                  } else {
                    onSetAiSequence(null); onSetAiSuggestions([]);
                  }
                }}
                className="h-10 px-3 bg-slate-100 text-slate-500 rounded-xl text-xs font-bold active:scale-95">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Suggestions (fallback) */}
      {aiSuggestions.length > 0 && (!aiSequence || aiSequence.length < 2) && (
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl p-3">
          <div className="flex items-start gap-2">
            <BrainCircuit size={14} className="text-indigo-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              {aiSuggestions.map((s, i) => (
                <p key={i} className="text-sm font-medium text-indigo-800 leading-relaxed">{s}</p>
              ))}
            </div>
            <button onClick={() => onSetAiSuggestions([])} className="text-indigo-400"><X size={14} /></button>
          </div>
        </div>
      )}

      {/* Route Quick Nav */}
      {activeTrips.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <button
            onClick={() => toggleSection('quicknav')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition"
          >
            <div className="flex items-center gap-2">
              <Navigation size={16} className="text-emerald-600" />
              <span className="text-sm font-semibold text-slate-800">Quick Navigation</span>
              <span className="text-xs text-slate-400 font-medium">({activeTrips.length})</span>
            </div>
            {expandedSection === 'quicknav' ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
          </button>
          {expandedSection === 'quicknav' && (
            <div className="border-t border-slate-100 divide-y divide-slate-100">
              {activeTrips.map(trip => (
                <div key={trip.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-slate-800">{trip.patient}</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {trip.bookingId && (
                          <span className="rounded-full border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
                            {trip.bookingId}
                          </span>
                        )}
                        {(trip.type || trip.serviceType) && (
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
                            {trip.type || trip.serviceType}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 font-medium">{to12hr(trip.time)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onOpenInNav(trip.pickup)}
                      className="flex-1 flex items-center justify-center gap-1.5 h-8 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold active:bg-emerald-100 transition"
                    >
                      <Navigation size={12} /> Pickup
                    </button>
                    <button
                      onClick={() => onOpenInNav(trip.dropoff)}
                      className="flex-1 flex items-center justify-center gap-1.5 h-8 bg-rose-50 text-rose-700 rounded-lg text-xs font-bold active:bg-rose-100 transition"
                    >
                      <Navigation size={12} /> Dropoff
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Trip ETAs */}
      {activeTrips.length > 0 && Object.keys(etas || {}).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <button
            onClick={() => toggleSection('etas')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition"
          >
            <div className="flex items-center gap-2">
              <Timer size={16} className="text-amber-600" />
              <span className="text-sm font-semibold text-slate-800">Trip ETAs</span>
            </div>
            {expandedSection === 'etas' ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
          </button>
          {expandedSection === 'etas' && (
            <div className="border-t border-slate-100 divide-y divide-slate-100">
              {activeTrips.map(trip => {
                const eta = etas[trip.id];
                if (eta === undefined) return null;
                return (
                  <div key={trip.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0">
                      <span className="block truncate text-xs font-medium text-slate-700">{trip.patient}</span>
                      {trip.bookingId && (
                        <span className="mt-1 inline-flex rounded-full border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
                          {trip.bookingId}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-slate-500">{formatDuration(eta)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DriverToolsPage;
