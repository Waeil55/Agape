import React, { useState, useMemo } from 'react';
import {
  Clock, AlertTriangle, Play, Pause, CheckCircle, XCircle,
  DollarSign, FileText, Download, ChevronDown, ChevronUp,
  Shield, Timer, User, Navigation, Edit2, Trash2, Plus, X, Save,
  Briefcase, Check, Lock
} from 'lucide-react';
import { buildTimeEvents, generatePayrollOutput, POLICY_MODES, validateTimeEventSequence } from '../utils/timeTracking';
import { localCalendarYmd } from '../utils/tripDate';
import { db, doc, setDoc } from '../config/firebase';

const formatMinutes = (minutes) => {
  const rounded = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const formatTime = (isoString) => {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (isoString) => {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const timeInputValue = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toTimeString().slice(0, 5);
};

const getGapClassificationColor = (classification) => {
  switch (classification) {
    case 'SHORT': return 'bg-green-100 text-green-800';
    case 'MEDIUM': return 'bg-yellow-100 text-yellow-800';
    case 'LONG': return 'bg-red-100 text-red-800';
    default: return 'bg-slate-100 text-slate-800';
  }
};

const TimeTrackingAdmin = ({ drivers = [], trips = [], clockEvents = [], timeData = null, onUpdateClockEvents, onBack, onUpdateHourlyRate }) => {
  const [selectedDriver, setSelectedDriver] = useState('ALL');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [expandedDriver, setExpandedDriver] = useState(null);
  const [activeTab, setActiveTab] = useState('sessions');
  const [editTimesheet, setEditTimesheet] = useState(null);
  const [editingRate, setEditingRate] = useState(null);
  const [rateValue, setRateValue] = useState('');
  const [approvalMsg, setApprovalMsg] = useState(null);
  const [timesheetSaving, setTimesheetSaving] = useState(false);
  const editValidation = useMemo(
    () => editTimesheet ? validateTimeEventSequence(editTimesheet.events, { now: new Date() }) : null,
    [editTimesheet]
  );

  const filteredDrivers = useMemo(() => {
    if (selectedDriver === 'ALL') return drivers;
    return drivers.filter(d => d.id === selectedDriver);
  }, [drivers, selectedDriver]);

  const driverSessions = useMemo(() => {
    const sessions = {};
    const toIso = (value) => {
      if (!value) return null;
      if (typeof value === 'string') { const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
      if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
      if (typeof value.toDate === 'function') return value.toDate().toISOString();
      if (value.seconds) return new Date(value.seconds * 1000).toISOString();
      return null;
    };
    const dateKeyFrom = (value) => {
      const iso = toIso(value);
      if (!iso) return null;
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const tripDateKey = (trip) => {
      if (typeof trip?.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(trip.date)) return trip.date.slice(0, 10);
      return dateKeyFrom(trip?.arrivalTime) || dateKeyFrom(trip?.startTime) || dateKeyFrom(trip?.startedAt) || dateKeyFrom(trip?.arrivalDropoffTime) || dateKeyFrom(trip?.completedAt);
    };
    const eventDateKey = (event) => dateKeyFrom(event?.timestamp || event?.at || event?.createdAt || event?.time);
    const inDateRange = (date) => !!date && (!dateRange.from || date >= dateRange.from) && (!dateRange.to || date <= dateRange.to);

    const sourceTrips = timeData?.trips || trips || [];
    const sourceClockEvents = [...(clockEvents || []), ...(timeData?.clockEvents || [])];
    const sourceGaps = timeData?.gaps || timeData?.gapLog || [];
    const sourceTeleports = timeData?.teleports || [];

    filteredDrivers.forEach(driver => {
      const driverId = driver.id;
      const driverKeys = new Set([driver.id, driver.driverId, driver.uid, driver.email, driver.name].filter(Boolean).map(v => String(v).toLowerCase()));
      const matchesDriver = (item) => {
        const values = [item?.driverId, item?.assignedDriverId, item?.driverEmail, item?.assignedDriverEmail, item?.driverName, item?.assignedDriverName, item?.email].filter(Boolean).map(v => String(v).toLowerCase());
        return values.length === 0 ? false : values.some(v => driverKeys.has(v));
      };
      const driverTrips = sourceTrips.filter(matchesDriver);
      const driverClockEvents = [...(driver.clockEvents || []), ...sourceClockEvents.filter(matchesDriver)];
      const driverGaps = sourceGaps.filter(matchesDriver);
      const driverTeleports = sourceTeleports.filter(matchesDriver);

      const byDate = {};
      driverTrips.forEach(trip => {
        const date = tripDateKey(trip);
        if (!inDateRange(date)) return;
        if (!byDate[date]) byDate[date] = { trips: [], clockEvents: [], gaps: [], teleports: [], events: [], sessions: [], payroll: null };
        byDate[date].trips.push(trip);
      });
      driverClockEvents.forEach(event => {
        const date = event.date || eventDateKey(event);
        if (!inDateRange(date)) return;
        if (!byDate[date]) byDate[date] = { trips: [], clockEvents: [], gaps: [], teleports: [], events: [], sessions: [], payroll: null };
        byDate[date].clockEvents.push(event);
      });
      driverGaps.forEach(gap => {
        const date = gap.date || dateKeyFrom(gap.startTime || gap.timestamp);
        if (!inDateRange(date)) return;
        if (!byDate[date]) byDate[date] = { trips: [], clockEvents: [], gaps: [], teleports: [], events: [], sessions: [], payroll: null };
        byDate[date].gaps.push(gap);
      });
      driverTeleports.forEach(teleport => {
        const date = teleport.date || dateKeyFrom(teleport.timestamp || teleport.createdAt);
        if (!inDateRange(date)) return;
        if (!byDate[date]) byDate[date] = { trips: [], clockEvents: [], gaps: [], teleports: [], events: [], sessions: [], payroll: null };
        byDate[date].teleports.push(teleport);
      });

      Object.entries(byDate).forEach(([date, day]) => {
        const model = buildTimeEvents(day.trips, driver, day.clockEvents, timeData?.policyMode || driver.timeTrackingPolicy || POLICY_MODES.PAY_FROM_HOME, { date, breadcrumbs: driver.breadcrumbs || [] });
        const externalGaps = day.gaps.filter(gap => !model.gapLog.some(mg => mg.startTime === gap.startTime && mg.endTime === gap.endTime));
        day.trips = model.trips;
        day.clockEvents = model.clockEvents;
        day.events = model.events;
        day.sessions = model.sessions;
        day.gaps = [...model.gapLog, ...externalGaps];
        day.teleports = [...model.teleports, ...day.teleports];
        day.anomalies = model.anomalies || [];
        day.approvalEligible = model.approvalEligible;
        day.payroll = generatePayrollOutput(model, Number(driver.hourlyRate || 0));
      });
      sessions[driverId] = byDate;
    });
    return sessions;
  }, [filteredDrivers, trips, clockEvents, timeData, dateRange.from, dateRange.to]);

  const summaryStats = useMemo(() => {
    const allSessions = Object.values(driverSessions).flatMap(byDate => Object.values(byDate));
    return {
      totalTrips: allSessions.reduce((sum, s) => sum + s.trips.length, 0),
      totalGaps: allSessions.reduce((sum, s) => sum + s.gaps.length, 0),
      totalTeleports: allSessions.reduce((sum, s) => sum + s.teleports.length, 0),
      excludedMinutes: allSessions.reduce((sum, s) => sum + s.gaps.filter(g => g.payrollEffect === 'EXCLUDED').reduce((s2, g) => s2 + g.durationMinutes, 0), 0),
    };
  }, [driverSessions]);

  const getDayBillable = (day) => day.payroll?.payTime?.billableMilliseconds != null
    ? day.payroll.payTime.billableMilliseconds / 60000
    : day.payroll?.payTime?.billableMinutes ?? day.sessions.reduce((sum, s) => sum + (s.billableMinutes || 0), 0) ?? day.trips.reduce((sum, t) => sum + (t.billableMinutes || 0), 0);

  const getDayEarnings = (day, hourlyRate) => {
    const billable = getDayBillable(day);
    const hours = billable / 60;
    const regular = Math.min(hours, 8);
    const overtime = Math.max(0, hours - 8);
    return regular * hourlyRate + overtime * hourlyRate * 1.5;
  };

  const handleSaveRate = (driverId, value) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0 && onUpdateHourlyRate) {
      onUpdateHourlyRate(driverId, num.toFixed(2));
    }
    setEditingRate(null);
    setRateValue('');
  };

  const exportCSV = () => {
    const rows = [['Name', 'Role', 'Date', 'Clock In', 'Clock Out', 'Billable Min', 'Break Min', 'Rate', 'Earnings', 'Trips']];
    Object.entries(driverSessions).forEach(([driverId, byDate]) => {
      const driver = drivers.find(d => d.id === driverId);
      const rate = Number(driver?.hourlyRate || 0);
      Object.entries(byDate).forEach(([date, session]) => {
        const clockIn = session.clockEvents.find(e => e.type === 'IN' || e.type === 'CLOCK_IN' || e.type === 'AUTO_CLOCK_IN');
        const clockOut = session.clockEvents.find(e => e.type === 'OUT' || e.type === 'CLOCK_OUT');
        const billable = getDayBillable(session);
        const breaks = session.gaps.filter(g => g.gapType === 'BREAK').reduce((sum, g) => sum + g.durationMinutes, 0);
        const earnings = getDayEarnings(session, rate);
        rows.push([driver?.name || driverId, driver?.role || 'driver', date, clockIn?.timestamp ? formatTime(clockIn.timestamp) : '', clockOut?.timestamp ? formatTime(clockOut.timestamp) : '', Math.round(billable), Math.round(breaks), rate.toFixed(2), earnings.toFixed(2), session.trips.length]);
      });
    });
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agape-payroll-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const RateInput = ({ driver }) => {
    const isEditing = editingRate === driver.id;
    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-400">$</span>
          <input
            type="number"
            step="0.50"
            min="0"
            value={rateValue}
            onChange={(e) => setRateValue(e.target.value)}
            onBlur={() => handleSaveRate(driver.id, rateValue)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRate(driver.id, rateValue); if (e.key === 'Escape') { setEditingRate(null); setRateValue(''); } }}
            autoFocus
            className="w-16 px-1.5 py-0.5 border border-blue-300 rounded text-sm text-right font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button onClick={() => handleSaveRate(driver.id, rateValue)} className="p-0.5 text-green-600 hover:bg-green-50 rounded"><Check size={12} /></button>
        </div>
      );
    }
    const rate = Number(driver.hourlyRate || 0);
    return (
      <button
        onClick={() => { setEditingRate(driver.id); setRateValue(rate > 0 ? rate.toFixed(2) : ''); }}
        className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-1.5 py-0.5 rounded transition-colors"
        title="Click to edit hourly rate"
      >
        {rate > 0 ? `$${rate.toFixed(2)}/hr` : <span className="text-slate-400 italic">Set rate</span>}
      </button>
    );
  };

  return (
    <div className="min-h-0 flex-1 bg-slate-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-6 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 bg-white border-b border-slate-200 -mx-3 sm:-mx-4 px-3 sm:px-4 py-4 -mt-6 mb-6">
          <div className="flex items-center gap-3">
            {onBack && (
              <button onClick={onBack} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition">
                <X size={20} />
              </button>
            )}
            <div>
            </div>
          </div>
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-slate-700 mb-1">Person</label>
              <select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                <option value="ALL">Everyone</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name || d.id} ({d.role === 'dispatcher' ? 'Dispatcher' : 'Driver'})</option>
                ))}
              </select>
            </div>
            <div className="min-w-[150px]">
              <label className="block text-sm font-medium text-slate-700 mb-1">From</label>
              <input type="date" value={dateRange.from} onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="min-w-[150px]">
              <label className="block text-sm font-medium text-slate-700 mb-1">To</label>
              <input type="date" value={dateRange.to} onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg"><Navigation className="w-5 h-5 text-blue-600" /></div>
              <div>
                <p className="text-sm text-slate-500">Total Trips</p>
                <p className="text-xl font-semibold text-slate-900">{summaryStats.totalTrips}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-50 rounded-lg"><Clock className="w-5 h-5 text-yellow-600" /></div>
              <div>
                <p className="text-sm text-slate-500">Total Gaps</p>
                <p className="text-xl font-semibold text-slate-900">{summaryStats.totalGaps}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-50 rounded-lg"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
              <div>
                <p className="text-sm text-slate-500">Teleport Flags</p>
                <p className="text-xl font-semibold text-slate-900">{summaryStats.totalTeleports}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-50 rounded-lg"><DollarSign className="w-5 h-5 text-green-600" /></div>
              <div>
                <p className="text-sm text-slate-500">Excluded Min</p>
                <p className="text-xl font-semibold text-slate-900">{formatMinutes(summaryStats.excludedMinutes)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-lg w-fit">
          {[{ id: 'sessions', label: 'Sessions' }, { id: 'gaps', label: 'Gap Log' }, { id: 'abuse', label: 'Abuse' }, { id: 'payroll', label: 'Payroll' }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sessions Tab */}
        {activeTab === 'sessions' && (
          <div className="space-y-4">
            {Object.entries(driverSessions).map(([driverId, byDate]) => {
              const driver = drivers.find(d => d.id === driverId);
              const isExpanded = expandedDriver === driverId;
              const dates = Object.keys(byDate).sort().reverse();
              const totalTrips = dates.reduce((sum, d) => sum + byDate[d].trips.length, 0);
              const totalBillable = dates.reduce((sum, d) => sum + getDayBillable(byDate[d]), 0);
              const rate = Number(driver?.hourlyRate || 0);
              const isDispatcher = driver?.role === 'dispatcher';

              return (
                <div key={driverId} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <button onClick={() => setExpandedDriver(isExpanded ? null : driverId)} className="w-full flex items-center justify-between p-4 hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDispatcher ? 'bg-purple-100' : 'bg-blue-100'}`}>
                        {isDispatcher ? <Briefcase className="w-5 h-5 text-purple-600" /> : <User className="w-5 h-5 text-blue-600" />}
                      </div>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-900">{driver?.name || driverId}</p>
                          <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${isDispatcher ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {isDispatcher ? 'Dispatcher' : 'Driver'}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500">{dates.length} days · {totalTrips} trips · {formatMinutes(totalBillable)} worked</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <RateInput driver={driver} />
                      {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-100">
                      {dates.map(date => {
                        const day = byDate[date];
                        const clockIn = day.clockEvents.find(e => e.type === 'IN' || e.type === 'CLOCK_IN' || e.type === 'AUTO_CLOCK_IN');
                        const clockOut = day.clockEvents.find(e => e.type === 'OUT' || e.type === 'CLOCK_OUT');
                        const billable = getDayBillable(day);
                        const breaks = day.gaps.filter(g => g.gapType === 'BREAK').reduce((sum, g) => sum + g.durationMinutes, 0);
                        const earnings = getDayEarnings(day, rate);

                        return (
                          <div key={date} className="px-4 py-3 border-t border-slate-50">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-slate-900">{formatDate(date + 'T12:00:00')}</span>
                                <span className="text-sm text-slate-500">
                                  {formatTime(clockIn?.timestamp || clockIn?.at)} → {formatTime(clockOut?.timestamp || clockOut?.at)}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-sm text-slate-600">
                                <span className="flex items-center gap-1"><Timer className="w-3 h-3" />{formatMinutes(billable)}</span>
                                {breaks > 0 && <span className="flex items-center gap-1 text-yellow-600"><Pause className="w-3 h-3" />{formatMinutes(breaks)}</span>}
                                <span className="flex items-center gap-1"><Navigation className="w-3 h-3" />{day.trips.length}</span>
                                {rate > 0 && <span className="font-semibold text-green-700">{formatCurrency(earnings)}</span>}
                                <button onClick={() => setEditTimesheet({ driverId, date, events: [...day.clockEvents].sort((a, b) => new Date(a.timestamp || a.at) - new Date(b.timestamp || b.at)), correctionReason: '' })} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Edit Timesheet">
                                  <Edit2 size={14} />
                                </button>
                              </div>
                            </div>
                            {day.trips.length > 0 && (
                              <div className="ml-4 space-y-1">
                                {day.trips.map((trip, i) => (
                                  <div key={trip.id || i} className="flex items-center gap-2 text-sm">
                                    <CheckCircle className="w-3 h-3 text-emerald-500" />
                                    <span className="text-slate-700">{trip.patient || trip.id}</span>
                                    <span className="text-slate-400">→</span>
                                    <span className="text-slate-500">{trip.destination || '—'}</span>
                                    {trip.billableMinutes > 0 && <span className="text-slate-400 text-xs">{formatMinutes(trip.billableMinutes)}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {Object.keys(driverSessions).length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <Timer className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No time tracking sessions found</p>
                <p className="text-sm text-slate-400 mt-1">Sessions are created automatically when people clock in</p>
              </div>
            )}
          </div>
        )}

        {/* Gap Log Tab */}
        {activeTab === 'gaps' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-medium text-slate-900">Gap Analysis</h3>
              <p className="text-sm text-slate-500">Gaps between events classified by duration and payroll effect</p>
            </div>
            <div className="divide-y divide-slate-100">
              {(() => {
                const allGaps = Object.entries(driverSessions).flatMap(([driverId, byDate]) =>
                  Object.entries(byDate).flatMap(([date, session]) => session.gaps.map(g => ({ ...g, driverId, date })))
                ).sort((a, b) => new Date(b.timestamp || b.startTime) - new Date(a.timestamp || a.startTime));
                if (allGaps.length === 0) return <div className="p-8 text-center text-slate-500">No gaps recorded</div>;
                return allGaps.map((gap, i) => (
                  <div key={i} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getGapClassificationColor(gap.classification)}`}>{gap.classification}</span>
                      <div>
                        <p className="text-sm text-slate-900">{gap.gapType === 'TRIP' ? 'Between trips' : gap.gapType === 'BREAK' ? 'Break' : 'After trip'}</p>
                        <p className="text-xs text-slate-500">{formatDate(gap.timestamp || gap.startTime)} at {formatTime(gap.timestamp || gap.startTime)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-900">{formatMinutes(gap.durationMinutes)}</p>
                      <p className={`text-xs ${gap.payrollEffect === 'EXCLUDED' ? 'text-red-500' : 'text-green-500'}`}>
                        {gap.payrollEffect === 'EXCLUDED' ? 'Excluded' : 'Included'}
                      </p>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* Abuse Flags Tab */}
        {activeTab === 'abuse' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-medium text-slate-900 flex items-center gap-2"><Shield className="w-4 h-4 text-red-500" />Abuse Detection</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {(() => {
                const allFlags = Object.entries(driverSessions).flatMap(([driverId, byDate]) =>
                  Object.entries(byDate).flatMap(([date, session]) => session.teleports.map(t => ({ ...t, driverId, date })))
                ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                if (allFlags.length === 0) return (
                  <div className="p-8 text-center">
                    <Shield className="w-12 h-12 text-green-300 mx-auto mb-4" />
                    <p className="text-green-600 font-medium">No abuse flags detected</p>
                    <p className="text-sm text-slate-400 mt-1">All GPS activity looks normal</p>
                  </div>
                );
                return allFlags.map((flag, i) => (
                  <div key={i} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-red-50 rounded-lg"><AlertTriangle className="w-4 h-4 text-red-600" /></div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{flag.flagType || 'GPS Anomaly'}</p>
                        <p className="text-xs text-slate-500">{formatDate(flag.timestamp)} at {formatTime(flag.timestamp)}{flag.mph ? ` · ${Math.round(flag.mph)} mph` : ''}</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">{flag.severity || 'HIGH'}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* Payroll Tab */}
        {activeTab === 'payroll' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-medium text-slate-900 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-green-600" />
                Payroll Summary
              </h3>
              <p className="text-sm text-slate-500">Earnings by person with daily and weekly breakdowns</p>
            </div>
            {(() => {
              const personPayroll = Object.entries(driverSessions).map(([driverId, byDate]) => {
                const driver = drivers.find(d => d.id === driverId);
                const rate = Number(driver?.hourlyRate || 0);
                const dates = Object.keys(byDate).sort();
                const totalBillable = dates.reduce((sum, d) => sum + getDayBillable(byDate[d]), 0);
                const totalBreaks = dates.reduce((sum, date) => sum + byDate[date].sessions.reduce((sessionSum, session) => sessionSum + Number(session.breakMinutes || 0), 0), 0);
                const totalTrips = dates.reduce((sum, d) => sum + byDate[d].trips.length, 0);
                const billableHours = Math.round((totalBillable / 60) * 100) / 100;

                // Group days by calendar week (Mon-Sun) for weekly overtime
                const weekMap = {};
                dates.forEach(date => {
                  const d = new Date(date + 'T12:00:00');
                  const dayOfWeek = d.getDay();
                  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
                  const monday = new Date(d);
                  monday.setDate(monday.getDate() + mondayOffset);
                  const weekKey = localCalendarYmd(monday);
                  if (!weekMap[weekKey]) weekMap[weekKey] = { days: [], minutes: 0 };
                  const dayMinutes = getDayBillable(byDate[date]);
                  weekMap[weekKey].days.push(date);
                  weekMap[weekKey].minutes += dayMinutes;
                });

                let totalRegular = 0;
                let totalOvertime = 0;
                Object.values(weekMap).forEach(week => {
                  const weekRegular = Math.min(week.minutes, 2400) / 60;
                  const weekOvertime = Math.max(0, week.minutes - 2400) / 60;
                  totalRegular += weekRegular;
                  totalOvertime += weekOvertime;
                });

                const totalEarnings = totalRegular * rate + totalOvertime * rate * 1.5;

                const dailyBreakdown = dates.map(date => {
                  const day = byDate[date];
                  const dayBillable = getDayBillable(day);
                  const dayHours = Math.round((dayBillable / 60) * 100) / 100;
                  const dayEarnings = getDayEarnings(day, rate);
                  return { date, hours: dayHours, earnings: dayEarnings, trips: day.trips.length };
                });

                return { driver, driverId, rate, dates: dates.length, totalTrips, totalBillable, totalBreaks, billableHours, regularHours: totalRegular, overtimeHours: totalOvertime, totalEarnings, dailyBreakdown };
              }).sort((a, b) => b.totalEarnings - a.totalEarnings);

              const grandTotalEarnings = personPayroll.reduce((sum, p) => sum + p.totalEarnings, 0);
              const grandTotalHours = personPayroll.reduce((sum, p) => sum + p.billableHours, 0);
              const unresolvedTimesheets = Object.values(driverSessions).flatMap((byDate) => Object.values(byDate)).filter((day) => !day.approvalEligible);

              const allDates = Array.from(new Set(personPayroll.flatMap(p => p.dailyBreakdown.map(d => d.date)))).sort();
              const periodStart = allDates[0];
              const periodEnd = allDates[allDates.length - 1];

              if (personPayroll.length === 0) return <div className="p-8 text-center text-slate-500">No payroll data available</div>;

              return (
                <div className="divide-y divide-slate-100">
                  {personPayroll.map(({ driver, driverId, rate, dates: numDays, totalTrips, totalBillable, totalBreaks, billableHours, regularHours, overtimeHours, totalEarnings, dailyBreakdown }) => {
                    const isExpanded = expandedDriver === `payroll-${driverId}`;
                    const isDispatcher = driver?.role === 'dispatcher';
                    return (
                      <div key={driverId}>
                        <button onClick={() => setExpandedDriver(isExpanded ? null : `payroll-${driverId}`)} className="w-full p-4 hover:bg-slate-50 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDispatcher ? 'bg-purple-100' : 'bg-blue-100'}`}>
                              {isDispatcher ? <Briefcase className="w-4 h-4 text-purple-600" /> : <User className="w-4 h-4 text-blue-600" />}
                            </div>
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-slate-900">{driver?.name || driverId}</p>
                                <span className={`text-[9px] font-semibold uppercase px-1 py-0.5 rounded ${isDispatcher ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                  {isDispatcher ? 'DSP' : 'DRV'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500">{numDays} days · {totalTrips} trips</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <RateInput driver={driver} />
                            <div className="text-right">
                              <p className="text-sm font-semibold text-slate-900">{billableHours.toFixed(1)}h</p>
                              <p className="text-xs text-slate-500">{formatMinutes(totalBillable)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-green-700">{formatCurrency(totalEarnings)}</p>
                              {overtimeHours > 0 && <p className="text-[10px] text-amber-600">{overtimeHours.toFixed(1)}h OT @ 1.5x</p>}
                            </div>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4">
                            <div className="bg-slate-50 rounded-xl overflow-x-auto">
                              <div className="min-w-[480px]">
                                <div className="grid grid-cols-5 gap-2 px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase">
                                  <div>Date</div>
                                  <div className="text-center">Hours</div>
                                  <div className="text-center">Trips</div>
                                  <div className="text-center">Rate</div>
                                  <div className="text-right">Earnings</div>
                                </div>
                                {dailyBreakdown.map(day => (
                                  <div key={day.date} className="grid grid-cols-5 gap-2 px-4 py-2 border-t border-slate-100 text-sm">
                                    <div className="text-slate-700">{formatDate(day.date + 'T12:00:00')}</div>
                                    <div className="text-center text-slate-700">{day.hours.toFixed(1)}h</div>
                                    <div className="text-center text-slate-700">{day.trips}</div>
                                    <div className="text-center text-slate-500">${rate.toFixed(2)}</div>
                                    <div className="text-right font-medium text-slate-900">{formatCurrency(day.earnings)}</div>
                                  </div>
                                ))}
                                <div className="grid grid-cols-5 gap-2 px-4 py-2 border-t border-slate-200 bg-slate-100 text-sm font-semibold">
                                  <div className="text-slate-700">Subtotal</div>
                                  <div className="text-center text-slate-900">{billableHours.toFixed(1)}h</div>
                                  <div className="text-center text-slate-900">{totalTrips}</div>
                                  <div className="text-center text-slate-500">
                                    {overtimeHours > 0 ? <span className="text-xs">Reg + OT</span> : `$${rate.toFixed(2)}`}
                                  </div>
                                  <div className="text-right text-green-700">{formatCurrency(totalEarnings)}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="p-4 bg-slate-50 flex items-center justify-between flex-wrap gap-3">
                    <p className="text-sm font-medium text-slate-700">Total Payroll ({personPayroll.length} people)</p>
                    <div className="flex items-center gap-4 flex-wrap">
                      <p className="text-sm text-slate-600">{grandTotalHours.toFixed(1)} total hours</p>
                      <p className="text-xl font-semibold text-green-700">{formatCurrency(grandTotalEarnings)}</p>
                      {approvalMsg && (
                        <span className={`text-sm font-semibold ${approvalMsg.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>{approvalMsg.text}</span>
                      )}
                      {unresolvedTimesheets.length > 0 && <span className="text-sm font-semibold text-amber-700">{unresolvedTimesheets.length} timesheet(s) require a closed, valid event ledger.</span>}
                      <button
                        disabled={unresolvedTimesheets.length > 0}
                        onClick={() => {
                          const period = { startDate: periodStart, endDate: periodEnd, approvedAt: new Date().toISOString(), approvedBy: 'admin', totalHours: grandTotalHours, totalEarnings: grandTotalEarnings, people: personPayroll.map(p => ({ id: p.driverId, name: p.driver?.name, hours: p.billableHours, earnings: p.totalEarnings, rate: p.rate })) };
                          setDoc(doc(db, 'payrollRecords', `${periodStart}_${periodEnd}`), period, { merge: true }).then(() => {
                            setApprovalMsg({ type: 'success', text: 'Payroll approved and locked.' });
                          }).catch((err) => {
                            console.error('Payroll approval failed:', err);
                            setApprovalMsg({ type: 'error', text: 'Payroll approval failed.' });
                          });
                        }}
                        className="px-4 py-2 bg-green-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold hover:bg-green-700 transition-colors flex items-center gap-2"
                      >
                        <Lock size={14} /> Approve Payroll
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Same-view timesheet editor */}
      {editTimesheet && (
        <section className="mx-2 my-4 scroll-mt-24 rounded-2xl border border-blue-200 bg-blue-50/30 p-2 sm:mx-4 sm:p-3">
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200 w-full">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-900">Edit Timesheet — {formatDate(editTimesheet.date + 'T12:00:00')}</h3>
              <button onClick={() => setEditTimesheet(null)} className="p-2 text-slate-400 hover:bg-slate-200 rounded-full transition"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
              {editTimesheet.events.map((event, index) => (
                <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-3 bg-white border border-slate-200 p-3 rounded-xl">
                  <select autoFocus={index === 0} value={event.type} onChange={(e) => { const n = [...editTimesheet.events]; n[index].type = e.target.value; setEditTimesheet({ ...editTimesheet, events: n }); }}
                    className="p-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:outline-none focus:border-blue-500">
                    <option value="CLOCK_IN">Clock In</option>
                    <option value="CLOCK_OUT">Clock Out</option>
                    <option value="BREAK_START">Break Start</option>
                    <option value="BREAK_END">Break End</option>
                  </select>
                  <input type="time" value={timeInputValue(event.timestamp || event.at)}
                    onChange={(e) => { const [h, m] = e.target.value.split(':'); const d = new Date(editTimesheet.date + 'T00:00:00'); d.setHours(parseInt(h), parseInt(m)); const n = [...editTimesheet.events]; n[index].timestamp = d.toISOString(); setEditTimesheet({ ...editTimesheet, events: n }); }}
                    className="flex-1 p-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                  <button onClick={() => setEditTimesheet({ ...editTimesheet, events: editTimesheet.events.filter((_, i) => i !== index) })}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 size={16} /></button>
                </div>
              ))}
              <button onClick={() => { const d = new Date(editTimesheet.date + 'T09:00:00'); setEditTimesheet({ ...editTimesheet, events: [...editTimesheet.events, { type: 'CLOCK_IN', at: d.toISOString(), timestamp: d.toISOString() }] }); }}
                className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors font-bold text-sm">
                <Plus size={16} /> Add Event
              </button>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Correction reason</label>
                <input value={editTimesheet.correctionReason || ''} onChange={(event) => setEditTimesheet({ ...editTimesheet, correctionReason: event.target.value })}
                  placeholder="Required for the audit trail" className="w-full p-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              </div>
              {editValidation && !editValidation.valid && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {editValidation.anomalies.map((issue, index) => <p key={`${issue.code}-${index}`}>{issue.message}</p>)}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3 bg-slate-50">
              <button onClick={() => setEditTimesheet(null)} className="flex-1 p-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition">Cancel</button>
              <button disabled={timesheetSaving || !editValidation?.valid || !editTimesheet.correctionReason?.trim()} onClick={async () => {
                try {
                  setTimesheetSaving(true);
                  await onUpdateClockEvents?.(editTimesheet.driverId, editTimesheet.date, editValidation.normalizedEvents, editTimesheet.correctionReason.trim());
                  setEditTimesheet(null);
                } catch (error) {
                  setApprovalMsg({ type: 'error', text: error.message || 'Timesheet correction could not be saved.' });
                } finally { setTimesheetSaving(false); }
              }}
                className="flex-1 p-3 bg-blue-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2">
                <Save size={16} /> {timesheetSaving ? 'Saving…' : 'Save correction'}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default TimeTrackingAdmin;
