import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronDown, ChevronUp, Navigation, Route, MapPin, Clock,
  Copy, Check, Compass, Zap, Trash2, ArrowUp, ArrowDown,
  ExternalLink, RotateCcw, Sparkles, AlertTriangle, GripVertical
} from 'lucide-react';
import { GOOGLE_MAPS_API_KEY, GEMINI_API_CONFIG } from '../config/firebase';
import { geocodeAddress, getDistanceMiles } from '../config/maps';

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

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_CONFIG().apiKey}`;

async function callGemini(prompt) {
  try {
    const resp = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    let text = data?.candidates?.[0]?.parts?.[0]?.text || '';
    text = text.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
    return text;
  } catch { return null; }
}

const loadGoogleMapsScript = () => {
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
  const [stops, setStops] = useState(() => readSavedRoutePlan(storageKey, driverPosition));
  const [routeResult, setRouteResult] = useState(null);
  const [legs, setLegs] = useState([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [expanded, setExpanded] = useState(() => localStorage.getItem(`${storageKey}:expanded`) !== '0');
  const [gettingLocation, setGettingLocation] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [routeNotice, setRouteNotice] = useState('');
  const [copiedRoute, setCopiedRoute] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState(null);
  const inputRefs = useRef({});

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
    setStops(prev => prev.map((s, i) => i === index ? { ...s, label: newText, source: s.source || 'manual' } : s));
  };

  const handleAddStop = () => {
    setStops(prev => normalizeStopOrder([...prev, createBlankStop(String.fromCharCode(64 + prev.length))], driverPosition));
  };

  const handleClearAll = () => {
    setStops([createBlankStop('Origin'), createBlankStop('A')]);
    setRouteResult(null);
    setLegs([]);
    setOptimizationResult(null);
    setRouteError('');
    setRouteNotice('');
  };

  const handleUseCurrentLocation = async () => {
    setGettingLocation(true);
    setRouteError('');
    try {
      const pos = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) reject(new Error('No geolocation'));
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, enableHighAccuracy: true });
      });
      const { latitude, longitude } = pos.coords;
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY()}`
      );
      const data = await res.json();
      const address = data.results?.[0]?.formatted_address || `${latitude}, ${longitude}`;
      setStops(prev => {
        const copy = [...prev];
        copy[0] = { ...copy[0], label: address, source: 'gps' };
        return copy;
      });
      setRouteNotice('Current location set as starting point.');
    } catch {
      setRouteError('Unable to get current location. Enter manually.');
    }
    setGettingLocation(false);
  };

  const routeValidation = useMemo(() => {
    const origin = stops[0] || {};
    const routeStops = stops.slice(1).filter(stop => cleanRouteAddress(stop.label));
    const labels = [origin, ...routeStops].map(stop => cleanRouteAddress(stop.label)).filter(Boolean);
    const errors = [];
    const warnings = [];
    const seen = new Set();
    routeStops.forEach((stop) => {
      const key = cleanRouteAddress(stop.label).toLowerCase();
      if (!key) return;
      if (seen.has(key)) warnings.push(`Duplicate: ${stop.label}`);
      seen.add(key);
    });
    if (!cleanRouteAddress(origin.label)) errors.push('Add a starting point.');
    if (routeStops.length === 0) errors.push('Add at least one stop.');
    return {
      ready: errors.length === 0,
      labels,
      origin,
      routeStops,
      errors,
      warnings,
      pickupCount: routeStops.filter(s => s.stopType === 'PU').length,
      dropoffCount: routeStops.filter(s => s.stopType === 'DO').length,
    };
  }, [stops]);

  // Auto-calculate route via Google Maps Directions API
  useEffect(() => {
    if (!expanded || !routeValidation.ready || routeValidation.labels.length < 2) {
      setRouteResult(null);
      setLegs([]);
      return;
    }
    let cancelled = false;
    const calculate = async () => {
      setIsCalculating(true);
      try {
        await loadGoogleMapsScript();
        const labels = routeValidation.labels;
        const origin = labels[0];
        const destination = labels[labels.length - 1];
        const waypoints = labels.slice(1, -1).map(wp => ({ location: wp, stopover: true }));

        const result = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('TIMEOUT')), 15000);
          new window.google.maps.DirectionsService().route({
            origin, destination, waypoints,
            travelMode: window.google.maps.TravelMode.DRIVING,
          }, (response, status) => {
            clearTimeout(timer);
            if (status === 'OK' && response.routes?.[0]) resolve(response.routes[0]);
            else reject(new Error(status));
          });
        });

        if (cancelled) return;
        let totalSeconds = 0;
        let totalMeters = 0;
        const parsedLegs = result.legs.map((leg) => {
          totalSeconds += leg.duration?.value || 0;
          totalMeters += leg.distance?.value || 0;
          return {
            startAddress: leg.start_address,
            endAddress: leg.end_address,
            distance: leg.distance?.text || '--',
            distanceMeters: leg.distance?.value || 0,
            duration: leg.duration?.text || '--',
            durationSeconds: leg.duration?.value || 0,
          };
        });
        const totalMins = Math.round(totalSeconds / 60);
        const totalMiles = totalMeters / 1609.344;
        setRouteResult({
          totalDuration: formatDuration(totalMins),
          totalDistance: `${totalMiles.toFixed(1)} mi`,
          totalMins,
          totalMiles,
          summary: result.summary || '',
        });
        setLegs(parsedLegs);
        setRouteError('');
      } catch (err) {
        if (!cancelled) {
          const msg = err?.message === 'TIMEOUT'
            ? 'Route calculation timed out. Check your internet connection.'
            : 'Could not calculate route. Verify addresses are valid.';
          setRouteError(msg);
          setRouteResult(null);
          setLegs([]);
        }
      }
      if (!cancelled) setIsCalculating(false);
    };
    calculate();
    return () => { cancelled = true; };
  }, [expanded, routeValidation.ready, routeValidation.labels.join('|')]);

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(stops));
      localStorage.setItem(`${storageKey}:expanded`, expanded ? '1' : '0');
    } catch {}
  }, [storageKey, stops, expanded]);

  // Import from routePlanStops
  useEffect(() => {
    if (!routePlanStops || routePlanStops.length === 0) return;
    const imported = routePlanStops.map(normalizeImportedStop).filter(stop => cleanRouteAddress(stop.label));
    if (imported.length === 0) {
      setRouteError('No usable addresses found in selected trips.');
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
    setRouteNotice(`${imported.length} stop${imported.length !== 1 ? 's' : ''} imported from trips.`);
    if (onSetRoutePlanStops) onSetRoutePlanStops(null);
  }, [routePlanStops, driverPosition, onSetRoutePlanStops]);

  // AI Optimize via Gemini
  const handleAiOptimize = async () => {
    if (stops.length < 3 || isOptimizing) return;
    setIsOptimizing(true);
    setOptimizationResult(null);
    try {
      const stopData = stops.slice(1).map((s, i) => ({
        index: i + 1,
        label: s.label,
        clientName: s.clientName || `Stop ${s.letter}`,
        stopType: s.stopType || '',
        time: s.stopTime || '',
      }));
      const prompt = `You are a route optimization AI for an NEMT (Non-Emergency Medical Transportation) vehicle. Given a starting point and a list of stops, determine the optimal order to minimize total driving time while respecting pickup-before-dropoff constraints for the same client.

Starting Point: ${stops[0].label}

Stops:
${JSON.stringify(stopData, null, 2)}

Rules:
- Pickup (PU) must come before Dropoff (DO) for the same client
- Minimize total driving distance and time
- Consider logical geographic routing
- Respect time constraints if specified

Return a JSON object:
{
  "optimizedOrder": [1, 3, 2, 4] (array of original indices in new order),
  "reason": "Brief explanation of the optimization",
  "estimatedTimeSaved": "X minutes"
}
Return ONLY the JSON object. No markdown.`;

      const text = await callGemini(prompt);
      if (text) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed.optimizedOrder)) {
          const newStops = [stops[0], ...parsed.optimizedOrder.map(i => stops[i]).filter(Boolean)];
          const reordered = normalizeStopOrder(newStops, driverPosition);
          setStops(reordered);
          setOptimizationResult({
            reason: parsed.reason || 'Route optimized by AI',
            timeSaved: parsed.estimatedTimeSaved || '',
          });
          setRouteNotice('Route optimized by AI. Review the new order.');
        }
      }
    } catch (err) {
      setRouteError('AI optimization failed. Try again.');
    }
    setIsOptimizing(false);
  };

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

  const handleOpenInGoogleMaps = () => {
    const validStops = stops.filter(s => cleanRouteAddress(s.label));
    if (validStops.length < 2) return;
    const origin = encodeURIComponent(validStops[0].label);
    const destination = encodeURIComponent(validStops[validStops.length - 1].label);
    const waypoints = validStops.slice(1, -1).map(s => encodeURIComponent(s.label)).join('|');
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
    if (waypoints) url += `&waypoints=${waypoints}`;
    window.open(url, '_blank');
  };

  const handleSendToSequencer = () => {
    const seqStops = stops.slice(1).map((stop, i) => ({
      address: stop.label,
      clientName: stop.clientName || `Stop ${stop.letter}`,
      stopType: stop.stopType || '',
      time: stop.stopTime || '',
      tripId: stop.tripId || null,
      bookingId: stop.bookingId || '',
    }));
    if (onSendToSequencer) {
      onSendToSequencer(seqStops, stops[0]?.label || '');
    } else if (onOpenSequencer) {
      onOpenSequencer();
    }
  };

  const stopCount = stops.length - 1;

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200/80 shadow-sm">
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)}
        className="w-full cursor-pointer">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur">
                <Route size={18} className="text-white" />
              </div>
              <div className="text-left">
                <h3 className="text-[14px] font-extrabold text-white tracking-tight">Route Plan</h3>
                <p className="text-[11px] font-semibold text-white/60">
                  {isCalculating ? 'Calculating...' : stopCount > 0 ? `${stopCount} stop${stopCount !== 1 ? 's' : ''}` : 'Add stops to plan'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {routeResult && !isCalculating && (
                <div className="flex items-center gap-2 mr-2">
                  <span className="text-[10px] font-bold text-white/80 bg-white/15 px-2 py-1 rounded-lg">{routeResult.totalDistance}</span>
                  <span className="text-[10px] font-bold text-white/80 bg-white/15 px-2 py-1 rounded-lg">{routeResult.totalDuration}</span>
                </div>
              )}
              <ChevronDown size={18} className={`text-white/60 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="bg-white p-4 space-y-3">

          {/* Error / Notice */}
          {routeError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
              <AlertTriangle size={13} className="text-rose-500 shrink-0 mt-0.5" />
              <p className="text-[11px] font-semibold text-rose-600">{routeError}</p>
            </div>
          )}
          {routeNotice && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
              <Check size={13} className="text-emerald-500 shrink-0 mt-0.5" />
              <p className="text-[11px] font-semibold text-emerald-600">{routeNotice}</p>
            </div>
          )}

          {/* Optimization Result */}
          {optimizationResult && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
              <Sparkles size={13} className="text-indigo-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-indigo-700">{optimizationResult.reason}</p>
                {optimizationResult.timeSaved && (
                  <p className="text-[10px] font-bold text-indigo-500 mt-0.5">Est. saved: {optimizationResult.timeSaved}</p>
                )}
              </div>
            </div>
          )}

          {/* Stops List */}
          <div className="space-y-2">
            {stops.map((stop, index) => {
              const isOrigin = index === 0;
              const leg = legs[index - 1];
              return (
                <div key={stop.id}>
                  <div className="flex items-center gap-2">
                    {/* Stop indicator */}
                    <div className="relative shrink-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[9px] font-extrabold ${
                        isOrigin
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                          : stop.stopType === 'PU'
                            ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200'
                            : stop.stopType === 'DO'
                              ? 'bg-rose-500 text-white shadow-md shadow-rose-200'
                              : 'bg-slate-200 text-slate-600'
                      }`}>
                        {isOrigin ? <Compass size={13} /> : stop.letter}
                      </div>
                      {index < stops.length - 1 && (
                        <div className="absolute top-8 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-slate-200" />
                      )}
                    </div>

                    {/* Input */}
                    <div className="flex-1 min-w-0">
                      <input
                        ref={el => inputRefs.current[index] = el}
                        type="text"
                        value={stop.label}
                        onChange={(e) => handleTextChange(index, e.target.value)}
                        placeholder={isOrigin ? 'Starting point (GPS or address)...' : `Stop ${stop.letter}...`}
                        className={`w-full h-10 px-3 rounded-xl text-[12px] font-semibold border transition-all outline-none ${
                          isOrigin
                            ? 'bg-indigo-50/50 border-indigo-200 text-indigo-900 placeholder-indigo-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
                            : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
                        }`}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {isOrigin ? (
                        <button onClick={handleUseCurrentLocation} disabled={gettingLocation}
                          className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center active:bg-blue-100 transition cursor-pointer"
                          title="Use current location">
                          <Navigation size={14} className={gettingLocation ? 'animate-spin' : ''} />
                        </button>
                      ) : (
                        <>
                          <button onClick={() => handleMoveUp(index)}
                            className="w-7 h-7 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer">
                            <ArrowUp size={12} />
                          </button>
                          <button onClick={() => handleMoveDown(index)}
                            className="w-7 h-7 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer">
                            <ArrowDown size={12} />
                          </button>
                          <button onClick={() => handleDelete(index)}
                            className="w-7 h-7 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center transition cursor-pointer">
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Leg info */}
                  {leg && index < stops.length - 1 && (
                    <div className="ml-4 pl-4 border-l-2 border-dashed border-slate-100 py-1.5 flex items-center gap-3">
                      <span className="text-[10px] font-bold text-slate-400">{leg.distance}</span>
                      <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">{leg.duration}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Route Summary Bar */}
          {routeResult && !isCalculating && (
            <div className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl p-3 border border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Navigation size={12} className="text-blue-500" />
                    <span className="text-[12px] font-extrabold text-slate-800">{routeResult.totalDistance}</span>
                  </div>
                  <div className="w-px h-4 bg-slate-200" />
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} className="text-blue-500" />
                    <span className="text-[12px] font-extrabold text-slate-800">{routeResult.totalDuration}</span>
                  </div>
                </div>
                {routeResult.summary && (
                  <span className="text-[9px] font-bold text-slate-400 truncate ml-2 max-w-[120px]">{routeResult.summary}</span>
                )}
              </div>
            </div>
          )}

          {isCalculating && (
            <div className="flex items-center justify-center gap-2 py-3">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-[11px] font-bold text-slate-400">Calculating route...</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={handleAddStop}
              className="h-10 bg-slate-100 text-slate-700 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1.5 active:bg-slate-200 transition cursor-pointer">
              + Add Stop
            </button>
            <button onClick={handleUseCurrentLocation} disabled={gettingLocation}
              className="h-10 bg-blue-50 text-blue-700 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1.5 active:bg-blue-100 transition cursor-pointer">
              <Navigation size={12} className={gettingLocation ? 'animate-spin' : ''} />
              {gettingLocation ? 'Locating...' : 'My Location'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={handleAiOptimize} disabled={stops.length < 3 || isOptimizing}
              className="h-10 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1.5 active:scale-[0.98] transition shadow-md shadow-purple-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
              <Sparkles size={12} />
              {isOptimizing ? 'Optimizing...' : 'AI Optimize'}
            </button>
            <button onClick={handleClearAll}
              className="h-10 bg-slate-100 text-slate-500 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1.5 active:bg-slate-200 transition cursor-pointer">
              <RotateCcw size={12} /> Clear All
            </button>
          </div>

          {routeValidation.ready && (
            <div className="grid grid-cols-3 gap-2">
              <button onClick={handleCopyRoute}
                className="h-10 bg-slate-100 text-slate-700 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1 active:bg-slate-200 transition cursor-pointer">
                {copiedRoute ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                {copiedRoute ? 'Copied' : 'Copy'}
              </button>
              <button onClick={handleOpenInGoogleMaps}
                className="h-10 bg-emerald-50 text-emerald-700 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1 active:bg-emerald-100 transition border border-emerald-100 cursor-pointer">
                <ExternalLink size={11} /> Maps
              </button>
              <button onClick={handleSendToSequencer}
                className="h-10 bg-indigo-600 text-white rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1 active:bg-indigo-700 transition shadow-md shadow-indigo-200 cursor-pointer">
                <Route size={11} /> Sequencer
              </button>
            </div>
          )}

          {/* Warnings */}
          {routeValidation.warnings.length > 0 && (
            <div className="space-y-1">
              {routeValidation.warnings.slice(0, 3).map((w, i) => (
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
