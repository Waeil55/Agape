import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  ChevronDown, ChevronUp, Download, UploadCloud, RefreshCw,
  X, Search, FileText, Calendar, Archive, Eye, RotateCcw,
  Square, CheckSquare, ArrowUpDown, ArrowUp, ArrowDown, SquarePen, Check,
  BrainCircuit, Loader2, AlertTriangle, Lightbulb, ChevronLeft, ChevronRight
} from 'lucide-react';
import { formatTelemetryDuration } from '../utils/driverTelemetry';
import { aiAnalyzeTrips } from '../config/ai';
import { tripCalendarDateKey, localCalendarYmd } from '../utils/tripDate';

const STATUS_OPTIONS = ['Completed', 'No Show', 'Cancelled'];

const today = new Date().toISOString().split('T')[0];

const STATUS_VARIANT = {
  Completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'No Show': 'bg-rose-100 text-rose-700 border-rose-200',
  Cancelled: 'bg-amber-100 text-amber-700 border-amber-200',
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
  return '—';
};

const parseDateOrClock = (value) => {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const match = s.toUpperCase().match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const meridiem = match[3];
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
};

const toTimeInput = (value) => {
  if (!value) return '';
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

const buildCsvValue = (value) => `"${String(value ?? '').replace(/"/g, '""').replace(/—/g, '')}"`;

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

const calcMiles = (pickupOdo, dropoffOdo, storedDistance) => {
  if (storedDistance !== null && storedDistance !== undefined && storedDistance !== '') {
    const sd = Number(storedDistance);
    if (sd > 0) return sd.toFixed(1);
  }
  const p = pickupOdo === null || pickupOdo === undefined || pickupOdo === '' ? null : Number(pickupOdo);
  const d = dropoffOdo === null || dropoffOdo === undefined || dropoffOdo === '' ? null : Number(dropoffOdo);
  if (p !== null && d !== null) {
    const diff = d - p;
    if (diff > 0) return diff.toFixed(1);
  }
  return '—';
};

const formatDateLabel = (dateStr) => {
  if (dateStr === 'No Date') return 'No Date';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

const Columns = [
  { key: 'date', label: 'Date', sortKey: 'date' },
  { key: 'driver', label: 'Driver', sortKey: 'driver' },
  { key: 'vehicle', label: 'Vehicle', sortKey: 'vehicle' },
  { key: 'time', label: 'Scheduled', sortKey: 'time' },
  { key: 'bookingId', label: 'Trip ID', sortKey: 'bookingId' },
  { key: 'patient', label: 'Passenger', sortKey: 'patient' },
  { key: 'pickup', label: 'Pickup Address', sortKey: 'pickup' },
  { key: 'arrivalTime', label: 'Pickup Arrival', sortKey: 'arrivalTime' },
  { key: 'departedPickupTime', label: 'Departed Pickup', sortKey: 'departedPickupTime' },
  { key: 'pickupOdometer', label: 'Start Odometer', sortKey: 'pickupOdometer' },
  { key: 'dropoff', label: 'Dropoff Address', sortKey: 'dropoff' },
  { key: 'arrivalDropoffTime', label: 'Dropoff Arrival', sortKey: 'arrivalDropoffTime' },
  { key: 'dropoffOdometer', label: 'End Odometer', sortKey: 'dropoffOdometer' },
  { key: 'travelTime', label: 'Travel Time', sortKey: 'travelTime' },
  { key: 'distance', label: 'Distance (mi)', sortKey: 'distance' },
  { key: 'signature', label: 'Signature', sortKey: 'signature' },
  { key: 'reviewed', label: 'Reviewed', sortKey: 'reviewed' },
];

const FIELD_FOR_COL = {
  date: 'date', driver: 'driverId', time: 'time', bookingId: 'bookingId',
  patient: 'patient', pickup: 'pickup', dropoff: 'dropoff',
  arrivalTime: 'arrivalTime', departedPickupTime: 'departedPickupTime', arrivalDropoffTime: 'arrivalDropoffTime',
  pickupOdometer: 'pickupOdometer', dropoffOdometer: 'dropoffOdometer',
  travelTime: 'travelTime', distance: 'distance',
  signature: 'paperSignatureConfirmed', reviewed: 'reviewed', vehicle: 'completedVehicle',
};

const ROW_CONTROL_COL_WIDTH = 92;

const ReportsPage = ({ trips = [], drivers = [], vehicles = [], driverTelemetry = [], onUpdateTrip, role, setShowUploadModal, requestBulkDelete }) => {
  const [startDate, setStartDate] = useState(() => localStorage.getItem('agape_rptStartDate') || localCalendarYmd());
  const [endDate, setEndDate] = useState(() => localStorage.getItem('agape_rptEndDate') || localCalendarYmd());
  const [statusFilter, setStatusFilter] = useState(() => localStorage.getItem('agape_rptStatusFilter') || 'all');
  const [driverFilter, setDriverFilter] = useState(() => localStorage.getItem('agape_rptDriverFilter') || 'all');
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('agape_rptSearch') || '');
  const [activeRow, setActiveRow] = useState(null);
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [sortColumn, setSortColumn] = useState(() => localStorage.getItem('agape_rptSortCol') || 'time');
  const [sortDirection, setSortDirection] = useState(() => localStorage.getItem('agape_rptSortDir') || 'asc');
  const [showFilters, setShowFilters] = useState(true);
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editingRow, setEditingRow] = useState(null);
  const [editingRowSnapshot, setEditingRowSnapshot] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const inputRef = useRef(null);

  const [collapsedDays, setCollapsedDays] = useState(() => {
    try { return JSON.parse(localStorage.getItem('agape_rptCollapsedDays') || '{}'); } catch { return {}; }
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [rangeMode, setRangeMode] = useState(false);
  const [selectingFrom, setSelectingFrom] = useState(true);
  const [pickerMonth, setPickerMonth] = useState(() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  });
  const [hiddenCols, setHiddenCols] = useState(() => {
    try { return JSON.parse(localStorage.getItem('agape_rptHiddenCols') || '[]'); } catch { return []; }
  });
  const datePickerRef = useRef(null);
  const PAGE_SIZE = 100;
  const [page, setPage] = useState(1);
  const toggleDay = (dateLabel) => {
    setCollapsedDays(prev => ({ ...prev, [dateLabel]: !prev[dateLabel] }));
  };

  useEffect(() => {
    localStorage.setItem('agape_rptStartDate', startDate);
    localStorage.setItem('agape_rptEndDate', endDate);
    localStorage.setItem('agape_rptStatusFilter', statusFilter);
    localStorage.setItem('agape_rptDriverFilter', driverFilter);
    localStorage.setItem('agape_rptSearch', searchQuery);
    localStorage.setItem('agape_rptSortCol', sortColumn);
    localStorage.setItem('agape_rptSortDir', sortDirection);
    localStorage.setItem('agape_rptCollapsedDays', JSON.stringify(collapsedDays));
    localStorage.setItem('agape_rptHiddenCols', JSON.stringify(hiddenCols));
  }, [startDate, endDate, statusFilter, driverFilter, searchQuery, sortColumn, sortDirection, collapsedDays, hiddenCols]);

  // ===== RESIZABLE COLUMNS =====
  const DEFAULT_COL_WIDTHS = {
    date: 100, driver: 100, vehicle: 80, time: 75, bookingId: 90,
    patient: 110, pickup: 160, arrivalTime: 80, departedPickupTime: 80, pickupOdometer: 90,
    dropoff: 160, arrivalDropoffTime: 80, dropoffOdometer: 90,
    travelTime: 80, distance: 80, signature: 75, reviewed: 75,
  };
  const [colWidths, setColWidths] = useState(() => {
    try { return { ...DEFAULT_COL_WIDTHS, ...JSON.parse(localStorage.getItem('agape_rptColWidths') || '{}') }; } catch { return { ...DEFAULT_COL_WIDTHS }; }
  });
  const resizingRef = useRef(null); // { colKey, startX, startWidth }

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
  useEffect(() => { localStorage.setItem('agape_rptColWidths', JSON.stringify(colWidths)); }, [colWidths]);
  // ===========================

  useEffect(() => {
    if (editingCell && inputRef.current) inputRef.current.focus();
  }, [editingCell]);

  const canEdit = role === 'admin' || role === 'dispatcher';

  const startCellEdit = useCallback((tripId, field, currentVal) => {
    setEditingCell({ tripId, field });
    const isTimeField = field === 'arrivalTime' || field === 'departedPickupTime' || field === 'arrivalDropoffTime' || field === 'time';
    setEditValue(isTimeField ? toTimeInput(currentVal) : String(currentVal ?? ''));
  }, []);

  const saveCell = useCallback((trip, field, value) => {
    if (!onUpdateTrip) return;
    let parsed = value;
    if (field === 'pickupOdometer' || field === 'dropoffOdometer' || field === 'distance') parsed = value === '' ? '' : Number(value);
    if (field === 'paperSignatureConfirmed' || field === 'reviewed') parsed = value === 'true' || value === true;
    if ((field === 'arrivalTime' || field === 'departedPickupTime' || field === 'arrivalDropoffTime') && value) {
      const parts = String(value).match(/(\d{1,2}):(\d{2})/);
      if (parts) {
        const d = new Date();
        d.setHours(parseInt(parts[1], 10), parseInt(parts[2], 10), 0, 0);
        parsed = d.toISOString();
      }
    }
    onUpdateTrip({ ...trip, [field]: parsed });
    setEditingCell(null);
  }, [onUpdateTrip]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  const startRowEdit = useCallback((trip) => {
    setEditingRow(trip.id);
    setEditingRowSnapshot({ ...trip });
    setEditingCell(null);
    setEditValue('');
  }, []);

  const finishRowEdit = useCallback(() => {
    setEditingRow(null);
    setEditingRowSnapshot(null);
    setEditingCell(null);
    setEditValue('');
  }, []);

  const revertRowEdit = useCallback(() => {
    if (editingRowSnapshot && onUpdateTrip) {
      onUpdateTrip(editingRowSnapshot);
    }
    finishRowEdit();
  }, [editingRowSnapshot, onUpdateTrip, finishRowEdit]);

  const getSortValue = (trip, key) => {
    switch (key) {
      case 'date': return trip.date || '';
      case 'driver': return getDriverLabel(trip, drivers);
      case 'vehicle': return trip.completedVehicle || '';
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
      case 'distance': { const dm = calcMiles(trip.pickupOdometer, trip.dropoffOdometer, trip.distance); return dm !== '—' ? Number(dm) : 0; }
      case 'signature': return trip.paperSignatureConfirmed ? 1 : 0;
      case 'reviewed': return trip.reviewed ? 1 : 0;
      default: return '';
    }
  };

  const renderCellValue = (trip, col) => {
    switch (col.key) {
      case 'date': return formatDateLabel(trip.date || 'No Date');
      case 'driver': return getDriverLabel(trip, drivers);
      case 'vehicle': { const v = trip.completedVehicle || ''; return v && v !== 'Pending Assignment' ? v : '—'; }
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
      case 'travelTime': return trip.travelTime || calcDuration(trip.departedPickupTime || trip.arrivalTime, trip.arrivalDropoffTime || trip.completedAt);
      case 'distance': return calcMiles(trip.pickupOdometer, trip.dropoffOdometer, trip.distance);
      case 'signature': {
        if (!('paperSignatureConfirmed' in trip)) return '—';
        return trip.paperSignatureConfirmed ? 'Yes' : 'No';
      }
      case 'reviewed': return trip.reviewed ? 'Done' : 'Pending';
      default: return '—';
    }
  };

  const renderCellEditor = (trip, col) => {
    const fieldMap = {
      date: 'date', driver: 'driverId', time: 'time', bookingId: 'bookingId',
      patient: 'patient', pickup: 'pickup', dropoff: 'dropoff',
      arrivalTime: 'arrivalTime', departedPickupTime: 'departedPickupTime', arrivalDropoffTime: 'arrivalDropoffTime',
      pickupOdometer: 'pickupOdometer', dropoffOdometer: 'dropoffOdometer',
      travelTime: 'travelTime', distance: 'distance',
      signature: 'paperSignatureConfirmed', reviewed: 'reviewed', vehicle: 'completedVehicle',
    };
    const field = fieldMap[col.key];
    if (!field) return null;

    if (col.key === 'signature' || col.key === 'reviewed') {
      const value = col.key === 'signature'
        ? String(trip.paperSignatureConfirmed ?? false)
        : String(trip.reviewed ?? false);
      return (
        <select
          ref={inputRef}
          className="w-full px-1 py-0.5 border border-blue-400 rounded text-xs outline-none bg-white"
          value={value}
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

    if (col.key === 'vehicle') {
      return (
        <select
          ref={inputRef}
          className="w-full px-1 py-0.5 border border-blue-400 rounded text-xs outline-none bg-white"
          value={trip.completedVehicle || ''}
          onChange={e => saveCell(trip, field, e.target.value)}
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

    if (col.key === 'time' || col.key === 'arrivalTime' || col.key === 'arrivalDropoffTime') {
      return (
        <input
          ref={inputRef}
          className="w-full px-1 py-0.5 border border-blue-400 rounded text-xs outline-none"
          type="time"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => saveCell(trip, field, editValue)}
          onKeyDown={e => { if (e.key === 'Enter') saveCell(trip, field, editValue); if (e.key === 'Escape') cancelEdit(); }}
          autoFocus
        />
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

  const reportTrips = useMemo(() => {
    let filtered = [...trips]
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
        const tripDate = tripCalendarDateKey(trip.date) || trip.date || '';
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
      const aVal = getSortValue(a, sortColumn);
      const bVal = getSortValue(b, sortColumn);
      if (typeof aVal === 'string' && typeof bVal === 'string') cmp = aVal.localeCompare(bVal);
      else if (aVal < bVal) cmp = -1;
      else if (aVal > bVal) cmp = 1;
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
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === 'No Date') return 1;
      if (b === 'No Date') return -1;
      return b.localeCompare(a);
    });
  }, [reportTrips]);

  // Group trips by passenger within each date
  const groupedByPassenger = useMemo(() => {
    const result = {};
    groupedTrips.forEach(([date, dayTrips]) => {
      const passengerGroups = {};
      dayTrips.forEach(trip => {
        const passengerKey = trip.patient || 'Unknown';
        if (!passengerGroups[passengerKey]) {
          passengerGroups[passengerKey] = [];
        }
        passengerGroups[passengerKey].push(trip);
      });
      result[date] = Object.entries(passengerGroups);
    });
    return result;
  }, [groupedTrips]);

  const totalPages = Math.max(1, Math.ceil(groupedTrips.length / PAGE_SIZE));
  const paginatedGroupedTrips = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return groupedTrips.slice(start, start + PAGE_SIZE);
  }, [groupedTrips, page]);

  useEffect(() => { setPage(1); }, [statusFilter, driverFilter, startDate, endDate, searchQuery]);

  const stats = useMemo(() => ({
    total: reportTrips.length,
    completed: reportTrips.filter((t) => t.status === 'Completed').length,
    noShow: reportTrips.filter((t) => t.status === 'No Show').length,
    cancelled: reportTrips.filter((t) => t.status === 'Cancelled').length,
    reviewed: reportTrips.filter((t) => t.reviewed).length,
    totalRows: reportTrips.length,
  }), [reportTrips]);

  const trackingDocs = useMemo(() => {
    return (driverTelemetry || [])
      .filter((doc) => {
        const docDate = doc.date || '';
        if (startDate && docDate && docDate < startDate) return false;
        if (endDate && docDate && docDate > endDate) return false;
        if (driverFilter === 'all') return true;
        if (driverFilter === 'unassigned') return false;
        const driver = drivers.find((item) => item.id === driverFilter || item.email === driverFilter);
        if (!driver) return doc.driverId === driverFilter || doc.driverEmail === driverFilter;
        return doc.driverId === driver.id || doc.driverEmail === driver.email;
      })
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  }, [driverFilter, driverTelemetry, drivers, endDate, startDate]);

  const trackingStats = useMemo(() => {
    const totals = trackingDocs.reduce((acc, doc) => {
      acc.trackedDrivers += 1;
      acc.movingMinutes += Number(doc.totalMovingMinutes || 0);
      acc.stoppedMinutes += Number(doc.totalStoppedMinutes || 0);
      acc.trackedMiles += Number(doc.totalTrackedMiles || 0);
      acc.stopCount += Number(doc.stopCount || 0);
      acc.longestStopMinutes = Math.max(acc.longestStopMinutes, Number(doc.longestStopMinutes || 0));
      return acc;
    }, {
      trackedDrivers: 0,
      movingMinutes: 0,
      stoppedMinutes: 0,
      trackedMiles: 0,
      stopCount: 0,
      longestStopMinutes: 0,
    });
    return {
      ...totals,
      trackedMiles: Number(totals.trackedMiles.toFixed(1)),
    };
  }, [trackingDocs]);

  const [aiReport, setAiReport] = useState(null);
  const [aiReportLoading, setAiReportLoading] = useState(false);

  const generateAiReport = useCallback(async () => {
    if (reportTrips.length === 0) return;
    setAiReportLoading(true);
    setAiReport(null);
    const result = await aiAnalyzeTrips(reportTrips, stats);
    setAiReport(result);
    setAiReportLoading(false);
  }, [reportTrips, stats]);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (column) => {
    if (sortColumn !== column) return <ArrowUpDown size={12} className="text-slate-400 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />;
    return sortDirection === 'asc'
      ? <ArrowUp size={12} className="text-blue-500 ml-1" />
      : <ArrowDown size={12} className="text-blue-500 ml-1" />;
  };

  const renderSortableHeader = (column, children, className = '') => (
    <th
      onClick={() => handleSort(column)}
      className={`p-2 text-left whitespace-nowrap cursor-pointer select-none group hover:bg-slate-700 transition-colors ${className}`}
    >
      <div className="flex items-center">
        <span className="text-[10px]">{children}</span>
        {renderSortIcon(column)}
      </div>
    </th>
  );

  const markTripsReviewed = (tripsToReview, reviewed = true) => {
    if (!onUpdateTrip) return;
    tripsToReview.forEach((trip) => {
      onUpdateTrip({ ...trip, reviewed });
    });
  };

  const reportTableMinWidth = useMemo(
    () => Object.values(colWidths).reduce((sum, width) => sum + width, 0) + ROW_CONTROL_COL_WIDTH,
    [colWidths]
  );

  const visibleColumns = useMemo(() => Columns.filter(col => !hiddenCols.includes(col.key)), [hiddenCols]);

  const isEditingCell = (tripId, colKey) => editingCell?.tripId === tripId && editingCell?.field === colKey;

  const exportCsv = () => {
    const headers = [
      'Date', 'Driver', 'Vehicle', 'Scheduled Time', 'Trip ID', 'Passenger',
      'Pickup Address', 'Pickup Time', 'Departed Pickup', 'Start Odometer', 'Dropoff Address', 'Dropoff',
      'End Odometer', 'Travel Time', 'Distance (mi)', 'Signature', 'Reviewed'
    ];

    const rows = [];
    reportTrips.forEach((trip) => {
      const driver = getDriverRecord(trip, drivers);
      const driverName = driver?.name || trip.driverName || '—';
      const vehicle = trip.completedVehicle || (driver?.vehicle && driver.vehicle !== 'Pending Assignment' ? driver.vehicle : '') || '—';
      const duration = trip.travelTime || calcDuration(trip.departedPickupTime || trip.arrivalTime, trip.arrivalDropoffTime || trip.completedAt);
      const scheduledTime = formatClock24(trip.time) !== '—' ? formatClock24(trip.time) : formatClock24(trip.arrivalTime);
      const pickupTime = formatClock24(trip.arrivalTime);
      const departedPickup = formatClock24(trip.departedPickupTime);
      const pickupAddr = trip.pickup || '';
      const dropoffAddr = trip.dropoff || '';
      const dropoffTime = formatClock24(trip.arrivalDropoffTime || trip.completedAt);
      const pickupOdo = trip.pickupOdometer || '';
      const dropoffOdo = trip.dropoffOdometer || '';
      const signed = 'paperSignatureConfirmed' in trip ? (trip.paperSignatureConfirmed ? 'Yes' : 'No') : '';
      const miles = calcMiles(trip.pickupOdometer, trip.dropoffOdometer, trip.distance);
      const reviewed = trip.reviewed ? 'Yes' : 'No';

      const formattedDate = formatDateLabel(trip.date || 'No Date');

      rows.push([
        buildCsvValue(formattedDate),
        buildCsvValue(driverName),
        buildCsvValue(vehicle),
        buildCsvValue(scheduledTime),
        buildCsvValue(trip.bookingId || trip.id || ''),
        buildCsvValue(trip.patient || ''),
        buildCsvValue(pickupAddr),
        buildCsvValue(pickupTime),
        buildCsvValue(departedPickup),
        buildCsvValue(pickupOdo),
        buildCsvValue(dropoffAddr),
        buildCsvValue(dropoffTime),
        buildCsvValue(dropoffOdo),
        buildCsvValue(duration),
        buildCsvValue(miles !== '—' ? miles : ''),
        buildCsvValue(signed),
        buildCsvValue(reviewed)
      ]);
    });

    const csv = '\uFEFF' + [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `agape-report-${today}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setStartDate(localCalendarYmd());
    setEndDate(localCalendarYmd());
    setStatusFilter('all');
    setDriverFilter('all');
    setSearchQuery('');
    setSortColumn('time');
    setSortDirection('asc');
  };

  const shiftDateRange = (days) => {
    const shift = (d) => {
      const dt = new Date(d + 'T00:00:00');
      dt.setDate(dt.getDate() + days);
      return dt.toISOString().split('T')[0];
    };
    setStartDate(shift(startDate));
    setEndDate(shift(endDate));
  };

  const formatDateLabel = (d) => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  useEffect(() => {
    if (!showDatePicker) return;
    const handler = (e) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target)) {
        setShowDatePicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDatePicker]);

  const getMonthDays = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const firstDay = new Date(y, m - 1, 1).getDay();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return cells;
  };

  const handleDateSelect = (dateStr) => {
    if (!rangeMode) {
      setStartDate(dateStr);
      setEndDate(dateStr);
      setShowDatePicker(false);
    } else if (selectingFrom) {
      setStartDate(dateStr);
      if (endDate < dateStr) setEndDate(dateStr);
      setSelectingFrom(false);
    } else {
      if (dateStr < startDate) {
        setEndDate(startDate);
        setStartDate(dateStr);
      } else {
        setEndDate(dateStr);
      }
      setSelectingFrom(true);
      setShowDatePicker(false);
    }
  };

  const isSelectedDate = (ds) => ds === startDate || ds === endDate;
  const isInRange = (ds) => rangeMode && startDate && endDate && ds > startDate && ds < endDate;

  const changePickerMonth = (delta) => {
    const [y, m] = pickerMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setPickerMonth(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  };

  const toggleRangeMode = () => {
    setRangeMode(prev => !prev);
    setSelectingFrom(true);
    setShowDatePicker(false);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50">
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-[0_1px_6px_rgba(0,0,0,0.04)] px-3 py-1.5 flex items-center gap-1.5 flex-wrap text-[10px]">
        <div className="flex items-center gap-1.5 bg-slate-100/80 rounded-lg px-2 py-1 min-w-[100px] border border-slate-200/50">
          <Search size={10} className="text-slate-400 shrink-0" />
          <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent outline-none w-full min-w-0 placeholder:text-slate-400 text-[10px]" />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600"><X size={10} /></button>}
        </div>
        <div className="relative flex items-center gap-0.5 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 rounded-lg px-1.5 py-1 border border-blue-100/50 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8)]">
          <button onClick={() => shiftDateRange(-1)} className="p-0.5 rounded-md hover:bg-white/70 text-slate-500 transition-colors"><ChevronLeft size={12} /></button>
          <button onClick={() => setShowDatePicker(prev => !prev)} className="px-2 py-0.5 rounded-md hover:bg-white/70 text-[11px] font-semibold text-slate-800 min-w-[120px] text-center select-none transition-colors">
            {startDate === endDate ? formatDateLabel(startDate) : `${formatDateLabel(startDate)} — ${formatDateLabel(endDate)}`}
          </button>
          <button onClick={() => shiftDateRange(1)} className="p-0.5 rounded-md hover:bg-white/70 text-slate-500 transition-colors"><ChevronRight size={12} /></button>
          <span className="w-px h-4 bg-blue-200/50 mx-0.5" />
          <button onClick={toggleRangeMode} className={`px-1.5 py-0.5 rounded-md text-[8px] font-bold tracking-wider transition-all ${rangeMode ? 'bg-blue-500 text-white shadow-sm' : 'bg-white/70 text-slate-500 hover:bg-white border border-slate-200/50'}`}>
            {rangeMode ? 'RANGE' : 'DAY'}
          </button>
          {showDatePicker && (
            <div ref={datePickerRef} className="absolute top-full left-0 mt-1.5 z-50 bg-white rounded-xl shadow-xl border border-slate-200 p-3 w-[244px]">
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => changePickerMonth(-1)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"><ChevronLeft size={14} /></button>
                <span className="text-xs font-bold text-slate-800">
                  {new Date(pickerMonth + '-T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={() => changePickerMonth(1)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"><ChevronRight size={14} /></button>
              </div>
              <div className="grid grid-cols-7 gap-px text-center">
                {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                  <div key={d} className="text-[9px] text-slate-400 font-semibold py-1">{d}</div>
                ))}
                {getMonthDays(pickerMonth).map((ds, i) => (
                  <div key={i} className="aspect-square p-px">
                    {ds ? (
                      <button onClick={() => handleDateSelect(ds)} className={`w-full h-full flex items-center justify-center text-[11px] rounded-full transition-all ${isSelectedDate(ds) ? 'bg-blue-600 text-white font-bold shadow-sm' : ''} ${isInRange(ds) ? 'bg-blue-100' : ''} ${!isSelectedDate(ds) && !isInRange(ds) ? 'hover:bg-slate-100 text-slate-700' : ''} ${ds === localCalendarYmd() && !isSelectedDate(ds) ? 'ring-1 ring-blue-300' : ''}`}>
                        {new Date(ds + 'T12:00:00').getDate()}
                      </button>
                    ) : <div />}
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[9px] text-center font-medium">
                {rangeMode ? (selectingFrom ? <span className="text-blue-600">Tap <b>From</b> date</span> : <span className="text-emerald-600">Tap <b>To</b> date</span>) : <span className="text-slate-400">Tap a date to select</span>}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-1.5 py-1 border border-slate-200 rounded-lg text-[9px] outline-none bg-white/80 text-slate-600 font-medium cursor-pointer hover:border-slate-300 transition-colors">
            <option value="all">All status</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} className="px-1.5 py-1 border border-slate-200 rounded-lg text-[9px] outline-none bg-white/80 text-slate-600 font-medium cursor-pointer hover:border-slate-300 transition-colors max-w-[100px]">
            <option value="all">All drivers</option>
            {drivers.map((d) => (<option key={d.id} value={d.id || d.email}>{d.name}</option>))}
          </select>
          <button onClick={resetFilters} className="p-1 rounded-lg bg-white/80 border border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-all" title="Reset filters"><RefreshCw size={9} /></button>
          <button onClick={() => setHiddenCols(prev => prev.includes('arrivalTime') ? prev.filter(c => c !== 'arrivalTime') : [...prev, 'arrivalTime'])} className={`p-1 rounded-lg border transition-all ${hiddenCols.includes('arrivalTime') ? 'bg-rose-50 border-rose-200 text-rose-500' : 'bg-white/80 border-slate-200 text-slate-400 hover:text-slate-600'}`} title={hiddenCols.includes('arrivalTime') ? 'Show Pickup Arrival' : 'Hide Pickup Arrival'}>
            <Eye size={9} />
          </button>
        </div>
        {selectedTasks.length > 0 && (
          <button onClick={() => requestBulkDelete(selectedTasks, () => setSelectedTasks([]))} className="flex items-center gap-1 px-1.5 py-1 bg-rose-50 text-rose-600 rounded-lg font-semibold border border-rose-200/50 hover:bg-rose-100 transition-colors"><Archive size={9} /> {selectedTasks.length}</button>
        )}
        <div className="flex items-center gap-1">
          <button onClick={() => setShowUploadModal(true)} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition-colors shadow-sm flex items-center gap-1"><UploadCloud size={9} /> Upload</button>
          <button onClick={exportCsv} disabled={reportTrips.length === 0} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold disabled:opacity-40 transition-colors shadow-sm flex items-center gap-1"><Download size={9} /> CSV</button>
          <button onClick={generateAiReport} disabled={reportTrips.length === 0 || aiReportLoading} className="px-2 py-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg font-bold disabled:opacity-40 transition-all shadow-sm flex items-center gap-1">
            {aiReportLoading ? <Loader2 size={9} className="animate-spin" /> : <BrainCircuit size={9} />} AI
          </button>
        </div>
        <span className="w-px h-5 bg-slate-200/60" />
        <div className="flex items-center gap-1.5 bg-slate-100/50 rounded-lg px-1.5 py-0.5">
          {[
            { label: 'Total', value: stats.total, color: 'text-slate-700' },
            { label: 'Done', value: stats.completed, color: 'text-emerald-600' },
            { label: 'Rvw', value: stats.reviewed, color: 'text-indigo-600' },
            { label: 'NS', value: stats.noShow, color: 'text-rose-600' },
            { label: 'Can', value: stats.cancelled, color: 'text-amber-600' },
          ].map((s) => (
            <span key={s.label} className="flex items-center gap-0.5">
              <span className="text-[8px] text-slate-400 font-semibold uppercase">{s.label}</span>
              <span className={`text-[10px] font-extrabold ${s.color}`}>{s.value}</span>
            </span>
          ))}
        </div>
        {totalPages > 1 && (
          <span className="flex items-center gap-1 text-[9px] bg-slate-100/50 rounded-lg px-1.5 py-0.5">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-1 py-0.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-30 font-bold transition-colors">&lsaquo;</button>
            <span className="text-slate-500 font-semibold mx-0.5 min-w-[20px] text-center">{page}/{totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-1 py-0.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-30 font-bold transition-colors">&rsaquo;</button>
          </span>
        )}
        {reportTrips.length > 0 && <span className="text-[9px] text-slate-400 font-semibold bg-slate-100/50 rounded-lg px-1.5 py-0.5">{reportTrips.length}</span>}
        <span className="w-px h-5 bg-slate-200/60" />
        <span className="flex items-center gap-1.5 text-[8px] text-slate-500 bg-slate-100/50 rounded-lg px-1.5 py-0.5 font-medium">
          <span>Trk:{trackingStats.trackedDrivers}</span>
          <span className="text-slate-300">|</span>
          <span>Mov:{formatTelemetryDuration(trackingStats.movingMinutes)}</span>
          <span className="text-slate-300">|</span>
          <span>Stp:{formatTelemetryDuration(trackingStats.stoppedMinutes)}</span>
          <span className="text-slate-300">|</span>
          <span>Mi:{trackingStats.trackedMiles.toFixed(1)}</span>
          <span className="text-slate-300">|</span>
          <span>Ev:{trackingStats.stopCount}</span>
          <span className="text-slate-300">|</span>
          <span>Lng:{formatTelemetryDuration(trackingStats.longestStopMinutes)}</span>
        </span>
      </div>

      {/* AI Report Insights */}
      {aiReport && (
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-indigo-100 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrainCircuit size={14} className="text-indigo-600" />
              <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider">AI Report Insights</span>
            </div>
            <button onClick={() => setAiReport(null)} className="text-slate-400 hover:text-slate-600"><X size={12} /></button>
          </div>
          <p className="text-xs text-slate-700 leading-relaxed">{aiReport.summary}</p>
          {aiReport.trends?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Trends</p>
              <div className="flex flex-wrap gap-1.5">
                {aiReport.trends.map((t, i) => (
                  <span key={i} className="px-2 py-0.5 bg-white rounded-full border border-slate-200 text-[10px] font-semibold text-slate-700">{t}</span>
                ))}
              </div>
            </div>
          )}
          {aiReport.anomalies?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-1 flex items-center gap-1"><AlertTriangle size={10} /> Anomalies</p>
              <div className="space-y-0.5">
                {aiReport.anomalies.map((a, i) => (
                  <p key={i} className="text-xs text-rose-700">{a}</p>
                ))}
              </div>
            </div>
          )}
          {aiReport.recommendations?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1"><Lightbulb size={10} /> Recommendations</p>
              <div className="space-y-0.5">
                {aiReport.recommendations.map((r, i) => (
                  <p key={i} className="text-xs text-emerald-800">{r}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Table Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {paginatedGroupedTrips.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <FileText size={40} className="mb-3 opacity-40" />
            <p className="text-sm font-medium">No report data for selected filters</p>
            <button onClick={resetFilters} className="mt-2 text-xs text-blue-600 hover:underline">Reset filters</button>
          </div>
        ) : (
          paginatedGroupedTrips.map(([dateLabel, dayTrips]) => {
            const passengerData = groupedByPassenger[dateLabel] || [];
            const isCollapsed = collapsedDays[dateLabel];
            const dayTrackingDocs = trackingDocs.filter((doc) => doc.date === dateLabel);
            const dayTrackingSummary = dayTrackingDocs.reduce((acc, doc) => {
              acc.trackedDrivers += 1;
              acc.movingMinutes += Number(doc.totalMovingMinutes || 0);
              acc.stoppedMinutes += Number(doc.totalStoppedMinutes || 0);
              acc.trackedMiles += Number(doc.totalTrackedMiles || 0);
              acc.stopCount += Number(doc.stopCount || 0);
              return acc;
            }, { trackedDrivers: 0, movingMinutes: 0, stoppedMinutes: 0, trackedMiles: 0, stopCount: 0 });
            return (
              <div key={dateLabel} className="border-b border-slate-200 last:border-b-0">
                {/* Date Group Header */}
                <div
                  className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2 cursor-pointer hover:bg-slate-200 transition-colors w-max min-w-full"
                  style={{ minWidth: reportTableMinWidth }}
                  onClick={() => toggleDay(dateLabel)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Calendar size={13} className="text-slate-500" />
                      <span className="text-sm font-bold text-slate-700">{formatDateLabel(dateLabel)}</span>
                    </div>
                    <span className="text-xs text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                      {dayTrips.length} trips
                    </span>
                    <span className="text-xs text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                      {dayTrips.filter(t => t.reviewed).length}/{dayTrips.length} reviewed
                    </span>
                    {dayTrackingSummary.trackedDrivers > 0 && (
                      <>
                        <span className="text-xs text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                          {formatTelemetryDuration(dayTrackingSummary.movingMinutes)} moving
                        </span>
                        <span className="text-xs text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                          {formatTelemetryDuration(dayTrackingSummary.stoppedMinutes)} stopped
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => markTripsReviewed(dayTrips, true)}
                        className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-200 transition-colors"
                      >
                        Mark Day Done
                      </button>
                      <button
                        onClick={() => markTripsReviewed(dayTrips, false)}
                        className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-semibold hover:bg-slate-200 transition-colors"
                      >
                        Reset Review
                      </button>
                    </div>
                    <ChevronDown size={16} className={`text-slate-500 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                  </div>
                </div>

                {!isCollapsed && (
                  <>
                    {/* Table */}
                    <div className="w-full overflow-x-auto">
                  <table className="resizable-table text-xs w-full">
                    <colgroup>
                      <col style={{ width: 48 }} />
                      {visibleColumns.map(col => {
                        const pct = Math.max(4, Math.round(((colWidths[col.key] || 100) / reportTableMinWidth) * 100));
                        return <col key={col.key} style={{ width: pct + '%' }} />;
                      })}
                    </colgroup>
                    <thead className="sticky top-[40px] z-10 bg-slate-800 text-slate-100 border-b border-slate-200">
                      <tr>
                        <th className="p-2 text-center align-middle resizable-th" style={{ width: 48 }}>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const dayTripIds = dayTrips.map(t => t.id);
                                const allSelected = dayTripIds.every(id => selectedTasks.includes(id));
                                if (allSelected) {
                                  setSelectedTasks(selectedTasks.filter(id => !dayTripIds.includes(id)));
                                } else {
                                  const newSelection = [...new Set([...selectedTasks, ...dayTripIds])];
                                  setSelectedTasks(newSelection);
                                }
                              }}
                              className={`p-0.5 rounded transition-all duration-150 ${dayTrips.length > 0 && dayTrips.every(t => selectedTasks.includes(t.id)) ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'}`}
                              title="Select all trips for this day"
                              aria-label="Select all trips for this day"
                            >
                              {dayTrips.length > 0 && dayTrips.every(t => selectedTasks.includes(t.id)) ? <CheckSquare size={14} /> : <Square size={14} />}
                            </button>
                            {canEdit && <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Edit</span>}
                          </div>
                        </th>
                        {visibleColumns.map(col => (
                          <th
                            key={col.key}
                            className="resizable-th p-0 text-left select-none"
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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dayTrips.map((trip, tIdx) => {
                        const bgClass = tIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50';
                        return (
                          <tr
                            key={trip.id}
                            className={`${activeRow === trip.id ? 'bg-blue-100' : bgClass} hover:bg-blue-50/70 transition-colors cursor-pointer`}
                            onClick={(e) => {
                              const interactiveTags = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'SVG', 'PATH'];
                              if (interactiveTags.includes(e.target.tagName)) return;
                              setActiveRow(trip.id);
                            }}
                          >
                            <td className="p-2 align-middle">
                              <div className="flex items-center gap-1 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const isSelected = selectedTasks.includes(trip.id);
                                    if (isSelected) {
                                      setSelectedTasks(selectedTasks.filter(id => id !== trip.id));
                                    } else {
                                      setSelectedTasks([...selectedTasks, trip.id]);
                                    }
                                  }}
                                  className={`p-0.5 rounded transition-all duration-150 ${selectedTasks.includes(trip.id) ? 'text-blue-600' : 'text-slate-300 hover:text-slate-500'}`}
                                  title={selectedTasks.includes(trip.id) ? 'Deselect trip' : 'Select trip'}
                                  aria-label={selectedTasks.includes(trip.id) ? 'Deselect trip' : 'Select trip'}
                                >
                                  {selectedTasks.includes(trip.id) ? <CheckSquare size={14} /> : <Square size={14} />}
                                </button>
                                {canEdit && (
                                  editingRow === trip.id ? (
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); finishRowEdit(); }}
                                        className="p-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-all duration-150"
                                        title="Keep changes"
                                        aria-label="Keep changes"
                                      >
                                        <Check size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); revertRowEdit(); }}
                                        className="p-0.5 rounded bg-rose-100 text-rose-700 hover:bg-rose-200 transition-all duration-150"
                                        title="Cancel and restore original row"
                                        aria-label="Cancel and restore original row"
                                      >
                                        <X size={13} />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); startRowEdit(trip); }}
                                      className="p-0.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all duration-150"
                                      title="Edit row"
                                      aria-label="Edit row"
                                    >
                                      <SquarePen size={13} />
                                    </button>
                                  )
                                )}
                              </div>
                            </td>
                            {visibleColumns.map(col => {
                              const cellKey = col.key;
                              const displayValue = renderCellValue(trip, col);
                              const isEditing = isEditingCell(trip.id, cellKey);
                              return (
                                <td key={cellKey} className={`p-2 whitespace-nowrap ${cellKey === 'pickup' ? 'max-w-[200px] truncate text-emerald-600' : ''} ${cellKey === 'dropoff' ? 'max-w-[200px] truncate text-rose-600' : ''} ${cellKey === 'signature' && displayValue === 'Yes' ? 'text-emerald-600 font-bold' : ''} ${cellKey === 'distance' && displayValue !== '—' ? 'text-blue-600 font-bold bg-blue-50/30' : ''} ${cellKey === 'arrivalTime' ? 'text-emerald-600 font-semibold bg-emerald-50/30' : ''} ${cellKey === 'departedPickupTime' ? 'text-amber-600 font-semibold bg-amber-50/30' : ''} ${cellKey === 'arrivalDropoffTime' ? 'text-rose-600 font-semibold bg-rose-50/30' : ''} ${cellKey === 'date' || cellKey === 'patient' ? 'font-semibold text-slate-900' : ''} ${cellKey === 'driver' ? 'font-semibold text-slate-700' : ''} ${cellKey === 'time' || cellKey === 'arrivalTime' || cellKey === 'departedPickupTime' || cellKey === 'arrivalDropoffTime' ? 'font-mono' : ''} ${cellKey === 'bookingId' ? 'font-mono text-blue-600' : ''} ${cellKey === 'pickupOdometer' ? 'font-mono text-emerald-600' : ''} ${cellKey === 'dropoffOdometer' ? 'font-mono text-rose-600' : ''} ${cellKey === 'travelTime' ? 'text-slate-600 font-medium' : ''} ${cellKey === 'vehicle' ? 'text-slate-400 text-[10px] font-mono tracking-wider uppercase' : ''}`}
                                  title={cellKey === 'pickup' || cellKey === 'dropoff' ? displayValue : undefined}
                                >
                                  {isEditing ? (
                                    renderCellEditor(trip, col)
                                  ) : canEdit && editingRow === trip.id && cellKey !== 'signature' ? (
                                    <span
                                      className="cursor-pointer hover:bg-blue-50 rounded px-1 -mx-1 block leading-5"
                                      onClick={() => startCellEdit(trip.id, cellKey, (trip[FIELD_FOR_COL[cellKey]] ?? ''))}
                                    >
                                      {displayValue}
                                    </span>
                                  ) : cellKey === 'reviewed' && canEdit ? (
                                    <span
                                      className="cursor-pointer hover:bg-blue-50 rounded px-1 -mx-1 block leading-5 font-bold"
                                      onClick={() => saveCell(trip, 'reviewed', !trip.reviewed)}
                                      title={trip.reviewed ? 'Mark as pending' : 'Mark as done'}
                                    >
                                      {displayValue}
                                    </span>
                                  ) : cellKey === 'signature' && canEdit && editingRow === trip.id ? (
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
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Daily Summary per Driver */}
                {(() => {
                  const byDriver = {};
                  dayTrips.forEach(trip => {
                    const driverName = getDriverLabel(trip, drivers);
                    if (!byDriver[driverName]) byDriver[driverName] = { trips: 0, totalDistance: 0, passengers: new Set() };
                    byDriver[driverName].trips++;
                    const d = calcMiles(trip.pickupOdometer, trip.dropoffOdometer, trip.distance);
                    if (d !== '—') byDriver[driverName].totalDistance += parseFloat(d);
                    if (trip.patient) byDriver[driverName].passengers.add(trip.patient);
                  });
                  return Object.entries(byDriver).map(([driverName, info]) => (
                    <div key={driverName} className="px-4 py-2 bg-slate-50/80 border-t border-slate-200 flex items-center gap-4 text-xs">
                      <span className="font-bold text-slate-700 min-w-[100px]">{driverName}</span>
                      <span className="text-slate-500">{info.trips} trips</span>
                      <span className="text-slate-500">{info.totalDistance.toFixed(1)} mi</span>
                      <span className="text-slate-400 truncate">{[...info.passengers].join(', ')}</span>
                    </div>
                  ));
                })()}
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

export default ReportsPage;
