import { useDeferredValue, useState, useMemo, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Search, Clock, CheckCircle2, XCircle, AlertTriangle, Edit2, Check, ChevronUp, X, Download, Repeat, Upload, BarChart3, TrendingUp, TrendingDown, Minus, Target, Users, MapPin, DollarSign, Timer, Filter, Bookmark, Share2, FileText, RefreshCw, Pencil, RotateCcw, List, SlidersHorizontal } from 'lucide-react';
import { localCalendarYmd, tripCalendarDateKey, tripMatchesServiceDate } from '../utils/tripDate';
import { tripMatchesSearch } from '../utils/search';
import { compareTripsByCompletionAscending, getTripCompletionSortValue } from '../utils/tripChronology';
import PlacesAutocompleteInput from './PlacesAutocompleteInput';
import { buildDriverIndex, findDriverInIndex } from '../utils/driverIndex';
import { forEachWithConcurrency } from '../utils/boundedConcurrency';
import ScheduleEditorModal from './trips/ScheduleEditorModal';
import { MobileHistoryCardHeader, MobileHistoryStops } from './trips/MobileHistoryCard';
import { suggestTripPickupOdometer } from '../utils/vehicleOdometer';
import { evaluateTripLegGap } from '../utils/tripTimeSanity';
import MobileHistoryFilters from './trips/MobileHistoryFilters';

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

const normalizeStatus = (status) => {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'completed') return 'completed';
  if (s.includes('cancel') || s.includes('no show') || s.includes('reroute') || s.includes('transfer')) return 'cancelled';
  return 'other';
};

