import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  BrainCircuit, Play, ChevronRight, X, Navigation, Map as MapIcon,
  Route, Repeat, AlertTriangle, Zap, ChevronDown, ChevronUp,
  Timer, Copy, CheckSquare, Trash2, ArrowUp, ArrowDown
} from 'lucide-react';
import LiveRouteMap from './LiveRouteMap';
import { impact } from '../utils/haptics';
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

const RoutePlanSection = ({ routePlanStops = null, onSetRoutePlanStops = null, appSettings = {}, onSendToSequencer = null }) => {
  const [stops, setStops] = useState([]);
  const [totalTime, setTotalTime] = useState('0 min');
  const [isCalculating, setIsCalculating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

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

  useEffect(() => {
    if (routePlanStops && routePlanStops.length > 0) {
      const items = routePlanStops.map((item, i) => {
        const addr = (typeof item === 'string' ? item : item.address) || '';
        return {
          id: i === 0 ? 'origin' : String.fromCharCode(96 + i),
          type: i === 0 ? 'origin' : 'stop',
          letter: i === 0 ? null : String.fromCharCode(64 + i),
          label: addr,
          clientName: typeof item === 'string' ? '' : (item.clientName || ''),
          stopTime: typeof item === 'string' ? '' : (item.time || ''),
          stopType: typeof item === 'string' ? '' : (item.stopType || ''),
          tripId: typeof item === 'string' ? null : (item.tripId || null),
        };
      });
      setStops(items);
      setExpanded(true);
      if (onSetRoutePlanStops) onSetRoutePlanStops(null);
      return;
    }
    if (stops.length > 0) return;
    getCurrentAddress().then(address => {
      const origin = { id: 'origin', type: 'origin', letter: null, label: address || '', clientName: '', stopTime: '', stopType: '', tripId: null };
      const first = { id: 'a', type: 'stop', letter: 'A', label: '', clientName: '', stopTime: '', stopType: '', tripId: null };
      setStops(address ? [origin, first] : [origin, first]);
    });
  }, [routePlanStops, getCurrentAddress, onSetRoutePlanStops]);

  const updateStops = (newStops) => {
    const updated = newStops.map((stop, index) => {
      if (index === 0) return { ...stop, type: 'origin', letter: null };
      return { ...stop, type: 'stop', letter: String.fromCharCode(64 + index) };
    });
    setStops(updated);
  };

  const handleMoveUp = (index) => {
    if (index === 0) return;
    const copy = [...stops];
    [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]];
    updateStops(copy);
  };

  const handleMoveDown = (index) => {
    if (index === stops.length - 1) return;
    const copy = [...stops];
    [copy[index], copy[index + 1]] = [copy[index + 1], copy[index]];
    updateStops(copy);
  };

  const handleDelete = (index) => {
    if (stops.length <= 1) return;
    const newStops = stops.filter((_, i) => i !== index);
    updateStops(newStops);
  };

  const handleTextChange = (index, newText) => {
    setStops(prev => prev.map((s, i) => i === index ? { ...s, label: newText } : s));
  };

  const handleAddStop = () => {
    const nextLetter = String.fromCharCode(65 + stops.length - 1);
    setStops([...stops, { id: nextLetter.toLowerCase(), type: 'stop', letter: nextLetter, label: '', clientName: '', stopTime: '', stopType: '', tripId: null }]);
  };

  const handleAddCurrentLocation = async () => {
    setGettingLocation(true);
    const address = await getCurrentAddress();
    setGettingLocation(false);
    if (!address) return;
    const nextLetter = String.fromCharCode(65 + stops.length - 1);
    setStops([...stops, { id: nextLetter.toLowerCase(), type: 'stop', letter: nextLetter, label: address, clientName: '', stopTime: '', stopType: '', tripId: null }]);
  };

  useEffect(() => {
    if (!expanded) return;
    const calculateTripTime = async () => {
      if (stops.length < 2) { setTotalTime('0 min'); return; }
      const labels = stops.map(s => s.label.trim()).filter(Boolean);
      if (labels.length < 2) { setTotalTime('0 min'); return; }
      setIsCalculating(true);
      const origin = labels[0];
      const destination = labels[labels.length - 1];
      const waypoints = labels.slice(1, -1);

      try {
        await loadGoogleMapsScript();
        const directionsService = new window.google.maps.DirectionsService();
        const formattedWaypoints = waypoints.map(wp => ({ location: wp, stopover: true }));
        const time = await new Promise((resolve, reject) => {
          directionsService.route({
            origin, destination, waypoints: formattedWaypoints,
            travelMode: window.google.maps.TravelMode.DRIVING
          }, (response, status) => {
            if (status === 'OK' && response.routes?.[0]) {
              let total = 0;
              response.routes[0].legs.forEach(leg => { total += leg.duration.value; });
              const mins = Math.round(total / 60);
              resolve(mins >= 60 ? `${Math.floor(mins / 60)} hr ${mins % 60} min` : `${mins} min`);
            } else { reject(new Error(status)); }
          });
        });
        setTotalTime(time);
      } catch {
        try {
          const geminiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
          if (!geminiKey) { setTotalTime('Unavailable'); return; }
          const prompt = `Calculate driving time from "${origin}" to "${destination}"${waypoints.length ? ` with stops at "${waypoints.join(', ')}"` : ''}. Reply only with the time like '45 min'.`;
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
          });
          if (!res.ok) throw new Error();
          const data = await res.json();
          setTotalTime(data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Unavailable');
        } catch { setTotalTime('Unavailable'); }
      } finally { setIsCalculating(false); }
    };
    const id = setTimeout(calculateTripTime, 1200);
    return () => clearTimeout(id);
  }, [stops, expanded, loadGoogleMapsScript]);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition"
      >
        <div className="flex items-center gap-2">
          <MapIcon size={16} className="text-emerald-600" />
          <span className="text-sm font-bold text-slate-800">Route Plan</span>
        </div>
        {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {expanded && (
        <div className="border-t border-slate-100 px-3 py-2">
          <div className="w-full font-sans">
            {stops.map((stop, index) => (
              <React.Fragment key={stop.id}>
                <div className="flex items-center w-full">
                  <div className="flex items-center w-[60px] shrink-0 pr-3">
                    <div className="w-8 flex justify-start">
                      {index > 0 && (
                        <div className="flex flex-col gap-0.5">
                          <button onClick={() => handleMoveUp(index)} className="cursor-pointer hover:bg-gray-100 rounded p-0.5 transition-colors" disabled={index === 0}>
                            <ArrowUp size={14} className="text-gray-500" />
                          </button>
                          <button onClick={() => handleMoveDown(index)} className="cursor-pointer hover:bg-gray-100 rounded p-0.5 transition-colors" disabled={index === stops.length - 1}>
                            <ArrowDown size={14} className="text-gray-500" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="w-6 flex justify-center items-center">
                      {stop.type === 'origin' ? (
                        <div className="w-[18px] h-[18px] border-[1.5px] border-black rounded-full bg-white flex items-center justify-center">
                          <span className="text-[9px] font-bold text-black leading-none">O</span>
                        </div>
                      ) : (
                        <div className="w-[20px] h-[20px] border-[1.5px] border-black rounded-full bg-white flex items-center justify-center">
                          <span className="text-[11px] font-bold text-black leading-none">{stop.letter}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 border border-gray-200 rounded-lg px-2 py-[3px] bg-white shadow-sm">
                    {(stop.clientName || stop.stopTime || stop.stopType) && (
                      <div className="flex items-center gap-1 mb-0.5">
                        {stop.stopType && (
                          <span className={`text-[8px] font-bold px-1 py-[1px] rounded ${stop.stopType === 'PU' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                            {stop.stopType}
                          </span>
                        )}
                        {stop.clientName && <span className="text-[9px] font-bold text-gray-800 truncate">{stop.clientName}</span>}
                        {stop.stopTime && <span className="text-[8px] text-gray-500">{stop.stopTime}</span>}
                      </div>
                    )}
                    <input
                      type="text"
                      value={stop.label}
                      onChange={(e) => handleTextChange(index, e.target.value)}
                      className="text-[10px] text-gray-900 truncate bg-transparent outline-none w-full"
                      placeholder={index === 0 ? 'Starting point' : `Stop ${stop.letter}`}
                      spellCheck="false"
                    />
                  </div>
                  <div className="w-8 flex justify-end shrink-0 pl-2">
                    <button onClick={() => handleDelete(index)} className="cursor-pointer hover:bg-gray-100 p-0.5 rounded-full transition-colors" disabled={stops.length <= 1}>
                      <Trash2 size={14} className="text-gray-400" />
                    </button>
                  </div>
                </div>
                <div className="flex w-full my-0">
                  <div className="flex items-center w-[60px] shrink-0 pr-3">
                    <div className="w-8" />
                    <div className="w-6 flex flex-col items-center justify-center gap-[3px] py-0">
                      <div className="w-[2px] h-[2px] bg-gray-800 rounded-full" />
                      <div className="w-[2px] h-[2px] bg-gray-800 rounded-full" />
                      <div className="w-[2px] h-[2px] bg-gray-800 rounded-full" />
                    </div>
                  </div>
                </div>
              </React.Fragment>
            ))}
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={handleAddStop}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl active:scale-95 transition hover:bg-emerald-100"
              >
                <span className="text-base leading-none">+</span> Add stop
              </button>
              <button
                onClick={handleAddCurrentLocation}
                disabled={gettingLocation}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl active:scale-95 transition hover:from-blue-700 hover:to-blue-600 shadow-sm disabled:opacity-50"
              >
                <Navigation size={13} /> {gettingLocation ? 'Getting location...' : 'My Location'}
              </button>
              <button
                onClick={() => {
                  const labels = stops.map(s => s.label.trim()).filter(Boolean);
                  if (labels.length < 2) return;
                  const navApp = appSettings?.routePlanNavApp || appSettings?.navigationApp || 'google';
                  const origin = labels[0];
                  const destination = labels[labels.length - 1];
                  const waypoints = labels.slice(1, -1);
                  if (navApp === 'waze') {
                    const wazeStops = [origin, ...waypoints, destination];
                    const url = `https://waze.com/ul?q=${encodeURIComponent(wazeStops.join(', '))}&navigate=yes`;
                    window.open(url, '_blank', 'noopener,noreferrer');
                  } else if (navApp === 'apple') {
                    const appleStops = [origin, ...waypoints, destination].join(', ');
                    const url = `https://maps.apple.com/?daddr=${encodeURIComponent(appleStops)}&dirflg=d`;
                    window.open(url, '_blank', 'noopener,noreferrer');
                  } else {
                    const originEnc = encodeURIComponent(origin);
                    const destEnc = encodeURIComponent(destination);
                    const wps = waypoints.map(w => encodeURIComponent(w)).join('|');
                    const url = `https://www.google.com/maps/dir/?api=1&origin=${originEnc}&destination=${destEnc}${wps ? `&waypoints=${wps}` : ''}&travelmode=driving`;
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }
                }}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl active:scale-95 transition hover:from-indigo-700 hover:to-purple-700 shadow-sm"
              >
                <Navigation size={13} /> Navigate All
              </button>
            </div>
            <div className="flex justify-between items-center mt-3 px-1">
              <div className="text-[14px] text-black">
                Total trip: <span className="font-normal text-gray-700">{isCalculating ? 'Calculating...' : totalTime}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const stopData = stops.map(s => ({
                      address: s.label.trim(),
                      clientName: s.clientName || '',
                      time: s.stopTime || '',
                      stopType: s.stopType || '',
                      tripId: s.tripId || null,
                    })).filter(s => s.address);
                    if (stopData.length === 0) return;
                    if (onSendToSequencer) onSendToSequencer(stopData);
                  }}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors flex items-center gap-1"
                >
                  <Route size={13} /> Save to Sequencer
                </button>
                <button className="text-emerald-600 font-medium text-[14px] hover:text-emerald-700 transition-colors">
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
  onRunAiOptimization, onSelectAllTrips, selectedTrips, onSetSelectedTrips, etas,
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
    <div className="flex-1 overflow-y-auto pb-28 px-3 pt-2 space-y-2">
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
                <span className="w-5 h-5 bg-white/20 rounded-lg flex items-center justify-center text-xs font-black text-white">{guidedStepIndex + 1}</span>
                <span className="text-xs font-bold text-white/80 uppercase tracking-wider">of {aiSequence.length}</span>
              </div>
              <button onClick={() => { onSetGuidedMode(false); }} className="text-xs text-white/60 font-bold uppercase hover:text-white/90">Exit</button>
            </div>
            <div className="h-1 bg-white/20 rounded-full overflow-hidden mb-1.5">
              <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-white truncate flex-1 min-w-0">
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
              <p className="text-xs font-bold text-rose-800">{conflicts.length} time conflict{conflicts.length > 1 ? 's' : ''}</p>
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
              <p className="text-xs font-bold text-emerald-800">{aiRideShare.length} shared ride{aiRideShare.length > 1 ? 's' : ''}</p>
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
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-3 flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-blue-700">{selectedTrips.length} selected</span>
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
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-2">
        <button
          onClick={onOpenSequencer}
          className="w-full flex items-center justify-between px-4 py-4 hover:bg-slate-50 transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Route size={16} className="text-indigo-600" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-bold text-slate-800">Route Sequencer</h3>
              <p className="text-micro font-semibold text-slate-400">Advanced multi-load engine & templates</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-slate-300" />
        </button>
      </div>

      {/* Route Plan */}
      <RoutePlanSection routePlanStops={routePlanStops} onSetRoutePlanStops={onSetRoutePlanStops} appSettings={appSettings} onSendToSequencer={onSendToSequencer} />

      {/* Smart Route Panel */}
      {aiSequence && aiSequence.length >= 2 && !guidedMode && (
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-2xl p-[1.5px] shadow-lg shadow-indigo-200/50">
          <div className="bg-white rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <BrainCircuit size={16} className="text-indigo-600" />
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Smart Route</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              {aiSequence.map((id, i) => {
                const t = trips.find(t => t.id === id);
                return (
                  <React.Fragment key={id}>
                    {i > 0 && <ChevronRight size={11} className="text-slate-300 shrink-0" />}
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${t && !['Assigned','Unassigned'].includes(t.status) ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
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
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl p-3">
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

      {/* Collapsible Sections */}
      {/* Live Route Map */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <button
          onClick={() => toggleSection('route')}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition"
        >
          <div className="flex items-center gap-2">
            <MapIcon size={16} className="text-blue-600" />
            <span className="text-sm font-bold text-slate-800">Live Route Map</span>
          </div>
          {expandedSection === 'route' ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>
        {expandedSection === 'route' && (
          <div className="border-t border-slate-100">
            <LiveRouteMap
              driverPosition={driverPosition}
              trips={activeTrips}
              aiSequence={aiSequence}
              activeTripId={guidedSteps?.[guidedStepIndex]?.tripId || aiSequence?.[guidedStepIndex] || null}
              theme={appSettings?.theme || 'light'}
              onOpenInNav={onOpenInNav}
              currentUser={currentUser}
              role={role}
            />
          </div>
        )}
      </div>

      {/* Route Quick Nav */}
      {activeTrips.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <button
            onClick={() => toggleSection('quicknav')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition"
          >
            <div className="flex items-center gap-2">
              <Navigation size={16} className="text-emerald-600" />
              <span className="text-sm font-bold text-slate-800">Quick Navigation</span>
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
                      <span className="block truncate text-xs font-bold text-slate-800">{trip.patient}</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {trip.bookingId && (
                          <span className="rounded-full border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                            {trip.bookingId}
                          </span>
                        )}
                        {(trip.type || trip.serviceType) && (
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
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
      {activeTrips.length > 0 && Object.keys(etas).length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <button
            onClick={() => toggleSection('etas')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition"
          >
            <div className="flex items-center gap-2">
              <Timer size={16} className="text-amber-600" />
              <span className="text-sm font-bold text-slate-800">Trip ETAs</span>
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
                        <span className="mt-1 inline-flex rounded-full border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                          {trip.bookingId}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-slate-500">{formatDuration(eta)}</span>
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
