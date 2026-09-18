import { useDeferredValue, useState, useMemo, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Search, Clock, CheckCircle2, XCircle, AlertTriangle, Edit2, Check, ChevronUp, X, Download, Repeat, Upload, BarChart3, TrendingUp, TrendingDown, Minus, Target, Users, MapPin, DollarSign, Timer, Filter, Bookmark, Share2, FileText, RefreshCw, Pencil, RotateCcw, List, SlidersHorizontal } from 'lucide-react';
import { localCalendarYmd, tripMatchesServiceDate } from '../utils/tripDate';
import { tripMatchesSearch } from '../utils/search';
import { compareTripsByCompletionAscending, getTripCompletionSortValue } from '../utils/tripChronology';
import PlacesAutocompleteInput from './PlacesAutocompleteInput';
import { buildDriverIndex, findDriverInIndex } from '../utils/driverIndex';
import { forEachWithConcurrency } from '../utils/boundedConcurrency';
import { ManifestTripCard, getTripCountdown } from './trips/MobileTripManifest';
import ScheduleEditorModal from './trips/ScheduleEditorModal';

const MOBILE_REPORT_PAGE_SIZE = 40;

const FILTER_PRESETS = Object.freeze([
  { id: 'all', label: 'All', status: 'all', allDates: true, Icon: List },
  { id: 'completed', label: 'Completed', status: 'completed', allDates: true, Icon: CheckCircle2 },
  { id: 'cancelled', label: 'Cancelled', status: 'cancelled', allDates: true, Icon: XCircle },
]);

const EXPORT_FORMATS = Object.freeze([
  { id: 'csv', label: 'CSV', icon: FileText, mimeType: 'text/csv' },
  { id: 'json', label: 'JSON', icon: FileText, mimeType: 'application/json' },
]);

function computeKPIs(trips, filteredTrips) {
  const total = filteredTrips.length;
  const completed = filteredTrips.filter(t => t.status === 'Completed' || t.reviewed).length;
  const cancelled = filteredTrips.filter(t => {
    const s = String(t.status || '').toLowerCase();
    return s.includes('cancel') || s.includes('no show') || s.includes('reroute');
  }).length;
  const pending = total - completed - cancelled;
  const reviewed = filteredTrips.filter(t => t.reviewed).length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const reviewRate = total > 0 ? Math.round((reviewed / total) * 100) : 0;
  const cancellationRate = total > 0 ? Math.round((cancelled / total) * 100) : 0;
  const withOdometer = filteredTrips.filter(t => t.pickupOdometer && t.dropoffOdometer);
  const totalMiles = withOdometer.reduce((sum, t) => {
    const diff = Number(t.dropoffOdometer) - Number(t.pickupOdometer);
    return sum + (diff > 0 ? diff : 0);
  }, 0);
  const avgMiles = withOdometer.length > 0 ? (totalMiles / withOdometer.length).toFixed(1) : '0';
  const uniqueDrivers = new Set(filteredTrips.map(t => t.driverId || t.driverEmail || t.driverName)).size;
  const unassigned = filteredTrips.filter(t => !t.driverId && !t.driverEmail && !t.driverName).length;
  return { total, completed, cancelled, pending, reviewed, completionRate, reviewRate, cancellationRate, totalMiles: totalMiles.toFixed(0), avgMiles, uniqueDrivers, unassigned };
}