const MobileReportsPage = ({ trips = [], drivers = [], vehicles = [], onUpdateTrip, setShowUploadModal, isLoading = false, readOnly = false }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateStr, setDateStr] = useState(localCalendarYmd());
  const [endDate, setEndDate] = useState(null);
  const [expandedTripId, setExpandedTripId] = useState(null);
  const [scheduleEditTrip, setScheduleEditTrip] = useState(null);
  const [editingTripId, setEditingTripId] = useState(null);
  const [editingTripData, setEditingTripData] = useState(null);
  const [savingTripId, setSavingTripId] = useState(null);
  const [editMessage, setEditMessage] = useState('');
  const [sortKeyOverrides, setSortKeyOverrides] = useState({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [driverFilter, setDriverFilter] = useState('All Drivers');
  const [renderLimit, setRenderLimit] = useState(MOBILE_REPORT_PAGE_SIZE);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const driverIndex = useMemo(() => buildDriverIndex(drivers), [drivers]);

  const uniqueDrivers = useMemo(() => ['All Drivers', ...new Set(
    trips.filter(t => {
      const key = tripCalendarDateKey(t);
      return endDate ? key >= dateStr && key <= endDate : tripMatchesServiceDate(t, dateStr);
    }).map(t => {
      const d = findDriverInIndex(driverIndex, t);
      return d ? d.name : (t.driverName || '');
    }).filter(Boolean)
  )], [trips, driverIndex, dateStr, endDate]);

  const filteredTrips = useMemo(() => {
    let filtered = trips.filter(t => {
      const key = tripCalendarDateKey(t);
      return endDate ? key >= dateStr && key <= endDate : tripMatchesServiceDate(t, dateStr);
    });
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
  }, [trips, dateStr, endDate, deferredSearchQuery, statusFilter, driverFilter, driverIndex, sortKeyOverrides]);
  const visibleTrips = useMemo(() => filteredTrips.slice(0, renderLimit), [filteredTrips, renderLimit]);
  const kpis = useMemo(() => computeKPIs(trips, filteredTrips), [trips, filteredTrips]);

  const applyPreset = useCallback((preset) => {
    setActivePreset(preset.id);
    setStatusFilter(preset.status);
    setEndDate(null);
    setExpandedTripId(null);
  }, []);

  const handleExport = useCallback((format) => {
    exportTrips(filteredTrips, format);
    setShowExportPanel(false);
  }, [filteredTrips]);

  const markPendingReviewed = useCallback(async () => {
    const pendingTrips = filteredTrips.filter((trip) => !trip.reviewed);
    if (!onUpdateTrip || pendingTrips.length === 0) return;
    await forEachWithConcurrency(pendingTrips, (trip) => onUpdateTrip(trip.id, { reviewed: true }), 4);
  }, [filteredTrips, onUpdateTrip]);

  useEffect(() => setRenderLimit(MOBILE_REPORT_PAGE_SIZE), [dateStr, endDate, deferredSearchQuery, statusFilter, driverFilter]);

  useEffect(() => {
    if (!editingTripId && Object.keys(sortKeyOverrides).length > 0) {
      const timer = setTimeout(() => setSortKeyOverrides({}), 1500);
      return () => clearTimeout(timer);
    }
  }, [editingTripId, sortKeyOverrides]);

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
    // Prefill from the vehicle's last known reading instead of leaving the
    // field blank for the admin/dispatcher to type the full number from scratch.
    const suggestedPickupOdometer = trip.pickupOdometer
      ? null
      : suggestTripPickupOdometer({ driverId: trip.driverId, drivers, vehicles, trips });
    // Flag (never rewrite) an already-recorded arrival/departure pair that
    // looks wrong together, so the admin notices before it reaches WellTrans.
    const pickupGapWarning = evaluateTripLegGap(trip.arrivalTime, trip.departedPickupTime);
    const dropoffGapWarning = evaluateTripLegGap(trip.arrivalDropoffTime, trip.completedAt);
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
      _pickupOdometer: trip.pickupOdometer || (suggestedPickupOdometer ? String(suggestedPickupOdometer) : ''),
      _pickupOdometerSuggested: Boolean(suggestedPickupOdometer),
      _pickupGapWarning: pickupGapWarning,
      _dropoffTime: isoToTimeInput(trip.arrivalDropoffTime || trip.dropoffArrival || trip.dropoffTime),
      _dropoffOdometer: trip.dropoffOdometer || '',
      _dropoffGapWarning: dropoffGapWarning,
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

      <div className="flex shrink-0 items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-1.5">
        <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} /><input type="text" placeholder="Search..." value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setExpandedTripId(null); }} className="h-7 w-full rounded-lg border border-slate-200 bg-slate-50 pl-7 pr-2.5 text-xs font-medium text-slate-900 outline-none focus:border-indigo-500 focus:bg-white" /></div>
        <button type="button" onClick={() => setShowExportPanel(!showExportPanel)} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${showExportPanel ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600'}`} aria-label="Tools & Export"><SlidersHorizontal size={13} /></button>
      </div>
      <MobileHistoryFilters
        startDate={dateStr}
        endDate={endDate}
        onDateChange={(start, end) => { setDateStr(start); setEndDate(end); setExpandedTripId(null); }}
        status={statusFilter}
        onStatusChange={(value) => { setStatusFilter(value); setExpandedTripId(null); }}
        driver={driverFilter === 'All Drivers' ? 'all' : driverFilter}
        onDriverChange={(value) => { setDriverFilter(value === 'all' ? 'All Drivers' : value); setExpandedTripId(null); }}
        drivers={uniqueDrivers.filter((name) => name !== 'All Drivers')}
        count={filteredTrips.length}
      />

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
            <button type="button" onClick={markPendingReviewed} disabled={readOnly || isLoading} className="min-h-10 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 disabled:opacity-50">Review day</button>
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

        <div className="space-y-2.5 px-2 py-3">
          {isLoading && (
            <div role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm font-semibold text-slate-600">Loading reports…</div>
          )}
          {visibleTrips.map(trip => {
            const driver = getDriverRecord(trip.driverId);
            const isEditing = editingTripId === trip.id;
            const isExpanded = expandedTripId === trip.id || isEditing;
            const ie = isEditing ? editingTripData : null;
            const displayStatus = isEditing ? ie.status : (trip.status || (trip.reviewed ? 'Reviewed' : 'Pending'));

            return (
              <div key={trip.id} data-expanded-frame={isExpanded || undefined} className={`mb-2 rounded-xl transition-all [&_button]:!min-h-0 max-md:[&_button]:!min-h-0 ${isExpanded ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-50 shadow-md' : ''}`}>
                <div className={`overflow-hidden rounded-xl bg-white transition-all ${isExpanded ? 'border border-indigo-300' : 'border border-slate-200/90 shadow-xs'}`} aria-expanded={isExpanded}>
                  <MobileHistoryCardHeader
                    trip={trip}
                    driverName={driver ? driver.name : (trip.driverName || 'Unassigned')}
                    vehicleName={trip.completedVehicle || driver?.vehicle}
                    miles={calcMiles(trip.pickupOdometer, trip.dropoffOdometer, trip.distance)}
                    time={trip.time || 'Will Call'}
                    status={displayStatus}
                    expanded={isExpanded}
                    detailed
                    onToggle={() => setExpandedTripId(current => current === trip.id ? null : trip.id)}
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
                  <div className="mt-1 rounded-xl border-t border-slate-100 bg-slate-50/80 p-2 shadow-xs">
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
                            <label className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-0.5 block">Pickup Odo{ie._pickupOdometerSuggested ? ' (suggested)' : ''}</label>
                            <input type="number" min="0" step="1" placeholder="42500" value={ie._pickupOdometer} onChange={(e) => setEditingTripData(p => ({ ...p, _pickupOdometer: e.target.value, _pickupOdometerSuggested: false }))} className={`${inputCls} ${ie._pickupOdometerSuggested ? 'border-indigo-300 bg-indigo-50/60' : ''}`} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-0.5 block">Dropoff Time</label>
                            <input type="time" value={ie._dropoffTime} onChange={(e) => setEditingTripData(p => ({ ...p, _dropoffTime: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-0.5 block">Dropoff Odo</label>
                            <input type="number" min="0" step="1" placeholder="42750" value={ie._dropoffOdometer} onChange={(e) => setEditingTripData(p => ({ ...p, _dropoffOdometer: e.target.value }))} className={inputCls} />
                          </div>
                          {(ie._pickupGapWarning || ie._dropoffGapWarning) && (
                            <div className={`col-span-2 rounded-lg border px-2.5 py-2 text-[11px] font-semibold ${
                              ie._pickupGapWarning?.severity === 'invalid' || ie._dropoffGapWarning?.severity === 'invalid'
                                ? 'border-rose-200 bg-rose-50 text-rose-700'
                                : 'border-amber-200 bg-amber-50 text-amber-700'
                            }`}>
                              {ie._pickupGapWarning && <p>Pickup: {ie._pickupGapWarning.message} Retype Pickup Time above to resync it.</p>}
                              {ie._dropoffGapWarning && <p>Dropoff: {ie._dropoffGapWarning.message} Retype Dropoff Time above to resync it.</p>}
                            </div>
                          )}
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
                        <MobileHistoryStops
                          pickupAddress={trip.pickup}
                          dropoffAddress={trip.dropoff}
                          pickupClock={formatClock(trip.arrivalTime)}
                          dropoffClock={formatClock(trip.arrivalDropoffTime)}
                          pickupOdometer={trip.pickupOdometer}
                          dropoffOdometer={trip.dropoffOdometer}
                        />

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
                          <button type="button" onClick={() => setExpandedTripId(trip.id)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 shadow-xs">Details</button>
                          <button onClick={() => startInlineEdit(trip)} disabled={readOnly} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 shadow-xs">Edit</button>
                          {(trip.status === 'Cancelled' || trip.status === 'No Show' || trip.status === 'Rerouted' || trip.status === 'Cancelled / Rescheduled' || trip.status === 'Transferred') && (
                            <button
                              onClick={() => onUpdateTrip && onUpdateTrip(trip.id, { status: 'Assigned', workflowUpdatedAt: new Date().toISOString() })}
                              disabled={readOnly}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 shadow-xs"
                            >
                              Restore
                            </button>
                          )}
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
