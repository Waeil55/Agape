import React, { useState, useMemo } from 'react';
import {
  FileText, Users, AlertCircle, Clock, CheckCircle2, Truck,
  BrainCircuit, Search, Filter, ArrowUpRight,
  ArrowDownRight, Navigation, Phone, MessageSquare, MoreHorizontal,
  ChevronDown, ChevronUp, Zap, AlertTriangle, Repeat, MapPin,
  Square, CheckSquare, X, Plus, ArrowRight, TrendingUp, TrendingDown
} from 'lucide-react';

const timeToMinutes = (t) => {
  if (!t) return 1440;
  const cleanTime = String(t).toUpperCase().trim();
  if (cleanTime === 'WILL CALL' || cleanTime === 'WC') return 1440;
  const m = cleanTime.match(/(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?/);
  if (!m) return 1440;
  let h = parseInt(m[1], 10);
  let min = parseInt(m[2] || '0', 10);
  const p = m[3];
  if (p === 'PM' && h < 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return h * 60 + min;
};

const isTripLate = (tripTime) => {
  if (!tripTime || tripTime === 'Will Call') return false;
  const now = new Date();
  const timeVal = timeToMinutes(tripTime);
  const scheduled = new Date();
  scheduled.setHours(Math.floor(timeVal / 60), timeVal % 60, 0, 0);
  return now > scheduled;
};

const to12hr = (time) => {
  if (!time || time === 'Will Call') return 'WC';
  const m = time.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
  if (!m) return time;
  let h = parseInt(m[1]);
  const min = m[2] || '00';
  const p = m[3]?.toUpperCase();
  const ampm = p || (h >= 12 ? 'PM' : 'AM');
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
};

const OperationsCommandCenter = ({
  role, currentUser, trips, drivers, dispatchers,
  selectedTasks, setSelectedTasks, searchQuery, setSearchQuery,
  operationsTab, setOperationsTab,
  smartAssignTrip, setSmartAssignTrip, manualAssignTrip, setManualAssignTrip,
  smartAssignResult, setSmartAssignResult, aiAnalyzing, setAiAnalyzing,
  addToast, addAuditLog, persistState, hasPermission, requestAuthAction,
  triggerSmartAssign, triggerFleetOptimization, assignTripToDriver,
  bulkAssignTrips, requestDeleteTrip, updateTrip,
  makeCall, sendSMS, setTripDetails
}) => {
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterUrgency, setFilterUrgency] = useState('all');
  const [sortBy, setSortBy] = useState('time');
  const [expandedDriver, setExpandedDriver] = useState(null);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayTrips = trips.filter(t => t.date === todayStr || !t.date);
  const activeTrips = todayTrips.filter(t => !['Completed', 'Cancelled', 'No Show'].includes(t.status));
  const unassignedTrips = activeTrips.filter(t => t.status === 'Unassigned');
  const inProgressTrips = activeTrips.filter(t => ['In Mission', 'En Route', 'At Pickup', 'At Dropoff', 'Assigned'].includes(t.status));
  const completedToday = todayTrips.filter(t => t.status === 'Completed');
  const lateTrips = activeTrips.filter(t => isTripLate(t.time));
  const willCallTrips = activeTrips.filter(t => t.time === 'Will Call');

  const availableDrivers = drivers.filter(d => d.status === 'Available');
  const busyDrivers = drivers.filter(d => d.status !== 'Available');

  const searchedTrips = searchQuery
    ? activeTrips.filter(t =>
        t.patient.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.bookingId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.pickup || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.dropoff || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : activeTrips;

  const filteredTrips = useMemo(() => {
    let result = operationsTab === 'willcall' ? willCallTrips : searchedTrips;
    if (filterStatus !== 'all') result = result.filter(t => t.status === filterStatus);
    if (filterUrgency === 'late') result = result.filter(t => isTripLate(t.time));
    if (filterUrgency === 'upcoming') result = result.filter(t => {
      const mins = timeToMinutes(t.time);
      const now = new Date();
      const scheduled = new Date();
      scheduled.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
      return scheduled > now && (scheduled - now) < 60 * 60 * 1000;
    });
    result.sort((a, b) => {
      if (sortBy === 'time') return timeToMinutes(a.time) - timeToMinutes(b.time);
      if (sortBy === 'patient') return a.patient.localeCompare(b.patient);
      if (sortBy === 'status') return a.status.localeCompare(b.status);
      return 0;
    });
    return result;
  }, [searchedTrips, willCallTrips, filterStatus, filterUrgency, sortBy, operationsTab]);

  const getTripUrgency = (trip) => {
    if (isTripLate(trip.time)) return 'late';
    const mins = timeToMinutes(trip.time);
    const now = new Date();
    const scheduled = new Date();
    scheduled.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    const diff = scheduled - now;
    if (diff < 30 * 60 * 1000 && diff > 0) return 'soon';
    return 'normal';
  };

  const getDriverTrips = (driverId) => {
    return inProgressTrips.filter(t => t.driverId === driverId);
  };

  // ==================== KPI BAR ====================
  const renderKPIBar = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 p-3 border-b border-white/5">
      {[
        { label: 'Active Trips', value: activeTrips.length, icon: FileText, color: 'blue', trend: '+2' },
        { label: 'Unassigned', value: unassignedTrips.length, icon: AlertCircle, color: unassignedTrips.length > 0 ? 'rose' : 'slate', trend: unassignedTrips.length > 0 ? '!' : null },
        { label: 'In Progress', value: inProgressTrips.length, icon: Truck, color: 'amber' },
        { label: 'Completed', value: completedToday.length, icon: CheckCircle2, color: 'emerald', trend: `${todayTrips.length > 0 ? Math.round((completedToday.length / todayTrips.length) * 100) : 0}%` },
        { label: 'Drivers Ready', value: `${availableDrivers.length}/${drivers.length}`, icon: Users, color: 'indigo' },
        { label: 'Late Trips', value: lateTrips.length, icon: Clock, color: lateTrips.length > 0 ? 'rose' : 'slate', trend: lateTrips.length > 0 ? '!' : '0' },
      ].map(kpi => {
        const Icon = kpi.icon;
        const colorMap = {
          blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
          rose: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
          amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
          emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
          indigo: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
          slate: 'bg-slate-500/10 border-slate-500/20 text-slate-400',
        };
        return (
          <div key={kpi.label} className={`p-2.5 rounded-lg border ${colorMap[kpi.color]} relative overflow-hidden`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-medium opacity-70 uppercase tracking-wider">{kpi.label}</p>
                <p className="text-lg font-bold mt-0.5">{kpi.value}</p>
              </div>
              <Icon size={16} className="opacity-60 shrink-0" />
            </div>
            {kpi.trend && (
              <div className="flex items-center gap-1 mt-1">
                {kpi.trend === '!' ? (
                  <AlertTriangle size={10} className="text-rose-400" />
                ) : kpi.trend.startsWith('+') ? (
                  <TrendingUp size={10} className="text-emerald-400" />
                ) : (
                  <TrendingDown size={10} className="text-slate-400" />
                )}
                <span className="text-[10px] font-medium">{kpi.trend}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // ==================== ACTION BAR ====================
  const renderActionBar = () => (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-white/5">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Search trips, patients, addresses..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-2 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-slate-400 focus:outline-none focus:border-blue-500/50"
        >
          <option value="all">All Status</option>
          <option value="Unassigned">Unassigned</option>
          <option value="Assigned">Assigned</option>
          <option value="In Mission">In Mission</option>
          <option value="Completed">Completed</option>
        </select>
        <select
          value={filterUrgency}
          onChange={(e) => setFilterUrgency(e.target.value)}
          className="px-2 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-slate-400 focus:outline-none focus:border-blue-500/50"
        >
          <option value="all">All Priority</option>
          <option value="late">Late</option>
          <option value="upcoming">Within 1hr</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-2 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-slate-400 focus:outline-none focus:border-blue-500/50"
        >
          <option value="time">Sort: Time</option>
          <option value="patient">Sort: Patient</option>
          <option value="status">Sort: Status</option>
        </select>
      </div>

    </div>
  );

  // ==================== TRIP TABLE ====================
  const renderTripTable = () => (
    <div className="flex-1 overflow-y-auto">
      {filteredTrips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-600">
          <FileText size={32} className="mb-3 opacity-50" />
          <p className="text-sm font-medium">No trips found</p>
          <p className="text-xs mt-1">Try adjusting filters or upload new trips</p>
        </div>
      ) : (
        <div className="admin-bg-surface border border-white/5 rounded-xl overflow-hidden mx-3 mb-3">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-white/[0.02] border-b border-white/5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold sticky top-0 z-10">
            <div className="col-span-1"></div>
            <div className="col-span-1">Time</div>
            <div className="col-span-2">Patient</div>
            <div className="col-span-3">Pickup</div>
            <div className="col-span-2">Dropoff</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1">Driver</div>
            <div className="col-span-1">Actions</div>
          </div>
          {/* Rows */}
          {filteredTrips.map(t => {
            const isSelected = selectedTasks.includes(t.id);
            const urgency = getTripUrgency(t);
            const isLate = isTripLate(t.time) && !['Completed', 'Cancelled', 'No Show'].includes(t.status);
            const driver = drivers.find(d => d.id === t.driverId);
            return (
              <div
                key={t.id}
                className={`grid grid-cols-12 gap-2 px-3 py-2 border-b border-white/5 text-xs hover:bg-white/[0.02] cursor-pointer transition group ${
                  isSelected ? 'bg-blue-500/10 border-blue-500/20' : ''
                } ${isLate ? 'bg-rose-500/5' : ''}`}
                onClick={() => setTripDetails(t)}
              >
                <div className="col-span-1 flex items-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedTasks(prev => prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]); }}
                    className="text-slate-500 hover:text-blue-400 transition"
                  >
                    {isSelected ? <CheckSquare size={14} className="text-blue-400" /> : <Square size={14} />}
                  </button>
                </div>
                <div className="col-span-1 flex items-center gap-1">
                  <span className={`font-mono ${urgency === 'late' ? 'text-rose-400 font-bold' : urgency === 'soon' ? 'text-amber-400' : 'text-slate-400'}`}>
                    {to12hr(t.time)}
                  </span>
                  {isLate && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />}
                </div>
                <div className="col-span-2 flex items-center font-medium text-[var(--text-primary)] truncate">{t.patient}</div>
                <div className="col-span-3 flex items-center text-slate-400 truncate text-[11px]">{t.pickup}</div>
                <div className="col-span-2 flex items-center text-slate-400 truncate text-[11px]">{t.dropoff}</div>
                <div className="col-span-1 flex items-center">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    t.status === 'Unassigned' ? 'bg-rose-500/15 text-rose-400' :
                    t.status === 'Assigned' ? 'bg-blue-500/15 text-blue-400' :
                    t.status === 'In Mission' ? 'bg-amber-500/15 text-amber-400' :
                    t.status === 'Completed' ? 'bg-emerald-500/15 text-emerald-400' :
                    'bg-slate-500/15 text-slate-400'
                  }`}>{t.status}</span>
                </div>
                <div className="col-span-1 flex items-center">
                  {driver ? (
                    <span className="text-slate-400 truncate text-[11px]">{driver.name.split(' ')[0]}</span>
                  ) : (
                    <span className="text-slate-600 text-[11px]">—</span>
                  )}
                </div>
                <div className="col-span-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition" onClick={(e) => e.stopPropagation()}>
                  {t.status === 'Unassigned' && (
                    <>
                      <button onClick={() => triggerSmartAssign(t)} className="p-1 rounded hover:bg-indigo-500/20 text-indigo-400" title="AI Assign"><BrainCircuit size={13} /></button>
                      <button onClick={() => setManualAssignTrip(t)} className="p-1 rounded hover:bg-blue-500/20 text-blue-400" title="Assign"><Users size={13} /></button>
                    </>
                  )}
                  {hasPermission(role, 'canDeleteTrip') && (
                    <button onClick={() => requestDeleteTrip(t.id)} className="p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400" title="Archive"><X size={13} /></button>
                  )}
                </div>
              </div>
            );
          })}
          {/* Footer */}
          <div className="px-3 py-1.5 bg-white/[0.02] border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
            <span>{filteredTrips.length} trip{filteredTrips.length !== 1 ? 's' : ''}</span>
            <span>{selectedTasks.length} selected</span>
          </div>
        </div>
      )}
    </div>
  );

  // ==================== Fleet Matrix ====================
  const renderFleetMatrix = () => (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {drivers.map(d => {
          const driverTrips = getDriverTrips(d.id);
          const isExpanded = expandedDriver === d.id;
          const isMaintenanceDue = d.nextOilChange - d.odometer < 200;
          return (
            <div key={d.id} className={`admin-bg-surface border rounded-xl overflow-hidden transition ${
              d.status === 'Available' ? 'border-emerald-500/20' : 'border-white/5'
            } ${isMaintenanceDue ? 'border-rose-500/30' : ''}`}>
              {/* Driver header */}
              <div className="p-3 cursor-pointer hover:bg-white/[0.02] transition" onClick={() => setExpandedDriver(isExpanded ? null : d.id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
                      d.status === 'Available' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {d.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{d.name}</p>
                      <p className="text-[11px] text-slate-500">{d.vehicle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${d.status === 'Available' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span className="text-[10px] text-slate-400">{d.status}</span>
                    </div>
                    {isExpanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><MapPin size={10} /> {d.currentZone}</span>
                  <span>{d.odometer?.toLocaleString()} mi</span>
                  {isMaintenanceDue && <span className="text-rose-400 font-medium">Service Due</span>}
                </div>
              </div>

              {/* Expanded: assigned trips */}
              {isExpanded && (
                <div className="border-t border-white/5">
                  {driverTrips.length > 0 ? (
                    <div className="p-2 space-y-1">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold px-1">Active Trips ({driverTrips.length})</p>
                      {driverTrips.map(t => (
                        <div key={t.id} className="p-2 rounded-lg bg-white/[0.02] border border-white/5 cursor-pointer hover:bg-white/[0.04] transition" onClick={() => setTripDetails(t)}>
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-[var(--text-primary)]">{t.patient}</p>
                            <span className="text-[10px] font-mono text-slate-400">{to12hr(t.time)}</span>
                          </div>
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500">
                            <span className="truncate">{t.pickup}</span>
                            <ArrowRight size={8} />
                            <span className="truncate">{t.dropoff}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 text-center text-xs text-slate-600">No active trips</div>
                  )}
                  {d.phone && (
                    <div className="px-2 pb-2 flex gap-1.5">
                      <button onClick={() => makeCall(d.phone, d.name)} className="flex-1 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5">
                        <Phone size={12} /> Call
                      </button>
                      <button onClick={() => sendSMS(d.phone, d.name)} className="flex-1 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5">
                        <MessageSquare size={12} /> SMS
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ==================== WILL CALL VIEW ====================
  const renderWillCall = () => (
    <div className="flex-1 overflow-y-auto p-3">
      {willCallTrips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-600">
          <Phone size={32} className="mb-3 opacity-50" />
          <p className="text-sm font-medium">No will call trips</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {willCallTrips.map(t => (
            <div key={t.id} className="admin-bg-surface border border-white/5 rounded-xl p-3 hover:border-white/10 transition cursor-pointer" onClick={() => setTripDetails(t)}>
              <div className="flex items-start justify-between mb-2">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{t.patient}</p>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-500/15 text-slate-400">Will Call</span>
              </div>
              <div className="space-y-1 text-[11px] text-slate-400">
                <div className="flex items-start gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
                  <span className="truncate">{t.pickup}</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1 shrink-0" />
                  <span className="truncate">{t.dropoff}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ==================== MAIN RENDER ====================
  return (
    <div className="flex flex-col h-full">
      {/* KPI Bar */}
      {renderKPIBar()}

      {/* Action Bar */}
      {renderActionBar()}

      {/* Content */}
      {operationsTab === 'manifest' && renderTripTable()}
      {operationsTab === 'willcall' && renderWillCall()}
      {operationsTab === 'fleet' && renderFleetMatrix()}
    </div>
  );
};

export default OperationsCommandCenter;
