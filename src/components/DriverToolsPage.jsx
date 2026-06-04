import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BrainCircuit, Play, ChevronRight, X, Navigation,
  Route, Repeat, AlertTriangle, ChevronDown, ChevronUp,
  Timer, CheckSquare, GripHorizontal, Plus, Trash2, Circle
} from 'lucide-react';
import { impact } from '../utils/haptics';
import { GEMINI_API_CONFIG, GOOGLE_MAPS_API_KEY } from '../config/firebase';

let googleMapsScriptPromise = null;

const loadGoogleMapsScript = () => {
  const apiKey = GOOGLE_MAPS_API_KEY();
  if (!apiKey) return Promise.reject(new Error('Google Maps API key is not configured.'));
  if (window.google?.maps?.DirectionsService) return Promise.resolve();
  if (googleMapsScriptPromise) return googleMapsScriptPromise;

  const existingScript = document.getElementById('google-maps-script') || document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
  if (existingScript) {
    googleMapsScriptPromise = new Promise((resolve, reject) => {
      existingScript.addEventListener('load', resolve, { once: true });
      existingScript.addEventListener('error', reject, { once: true });
      if (window.google?.maps?.DirectionsService) resolve();
    });
    return googleMapsScriptPromise;
  }

  const script = document.createElement('script');
  script.id = 'google-maps-script';
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly`;
  script.async = true;
  script.defer = true;
  googleMapsScriptPromise = new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = () => reject(new Error('Google Maps script failed to load.'));
  });
  document.head.appendChild(script);
  return googleMapsScriptPromise;
};

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

const formatPlannerDuration = (minutes) => {
  if (!Number.isFinite(minutes) || minutes < 0) return 'Unavailable';
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return `${hours} hr ${remainingMinutes} min`;
};

const getStopQuery = (stop) => (stop?.query || stop?.label || '').trim();

const shouldIncludePickup = (trip) => ![
  'At Pickup',
  'In Transit',
  'Navigating Dropoff',
  'At Dropoff',
  'Arrived',
  'Completed',
  'Cancelled',
  'No Show',
  'Rerouted',
].includes(trip?.status);

const buildRouteStopCandidates = (activeTrips = [], aiSequence = [], driverPosition = null) => {
  const aiOrder = new Map((aiSequence || []).map((id, index) => [id, index]));
  const orderedTrips = [...(activeTrips || [])].sort((a, b) => {
    const aOrder = aiOrder.has(a.id) ? aiOrder.get(a.id) : 9999;
    const bOrder = aiOrder.has(b.id) ? aiOrder.get(b.id) : 9999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return timeToMinutes(a.time) - timeToMinutes(b.time);
  });

  const routeStops = [];
  orderedTrips.forEach((trip) => {
    if (shouldIncludePickup(trip) && trip.pickup) {
      routeStops.push({
        id: `${trip.id}-pickup`,
        type: 'pickup',
        label: trip.pickup,
        query: trip.pickup,
        patient: trip.patient,
        time: trip.time,
      });
    }
    if (trip.dropoff) {
      routeStops.push({
        id: `${trip.id}-dropoff`,
        type: 'dropoff',
        label: trip.dropoff,
        query: trip.dropoff,
        patient: trip.patient,
        time: trip.time,
      });
    }
  });

  if (driverPosition?.lat && driverPosition?.lng) {
    return [
      {
        id: 'origin-current-location',
        type: 'origin',
        label: 'Current driver location',
        query: `${driverPosition.lat},${driverPosition.lng}`,
      },
      ...routeStops,
    ];
  }

  if (routeStops.length > 0) {
    return [
      { ...routeStops[0], id: `origin-${routeStops[0].id}`, type: 'origin' },
      ...routeStops.slice(1),
    ];
  }

  return [{ id: 'origin-empty', type: 'origin', label: 'Add starting address', query: '' }];
};

const normalizePlannerStops = (newStops) => newStops.map((stop, index) => {
  if (index === 0) return { ...stop, type: 'origin', letter: null };
  return { ...stop, type: stop.type === 'origin' ? 'stop' : stop.type, letter: String.fromCharCode(64 + index) };
});

const DriverRoutePlanner = ({ activeTrips, aiSequence, driverPosition, onDone }) => {
  const seedKey = useMemo(
    () => JSON.stringify({
      trips: (activeTrips || []).map((trip) => [trip.id, trip.status, trip.pickup, trip.dropoff, trip.time]),
      aiSequence: aiSequence || [],
      position: driverPosition ? [driverPosition.lat, driverPosition.lng] : null,
    }),
    [activeTrips, aiSequence, driverPosition]
  );
  const initialStops = useMemo(
    () => normalizePlannerStops(buildRouteStopCandidates(activeTrips, aiSequence, driverPosition)),
    [activeTrips, aiSequence, driverPosition]
  );
  const seedKeyRef = useRef(seedKey);
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const [stops, setStops] = useState(initialStops);
  const [totalTime, setTotalTime] = useState('0 min');
  const [timeSource, setTimeSource] = useState('');
  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    if (seedKeyRef.current === seedKey) return;
    seedKeyRef.current = seedKey;
    setStops(initialStops);
  }, [initialStops, seedKey]);

  useEffect(() => {
    const calculateWithGoogleMaps = async (origin, destination, waypoints) => {
      await loadGoogleMapsScript();
      const directionsService = new window.google.maps.DirectionsService();
      const formattedWaypoints = waypoints.map((waypoint) => ({ location: waypoint, stopover: true }));
      return new Promise((resolve, reject) => {
        directionsService.route({
          origin,
          destination,
          waypoints: formattedWaypoints,
          travelMode: window.google.maps.TravelMode.DRIVING,
          drivingOptions: { departureTime: new Date(), trafficModel: 'bestguess' },
          unitSystem: window.google.maps.UnitSystem.IMPERIAL,
          optimizeWaypoints: false,
        }, (response, status) => {
          if (status === 'OK' && response.routes?.length > 0) {
            const totalSeconds = response.routes[0].legs.reduce(
              (sum, leg) => sum + (leg.duration_in_traffic?.value || leg.duration?.value || 0),
              0
            );
            resolve(formatPlannerDuration(totalSeconds / 60));
          } else {
            reject(new Error(`Directions request failed with status: ${status}`));
          }
        });
      });
    };

    const calculateWithGemini = async (origin, destination, waypoints) => {
      const { apiKey } = GEMINI_API_CONFIG();
      if (!apiKey) throw new Error('Gemini API key is not configured.');
      const prompt = `You are a route calculation tool. Calculate the estimated driving time from "${origin}" to "${destination}" with stops at "${waypoints.join(', ')}". Respond ONLY with the total time in minutes, like "45 min".`;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!response.ok) throw new Error('Gemini route estimate failed.');
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) throw new Error('Gemini did not return a route estimate.');
      return text;
    };

    const calculateTripTime = async () => {
      const routeQueries = stops.map(getStopQuery).filter(Boolean);
      if (routeQueries.length < 2) {
        setTotalTime(routeQueries.length === 0 ? 'Add stops' : 'Add destination');
        setTimeSource('');
        return;
      }

      const origin = routeQueries[0];
      const destination = routeQueries[routeQueries.length - 1];
      const waypoints = routeQueries.slice(1, -1);
      setIsCalculating(true);
      try {
        const time = await calculateWithGoogleMaps(origin, destination, waypoints);
        setTotalTime(time);
        setTimeSource('Google Maps');
      } catch (mapsError) {
        try {
          const time = await calculateWithGemini(origin, destination, waypoints);
          setTotalTime(time);
          setTimeSource('AI estimate');
        } catch (geminiError) {
          console.error('[DriverRoutePlanner] Route time unavailable:', mapsError, geminiError);
          setTotalTime('Unavailable');
          setTimeSource('');
        }
      } finally {
        setIsCalculating(false);
      }
    };

    const timeoutId = setTimeout(calculateTripTime, 900);
    return () => clearTimeout(timeoutId);
  }, [stops]);

  const updateStops = (newStops) => setStops(normalizePlannerStops(newStops));

  const handleDrop = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const nextStops = [...stops];
    const draggedStop = nextStops[dragItem.current];
    nextStops.splice(dragItem.current, 1);
    nextStops.splice(dragOverItem.current, 0, draggedStop);
    dragItem.current = null;
    dragOverItem.current = null;
    updateStops(nextStops);
  };

  const handleTextChange = (index, newText) => {
    setStops(prev => prev.map((stop, stopIndex) => (
      stopIndex === index ? { ...stop, label: newText, query: newText } : stop
    )));
  };

  const handleDelete = (indexToRemove) => {
    if (stops.length <= 1) return;
    updateStops(stops.filter((_, index) => index !== indexToRemove));
  };

  const handleAddStop = () => {
    updateStops([
      ...stops,
      {
        id: `custom-${Date.now()}`,
        type: 'stop',
        label: '',
        query: '',
      },
    ]);
  };

  return (
    <div className="p-4 bg-white">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-blue-700">Route Planner</p>
          <h3 className="mt-0.5 text-lg font-black tracking-tight text-slate-900">Stop order</h3>
        </div>
        <button
          type="button"
          onClick={handleAddStop}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <Plus size={14} className="mr-1 inline" /> Stop
        </button>
      </div>

      <div className="space-y-1">
        {stops.map((stop, index) => (
          <React.Fragment key={stop.id}>
            <div
              className="flex w-full items-center"
              draggable
              onDragStart={() => { dragItem.current = index; }}
              onDragEnter={() => { dragOverItem.current = index; }}
              onDragEnd={handleDrop}
              onDragOver={(event) => event.preventDefault()}
            >
              <div className="flex w-[48px] shrink-0 items-center justify-center">
                {stop.type === 'origin' ? (
                  <Circle size={20} className="text-slate-900" />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-900 bg-white text-[11px] font-black text-slate-900">
                    {stop.letter}
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-1 cursor-move items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm transition hover:border-slate-300 hover:shadow-md">
                <div className="min-w-0 flex-1">
                  <input
                    type="text"
                    value={stop.label}
                    onChange={(event) => handleTextChange(index, event.target.value)}
                    className="w-full truncate bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                    placeholder={index === 0 ? 'Starting address' : 'Stop address'}
                    spellCheck="false"
                  />
                  {stop.patient && (
                    <p className="mt-0.5 truncate text-[11px] font-bold text-slate-400">
                      {stop.type === 'pickup' ? 'Pickup' : stop.type === 'dropoff' ? 'Dropoff' : 'Stop'} - {stop.patient}
                    </p>
                  )}
                </div>
                <GripHorizontal size={18} className="ml-2 shrink-0 text-slate-300" />
              </div>

              <div className="flex w-10 shrink-0 justify-end pl-2">
                <button
                  type="button"
                  onClick={() => handleDelete(index)}
                  disabled={stops.length <= 1}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
                  aria-label="Remove stop"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {index < stops.length - 1 && (
              <div className="flex w-full py-1">
                <div className="flex w-[48px] shrink-0 flex-col items-center justify-center gap-1">
                  <span className="h-1 w-1 rounded-full bg-slate-400" />
                  <span className="h-1 w-1 rounded-full bg-slate-400" />
                  <span className="h-1 w-1 rounded-full bg-slate-400" />
                </div>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total trip</p>
          <p className="text-lg font-black text-slate-900">{isCalculating ? 'Calculating...' : totalTime}</p>
          {timeSource && <p className="text-[11px] font-semibold text-slate-400">{timeSource}</p>}
        </div>
        <button
          type="button"
          onClick={onDone}
          className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          Done
        </button>
      </div>
    </div>
  );
};

const DriverToolsPage = ({
  trips, activeTrips, aiSequence, aiSuggestions, aiRideShare, conflicts,
  aiOptimizing, guidedMode, guidedStepIndex,
  driverPosition, role,
  onSetGuidedMode, onSetGuidedStepIndex, onSetAiSequence, onSetAiSuggestions,
  onRunAiOptimization, onSelectAllTrips, selectedTrips, onSetSelectedTrips, etas,
  onOpenInNav,
  onOpenSequencer,
  requestAuthAction = () => {}
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
      {/* Driver Route Planner */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <button
          onClick={() => toggleSection('route')}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition"
        >
          <div className="flex items-center gap-2">
            <Route size={16} className="text-blue-600" />
            <span className="text-sm font-bold text-slate-800">Route Planner</span>
            <span className="text-xs text-slate-400 font-medium">({activeTrips.length})</span>
          </div>
          {expandedSection === 'route' ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>
        {expandedSection === 'route' && (
          <div className="border-t border-slate-100">
            <DriverRoutePlanner
              activeTrips={activeTrips}
              aiSequence={aiSequence}
              driverPosition={driverPosition}
              onDone={() => toggleSection('route')}
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
