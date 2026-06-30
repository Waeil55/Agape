import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Archive, Calendar, RefreshCcw, Search, X, ArrowUpDown, ArrowUp, ArrowDown, Check, Edit2, ChevronDown, ChevronRight } from 'lucide-react';

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
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [activeRow, setActiveRow] = useState(null);
  const inputRef = useRef(null);
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

  // ===== RESIZABLE COLUMNS =====
  const DEFAULT_COL_WIDTHS = {
    date: 100, driver: 100, time: 80, bookingId: 90,
    patient: 110, pickup: 160, dropoff: 160,
    arrivalTime: 80, departedPickupTime: 80, arrivalDropoffTime: 80,
    pickupOdometer: 90, dropoffOdometer: 90,
    travelTime: 80, distance: 80, signature: 75, vehicle: 80,
  };
  const [colWidths, setColWidths] = useState(() => {
    try { return { ...DEFAULT_COL_WIDTHS, ...JSON.parse(localStorage.getItem('agape_archiveColWidths') || '{}') }; } catch { return { ...DEFAULT_COL_WIDTHS }; }
  });
  const resizingRef = useRef(null);

  const startColResize = useCallback((e, colKey) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { colKey, startX: e.clientX, startWidth: colWidths[colKey] || 100 };
    const onMove = (me) => {
      if (!resizingRef.current) return;
      const dx = me.clientX - resizingRef.current.startX;
      const newW = Math.max(50, resizingRef.current.startWidth + dx);
      setColWidths(prev => ({ ...prev, [resizingRef.current.colKey]: newW }));
    };
    const onUp = () => {
      resizingRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [colWidths]);
  useEffect(() => { localStorage.setItem('agape_archiveColWidths', JSON.stringify(colWidths)); }, [colWidths]);
  // =========================

  useEffect(() => {
    if (editingCell && inputRef.current) inputRef.current.focus();
  }, [editingCell]);

  const canEdit = role === 'admin' || role === 'dispatcher';

  const startCellEdit = useCallback((tripId, field, currentVal) => {
    setEditingCell({ tripId, field });
    setEditValue(String(currentVal ?? ''));
  }, []);

  const saveCell = useCallback((trip, field, value) => {
    if (!updateTrashedTrip) return;
    let parsed = value;
    if (field === 'pickupOdometer' || field === 'dropoffOdometer') parsed = value === '' ? '' : Number(value);
    if (field === 'paperSignatureConfirmed') parsed = value === 'true' || value === true;
    if ((field === 'arrivalTime' || field === 'departedPickupTime' || field === 'arrivalDropoffTime') && value) {
      const parts = String(value).match(/(\d{1,2}):(\d{2})/);
      if (parts) {
        const d = new Date();
        d.setHours(parseInt(parts[1], 10), parseInt(parts[2], 10), 0, 0);
        parsed = d.toISOString();
      }
    }
    updateTrashedTrip({ ...trip, [field]: parsed });
    setEditingCell(null);
  }, [updateTrashedTrip]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

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

  const renderCellEditor = (trip, col) => {
    const field = FIELD_FOR_COL[col.key];
    if (!field) return null;

    if (col.key === 'signature') {
      return (
        <select
          ref={inputRef}
          className="w-full px-1 py-0.5 border border-blue-400 rounded text-xs outline-none bg-white"
          value={String(trip.paperSignatureConfirmed ?? false)}
          onChange={e => saveCell(trip, field, e.target.value)}
          onBlur={() => cancelEdit()}
          autoFocus
        >
          <option value="false">No</option>
          <option value="true">Yes</option>
        </select>
      );
    }

    if (col.key === 'driver') {
      return (
        <select
          ref={inputRef}
          className="w-full px-1 py-0.5 border border-blue-400 rounded text-xs outline-none bg-white"
          value={trip.driverId || ''}
          onChange={e => saveCell(trip, field, e.target.value)}
          onBlur={() => cancelEdit()}
          autoFocus
        >
          <option value="">—</option>
          {drivers.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      );
    }

    if (col.key === 'travelTime' || col.key === 'distance') {
      return (
        <input
          ref={inputRef}
          className="w-full px-1 py-0.5 border border-blue-400 rounded text-xs outline-none"
          type="text"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => saveCell(trip, field, editValue)}
          onKeyDown={e => { if (e.key === 'Enter') saveCell(trip, field, editValue); if (e.key === 'Escape') cancelEdit(); }}
          autoFocus
        />
      );
    }

    const isNumeric = col.key === 'pickupOdometer' || col.key === 'dropoffOdometer' || col.key === 'distance';

    return (
      <input
        ref={inputRef}
        className="w-full px-1 py-0.5 border border-blue-400 rounded text-xs outline-none"
        type={isNumeric ? 'number' : col.key === 'date' ? 'date' : 'text'}
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onBlur={() => saveCell(trip, field, editValue)}
        onKeyDown={e => { if (e.key === 'Enter') saveCell(trip, field, editValue); if (e.key === 'Escape') cancelEdit(); }}
        autoFocus
      />
    );
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

  const grouped = useMemo(() => {
    const groups = filtered.reduce((acc, trip) => {
      const key = trip.date || 'No Date';
      if (!acc[key]) acc[key] = [];
      acc[key].push(trip);
      return acc;
    }, {});
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const handleSort = (column) => {
    if (sortColumn === column) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(column); setSortDirection('asc'); }
  };

  const renderSortIcon = (column) => {
    if (sortColumn !== column) return <ArrowUpDown size={12} className="text-slate-400 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />;
    return sortDirection === 'asc'
      ? <ArrowUp size={12} className="text-blue-500 ml-1" />
      : <ArrowDown size={12} className="text-blue-500 ml-1" />;
  };

  const renderSortableHeader = (column, children, className = '') => (
    <th onClick={() => handleSort(column)}
      className={`p-2 text-left whitespace-nowrap cursor-pointer select-none group hover:bg-slate-700 transition-colors ${className}`}>
      <div className="flex items-center"><span className="text-[10px]">{children}</span>{renderSortIcon(column)}</div>
    </th>
  );

  const isEditingCell = (tripId, colKey) => editingCell?.tripId === tripId && editingCell?.field === colKey;

  const renderMobileArchiveCard = (trip) => (
    <div key={trip.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{renderCellValue(trip, { key: 'patient' })}</p>
          <p className="mt-0.5 text-xs font-mono font-semibold text-blue-600">{renderCellValue(trip, { key: 'bookingId' })}</p>
        </div>
        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">{renderCellValue(trip, { key: 'time' })}</span>
      </div>
      <div className="mt-3 space-y-2 text-xs font-medium text-slate-600">
        <p className="flex items-start gap-2"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" /><span className="break-words text-emerald-700">{renderCellValue(trip, { key: 'pickup' })}</span></p>
        <p className="flex items-start gap-2"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" /><span className="break-words text-rose-700">{renderCellValue(trip, { key: 'dropoff' })}</span></p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="font-bold uppercase tracking-wide text-slate-400">Driver</p>
          <p className="mt-1 font-semibold text-slate-700">{renderCellValue(trip, { key: 'driver' })}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="font-bold uppercase tracking-wide text-slate-400">Vehicle</p>
          <p className="mt-1 font-semibold text-slate-700">{renderCellValue(trip, { key: 'vehicle' })}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="font-bold uppercase tracking-wide text-slate-400">Miles</p>
          <p className="mt-1 font-semibold text-slate-700">{renderCellValue(trip, { key: 'distance' })}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="font-bold uppercase tracking-wide text-slate-400">Signature</p>
          <p className="mt-1 font-semibold text-slate-700">{renderCellValue(trip, { key: 'signature' })}</p>
        </div>
      </div>
      {restoreTrip && (
        <button onClick={() => restoreTrip(trip.id)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-200">
          <RefreshCcw size={12} /> Restore
        </button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col min-h-full bg-slate-100">
      <div className="bg-white border-b border-slate-200 px-3 py-1.5 flex flex-col lg:flex-row lg:items-center shrink-0 gap-1.5 sticky top-0 z-20">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-100 rounded px-2 py-1 min-w-[140px] max-w-[240px]">
            <Search size={11} className="text-slate-400 shrink-0" />
            <input type="text" placeholder="Search..." value={searchQuery}
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
            const isExpanded = expandedGroups[dateLabel] !== false; // default to true
            return (
            <div key={dateLabel} className="border-b border-slate-200 last:border-b-0">
              <div 
                className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 px-4 py-2 flex items-center gap-2 cursor-pointer hover:bg-slate-200 transition-colors"
                onClick={() => toggleGroup(dateLabel)}
              >
                {isExpanded ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
                <Calendar size={13} className="text-slate-500" />
                <span className="text-sm font-bold text-slate-700">{formatDateLabel(dateLabel)}</span>
                <span className="text-xs text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">{dayTrips.length} trips</span>
              </div>

              {isExpanded && (
              <>
              <div className="space-y-3 p-3 sm:hidden">
                {dayTrips.map(renderMobileArchiveCard)}
              </div>
              <div className="hidden w-full overflow-x-auto sm:block">
                <table className="resizable-table text-xs" style={{ tableLayout: 'fixed', width: '100%', minWidth: Object.values(colWidths).reduce((a, b) => a + b, 0) + 100 }}>
                  <colgroup>
                    {Columns.map(col => (
                      <col key={col.key} style={{ width: colWidths[col.key] || 100 }} />
                    ))}
                    <col style={{ width: 80 }} />
                  </colgroup>
                  <thead className="bg-slate-800 text-slate-100 border-b border-slate-200">
                    <tr>
                      {Columns.map(col => (
                        <th
                          key={col.key}
                          className="resizable-th p-0 text-left select-none"
                          style={{ width: colWidths[col.key] || 100 }}
                        >
                          <div
                            className="flex items-center justify-between cursor-pointer group hover:bg-slate-700 transition-colors px-2 py-2 h-full"
                            onClick={() => handleSort(col.key)}
                          >
                            <span className="text-[10px] font-semibold truncate">{col.label}</span>
                            <span className="ml-1 shrink-0">{renderSortIcon(col.key)}</span>
                          </div>
                          {/* Resize handle */}
                          <div
                            className="col-resize-handle"
                            onMouseDown={(e) => startColResize(e, col.key)}
                            title="Drag to resize column"
                          />
                        </th>
                      ))}
                      <th className="resizable-th p-2 text-left text-[10px] font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {dayTrips.map((trip) => {
                      const driverName = getDriverLabel(trip, drivers);

                      return (
                        <tr key={trip.id} className={`${activeRow === trip.id ? 'bg-blue-100' : ''} hover:bg-blue-50/50 transition-colors ${canEdit ? 'cursor-pointer' : ''}`}
                          onClick={(e) => {
                            if (!canEdit) return;
                            const interactiveTags = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'SVG', 'PATH'];
                            if (interactiveTags.includes(e.target.tagName)) return;
                            setActiveRow(trip.id);
                          }}>
                          {Columns.map(col => {
                            const cellKey = col.key;
                            const displayValue = renderCellValue(trip, col);
                            const isEditing = isEditingCell(trip.id, cellKey);

                            return (
                              <td key={cellKey} className={`p-2 whitespace-nowrap ${cellKey === 'pickup' ? 'max-w-[200px] truncate text-emerald-600' : ''} ${cellKey === 'dropoff' ? 'max-w-[200px] truncate text-rose-600' : ''} ${cellKey === 'signature' && displayValue === 'Yes' ? 'text-emerald-600' : ''} ${cellKey === 'distance' && displayValue !== '—' ? 'text-blue-600 bg-blue-50/30' : ''} ${cellKey === 'arrivalTime' ? 'text-emerald-600 bg-emerald-50/30' : ''} ${cellKey === 'departedPickupTime' ? 'text-amber-600 bg-amber-50/30' : ''} ${cellKey === 'arrivalDropoffTime' ? 'text-rose-600 bg-rose-50/30' : ''} ${cellKey === 'date' || cellKey === 'patient' ? 'text-slate-900' : ''} ${cellKey === 'driver' ? 'text-slate-700' : ''} ${cellKey === 'time' || cellKey === 'arrivalTime' || cellKey === 'departedPickupTime' || cellKey === 'arrivalDropoffTime' ? 'font-mono' : ''} ${cellKey === 'bookingId' ? 'font-mono text-blue-600' : ''} ${cellKey === 'pickupOdometer' ? 'font-mono text-emerald-600' : ''} ${cellKey === 'dropoffOdometer' ? 'font-mono text-rose-600' : ''} ${cellKey === 'travelTime' ? 'text-slate-600' : ''} ${cellKey === 'vehicle' ? 'text-slate-400 text-[10px] font-mono tracking-wider uppercase' : ''}`}
                                title={cellKey === 'pickup' || cellKey === 'dropoff' ? displayValue : undefined}
                              >
                                {isEditing ? (
                                  renderCellEditor(trip, col)
                                ) : canEdit && cellKey !== 'signature' ? (
                                  <span
                                    className="cursor-pointer hover:bg-blue-50 rounded px-1 -mx-1 block leading-5"
                                    onClick={() => startCellEdit(trip.id, cellKey, (trip[FIELD_FOR_COL[cellKey]] ?? ''))}
                                  >
                                    {displayValue}
                                  </span>
                                ) : cellKey === 'signature' && canEdit ? (
                                  <span
                                    className="cursor-pointer hover:bg-blue-50 rounded px-1 -mx-1 block leading-5"
                                    onClick={() => saveCell(trip, 'paperSignatureConfirmed', !trip.paperSignatureConfirmed)}
                                  >
                                    {displayValue}
                                  </span>
                                ) : (
                                  <span className="block leading-5">{displayValue}</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="p-2 whitespace-nowrap">
                            {restoreTrip && (
                              <button onClick={() => restoreTrip(trip.id)}
                                className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-bold hover:bg-slate-200 transition-colors">
                                <RefreshCcw size={12} /> Restore
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
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
