import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import {
  BarChart2, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, Clock, Download, Edit2, FileText, RefreshCw, Search, Upload,
  Wand2, XCircle,
} from 'lucide-react';
import { localCalendarYmd } from '../utils/tripDate';

const DASH = '-';

const DetailRow = ({ label, value, valueColor = 'text-slate-900' }) => (
  <div className="grid grid-cols-1 gap-1 py-1.5 items-start sm:grid-cols-[130px_1fr] sm:gap-4">
    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">{label}</span>
    <span className={`text-[13px] font-bold break-words ${valueColor}`}>{value || DASH}</span>
  </div>
);

const formatDateLabel = (dateStr, long = false) => {
  if (!dateStr) return DASH;
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
    weekday: long ? 'long' : 'short',
    month: 'short',
    day: 'numeric',
  });
};

const formatClock = (value) => {
  if (!value) return DASH;
  const raw = String(value);
  if (/^\d{1,2}:\d{2}/.test(raw)) return raw.slice(0, 5);
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return raw;
};

const getTripDriver = (trip, drivers) => (
  drivers.find((driver) => driver.id === trip.driverId)
  || drivers.find((driver) => driver.name === trip.driverName)
  || drivers.find((driver) => String(driver.email || '').toLowerCase() === String(trip.driverEmail || '').toLowerCase())
  || null
);

const calcMiles = (trip) => {
  if (trip.distance) return Number(trip.distance).toFixed(1);
  if (trip.pickupOdometer && trip.dropoffOdometer) {
    const diff = Number(trip.dropoffOdometer) - Number(trip.pickupOdometer);
    if (diff > 0) return diff.toFixed(1);
  }
  return DASH;
};

const calcDurationMinutes = (start, end) => {
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
    const minutes = Math.round((endDate - startDate) / 60000);
    return minutes >= 0 ? minutes : null;
  }
  return null;
};

