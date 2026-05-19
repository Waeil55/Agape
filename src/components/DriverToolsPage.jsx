import React, { useState } from 'react';
import {
  BrainCircuit, Play, ChevronRight, X, Navigation, Map,
  Route, Repeat, AlertTriangle, Zap, ChevronDown, ChevronUp,
  Timer, Copy
} from 'lucide-react';
import LiveRouteMap from './LiveRouteMap';
import { impact } from '../utils/haptics';

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

const DriverToolsPage = ({
  trips, activeTrips, aiSequence, aiSuggestions, aiRideShare, conflicts,
  aiOptimizing, guidedMode, guidedStepIndex,
  driverPosition, appSettings, currentUser, role,
  onSetGuidedMode, onSetGuidedStepIndex, onSetAiSequence, onSetAiSuggestions,
  onRunAiOptimization, selectedTrips, onSetSelectedTrips, etas,
  onOpenInNav
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
      {selectedTrips.length >= 2 && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-3 flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-blue-700">{selectedTrips.length} selected</span>
          <div className="flex gap-2">
            <button onClick={() => onRunAiOptimization()} disabled={aiOptimizing}
              className="px-3 h-8 bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition">
              <BrainCircuit size={12} /> {aiOptimizing ? 'Analyzing...' : 'AI Optimize'}
            </button>
            <button onClick={() => onSetSelectedTrips([])} className="px-3 h-8 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold active:scale-95 transition">Clear</button>
          </div>
        </div>
      )}

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
              <button onClick={() => { onSetAiSequence(null); onSetAiSuggestions([]); }}
                className="h-10 px-3 bg-slate-100 text-slate-500 rounded-xl text-xs font-bold active:scale-95">Dismiss</button>
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
            <Map size={16} className="text-blue-600" />
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
              activeTripId={aiSequence?.[guidedStepIndex] || null}
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
                    <span className="text-xs font-bold text-slate-800">{trip.patient}</span>
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
                    <span className="text-xs font-medium text-slate-700">{trip.patient}</span>
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
