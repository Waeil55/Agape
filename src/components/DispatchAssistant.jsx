import React, { useState, useEffect, useRef } from 'react';
import { tripMatchesCalendarDay } from '../utils/tripDate';
import { Clock, MapPin, Truck, BrainCircuit, X, Zap, AlertCircle, UserCheck } from 'lucide-react';
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
  const selectedTripIdRef = useRef(null);

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
    selectedTripIdRef.current = trip.id;
    setAiSuggestion(null);
    setAiLoading(true);
    try {
      const result = await suggestOptimalDriver(trip, drivers, trips);
      if (selectedTripIdRef.current !== trip.id) return;
      if (result) {
        setAiSuggestion(result);
        setAiDriverId(result.driverId);
      } else {
        setAiSuggestion({ driverId: null, score: 0, reason: 'AI suggestion unavailable. Check driver schedules.' });
        setAiDriverId(null);
      }
    } catch (err) {
      console.error('[DispatchAssistant] AI suggestion failed:', err);
      setAiSuggestion({ driverId: null, score: 0, reason: 'AI suggestion failed. Try again.' });
      setAiDriverId(null);
    } finally {
      setAiLoading(false);
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
    <div className="space-y-6">
      {/* Live Dispatch Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
            <Zap size={20} />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900">Dispatch Assistant</h2>
            <p className="text-xs text-slate-500 font-semibold flex items-center gap-1">
              <Clock size={10} /> Live: {nowStr} &bull; {drivers.length} drivers &bull; {unassignedTrips.length} unassigned
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {manifestDate === today && (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Live View</span>
            </>
          )}
        </div>
      </div>

      {/* AI OPERATIONS INSIGHTS BANNER */}
      {(insights.latePickups.length > 0 || insights.conflicts.length > 0 || insights.idleDrivers > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-rose-200 p-4 flex items-start gap-3 shadow-sm">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg shrink-0"><AlertCircle size={18} /></div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Late Pickups</p>
              <p className="text-lg font-black text-slate-900">{insights.latePickups.length}</p>
              {insights.latePickups.length > 0 && <p className="text-xs text-rose-600 font-medium leading-tight mt-0.5">Trips are &gt;15m past schedule</p>}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-amber-200 p-4 flex items-start gap-3 shadow-sm">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg shrink-0"><Clock size={18} /></div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Conflicts</p>
              <p className="text-lg font-black text-slate-900">{insights.conflicts.length}</p>
              {insights.conflicts.length > 0 && <p className="text-xs text-amber-600 font-medium leading-tight mt-0.5">Assigned trips overlapping &lt;30m</p>}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-emerald-200 p-4 flex items-start gap-3 shadow-sm">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg shrink-0"><Truck size={18} /></div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Idle Capacity</p>
              <p className="text-lg font-black text-slate-900">{insights.idleDrivers}</p>
              <p className="text-xs text-emerald-600 font-medium leading-tight mt-0.5">Clocked in &amp; available now</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Driver Schedule Grid */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Truck size={16} /> Driver Schedule Board</h3>
            <span className="text-xs text-slate-400 font-mono">Updated live every second</span>
          </div>

          <div className="space-y-2">
            {driversWithStatus.map(d => {
              const statusColor = d.liveStatus?.status === 'free' ? 'bg-emerald-500' :
                d.liveStatus?.status === 'busy' ? 'bg-amber-500' : 'bg-slate-400';
              const isClockedIn = d.clockedIn || false;

              return (
                <div key={d.id} className="bg-white rounded-xl border border-slate-200 p-3 hover:border-indigo-200 transition">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${isClockedIn ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {String(d?.name || '?').charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-slate-900 break-words">{d.name}</p>
                          <div className={`w-2 h-2 rounded-full ${statusColor}`} />
                        </div>
                        <p className="text-xs text-slate-500 flex flex-wrap items-center gap-1">
                          <MapPin size={10} className="shrink-0" /> {d.currentZone} &bull; {d.vehicle}
                          {d.assignedDispatcher && (
                            <>
                              &bull; <span className="text-indigo-600 font-semibold">Disp: {d.assignedDispatcher.split('-')[0]}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <Badge variant={d.liveStatus?.status === 'free' ? 'success' : d.liveStatus?.status === 'busy' ? 'warning' : 'danger'}>
                      {d.liveStatus?.label || 'Unknown'}
                    </Badge>
                  </div>

                  {/* Schedule Timeline */}
                  <ScheduleBar schedule={d.schedule} currentMinutes={manifestDate === today ? currentMinutes : -100} />

                  {/* Next trip / availability detail */}
                  <div className="flex flex-wrap gap-2 mt-2 text-xs text-slate-500">
                    {d.schedule?.map((slot, idx) => {
                      const sl = getScheduleBlocks([slot])[0];
                      if (!sl) return null;
                      const isActive = isNowInRange(sl.startMin, sl.endMin);
                      return (
                        <span key={idx} className={`px-2 py-0.5 rounded font-medium ${isActive ? (sl.isFree ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700') : 'bg-slate-50 text-slate-400'}`}>
                          {slot.start}-{slot.end} {sl.isFree ? '✓' : '🚐'}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trip Assignment Panel */}
        <div className="lg:col-span-5 space-y-4">
          {/* Unassigned Trips */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <AlertCircle size={14} className="text-amber-500" /> Unassigned ({unassignedTrips.length})
              </h3>
              <button onClick={() => setShowUnassigned(!showUnassigned)} className="text-xs text-blue-600 font-semibold">
                {showUnassigned ? 'Hide' : 'Show'}
              </button>
            </div>
            {showUnassigned && (
              <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
                {unassignedTrips.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-sm">All trips assigned</div>
                ) : (
                  unassignedTrips.map(t => (
                    <button key={t.id} onClick={() => handleTripSelect(t)}
                      className={`w-full text-left p-3 hover:bg-slate-50 transition ${selectedTrip?.id === t.id ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-slate-900 break-words">{t.patient}</p>
                          {t.bookingId ? <p className="text-xs text-indigo-600 font-semibold break-words">{t.bookingId}</p> : null}
                          <p className="text-xs text-slate-500 break-words"><span className="text-emerald-600">{t.pickup}</span> → <span className="text-rose-600">{t.dropoff}</span></p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-semibold text-slate-700">{t.time}</p>
                          <Badge variant="info">{t.type}</Badge>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* AI Suggestion Panel */}
          {aiLoading && (
            <div className="bg-white rounded-xl border border-indigo-200 p-6 text-center">
              <div className="w-10 h-10 mx-auto mb-3 relative">
                <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                <BrainCircuit className="absolute inset-0 m-auto text-indigo-600 animate-pulse" size={18} />
              </div>
              <p className="text-sm font-semibold text-slate-800">Analyzing...</p>
              <p className="text-sm text-slate-500 mt-1">Checking schedules, proximity, and next-trip fit</p>
            </div>
          )}

          {selectedTrip && !aiLoading && (
            <div className="bg-white rounded-xl border border-indigo-200 overflow-hidden">
              <div className="p-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-indigo-900 flex items-center gap-1.5">
                  <BrainCircuit size={14} /> AI Dispatch Suggestion
                </h3>
                <button onClick={() => { setSelectedTrip(null); setAiSuggestion(null); }} className="p-1 hover:bg-indigo-100 rounded" aria-label="Close">
                  <X size={14} />
                </button>
              </div>
              <div className="p-3 space-y-3">
                {/* Selected Trip Info */}
                <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-2.5 space-y-1">
                  <p className="font-semibold text-slate-900">{selectedTrip.patient}</p>
                  <p className="flex items-center gap-1 text-emerald-600"><MapPin size={10} /> {selectedTrip.pickup}</p>
                  <p className="flex items-center gap-1 text-rose-600"><MapPin size={10} /> {selectedTrip.dropoff}</p>
                  <p className="flex items-center gap-1"><Clock size={10} /> {selectedTrip.time} &bull; {selectedTrip.type}</p>
                </div>

                {/* AI Result */}
                {aiSuggestion && (
                  <div>
                    {aiSuggestion.driverId ? (
                      (() => {
                        const d = drivers.find(drv => drv.id === aiSuggestion.driverId);
                        return (
                          <div className="space-y-3">
                            <div className={`p-3 rounded-xl border-2 transition ${aiSuggestion.score >= 80 ? 'border-emerald-300 bg-emerald-50/50' : aiSuggestion.score >= 50 ? 'border-amber-300 bg-amber-50/50' : 'border-slate-300 bg-slate-50'}`}>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">{String(d?.name || '?').charAt(0)}</div>
                                  <div>
                                    <p className="font-semibold text-sm text-slate-900">{d?.name || aiSuggestion.driverId}</p>
                                    <p className="text-xs text-slate-500">{d?.vehicle} &bull; {d?.currentZone}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className={`text-lg font-black ${aiSuggestion.score >= 80 ? 'text-emerald-600' : aiSuggestion.score >= 50 ? 'text-amber-600' : 'text-slate-500'}`}>
                                    {aiSuggestion.score}%
                                  </span>
                                  <p className="text-xs text-slate-400 uppercase">Match</p>
                                </div>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-1.5 mb-2">
                                <div className={`h-1.5 rounded-full ${aiSuggestion.score >= 80 ? 'bg-emerald-500' : aiSuggestion.score >= 50 ? 'bg-amber-500' : 'bg-slate-400'}`}
                                  style={{ width: `${aiSuggestion.score}%` }} />
                              </div>
                              <p className="text-sm text-slate-600 leading-snug">{aiSuggestion.reason}</p>
                            </div>
                            <button onClick={handleAssign} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 active:scale-[0.98] transition flex items-center justify-center gap-2">
                              <UserCheck size={16} /> Assign to {d?.name || aiSuggestion.driverId}
                            </button>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="p-4 text-center">
                        <AlertCircle size={24} className="mx-auto text-amber-500 mb-2" />
                        <p className="text-xs font-semibold text-slate-600">{aiSuggestion?.reason || 'No suitable driver found'}</p>
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
