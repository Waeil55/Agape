import { useState, useMemo, useEffect, useCallback } from 'react';
import { Archive, Calendar, Search, X, ChevronDown, ChevronRight, MoreHorizontal, Edit2, RotateCcw, Download, Upload, Shield, AlertTriangle, Clock, CheckCircle2, Tag, Filter, Bookmark, Trash2, Lock, Eye, FileText, BarChart3, Users, MapPin, RefreshCw } from 'lucide-react';
import { tripMatchesSearch } from '../utils/search';
import { tripCalendarDateKey } from '../utils/tripDate';
import TripActionCenter from './trips/TripActionCenter';
import { resolveTripDriver } from '../utils/driverIdentity';
import ScheduleEditorModal from './trips/ScheduleEditorModal';

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

// ============================================================================
// Enterprise: Compliance, Retention, Legal Hold, Audit Trail, Export
// ============================================================================

const RETENTION_POLICIES = Object.freeze([
  { id: 'standard', label: 'Standard (3 years)', days: 1095, color: 'bg-slate-100 text-slate-600' },
  { id: 'extended', label: 'Extended (7 years)', days: 2555, color: 'bg-blue-50 text-blue-700' },
  { id: 'medical', label: 'Medical (10 years)', days: 3650, color: 'bg-indigo-50 text-indigo-700' },
  { id: 'legal', label: 'Legal Hold', days: null, color: 'bg-rose-50 text-rose-700' },
]);

const COMPLIANCE_TAGS = Object.freeze([
  { id: 'hipaa', label: 'HIPAA', color: 'bg-red-50 text-red-700 border-red-200' },
  { id: 'dot', label: 'DOT', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'ada', label: 'ADA', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: 'medicaid', label: 'Medicaid', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'medicare', label: 'Medicare', color: 'bg-amber-50 text-amber-700 border-amber-200' },
]);

function getRetentionStatus(trip) {
  const archivedDate = trip.archivedAt || trip.completedAt;
  if (!archivedDate) return { policy: RETENTION_POLICIES[0], daysLeft: null, expired: false };
  const elapsed = Math.floor((Date.now() - new Date(archivedDate).getTime()) / 86400000);
  const policy = trip.legalHold ? RETENTION_POLICIES[3] : RETENTION_POLICIES[0];
  if (policy.days === null) return { policy, daysLeft: null, expired: false };
  const daysLeft = Math.max(0, policy.days - elapsed);
  return { policy, daysLeft, expired: daysLeft <= 0 };
}

