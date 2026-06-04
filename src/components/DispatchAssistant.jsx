import React, { useState, useEffect } from 'react';
import { tripMatchesCalendarDay } from '../utils/tripDate';
import { Clock, MapPin, Truck, BrainCircuit, X, Zap, AlertCircle, UserCheck, CheckCircle2 } from 'lucide-react';
import { suggestOptimalDriver, getDriverScheduleStatus, getScheduleBlocks } from '../config/ai';

const HOURS_START = 6 * 60;
const HOURS_END = 20 * 60;
const TOTAL_MINUTES = HOURS_END - HOURS_START;

const Badge = ({ children, variant = 'info' }) => {
  const variants = {
    success: "bg-emerald-50 text-emerald-700 border-emerald-100",
    warning: "bg-amber-50 text-amber-700 border-amber-100",
    info: "bg-blue-50 text-blue-700 border-blue-100",
    danger: "bg-rose-50 text-rose-700 border-rose-100",
    ai: "bg-indigo-50 text-indigo-700 border-indigo-100",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-black border uppercase tracking-widest whitespace-nowrap ${variants[variant]}`}>{children}</span>;
};

const ScheduleBar = ({ schedule, currentMinutes }) => {
  if (!schedule || schedule.length === 0) return <div className="h-4 bg-slate-100 rounded text-xs text-slate-400 flex items-center px-2">No schedule</div>;

  const blocks = getScheduleBlocks(schedule);
  if (blocks.length === 0) return <div className="h-4 bg-slate-100 rounded text-xs text-slate-400 flex items-center px-2">No schedule</div>;

  const currentPos = Math.max(0, Math.min(100, ((currentMinutes - HOURS_START) / TOTAL_MINUTES) * 100));

  return (
    <div className="relative h-6 bg-slate-100 rounded-lg overflow-hidden mt-1">
      {blocks.map((block, idx) => {
        const left = Math.max(0, ((block.startMin - HOURS_START) / TOTAL_MINUTES) * 100);
        const width = Math.max(1, Math.min(100 - left, ((block.endMin - block.startMin) / TOTAL_MINUTES) * 100));
        return (
          <div key={idx}
            className={`absolute top-0 h-full ${block.isFree ? 'bg-emerald-300' : 'bg-slate-300'}`}
            style={{ left: `${left}%`, width: `${width}%` }}
            title={`${block.start} - ${block.end} (${block.label})`}
          />
        );
      })}
      {/* Current time line */}
      <div className="absolute top-0 h-full w-0.5 bg-rose-500 shadow-sm z-10" style={{ left: `${currentPos}%` }} />
      {/* Hour markers */}
      {[6, 8, 10, 12, 14, 16, 18, 20].map(h => {
        const pos = ((h * 60 - HOURS_START) / TOTAL_MINUTES) * 100;
        return (
          <div key={h} className="absolute top-0 h-full border-l border-white/40" style={{ left: `${pos}%` }}>
            <span className="text-xs text-slate-400 absolute -bottom-3.5 -translate-x-1/2 font-mono">{h > 12 ? h - 12 : h}{h >= 12 ? 'p' : 'a'}</span>
          </div>
        );
      })}
    </div>
  );
};

const DispatchAssistant = ({ drivers = [], trips = [], onAssignTrip, addAuditLog = () => {}, currentUser = '' }) => {
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const today = getTodayStr();
  const [manifestDate, setManifestDate] = useState(today);

  const [currentMinutes, setCurrentMinutes] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [aiDriverId, setAiDriverId] = useState(null);

  // Refresh schedule status once a minute; Firestore handles live data changes.
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setCurrentMinutes(n.getHours() * 60 + n.getMinutes());
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Re-check schedule status when the minute changes.
  const driversWithStatus = drivers.map(d => ({
    ...d,
    liveStatus: getDriverScheduleStatus(d),
  }));

  const unassignedTrips = trips.filter(t => t.status === 'Unassigned' && tripMatchesCalendarDay(t.date, manifestDate));
  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const handleTripSelect = async (trip) => {
    setSelectedTrip(trip);
    setAiSuggestion(null);
    setAiLoading(true);
    const result = await suggestOptimalDriver(trip, drivers, trips);
    setAiLoading(false);
    if (result) {
      setAiSuggestion(result);
      setAiDriverId(result.driverId);
    } else {
      setAiSuggestion({ driverId: null, score: 0, reason: 'AI suggestion unavailable. Check driver schedules.' });
      setAiDriverId(null);
    }
  };

  const handleAssign = () => {
    if (selectedTrip && aiDriverId && onAssignTrip) {
      onAssignTrip(selectedTrip.id, aiDriverId);
      const driver = drivers.find(d => d.id === aiDriverId);
      addAuditLog('AI Dispatch Assist', `${currentUser} assigned ${selectedTrip.patient} to ${driver?.name || aiDriverId} via Dispatch Assistant.`, 'indigo');
      setSelectedTrip(null);
      setAiSuggestion(null);
      setAiDriverId(null);
    }
  };

  const isNowInRange = (startMin, endMin) => currentMinutes >= startMin && currentMinutes < endMin;

  // --- AI Operations Insights ---
  const getInsights = () => {
    let conflicts = [];
    let latePickups = [];
    let idleDrivers = 0;
    
    // Check late pickups
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    
    trips.forEach(t => {
      if (t.date !== manifestDate || ['Completed', 'Cancelled', 'No Show', 'At Dropoff'].includes(t.status)) return;
      const match = t.time?.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (match) {
        let h = parseInt(match[1]);
        if (match[3].toUpperCase() === 'PM' && h !== 12) h += 12;
        if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
        const tripMin = h * 60 + parseInt(match[2]);
        if (currentMins > tripMin + 15) {
          latePickups.push(t);
        }
      }
    });

    // Check idle drivers
    driversWithStatus.forEach(d => {
      if (d.clockedIn && d.liveStatus?.status === 'free') {
        idleDrivers++;
      }
    });

    // Conflict detection (simplified: multiple assigned trips within 30 mins)
    const driverTrips = {};
    trips.filter(t => t.date === manifestDate && t.status === 'Assigned' && t.driverId).forEach(t => {
      if (!driverTrips[t.driverId]) driverTrips[t.driverId] = [];
      const match = t.time?.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (match) {
        let h = parseInt(match[1]);
        if (match[3].toUpperCase() === 'PM' && h !== 12) h += 12;
        if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
        driverTrips[t.driverId].push({ ...t, mins: h * 60 + parseInt(match[2]) });
      }
    });
    
    Object.keys(driverTrips).forEach(dId => {
      const dts = driverTrips[dId].sort((a,b) => a.mins - b.mins);
      for (let i = 0; i < dts.length - 1; i++) {
        if (dts[i+1].mins - dts[i].mins < 30) {
          conflicts.push({ driverId: dId, trip1: dts[i], trip2: dts[i+1] });
        }
      }
    });

    return { latePickups, idleDrivers, conflicts };
  };

  const insights = getInsights();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white space-y-4 md:space-y-6">
      {/* Mobile-First: Live Dispatch Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-100 px-4 py-3 md:rounded-b-2xl md:border-slate-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
            <Zap size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg md:text-2xl font-black text-slate-900 leading-tight">Dispatch Assistant</h2>
            <p className="text-xs text-slate-500 font-semibold flex items-center gap-1 mt-0.5 flex-wrap">
              <Clock size={10} className="shrink-0" /> {nowStr}
              {manifestDate === today && (
                <>
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          <div className="bg-blue-50 rounded-lg p-2 md:p-3 text-center border border-blue-100">
            <p className="text-xs md:text-sm font-black text-blue-900">{drivers.length}</p>
            <p className="text-[10px] md:text-xs text-blue-700 font-semibold">Drivers</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-2 md:p-3 text-center border border-amber-100">
            <p className="text-xs md:text-sm font-black text-amber-900">{unassignedTrips.length}</p>
            <p className="text-[10px] md:text-xs text-amber-700 font-semibold">Unassigned</p>
          </div>
          <div className="bg-emerald-50 rounded-lg p-2 md:p-3 text-center border border-emerald-100">
            <p className="text-xs md:text-sm font-black text-emerald-900">{insights.idleDrivers}</p>
            <p className="text-[10px] md:text-xs text-emerald-700 font-semibold">Available</p>
          </div>
        </div>
      </div>

      {/* AI Operations Insights - Mobile Responsive */}
      {(insights.latePickups.length > 0 || insights.conflicts.length > 0 || insights.idleDrivers > 0) && (
        <div className="px-4 md:px-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {insights.latePickups.length > 0 && (
              <div className="bg-gradient-to-br from-rose-50 to-rose-100/30 rounded-2xl border border-rose-200 p-4 flex gap-3 shadow-sm hover:shadow-md transition">
                <div className="p-2.5 bg-rose-600/10 text-rose-600 rounded-xl shrink-0"><AlertCircle size={20} /></div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-rose-700 uppercase tracking-wider">Late Pickups</p>
                  <p className="text-2xl font-black text-rose-900 mt-1">{insights.latePickups.length}</p>
                  <p className="text-xs text-rose-700 font-medium mt-1">Over 15 min behind schedule</p>
                </div>
              </div>
            )}
            {insights.conflicts.length > 0 && (
              <div className="bg-gradient-to-br from-amber-50 to-amber-100/30 rounded-2xl border border-amber-200 p-4 flex gap-3 shadow-sm hover:shadow-md transition">
                <div className="p-2.5 bg-amber-600/10 text-amber-600 rounded-xl shrink-0"><Clock size={20} /></div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">Conflicts</p>
                  <p className="text-2xl font-black text-amber-900 mt-1">{insights.conflicts.length}</p>
                  <p className="text-xs text-amber-700 font-medium mt-1">Overlapping trips &lt;30m</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile-First Grid: Stack on mobile, 2-column on tablet, 12-column on desktop */}
      <div className="px-4 md:px-0 space-y-4 md:space-y-0 md:grid md:grid-cols-1 lg:grid-cols-12 md:gap-6">
        {/* Driver Schedule Grid - Full width on mobile, 7 cols on desktop */}
        <div className="md:col-span-1 lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm md:text-base font-bold text-slate-700 flex items-center gap-2 min-w-0">
              <Truck size={16} className="shrink-0" /> 
              <span className="truncate">Driver Board</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono shrink-0">Live</span>
          </div>

          <div className="space-y-2 md:space-y-3">
            {driversWithStatus.map(d => {
              const statusColor = d.liveStatus?.status === 'free' ? 'bg-emerald-500' :
                d.liveStatus?.status === 'busy' ? 'bg-amber-500' : 'bg-slate-400';
              const isClockedIn = d.clockedIn || false;

              return (
                <div key={d.id} className="bg-white rounded-2xl border border-slate-200 hover:border-indigo-200 hover:shadow-md transition-all p-4 md:p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-base shrink-0 ${isClockedIn ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {String(d?.name || '?').charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm md:text-base text-slate-900 truncate">{d.name}</p>
                          <div className={`w-3 h-3 rounded-full ${statusColor} shrink-0`} />
                          {!isClockedIn && <span className="text-xs font-bold text-slate-400 uppercase">Offline</span>}
                        </div>
                        <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-1">
                          <MapPin size={12} className="shrink-0" /> <span className="truncate">{d.currentZone}</span> • <span className="truncate">{d.vehicle}</span>
                        </p>
                      </div>
                    </div>
                    <Badge variant={d.liveStatus?.status === 'free' ? 'success' : d.liveStatus?.status === 'busy' ? 'warning' : 'danger'}>
                      {d.liveStatus?.label || 'Unknown'}
                    </Badge>
                  </div>

                  {/* Schedule Timeline - Full width, smaller on mobile */}
                  <ScheduleBar schedule={d.schedule} currentMinutes={manifestDate === today ? currentMinutes : -100} />

                  {/* Next trip / availability detail */}
                  <div className="flex flex-wrap gap-1.5 mt-3 text-xs">
                    {d.schedule?.map((slot, idx) => {
                      const sl = getScheduleBlocks([slot])[0];
                      if (!sl) return null;
                      const isActive = isNowInRange(sl.startMin, sl.endMin);
                      return (
                        <span key={idx} className={`px-2 py-1 rounded-lg font-medium ${isActive ? (sl.isFree ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700') : 'bg-slate-100 text-slate-500'}`}>
                          {slot.start}-{slot.end} {sl.isFree ? '✓' : '🚐'}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {driversWithStatus.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <Truck size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">No drivers configured</p>
              </div>
            )}
          </div>
        </div>

        {/* Trip Assignment Panel - Full width on mobile, 5 cols on desktop */}
        <div className="md:col-span-1 lg:col-span-5 space-y-4">
          {/* Unassigned Trips */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 min-w-0">
                <AlertCircle size={16} className="text-amber-500 shrink-0" /> 
                <span className="truncate">Unassigned</span>
                <span className="bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 text-xs font-bold shrink-0">({unassignedTrips.length})</span>
              </h3>
            </div>
            {unassignedTrips.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="text-emerald-600" size={24} />
                </div>
                <p className="text-sm font-semibold text-slate-600">All trips assigned! 🎉</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[60vh] md:max-h-[500px] overflow-y-auto">
                {unassignedTrips.map(t => (
                  <button key={t.id} onClick={() => handleTripSelect(t)}
                    className={`w-full text-left p-4 hover:bg-indigo-50/50 active:bg-indigo-100 transition ${selectedTrip?.id === t.id ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm md:text-base text-slate-900">{t.patient}</p>
                        {t.bookingId && <p className="text-xs text-indigo-600 font-bold mt-1">{t.bookingId}</p>}
                        <div className="flex items-center gap-1 text-xs text-slate-500 mt-2 flex-wrap">
                          <MapPin size={12} className="text-emerald-600 shrink-0" />
                          <span className="text-emerald-600 font-medium truncate">{t.pickup}</span>
                          <span className="text-slate-300">→</span>
                          <MapPin size={12} className="text-rose-600 shrink-0" />
                          <span className="text-rose-600 font-medium truncate">{t.dropoff}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm md:text-base font-bold text-slate-900">{t.time}</p>
                        <Badge variant="info">{t.type}</Badge>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* AI Suggestion Panel */}
          {aiLoading && (
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/30 rounded-2xl border border-indigo-200 p-6 md:p-8 text-center shadow-sm">
              <div className="w-12 h-12 mx-auto mb-4 relative">
                <div className="absolute inset-0 border-4 border-indigo-200 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent border-r-transparent animate-spin"></div>
                <BrainCircuit className="absolute inset-0 m-auto text-indigo-600 animate-pulse" size={24} />
              </div>
              <p className="text-base md:text-lg font-bold text-slate-900">AI Analyzing...</p>
              <p className="text-sm text-slate-600 mt-2">Checking schedules, proximity & availability</p>
            </div>
          )}

          {selectedTrip && !aiLoading && (
            <div className="bg-white rounded-2xl border border-indigo-200 overflow-hidden shadow-sm hover:shadow-md transition-all">
              <div className="px-4 py-3 bg-gradient-to-r from-indigo-50 to-indigo-100/50 border-b border-indigo-200 flex items-center justify-between gap-2">
                <h3 className="text-xs md:text-sm font-bold text-indigo-900 flex items-center gap-2">
                  <BrainCircuit size={16} className="shrink-0" /> AI Suggestion
                </h3>
                <button onClick={() => { setSelectedTrip(null); setAiSuggestion(null); }} className="p-1.5 hover:bg-indigo-200 rounded-lg transition shrink-0" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 md:p-6 space-y-4">
                {/* Selected Trip Info */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2">
                  <p className="font-bold text-slate-900">{selectedTrip.patient}</p>
                  <div className="flex items-center gap-2 text-emerald-600 text-sm">
                    <MapPin size={14} className="shrink-0" /> {selectedTrip.pickup}
                  </div>
                  <div className="flex items-center gap-2 text-rose-600 text-sm">
                    <MapPin size={14} className="shrink-0" /> {selectedTrip.dropoff}
                  </div>
                  <div className="flex items-center gap-2 text-slate-600 text-sm">
                    <Clock size={14} className="shrink-0" /> {selectedTrip.time} • {selectedTrip.type}
                  </div>
                </div>

                {/* AI Result */}
                {aiSuggestion && (
                  <div>
                    {aiSuggestion.driverId ? (
                      (() => {
                        const d = drivers.find(drv => drv.id === aiSuggestion.driverId);
                        return (
                          <div className="space-y-4">
                            <div className={`p-4 rounded-2xl border-2 transition ${aiSuggestion.score >= 80 ? 'border-emerald-300 bg-emerald-50' : aiSuggestion.score >= 50 ? 'border-amber-300 bg-amber-50' : 'border-slate-300 bg-slate-50'}`}>
                              <div className="flex items-start gap-3 mb-4">
                                <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-lg shrink-0">{String(d?.name || '?').charAt(0)}</div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-bold text-slate-900 text-base">{d?.name || aiSuggestion.driverId}</p>
                                  <p className="text-xs text-slate-500 truncate">{d?.vehicle} • {d?.currentZone}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className={`text-2xl font-black ${aiSuggestion.score >= 80 ? 'text-emerald-600' : aiSuggestion.score >= 50 ? 'text-amber-600' : 'text-slate-600'}`}>
                                    {aiSuggestion.score}%
                                  </span>
                                  <p className="text-xs text-slate-500 font-bold uppercase">Match</p>
                                </div>
                              </div>
                              <div className="w-full bg-slate-300 rounded-full h-2 mb-3 overflow-hidden">
                                <div className={`h-2 rounded-full transition-all ${aiSuggestion.score >= 80 ? 'bg-emerald-500' : aiSuggestion.score >= 50 ? 'bg-amber-500' : 'bg-slate-400'}`}
                                  style={{ width: `${aiSuggestion.score}%` }} />
                              </div>
                            </div>
                            <button onClick={handleAssign} className="w-full py-4 md:py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl font-bold text-base md:text-sm hover:shadow-lg active:scale-[0.98] transition flex items-center justify-center gap-2 shadow-md">
                              <UserCheck size={18} className="shrink-0" /> Assign to {d?.name}
                            </button>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="p-6 text-center">
                        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <AlertCircle size={32} className="text-amber-600" />
                        </div>
                        <p className="font-bold text-slate-900 text-base">{aiSuggestion?.reason || 'No suitable driver found'}</p>
                        <p className="text-sm text-slate-500 mt-2">Try checking driver schedules or reassign later</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DispatchAssistant;
