/**
 * TimeTrackingAdmin.jsx - Admin audit view for time tracking sessions.
 * Shows session breakdown, gap logs, abuse flags, and payroll output.
 */

import React, { useState, useMemo } from 'react';
import {
  Clock,
  MapPin,
  AlertTriangle,
  Play,
  Pause,
  CheckCircle,
  XCircle,
  DollarSign,
  FileText,
  Filter,
  Download,
  ChevronDown,
  ChevronUp,
  Shield,
  Timer,
  TrendingUp,
  User,
  Navigation,
} from 'lucide-react';

const formatMinutes = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
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

const getEventIcon = (type) => {
  switch (type) {
    case 'CLOCK_IN': case 'AUTO_CLOCK_IN': return <Play className="w-3 h-3 text-green-500" />;
    case 'CLOCK_OUT': return <XCircle className="w-3 h-3 text-red-500" />;
    case 'BREAK_START': return <Pause className="w-3 h-3 text-yellow-500" />;
    case 'BREAK_END': return <Play className="w-3 h-3 text-blue-500" />;
    case 'TRIP_COMPLETED': return <CheckCircle className="w-3 h-3 text-emerald-500" />;
    default: return <Clock className="w-3 h-3 text-gray-500" />;
  }
};

const getGapClassificationColor = (classification) => {
  switch (classification) {
    case 'SHORT': return 'bg-green-100 text-green-800';
    case 'MEDIUM': return 'bg-yellow-100 text-yellow-800';
    case 'LONG': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const TimeTrackingAdmin = ({ drivers = [], trips = [], clockEvents = [], timeData = null }) => {
  const [selectedDriver, setSelectedDriver] = useState('ALL');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [expandedDriver, setExpandedDriver] = useState(null);
  const [activeTab, setActiveTab] = useState('sessions');

  // Filter drivers by selected
  const filteredDrivers = useMemo(() => {
    if (selectedDriver === 'ALL') return drivers;
    return drivers.filter(d => d.id === selectedDriver);
  }, [drivers, selectedDriver]);

  // Build sessions per driver from timeData
  const driverSessions = useMemo(() => {
    if (!timeData) return {};
    const sessions = {};
    filteredDrivers.forEach(driver => {
      const driverId = driver.id;
      const driverTrips = (timeData.trips || []).filter(t => t.driverId === driverId);
      const driverClockEvents = (timeData.clockEvents || []).filter(e => e.driverId === driverId);
      const driverGaps = (timeData.gaps || []).filter(g => g.driverId === driverId);
      const driverTeleports = (timeData.teleports || []).filter(t => t.driverId === driverId);

      // Group by date
      const byDate = {};
      driverTrips.forEach(trip => {
        const date = trip.date || (trip.completedAt ? new Date(trip.completedAt).toISOString().split('T')[0] : null);
        if (!date) return;
        if (!byDate[date]) byDate[date] = { trips: [], clockEvents: [], gaps: [], teleports: [] };
        byDate[date].trips.push(trip);
      });

      driverClockEvents.forEach(event => {
        const date = event.date || (event.at ? new Date(event.at).toISOString().split('T')[0] : null);
        if (!date) return;
        if (!byDate[date]) byDate[date] = { trips: [], clockEvents: [], gaps: [], teleports: [] };
        byDate[date].clockEvents.push(event);
      });

      driverGaps.forEach(gap => {
        const date = gap.date;
        if (!date) return;
        if (!byDate[date]) byDate[date] = { trips: [], clockEvents: [], gaps: [], teleports: [] };
        byDate[date].gaps.push(gap);
      });

      driverTeleports.forEach(teleport => {
        const date = teleport.date;
        if (!date) return;
        if (!byDate[date]) byDate[date] = { trips: [], clockEvents: [], gaps: [], teleports: [] };
        byDate[date].teleports.push(teleport);
      });

      sessions[driverId] = byDate;
    });
    return sessions;
  }, [filteredDrivers, timeData]);

  // Summary stats
  const summaryStats = useMemo(() => {
    if (!timeData) return null;
    const allSessions = Object.values(driverSessions).flatMap(byDate => Object.values(byDate));
    const totalTrips = allSessions.reduce((sum, s) => sum + s.trips.length, 0);
    const totalGaps = allSessions.reduce((sum, s) => sum + s.gaps.length, 0);
    const totalTeleports = allSessions.reduce((sum, s) => sum + s.teleports.length, 0);
    const excludedMinutes = allSessions.reduce((sum, s) =>
      sum + s.gaps.filter(g => g.payrollEffect === 'EXCLUDED').reduce((s2, g) => s2 + g.durationMinutes, 0), 0
    );

    return {
      totalTrips,
      totalGaps,
      totalTeleports,
      excludedMinutes,
    };
  }, [driverSessions, timeData]);

  // Export CSV
  const exportCSV = () => {
    if (!timeData) return;
    const rows = [['Driver', 'Date', 'Clock In', 'Clock Out', 'Billable Minutes', 'Break Minutes', 'Gap Minutes', 'Trips', 'Gaps', 'Teleports']];
    Object.entries(driverSessions).forEach(([driverId, byDate]) => {
      const driver = drivers.find(d => d.id === driverId);
      Object.entries(byDate).forEach(([date, session]) => {
        const clockIn = session.clockEvents.find(e => e.type === 'IN' || e.type === 'CLOCK_IN' || e.type === 'AUTO_CLOCK_IN');
        const clockOut = session.clockEvents.find(e => e.type === 'OUT' || e.type === 'CLOCK_OUT');
        const billable = session.trips.reduce((sum, t) => sum + (t.billableMinutes || 0), 0);
        const breaks = session.gaps.filter(g => g.gapType === 'BREAK').reduce((sum, g) => sum + g.durationMinutes, 0);
        const gaps = session.gaps.filter(g => g.payrollEffect === 'EXCLUDED').reduce((sum, g) => sum + g.durationMinutes, 0);
        rows.push([
          driver?.name || driverId,
          date,
          clockIn?.at ? formatTime(clockIn.at) : '',
          clockOut?.at ? formatTime(clockOut.at) : '',
          Math.round(billable),
          Math.round(breaks),
          Math.round(gaps),
          session.trips.length,
          session.gaps.length,
          session.teleports.length,
        ]);
      });
    });

    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agape-timetracking-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Timer className="w-6 h-6 text-blue-600" />
              Time Tracking Audit
            </h1>
            <p className="text-sm text-gray-500 mt-1">Review driver sessions, gaps, and payroll</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Driver</label>
              <select
                value={selectedDriver}
                onChange={(e) => setSelectedDriver(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Drivers</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name || d.id}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[150px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
              <input
                type="date"
                value={dateRange.from}
                onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="min-w-[150px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
              <input
                type="date"
                value={dateRange.to}
                onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        {summaryStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Navigation className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Trips</p>
                  <p className="text-xl font-bold text-gray-900">{summaryStats.totalTrips}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-50 rounded-lg">
                  <Clock className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Gaps</p>
                  <p className="text-xl font-bold text-gray-900">{summaryStats.totalGaps}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-50 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Teleport Flags</p>
                  <p className="text-xl font-bold text-gray-900">{summaryStats.totalTeleports}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 rounded-lg">
                  <FileText className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Excluded Minutes</p>
                  <p className="text-xl font-bold text-gray-900">{formatMinutes(summaryStats.excludedMinutes)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
          {[
            { id: 'sessions', label: 'Sessions' },
            { id: 'gaps', label: 'Gap Log' },
            { id: 'abuse', label: 'Abuse Flags' },
            { id: 'payroll', label: 'Payroll' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
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

              return (
                <div key={driverId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setExpandedDriver(isExpanded ? null : driverId)}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <User className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-900">{driver?.name || driverId}</p>
                        <p className="text-sm text-gray-500">{dates.length} days · {totalTrips} trips</p>
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100">
                      {dates.map(date => {
                        const day = byDate[date];
                        const clockIn = day.clockEvents.find(e => e.type === 'IN' || e.type === 'CLOCK_IN' || e.type === 'AUTO_CLOCK_IN');
                        const clockOut = day.clockEvents.find(e => e.type === 'OUT' || e.type === 'CLOCK_OUT');
                        const billable = day.trips.reduce((sum, t) => sum + (t.billableMinutes || 0), 0);
                        const breaks = day.gaps.filter(g => g.gapType === 'BREAK').reduce((sum, g) => sum + g.durationMinutes, 0);

                        return (
                          <div key={date} className="px-4 py-3 border-t border-gray-50">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-gray-900">{formatDate(date + 'T12:00:00')}</span>
                                <span className="text-sm text-gray-500">
                                  {formatTime(clockIn?.at)} → {formatTime(clockOut?.at)}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-gray-600">
                                <span className="flex items-center gap-1">
                                  <Timer className="w-3 h-3" />
                                  {formatMinutes(billable)}
                                </span>
                                <span className="flex items-center gap-1 text-yellow-600">
                                  <Pause className="w-3 h-3" />
                                  {formatMinutes(breaks)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Navigation className="w-3 h-3" />
                                  {day.trips.length} trips
                                </span>
                              </div>
                            </div>
                            {day.trips.length > 0 && (
                              <div className="ml-4 space-y-1">
                                {day.trips.map((trip, i) => (
                                  <div key={trip.id || i} className="flex items-center gap-2 text-sm">
                                    <CheckCircle className="w-3 h-3 text-emerald-500" />
                                    <span className="text-gray-700">{trip.patient || trip.id}</span>
                                    <span className="text-gray-400">→</span>
                                    <span className="text-gray-500">{trip.destination || '—'}</span>
                                    {trip.billableMinutes > 0 && (
                                      <span className="text-gray-400 text-xs">{formatMinutes(trip.billableMinutes)}</span>
                                    )}
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
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <Timer className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No time tracking sessions found</p>
                <p className="text-sm text-gray-400 mt-1">Sessions are created automatically when drivers clock in</p>
              </div>
            )}
          </div>
        )}

        {/* Gap Log Tab */}
        {activeTab === 'gaps' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-medium text-gray-900">Gap Analysis</h3>
              <p className="text-sm text-gray-500">Gaps between events classified by duration and payroll effect</p>
            </div>
            <div className="divide-y divide-gray-100">
              {(() => {
                const allGaps = Object.entries(driverSessions).flatMap(([driverId, byDate]) =>
                  Object.entries(byDate).flatMap(([date, session]) =>
                    session.gaps.map(g => ({ ...g, driverId, date }))
                  )
                ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                if (allGaps.length === 0) {
                  return (
                    <div className="p-8 text-center text-gray-500">
                      No gaps recorded yet
                    </div>
                  );
                }

                return allGaps.map((gap, i) => (
                  <div key={i} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getGapClassificationColor(gap.classification)}`}>
                          {gap.classification}
                        </span>
                        <div>
                          <p className="text-sm text-gray-900">
                            {gap.gapType === 'TRIP' ? 'Between trips' : gap.gapType === 'BREAK' ? 'Break' : 'After trip'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatDate(gap.timestamp)} at {formatTime(gap.timestamp)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">{formatMinutes(gap.durationMinutes)}</p>
                        <p className={`text-xs ${gap.payrollEffect === 'EXCLUDED' ? 'text-red-500' : 'text-green-500'}`}>
                          {gap.payrollEffect === 'EXCLUDED' ? 'Excluded from payroll' : 'Counted in payroll'}
                        </p>
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* Abuse Flags Tab */}
        {activeTab === 'abuse' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-medium text-gray-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-red-500" />
                Abuse Detection
              </h3>
              <p className="text-sm text-gray-500">GPS spoofing, teleport, and abnormal activity flags</p>
            </div>
            <div className="divide-y divide-gray-100">
              {(() => {
                const allFlags = Object.entries(driverSessions).flatMap(([driverId, byDate]) =>
                  Object.entries(byDate).flatMap(([date, session]) =>
                    session.teleports.map(t => ({ ...t, driverId, date }))
                  )
                ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                if (allFlags.length === 0) {
                  return (
                    <div className="p-8 text-center">
                      <Shield className="w-12 h-12 text-green-300 mx-auto mb-4" />
                      <p className="text-green-600 font-medium">No abuse flags detected</p>
                      <p className="text-sm text-gray-400 mt-1">All GPS activity looks normal</p>
                    </div>
                  );
                }

                return allFlags.map((flag, i) => (
                  <div key={i} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-50 rounded-lg">
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{flag.flagType || 'GPS Anomaly'}</p>
                          <p className="text-xs text-gray-500">
                            {formatDate(flag.timestamp)} at {formatTime(flag.timestamp)}
                            {flag.mph ? ` · ${Math.round(flag.mph)} mph` : ''}
                          </p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">
                        {flag.severity || 'HIGH'}
                      </span>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* Payroll Tab */}
        {activeTab === 'payroll' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-medium text-gray-900 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-green-600" />
                Payroll Summary
              </h3>
              <p className="text-sm text-gray-500">Billable hours and estimated payroll by driver</p>
            </div>
            <div className="divide-y divide-gray-100">
              {(() => {
                const driverPayroll = Object.entries(driverSessions).map(([driverId, byDate]) => {
                  const driver = drivers.find(d => d.id === driverId);
                  const dates = Object.keys(byDate);
                  const totalBillable = dates.reduce((sum, d) =>
                    sum + byDate[d].trips.reduce((s, t) => s + (t.billableMinutes || 0), 0), 0
                  );
                  const totalBreaks = dates.reduce((sum, d) =>
                    sum + byDate[d].gaps.filter(g => g.gapType === 'BREAK').reduce((s, g) => s + g.durationMinutes, 0), 0
                  );
                  const totalExcluded = dates.reduce((sum, d) =>
                    sum + byDate[d].gaps.filter(g => g.payrollEffect === 'EXCLUDED').reduce((s, g) => s + g.durationMinutes, 0), 0
                  );
                  const totalTrips = dates.reduce((sum, d) => sum + byDate[d].trips.length, 0);

                  return {
                    driver,
                    driverId,
                    days: dates.length,
                    totalTrips,
                    totalBillable,
                    totalBreaks,
                    totalExcluded,
                    billableHours: Math.round((totalBillable / 60) * 100) / 100,
                  };
                }).sort((a, b) => b.billableHours - a.billableHours);

                if (driverPayroll.length === 0) {
                  return (
                    <div className="p-8 text-center text-gray-500">
                      No payroll data available
                    </div>
                  );
                }

                return (
                  <>
                    <div className="p-4 bg-gray-50">
                      <div className="grid grid-cols-6 gap-4 text-xs font-medium text-gray-500 uppercase">
                        <div>Driver</div>
                        <div className="text-center">Days</div>
                        <div className="text-center">Trips</div>
                        <div className="text-center">Billable</div>
                        <div className="text-center">Breaks</div>
                        <div className="text-center">Excluded</div>
                      </div>
                    </div>
                    {driverPayroll.map(({ driver, driverId, days, totalTrips, totalBillable, totalBreaks, totalExcluded, billableHours }) => (
                      <div key={driverId} className="p-4">
                        <div className="grid grid-cols-6 gap-4 items-center">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{driver?.name || driverId}</p>
                          </div>
                          <div className="text-center text-sm text-gray-700">{days}</div>
                          <div className="text-center text-sm text-gray-700">{totalTrips}</div>
                          <div className="text-center">
                            <span className="text-sm font-semibold text-gray-900">{billableHours}h</span>
                            <span className="text-xs text-gray-400 ml-1">({formatMinutes(totalBillable)})</span>
                          </div>
                          <div className="text-center text-sm text-yellow-600">{formatMinutes(totalBreaks)}</div>
                          <div className="text-center text-sm text-red-500">{formatMinutes(totalExcluded)}</div>
                        </div>
                      </div>
                    ))}
                    <div className="p-4 bg-gray-50 border-t">
                      <div className="flex justify-end">
                        <div className="text-right">
                          <p className="text-sm text-gray-500">Total Billable Hours</p>
                          <p className="text-xl font-bold text-gray-900">
                            {driverPayroll.reduce((sum, d) => sum + d.billableHours, 0).toFixed(1)}h
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimeTrackingAdmin;
