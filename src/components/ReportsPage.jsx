import React, { useMemo, useState } from 'react';
import {
  Calendar, Download, FileText, Filter, CheckCircle2, AlertTriangle,
  XCircle, Edit2, Save, X, Check, Search, ArrowUp, ArrowDown,
  ArrowUpDown, ChevronDown, RefreshCw, BarChart3
} from 'lucide-react';

const STATUS_OPTIONS = ['Completed', 'No Show', 'Cancelled'];

const today = new Date().toISOString().split('T')[0];
const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

const STATUS_VARIANT = {
  Completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'No Show': 'bg-rose-100 text-rose-700 border-rose-200',
  Cancelled: 'bg-amber-100 text-amber-700 border-amber-200',
};

const ACTIVITY_VARIANT = {
  Pickup: 'bg-blue-100 text-blue-700 border-blue-200',
  Dropoff: 'bg-indigo-100 text-indigo-700 border-indigo-200',
};

const formatClock24 = (value) => {
  if (!value) return '—';
  const s = String(value).trim();
  if (s.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
  }
  const timeExtract = s.match(/(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)/i);
  const timePart = timeExtract ? timeExtract[1] : s;
  const match = timePart.toUpperCase().match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/);
  if (match) {
    let hour = parseInt(match[1], 10);
    const min = match[2];
    const meridiem = match[3];
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${min}`;
  }
  return s;
};

const timeToMinutes = (value) => {
  if (!value) return 1440;
  const cleanTime = String(value).toUpperCase().trim();
  if (cleanTime === 'WILL CALL' || cleanTime === 'WC') return 1440;
  const match = cleanTime.match(/(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?/);
  if (!match) return 1440;
  let hour = parseInt(match[1], 10);
  const minutes = parseInt(match[2] || '0', 10);
  const meridiem = match[3];
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minutes;
};

const getDriverRecord = (trip, drivers) =>
  drivers.find((driver) => driver.id === trip.driverId || driver.email === trip.driverEmail);

const getDriverLabel = (trip, drivers) => getDriverRecord(trip, drivers)?.name || trip.driverName || '—';

const getVehicleLabel = (trip, drivers) =>
  trip.completedVehicle || getDriverRecord(trip, drivers)?.vehicle || '—';

const buildCsvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const calcDuration = (start, end) => {
  if (!start || !end) return '—';
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return '—';
  const diff = Math.round((e - s) / 60000);
  if (diff < 0) return '—';
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return h > 0 ? `${h}h${m > 0 ? m : ''}` : `${m}m`;
};

const calcMiles = (pickupOdo, dropoffOdo) => {
  if (!pickupOdo || !dropoffOdo) return '—';
  const diff = dropoffOdo - pickupOdo;
  return diff > 0 ? diff.toFixed(1) : '—';
};

const formatDateLabel = (dateStr) => {
  if (dateStr === 'No Date') return 'No Date';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

const ReportsPage = ({ trips = [], drivers = [], onUpdateTrip, role }) => {
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);
  const [statusFilter, setStatusFilter] = useState('Completed');
  const [driverFilter, setDriverFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [sortColumn, setSortColumn] = useState('time');
  const [sortDirection, setSortDirection] = useState('asc');
  const [showFilters, setShowFilters] = useState(true);
  const canEdit = role === 'admin' || role === 'dispatcher';

  const reportTrips = useMemo(() => {
    let filtered = trips
      .filter((trip) => STATUS_OPTIONS.includes(trip.status))
      .filter((trip) => {
        if (statusFilter === 'all') return true;
        return trip.status === statusFilter;
      })
      .filter((trip) => {
        if (driverFilter === 'all') return true;
        if (driverFilter === 'unassigned') return !trip.driverId && !trip.driverEmail;
        return trip.driverId === driverFilter || trip.driverEmail === driverFilter;
      })
      .filter((trip) => {
        const tripDate = trip.date || '';
        if (startDate && tripDate < startDate) return false;
        if (endDate && tripDate > endDate) return false;
        return true;
      });

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (trip) =>
          (trip.patient || '').toLowerCase().includes(q) ||
          (trip.bookingId || '').toLowerCase().includes(q) ||
          (trip.id || '').toLowerCase().includes(q) ||
          (trip.pickup || '').toLowerCase().includes(q) ||
          (trip.dropoff || '').toLowerCase().includes(q) ||
          (trip.driverName || '').toLowerCase().includes(q) ||
          getDriverLabel(trip, drivers).toLowerCase().includes(q)
      );
    }

    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'time':
          if ((a.date || '') !== (b.date || '')) {
            cmp = (a.date || '').localeCompare(b.date || '');
          } else {
            cmp = timeToMinutes(a.time) - timeToMinutes(b.time);
          }
          break;
        case 'name':
          cmp = (a.patient || '').localeCompare(b.patient || '');
          break;
        case 'bookingId':
          cmp = (a.bookingId || '').localeCompare(b.bookingId || '');
          break;
        case 'tripId':
          cmp = (a.id || '').localeCompare(b.id || '');
          break;
        case 'driver':
          cmp = getDriverLabel(a, drivers).localeCompare(getDriverLabel(b, drivers));
          break;
        case 'status':
          cmp = (a.status || '').localeCompare(b.status || '');
          break;
        case 'date':
          cmp = (a.date || '').localeCompare(b.date || '');
          break;
        default:
          cmp = 0;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [driverFilter, endDate, startDate, statusFilter, trips, searchQuery, sortColumn, sortDirection, drivers]);

  const groupedTrips = useMemo(() => {
    const groups = reportTrips.reduce((acc, trip) => {
      const key = trip.date || 'No Date';
      if (!acc[key]) acc[key] = [];
      acc[key].push(trip);
      return acc;
    }, {});
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [reportTrips]);

  const stats = useMemo(() => ({
    total: reportTrips.length,
    completed: reportTrips.filter((t) => t.status === 'Completed').length,
    noShow: reportTrips.filter((t) => t.status === 'No Show').length,
    cancelled: reportTrips.filter((t) => t.status === 'Cancelled').length,
    totalRows: reportTrips.length * 2,
  }), [reportTrips]);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ column }) => {
    if (sortColumn !== column) return <ArrowUpDown size={12} className="text-slate-400 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />;
    return sortDirection === 'asc'
      ? <ArrowUp size={12} className="text-blue-500 ml-1" />
      : <ArrowDown size={12} className="text-blue-500 ml-1" />;
  };

  const startEdit = (trip) => {
    setEditValues({
      bookingId: trip.bookingId || '',
      patient: trip.patient || '',
      pickup: trip.pickup || '',
      time: trip.time || '',
      dropoff: trip.dropoff || '',
      driverId: trip.driverId || '',
      driverEmail: trip.driverEmail || '',
      driverName: trip.driverName || '',
      completedVehicle: trip.completedVehicle || '',
      purpose: trip.purpose || '',
      notes: trip.notes || '',
      status: trip.status || '',
      paperSignatureConfirmed: trip.paperSignatureConfirmed || false,
      pickupOdometer: trip.pickupOdometer || '',
      dropoffOdometer: trip.dropoffOdometer || '',
      arrivalTime: trip.arrivalTime || '',
      departedPickupTime: trip.departedPickupTime || '',
      arrivalDropoffTime: trip.arrivalDropoffTime || '',
      completedAt: trip.completedAt || '',
    });
    setEditingId(trip.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const saveEdit = (trip) => {
    if (!trip || !onUpdateTrip) return;
    onUpdateTrip({ ...trip, ...editValues });
    setEditingId(null);
    setEditValues({});
  };

  const exportCsv = () => {
    const headers = [
      'Booking Id', 'Address Short', 'Schedule Time', 'Client Name',
      'Activity', 'Driver', 'Vehicle Arrival / Departure / Mileage',
      'Travel Time', 'Address', 'Distance',
      'Signature Captured?', 'Rider Signature Received',
    ];

    const rows = [];
    reportTrips.forEach((trip) => {
      const driver = getDriverRecord(trip, drivers);
      const driverName = driver?.name || trip.driverName || '—';
      const vehicle = trip.completedVehicle || driver?.vehicle || '—';
      const clientId = trip.bookingId || trip.id || '';
      const phone = trip.pickupPhone || '';
      const miles = calcMiles(trip.pickupOdometer, trip.dropoffOdometer);
      const duration = calcDuration(trip.arrivalTime, trip.arrivalDropoffTime || trip.completedAt);
      const pickupTime = formatClock24(trip.time);
      const pickupAddr = trip.pickup || '';
      const dropoffAddr = trip.dropoff || '';
      const pickupArrival = formatClock24(trip.arrivalTime);
      const dropoffArrival = formatClock24(trip.arrivalDropoffTime || trip.completedAt);
      const pickupOdo = trip.pickupOdometer || '';
      const dropoffOdo = trip.dropoffOdometer || '';
      const signed = trip.paperSignatureConfirmed ? 'YES' : 'NO';

      rows.push([
        buildCsvValue(trip.bookingId || ''),
        buildCsvValue(pickupAddr),
        buildCsvValue(pickupTime),
        buildCsvValue(trip.patient || ''),
        buildCsvValue('Pickup'),
        buildCsvValue(`${driverName} ${vehicle}`),
        buildCsvValue(pickupArrival ? `${pickupArrival} ${pickupOdo}` : ''),
        buildCsvValue(duration),
        buildCsvValue(pickupAddr + (phone ? ` (${phone})` : '')),
        buildCsvValue(miles !== '—' ? `${miles}mi` : '0.000mi'),
        buildCsvValue(signed),
        buildCsvValue(signed === 'YES' ? 'Rider Signature Received' : ''),
      ]);

      rows.push([
        buildCsvValue(trip.bookingId || ''),
        buildCsvValue(dropoffAddr),
        buildCsvValue(pickupTime),
        buildCsvValue(trip.patient || ''),
        buildCsvValue('Dropoff'),
        buildCsvValue(`${driverName} ${vehicle}`),
        buildCsvValue(dropoffArrival ? `${dropoffArrival} ${dropoffOdo}` : ''),
        buildCsvValue(duration),
        buildCsvValue(dropoffAddr + (phone ? ` (${phone})` : '')),
        buildCsvValue(miles !== '—' ? `${miles}mi` : '0.000mi'),
        buildCsvValue(signed),
        buildCsvValue(signed === 'YES' ? 'Rider Signature Received' : ''),
      ]);
    });

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `agape-report-${today}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setStartDate(weekAgo);
    setEndDate(today);
    setStatusFilter('Completed');
    setDriverFilter('all');
    setSearchQuery('');
    setSortColumn('time');
    setSortDirection('asc');
  };

  const SortableHeader = ({ column, children, className = '' }) => (
    <th
      onClick={() => handleSort(column)}
      className={`p-3 text-left whitespace-nowrap cursor-pointer select-none group hover:bg-slate-700 transition-colors ${className}`}
    >
      <div className="flex items-center">
        <span>{children}</span>
        <SortIcon column={column} />
      </div>
    </th>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <BarChart3 size={16} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Trip Reports</h2>
            <p className="text-xs text-slate-500">{stats.totalRows} rows · {stats.total} trips</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
              showFilters ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Filter size={14} /> Filters
          </button>
          <button
            onClick={resetFilters}
            className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
            title="Reset filters"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={exportCsv}
            disabled={reportTrips.length === 0}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1.5 transition"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      {showFilters && (
        <div className="bg-white border-b border-slate-200 px-4 py-3 shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg px-2 py-1.5 flex-1 min-w-[200px]">
              <Search size={14} className="text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Search by name, booking ID, driver, address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-sm outline-none w-full placeholder:text-slate-400"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Calendar size={13} className="text-slate-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 bg-white"
              >
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                <option value="all">All Statuses</option>
              </select>
              <select
                value={driverFilter}
                onChange={(e) => setDriverFilter(e.target.value)}
                className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 bg-white"
              >
                <option value="all">All Drivers</option>
                <option value="unassigned">Unassigned</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id || d.email}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 shrink-0">
        <div className="flex items-center gap-4">
          {[
            { label: 'Total', value: stats.total, color: 'text-slate-700' },
            { label: 'Completed', value: stats.completed, color: 'text-emerald-600' },
            { label: 'No Show', value: stats.noShow, color: 'text-rose-600' },
            { label: 'Cancelled', value: stats.cancelled, color: 'text-amber-600' },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">{s.label}</span>
              <span className={`text-sm font-bold ${s.color}`}>{s.value}</span>
            </div>
          ))}
          <div className="flex-1" />
          <span className="text-xs text-slate-400">
            {reportTrips.length > 0 && `Showing ${reportTrips.length} of ${trips.filter(t => STATUS_OPTIONS.includes(t.status)).length} reportable trips`}
          </span>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-y-auto">
        {groupedTrips.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <FileText size={40} className="mb-3 opacity-40" />
            <p className="text-sm font-medium">No report data for selected filters</p>
            <button onClick={resetFilters} className="mt-2 text-xs text-blue-600 hover:underline">Reset filters</button>
          </div>
        ) : (
          groupedTrips.map(([dateLabel, dayTrips]) => (
            <div key={dateLabel} className="border-b border-slate-200 last:border-b-0">
              {/* Date Group Header */}
              <div className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar size={13} className="text-slate-500" />
                  <span className="text-sm font-bold text-slate-700">{formatDateLabel(dateLabel)}</span>
                  <span className="text-xs text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                    {dayTrips.length} trips · {dayTrips.length * 2} rows
                  </span>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="p-2 w-8"></th>
                      <th className="p-2 text-left whitespace-nowrap font-semibold">Activity</th>
                      <SortableHeader column="time">Schedule Time</SortableHeader>
                      <SortableHeader column="bookingId">Booking ID</SortableHeader>
                      <SortableHeader column="name">Client Name</SortableHeader>
                      <SortableHeader column="driver">Driver</SortableHeader>
                      <th className="p-2 text-left whitespace-nowrap font-semibold">Pickup Address</th>
                      <th className="p-2 text-left whitespace-nowrap font-semibold">Dropoff Address</th>
                      <th className="p-2 text-left whitespace-nowrap font-semibold">Arrival / Mileage</th>
                      <th className="p-2 text-left whitespace-nowrap font-semibold">Travel Time</th>
                      <th className="p-2 text-left whitespace-nowrap font-semibold">Distance</th>
                      <th className="p-2 text-left whitespace-nowrap font-semibold">Signature</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {dayTrips.map((trip) => {
                      const isEditing = editingId === trip.id;
                      const driver = getDriverRecord(trip, drivers);
                      const driverName = driver?.name || trip.driverName || '—';
                      const vehicle = trip.completedVehicle || driver?.vehicle || '—';
                      const phone = trip.pickupPhone || '';
                      const miles = calcMiles(trip.pickupOdometer, trip.dropoffOdometer);
                      const duration = calcDuration(trip.arrivalTime, trip.arrivalDropoffTime || trip.completedAt);
                      const pickupTime = formatClock24(trip.time);
                      const pickupArrival = formatClock24(trip.arrivalTime);
                      const dropoffArrival = formatClock24(trip.arrivalDropoffTime || trip.completedAt);
                      const pickupOdo = trip.pickupOdometer || '';
                      const dropoffOdo = trip.dropoffOdometer || '';
                      const signed = trip.paperSignatureConfirmed;

                      const cellClass = "p-2 whitespace-nowrap";
                      const addrClass = "p-2 max-w-[200px] truncate";

                      const pickupRow = (
                        <tr key={`${trip.id}-pickup`} className={`hover:bg-blue-50/50 transition-colors group ${isEditing ? 'bg-blue-50' : ''}`}>
                          <td className="p-2">
                            {canEdit && !isEditing && (
                              <button onClick={() => startEdit(trip)}
                                className="p-1 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded transition opacity-0 group-hover:opacity-100"
                                title="Edit">
                                <Edit2 size={13} />
                              </button>
                            )}
                            {isEditing && (
                              <div className="flex items-center gap-0.5">
                                <button onClick={() => saveEdit(trip)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition" title="Save"><Check size={13} /></button>
                                <button onClick={cancelEdit} className="p-1 text-rose-600 hover:bg-rose-50 rounded transition" title="Cancel"><X size={13} /></button>
                              </div>
                            )}
                          </td>
                          <td className={cellClass}>
                            <span className={`px-1.5 py-0.5 rounded text-xs font-semibold border ${ACTIVITY_VARIANT.Pickup}`}>Pickup</span>
                          </td>
                          <td className={`${cellClass} font-mono text-slate-700`}>{pickupTime}</td>
                          <td className={`${cellClass} font-mono text-blue-600`}>{trip.bookingId || '—'}</td>
                          <td className={`${cellClass} font-semibold text-slate-900`}>{trip.patient || '—'}</td>
                          <td className={cellClass}>
                            <div>
                              <p className="font-medium text-slate-700">{driverName}</p>
                              <p className="text-slate-400 text-[10px]">{vehicle}</p>
                            </div>
                          </td>
                          <td className={`${addrClass} text-slate-600`} title={trip.pickup}>{trip.pickup || '—'}</td>
                          <td className={`${addrClass} text-slate-400`} title={trip.dropoff}>{trip.dropoff || '—'}</td>
                          <td className={`${cellClass} font-mono text-slate-600`}>
                            {pickupArrival ? `${pickupArrival} · ${pickupOdo || '—'}` : '—'}
                          </td>
                          <td className={`${cellClass} text-slate-600`}>{duration}</td>
                          <td className={`${cellClass} font-mono text-slate-600`}>{miles !== '—' ? `${miles} mi` : '—'}</td>
                          <td className={cellClass}>
                            {signed ? (
                              <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                                <CheckCircle2 size={12} /> Yes
                              </span>
                            ) : (
                              <span className="text-slate-400">No</span>
                            )}
                          </td>
                        </tr>
                      );

                      const dropoffRow = (
                        <tr key={`${trip.id}-dropoff`} className={`hover:bg-indigo-50/50 transition-colors group ${isEditing ? 'bg-blue-50' : ''} bg-slate-50/30`}>
                          <td className="p-2"></td>
                          <td className={cellClass}>
                            <span className={`px-1.5 py-0.5 rounded text-xs font-semibold border ${ACTIVITY_VARIANT.Dropoff}`}>Dropoff</span>
                          </td>
                          <td className={`${cellClass} font-mono text-slate-700`}>{pickupTime}</td>
                          <td className={`${cellClass} font-mono text-blue-600`}>{trip.bookingId || '—'}</td>
                          <td className={`${cellClass} font-semibold text-slate-900`}>{trip.patient || '—'}</td>
                          <td className={cellClass}>
                            <div>
                              <p className="font-medium text-slate-700">{driverName}</p>
                              <p className="text-slate-400 text-[10px]">{vehicle}</p>
                            </div>
                          </td>
                          <td className={`${addrClass} text-slate-400`} title={trip.pickup}>{trip.pickup || '—'}</td>
                          <td className={`${addrClass} text-slate-600`} title={trip.dropoff}>{trip.dropoff || '—'}</td>
                          <td className={`${cellClass} font-mono text-slate-600`}>
                            {dropoffArrival ? `${dropoffArrival} · ${dropoffOdo || '—'}` : '—'}
                          </td>
                          <td className={`${cellClass} text-slate-600`}>{duration}</td>
                          <td className={`${cellClass} font-mono text-slate-600`}>{miles !== '—' ? `${miles} mi` : '—'}</td>
                          <td className={cellClass}>
                            {signed ? (
                              <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                                <CheckCircle2 size={12} /> Yes
                              </span>
                            ) : (
                              <span className="text-slate-400">No</span>
                            )}
                          </td>
                        </tr>
                      );

                      return (
                        <React.Fragment key={trip.id}>
                          {pickupRow}
                          {dropoffRow}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ReportsPage;
