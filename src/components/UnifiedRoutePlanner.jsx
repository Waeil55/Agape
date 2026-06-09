import React, { useState, lazy, Suspense, useMemo } from 'react';
import {
  Route, BrainCircuit, Play, MapPin, Navigation, ChevronDown, ChevronRight,
  CheckSquare, X, Compass, Clock, AlertTriangle, Zap, Map as MapIcon,
  Timer, Copy, Trash2, ArrowUp, ArrowDown, Repeat, Save
} from 'lucide-react';
import { impact } from '../utils/haptics';
import { GOOGLE_MAPS_API_KEY } from '../config/firebase';
import DriverToolsPage from './DriverToolsPage';

const RouteSequencerApp = lazy(() => import('./RouteSequencer'));

const LazyFallback = () => (
  <div className="flex-1 flex items-center justify-center p-8">
    <div className="text-center">
      <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
      <p className="text-xs font-semibold text-slate-400">Loading Sequencer...</p>
    </div>
  </div>
);

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <div className="p-6 text-center text-red-500 text-sm font-semibold">Something went wrong loading the sequencer.</div>;
    return this.props.children;
  }
}

const UnifiedRoutePlanner = ({
  trips, activeTrips, aiSequence, aiSuggestions, aiRideShare, conflicts,
  aiOptimizing, guidedMode, guidedStepIndex, guidedSteps,
  driverPosition, appSettings, currentUser, role, me,
  onSetGuidedMode, onSetGuidedStepIndex, onSetAiSequence, onSetAiSuggestions,
  onRunAiOptimization, onSelectAllTrips, selectedTrips, onSetSelectedTrips, etas,
  onOpenInNav, requestAuthAction = () => {},
  routePlanStops = null, onSetRoutePlanStops = null,
  advanceWorkflow, onApplyRoute, onRouteSaved,
  sequencerKey, setSequencerKey,
  routePlanSequencerStops, routePlanSequencerSequence, routePlanSequencerOrigin,
  setRoutePlanSequencerStops, setRoutePlanSequencerSequence, setRoutePlanSequencerOrigin,
  setSequencerTripFilter, drivers, setShowToast,
  onAddAuditLog,
  setActiveNav,
}) => {
  const [activeTab, setActiveTab] = useState('sequencer');

  const handleSendToSequencer = (stopData, origin) => {
    if (!Array.isArray(stopData) || stopData.length === 0) {
      if (stopData?.clients?.length) {
        setSequencerTripFilter(null);
        setRoutePlanSequencerStops(stopData.clients);
        setRoutePlanSequencerSequence(stopData.sequence || null);
        setRoutePlanSequencerOrigin(origin || null);
        setSequencerKey(k => k + 1);
        setActiveTab('sequencer');
        setShowToast({ type: 'success', message: `${stopData.clients.length} route stop${stopData.clients.length !== 1 ? 's' : ''} loaded in Sequencer.` });
        return;
      }
      setSequencerTripFilter(null);
      setRoutePlanSequencerStops(null);
      setRoutePlanSequencerSequence(null);
      setRoutePlanSequencerOrigin(null);
      setSequencerKey(k => k + 1);
      setActiveTab('sequencer');
      return;
    }
    const stamp = Date.now();
    const items = stopData
      .filter(s => s?.address)
      .map((s, index) => {
        const stopType = s.stopType === 'DO' ? 'DO' : 'PU';
        const id = `route-plan-${stamp}-${index}`;
        return {
          id,
          name: s.clientName || `Stop ${String.fromCharCode(65 + index)}`,
          address: s.address,
          pu: stopType === 'PU' ? s.address : '',
          do: stopType === 'DO' ? s.address : '',
          time: s.time || '',
          serviceType: s.serviceType || '',
          bookingId: s.bookingId || '',
          phone: s.phone || s.patientPhone || s.pickupPhone || s.dropoffPhone || '',
          routePlanTripId: s.tripId || null,
        };
      });
    const sequence = items.map((item, index) => ({
      clientId: item.id,
      type: item.do ? 'DO' : 'PU',
      leg: 'A',
      stepNumber: index + 1,
    }));
    setSequencerTripFilter(null);
    setRoutePlanSequencerStops(items);
    setRoutePlanSequencerSequence(sequence);
    setRoutePlanSequencerOrigin(origin || null);
    setSequencerKey(k => k + 1);
    setActiveTab('sequencer');
    setShowToast({ type: 'success', message: `${items.length} route stop${items.length !== 1 ? 's' : ''} loaded in Sequencer.` });
  };

  const tabs = [
    { id: 'sequencer', label: 'Route Builder', icon: Route },
    { id: 'plan', label: 'Plan', icon: MapPin },
    { id: 'navigate', label: 'Navigate', icon: Navigation },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#f3f4f6' }}>
      {/* Tab Bar */}
      <div className="shrink-0 bg-white/90 backdrop-blur-xl border-b border-slate-200/50 px-3 pt-2 pb-0 flex items-center gap-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-[11px] font-extrabold transition-all cursor-pointer ${
                isActive ? 'bg-[#f3f4f6] text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'
              }`}>
              <Icon size={13} />
              {tab.label}
            </button>
          );
        })}
        {guidedMode && (
          <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-xl border border-indigo-100">
            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-[10px] font-extrabold text-indigo-600">Guided</span>
            <button onClick={() => { onSetGuidedMode(false); onSetAiSequence(null); onSetAiSuggestions([]); }}
              className="text-indigo-400 hover:text-indigo-600 cursor-pointer"><X size={12} /></button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'sequencer' && (
          <div className="flex-1 overflow-hidden flex flex-col h-full">
            {/* AI Optimize Bar */}
            {selectedTrips.length >= 1 && (
              <div className="shrink-0 mx-3 mt-2 bg-white/80 backdrop-blur rounded-2xl border border-blue-100/60 shadow-sm p-2.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold text-blue-700">{selectedTrips.length} selected</span>
                <div className="flex gap-1.5">
                  <button onClick={() => onSelectAllTrips()}
                    className="px-2.5 h-7 bg-blue-50 text-blue-700 rounded-xl text-[10px] font-extrabold flex items-center gap-1 active:scale-95 transition border border-blue-100 cursor-pointer">
                    <CheckSquare size={10} /> {selectedTrips.length === activeTrips.length ? 'Deselect' : 'Select All'}
                  </button>
                  {selectedTrips.length >= 2 && (
                    <button onClick={() => onRunAiOptimization()} disabled={aiOptimizing}
                      className="px-2.5 h-7 bg-indigo-600 text-white rounded-xl text-[10px] font-extrabold flex items-center gap-1 active:scale-95 transition shadow-md shadow-indigo-200 cursor-pointer">
                      <BrainCircuit size={10} /> {aiOptimizing ? 'Analyzing...' : 'AI Optimize'}
                    </button>
                  )}
                  <button onClick={() => onSetSelectedTrips([])}
                    className="px-2.5 h-7 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-extrabold active:scale-95 transition cursor-pointer">Clear</button>
                </div>
              </div>
            )}

            {/* Smart Route Display */}
            {aiSequence && aiSequence.length >= 2 && !guidedMode && (
              <div className="shrink-0 mx-3 mt-2 rounded-2xl overflow-hidden shadow-lg shadow-indigo-900/10" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #2563eb 100%)' }}>
                <div className="p-3 flex items-center gap-2">
                  <BrainCircuit size={14} className="text-white/80" />
                  <span className="text-[10px] font-extrabold text-white/60 uppercase tracking-wider flex-1">AI Smart Route</span>
                  <button onClick={() => { onSetGuidedMode(true); onSetGuidedStepIndex(0); onSetAiSuggestions([]); }}
                    className="px-3 h-7 bg-white text-indigo-700 rounded-xl text-[10px] font-extrabold flex items-center gap-1 active:scale-95 shadow cursor-pointer">
                    <Play size={10} strokeWidth={2.5} /> Start
                  </button>
                  <button onClick={() => { onSetAiSequence(null); onSetAiSuggestions([]); }}
                    className="h-7 px-2 bg-white/10 text-white/60 rounded-xl text-[10px] font-extrabold active:scale-95 cursor-pointer">Dismiss</button>
                </div>
              </div>
            )}

            {/* AI Suggestions */}
            {aiSuggestions.length > 0 && (!aiSequence || aiSequence.length < 2) && (
              <div className="shrink-0 mx-3 mt-2 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-3 flex items-start gap-2">
                <BrainCircuit size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  {aiSuggestions.map((s, i) => <p key={i} className="text-[11px] font-semibold text-indigo-400 leading-relaxed">{s}</p>)}
                </div>
                <button onClick={() => onSetAiSuggestions([])} className="text-indigo-300 hover:text-indigo-500 cursor-pointer"><X size={12} /></button>
              </div>
            )}

            {/* Conflict & Ride-Share Warnings */}
            {conflicts.length > 0 && (
              <div className="shrink-0 mx-3 mt-2 bg-amber-50 border border-amber-200/60 rounded-2xl p-3 flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  {conflicts.map((c, i) => <p key={i} className="text-[11px] font-semibold text-amber-700">{c.text || `${c.a} ↔ ${c.b} (${c.gap} min gap)`}</p>)}
                </div>
              </div>
            )}
            {aiRideShare.length > 0 && (
              <div className="shrink-0 mx-3 mt-2 bg-emerald-50 border border-emerald-200/60 rounded-2xl p-3 flex items-start gap-2">
                <Repeat size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  {aiRideShare.map((r, i) => <p key={i} className="text-[11px] font-semibold text-emerald-700">{r.text || r}</p>)}
                </div>
              </div>
            )}

            {/* Sequencer */}
            <div className="flex-1 overflow-hidden mt-2">
              <Suspense fallback={<LazyFallback />}>
                <ErrorBoundary>
                  <RouteSequencerApp key={sequencerKey}
                    trips={trips}
                    drivers={drivers}
                    currentUser={currentUser}
                    role={role}
                    me={me}
                    advanceWorkflow={advanceWorkflow}
                    initialStops={routePlanSequencerStops}
                    initialSequence={routePlanSequencerSequence}
                    initialOrigin={routePlanSequencerOrigin}
                    onRouteSaved={onRouteSaved}
                    onApplyRoute={onApplyRoute}
                  />
                </ErrorBoundary>
              </Suspense>
            </div>
          </div>
        )}

        {activeTab === 'plan' && (
          <div className="flex-1 overflow-y-auto overscroll-contain pb-28 px-3 pt-3">
            <DriverToolsPage
              trips={trips}
              activeTrips={activeTrips}
              aiSequence={aiSequence}
              aiSuggestions={aiSuggestions}
              aiRideShare={aiRideShare}
              conflicts={conflicts}
              aiOptimizing={aiOptimizing}
              guidedMode={guidedMode}
              guidedStepIndex={guidedStepIndex}
              guidedSteps={guidedSteps}
              driverPosition={driverPosition}
              appSettings={appSettings}
              currentUser={currentUser}
              role={role}
              onSetGuidedMode={onSetGuidedMode}
              onSetGuidedStepIndex={onSetGuidedStepIndex}
              onSetAiSequence={onSetAiSequence}
              onSetAiSuggestions={onSetAiSuggestions}
              onRunAiOptimization={onRunAiOptimization}
              onSelectAllTrips={onSelectAllTrips}
              selectedTrips={selectedTrips}
              onSetSelectedTrips={onSetSelectedTrips}
              etas={etas}
              onOpenInNav={onOpenInNav}
              onOpenSequencer={() => setActiveTab('sequencer')}
              requestAuthAction={requestAuthAction}
              routePlanStops={routePlanStops}
              onSetRoutePlanStops={onSetRoutePlanStops}
              onSendToSequencer={handleSendToSequencer}
            />
          </div>
        )}

        {activeTab === 'navigate' && (
          <div className="flex-1 overflow-y-auto overscroll-contain pb-28 px-3 pt-3 space-y-3">
            {/* Quick Navigation */}
            {activeTrips.length > 0 ? (
              <>
                <div className="bg-white/80 backdrop-blur rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3.5 flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-emerald-50 flex items-center justify-center">
                      <Navigation size={16} className="text-emerald-600" />
                    </div>
                    <div>
                      <span className="block text-[13px] font-extrabold text-slate-900 tracking-tight">Quick Navigation</span>
                      <span className="block text-[11px] font-semibold text-slate-400">{activeTrips.length} active trip{activeTrips.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="border-t border-slate-100 divide-y divide-slate-100/50">
                    {activeTrips.map(trip => (
                      <div key={trip.id} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="min-w-0">
                            <span className="block truncate text-[13px] font-extrabold text-slate-900">{trip.patient}</span>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {trip.bookingId && <span className="rounded-lg border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold text-blue-700">{trip.bookingId}</span>}
                              {(trip.type || trip.serviceType) && <span className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-600">{trip.type || trip.serviceType}</span>}
                            </div>
                          </div>
                          <span className="text-[11px] font-bold text-slate-400 shrink-0 ml-2">{trip.time || 'WC'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => onOpenInNav(trip.pickup)}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 bg-emerald-50 text-emerald-700 rounded-xl text-[11px] font-extrabold active:bg-emerald-100 transition border border-emerald-100 cursor-pointer">
                            <MapPin size={12} /> Pickup
                          </button>
                          <button onClick={() => onOpenInNav(trip.dropoff)}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 bg-rose-50 text-rose-700 rounded-xl text-[11px] font-extrabold active:bg-rose-100 transition border border-rose-100 cursor-pointer">
                            <MapPin size={12} /> Dropoff
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Trip ETAs */}
                {Object.keys(etas).length > 0 && (
                  <div className="bg-white/80 backdrop-blur rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-4 py-3.5 flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-2xl bg-amber-50 flex items-center justify-center">
                        <Timer size={16} className="text-amber-600" />
                      </div>
                      <span className="text-[13px] font-extrabold text-slate-900 tracking-tight">Trip ETAs</span>
                    </div>
                    <div className="border-t border-slate-100 divide-y divide-slate-100/50">
                      {activeTrips.map(trip => {
                        const eta = etas[trip.id];
                        if (eta === undefined) return null;
                        return (
                          <div key={trip.id} className="flex items-center justify-between px-4 py-3">
                            <span className="truncate text-[12px] font-bold text-slate-700">{trip.patient}</span>
                            <span className="text-[12px] font-extrabold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg">{Math.round(eta)} min</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-16">
                <Navigation size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-400">No active trips</p>
                <p className="text-xs text-slate-300 mt-1">Navigation will appear here when trips are in progress</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default UnifiedRoutePlanner;
