import React, { useState, useMemo, useEffect } from 'react';
import { Archive, Calendar, RefreshCcw, Search, X, ChevronDown, ChevronRight, Clock } from 'lucide-react';

const today = new Date().toISOString().split('T')[0];

const formatClock24 = (value) => {
  if (!value) return '—';
  const s = String(value).trim();
  if (s.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
  }
  const m = s.toUpperCase().match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = m[2];
    const p = m[3];
    if (p === 'PM' && h < 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${min}`;
  }
  return '—';
};

const timeToMinutes = (value) => {
  if (!value) return 1440;
  const cleanTime = String(value).toUpperCase().trim();
  if (cleanTime === 'WILL CALL' || cleanTime === 'WC') return 1440;
  const m = cleanTime.match(/(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?/);
  if (!m) return 1440;
  let h = parseInt(m[1], 10);
  const minutes = parseInt(m[2] || '0', 10);
  const p = m[3];
  if (p === 'PM' && h < 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return h * 60 + minutes;
};

const parseDateOrClock = (value) => {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = s.toUpperCase().match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const p = m[3];
  if (p === 'PM' && h < 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d;
};

const calcMiles = (pickupOdo, dropoffOdo) => {
  if (!pickupOdo || !dropoffOdo) return '—';
  const diff = Number(dropoffOdo) - Number(pickupOdo);
  return diff > 0 ? diff.toFixed(1) : '—';
};

const calcDuration = (start, end) => {
  if (!start || !end) return '—';
  const s = parseDateOrClock(start);
  const e = parseDateOrClock(end);
  if (!s || !e || isNaN(s.getTime()) || isNaN(e.getTime())) return '—';
  const diff = Math.round((e - s) / 60000);
  if (diff < 0) return '—';
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return h > 0 ? `${h}h${m > 0 ? m : ''}` : `${m}m`;
};

const formatDateLabel = (dateStr) => {
  if (dateStr === 'No Date') return 'No Date';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

const getDriverLabel = (trip, drivers) => {
  if (!drivers || !trip) return '—';
  const driver = drivers.find(d => d.id === trip.driverId || d.email === trip.driverEmail);
  return driver?.name || trip.driverName || '—';
};

const Columns = [
  { key: 'date', label: 'Date', sortKey: 'date' },
  { key: 'driver', label: 'Driver', sortKey: 'driver' },
  { key: 'time', label: 'Scheduled Time', sortKey: 'time' },
  { key: 'bookingId', label: 'Trip ID', sortKey: 'bookingId' },
  { key: 'patient', label: 'Passenger', sortKey: 'patient' },
  { key: 'pickup', label: 'Pickup Address', sortKey: 'pickup' },
  { key: 'dropoff', label: 'Dropoff Address', sortKey: 'dropoff' },
  { key: 'arrivalTime', label: 'Pickup Arrival', sortKey: 'arrivalTime' },
  { key: 'departedPickupTime', label: 'Departed Pickup', sortKey: 'departedPickupTime' },
  { key: 'arrivalDropoffTime', label: 'Dropoff Arrival', sortKey: 'arrivalDropoffTime' },
  { key: 'pickupOdometer', label: 'Start Odometer', sortKey: 'pickupOdometer' },
  { key: 'dropoffOdometer', label: 'End Odometer', sortKey: 'dropoffOdometer' },
  { key: 'travelTime', label: 'Travel Time', sortKey: 'travelTime' },
  { key: 'distance', label: 'Distance (mi)', sortKey: 'distance' },
  { key: 'signature', label: 'Signature', sortKey: 'signature' },
  { key: 'vehicle', label: 'Vehicle', sortKey: 'vehicle' },
];

const FIELD_FOR_COL = {
  date: 'date', driver: 'driverId', time: 'time', bookingId: 'bookingId',
  patient: 'patient', pickup: 'pickup', dropoff: 'dropoff',
  arrivalTime: 'arrivalTime', departedPickupTime: 'departedPickupTime', arrivalDropoffTime: 'arrivalDropoffTime',
  pickupOdometer: 'pickupOdometer', dropoffOdometer: 'dropoffOdometer',
  travelTime: 'travelTime', distance: 'distance',
  signature: 'paperSignatureConfirmed', vehicle: 'completedVehicle',
};

const ArchivesPage = ({ trashedTrips = [], restoreTrip, drivers = [], role, updateTrashedTrip }) => {
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('agape_archiveSearch') || '');
  const [sortColumn, setSortColumn] = useState(() => localStorage.getItem('agape_archiveSortCol') || 'time');
  const [sortDirection, setSortDirection] = useState(() => localStorage.getItem('agape_archiveSortDir') || 'asc');
  const [startDate, setStartDate] = useState(() => localStorage.getItem('agape_archiveStartDate') || '');
  const [endDate, setEndDate] = useState(() => localStorage.getItem('agape_archiveEndDate') || '');
  const [expandedTripId, setExpandedTripId] = useState(null);

  const toggleTripExpand = (tripId) => {
    setExpandedTripId(prev => prev === tripId ? null : tripId);
  };
  const [expandedGroups, setExpandedGroups] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('agape_archiveExpandedGroups') || '{}');
    } catch { return {}; }
  });

  useEffect(() => {
    localStorage.setItem('agape_archiveSearch', searchQuery);
    localStorage.setItem('agape_archiveSortCol', sortColumn);
    localStorage.setItem('agape_archiveSortDir', sortDirection);
    localStorage.setItem('agape_archiveStartDate', startDate);
    localStorage.setItem('agape_archiveEndDate', endDate);
    localStorage.setItem('agape_archiveExpandedGroups', JSON.stringify(expandedGroups));
  }, [searchQuery, sortColumn, sortDirection, startDate, endDate, expandedGroups]);

  const toggleGroup = (dateLabel) => {
    setExpandedGroups(prev => ({
      ...prev,
      [dateLabel]: !prev[dateLabel]
    }));
  };

  const getSortValue = (trip, key) => {
    switch (key) {
      case 'date': return trip.date || '';
      case 'driver': return getDriverLabel(trip, drivers);
      case 'time':
        if ((trip.date || '') !== '') return trip.date + String(timeToMinutes(trip.time)).padStart(4, '0');
        return String(timeToMinutes(trip.time)).padStart(4, '0');
      case 'bookingId': return trip.bookingId || trip.id || '';
      case 'patient': return trip.patient || '';
      case 'pickup': return trip.pickup || '';
      case 'dropoff': return trip.dropoff || '';
      case 'arrivalTime': return trip.arrivalTime || '';
      case 'departedPickupTime': return trip.departedPickupTime || '';
      case 'arrivalDropoffTime': return trip.arrivalDropoffTime || '';
      case 'pickupOdometer': return Number(trip.pickupOdometer || 0);
      case 'dropoffOdometer': return Number(trip.dropoffOdometer || 0);
      case 'travelTime': return (trip.departedPickupTime || trip.arrivalTime) && (trip.arrivalDropoffTime || trip.completedAt) ? new Date(trip.arrivalDropoffTime || trip.completedAt) - new Date(trip.departedPickupTime || trip.arrivalTime) : 0;
      case 'distance': return calcMiles(trip.pickupOdometer, trip.dropoffOdometer);
      case 'signature': return trip.paperSignatureConfirmed ? 1 : 0;
      case 'vehicle': return trip.completedVehicle || '';
      default: return '';
    }
  };

  const renderCellValue = (trip, col) => {
    switch (col.key) {
      case 'date': return formatDateLabel(trip.date || 'No Date');
      case 'driver': return getDriverLabel(trip, drivers);
      case 'time': return formatClock24(trip.time) !== '—' ? formatClock24(trip.time) : formatClock24(trip.arrivalTime);
      case 'bookingId': return trip.bookingId || trip.id || '—';
      case 'patient': return trip.patient || '—';
      case 'pickup': return trip.pickup || '—';
      case 'dropoff': return trip.dropoff || '—';
      case 'arrivalTime': return formatClock24(trip.arrivalTime);
      case 'departedPickupTime': return formatClock24(trip.departedPickupTime);
      case 'arrivalDropoffTime': return formatClock24(trip.arrivalDropoffTime || trip.completedAt);
      case 'pickupOdometer': return trip.pickupOdometer || '';
      case 'dropoffOdometer': return trip.dropoffOdometer || '';
      case 'travelTime': return calcDuration(trip.departedPickupTime || trip.arrivalTime, trip.arrivalDropoffTime || trip.completedAt);
      case 'distance': { const m = calcMiles(trip.pickupOdometer, trip.dropoffOdometer); return m !== '—' ? m : '—'; }
      case 'signature': {
        if (!('paperSignatureConfirmed' in trip)) return '—';
        return trip.paperSignatureConfirmed ? 'Yes' : 'No';
      }
      case 'vehicle': { const v = trip.completedVehicle || ''; return v && v !== 'Pending Assignment' ? v : '—'; }
      default: return '—';
    }
  };

  const filtered = useMemo(() => {
    let list = [...trashedTrips];

    if (startDate) list = list.filter(t => (t.date || '') >= startDate);
    if (endDate) list = list.filter(t => (t.date || '') <= endDate);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t =>
        (t.patient || '').toLowerCase().includes(q) ||
        (t.bookingId || '').toLowerCase().includes(q) ||
        (t.id || '').toLowerCase().includes(q) ||
        (t.pickup || '').toLowerCase().includes(q) ||
        (t.dropoff || '').toLowerCase().includes(q) ||
        (t.driverName || '').toLowerCase().includes(q) ||
        getDriverLabel(t, drivers).toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let cmp = 0;
      const aVal = getSortValue(a, sortColumn);
      const bVal = getSortValue(b, sortColumn);
      if (typeof aVal === 'string' && typeof bVal === 'string') cmp = aVal.localeCompare(bVal);
      else if (aVal < bVal) cmp = -1;
      else if (aVal > bVal) cmp = 1;
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [trashedTrips, searchQuery, sortColumn, sortDirection, startDate, endDate, drivers]);

  const [statusFilter, setStatusFilter] = useState('all');

  const filteredByStatus = useMemo(() => {
    if (statusFilter === 'all') return filtered;
    return filtered.filter(t => (t.status || '').toLowerCase() === statusFilter.toLowerCase());
  }, [filtered, statusFilter]);

  const grouped = useMemo(() => {
    const groups = filteredByStatus.reduce((acc, trip) => {
      const key = trip.date || 'No Date';
      if (!acc[key]) acc[key] = [];
      acc[key].push(trip);
      return acc;
    }, {});
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredByStatus]);

  const reroutedCount = useMemo(() =>
    filtered.filter(t => (t.status || '').toLowerCase() === 'rerouted').length,
  [filtered]);

  return (
    <div className="flex flex-col min-h-full bg-slate-100">
      <div className="bg-white border-b border-slate-200 px-3 py-1.5 flex flex-wrap items-center gap-1.5 sticky top-0 z-20 shrink-0">
        <div className="flex items-center gap-1 bg-slate-100 rounded px-2 py-1 min-w-[140px] max-w-[240px]">
          <Search size={11} className="text-slate-400 shrink-0" />
          <input type="text" placeholder="Search trips..." value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs outline-none w-full placeholder:text-slate-400" />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600"><X size={11} /></button>}
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded px-2 py-1">
          <Calendar size={11} className="text-slate-400" />
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="px-1 py-0.5 border border-slate-200 rounded text-[10px] outline-none focus:border-blue-500 w-[110px]" />
          <span className="text-[9px] text-slate-400">to</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="px-1 py-0.5 border border-slate-200 rounded text-[10px] outline-none focus:border-blue-500 w-[110px]" />
        </div>
        <div className="flex items-center gap-0.5 ml-auto">
          <button onClick={() => setStatusFilter('all')}
            className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-colors ${statusFilter === 'all' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            All ({filteredByStatus.length})
          </button>
          <button onClick={() => setStatusFilter('Rerouted')}
            className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-colors ${statusFilter === 'Rerouted' ? 'bg-purple-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            Rerouted ({reroutedCount})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Archive size={40} className="mb-3 opacity-40" />
            <p className="text-sm font-medium">No archived trips found</p>
          </div>
        ) : (
          grouped.map(([dateLabel, dayTrips]) => {
            const groupExpanded = expandedGroups[dateLabel] !== false;
            return (
            <div key={dateLabel} className="border-b border-slate-200 last:border-b-0">
              <div
                className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 px-4 py-2 flex items-center gap-2 cursor-pointer hover:bg-slate-200 transition-colors"
                onClick={() => toggleGroup(dateLabel)}
              >
                {groupExpanded ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
                <Calendar size={13} className="text-slate-500" />
                <span className="text-sm font-bold text-slate-700">{formatDateLabel(dateLabel)}</span>
                <span className="text-xs text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">{dayTrips.length} trips</span>
              </div>

              {groupExpanded && (
              <div className="px-3 py-2 space-y-2">
                {dayTrips.map((trip) => {
                  const driverName = getDriverLabel(trip, drivers);
                  const tripExpanded = expandedTripId === trip.id;
                  const isRerouted = (trip.status || '').toLowerCase() === 'rerouted';

                  return (
                  <div key={trip.id}>
                    {/* Collapsed card */}
                    <div
                      className={`bg-white rounded-2xl border shadow-sm transition-all cursor-pointer ${tripExpanded ? 'border-blue-300 shadow-md' : 'border-slate-200 hover:border-slate-300'} ${isRerouted ? 'border-l-4 border-l-purple-400' : ''}`}
                      onClick={() => toggleTripExpand(trip.id)}
                    >
                      <div className="px-4 py-3 flex items-center gap-3">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Clock size={16} className="text-slate-400 shrink-0" />
                          <span className="text-[19px] font-black text-slate-800 shrink-0">{formatClock24(trip.time) || '—'}</span>
                          <span className="text-[15px] font-bold text-slate-900 truncate">{trip.patient || 'No Patient'}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isRerouted && <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">Rerouted</span>}
                          <span className="text-[11px] font-mono text-blue-600 font-semibold">#{trip.bookingId || trip.id}</span>
                          {tripExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                        </div>
                      </div>
                    </div>

                    {/* Expanded details card */}
                    {tripExpanded && (
                    <div className="mt-2">
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50/50 border-b border-slate-200 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Trip</span>
                            <span className="text-xs font-mono font-bold text-blue-600">{trip.bookingId || trip.id}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-500 font-medium">{driverName}</span>
                            {isRerouted && <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">Rerouted</span>}
                            {!isRerouted && trip.completedVehicle && trip.completedVehicle !== 'Pending Assignment' && (
                              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{trip.completedVehicle}</span>
                            )}
                          </div>
                        </div>

                        <div className="p-4 border-b border-slate-100">
                          <h3 className="text-sm font-bold text-slate-900 mb-3">{trip.patient || 'No Patient'}</h3>
                          <div className="flex items-stretch gap-3">
                            <div className="flex flex-col items-center pt-1.5 pb-1.5">
                              <div className="w-[7px] h-[7px] rounded-full bg-blue-500 ring-2 ring-blue-100" />
                              <div className="w-[1.5px] h-5 bg-slate-200 my-0.5 rounded-full" />
                              <div className="w-[7px] h-[7px] rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
                            </div>
                            <div className="flex flex-col gap-2 flex-1 min-w-0">
                              <div>
                                <p className="text-[13px] font-medium text-slate-600 truncate">{trip.pickup || '—'}</p>
                                {trip.arrivalTime && <p className="text-[11px] text-emerald-600 font-medium">Arrived: {formatClock24(trip.arrivalTime)}</p>}
                              </div>
                              <div>
                                <p className="text-[13px] font-medium text-slate-600 truncate">{trip.dropoff || '—'}</p>
                                {trip.arrivalDropoffTime && <p className="text-[11px] text-rose-600 font-medium">Arrived: {formatClock24(trip.arrivalDropoffTime)}</p>}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 border-b border-slate-100">
                          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                            <div>
                              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Schedule</span>
                              <div className="mt-1.5 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <Clock size={11} className="text-slate-400" />
                                    <span className="text-[11px] text-slate-500">Scheduled</span>
                                  </div>
                                  <span className="text-[11px] font-semibold text-slate-800">{formatClock24(trip.time) || '—'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <Clock size={11} className="text-emerald-400" />
                                    <span className="text-[11px] text-slate-500">Arrived Pickup</span>
                                  </div>
                                  <span className="text-[11px] font-semibold text-emerald-600">{formatClock24(trip.arrivalTime) || '—'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <Clock size={11} className="text-amber-400" />
                                    <span className="text-[11px] text-slate-500">Departed Pickup</span>
                                  </div>
                                  <span className="text-[11px] font-semibold text-amber-600">{formatClock24(trip.departedPickupTime) || '—'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <Clock size={11} className="text-rose-400" />
                                    <span className="text-[11px] text-slate-500">Arrived Dropoff</span>
                                  </div>
                                  <span className="text-[11px] font-semibold text-rose-600">{formatClock24(trip.arrivalDropoffTime || trip.completedAt) || '—'}</span>
                                </div>
                              </div>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Vehicle</span>
                              <div className="mt-1.5 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] text-slate-500">Start Odometer</span>
                                  <span className="text-[11px] font-semibold text-emerald-600 font-mono">{trip.pickupOdometer || '—'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] text-slate-500">End Odometer</span>
                                  <span className="text-[11px] font-semibold text-rose-600 font-mono">{trip.dropoffOdometer || '—'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] text-slate-500">Distance</span>
                                  <span className="text-[11px] font-bold text-blue-600">{calcMiles(trip.pickupOdometer, trip.dropoffOdometer)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] text-slate-500">Travel Time</span>
                                  <span className="text-[11px] font-semibold text-slate-800">{calcDuration(trip.departedPickupTime || trip.arrivalTime, trip.arrivalDropoffTime || trip.completedAt)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {isRerouted && trip.cancellationReason && (
                        <div className="px-4 py-2.5 border-b border-slate-100 bg-purple-50/30">
                          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Reroute Reason</span>
                          <p className="text-[12px] text-slate-700 mt-0.5">{trip.cancellationReason}</p>
                          {trip.cancelledBy && <p className="text-[10px] text-slate-400 mt-0.5">by {trip.cancelledBy}</p>}
                        </div>
                        )}

                        <div className="px-4 py-2 bg-slate-50 flex items-center justify-between">
                          <span className="text-[10px] text-slate-400">{formatDateLabel(trip.date || '')}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500">Signature:</span>
                            <span className={`text-[11px] font-bold ${trip.paperSignatureConfirmed ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {trip.paperSignatureConfirmed ? 'Yes' : 'No'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {restoreTrip && (
                      <div className="mt-2 flex justify-end">
                        <button onClick={(e) => { e.stopPropagation(); restoreTrip(trip.id); }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm">
                          <RefreshCcw size={12} /> Restore Trip
                        </button>
                      </div>
                      )}
                    </div>
                    )}
                  </div>
                  );
                })}
              </div>
              )}
            </div>
          );
          })
        )}
      </div>
    </div>
  );
};

export default ArchivesPage;
