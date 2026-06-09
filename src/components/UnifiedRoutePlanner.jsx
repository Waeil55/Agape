import React, { useState, lazy, Suspense, useMemo } from 'react';
import {
  Route, BrainCircuit, Play, MapPin, Navigation,
  X, AlertTriangle, Timer, Repeat,
  Bookmark, Trash2, ChevronDown, ChevronUp, Calendar,
  Clock, FolderOpen, Compass
} from 'lucide-react';
import DriverToolsPage from './DriverToolsPage';
import { db, doc, setDoc } from '../config/firebase';
import { normalizeRouteRecord, ROUTE_ASSIGNMENT_STATUS, ROUTE_STATUS_BADGES } from '../utils/routePlans';

const RouteSequencerApp = lazy(() => import('./RouteSequencer'));

const SEQUENCES_DOC = 'routeData/sequences';

const LazyFallback = () => (
  <div className="flex-1 flex items-center justify-center p-8">
    <div className="text-center">
      <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
      <p className="text-xs font-semibold text-slate-400">Loading...</p>
    </div>
  </div>
);

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <div className="p-6 text-center text-red-500 text-sm font-semibold">Something went wrong.</div>;
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
  routeTemplates = [],
}) => {
  const [activeTab, setActiveTab] = useState('plan');
  const [expandedTemplateId, setExpandedTemplateId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const handleSendToSequencer = (stopData, origin) => {
    if (!Array.isArray(stopData) || stopData.length === 0) {
      if (stopData?.clients?.length) {
        setSequencerTripFilter(null);
        setRoutePlanSequencerStops(stopData.clients);
        setRoutePlanSequencerSequence(stopData.sequence || null);
        setRoutePlanSequencerOrigin(origin || null);
        setSequencerKey(k => k + 1);
        setActiveTab('build');
        setShowToast({ type: 'success', message: `${stopData.clients.length} stop${stopData.clients.length !== 1 ? 's' : ''} loaded.` });
        return;
      }
      setSequencerTripFilter(null);
      setRoutePlanSequencerStops(null);
      setRoutePlanSequencerSequence(null);
      setRoutePlanSequencerOrigin(null);
      setSequencerKey(k => k + 1);
      setActiveTab('build');
      return;
    }
    const stamp = Date.now();
    const items = stopData.filter(s => s?.address).map((s, index) => {
      const stopType = s.stopType === 'DO' ? 'DO' : 'PU';
      return {
        id: `rp-${stamp}-${index}`,
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
      clientId: item.id, type: item.do ? 'DO' : 'PU', leg: 'A', stepNumber: index + 1,
    }));
    setSequencerTripFilter(null);
    setRoutePlanSequencerStops(items);
    setRoutePlanSequencerSequence(sequence);
    setRoutePlanSequencerOrigin(origin || null);
    setSequencerKey(k => k + 1);
    setActiveTab('build');
    setShowToast({ type: 'success', message: `${items.length} stop${items.length !== 1 ? 's' : ''} loaded.` });
  };

  const handleLoadTemplate = (tpl) => {
    const items = (tpl.sequence || []).map((stop, index) => ({
      id: `${stop.clientId || 'stop'}-${Date.now()}-${index}`,
      name: stop.name || `Stop ${String.fromCharCode(65 + index)}`,
      address: stop.address || '',
      pu: stop.type === 'PU' ? (stop.address || '') : '',
      do: stop.type === 'DO' ? (stop.address || '') : '',
      time: stop.time || '',
      serviceType: stop.serviceType || '',
      bookingId: stop.bookingId || '',
      phone: stop.phone || '',
      routePlanTripId: stop.clientId || null,
    }));
    const sequence = items.map((item, index) => ({
      clientId: item.id, type: item.do ? 'DO' : 'PU', leg: 'A', stepNumber: index + 1,
    }));
    setSequencerTripFilter(null);
    setRoutePlanSequencerStops(items);
    setRoutePlanSequencerSequence(sequence);
    setRoutePlanSequencerOrigin(null);
    setSequencerKey(k => k + 1);
    setActiveTab('build');
    setShowToast({ type: 'success', message: `"${tpl.name}" loaded with ${items.length} stop${items.length !== 1 ? 's' : ''}.` });
  };

  const handleDeleteTemplate = async (tplId) => {
    if (deletingId) return;
    setDeletingId(tplId);
    try {
      const updated = routeTemplates.filter(t => t.id !== tplId);
      await setDoc(doc(db, SEQUENCES_DOC), { templates: updated }, { merge: true });
      setShowToast({ type: 'success', message: 'Route deleted.' });
    } catch (err) {
      console.error('Delete failed:', err);
      setShowToast({ type: 'error', message: 'Delete failed.' });
    }
    setDeletingId(null);
  };

  const tabs = [
    { id: 'plan', label: 'Plan', icon: Compass },
    { id: 'saved', label: 'Saved', icon: Bookmark },
    { id: 'build', label: 'Route', icon: Route },
    { id: 'navigate', label: 'Nav', icon: Navigation },
  ];

  const activeCount = activeTrips?.length || 0;

  const sortedTemplates = useMemo(() => {
    return [...(routeTemplates || [])].sort((a, b) => {
      const aTime = Date.parse(a.createdAt || 0) || 0;
      const bTime = Date.parse(b.createdAt || 0) || 0;
      return bTime - aTime;
    });
  }, [routeTemplates]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-x-hidden" style={{ background: '#f1f5f9' }}>

      {/* === TOP HEADER === */}
      <div className="shrink-0 bg-white border-b border-slate-200/80 shadow-sm">
        <div className="px-4 pt-3 pb-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-black text-slate-900 tracking-tight">Route Planner</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Plan · Saved · Build · Navigate</p>
            </div>
            {guidedMode && (
              <button onClick={() => { onSetGuidedMode(false); onSetAiSequence(null); onSetAiSuggestions([]); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 rounded-full border border-indigo-100 active:scale-95 transition cursor-pointer">
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-[10px] font-extrabold text-indigo-600">Guided On</span>
                <X size={11} className="text-indigo-400" />
              </button>
            )}
          </div>

          {/* Tab Bar */}
          <div className="flex gap-1">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`relative flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-extrabold rounded-t-xl transition-all cursor-pointer ${
                    isActive
                      ? 'text-indigo-600 bg-slate-50'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50/50'
                  }`}>
                  <Icon size={12} strokeWidth={isActive ? 2.5 : 2} />
                  <span>{tab.label}</span>
                  {tab.id === 'navigate' && activeCount > 0 && (
                    <span className="ml-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 text-white text-[7px] font-bold flex items-center justify-center">{activeCount}</span>
                  )}
                  {tab.id === 'saved' && sortedTemplates.length > 0 && (
                    <span className="ml-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 text-white text-[7px] font-bold flex items-center justify-center">{sortedTemplates.length}</span>
                  )}
                  {isActive && <div className="absolute bottom-0 left-2 right-2 h-[3px] bg-indigo-600 rounded-t-full" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* === CONTENT === */}
      <div className="flex-1 min-h-0 overflow-hidden">

        {/* PLAN TAB */}
        {activeTab === 'plan' && (
          <div className="h-full overflow-y-auto overflow-x-hidden overscroll-contain pb-24 px-3 pt-3">
            {/* AI Quick Actions */}
            {selectedTrips.length >= 1 && (
              <div className="mb-3 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-2xl p-3 shadow-lg shadow-indigo-200/50">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                      <BrainCircuit size={13} className="text-white" />
                    </div>
                    <span className="text-[11px] font-extrabold text-white truncate">{selectedTrips.length} trip{selectedTrips.length !== 1 ? 's' : ''} selected</span>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => onSelectAllTrips()}
                      className="px-2.5 h-7 bg-white/20 text-white rounded-lg text-[10px] font-extrabold active:scale-95 transition cursor-pointer">
                      {selectedTrips.length === activeTrips.length ? 'Deselect' : 'All'}
                    </button>
                    {selectedTrips.length >= 2 && (
                      <button onClick={() => onRunAiOptimization()} disabled={aiOptimizing}
                        className="px-2.5 h-7 bg-white text-indigo-700 rounded-lg text-[10px] font-extrabold flex items-center gap-1 active:scale-95 shadow cursor-pointer">
                        <BrainCircuit size={10} /> {aiOptimizing ? '...' : 'Optimize'}
                      </button>
                    )}
                    <button onClick={() => onSetSelectedTrips([])}
                      className="px-2.5 h-7 bg-white/10 text-white/70 rounded-lg text-[10px] font-extrabold active:scale-95 cursor-pointer">Clear</button>
                  </div>
                </div>
              </div>
            )}

            {/* Smart Route */}
            {aiSequence && aiSequence.length >= 2 && !guidedMode && (
              <div className="mb-3 rounded-2xl overflow-hidden shadow-lg shadow-indigo-900/10" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #2563eb 100%)' }}>
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <BrainCircuit size={14} className="text-white/80" />
                    <span className="text-[10px] font-extrabold text-white/60 uppercase tracking-wider">AI Smart Route</span>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap mb-3">
                    {aiSequence.map((id, i) => {
                      const t = trips.find(t => t.id === id);
                      return (
                        <React.Fragment key={id}>
                          {i > 0 && <span className="text-white/20 text-[10px]">→</span>}
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/15 text-white/90">{t?.patient || id}</span>
                        </React.Fragment>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { onSetGuidedMode(true); onSetGuidedStepIndex(0); onSetAiSuggestions([]); }}
                      className="flex-1 h-9 bg-white text-indigo-700 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1.5 active:scale-[0.98] shadow-lg cursor-pointer">
                      <Play size={12} strokeWidth={2.5} /> Start Route
                    </button>
                    <button onClick={() => { onSetAiSequence(null); onSetAiSuggestions([]); }}
                      className="h-9 px-3 bg-white/15 text-white/70 rounded-xl text-[11px] font-extrabold active:scale-[0.98] cursor-pointer">Dismiss</button>
                  </div>
                </div>
              </div>
            )}

            {/* AI Suggestions */}
            {aiSuggestions.length > 0 && (!aiSequence || aiSequence.length < 2) && (
              <div className="mb-3 bg-indigo-50 border border-indigo-100 rounded-2xl p-3 flex items-start gap-2">
                <BrainCircuit size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  {aiSuggestions.map((s, i) => <p key={i} className="text-[11px] font-semibold text-indigo-600 leading-relaxed">{s}</p>)}
                </div>
                <button onClick={() => onSetAiSuggestions([])} className="text-indigo-300 hover:text-indigo-500 shrink-0 cursor-pointer"><X size={12} /></button>
              </div>
            )}

            {/* Conflicts */}
            {conflicts.length > 0 && (
              <div className="mb-3 bg-amber-50 border border-amber-200/60 rounded-2xl p-3 flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  {conflicts.map((c, i) => <p key={i} className="text-[11px] font-semibold text-amber-700">{c.text || `${c.a} ↔ ${c.b} (${c.gap}m)`}</p>)}
                </div>
              </div>
            )}

            {/* Ride Share */}
            {aiRideShare.length > 0 && (
              <div className="mb-3 bg-emerald-50 border border-emerald-200/60 rounded-2xl p-3 flex items-start gap-2">
                <Repeat size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  {aiRideShare.map((r, i) => <p key={i} className="text-[11px] font-semibold text-emerald-700">{r.text || r}</p>)}
                </div>
              </div>
            )}

            {/* Route Plan Content */}
            <DriverToolsPage
              trips={trips}
              activeTrips={activeTrips}
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
              onRunAiOptimization={onRunAiOptimization}
              onSelectAllTrips={onSelectAllTrips}
              selectedTrips={selectedTrips}
              onSetSelectedTrips={onSetSelectedTrips}
              etas={etas}
              onOpenInNav={onOpenInNav}
              onOpenSequencer={() => setActiveTab('build')}
              requestAuthAction={requestAuthAction}
              routePlanStops={routePlanStops}
              onSetRoutePlanStops={onSetRoutePlanStops}
              onSendToSequencer={handleSendToSequencer}
            />
          </div>
        )}

        {/* SAVED TAB */}
        {activeTab === 'saved' && (
          <div className="h-full overflow-y-auto overflow-x-hidden overscroll-contain pb-24 px-3 pt-3">
            {sortedTemplates.length > 0 ? (
              <div className="space-y-2">
                {sortedTemplates.map((tpl) => {
                  const normalized = normalizeRouteRecord(tpl);
                  const isExpanded = expandedTemplateId === tpl.id;
                  const isToday = tpl.type === 'today';
                  const statusClass = normalized?.statusBadgeClass || ROUTE_STATUS_BADGES[ROUTE_ASSIGNMENT_STATUS.ASSIGNED];
                  const statusLabel = normalized?.statusLabel || 'Template';
                  const driverName = tpl.assignedDriver
                    ? (drivers || []).find(d => d.id === tpl.assignedDriver)?.name || tpl.assignedDriver
                    : null;
                  const createdDate = tpl.createdAt ? new Date(tpl.createdAt) : null;
                  const createdStr = createdDate
                    ? `${createdDate.getMonth() + 1}/${createdDate.getDate()}`
                    : '';
                  return (
                    <div key={tpl.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                      <div className="px-3.5 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-extrabold text-slate-900 truncate">{tpl.name}</p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${statusClass}`}>
                                {statusLabel}
                              </span>
                              {isToday ? (
                                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                                  <Calendar size={8} /> Today
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                                  <Repeat size={8} /> Recurring
                                </span>
                              )}
                              <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                                <MapPin size={8} /> {tpl.sequence?.length || 0} stops
                              </span>
                            </div>
                          </div>
                          <button onClick={() => setExpandedTemplateId(isExpanded ? null : tpl.id)}
                            className="w-7 h-7 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 active:scale-95 transition shrink-0 cursor-pointer">
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        </div>

                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {driverName && (
                            <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md">
                              {driverName}
                            </span>
                          )}
                          {tpl.metrics?.miles > 0 && (
                            <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                              {tpl.metrics.miles} mi
                            </span>
                          )}
                          {tpl.metrics?.estTime && (
                            <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                              <Clock size={8} /> {tpl.metrics.estTime}
                            </span>
                          )}
                          {createdStr && (
                            <span className="text-[9px] font-bold text-slate-400 ml-auto">
                              {createdStr}
                            </span>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-3.5 pb-3 border-t border-slate-100 pt-2.5">
                          {tpl.sequence?.length > 0 && (
                            <div className="mb-3">
                              <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">Route Sequence</p>
                              <div className="space-y-1">
                                {tpl.sequence.map((stop, idx) => (
                                  <div key={idx} className="flex items-center gap-2 text-[10px] min-w-0">
                                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-extrabold flex items-center justify-center shrink-0 text-[8px]">
                                      {idx + 1}
                                    </span>
                                    <span className={`font-bold px-1 rounded ${stop.type === 'PU' ? 'text-emerald-600' : 'text-rose-600'} shrink-0`}>
                                      {stop.type}
                                    </span>
                                    <span className="font-semibold text-slate-700 truncate">{stop.name || 'Unknown'}</span>
                                    {stop.time && <span className="font-semibold text-slate-400 ml-auto shrink-0">{stop.time}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {isToday ? (
                            <p className="text-[10px] font-semibold text-slate-500 mb-3">
                              Date: {tpl.assignmentDate || 'Not assigned'}
                            </p>
                          ) : tpl.days?.length > 0 && (
                            <div className="flex gap-1 mb-3">
                              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => (
                                <span key={day} className={`w-7 h-5 rounded text-[8px] font-extrabold flex items-center justify-center ${
                                  tpl.days.includes(day)
                                    ? 'bg-indigo-100 text-indigo-700'
                                    : 'bg-slate-50 text-slate-300'
                                }`}>
                                  {day.slice(0,2)}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button onClick={() => handleLoadTemplate(tpl)}
                              className="flex-1 h-9 bg-indigo-50 text-indigo-700 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1.5 active:bg-indigo-100 transition border border-indigo-100 cursor-pointer">
                              <FolderOpen size={11} /> Load to Route
                            </button>
                            <button onClick={() => { if (window.confirm(`Delete "${tpl.name}"?`)) handleDeleteTemplate(tpl.id); }}
                              disabled={deletingId === tpl.id}
                              className="h-9 px-3 bg-rose-50 text-rose-600 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1 active:bg-rose-100 transition border border-rose-100 cursor-pointer">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      )}

                      {!isExpanded && (
                        <div className="px-3.5 pb-2.5 flex gap-1.5">
                          <button onClick={() => handleLoadTemplate(tpl)}
                            className="flex-1 h-8 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-1 active:bg-indigo-100 transition cursor-pointer">
                            <FolderOpen size={10} /> Load
                          </button>
                          <button onClick={() => setExpandedTemplateId(tpl.id)}
                            className="h-8 px-2.5 bg-slate-50 text-slate-500 rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-1 active:bg-slate-100 transition cursor-pointer">
                            Details
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center">
                <Bookmark size={24} className="text-slate-200 mx-auto mb-3" />
                <p className="text-[12px] font-bold text-slate-400">No saved plans yet</p>
                <p className="text-[10px] text-slate-300 mt-1">Create a route in the Route tab and save it</p>
              </div>
            )}
          </div>
        )}

        {/* ROUTE BUILDER TAB */}
        {activeTab === 'build' && (
          <div className="h-full overflow-hidden flex flex-col">
            {selectedTrips.length >= 1 && (
              <div className="shrink-0 mx-3 mt-2 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-xl p-2.5 shadow-md shadow-indigo-200/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-extrabold text-white truncate">{selectedTrips.length} selected</span>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => onSelectAllTrips()}
                      className="px-2 h-6 bg-white/20 text-white rounded-lg text-[9px] font-extrabold active:scale-95 cursor-pointer">
                      {selectedTrips.length === activeTrips.length ? 'Deselect' : 'All'}
                    </button>
                    {selectedTrips.length >= 2 && (
                      <button onClick={() => onRunAiOptimization()} disabled={aiOptimizing}
                        className="px-2 h-6 bg-white text-indigo-700 rounded-lg text-[9px] font-extrabold flex items-center gap-1 active:scale-95 cursor-pointer">
                        <BrainCircuit size={9} /> {aiOptimizing ? '...' : 'AI'}
                      </button>
                    )}
                    <button onClick={() => onSetSelectedTrips([])}
                      className="px-2 h-6 bg-white/10 text-white/60 rounded-lg text-[9px] font-extrabold active:scale-95 cursor-pointer">X</button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-hidden">
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

        {/* NAVIGATE TAB */}
        {activeTab === 'navigate' && (
          <div className="h-full overflow-y-auto overflow-x-hidden overscroll-contain pb-24 px-3 pt-3">
            {activeTrips.length > 0 ? (
              <div className="space-y-2">
                {Object.keys(etas).length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-3 mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Timer size={14} className="text-amber-500" />
                      <span className="text-[11px] font-extrabold text-slate-700">Trip ETAs</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {activeTrips.map(trip => {
                        const eta = etas[trip.id];
                        if (eta === undefined) return null;
                        return (
                          <div key={trip.id} className="bg-slate-50 rounded-xl px-2.5 py-1.5 flex items-center justify-between min-w-0">
                            <span className="truncate text-[10px] font-bold text-slate-600">{trip.patient}</span>
                            <span className="text-[10px] font-extrabold text-amber-600 ml-1 shrink-0">{Math.round(eta)}m</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeTrips.map(trip => (
                  <div key={trip.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <div className="px-3.5 py-2.5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-extrabold text-slate-900 truncate">{trip.patient}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {trip.bookingId && <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{trip.bookingId}</span>}
                            {(trip.type || trip.serviceType) && <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{trip.type || trip.serviceType}</span>}
                          </div>
                        </div>
                        <span className="text-[11px] font-bold text-slate-400 shrink-0 ml-2">{trip.time || 'WC'}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button onClick={() => onOpenInNav(trip.pickup)}
                          className="h-9 bg-emerald-50 text-emerald-700 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1.5 active:bg-emerald-100 transition border border-emerald-100 cursor-pointer">
                          <MapPin size={12} /> Pickup
                        </button>
                        <button onClick={() => onOpenInNav(trip.dropoff)}
                          className="h-9 bg-rose-50 text-rose-700 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1.5 active:bg-rose-100 transition border border-rose-100 cursor-pointer">
                          <MapPin size={12} /> Dropoff
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Navigation size={24} className="text-slate-300" />
                </div>
                <p className="text-sm font-bold text-slate-400">No active trips</p>
                <p className="text-xs text-slate-300 mt-1">Start a route to see navigation</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default UnifiedRoutePlanner;