function exportArchiveTrips(trips, format = 'csv') {
  if (format === 'json') {
    const blob = new Blob([JSON.stringify(trips, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `agape-archive-${new Date().toISOString().slice(0, 10)}.json`);
    return;
  }
  const headers = ['Date', 'Time', 'Patient', 'Booking ID', 'Status', 'Driver', 'Pickup', 'Dropoff', 'Miles', 'Vehicle', 'Signature', 'Archived At'];
  const rows = trips.map(t => {
    const miles = t.pickupOdometer && t.dropoffOdometer ? (Number(t.dropoffOdometer) - Number(t.pickupOdometer)).toFixed(1) : '';
    return [t.date || '', t.time || '', t.patient || '', t.bookingId || t.id || '', t.status || '', t.driverName || '', t.pickup || '', t.dropoff || '', miles, t.completedVehicle || '', t.paperSignatureConfirmed ? 'Yes' : 'No', t.archivedAt || ''];
  });
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  downloadBlob(blob, `agape-archive-${new Date().toISOString().slice(0, 10)}.csv`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ArchiveKPIStrip({ trips }) {
  const total = trips.length;
  const withSignature = trips.filter(t => t.paperSignatureConfirmed).length;
  const uniqueDrivers = new Set(trips.map(t => t.driverId || t.driverEmail || t.driverName)).size;
  const uniquePatients = new Set(trips.map(t => t.patient)).size;
  const withMiles = trips.filter(t => t.pickupOdometer && t.dropoffOdometer);
  const totalMiles = withMiles.reduce((sum, t) => sum + Math.max(0, Number(t.dropoffOdometer) - Number(t.pickupOdometer)), 0);
  return (
    <div className="grid grid-cols-4 gap-1.5">
      <div className="bg-white border border-slate-200 rounded-xl p-2 text-center">
        <div className="text-lg font-black text-slate-700">{total}</div>
        <div className="text-[9px] font-bold text-slate-500 uppercase">Total</div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-2 text-center">
        <div className="text-lg font-black text-blue-700">{uniquePatients}</div>
        <div className="text-[9px] font-bold text-slate-500 uppercase">Patients</div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-2 text-center">
        <div className="text-lg font-black text-indigo-700">{uniqueDrivers}</div>
        <div className="text-[9px] font-bold text-slate-500 uppercase">Drivers</div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-2 text-center">
        <div className="text-lg font-black text-emerald-700">{totalMiles.toFixed(0)}</div>
        <div className="text-[9px] font-bold text-slate-500 uppercase">Miles</div>
      </div>
    </div>
  );
}

function ComplianceTagBar({ trip }) {
  const tags = [];
  if (trip.patient && trip.pickup && trip.dropoff) tags.push(COMPLIANCE_TAGS[0]);
  if (trip.completedVehicle) tags.push(COMPLIANCE_TAGS[1]);
  if (trip.inOutTrip) tags.push(COMPLIANCE_TAGS[2]);
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {tags.map(t => (
        <span key={t.id} className={`inline-flex items-center gap-0.5 rounded border px-1 py-0.5 text-[8px] font-bold ${t.color}`}>
          <Tag size={7} /> {t.label}
        </span>
      ))}
    </div>
  );
}

function RetentionBadge({ trip }) {
  const status = getRetentionStatus(trip);
  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${status.policy.color}`}>
        <Shield size={8} /> {status.policy.label}
      </span>
      {status.daysLeft !== null && (
        <span className={`text-[9px] font-bold ${status.expired ? 'text-rose-600' : status.daysLeft < 90 ? 'text-amber-600' : 'text-slate-500'}`}>
          {status.expired ? 'Expired' : `${status.daysLeft}d left`}
        </span>
      )}
      {trip.legalHold && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 border border-rose-200 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">
          <Lock size={8} /> Legal Hold
        </span>
      )}
    </div>
  );
}
const ArchivesPage = ({ trashedTrips = [], restoreTrip, drivers = [], role, onDriveTrip, updateTrashedTrip, onUpdateTrip, setShowUploadModal }) => {
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('agape_archiveSearch') || '');
  const [statusFilter, setStatusFilter] = useState('all');
  const [scheduleEditTrip, setScheduleEditTrip] = useState(null);
  const [sortColumn] = useState(() => localStorage.getItem('agape_archiveSortCol') || 'time');
  const [sortDirection] = useState(() => localStorage.getItem('agape_archiveSortDir') || 'asc');
  const [startDate, setStartDate] = useState(() => localStorage.getItem('agape_archiveStartDate') || '');
  const [endDate, setEndDate] = useState(() => localStorage.getItem('agape_archiveEndDate') || '');
  const [activeRow, setActiveRow] = useState(null);
  const [actionTrip, setActionTrip] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('agape_archiveExpandedGroups') || '{}');
    } catch { return {}; }
  });
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [selectedTrips, setSelectedTrips] = useState(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');
  const [showExportModal, setShowExportModal] = useState(false);
  const [retentionFilter, setRetentionFilter] = useState('all');
  const [legalHoldFilter, setLegalHoldFilter] = useState('all');
  const [savedSearches, setSavedSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('agape_archiveSavedSearches') || '[]'); } catch { return []; }
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
  const [colWidths] = useState(() => {
    try { return { ...DEFAULT_COL_WIDTHS, ...JSON.parse(localStorage.getItem('agape_archiveColWidths') || '{}') }; } catch { return { ...DEFAULT_COL_WIDTHS }; }
  });
  useEffect(() => { localStorage.setItem('agape_archiveColWidths', JSON.stringify(colWidths)); }, [colWidths]);
  // =========================





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

    if (startDate) list = list.filter(t => (tripCalendarDateKey(t.date) || '') >= startDate);
    if (endDate) list = list.filter(t => (tripCalendarDateKey(t.date) || '') <= endDate);

    if (searchQuery) {
      list = list.filter(t => tripMatchesSearch(t, searchQuery, [
        getDriverLabel(t, drivers),
        drivers.find(driver => driver.id === t.driverId)?.phone,
      ]));
    }

    if (statusFilter === 'completed') {
      list = list.filter(t => {
        const s = String(t.status || '').toLowerCase();
        return s === 'completed' || t.reviewed;
      });
    } else if (statusFilter === 'cancelled') {
      list = list.filter(t => {
        const s = String(t.status || '').toLowerCase();
        return s.includes('cancel') || s.includes('no show') || s.includes('reroute') || s.includes('transfer');
      });
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
  }, [trashedTrips, searchQuery, statusFilter, sortColumn, sortDirection, startDate, endDate, drivers]);

  const grouped = useMemo(() => {
    const groups = filtered.reduce((acc, trip) => {
      const key = tripCalendarDateKey(trip.date) || 'No Date';
      if (!acc[key]) acc[key] = [];
      acc[key].push(trip);
      return acc;
    }, {});
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);









  const renderMobileArchiveCard = (trip) => (
    <div key={trip.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{renderCellValue(trip, { key: 'patient' })}</p>
          <p className="mt-0.5 text-xs font-mono font-semibold text-blue-600">{renderCellValue(trip, { key: 'bookingId' })}</p>
        </div>
        <button
          type="button"
          onClick={() => setScheduleEditTrip(trip)}
          className="shrink-0 rounded-md bg-slate-100 hover:bg-blue-100 hover:text-blue-700 px-2 py-0.5 text-xs font-semibold text-slate-700 transition-colors"
          title="Click to edit schedule"
        >
          {renderCellValue(trip, { key: 'time' })}
        </button>
      </div>
      <div className="mt-3 space-y-2 text-xs font-medium text-slate-600">
        <p className="flex items-start gap-2"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" /><span className="break-words text-emerald-700">{renderCellValue(trip, { key: 'pickup' })}</span></p>
        <p className="flex items-start gap-2"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" /><span className="break-words text-rose-700">{renderCellValue(trip, { key: 'dropoff' })}</span></p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="font-semibold uppercase tracking-wide text-slate-500">Driver</p>
          <p className="mt-1 font-semibold text-slate-700">{renderCellValue(trip, { key: 'driver' })}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="font-semibold uppercase tracking-wide text-slate-500">Vehicle</p>
          <p className="mt-1 font-semibold text-slate-700">{renderCellValue(trip, { key: 'vehicle' })}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="font-semibold uppercase tracking-wide text-slate-500">Miles</p>
          <p className="mt-1 font-semibold text-slate-700">{renderCellValue(trip, { key: 'distance' })}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="font-semibold uppercase tracking-wide text-slate-500">Signature</p>
          <p className="mt-1 font-semibold text-slate-700">{renderCellValue(trip, { key: 'signature' })}</p>
        </div>
      </div>
      <ComplianceTagBar trip={trip} />
      <RetentionBadge trip={trip} />
      <div className="mt-3 flex gap-2">
        {(role === 'admin' || role === 'dispatcher') && restoreTrip && (
          <button onClick={() => restoreTrip(trip.id)} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 border border-emerald-200 transition-colors hover:bg-emerald-100">
            <RotateCcw size={13} /> Restore
          </button>
        )}
        <button
          onClick={() => onDriveTrip ? onDriveTrip(trip) : setScheduleEditTrip(trip)}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 border border-blue-200 transition-colors hover:bg-blue-100"
        >
          <Edit2 size={13} /> Edit
        </button>
        <button onClick={() => setActionTrip(trip)} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 border border-slate-200 transition-colors hover:bg-slate-100">
          <MoreHorizontal size={13} /> More
        </button>
      </div>
    </div>
  );

  return (
    <div aria-label="Archived trips" className="flex flex-col flex-1 min-h-0 bg-slate-100 overflow-hidden">
      {/* ENHANCED TOOLBAR */}
      <div role="toolbar" aria-label="Archived trip controls" data-testid="archives-toolbar" className="shrink-0 sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="app-filter-bar !flex-nowrap gap-1.5 px-3 py-1.5">
          <label className="flex h-8 !min-w-[100px] max-w-[260px] flex-1 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2">
            <Search size={11} className="text-slate-500 shrink-0" />
            <input aria-label="Search archived trips" type="text" placeholder="Search archived trips…" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[10px] font-semibold outline-none placeholder:text-slate-500" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-700" aria-label="Clear archive search"><X size={11} /></button>}
          </label>
          <div className="flex h-8 shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2">
            <Calendar size={11} className="text-slate-500" />
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              aria-label="Archive start date" className="h-7 w-[100px] border-0 px-1 text-[10px] font-semibold outline-none focus:border-blue-500 2xl:w-[112px]" />
            <span className="text-[10px] font-semibold text-slate-500">to</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              aria-label="Archive end date" className="h-7 w-[100px] border-0 px-1 text-[10px] font-semibold outline-none focus:border-blue-500 2xl:w-[112px]" />
          </div>

          <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all ${statusFilter === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('completed')}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all ${statusFilter === 'completed' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Completed
            </button>
            <button
              onClick={() => setStatusFilter('cancelled')}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all ${statusFilter === 'cancelled' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Cancelled
            </button>
          </div>

          {setShowUploadModal && (
            <button onClick={() => setShowUploadModal(true)} className="h-8 px-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 text-slate-600 transition-colors" title="Upload">
              <Upload size={13} />
            </button>
          )}
          <button onClick={() => setShowExportModal(true)} className="h-8 px-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 text-slate-600 transition-colors" title="Export">
            <Download size={13} />
          </button>
        </div>

        {/* Enterprise: Analytics + Filters Row */}
        <div className="px-3 pb-1.5 flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setShowAnalytics(!showAnalytics)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${showAnalytics ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-400'}`}>
            <BarChart3 size={10} /> Analytics
          </button>
          <select value={retentionFilter} onChange={(e) => setRetentionFilter(e.target.value)}
            className="h-7 rounded-lg border border-slate-200 bg-white px-1.5 text-[10px] font-bold text-slate-600 outline-none">
            <option value="all">All Retention</option>
            {RETENTION_POLICIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <select value={legalHoldFilter} onChange={(e) => setLegalHoldFilter(e.target.value)}
            className="h-7 rounded-lg border border-slate-200 bg-white px-1.5 text-[10px] font-bold text-slate-600 outline-none">
            <option value="all">All Hold Status</option>
            <option value="hold">Legal Hold Only</option>
            <option value="no-hold">No Hold</option>
          </select>
          {selectedTrips.size > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[10px] font-bold text-indigo-700">{selectedTrips.size} selected</span>
              <button onClick={() => setSelectedTrips(new Set())} className="text-[10px] font-bold text-indigo-600 underline">Clear</button>
            </div>
          )}
        </div>

        {/* Analytics Dashboard */}
        {showAnalytics && (
          <div className="px-3 pb-2 animate-in fade-in duration-150">
            <ArchiveKPIStrip trips={filtered} />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <Archive size={40} className="mb-3 opacity-40" />
              <p className="text-sm font-medium">No archived trips found</p>
              <p className="mt-1 text-xs text-slate-500">Try clearing the search or changing the date range.</p>
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
                <span className="text-sm font-semibold text-slate-700">{formatDateLabel(dateLabel)}</span>
                <span className="text-xs text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">{dayTrips.length} trips</span>
              </div>

              {isExpanded && (
              <>
              <div className="space-y-3 p-3 sm:hidden">
                {dayTrips.map(renderMobileArchiveCard)}
              </div>
              <div className="app-table-frame hidden w-full sm:block">
                <table className="w-full table-fixed text-xs">
                  <colgroup>
                    <col className="w-[5%]" />
                    <col className="w-[6%]" />
                    <col className="w-[5%]" />
                    <col className="w-[6%]" />
                    <col className="w-[8%]" />
                    <col className="w-[12%]" />
                    <col className="w-[12%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                    <col className="w-[11%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 shadow-sm">
                    <tr>
                      <th className="rounded-tl-xl px-3 py-1.5 text-left font-semibold">Date</th>
                      <th className="px-3 py-1.5 text-left font-semibold">Driver</th>
                      <th className="px-3 py-1.5 text-left font-semibold">Time</th>
                      <th className="px-3 py-1.5 text-left font-semibold">Trip ID</th>
                      <th className="px-3 py-1.5 text-left font-semibold">Passenger</th>
                      <th className="px-3 py-1.5 text-left font-semibold">Pickup</th>
                      <th className="px-3 py-1.5 text-left font-semibold">Dropoff</th>
                      <th className="px-3 py-1.5 text-left font-semibold">PU Time</th>
                      <th className="px-3 py-1.5 text-left font-semibold">DO Time</th>
                      <th className="px-3 py-1.5 text-left font-semibold">PU Odo</th>
                      <th className="px-3 py-1.5 text-left font-semibold">DO Odo</th>
                      <th className="px-3 py-1.5 text-left font-semibold">Vehicle</th>
                      <th className="rounded-tr-xl px-3 py-1.5 text-left font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {dayTrips.map((trip) => {
                      const driverName = getDriverLabel(trip, drivers);
                      const keyVal = (key) => {
                        switch (key) {
                          case 'date': return formatDateLabel(trip.date || 'No Date');
                          case 'driver': return driverName;
                          case 'time': return formatClock24(trip.time) !== '—' ? formatClock24(trip.time) : formatClock24(trip.arrivalTime);
                          case 'bookingId': return trip.bookingId || trip.id || '—';
                          case 'patient': return trip.patient || '—';
                          case 'pickup': return trip.pickup || '—';
                          case 'dropoff': return trip.dropoff || '—';
                          case 'arrivalTime': return formatClock24(trip.arrivalTime);
                          case 'arrivalDropoffTime': return formatClock24(trip.arrivalDropoffTime || trip.completedAt);
                          case 'pickupOdometer': return trip.pickupOdometer || '—';
                          case 'dropoffOdometer': return trip.dropoffOdometer || '—';
                          case 'vehicle': return trip.completedVehicle || '—';
                          default: return '—';
                        }
                      };

                      return (
                        <tr key={trip.id} className={`${activeRow === trip.id ? 'bg-blue-100' : ''} hover:bg-blue-50/50 transition-colors`}>
                          <td className="px-3 py-1.5 text-slate-900">{keyVal('date')}</td>
                          <td className="px-3 py-1.5 text-slate-700">{keyVal('driver')}</td>
                          <td className="px-3 py-1.5 font-mono text-slate-900">
                            <button
                              type="button"
                              onClick={() => setScheduleEditTrip(trip)}
                              className="font-mono text-xs hover:text-blue-600 hover:underline text-left cursor-pointer"
                              title="Click to edit schedule"
                            >
                              {keyVal('time')}
                            </button>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-blue-600">{keyVal('bookingId')}</td>
                          <td className="px-3 py-1.5 text-slate-900">{keyVal('patient')}</td>
                          <td className="px-3 py-1.5 font-mono text-emerald-700 truncate" title={trip.pickup}>{keyVal('pickup')}</td>
                          <td className="px-3 py-1.5 font-mono text-rose-700 truncate" title={trip.dropoff}>{keyVal('dropoff')}</td>
                          <td className="px-3 py-1.5 font-mono text-emerald-600">{keyVal('arrivalTime')}</td>
                          <td className="px-3 py-1.5 font-mono text-rose-600">{keyVal('arrivalDropoffTime')}</td>
                          <td className="px-3 py-1.5 font-mono text-emerald-600">{keyVal('pickupOdometer')}</td>
                          <td className="px-3 py-1.5 font-mono text-rose-600">{keyVal('dropoffOdometer')}</td>
                          <td className="px-3 py-1.5 font-mono text-slate-500 text-[11px] uppercase">{keyVal('vehicle')}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {(role === 'admin' || role === 'dispatcher') && restoreTrip && (
                                <button
                                  type="button"
                                  onClick={() => restoreTrip(trip.id)}
                                  className="flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors"
                                  title="Restore Trip"
                                >
                                  <RotateCcw size={12} /> Restore
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setScheduleEditTrip(trip)}
                                className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors"
                                title="Edit Trip"
                              >
                                <Edit2 size={12} /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setActionTrip(trip)}
                                className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-colors"
                                title="More Actions"
                              >
                                <MoreHorizontal size={12} />
                              </button>
                            </div>
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
      <TripActionCenter
        open={Boolean(actionTrip)}
        trip={actionTrip}
        driver={actionTrip ? resolveTripDriver(actionTrip, drivers) : null}
        role={role}
        onClose={() => setActionTrip(null)}
        callbacks={{
          onView: (trip) => setActiveRow(trip.id),
          onRestore: restoreTrip ? (trip) => restoreTrip(trip.id) : undefined,
        }}
      />

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5"><Download size={13} className="text-indigo-600" /> Export Archive</h3>
              <button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-slate-700 p-1"><X size={16} /></button>
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-slate-600">Export {filtered.length} archived trips</p>
              <div className="space-y-1.5">
                {[{ id: 'csv', label: 'CSV Spreadsheet', desc: 'Compatible with Excel, Google Sheets', icon: FileText }, { id: 'json', label: 'JSON Data', desc: 'Full data with metadata', icon: FileText }].map(f => (
                  <button key={f.id} onClick={() => { setExportFormat(f.id); exportArchiveTrips(filtered, f.id); setShowExportModal(false); }}
                    className="w-full text-left rounded-xl border border-slate-200 bg-white p-3 hover:border-indigo-400 hover:bg-indigo-50/30 transition-all flex items-center gap-3">
                    <f.icon size={16} className="text-indigo-600 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-slate-900">{f.label}</p>
                      <p className="text-[10px] font-semibold text-slate-500">{f.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {scheduleEditTrip && (
        <ScheduleEditorModal
          trip={scheduleEditTrip}
          onSave={(payload) => {
            if (updateTrashedTrip) {
              updateTrashedTrip(scheduleEditTrip.id, payload);
            } else if (onUpdateTrip) {
              onUpdateTrip(scheduleEditTrip.id, payload);
            }
            setScheduleEditTrip(null);
          }}
          onClose={() => setScheduleEditTrip(null)}
        />
      )}
    </div>
  );
};

export default ArchivesPage;