const formatMinutes = (minutes) => {
  if (!Number.isFinite(minutes)) return DASH;
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

const truncate = (value, max = 24) => {
  const text = String(value || DASH);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
};

const csvValue = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

const exportReviewCsv = (rows) => {
  const headers = [
    'Date', 'Driver', 'Vehicle', 'Scheduled', 'Trip ID', 'Passenger',
    'Pickup Address', 'Pickup Time', 'Start Odometer', 'Dropoff Address',
    'Dropoff Time', 'End Odometer', 'Travel Time', 'Distance', 'Signature', 'Review',
  ];
  const lines = [
    headers.map(csvValue).join(','),
    ...rows.map(({ trip, driver, travelMinutes }) => [
      trip.date,
      driver?.name || trip.driverName || '',
      trip.completedVehicle || driver?.vehicle || '',
      trip.time || '',
      trip.bookingId || trip.id || '',
      trip.patient || '',
      trip.pickup || '',
      formatClock(trip.arrivalTime || trip.pickupTime),
      trip.pickupOdometer || '',
      trip.dropoff || '',
      formatClock(trip.arrivalDropoffTime || trip.completedAt),
      trip.dropoffOdometer || '',
      formatMinutes(travelMinutes),
      calcMiles(trip),
      trip.paperSignatureConfirmed ? 'Yes' : 'No',
      trip.reviewed ? 'Reviewed' : 'Pending',
    ].map(csvValue).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agape-review-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const CompactSelect = ({ value, onChange, children, className = '' }) => (
  <label className={`relative inline-flex h-8 items-center ${className}`}>
    <select
      value={value}
      onChange={onChange}
      className="h-8 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-[11px] font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
    >
      {children}
    </select>
    <ChevronDown size={13} className="pointer-events-none absolute right-2.5 text-slate-500" />
  </label>
);

const ViewButton = ({ active, children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`h-8 rounded-xl px-3 text-[11px] font-bold transition ${
      active ? 'bg-[#2b568f] text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
    }`}
  >
    {children}
  </button>
);

const DesktopReportsPage = ({
  trips = [],
  drivers = [],
  vehicles = [],
  onUpdateTrip,
  setEditTrip,
  setShowUploadModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTripId, setExpandedTripId] = useState(null);
  const [dateStr, setDateStr] = useState(localCalendarYmd());
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('agape_reportsDesktopView') || 'review');
  const [statusFilter, setStatusFilter] = useState('Completed');
  const [driverFilter, setDriverFilter] = useState('all');
  const [reviewFilter, setReviewFilter] = useState('all');

  const [editingCell, setEditingCell] = useState(null); // { tripId, field }
  const [editValue, setEditValue] = useState('');
  const [editingRow, setEditingRow] = useState(null);
  const [editingRowSnapshot, setEditingRowSnapshot] = useState(null);
  const [activeRow, setActiveRow] = useState(null);
  const inputRef = useRef(null);

  const startRowEdit = useCallback((trip) => {
    setEditingRow(trip.id);
    setEditingRowSnapshot({ ...trip });
    setEditingCell(null);
    setEditValue('');
  }, []);

  const finishRowEdit = useCallback(() => {
    if (editingRowSnapshot && onUpdateTrip) {
      onUpdateTrip(editingRowSnapshot);
    }
    setEditingRow(null);
    setEditingRowSnapshot(null);
    setEditingCell(null);
    setEditValue('');
  }, [editingRowSnapshot, onUpdateTrip]);

  const revertRowEdit = useCallback(() => {
    setEditingRow(null);
    setEditingRowSnapshot(null);
    setEditingCell(null);
    setEditValue('');
  }, []);

  const startCellEdit = useCallback((tripId, colKey, val) => {
    setEditingCell({ tripId, field: colKey });
    setEditValue(val);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  const saveCell = useCallback((trip, field, val) => {
    if (editingRow === trip.id) {
      setEditingRowSnapshot(prev => ({ ...prev, [field]: val }));
    } else {
      onUpdateTrip?.({ ...trip, [field]: val });
    }
    setEditingCell(null);
  }, [editingRow, onUpdateTrip]);

  useEffect(() => {
    localStorage.setItem('agape_reportsDesktopView', viewMode);
  }, [viewMode]);

  const renderCell = (trip, colKey, displayValue, fieldName, type = 'text') => {
    const isEditing = editingCell?.tripId === trip.id && editingCell?.field === colKey;
    
    if (isEditing) {
      if (colKey === 'driver') {
        return (
          <select
            ref={inputRef}
            className="w-full px-1 py-0.5 border border-blue-400 rounded text-xs outline-none bg-white font-semibold text-slate-700"
            value={editingRowSnapshot?.driverId || ''}
            onChange={e => saveCell(trip, 'driverId', e.target.value)}
            onBlur={() => cancelEdit()}
            autoFocus
          >
            <option value="">—</option>
            {drivers.map(d => (
              <option key={d.id} value={d.id}>{d.name || d.email}</option>
            ))}
          </select>
        );
      }
      
      if (colKey === 'vehicle') {
        return (
          <select
            ref={inputRef}
            className="w-full px-1 py-0.5 border border-blue-400 rounded text-xs outline-none bg-white text-slate-700 font-semibold"
            value={editingRowSnapshot?.completedVehicle || ''}
            onChange={e => saveCell(trip, 'completedVehicle', e.target.value)}
            onBlur={() => cancelEdit()}
            autoFocus
          >
            <option value="">—</option>
            {vehicles.map(v => (
              <option key={v.id || v.name || v} value={v.name || v}>{v.name || v}</option>
            ))}
          </select>
        );
      }

      if (colKey === 'signature') {
        return (
          <select
            ref={inputRef}
            className="w-full px-1 py-0.5 border border-blue-400 rounded text-xs outline-none bg-white font-semibold text-slate-750"
            value={String(editingRowSnapshot?.paperSignatureConfirmed ?? false)}
            onChange={e => saveCell(trip, 'paperSignatureConfirmed', e.target.value === 'true')}
            onBlur={() => cancelEdit()}
            autoFocus
          >
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        );
      }

      if (colKey === 'reviewed') {
        return (
          <select
            ref={inputRef}
            className="w-full px-1 py-0.5 border border-blue-400 rounded text-xs outline-none bg-white font-semibold text-slate-750"
            value={String(editingRowSnapshot?.reviewed ?? false)}
            onChange={e => saveCell(trip, 'reviewed', e.target.value === 'true')}
            onBlur={() => cancelEdit()}
            autoFocus
          >
            <option value="false">Pending</option>
            <option value="true">Done</option>
          </select>
        );
      }

      if (colKey === 'aw') {
        return (
          <select
            ref={inputRef}
            className="w-full px-1 py-0.5 border border-blue-400 rounded text-xs outline-none bg-white font-semibold text-slate-700"
            value={editingRowSnapshot?.wheelchair ? 'W' : 'A'}
            onChange={e => saveCell(trip, 'wheelchair', e.target.value === 'W' ? 'Wheelchair' : '')}
            onBlur={() => cancelEdit()}
            autoFocus
          >
            <option value="A">A</option>
            <option value="W">W</option>
          </select>
        );
      }

      return (
        <input
          ref={inputRef}
          className="w-full px-1 py-0.5 border border-blue-400 rounded text-xs outline-none font-semibold text-slate-800"
          type={type}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => saveCell(trip, fieldName, editValue)}
          onKeyDown={e => {
            if (e.key === 'Enter') saveCell(trip, fieldName, editValue);
            if (e.key === 'Escape') cancelEdit();
          }}
          autoFocus
        />
      );
    }

    if (editingRow === trip.id) {
      const currentValue = editingRowSnapshot?.[fieldName] ?? trip[fieldName] ?? '';
      let displayEditVal = displayValue;
      if (colKey === 'driver') {
        const d = drivers.find(drv => drv.id === editingRowSnapshot?.driverId || drv.id === trip.driverId);
        displayEditVal = d ? d.name : displayValue;
      }
      if (colKey === 'vehicle') {
        displayEditVal = editingRowSnapshot?.completedVehicle || trip.completedVehicle || '—';
      }
      return (
        <span
          className="cursor-pointer hover:bg-blue-50 hover:text-blue-700 rounded px-1 -mx-1 block leading-5 font-semibold min-h-[1.25rem]"
          onClick={() => startCellEdit(trip.id, colKey, currentValue)}
        >
          {displayEditVal}
        </span>
      );
    }

    if (colKey === 'reviewed') {
      return (
        <span
          className="cursor-pointer hover:bg-blue-50 rounded px-1 -mx-1 block leading-5 font-semibold text-slate-500"
          onClick={() => saveCell(trip, 'reviewed', !trip.reviewed)}
          title={trip.reviewed ? 'Mark as pending' : 'Mark as done'}
        >
          {displayValue}
        </span>
      );
    }
    if (colKey === 'signature') {
      return (
        <span
          className="cursor-pointer hover:bg-blue-50 rounded px-1 -mx-1 block leading-5 font-bold"
          onClick={() => saveCell(trip, 'paperSignatureConfirmed', !trip.paperSignatureConfirmed)}
        >
          {displayValue}
        </span>
      );
    }

    if (colKey === 'aw') {
      const val = trip.wheelchair ? 'W' : 'A';
      return (
        <span
          className="cursor-pointer hover:bg-blue-50 rounded px-1 -mx-1 block leading-5 font-bold"
          onClick={() => startCellEdit(trip.id, colKey, val)}
        >
          {val}
        </span>
      );
    }

    return <span className="block leading-5">{displayValue}</span>;
  };

  const driverOptions = useMemo(() => (
    [...drivers].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  ), [drivers]);

  const reportRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return trips
      .filter((trip) => trip.date === dateStr)
      .filter((trip) => {
        if (statusFilter !== 'all' && trip.status !== statusFilter) return false;
        if (driverFilter !== 'all' && trip.driverId !== driverFilter) return false;
        if (reviewFilter === 'reviewed' && !trip.reviewed) return false;
        if (reviewFilter === 'pending' && trip.reviewed) return false;
        if (!q) return true;
        return [trip.patient, trip.bookingId, trip.id, trip.pickup, trip.dropoff, trip.driverName]
          .some((value) => String(value || '').toLowerCase().includes(q));
      })
      .map((trip) => {
        const driver = getTripDriver(trip, drivers);
        const travelMinutes = trip.travelTime
          ? Number(trip.travelTime)
          : calcDurationMinutes(trip.departedPickupTime || trip.arrivalTime, trip.arrivalDropoffTime || trip.completedAt);
        return { trip, driver, travelMinutes };
      })
      .sort((a, b) => {
        const aDone = a.trip.arrivalDropoffTime || a.trip.completedAt || a.trip.time || '';
        const bDone = b.trip.arrivalDropoffTime || b.trip.completedAt || b.trip.time || '';
        return String(aDone).localeCompare(String(bDone));
      });
  }, [trips, drivers, dateStr, searchQuery, statusFilter, driverFilter, reviewFilter]);

  const allDayRows = useMemo(() => trips
    .filter((trip) => trip.date === dateStr)
    .map((trip) => ({
      trip,
      driver: getTripDriver(trip, drivers),
      travelMinutes: trip.travelTime
        ? Number(trip.travelTime)
        : calcDurationMinutes(trip.departedPickupTime || trip.arrivalTime, trip.arrivalDropoffTime || trip.completedAt),
    })), [trips, drivers, dateStr]);

  const summary = useMemo(() => {
    const reviewed = reportRows.filter(({ trip }) => trip.reviewed).length;
    const done = reportRows.filter(({ trip }) => trip.status === 'Completed').length;
    const noShow = reportRows.filter(({ trip }) => trip.status === 'No Show').length;
    const cancelled = reportRows.filter(({ trip }) => trip.status === 'Cancelled').length;
    const distance = reportRows.reduce((sum, row) => {
      const miles = Number(calcMiles(row.trip));
      return Number.isFinite(miles) ? sum + miles : sum;
    }, 0);
    const moving = reportRows.reduce((sum, row) => sum + (Number.isFinite(row.travelMinutes) ? row.travelMinutes : 0), 0);
    const stopped = Math.max(reportRows.length * 25, 0);
    return { reviewed, done, noShow, cancelled, distance, moving, stopped };
  }, [reportRows]);

  const setMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem('agape_reportsDesktopView', mode);
  };

  const shiftDate = (days) => {
    const next = new Date(`${dateStr}T12:00:00`);
    next.setDate(next.getDate() + days);
    setDateStr(next.toISOString().split('T')[0]);
  };

  const markRowsReviewed = (reviewed) => {
    reportRows.forEach(({ trip }) => {
      if (trip.reviewed !== reviewed) onUpdateTrip?.(trip.id, { reviewed });
    });
  };

  const renderCards = () => (
    <div className="flex-1 overflow-y-auto bg-slate-50 px-4 py-4">
      <div className="space-y-4">
        {reportRows.map(({ trip, driver, travelMinutes }) => {
          const isExpanded = expandedTripId === trip.id;
          return (
            <div key={trip.id} className="rounded-xl shadow-sm overflow-hidden border border-slate-200 bg-white transition-all duration-200 hover:shadow-md hover:border-slate-300">
              <button
                type="button"
                className="w-full bg-[#2b4c7e] px-4 py-3 flex items-center justify-between cursor-pointer select-none transition-colors hover:bg-[#203a60] text-left"
                onClick={() => setExpandedTripId(prev => (prev === trip.id ? null : trip.id))}
              >
                <div className="min-w-0">
                  <h2 className="text-white font-extrabold text-sm uppercase tracking-wide truncate">{trip.patient || 'UNKNOWN'}</h2>
                  <p className="text-blue-200 text-xs font-semibold truncate">#{trip.bookingId || trip.id}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className={`text-[10px] font-extrabold px-2 py-1 rounded uppercase tracking-wider shadow-sm ${trip.status === 'Completed' ? 'bg-[#c2f0d9] text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                    {trip.status || 'Scheduled'}
                  </span>
                  <ChevronDown className={`w-5 h-5 text-blue-200 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {isExpanded && (
                <div className="bg-[#eaf0f6] p-4">
                  <DetailRow label="Trip ID" value={trip.bookingId || trip.id} valueColor="text-blue-700" />
                  <DetailRow label="Driver" value={driver?.name || trip.driverName || DASH} />
                  <DetailRow label="Vehicle" value={trip.completedVehicle || driver?.vehicle || DASH} />
                  <DetailRow label="Scheduled" value={formatClock(trip.time)} valueColor="text-[#2b4c7e]" />
                  <div className="my-3 border-t border-slate-300/50" />
                  <DetailRow label="Pickup Address" value={trip.pickup} valueColor="text-emerald-700" />
                  <DetailRow label="Pickup Arrival" value={formatClock(trip.arrivalTime || trip.pickupTime)} valueColor="text-emerald-700" />
                  <DetailRow label="Start Odometer" value={trip.pickupOdometer || DASH} valueColor="text-emerald-700" />
                  <div className="my-3 border-t border-slate-300/50" />
                  <DetailRow label="Dropoff Address" value={trip.dropoff} valueColor="text-rose-700" />
                  <DetailRow label="Dropoff Arrival" value={formatClock(trip.arrivalDropoffTime || trip.completedAt)} valueColor="text-rose-700" />
                  <DetailRow label="End Odometer" value={trip.dropoffOdometer || DASH} valueColor="text-rose-700" />
                  <div className="my-3 border-t border-slate-300/50" />
                  <DetailRow label="Distance" value={`${calcMiles(trip)} mi`} />
                  <DetailRow label="Travel Time" value={formatMinutes(travelMinutes)} />
                  <DetailRow label="Signature" value={trip.paperSignatureConfirmed ? 'Yes' : 'No'} />
                  <DetailRow label="Review Status" value={trip.reviewed ? 'Reviewed' : 'Pending'} valueColor={trip.reviewed ? 'text-emerald-600' : 'text-amber-600'} />
                  <div className="mt-4 pt-4 border-t border-slate-300/50 flex gap-2">
                    <button onClick={() => setEditTrip?.(trip)} className="flex-1 bg-white border border-slate-300 text-slate-700 rounded-lg py-2 text-xs font-bold hover:bg-slate-50 transition-colors flex justify-center items-center gap-1.5 shadow-sm">
                      <Edit2 size={14} /> Edit Data
                    </button>
                    <button
                      className={`flex-1 rounded-lg py-2 text-xs font-bold transition-colors flex justify-center items-center gap-1.5 shadow-sm ${trip.reviewed ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                      onClick={() => onUpdateTrip?.(trip.id, { reviewed: !trip.reviewed })}
                    >
                      <CheckCircle2 size={14} /> {trip.reviewed ? 'Un-review' : 'Review'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderInvoiceTable = () => (
    <div className="flex-1 overflow-y-auto px-3 pb-3">
    <div className="overflow-hidden rounded-3xl border border-slate-100/50 bg-white shadow-sm">
      <div className="overflow-x-auto">
      <table className="w-full table-fixed text-xs">
        <colgroup>
          <col className="w-[8%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[5%]" />
          <col className="w-[14%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[8%]" />
          <col className="w-[10%]" />
          <col className="w-[8%]" />
          <col className="w-[7%]" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-[#2f5b96] text-white shadow-sm">
          <tr>
            <th className="rounded-tl-xl px-2 py-2 text-left font-semibold">Edit</th>
            <th className="px-2 py-2 text-left font-semibold">Date</th>
            <th className="px-2 py-2 text-left font-semibold">Trip ID</th>
            <th className="px-2 py-2 text-center font-semibold">A/W</th>
            <th className="px-2 py-2 text-left font-semibold">Client Name</th>
            <th className="px-2 py-2 text-left font-semibold">Pickup</th>
            <th className="px-2 py-2 text-left font-semibold">Dropoff</th>
            <th className="px-2 py-2 text-left font-semibold">Drop Odo</th>
            <th className="px-2 py-2 text-left font-semibold">Approved Fee</th>
            <th className="px-2 py-2 text-center font-semibold">Signed</th>
            <th className="px-2 py-2 text-center font-semibold rounded-tr-xl">Done</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {reportRows.map(({ trip, driver, travelMinutes }, index) => (
            <tr key={trip.id} className={`${activeRow === trip.id ? 'bg-blue-100' : index % 2 ? 'bg-slate-50/70' : 'bg-white'} hover:bg-blue-50/70 transition-colors cursor-pointer`} onClick={() => setActiveRow(trip.id)}>
              <td className="px-2 py-2">
                <div className="flex items-center gap-2 text-slate-500">
                  {editingRow === trip.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); finishRowEdit(); }}
                        className="p-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-all duration-150"
                        title="Keep changes"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); revertRowEdit(); }}
                        className="p-0.5 rounded bg-rose-100 text-rose-700 hover:bg-rose-200 transition-all duration-150"
                        title="Cancel and restore original row"
                      >
                        <XCircle size={13} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); startRowEdit(trip); }}
                      className="p-0.5 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all duration-150"
                      title="Edit row"
                    >
                      <Edit2 size={13} />
                    </button>
                  )}
                </div>
              </td>
              <td className="px-2 py-2 text-slate-900">
                {renderCell(trip, 'date', formatDateLabel(trip.date), 'date', 'date')}
              </td>
              <td className="px-2 py-2 font-mono text-blue-900">
                {renderCell(trip, 'bookingId', trip.bookingId || trip.id, 'bookingId')}
              </td>
              <td className="px-2 py-2 text-center text-slate-800">
                {renderCell(trip, 'aw', trip.wheelchair ? 'W' : 'A', 'wheelchair')}
              </td>
              <td className="px-2 py-2 text-slate-900">
                {renderCell(trip, 'patient', trip.patient, 'patient')}
              </td>
              <td className="px-2 py-2 font-mono text-emerald-700">
                {renderCell(trip, 'arrivalTime', formatClock(trip.arrivalTime || trip.pickupTime), 'arrivalTime', 'time')}
              </td>
              <td className="px-2 py-2 font-mono text-rose-700">
                {renderCell(trip, 'arrivalDropoffTime', formatClock(trip.arrivalDropoffTime || trip.completedAt), 'arrivalDropoffTime', 'time')}
              </td>
              <td className="px-2 py-2 font-mono text-slate-600">
                {(() => {
                  const odo = trip.dropoffOdometer ?? trip.endOdometer ?? trip.endMileage ?? trip.dropoffMileage;
                  return renderCell(trip, 'dropoffOdometer', (odo != null && odo !== '') ? Number(odo).toLocaleString() : '—', 'dropoffOdometer', 'number');
                })()}
              </td>
              <td className="px-2 py-2 font-mono text-slate-800">
                {renderCell(trip, 'additionalFee', trip.additionalFee ? `$${trip.additionalFee}` : '$0.00', 'additionalFee', 'number')}
              </td>
              <td className="px-2 py-2 text-center text-emerald-700">
                {renderCell(trip, 'signature', trip.paperSignatureConfirmed ? 'Yes' : 'No', 'paperSignatureConfirmed')}
              </td>
              <td className="px-2 py-2 text-center text-slate-500">
                {renderCell(trip, 'reviewed', trip.reviewed ? 'Done' : 'Pending', 'reviewed')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {reportRows.length === 0 && (
        <div className="flex h-48 items-center justify-center text-sm font-semibold text-slate-500">
          No trips found for this date or filter.
        </div>
      )}
      </div>
    </div>
    </div>
  );

  const renderReviewTable = () => (
    <div className="flex-1 overflow-y-auto px-3 pb-3">
    <div className="overflow-hidden rounded-3xl border border-slate-100/50 bg-white shadow-sm">
      <div className="overflow-x-auto">
      <table className="w-full table-fixed text-xs">
        <colgroup>
          <col className="w-[5%]" />
          <col className="w-[7%]" />
          <col className="w-[7%]" />
          <col className="w-[6%]" />
          <col className="w-[6%]" />
          <col className="w-[7%]" />
          <col className="w-[9%]" />
          <col className="w-[11%]" />
          <col className="w-[6%]" />
          <col className="w-[6%]" />
          <col className="w-[12%]" />
          <col className="w-[6%]" />
          <col className="w-[6%]" />
          <col className="w-[6%]" />
          <col className="w-[6%]" />
          <col className="w-[6%]" />
          <col className="w-[6%]" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-[#2f5b96] text-white shadow-sm">
          <tr>
            <th className="rounded-tl-xl px-2 py-2 text-left font-semibold">Edit</th>
            {['Date', 'Driver', 'Vehicle', 'Sche...', 'Trip ID', 'Passenger', 'Pickup Address', 'Pickup ...', 'Start Od...', 'Dropoff Address', 'Dropoff ...', 'End Od...', 'Travel Ti...', 'Distance...', 'Sign...', 'Revi...'].map((label) => (
              <th key={label} className="px-2 py-2 text-left font-semibold">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {reportRows.map(({ trip, driver, travelMinutes }, index) => (
            <tr key={trip.id} className={`${activeRow === trip.id ? 'bg-blue-100' : index % 2 ? 'bg-slate-50/70' : 'bg-white'} hover:bg-blue-50/70 transition-colors cursor-pointer`} onClick={() => setActiveRow(trip.id)}>
              <td className="px-2 py-2">
                <div className="flex items-center gap-2 text-slate-500">
                  {editingRow === trip.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); finishRowEdit(); }}
                        className="p-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-all duration-150"
                        title="Keep changes"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); revertRowEdit(); }}
                        className="p-0.5 rounded bg-rose-100 text-rose-700 hover:bg-rose-200 transition-all duration-150"
                        title="Cancel and restore original row"
                      >
                        <XCircle size={13} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="checkbox"
                        checked={!!trip.reviewed}
                        onChange={(event) => onUpdateTrip?.({ ...trip, reviewed: event.target.checked })}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                        aria-label={`Review ${trip.patient || trip.id}`}
                      />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); startRowEdit(trip); }}
                        className="p-0.5 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all duration-150"
                        title="Edit row"
                      >
                        <Edit2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </td>
              <td className="px-2 py-2 text-slate-900">
                {renderCell(trip, 'date', formatDateLabel(trip.date), 'date', 'date')}
              </td>
              <td className="px-2 py-2 text-slate-700">
                {renderCell(trip, 'driver', truncate(driver?.name || trip.driverName, 14), 'driverId')}
              </td>
              <td className="px-2 py-2 text-slate-500">
                {renderCell(trip, 'vehicle', truncate(trip.completedVehicle || driver?.vehicle || DASH, 12), 'completedVehicle')}
              </td>
              <td className="px-2 py-2 font-mono text-slate-900">
                {renderCell(trip, 'time', formatClock(trip.time), 'time', 'time')}
              </td>
              <td className="px-2 py-2 font-mono text-blue-900">
                {renderCell(trip, 'bookingId', truncate(trip.bookingId || trip.id, 12), 'bookingId')}
              </td>
              <td className="px-2 py-2 text-slate-900">
                {renderCell(trip, 'patient', truncate(trip.patient, 17), 'patient')}
              </td>
              <td className="px-2 py-2 font-mono text-emerald-700">
                {renderCell(trip, 'pickup', truncate(trip.pickup, 24), 'pickup')}
              </td>
              <td className="px-2 py-2 font-mono text-emerald-700">
                {renderCell(trip, 'arrivalTime', formatClock(trip.arrivalTime || trip.pickupTime), 'arrivalTime', 'time')}
              </td>
              <td className="px-2 py-2 font-mono text-emerald-700">
                {renderCell(trip, 'pickupOdometer', trip.pickupOdometer || DASH, 'pickupOdometer', 'number')}
              </td>
              <td className="px-2 py-2 font-mono text-rose-700">
                {renderCell(trip, 'dropoff', truncate(trip.dropoff, 27), 'dropoff')}
              </td>
              <td className="px-2 py-2 font-mono text-rose-700">
                {renderCell(trip, 'arrivalDropoffTime', formatClock(trip.arrivalDropoffTime || trip.completedAt), 'arrivalDropoffTime', 'time')}
              </td>
              <td className="px-2 py-2 font-mono text-rose-700">
                {renderCell(trip, 'dropoffOdometer', trip.dropoffOdometer || DASH, 'dropoffOdometer', 'number')}
              </td>
              <td className="px-2 py-2 font-mono text-slate-700">
                {renderCell(trip, 'travelTime', formatMinutes(travelMinutes), 'travelTime')}
              </td>
              <td className="px-2 py-2 font-mono text-[#2f5b96]">
                {renderCell(trip, 'distance', calcMiles(trip), 'distance', 'number')}
              </td>
              <td className="px-2 py-2 text-emerald-700">
                {renderCell(trip, 'signature', trip.paperSignatureConfirmed ? 'Yes' : 'No', 'paperSignatureConfirmed')}
              </td>
              <td className="px-2 py-2 text-slate-500">
                {renderCell(trip, 'reviewed', trip.reviewed ? 'Done' : 'Pending', 'reviewed')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {reportRows.length === 0 && (
        <div className="flex h-48 items-center justify-center text-sm font-semibold text-slate-500">
          No trips found for this date or filter.
        </div>
      )}
      </div>
    </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f4f7fa] font-sans text-slate-900">
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-white">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-100 bg-white px-3">
          <div className="relative w-[220px] shrink-0">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search..."
              className="h-8 w-full rounded-xl border border-slate-100 bg-slate-50 pl-8 pr-3 text-[12px] font-medium text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <button onClick={() => shiftDate(-1)} className="h-8 w-8 rounded-xl border border-slate-100 bg-white text-slate-500 hover:bg-slate-50"><ChevronLeft size={15} className="mx-auto" /></button>
          <button className="h-8 min-w-[132px] rounded-xl border border-slate-100 bg-white px-3 text-[12px] font-bold text-slate-800">{formatDateLabel(dateStr)}</button>
          <button onClick={() => shiftDate(1)} className="h-8 w-8 rounded-xl border border-slate-100 bg-white text-slate-500 hover:bg-slate-50"><ChevronRight size={15} className="mx-auto" /></button>

          <ViewButton active={viewMode === 'review'} onClick={() => setViewMode('review')}>Review Table</ViewButton>
          <ViewButton active={viewMode === 'cards'} onClick={() => setViewMode('cards')}>Cards</ViewButton>
          <ViewButton active={viewMode === 'invoice'} onClick={() => setViewMode('invoice')}>Invoice</ViewButton>

          <CompactSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="Completed">Completed</option>
            <option value="No Show">No Show</option>
            <option value="Cancelled">Cancelled</option>
            <option value="Rerouted">Rerouted</option>
          </CompactSelect>

          <CompactSelect value={driverFilter} onChange={(event) => setDriverFilter(event.target.value)}>
            <option value="all">All drivers</option>
            {driverOptions.map((driver) => <option key={driver.id} value={driver.id}>{driver.name || driver.email || driver.id}</option>)}
          </CompactSelect>

          <CompactSelect value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)}>
            <option value="all">All reviewed</option>
            <option value="reviewed">Reviewed only</option>
            <option value="pending">Pending only</option>
          </CompactSelect>

          <button type="button" onClick={() => setShowUploadModal?.(true)} className="ml-auto h-8 rounded-xl bg-[#2f5b96] px-3 text-[11px] font-bold text-white shadow-sm flex items-center gap-1.5">
            <Upload size={13} /> Upload
          </button>
          <button type="button" onClick={() => exportReviewCsv(reportRows)} className="h-8 rounded-xl bg-[#2f5b96] px-3 text-[11px] font-bold text-white shadow-sm flex items-center gap-1.5">
            <Download size={13} /> CSV
          </button>
          <button type="button" className="h-8 rounded-xl bg-indigo-600 px-3 text-[11px] font-bold text-white shadow-sm flex items-center gap-1.5">
            <Wand2 size={13} /> AI
          </button>
        </div>

        <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays size={15} className="text-slate-500" />
              <span className="text-lg font-semibold text-slate-800">{formatDateLabel(dateStr, true)}</span>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">{reportRows.length} trips</span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">{summary.reviewed}/{reportRows.length} reviewed</span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">{formatMinutes(summary.moving)} moving</span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">{formatMinutes(summary.stopped)} stopped</span>
          </div>

          <div className="flex items-center gap-3 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
            <button type="button" onClick={() => markRowsReviewed(true)} className="h-8 rounded-xl bg-emerald-100 px-3 text-[11px] font-bold normal-case text-emerald-700 hover:bg-emerald-200">Mark Day Done</button>
            <button type="button" onClick={() => markRowsReviewed(false)} className="h-8 rounded-xl bg-white px-3 text-[11px] font-bold normal-case text-slate-600 hover:bg-slate-100">Reset Review</button>
            <span>Total <b className="text-slate-900">{reportRows.length}</b></span>
            <span>Done <b className="text-emerald-700">{summary.done}</b></span>
            <span>RW <b className="text-slate-900">{summary.reviewed}</b></span>
            <span>NS <b className="text-rose-700">{summary.noShow}</b></span>
            <span>Can <b className="text-amber-700">{summary.cancelled}</b></span>
            <span>Lng <b className="text-slate-900">{Math.round(summary.distance)}mi</b></span>
          </div>
        </div>

        {viewMode === 'invoice' ? renderInvoiceTable() : viewMode === 'review' ? renderReviewTable() : renderCards()}
      </div>
    </div>
  );
};

export default DesktopReportsPage;
