import React, { useMemo, useState } from 'react';
import { Calendar, Download, FileText, Filter, CheckCircle2, AlertTriangle, XCircle, Edit2, Save, X, Check, Camera } from 'lucide-react';

const STATUS_OPTIONS = ['Completed', 'No Show', 'Cancelled'];

const today = new Date().toISOString().split('T')[0];
const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

const Badge = ({ children, variant = 'info' }) => {
  const variants = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    warning: 'bg-amber-50 text-amber-700 border-amber-100',
    danger: 'bg-rose-50 text-rose-700 border-rose-100',
    info: 'bg-blue-50 text-blue-700 border-blue-100',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-black border uppercase tracking-widest whitespace-nowrap ${variants[variant]}`}>
      {children}
    </span>
  );
};

const formatClock24 = (value) => {
  if (!value) return '—';
  const s = String(value).trim();

  // ISO date string → convert UTC to local time
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

const getDriverRecord = (trip, drivers) => drivers.find((driver) => driver.id === trip.driverId || driver.email === trip.driverEmail);

const getDriverLabel = (trip, drivers) => getDriverRecord(trip, drivers)?.name || trip.driverName || '—';

const getVehicleLabel = (trip, drivers) => trip.completedVehicle || getDriverRecord(trip, drivers)?.vehicle || '—';

const buildCsvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const REPORTS_ICON = 'data:image/svg+xml,...';

const ReportsPage = ({ trips = [], drivers = [], onUpdateTrip, role }) => {
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);
  const [statusFilter, setStatusFilter] = useState('Completed');
  const [driverFilter, setDriverFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const canEdit = role === 'admin' || role === 'dispatcher';

  const reportTrips = useMemo(() => {
    return trips
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
      })
      .sort((left, right) => {
        if ((left.date || '') !== (right.date || '')) {
          return (left.date || '').localeCompare(right.date || '');
        }

        const timeDifference = timeToMinutes(left.time) - timeToMinutes(right.time);
        if (timeDifference !== 0) return timeDifference;

        return String(left.patient || '').localeCompare(String(right.patient || ''));
      });
  }, [driverFilter, endDate, startDate, statusFilter, trips]);

  const stats = useMemo(() => {
    return {
      total: reportTrips.length,
      completed: reportTrips.filter((trip) => trip.status === 'Completed').length,
      noShow: reportTrips.filter((trip) => trip.status === 'No Show').length,
      cancelled: reportTrips.filter((trip) => trip.status === 'Cancelled').length,
    };
  }, [reportTrips]);

  const groupedTrips = useMemo(() => {
    const groups = reportTrips.reduce((accumulator, trip) => {
      const key = trip.date || 'No Date';
      if (!accumulator[key]) accumulator[key] = [];
      accumulator[key].push(trip);
      return accumulator;
    }, {});

    return Object.entries(groups).sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate));
  }, [reportTrips]);

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
      'Date',
      'Status',
      'Booking ID',
      'Client Name',
      'Pickup Address',
      'Scheduled Pickup Time',
      'Actual Pickup Time',
      'Departed Pickup Time',
      'Dropoff Address',
      'Arrival Dropoff Time',
      'Dropoff Odometer',
      'Pickup Odometer',
      'Client Signed',
      'Driver',
      'Vehicle',
      'Purpose',
    ];

    const rows = reportTrips.map((trip) => [
      buildCsvValue(trip.date || ''),
      buildCsvValue(trip.status || ''),
      buildCsvValue(trip.bookingId || ''),
      buildCsvValue(trip.patient || ''),
      buildCsvValue(trip.pickup || ''),
      buildCsvValue(formatClock24(trip.time) || ''),
      buildCsvValue(formatClock24(trip.arrivalTime)),
      buildCsvValue(formatClock24(trip.departedPickupTime)),
      buildCsvValue(trip.dropoff || ''),
      buildCsvValue(formatClock24(trip.arrivalDropoffTime || trip.completedAt)),
      buildCsvValue(trip.dropoffOdometer || ''),
      buildCsvValue(trip.pickupOdometer || ''),
      buildCsvValue(trip.paperSignatureConfirmed ? 'YES' : 'NO'),
      buildCsvValue(getDriverLabel(trip, drivers)),
      buildCsvValue(getVehicleLabel(trip, drivers)),
      buildCsvValue(trip.purpose || ''),
    ]);

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
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl sm:text-xl font-black text-slate-900 tracking-tight">Reports</h2>
          <p className="text-sm text-slate-500 mt-1">Daily completed-work reports with optional no-show and cancelled review.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button onClick={resetFilters} className="flex-1 sm:flex-none px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 text-sm">
            Reset
          </button>
          <button
            onClick={exportCsv}
            disabled={reportTrips.length === 0}
            className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
          >
            <Download size={16} /> CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs uppercase tracking-widest text-slate-500 font-black">Rows</p>
          <p className="text-xl font-black text-slate-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 shadow-sm">
          <p className="text-xs uppercase tracking-widest text-emerald-600 font-black">Completed</p>
          <p className="text-xl font-black text-emerald-700 mt-1">{stats.completed}</p>
        </div>
        <div className="bg-rose-50 p-4 rounded-xl border border-rose-200 shadow-sm">
          <p className="text-xs uppercase tracking-widest text-rose-600 font-black">No Show</p>
          <p className="text-xl font-black text-rose-700 mt-1">{stats.noShow}</p>
        </div>
        <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 shadow-sm">
          <p className="text-xs uppercase tracking-widest text-amber-600 font-black">Cancelled</p>
          <p className="text-xl font-black text-amber-700 mt-1">{stats.cancelled}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} className="text-blue-600" />
          <h3 className="text-sm font-bold text-slate-700">Report Filters</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5"><Calendar size={14} className="text-blue-500" /> Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5"><Calendar size={14} className="text-blue-500" /> End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="Completed">Completed</option>
              <option value="No Show">No Show</option>
              <option value="Cancelled">Cancelled</option>
              <option value="all">All Report Statuses</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1">Driver</label>
            <select
              value={driverFilter}
              onChange={(event) => setDriverFilter(event.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Drivers</option>
              <option value="unassigned">Unassigned</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id || driver.email}>
                  {driver.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {groupedTrips.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-400 font-bold text-lg">
          No report data for the selected dates and filters.
        </div>
      ) : (
        groupedTrips.map(([dateLabel, dayTrips]) => (
          <div key={dateLabel} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-200 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-blue-600" />
                <h3 className="text-sm sm:text-lg font-bold text-slate-900">Daily Work Table</h3>
                <Badge variant="info">{dateLabel}</Badge>
              </div>
              <Badge variant="success">{dayTrips.length} trips</Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1850px] text-sm">
                <thead className="bg-slate-800 text-white">
                  <tr>
                    <th className="p-2 text-left whitespace-nowrap w-10"></th>
                    <th className="p-2 text-left whitespace-nowrap">Booking ID</th>
                    <th className="p-2 text-left whitespace-nowrap">Client Name</th>
                    <th className="p-2 text-left whitespace-nowrap min-w-[200px]">Pickup Address</th>
                    <th className="p-2 text-left whitespace-nowrap">Scheduled Pickup</th>
                    <th className="p-2 text-left whitespace-nowrap">Actual Pickup</th>
                    <th className="p-2 text-left whitespace-nowrap">Departed Pickup</th>
                    <th className="p-2 text-left whitespace-nowrap min-w-[200px]">Dropoff Address</th>
                    <th className="p-2 text-left whitespace-nowrap">Arrival Dropoff</th>
                    <th className="p-2 text-left whitespace-nowrap">Pickup Odo</th>
                    <th className="p-2 text-left whitespace-nowrap">Dropoff Odo</th>
                    <th className="p-2 text-left whitespace-nowrap">Client Signed</th>
                    <th className="p-2 text-left whitespace-nowrap">Status</th>
                    <th className="p-2 text-left whitespace-nowrap">Driver</th>
                    <th className="p-2 text-left whitespace-nowrap">Vehicle</th>
                    <th className="p-2 text-left whitespace-nowrap">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dayTrips.map((trip) => {
                    const isEditing = editingId === trip.id;
                    const statusVariant = trip.status === 'Completed' ? 'success' : trip.status === 'No Show' ? 'danger' : 'warning';
                    const inputClass = "w-full min-w-[70px] px-1.5 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:border-blue-500 bg-blue-50/50";
                    const selectClass = "w-full min-w-[70px] px-1.5 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:border-blue-500 bg-blue-50/50";
                    const tsVal = (v) => {
                      if (!v) return '';
                      const d = new Date(v);
                      if (isNaN(d.getTime())) return v.replace('Z', '').slice(0, 16);
                      const pad = (n) => String(n).padStart(2, '0');
                      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                    };
                    return (
                      <tr key={trip.id} className={`hover:bg-slate-50 group ${isEditing ? 'bg-blue-50/30' : ''}`}>
                        <td className="p-2 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {canEdit && !isEditing && (
                              <button onClick={() => startEdit(trip)}
                                className="p-1 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition opacity-0 group-hover:opacity-100"
                                title="Edit trip">
                                <Edit2 size={14} />
                              </button>
                            )}
                            {isEditing && (
                              <div className="flex items-center gap-1">
                                <button onClick={() => saveEdit(trip)}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                                  title="Save">
                                  <Check size={14} />
                                </button>
                                <button onClick={cancelEdit}
                                  className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                  title="Cancel">
                                  <X size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {isEditing ? (
                            <input type="text" value={editValues.bookingId} onChange={(e) => setEditValues({ ...editValues, bookingId: e.target.value })} className={inputClass} />
                          ) : (
                            <span className="font-mono text-blue-600">{trip.bookingId || '—'}</span>
                          )}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {isEditing ? (
                            <input type="text" value={editValues.patient} onChange={(e) => setEditValues({ ...editValues, patient: e.target.value })} className={inputClass} />
                          ) : (
                            <span className="font-bold text-slate-900">{trip.patient || '—'}</span>
                          )}
                        </td>
                        <td className="p-2">
                          {isEditing ? (
                            <input type="text" value={editValues.pickup} onChange={(e) => setEditValues({ ...editValues, pickup: e.target.value })} className={inputClass} />
                          ) : (
                            <span className="text-slate-700">{trip.pickup || '—'}</span>
                          )}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {isEditing ? (
                            <input type="text" value={editValues.time} onChange={(e) => setEditValues({ ...editValues, time: e.target.value })} className={inputClass} />
                          ) : (
                            <span className="font-bold text-slate-900">{formatClock24(trip.time) || '—'}</span>
                          )}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <Calendar size={12} className="text-blue-500 shrink-0" />
                              <input type="datetime-local" value={tsVal(editValues.arrivalTime)} onChange={(e) => setEditValues({ ...editValues, arrivalTime: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                                className={inputClass} />
                            </div>
                          ) : (
                            <span className="font-bold text-slate-900 whitespace-nowrap">{formatClock24(trip.arrivalTime)}</span>
                          )}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <Calendar size={12} className="text-blue-500 shrink-0" />
                              <input type="datetime-local" value={tsVal(editValues.departedPickupTime)} onChange={(e) => setEditValues({ ...editValues, departedPickupTime: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                                className={inputClass} />
                            </div>
                          ) : (
                            <span className="font-bold text-slate-900 whitespace-nowrap">{formatClock24(trip.departedPickupTime)}</span>
                          )}
                        </td>
                        <td className="p-2">
                          {isEditing ? (
                            <input type="text" value={editValues.dropoff} onChange={(e) => setEditValues({ ...editValues, dropoff: e.target.value })} className={inputClass} />
                          ) : (
                            <span className="text-slate-700">{trip.dropoff || '—'}</span>
                          )}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <Calendar size={12} className="text-blue-500 shrink-0" />
                              <input type="datetime-local" value={tsVal(editValues.arrivalDropoffTime)} onChange={(e) => setEditValues({ ...editValues, arrivalDropoffTime: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                                className={inputClass} />
                            </div>
                          ) : (
                            <span className="font-bold text-slate-900 whitespace-nowrap">{formatClock24(trip.arrivalDropoffTime || trip.completedAt)}</span>
                          )}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {isEditing ? (
                            <input type="number" value={editValues.pickupOdometer} onChange={(e) => setEditValues({ ...editValues, pickupOdometer: e.target.value })} className={inputClass} />
                          ) : (
                            <span className="font-mono font-black">{trip.pickupOdometer || '—'}</span>
                          )}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {isEditing ? (
                            <input type="number" value={editValues.dropoffOdometer} onChange={(e) => setEditValues({ ...editValues, dropoffOdometer: e.target.value })} className={inputClass} />
                          ) : (
                            <span className="font-mono font-black">{trip.dropoffOdometer || '—'}</span>
                          )}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {isEditing ? (
                            <label className="flex items-center justify-center cursor-pointer">
                              <input type="checkbox" checked={!!editValues.paperSignatureConfirmed} onChange={(e) => setEditValues({ ...editValues, paperSignatureConfirmed: e.target.checked })} className="w-4 h-4 accent-blue-600" />
                            </label>
                          ) : (
                            <span className="font-black text-emerald-600">{trip.paperSignatureConfirmed ? 'YES' : 'NO'}</span>
                          )}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {isEditing ? (
                            <select value={editValues.status} onChange={(e) => setEditValues({ ...editValues, status: e.target.value })} className={selectClass}>
                              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          ) : (
                            <Badge variant={statusVariant}>{trip.status}</Badge>
                          )}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {isEditing ? (
                            <select value={editValues.driverId || editValues.driverEmail} onChange={(e) => {
                              const d = drivers.find(drv => drv.id === e.target.value || drv.email === e.target.value);
                              setEditValues({ ...editValues, driverId: d?.id || '', driverEmail: d?.email || '', driverName: d?.name || '' });
                            }} className={selectClass}>
                              <option value="">—</option>
                              {drivers.map(d => <option key={d.id} value={d.id || d.email}>{d.name}</option>)}
                            </select>
                          ) : (
                            <span className="font-semibold">{getDriverLabel(trip, drivers)}</span>
                          )}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {isEditing ? (
                            <input type="text" value={editValues.completedVehicle} onChange={(e) => setEditValues({ ...editValues, completedVehicle: e.target.value })} className={inputClass} />
                          ) : (
                            <span className="text-slate-500">{getVehicleLabel(trip, drivers)}</span>
                          )}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {isEditing ? (
                            <input type="text" value={editValues.purpose} onChange={(e) => setEditValues({ ...editValues, purpose: e.target.value })} className={inputClass} />
                          ) : (
                            <span className="text-slate-500">{trip.purpose || '—'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-emerald-700 font-bold"><CheckCircle2 size={16} /> Completed</div>
          <p className="text-sm text-slate-600">Completed is the default report view so finished work stays front and center.</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-rose-700 font-bold"><AlertTriangle size={16} /> No Show</div>
          <p className="text-sm text-slate-600">No-show trips remain available for historical review without mixing into active dispatching.</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-amber-700 font-bold"><XCircle size={16} /> Cancelled</div>
          <p className="text-sm text-slate-600">Cancelled trips can be reviewed by date range and driver when follow-up is needed.</p>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;