function exportTrips(trips, format = 'csv') {
  if (format === 'json') {
    const blob = new Blob([JSON.stringify(trips, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `agape-reports-${localCalendarYmd()}.json`);
    return;
  }
  const headers = ['Date', 'Time', 'Patient', 'Booking ID', 'Status', 'Driver', 'Pickup', 'Dropoff', 'Miles', 'Reviewed'];
  const rows = trips.map(t => {
    const miles = t.pickupOdometer && t.dropoffOdometer ? (Number(t.dropoffOdometer) - Number(t.pickupOdometer)).toFixed(1) : '';
    return [t.date || '', t.time || '', t.patient || '', t.bookingId || t.id || '', t.status || '', t.driverName || '', t.pickup || '', t.dropoff || '', miles, t.reviewed ? 'Yes' : 'No'];
  });
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  downloadBlob(blob, `agape-reports-${localCalendarYmd()}.csv`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function KPICard({ label, value, icon: Icon, color, sub, trend }) {
  return (
    <div className={`flex-1 min-w-[70px] rounded-xl border p-2 text-center space-y-0.5 ${color}`}>
      <Icon size={13} className="mx-auto opacity-60" />
      <div className="text-base font-black tabular-nums">{value}</div>
      <div className="text-[9px] font-bold uppercase tracking-wider opacity-70">{label}</div>
      {trend !== undefined && (
        <div className={`flex items-center justify-center gap-0.5 text-[9px] font-bold ${trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
          {trend > 0 ? <TrendingUp size={9} /> : trend < 0 ? <TrendingDown size={9} /> : <Minus size={9} />}
          {Math.abs(trend)}%
        </div>
      )}
      {sub && <div className="text-[9px] font-semibold opacity-60">{sub}</div>}
    </div>
  );
}

function AnalyticsDashboard({ kpis, onExport, onApplyPreset, activePreset }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <KPICard label="Total" value={kpis.total} icon={BarChart3} color="bg-white border-slate-200 text-slate-700" />
        <KPICard label="Done" value={kpis.completed} icon={CheckCircle2} color="bg-emerald-50 border-emerald-200 text-emerald-700" sub={`${kpis.completionRate}%`} />
        <KPICard label="Cancelled" value={kpis.cancelled} icon={XCircle} color="bg-rose-50 border-rose-200 text-rose-700" sub={`${kpis.cancellationRate}%`} />
        <KPICard label="Pending" value={kpis.pending} icon={Clock} color="bg-amber-50 border-amber-200 text-amber-700" />
      </div>
      <div className="flex gap-1.5">
        <KPICard label="Miles" value={kpis.totalMiles} icon={MapPin} color="bg-blue-50 border-blue-200 text-blue-700" sub={`avg ${kpis.avgMiles}`} />
        <KPICard label="Drivers" value={kpis.uniqueDrivers} icon={Users} color="bg-indigo-50 border-indigo-200 text-indigo-700" />
        <KPICard label="Reviewed" value={`${kpis.reviewRate}%`} icon={Target} color="bg-violet-50 border-violet-200 text-violet-700" />
        <KPICard label="Unassigned" value={kpis.unassigned} icon={AlertTriangle} color={kpis.unassigned > 0 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-500'} />
      </div>
      <div className="flex items-center gap-1 flex-wrap pb-1">
        {FILTER_PRESETS.map(p => {
          const Icon = p.Icon;
          return (
            <button key={p.id} onClick={() => onApplyPreset(p)}
              className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1 ${activePreset === p.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400'}`}>
              <Icon size={10} /> {p.label}
            </button>
          );
        })}
      </div>
      <div className="flex gap-1">
        <button onClick={() => onExport('csv')} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:border-indigo-400 transition-all">
          <Download size={10} /> CSV
        </button>
        <button onClick={() => onExport('json')} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:border-indigo-400 transition-all">
          <Download size={10} /> JSON
        </button>
      </div>
    </div>
  );
}

const DetailRow = ({ label, value, valueColor = "text-slate-900" }) => (
  <div className="grid grid-cols-[112px_1fr] gap-3 py-1.5 items-start">
    <span className="text-xs font-semibold text-slate-500 uppercase tracking-[0.14em] mt-0.5">
      {label}
    </span>
    <span className={`text-sm font-semibold leading-5 ${valueColor}`}>
      {value || '-'}
    </span>
  </div>
);

const isoToTimeInput = (iso) => {
  if (!iso) return '';
  const raw = String(iso).trim();
  const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const meridiem = ampm[3].toUpperCase();
    if (meridiem === 'PM' && h < 12) h += 12;
    if (meridiem === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${ampm[2]}`;
  }
  const hhmm = raw.match(/^(\d{1,2}):(\d{2})/);
  if (hhmm) return `${hhmm[1].padStart(2, '0')}:${hhmm[2]}`;
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return ''; }
};

const timeToIsoForTripDate = (timeStr, tripDate) => {
  if (!timeStr) return '';
  const parts = String(timeStr).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!parts) return '';
  let h = parseInt(parts[1], 10);
  const m = parseInt(parts[2], 10);
  const ampm = parts[3]?.toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  const base = tripDate ? new Date(`${tripDate}T12:00:00`) : new Date();
  const d = Number.isNaN(base.getTime()) ? new Date() : base;
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const parseOdometerInput = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const cleaned = String(value).replace(/,/g, '').trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const getReportTripTone = (trip) => {
  const status = String(trip?.status || '').trim().toLowerCase();
  if (trip?.reviewed || status === 'completed') return 'success';
  if (status.includes('cancel') || status.includes('no show')) return 'danger';
  if (status.includes('reroute')) return 'warning';
  return 'pending';
};

const getReportStatusIcon = (tone) => {
  if (tone === 'success') return CheckCircle2;
  if (tone === 'danger') return XCircle;
  if (tone === 'warning') return AlertTriangle;
  return Clock;
};

const normalizeStatus = (status) => {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'completed') return 'completed';
  if (s.includes('cancel') || s.includes('no show') || s.includes('reroute') || s.includes('transfer')) return 'cancelled';
  return 'other';
};

const MobileReportsPage = ({ trips = [], drivers = [], onUpdateTrip, setShowUploadModal, isLoading = false, readOnly = false }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateStr, setDateStr] = useState(localCalendarYmd());
  const [allDates, setAllDates] = useState(false);
  const [expandedTripId, setExpandedTripId] = useState(null);
  const [scheduleEditTrip, setScheduleEditTrip] = useState(null);
  const [editingTripId, setEditingTripId] = useState(null);
  const [editingTripData, setEditingTripData] = useState(null);
  const [savingTripId, setSavingTripId] = useState(null);
  const [editMessage, setEditMessage] = useState('');
  const [sortKeyOverrides, setSortKeyOverrides] = useState({});
  const [statusFilter, setStatusFilter] = useState('completed');
  const [driverFilter, setDriverFilter] = useState('All Drivers');
  const [renderLimit, setRenderLimit] = useState(MOBILE_REPORT_PAGE_SIZE);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const driverIndex = useMemo(() => buildDriverIndex(drivers), [drivers]);

  const uniqueDrivers = useMemo(() => ['All Drivers', ...new Set(
    trips.filter(t => allDates || tripMatchesServiceDate(t, dateStr)).map(t => {
      const d = findDriverInIndex(driverIndex, t);
      return d ? d.name : (t.driverName || '');
    }).filter(Boolean)
  )], [trips, driverIndex, dateStr, allDates]);

  const filteredTrips = useMemo(() => {
    let filtered = trips.filter(t => allDates || tripMatchesServiceDate(t, dateStr));
    if (deferredSearchQuery) {
      const q = deferredSearchQuery.toLowerCase();
      filtered = filtered.filter(t => {
        const driver = findDriverInIndex(driverIndex, t);
        return tripMatchesSearch(t, q, [driver?.name, driver?.phone]);
      });
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(t => {
        const ns = normalizeStatus(t.status);
        return ns === statusFilter;
      });
    }
    if (driverFilter !== 'All Drivers') {
      filtered = filtered.filter(t => {
        const d = findDriverInIndex(driverIndex, t);
        const name = d ? d.name : (t.driverName || '');
        return name === driverFilter;
      });
    }
    return filtered.sort((a, b) => compareTripsByCompletionAscending(a, b, sortKeyOverrides));
  }, [trips, dateStr, allDates, deferredSearchQuery, statusFilter, driverFilter, driverIndex, sortKeyOverrides]);
  const visibleTrips = useMemo(() => filteredTrips.slice(0, renderLimit), [filteredTrips, renderLimit]);
  const kpis = useMemo(() => computeKPIs(trips, filteredTrips), [trips, filteredTrips]);

  const applyPreset = useCallback((preset) => {
    setActivePreset(preset.id);
    setStatusFilter(preset.status);
    setAllDates(preset.allDates);
    setExpandedTripId(null);
  }, []);

  const handleExport = useCallback((format) => {
    exportTrips(filteredTrips, format);
    setShowExportPanel(false);
  }, [filteredTrips]);

  useEffect(() => setRenderLimit(MOBILE_REPORT_PAGE_SIZE), [dateStr, allDates, deferredSearchQuery, statusFilter, driverFilter]);

  useEffect(() => {
    if (!editingTripId && Object.keys(sortKeyOverrides).length > 0) {
      const timer = setTimeout(() => setSortKeyOverrides({}), 1500);
      return () => clearTimeout(timer);
    }
  }, [editingTripId, sortKeyOverrides]);

  const shiftDate = (days) => {
    setExpandedTripId(null);
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setDateStr(localCalendarYmd(d));
  };

  const getDriverRecord = (driverId) => findDriverInIndex(driverIndex, { driverId });
  const formatClock = (value) => value ? String(value) : '-';
  const calcMiles = (pickupOdo, dropoffOdo, storedDist) => {
    if (storedDist) return Number(storedDist).toFixed(1);
    if (pickupOdo && dropoffOdo) {
      const diff = Number(dropoffOdo) - Number(pickupOdo);
      if (diff > 0) return diff.toFixed(1);
    }
    return '-';
  };

  const startInlineEdit = (trip) => {
    setExpandedTripId(trip.id);
    setEditingTripId(trip.id);
    setEditingTripData({
      patient: trip.patient || '',
      bookingId: trip.bookingId || '',
      date: trip.date || '',
      time: trip.time || '',
      type: trip.type || '',
      status: trip.status || 'Assigned',
      pickup: trip.pickup || '',
      dropoff: trip.dropoff || '',
      pickupPhone: trip.pickupPhone || '',
      dropoffPhone: trip.dropoffPhone || '',
      hospitalPhone: trip.hospitalPhone || '',
      distance: trip.distance || '',
      _pickupTime: isoToTimeInput(trip.arrivalTime || trip.startTime || trip.pickupArrival || trip.departedPickupTime),
      _pickupOdometer: trip.pickupOdometer || '',
      _dropoffTime: isoToTimeInput(trip.arrivalDropoffTime || trip.dropoffArrival || trip.dropoffTime),
      _dropoffOdometer: trip.dropoffOdometer || '',
      notes: trip.notes || '',
    });
    setSortKeyOverrides(() => {
      const next = {};
      next[trip.id] = getTripCompletionSortValue(trip);
      return next;
    });
  };

  const cancelInlineEdit = () => {
    setEditingTripId(null);
    setEditingTripData(null);
    setSortKeyOverrides({});
  };

  const saveInlineEdit = async () => {
    if (!editingTripId || !editingTripData || savingTripId) return;
    const d = editingTripData;
    const serviceDate = d.date;
    const pickupIso = timeToIsoForTripDate(d._pickupTime, serviceDate);
    const dropoffIso = timeToIsoForTripDate(d._dropoffTime, serviceDate);
    const original = trips.find(t => t.id === editingTripId) || {};
    const payload = {
      patient: d.patient || '',
      bookingId: d.bookingId || '',
      date: serviceDate || '',
      time: d.time || '',
      type: d.type || '',
      status: d.status || original.status || 'Assigned',
      pickup: d.pickup || '',
      dropoff: d.dropoff || '',
      pickupPhone: d.pickupPhone || '',
      dropoffPhone: d.dropoffPhone || '',
      hospitalPhone: d.hospitalPhone || '',
      distance: d.distance || '',
      arrivalTime: pickupIso || original.arrivalTime || null,
      startTime: pickupIso || original.startTime || null,
      pickupOdometer: parseOdometerInput(d._pickupOdometer),
      departedPickupTime: pickupIso || original.departedPickupTime || null,
      arrivalDropoffTime: dropoffIso || original.arrivalDropoffTime || null,
      dropoffOdometer: parseOdometerInput(d._dropoffOdometer),
      notes: d.notes || '',
    };
    setSavingTripId(editingTripId);
    setEditMessage('');
    try {
      const saved = await Promise.resolve(onUpdateTrip?.(editingTripId, payload));
      if (saved === false) throw new Error('The trip update was rejected.');
      setEditingTripId(null);
      setEditingTripData(null);
      setSortKeyOverrides(prev => ({
        ...prev,
        [editingTripId]: prev[editingTripId] ?? getTripCompletionSortValue({ ...original, ...payload }),
      }));
      setEditMessage(`Trip ${d.bookingId || editingTripId} saved.`);
    } catch (error) {
      setEditMessage(`Trip was not saved: ${error?.message || 'unknown error'}`);
    } finally {
      setSavingTripId(null);
    }
  };

  const inputCls = "w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-[11px] focus:border-blue-600 outline-none transition-all";

  return (
    <div className="w-full flex-1 flex flex-col overflow-hidden overscroll-contain bg-slate-50 pb-24">
      {/* PAGE HEADER */}
      <div className="shrink-0 px-3 pt-2 pb-1.5 bg-white border-b border-slate-200">
        {editMessage && <div role={editMessage.includes('not saved') ? 'alert' : 'status'} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${editMessage.includes('not saved') ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{editMessage}</div>}
      </div>

      {/* 1-Line Header Bar */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-2 py-1.5 flex items-center gap-1 min-h-11">
        {showSearch ? (
          <div className="flex-1 flex items-center gap-1">
            <div className="relative flex-1 flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 pointer-events-none" />
              <input
                type="text"
                autoFocus
                placeholder="Search patient, ID, phone…"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setExpandedTripId(null); }}
                className="w-full min-h-11 h-11 pl-8 pr-7 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none placeholder:text-slate-400 focus:bg-white focus:border-blue-600"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 p-1 text-slate-400 hover:text-slate-600"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setShowSearch(false); setSearchQuery(''); }}
              className="min-h-11 w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 active:scale-95 shrink-0"
              aria-label="Close search"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <>
            {/* Date Stepper */}
            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={() => shiftDate(-1)} className="min-h-11 w-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center active:scale-95 shadow-xs text-slate-600 shrink-0" aria-label="Previous date">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setAllDates(!allDates)}
                className="flex items-center justify-center px-1.5 min-h-11 max-w-[85px] truncate rounded-xl border border-slate-200 bg-white shadow-xs text-[11px] font-bold text-slate-700 shrink-0"
                title={allDates ? 'Showing all dates' : 'Toggle date'}
              >
                {allDates ? 'All Dates' : new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })}
              </button>
              <button onClick={() => shiftDate(1)} className="min-h-11 w-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center active:scale-95 shadow-xs text-slate-600 shrink-0" aria-label="Next date">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Status Dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setExpandedTripId(null); }}
              aria-label="Filter by status"
              className="min-h-11 h-11 flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-2 text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-blue-600 truncate transition-colors"
            >
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="all">All Status</option>
            </select>

            {/* Driver Dropdown */}
            <select
              value={driverFilter}
              onChange={(e) => { setDriverFilter(e.target.value); setExpandedTripId(null); }}
              aria-label="Filter by driver"
              className="min-h-11 h-11 flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-2 text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-blue-600 truncate transition-colors"
            >
              {uniqueDrivers.map(driver => (
                <option key={driver} value={driver}>{driver}</option>
              ))}
            </select>

            {/* Search Toggle Button */}
            <button
              type="button"
              onClick={() => setShowSearch(true)}
              className="min-h-11 w-11 h-11 rounded-xl border border-slate-200 bg-white flex items-center justify-center active:scale-95 shadow-xs text-slate-600 shrink-0"
              aria-label="Search"
              title="Search reports"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Tools / Options Toggle Button */}
            <button
              type="button"
              onClick={() => setShowExportPanel(!showExportPanel)}
              className={`min-h-11 w-11 h-11 rounded-xl border flex items-center justify-center active:scale-95 shadow-xs transition-colors shrink-0 ${
                showExportPanel ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-200 bg-white text-slate-600'
              }`}
              aria-label="Tools & Export"
              title="Export, upload & analytics"
            >
              <SlidersHorizontal size={16} />
            </button>
          </>
        )}
      </div>

      {/* Collapsible Tools & Analytics Drawer */}
      {showExportPanel && (
        <div className="shrink-0 border-b border-slate-200 bg-slate-50/90 px-3 py-2 space-y-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleExport('csv')}
              className="flex-1 min-h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 active:scale-95 shadow-xs"
              aria-label="Download"
              title="Export CSV"
            >
              <Download className="w-4 h-4 text-slate-500" /> Export CSV
            </button>
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="flex-1 min-h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 active:scale-95 shadow-xs"
              aria-label="Upload"
              title="Upload"
            >
              <Upload className="w-4 h-4 text-slate-500" /> Upload
            </button>
            <button
              type="button"
              onClick={() => setShowAnalytics(!showAnalytics)}
              className={`min-h-10 px-3 rounded-xl border flex items-center gap-1.5 text-xs font-bold active:scale-95 shadow-xs ${
                showAnalytics ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-700'
              }`}
            >
              <BarChart3 size={14} /> Analytics
            </button>
          </div>
          {showAnalytics && (
            <div className="mt-2 space-y-2 animate-in fade-in duration-150">
              <AnalyticsDashboard kpis={kpis} onExport={handleExport} onApplyPreset={applyPreset} activePreset={activePreset} />
            </div>
          )}
        </div>
      )}

      {/* MAIN SCROLLABLE CONTENT */}
      <div className="flex-1 overflow-y-auto overscroll-contain bg-slate-50 relative">

        {/* DAILY SUMMARY BAR */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-white shadow-sm">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">{filteredTrips.length} trips</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-700">{filteredTrips.filter(t => t.reviewed).length}/{filteredTrips.length} reviewed</span>
          </div>
          <button
            disabled={readOnly || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-[11px] font-bold shadow-sm active:scale-95 transition-transform disabled:opacity-50"
            onClick={async () => {
              const pendingTrips = filteredTrips.filter((trip) => !trip.reviewed);
              if (!onUpdateTrip || pendingTrips.length === 0) return;
              await forEachWithConcurrency(pendingTrips, (trip) => onUpdateTrip(trip.id, { reviewed: true }), 4);
            }}
          >
            <Check className="w-4 h-4" />
            Mark Day Reviewed
          </button>
        </div>

        <div className="space-y-3 px-3 py-3">
          {isLoading && (
            <div role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm font-semibold text-slate-600">Loading reports…</div>
          )}
          {visibleTrips.map(trip => {
            const driver = getDriverRecord(trip.driverId);
            const isEditing = editingTripId === trip.id;
            const isExpanded = expandedTripId === trip.id || isEditing;
            const ie = isEditing ? editingTripData : null;
            const tone = getReportTripTone(trip);
            const StatusIcon = getReportStatusIcon(tone);
            const displayStatus = isEditing ? ie.status : (trip.status || (trip.reviewed ? 'Reviewed' : 'Pending'));

            return (
              <div key={trip.id} className="mb-1.5 rounded-xl [&_button]:!min-h-0 max-md:[&_button]:!min-h-0">
                <div onClick={() => setExpandedTripId(current => current === trip.id ? null : trip.id)} className="cursor-pointer" aria-expanded={isExpanded}>
                  <ManifestTripCard
                    trip={trip}
                    showAddresses={false}
                    countdown={getTripCountdown(trip)}
                    driverName={driver ? driver.name : (trip.driverName || 'Unassigned')}
                    onTimeEdit={(t) => setScheduleEditTrip(t)}
                    onMore={() => setExpandedTripId(current => current === trip.id ? null : trip.id)}
                    moreLabel={isExpanded ? 'Hide details' : 'View details'}
                  />
                  {!isEditing && !readOnly && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); startInlineEdit(trip); }}
                      className="sr-only"
                      aria-label={`Edit ${trip.patient || 'trip'}`}
                    >
                      Edit
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="mt-1 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                    {isEditing ? (
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5 block">Patient</label>
                            <input value={ie.patient} onChange={(e) => setEditingTripData(p => ({ ...p, patient: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5 block">Booking ID</label>
                            <input value={ie.bookingId} onChange={(e) => setEditingTripData(p => ({ ...p, bookingId: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5 block">Date</label>
                            <input type="date" value={ie.date} onChange={(e) => setEditingTripData(p => ({ ...p, date: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5 block">Time</label>
                            <input value={ie.time} onChange={(e) => setEditingTripData(p => ({ ...p, time: e.target.value }))} className={inputCls} placeholder="8:30 AM" />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5 block">Service Type</label>
                            <input value={ie.type} onChange={(e) => setEditingTripData(p => ({ ...p, type: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5 block">Status</label>
                            <select value={ie.status} onChange={(e) => setEditingTripData(p => ({ ...p, status: e.target.value }))} className={inputCls}>
                              {['Assigned', 'Navigating Pickup', 'At Pickup', 'In Transit', 'At Dropoff', 'Completed', 'No Show', 'Cancelled', 'Rerouted'].map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 bg-blue-50/70 border border-blue-100 rounded-xl p-2.5">
                          <div>
                            <label className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-0.5 block">Pickup Time</label>
                            <input type="time" value={ie._pickupTime} onChange={(e) => setEditingTripData(p => ({ ...p, _pickupTime: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-0.5 block">Pickup Odo</label>
                            <input type="number" min="0" step="1" placeholder="42500" value={ie._pickupOdometer} onChange={(e) => setEditingTripData(p => ({ ...p, _pickupOdometer: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-0.5 block">Dropoff Time</label>
                            <input type="time" value={ie._dropoffTime} onChange={(e) => setEditingTripData(p => ({ ...p, _dropoffTime: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-0.5 block">Dropoff Odo</label>
                            <input type="number" min="0" step="1" placeholder="42750" value={ie._dropoffOdometer} onChange={(e) => setEditingTripData(p => ({ ...p, _dropoffOdometer: e.target.value }))} className={inputCls} />
                          </div>
                          <div className="col-span-2">
                            <label className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-0.5 block">Pickup Address</label>
                            <PlacesAutocompleteInput value={ie.pickup} onChange={(val) => setEditingTripData(p => ({ ...p, pickup: val }))} className={inputCls} placeholder="Pickup address" />
                          </div>
                          <div className="col-span-2">
                            <label className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-0.5 block">Dropoff Address</label>
                            <PlacesAutocompleteInput value={ie.dropoff} onChange={(val) => setEditingTripData(p => ({ ...p, dropoff: val }))} className={inputCls} placeholder="Dropoff address" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5 block">Pickup Phone</label>
                            <input value={ie.pickupPhone} onChange={(e) => setEditingTripData(p => ({ ...p, pickupPhone: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5 block">Dropoff Phone</label>
                            <input value={ie.dropoffPhone} onChange={(e) => setEditingTripData(p => ({ ...p, dropoffPhone: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-rose-600 uppercase tracking-wider mb-0.5 block">Hospital Phone</label>
                            <input value={ie.hospitalPhone || ''} onChange={(e) => setEditingTripData(p => ({ ...p, hospitalPhone: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5 block">Distance</label>
                            <input value={ie.distance} onChange={(e) => setEditingTripData(p => ({ ...p, distance: e.target.value }))} className={inputCls} />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5 block">Notes</label>
                          <textarea value={ie.notes} onChange={(e) => setEditingTripData(p => ({ ...p, notes: e.target.value }))} className={inputCls} rows="2" placeholder="Update notes..." />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Compact Route Block (Addresses shown here when card is opened) */}
                        <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 space-y-2">
                          <div className="flex items-start gap-2.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[14px] font-semibold text-slate-900 leading-snug">{trip.pickup || '—'}</p>
                              <div className="flex items-center gap-3 mt-0.5 text-xs font-medium text-emerald-700">
                                <span>Arrived: {formatClock(trip.arrivalTime)}</span>
                                {trip.pickupOdometer && <span>Odo: {trip.pickupOdometer}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="border-t border-slate-200/70" />
                          <div className="flex items-start gap-2.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 mt-1 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[14px] font-semibold text-slate-900 leading-snug">{trip.dropoff || '—'}</p>
                              <div className="flex items-center gap-3 mt-0.5 text-xs font-medium text-rose-700">
                                <span>Arrived: {formatClock(trip.arrivalDropoffTime)}</span>
                                {trip.dropoffOdometer && <span>Odo: {trip.dropoffOdometer}</span>}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Compact Metrics Grid (2x2) */}
                        <div className="grid grid-cols-2 gap-1.5 text-xs">
                          <div className="bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-200/70 flex items-center justify-between">
                            <span className="font-semibold text-slate-500 uppercase tracking-wider text-[11px]">Miles</span>
                            <span className="font-bold text-slate-800">{calcMiles(trip.pickupOdometer, trip.dropoffOdometer, trip.distance)} mi {trip.travelTime ? `(${trip.travelTime}m)` : ''}</span>
                          </div>
                          <div className="bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-200/70 flex items-center justify-between">
                            <span className="font-semibold text-slate-500 uppercase tracking-wider text-[11px]">Vehicle</span>
                            <span className="font-bold text-slate-800 truncate max-w-[90px]">{trip.completedVehicle || (driver ? driver.vehicle : '—')}</span>
                          </div>
                          <div className="bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-200/70 flex items-center justify-between">
                            <span className="font-semibold text-slate-500 uppercase tracking-wider text-[11px]">Driver</span>
                            <span className="font-bold text-slate-800 truncate max-w-[90px]">{driver ? driver.name : (trip.driverName || '—')}</span>
                          </div>
                          <div className="bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-200/70 flex items-center justify-between">
                            <span className="font-semibold text-slate-500 uppercase tracking-wider text-[11px]">Signed</span>
                            <span className={`font-bold ${trip.paperSignatureConfirmed ? 'text-emerald-700' : 'text-slate-600'}`}>
                              {trip.paperSignatureConfirmed ? 'Yes' : 'No'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {isEditing ? (
                        <>
                          <button
                            onClick={saveInlineEdit}
                            disabled={savingTripId === trip.id}
                            className="flex items-center justify-center gap-2 bg-blue-600 border border-blue-700 rounded-xl py-2.5 shadow-sm text-white font-bold text-sm disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" />
                            {savingTripId === trip.id ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={cancelInlineEdit}
                            disabled={savingTripId === trip.id}
                            className="flex items-center justify-center gap-2 bg-white border border-slate-200 rounded-xl py-2.5 shadow-sm text-slate-700 font-bold text-sm disabled:opacity-50"
                          >
                            <X className="w-4 h-4" />
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startInlineEdit(trip)}
                            disabled={readOnly}
                            className="flex items-center justify-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 rounded-xl py-2 font-bold text-xs shadow-2xs transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit Trip
                          </button>
                          {(trip.status === 'Cancelled' || trip.status === 'No Show' || trip.status === 'Rerouted' || trip.status === 'Cancelled / Rescheduled' || trip.status === 'Transferred') && (
                            <button
                              onClick={() => onUpdateTrip && onUpdateTrip(trip.id, { status: 'Assigned', workflowUpdatedAt: new Date().toISOString() })}
                              disabled={readOnly}
                              className="flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-600 border border-amber-600 text-white rounded-xl py-2 font-bold text-xs shadow-2xs transition-colors"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Restore Trip
                            </button>
                          )}
                          <button
                            onClick={() => onUpdateTrip && onUpdateTrip(trip.id, { reviewed: !trip.reviewed })}
                            disabled={readOnly}
                            className={`${(trip.status === 'Cancelled' || trip.status === 'No Show' || trip.status === 'Rerouted' || trip.status === 'Cancelled / Rescheduled' || trip.status === 'Transferred') ? 'col-span-2' : ''} flex items-center justify-center gap-1.5 border rounded-xl py-2 shadow-2xs font-bold text-xs transition-colors ${trip.reviewed ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50' : 'bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700'}`}
                          >
                            <CheckCircle2 className={`w-3.5 h-3.5 ${trip.reviewed ? 'text-slate-500' : 'text-white'}`} />
                            {trip.reviewed ? 'Un-Review' : 'Review'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {visibleTrips.length < filteredTrips.length && (
            <button
              type="button"
              onClick={() => setRenderLimit((limit) => limit + MOBILE_REPORT_PAGE_SIZE)}
              className="mx-auto mb-6 flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 shadow-sm"
            >
              Load more reports
            </button>
          )}
          {!isLoading && filteredTrips.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-xs font-semibold">
              No trips found for this date/search.
            </div>
          )}
        </div>
      </div>

      {scheduleEditTrip && (
        <ScheduleEditorModal
          trip={scheduleEditTrip}
          onSave={(payload) => {
            onUpdateTrip?.(scheduleEditTrip.id, payload);
            setScheduleEditTrip(null);
          }}
          onClose={() => setScheduleEditTrip(null)}
        />
      )}
    </div>
  );
};

export default MobileReportsPage;
