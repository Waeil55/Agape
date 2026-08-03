import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BrainCircuit, Sparkles, Activity, AlertTriangle, CheckCircle2, RefreshCw,
  Zap, Users, Truck, DollarSign, FileText, ChevronRight, ShieldAlert,
  Clock, ArrowUpRight, Filter, Info, ChevronDown, Check, X
} from 'lucide-react';
import { analyzeFleetCommand } from '../config/ai';
import { localCalendarYmd, tripCalendarDateKey, isTripLate } from '../utils/tripDate';

export default function AgapeCommandCenter({
  trips = [],
  drivers = [],
  vehicles = [],
  dispatchers = [],
  welltransLogs = [],
  onNavigateTab,
  onOpenWellTrans,
  onAssignTrips,
  onFilterLate,
  onClose,
}) {
  const [activeTab, setActiveTab] = useState('summary');
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const todayStr = useMemo(() => localCalendarYmd(), []);

  const todayTrips = useMemo(() => {
    return trips.filter(t => tripCalendarDateKey(t.date) === todayStr);
  }, [trips, todayStr]);

  const activeTrips = useMemo(() => {
    return todayTrips.filter(t => !['Completed', 'Cancelled', 'No Show'].includes(t.status));
  }, [todayTrips]);

  const completedTrips = useMemo(() => {
    return todayTrips.filter(t => t.status === 'Completed');
  }, [todayTrips]);

  const unassignedTrips = useMemo(() => {
    return activeTrips.filter(t => !t.driverId || t.status === 'Unassigned');
  }, [activeTrips]);

  const lateTrips = useMemo(() => {
    return activeTrips.filter(t => isTripLate(t.time));
  }, [activeTrips]);

  const unsyncedBillingTrips = useMemo(() => {
    return trips.filter(t => t.status === 'Completed' && !t.welltransSynced && !t.syncedToWellTrans);
  }, [trips]);

  // Aggregate fleet state
  const fleetContext = useMemo(() => ({
    todayTrips,
    activeTrips,
    lateTrips,
    unassignedTrips,
    completedTrips,
    drivers,
    vehicles,
    unsyncedBillingCount: unsyncedBillingTrips.length,
    oldestUnsyncedDate: unsyncedBillingTrips[0]?.date || null,
  }), [todayTrips, activeTrips, lateTrips, unassignedTrips, completedTrips, drivers, vehicles, unsyncedBillingTrips]);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await analyzeFleetCommand(fleetContext);
      setInsights(res);
      setLastRefreshed(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error('[AgapeCommandCenter] Analysis failed:', err);
    } finally {
      setLoading(false);
    }
  }, [fleetContext]);

  useEffect(() => {
    runAnalysis();
  }, []);

  // Health Score Calculation
  const healthScore = useMemo(() => {
    if (todayTrips.length === 0) return 100;
    let score = 100;
    score -= lateTrips.length * 15;
    score -= unassignedTrips.length * 10;
    score -= Math.min(30, unsyncedBillingTrips.length * 2);
    return Math.max(0, Math.min(100, Math.round(score)));
  }, [todayTrips.length, lateTrips.length, unassignedTrips.length, unsyncedBillingTrips.length]);

  const healthColor = healthScore >= 80 ? 'text-emerald-600 bg-emerald-50 border-emerald-200' :
                     healthScore >= 50 ? 'text-amber-600 bg-amber-50 border-amber-200' :
                                         'text-rose-600 bg-rose-50 border-rose-200';

  const tabs = [
    { id: 'summary', label: 'Summary', icon: Activity },
    { id: 'decisions', label: 'Decisions', icon: Zap, badge: (insights?.decisions?.length || 0) },
    { id: 'trips', label: 'Trips', icon: Clock, badge: lateTrips.length + unassignedTrips.length },
    { id: 'drivers', label: 'Drivers', icon: Users },
    { id: 'billing', label: 'Billing', icon: DollarSign, badge: unsyncedBillingTrips.length },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 border-l border-slate-800 shadow-2xl overflow-hidden select-none">
      {/* Header Bar */}
      <div className="p-4 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <BrainCircuit size={18} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight text-white">Agape AI Command Center</h2>
              {insights?.aiEnhanced && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  <Sparkles size={9} /> Gemini 2.0
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              {lastRefreshed ? `Updated ${lastRefreshed}` : 'Initializing intelligence...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 transition border border-slate-700 disabled:opacity-50"
            title="Refresh Fleet AI Analysis"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-indigo-400' : ''} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white transition border border-slate-700"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-950/40 p-1 shrink-0 gap-1 overflow-x-auto no-scrollbar">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[70px] py-2 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all relative ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Icon size={13} />
              <span>{tab.label}</span>
              {Boolean(tab.badge) && tab.badge > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black leading-tight ${
                  isActive ? 'bg-white text-indigo-600' : 'bg-slate-800 text-indigo-400 border border-indigo-500/30'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Body Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-medium">

        {/* ================= SUMMARY TAB ================= */}
        {activeTab === 'summary' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Fleet Health Meter */}
            <div className="p-3.5 rounded-2xl bg-slate-850/60 border border-slate-800 flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl border flex flex-col items-center justify-center shrink-0 ${healthColor}`}>
                <span className="text-xl font-black leading-none">{healthScore}</span>
                <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5 opacity-80">Health</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white">Operational Readiness</span>
                  <span className="text-[10px] text-slate-400 font-semibold">{completedTrips.length}/{todayTrips.length} Done</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700/50">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-500"
                    style={{ width: `${todayTrips.length > 0 ? (completedTrips.length / todayTrips.length) * 100 : 100}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-2 line-clamp-2">
                  {insights?.narrative || 'Analyzing fleet status...'}
                </p>
              </div>
            </div>

            {/* Live Metrics Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Late Trips</div>
                <div className={`text-lg font-black mt-0.5 ${lateTrips.length > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                  {lateTrips.length}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Unassigned</div>
                <div className={`text-lg font-black mt-0.5 ${unassignedTrips.length > 0 ? 'text-amber-400' : 'text-slate-200'}`}>
                  {unassignedTrips.length}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Drivers</div>
                <div className="text-lg font-black text-emerald-400 mt-0.5">
                  {drivers.filter(d => d.status === 'Available' || ['En Route', 'In Mission'].includes(d.status)).length} / {drivers.length}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pending Billing</div>
                <div className={`text-lg font-black mt-0.5 ${unsyncedBillingTrips.length > 0 ? 'text-indigo-400' : 'text-slate-200'}`}>
                  {unsyncedBillingTrips.length}
                </div>
              </div>
            </div>

            {/* AI Risks Section */}
            {insights?.risks?.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Operational Risks</div>
                {insights.risks.map(risk => (
                  <div key={risk.id} className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300">
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <ShieldAlert size={14} className="text-rose-400 shrink-0" />
                      <span>{risk.title}</span>
                    </div>
                    <p className="text-[11px] text-rose-200/80 mt-1">{risk.description}</p>
                  </div>
                ))}
              </div>
            )}

            {/* AI Recommendations */}
            {insights?.recommendations?.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">AI Recommendations</div>
                {insights.recommendations.map(rec => (
                  <div key={rec.id} className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Sparkles size={14} className="text-indigo-400 shrink-0" />
                      <span>{rec.title}</span>
                    </div>
                    <p className="text-[11px] text-indigo-200/80 mt-1">{rec.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= DECISIONS TAB ================= */}
        {activeTab === 'decisions' && (
          <div className="space-y-3 animate-in fade-in duration-200">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Prioritized Decision Queue</span>
              <span className="text-indigo-400">{insights?.decisions?.length || 0} Actions</span>
            </div>

            {(!insights?.decisions || insights.decisions.length === 0) ? (
              <div className="p-6 text-center rounded-2xl bg-slate-850/40 border border-slate-800 text-slate-400">
                <CheckCircle2 size={24} className="mx-auto text-emerald-400 mb-2 opacity-80" />
                <p className="text-xs font-bold text-white">No Urgent Decisions Pending</p>
                <p className="text-[11px] mt-1 text-slate-400">Fleet is operating smoothly without critical bottlenecks.</p>
              </div>
            ) : (
              insights.decisions.map(d => {
                const isUrgent = d.type === 'urgent';
                const isWarning = d.type === 'warning';
                const badgeColor = isUrgent ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
                                   isWarning ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                                               'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
                return (
                  <div key={d.id} className="p-3.5 rounded-2xl bg-slate-850/60 border border-slate-800 space-y-2 hover:border-slate-700 transition">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${badgeColor}`}>
                        {d.type}
                      </span>
                      {d.count > 0 && (
                        <span className="text-[10px] font-bold text-slate-400">{d.count} affected</span>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">{d.title}</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{d.description}</p>
                    </div>

                    {/* Direct Handler Actions */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-end gap-2">
                      {d.id === 'd-late' && onFilterLate && (
                        <button
                          onClick={onFilterLate}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] transition flex items-center gap-1 shadow-sm"
                        >
                          View Late Trips <ArrowUpRight size={12} />
                        </button>
                      )}
                      {d.id === 'd-unassigned' && onAssignTrips && (
                        <button
                          onClick={onAssignTrips}
                          className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] transition flex items-center gap-1 shadow-sm"
                        >
                          Auto-Assign Drivers <ArrowUpRight size={12} />
                        </button>
                      )}
                      {d.id === 'd-billing' && onOpenWellTrans && (
                        <button
                          onClick={onOpenWellTrans}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] transition flex items-center gap-1 shadow-sm"
                        >
                          Open WellTrans Sync <ArrowUpRight size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ================= TRIPS TAB ================= */}
        {activeTab === 'trips' && (
          <div className="space-y-3 animate-in fade-in duration-200">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Today's Operational Breakdown</div>

            {/* Late Trips List */}
            {lateTrips.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-rose-400 uppercase">Late Trips ({lateTrips.length})</div>
                {lateTrips.slice(0, 5).map(t => (
                  <div key={t.id} className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white text-xs">{t.patient || 'Patient'}</div>
                      <div className="text-[10px] text-rose-300">{t.time} scheduled • Pickup: {t.pickup || 'N/A'}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      LATE
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Unassigned Trips List */}
            {unassignedTrips.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-amber-400 uppercase">Unassigned Trips ({unassignedTrips.length})</div>
                {unassignedTrips.slice(0, 5).map(t => (
                  <div key={t.id} className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white text-xs">{t.patient || 'Patient'}</div>
                      <div className="text-[10px] text-amber-300">{t.time || 'Will Call'} • {t.pickup || 'N/A'}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      UNASSIGNED
                    </span>
                  </div>
                ))}
              </div>
            )}

            {lateTrips.length === 0 && unassignedTrips.length === 0 && (
              <div className="p-6 text-center rounded-2xl bg-slate-850/40 border border-slate-800 text-slate-400">
                <CheckCircle2 size={24} className="mx-auto text-emerald-400 mb-2 opacity-80" />
                <p className="text-xs font-bold text-white">All Trips Assigned & On Time</p>
                <p className="text-[11px] mt-1 text-slate-400">{completedTrips.length} completed out of {todayTrips.length} total today.</p>
              </div>
            )}
          </div>
        )}

        {/* ================= DRIVERS TAB ================= */}
        {activeTab === 'drivers' && (
          <div className="space-y-3 animate-in fade-in duration-200">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Fleet Driver Roster</div>
            <div className="space-y-1.5">
              {drivers.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-xs">No driver records loaded</div>
              ) : (
                drivers.map(d => {
                  const isAvailable = d.status === 'Available';
                  const isBusy = ['En Route', 'In Mission', 'In Progress', 'At Pickup', 'At Dropoff'].includes(d.status);
                  const statusColor = isAvailable ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                                      isBusy ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' :
                                               'text-slate-400 bg-slate-800 border-slate-700';
                  return (
                    <div key={d.id} className="p-2.5 rounded-xl bg-slate-850/60 border border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-white text-xs">{d.name}</div>
                        <div className="text-[10px] text-slate-400">{d.vehicle || 'No vehicle assigned'}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusColor}`}>
                        {d.status || 'Offline'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ================= BILLING TAB ================= */}
        {activeTab === 'billing' && (
          <div className="space-y-3 animate-in fade-in duration-200">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">WellTrans Billing Intelligence</div>

            <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Unsubmitted Completed Trips</span>
                <span className="text-base font-black text-indigo-400">{unsyncedBillingTrips.length}</span>
              </div>
              <p className="text-[11px] text-indigo-300/80">
                Completed Agape trips that are awaiting automated reconciliation or submission to the WellTrans portal.
              </p>
              {onOpenWellTrans && (
                <button
                  onClick={onOpenWellTrans}
                  className="w-full mt-2 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20"
                >
                  <DollarSign size={14} /> Launch WellTrans Portal Sync
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
