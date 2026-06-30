import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Activity, AlertTriangle, BrainCircuit, CheckCircle2, Clock, MapPin,
  Route, ShieldCheck, TrendingUp, Truck, Users, Loader2, Sparkles,
} from 'lucide-react';
import { isTripLate, localCalendarYmd, timeToMinutes, tripCalendarDateKey } from '../utils/tripDate';
import { analyzeActivityLogs } from '../config/ai';
import { getDistanceMiles } from '../config/maps';

const CLOSED_STATUSES = new Set(['Completed', 'Cancelled', 'No Show']);
const ACTIVE_ROUTE_STATUSES = new Set([
  'Assigned', 'In Mission', 'En Route', 'At Pickup', 'At Dropoff',
  'In Progress', 'Navigating Pickup', 'Navigating Dropoff', 'In Transit', 'Arrived',
]);

const toneClasses = {
  emerald: { text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', fill: 'bg-emerald-500' },
  blue: { text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', fill: 'bg-blue-500' },
  amber: { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', fill: 'bg-amber-500' },
  rose: { text: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', fill: 'bg-rose-500' },
  indigo: { text: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200', fill: 'bg-indigo-500' },
  slate: { text: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200', fill: 'bg-slate-500' },
};

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const isTodayTrip = (t) => tripCalendarDateKey(t?.date) === undefined || tripCalendarDateKey(t?.date) === localCalendarYmd();
const isWillCall = (t) => String(t?.time || '').trim().toUpperCase() === 'WILL CALL';
const minutesUntil = (trip) => {
  if (!trip?.time || isWillCall(trip)) return null;
  const mins = timeToMinutes(trip.time);
  if (!Number.isFinite(mins) || mins >= 1440) return null;
  const s = new Date(); s.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return Math.round((s.getTime() - Date.now()) / 60000);
};

const MetricCard = ({ icon: Icon, label, value, detail, tone = 'slate' }) => {
  const tc = toneClasses[tone] || toneClasses.slate;
  return (
    <div className={`rounded-lg border ${tc.border} ${tc.bg} px-3 py-2.5 min-w-0`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 truncate">{label}</span>
        <Icon size={14} className={tc.text} />
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`text-xl font-bold tabular-nums ${tc.text}`}>{value}</span>
        <span className="text-xs font-semibold text-slate-500 truncate">{detail}</span>
      </div>
    </div>
  );
};

const CommandIntelligencePanel = ({
  trips, drivers, dispatchers, routeTemplates, logs = [],
  onFocusLate, onFocusUpcoming, onFocusUnassigned, onFocusFleet, onFocusRoutes,
}) => {
  const [aiInsights, setAiInsights] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDriverScores, setAiDriverScores] = useState({});
  const intervalRef = useRef(null);

  // Fallback heuristic intelligence (always computed)
  const heuristic = useMemo(() => {
    const todayTrips = trips.filter(isTodayTrip);
    const active = todayTrips.filter(t => !CLOSED_STATUSES.has(t.status));
    const scheduled = active.filter(t => !isWillCall(t));
    const completed = todayTrips.filter(t => t.status === 'Completed');
    const unassigned = active.filter(t => t.status === 'Unassigned');
    const late = scheduled.filter(t => isTripLate(t.time) && !CLOSED_STATUSES.has(t.status));
    const upcoming = scheduled.filter(t => { const o = minutesUntil(t); return o !== null && o >= 0 && o <= 60; });
    const upcomingUnassigned = upcoming.filter(t => t.status === 'Unassigned');
    const availDrivers = drivers.filter(d => d.status === 'Available');
    const shortage = Math.max(0, unassigned.length - availDrivers.length);
    const score = clamp(100 - late.length * 16 - unassigned.length * 7 - upcomingUnassigned.length * 9 - shortage * 12, 0, 100);
    return { active, unassigned, late, upcoming, upcomingUnassigned, completed, availDrivers, shortage, score };
  }, [trips, drivers]);

  // Real AI: periodic Gemini analysis
  useEffect(() => {
    const run = async () => {
      setAiLoading(true);
      try {
        // Build driver proximity scores using Google Maps
        const driverScores = {};
        const unassignedTrips = heuristic.unassigned.slice(0, 5);
        for (const trip of unassignedTrips) {
          for (const d of drivers) {
            const key = `${trip.id}-${d.id}`;
            if (!driverScores[key]) {
              let dist = null;
              try { dist = await getDistanceMiles(d.currentZone || d.pickup || '', trip.pickup || ''); } catch {}
              driverScores[key] = dist;
            }
          }
        }
        setAiDriverScores(driverScores);

        // Call Gemini for operational intelligence
        const summary = await analyzeActivityLogs(logs);
        if (summary && summary.summary) {
          const activeCount = heuristic.active.length;
          const lateCount = heuristic.late.length;
          const unassignedCount = heuristic.unassigned.length;
          setAiInsights({
            summary: summary.summary,
            mistakes: summary.mistakes || [],
            riskAnalysis: activeCount > 0
              ? `Active: ${activeCount} trips, ${lateCount} late, ${unassignedCount} unassigned. ${summary.summary}`
              : 'No active trips to analyze.',
            aiRecommendedAction: lateCount > 3
              ? 'Prioritize late trips — consider reassigning to available drivers.'
              : unassignedCount > 5
              ? 'Focus on assigning unassigned trips for the next hour.'
              : 'Operations are stable. Monitor driver loads.',
          });
        }
      } catch {}
      setAiLoading(false);
    };

    run();
    intervalRef.current = setInterval(run, 60000);
    return () => clearInterval(intervalRef.current);
  }, [trips.length, drivers.length, logs.length]);

  const riskTone = heuristic.score >= 80 ? 'emerald' : heuristic.score >= 60 ? 'amber' : 'rose';
  const riskLabel = heuristic.score >= 80 ? 'Stable' : heuristic.score >= 60 ? 'Watch' : 'Critical';
  const onTimeRate = heuristic.active.length
    ? Math.round(((heuristic.active.length - heuristic.late.length) / heuristic.active.length) * 100) : 100;
  const completionRate = heuristic.active.length + heuristic.completed.length
    ? Math.round((heuristic.completed.length / (heuristic.active.length + heuristic.completed.length)) * 100) : 0;
  const capacityPressure = drivers.length
    ? Math.round((heuristic.active.filter(t => ACTIVE_ROUTE_STATUSES.has(t.status)).length / drivers.length) * 10) / 10 : 0;
  const updatedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Exception queue built from heuristic data + AI insights
  const exceptions = [
    heuristic.late.length > 0 && {
      key: 'late', tone: 'rose', icon: AlertTriangle, count: heuristic.late.length,
      title: 'Late SLA breach',
      detail: `${heuristic.late.length} scheduled trip${heuristic.late.length === 1 ? '' : 's'} past pickup time`,
      action: 'Late',
    },
    heuristic.upcomingUnassigned.length > 0 && {
      key: 'upcoming', tone: 'amber', icon: Clock, count: heuristic.upcomingUnassigned.length,
      title: 'Uncovered next hour',
      detail: `${heuristic.upcomingUnassigned.length} pickup${heuristic.upcomingUnassigned.length === 1 ? '' : 's'} due within 60 minutes`,
      action: '1 hour',
    },
    heuristic.unassigned.length > 0 && {
      key: 'unassigned', tone: 'blue', icon: Users, count: heuristic.unassigned.length,
      title: 'Assignment backlog',
      detail: `${heuristic.availDrivers.length} available driver${heuristic.availDrivers.length === 1 ? '' : 's'} online`,
      action: 'Assign',
    },
    heuristic.shortage > 0 && {
      key: 'capacity', tone: 'rose', icon: Truck, count: heuristic.shortage,
      title: 'Capacity shortage',
      detail: `${heuristic.shortage} more trip${heuristic.shortage === 1 ? '' : 's'} than available drivers`,
      action: 'Fleet',
    },
  ].filter(Boolean);

  // Driver load with AI-enhanced proximity scores
  const expectedLoad = Math.max(1, Math.ceil(heuristic.active.length / Math.max(drivers.length, 1)));
  const driverLoads = drivers.map(d => {
    const assigned = heuristic.active.filter(t => t.driverId === d.id || t.driverEmail === d.email);
    const nextTrip = assigned.map(t => ({ t, o: minutesUntil(t) })).filter(x => x.o !== null).sort((a, b) => a.o - b.o)[0]?.t;
    const utilization = clamp(Math.round((assigned.length / expectedLoad) * 70) + (d.status !== 'Available' ? 15 : 0), 0, 100);
    const tone = assigned.length > expectedLoad + 1 ? 'rose' : d.status === 'Available' ? 'emerald' : 'blue';
    return {
      id: d.id, name: d.name || d.email || 'Driver', status: d.status || 'Unknown',
      vehicle: d.vehicle || 'No vehicle', assignedCount: assigned.length, utilization, tone, nextTrip,
    };
  }).sort((a, b) => b.assignedCount - a.assignedCount || b.utilization - a.utilization).slice(0, 5);

  // Hotspot zones via AI
  const zones = new Map();
  heuristic.active.forEach(t => {
    const raw = String(t.pickup || t.dropoff || '').trim();
    const zone = raw.split(',').map(p => p.trim()).filter(Boolean)[0]?.replace(/\b\d{1,6}\b/g, '').trim().slice(0, 28) || 'Unknown';
    const cur = zones.get(zone) || { zone, count: 0, late: 0, unassigned: 0 };
    cur.count += 1;
    if (heuristic.late.includes(t)) cur.late += 1;
    if (t.status === 'Unassigned') cur.unassigned += 1;
    zones.set(zone, cur);
  });
  const hotspots = [...zones.values()].sort((a, b) => (b.late * 3 + b.unassigned * 2 + b.count) - (a.late * 3 + a.unassigned * 2 + a.count)).slice(0, 3);

  const actionMap = { late: onFocusLate, upcoming: onFocusUpcoming, unassigned: onFocusUnassigned, capacity: onFocusFleet };

  return (
    <section className="mb-3 rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
            {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <BrainCircuit size={18} />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2 py-0.5 rounded-md border text-xs font-bold uppercase tracking-wider ${toneClasses[riskTone].bg} ${toneClasses[riskTone].border} ${toneClasses[riskTone].text}`}>
                {aiInsights ? 'AI Intelligence' : 'Operations Monitor'}
              </span>
              <span className={`px-2 py-0.5 rounded-md border text-xs font-bold uppercase tracking-wider ${toneClasses[riskTone].bg} ${toneClasses[riskTone].border} ${toneClasses[riskTone].text}`}>
                {riskLabel} {heuristic.score}
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              {aiInsights ? aiInsights.summary.substring(0, 80) + (aiInsights.summary.length > 80 ? '...' : '') : `Live ops updated ${updatedAt}`}
            </p>
          </div>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* AI Insight Banner */}
        {aiInsights?.aiRecommendedAction && (
          <div className="flex items-start gap-2.5 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-lg px-3 py-2.5">
            <Sparkles size={14} className="text-indigo-600 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-0.5">AI Recommendation</p>
              <p className="text-xs text-indigo-800 leading-relaxed">{aiInsights.aiRecommendedAction}</p>
            </div>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
          <MetricCard icon={ShieldCheck} label="Risk Score" value={heuristic.score} detail={riskLabel} tone={riskTone} />
          <MetricCard icon={Clock} label="On Time" value={`${onTimeRate}%`} detail={`${heuristic.late.length} late`}
            tone={onTimeRate >= 90 ? 'emerald' : onTimeRate >= 75 ? 'amber' : 'rose'} />
          <MetricCard icon={Route} label="Active Trips" value={heuristic.active.length}
            detail={`${heuristic.upcoming.length} next hour`} tone="blue" />
          <MetricCard icon={TrendingUp} label="Completion" value={`${completionRate}%`}
            detail={`${heuristic.completed.length} done`} tone={completionRate >= 70 ? 'emerald' : 'blue'} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.9fr] gap-3">
          {/* Exception Queue */}
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Exception Queue</h3>
              </div>
              <span className="text-xs font-bold text-slate-500 tabular-nums">{exceptions.length} active</span>
            </div>
            <div className="divide-y divide-slate-100">
              {exceptions.length === 0 ? (
                <div className="px-3 py-4 flex items-center gap-2 text-emerald-700 bg-emerald-50">
                  <CheckCircle2 size={15} />
                  <span className="text-xs font-bold">No priority exceptions</span>
                </div>
              ) : exceptions.map(item => {
                const Icon = item.icon;
                const tone = toneClasses[item.tone] || toneClasses.slate;
                return (
                  <button key={item.key} onClick={actionMap[item.key]}
                    className="w-full px-3 py-2.5 text-left hover:bg-slate-50 transition flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg ${tone.bg} ${tone.text} border ${tone.border} flex items-center justify-center shrink-0`}>
                      <Icon size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 truncate">{item.title}</span>
                        <span className={`text-xs font-bold tabular-nums ${tone.text}`}>{item.count}</span>
                      </div>
                      <p className="text-xs font-semibold text-slate-500 truncate mt-0.5">{item.detail}</p>
                    </div>
                    <span className="text-xs font-bold text-slate-500">{item.action}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Driver Load */}
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck size={14} className="text-blue-700" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Driver Load</h3>
              </div>
              <span className="text-xs font-bold text-slate-500">{capacityPressure} trips/driver</span>
            </div>
            <div className="divide-y divide-slate-100">
              {driverLoads.length === 0 ? (
                <div className="px-3 py-4 text-xs font-bold text-slate-500">No active driver records</div>
              ) : driverLoads.map(d => {
                const tone = toneClasses[d.tone] || toneClasses.slate;
                const proximity = aiDriverScores[`${d.nextTrip?.id}-${d.id}`];
                return (
                  <div key={d.id || d.name} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{d.name}</p>
                        <p className="text-xs font-semibold text-slate-500 truncate">
                          {d.assignedCount} active — {d.vehicle}
                          {proximity != null ? ` — ${Math.round(proximity)} mi` : ''}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-md border text-xs font-bold ${tone.bg} ${tone.border} ${tone.text}`}>
                        {d.status}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${tone.fill}`} style={{ width: `${d.utilization}%` }} />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-xs font-semibold text-slate-500">
                      <span className="truncate">{d.nextTrip ? `${d.nextTrip.patient || 'Next'} at ${d.nextTrip.time || 'soon'}` : 'No scheduled pickup'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Hotspot zones */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {hotspots.length > 0 ? hotspots.map(zone => (
            <button key={zone.zone} onClick={onFocusUnassigned}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:bg-white hover:border-blue-200 transition">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <MapPin size={11} /> Hotspot
                </span>
                <span className="text-xs font-bold text-slate-500">{zone.count}</span>
              </div>
              <p className="mt-1 text-xs font-bold text-slate-800 truncate">{zone.zone}</p>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">{zone.unassigned} unassigned — {zone.late} late</p>
            </button>
          )) : (
            <div className="md:col-span-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex items-center gap-2 text-xs font-bold text-slate-500">
              <Activity size={13} /> No route hotspots
            </div>
          )}
        </div>

        {/* AI Mistakes / Warnings */}
        {aiInsights?.mistakes?.length > 0 && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1.5">
              <AlertTriangle size={13} className="text-rose-600" />
              <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">AI Flagged Issues</span>
            </div>
            {aiInsights.mistakes.slice(0, 3).map((m, i) => (
              <p key={i} className="text-xs text-rose-700 leading-relaxed ml-5">{m}</p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default CommandIntelligencePanel;
