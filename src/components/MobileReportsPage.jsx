import React, { useState, useMemo, useEffect } from 'react';
import { 
  ChevronLeft, ChevronRight, Search, Clock, CheckCircle2, 
  XCircle, AlertTriangle, Edit2, Check, ChevronUp, X, Upload, FileText,
  Download, Repeat
} from 'lucide-react';
import { localCalendarYmd, tripCalendarDateKey } from '../utils/tripDate';
import { tripMatchesSearch } from '../utils/search';
import { compareTripsByCompletionAscending, getTripCompletionSortValue } from '../utils/tripChronology';
import PlacesAutocompleteInput from './PlacesAutocompleteInput';

const DetailRow = ({ label, value, valueColor = "text-slate-900" }) => (
  <div className="grid grid-cols-[112px_1fr] gap-3 py-1.5 items-start">
    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.14em] mt-0.5">
      {label}
    </span>
    <span className={`text-[12px] font-semibold leading-5 ${valueColor}`}>
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
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('no show')) return 'noshow';
  if (s.includes('reroute')) return 'rerouted';
  return 'other';
};

const MobileReportsPage = ({ trips = [], drivers = [], onUpdateTrip, setShowUploadModal }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateStr, setDateStr] = useState(localCalendarYmd());
  const [allDates, setAllDates] = useState(false);
  const [expandedTripId, setExpandedTripId] = useState(null);
  const [editingTripId, setEditingTripId] = useState(null);
  const [editingTripData, setEditingTripData] = useState(null);
  const [savingTripId, setSavingTripId] = useState(null);
  const [editMessage, setEditMessage] = useState('');
  const [sortKeyOverrides, setSortKeyOverrides] = useState({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [driverFilter, setDriverFilter] = useState('All Drivers');

  const uniqueDrivers = useMemo(() => ['All Drivers', ...new Set(
    trips.filter(t => allDates || tripCalendarDateKey(t.date) === dateStr).map(t => {
      const d = drivers.find(d => d.id === t.driverId);
      return d ? d.name : (t.driverName || '');
    }).filter(Boolean)
  )], [trips, drivers, dateStr, allDates]);

  const filteredTrips = useMemo(() => {
    let filtered = trips.filter(t => allDates || tripCalendarDateKey(t.date) === dateStr);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(t => {
        const driver = drivers.find(item => item.id === t.driverId);
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
        const d = drivers.find(d => d.id === t.driverId);
        const name = d ? d.name : (t.driverName || '');
        return name === driverFilter;
      });
    }
    return filtered.sort((a, b) => compareTripsByCompletionAscending(a, b, sortKeyOverrides));
  }, [trips, dateStr, allDates, searchQuery, statusFilter, driverFilter, drivers, sortKeyOverrides]);

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

  const getDriverRecord = (driverId) => drivers.find(d => d.id === driverId);
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
    <div className="agape-mobile-page agape-mobile-reports w-full flex-1 flex flex-col overflow-hidden overscroll-contain">
      {/* PAGE HEADER */}
      <div className="shrink-0 px-3 pt-3 pb-2 bg-white border-b border-slate-200">
        {editMessage && <div className={`rounded-lg px-3 py-2 text-xs font-semibold ${editMessage.includes('not saved') ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{editMessage}</div>}
      </div>

      {/* DATE & FILTERS BAR */}
      <div className="agape-mobile-toolbar shrink-0">
        <div className="flex min-w-0 items-center gap-2">
          <button onClick={() => shiftDate(-1)} className="agape-mobile-icon-btn" aria-label="Previous date">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button className="agape-mobile-date-pill">
            {allDates ? 'All dates' : new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            <span>({filteredTrips.length})</span>
          </button>
          <button onClick={() => shiftDate(1)} className="agape-mobile-icon-btn" aria-label="Next date">
            <ChevronRight className="w-5 h-5" />
          </button>

          <label className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600">
            <input type="checkbox" checked={allDates} onChange={event => { setAllDates(event.target.checked); setExpandedTripId(null); }} /> All dates
          </label>

          {[
            { id: 'all', label: 'All', Icon: Clock },
            { id: 'completed', label: 'Completed', Icon: CheckCircle2 },
            { id: 'cancelled', label: 'Cancelled', Icon: XCircle },
            { id: 'noshow', label: 'No Show', Icon: AlertTriangle },
            { id: 'rerouted', label: 'Rerouted', Icon: Repeat },
          ].map(f => {
            const FilterIcon = f.Icon;
            const active = statusFilter === f.id;
            const activeClass = f.id === 'rerouted'
              ? 'bg-purple-600 text-white border-purple-600'
              : f.id === 'cancelled'
                ? 'bg-rose-600 text-white border-rose-600'
                : f.id === 'noshow'
                  ? 'bg-amber-500 text-white border-amber-500'
                  : f.id === 'completed'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-blue-600 text-white border-blue-600';
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => { setStatusFilter(f.id); setExpandedTripId(null); }}
                className={`agape-mobile-icon-btn relative ${active ? `${activeClass} agape-mobile-icon-active` : ''}`}
                title={f.label}
                aria-label={`${f.label} filter`}
              >
                <FilterIcon size={13} />
              </button>
            );
          })}
        </div>
        {setShowUploadModal && (
          <button onClick={() => setShowUploadModal(true)} className="agape-mobile-icon-btn agape-mobile-icon-btn-primary" aria-label="Upload reports">
            <Download className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* SEARCH BAR & DRIVER FILTER */}
      <div className="agape-mobile-search-section shrink-0">
        <div className="flex gap-2">
          <div className="agape-mobile-search flex-1">
            <Search className="w-5 h-5 text-slate-400 shrink-0" />
            <input 
              type="text" 
              placeholder="Patient, trip, phone..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setExpandedTripId(null); }}
              className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
          <select
            value={driverFilter}
            onChange={(e) => { setDriverFilter(e.target.value); setExpandedTripId(null); }}
            className="bg-white rounded-xl shadow-sm px-3 py-2 outline-none text-slate-600 text-[13px] font-semibold max-w-[130px] border border-slate-200"
          >
            {uniqueDrivers.map(driver => (
              <option key={driver} value={driver}>{driver}</option>
            ))}
          </select>
        </div>
      </div>

      {/* MAIN SCROLLABLE CONTENT */}
      <div className="agape-mobile-scroll flex-1 overflow-y-auto overscroll-contain relative">
        {/* DAILY SUMMARY BAR */}
        <div className="agape-mobile-summary-bar sticky top-0 z-10">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <span className="agape-mobile-chip">{filteredTrips.length} trips</span>
            <span className="agape-mobile-chip agape-mobile-chip-success">{filteredTrips.filter(t => t.reviewed).length}/{filteredTrips.length} reviewed</span>
          </div>
          <button 
            className="agape-mobile-review-btn"
            onClick={() => {
              filteredTrips.forEach(t => {
                if (!t.reviewed && onUpdateTrip) onUpdateTrip(t.id, { reviewed: true });
              });
            }}
          >
            <Check className="w-4 h-4" />
            Mark Day Reviewed
          </button>
        </div>

        <div className="agape-mobile-list">
          {filteredTrips.map(trip => {
            const driver = getDriverRecord(trip.driverId);
            const isEditing = editingTripId === trip.id;
            const isExpanded = expandedTripId === trip.id || isEditing;
            const ie = isEditing ? editingTripData : null;
            const tone = getReportTripTone(trip);
            const StatusIcon = getReportStatusIcon(tone);
            const displayStatus = isEditing ? ie.status : (trip.status || (trip.reviewed ? 'Reviewed' : 'Pending'));
            
            return (
              <div key={trip.id} className={`agape-trip-list-card agape-trip-${tone}`}>
                <div
                  className="agape-trip-card-summary"
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onClick={() => {
                    if (!isEditing) setExpandedTripId(current => current === trip.id ? null : trip.id);
                  }}
                  onKeyDown={(event) => {
                    if (!isEditing && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      setExpandedTripId(current => current === trip.id ? null : trip.id);
                    }
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="agape-trip-title">{isEditing ? ie.patient : (trip.patient || 'UNKNOWN')}</h2>
                    <p className="agape-trip-id">#{isEditing ? ie.bookingId : (trip.bookingId || trip.id)}</p>
                  </div>
                  <div className="agape-trip-right">
                    <div className="flex flex-col items-end">
                      <span className={`text-[15px] font-semibold ${tone === 'danger' ? 'text-rose-600' : tone === 'success' ? 'text-emerald-600' : 'text-blue-600'}`}>
                        {formatClock(isEditing ? ie.time : trip.time)}
                      </span>
                      <span className="text-[12px] text-slate-500 mt-0.5 font-medium">
                        Driver: {driver ? driver.name : (trip.driverName || '-')}
                      </span>
                    </div>
                    <span className={`agape-trip-status-dot agape-trip-status-${tone}`} title={displayStatus} aria-label={displayStatus}>
                      <StatusIcon className="w-4 h-4" />
                    </span>
                    {!isEditing && (
                      <button type="button" onClick={(event) => { event.stopPropagation(); startInlineEdit(trip); }} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500" aria-label={`Edit ${trip.patient || 'trip'}`}>
                        <Edit2 className="h-4 w-4" />
                      </button>
                    )}
                    {!isEditing && (isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />)}
                  </div>
                </div>

                {isExpanded && (
                  <div className="agape-trip-card-details">
                    {isEditing ? (
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5 block">Patient</label>
                            <input value={ie.patient} onChange={(e) => setEditingTripData(p => ({ ...p, patient: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5 block">Booking ID</label>
                            <input value={ie.bookingId} onChange={(e) => setEditingTripData(p => ({ ...p, bookingId: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5 block">Date</label>
                            <input type="date" value={ie.date} onChange={(e) => setEditingTripData(p => ({ ...p, date: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5 block">Time</label>
                            <input value={ie.time} onChange={(e) => setEditingTripData(p => ({ ...p, time: e.target.value }))} className={inputCls} placeholder="8:30 AM" />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5 block">Service Type</label>
                            <input value={ie.type} onChange={(e) => setEditingTripData(p => ({ ...p, type: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5 block">Status</label>
                            <select value={ie.status} onChange={(e) => setEditingTripData(p => ({ ...p, status: e.target.value }))} className={inputCls}>
                              {['Assigned', 'Navigating Pickup', 'At Pickup', 'In Transit', 'At Dropoff', 'Completed', 'No Show', 'Cancelled', 'Rerouted'].map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 bg-blue-50 border border-blue-100 rounded-xl p-2.5">
                          <div>
                            <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-widest mb-0.5 block">Pickup Time</label>
                            <input type="time" value={ie._pickupTime} onChange={(e) => setEditingTripData(p => ({ ...p, _pickupTime: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-widest mb-0.5 block">Pickup Odo</label>
                            <input type="number" min="0" step="1" placeholder="42500" value={ie._pickupOdometer} onChange={(e) => setEditingTripData(p => ({ ...p, _pickupOdometer: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-widest mb-0.5 block">Dropoff Time</label>
                            <input type="time" value={ie._dropoffTime} onChange={(e) => setEditingTripData(p => ({ ...p, _dropoffTime: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-widest mb-0.5 block">Dropoff Odo</label>
                            <input type="number" min="0" step="1" placeholder="42750" value={ie._dropoffOdometer} onChange={(e) => setEditingTripData(p => ({ ...p, _dropoffOdometer: e.target.value }))} className={inputCls} />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-widest mb-0.5 block">Pickup Address</label>
                            <PlacesAutocompleteInput value={ie.pickup} onChange={(val) => setEditingTripData(p => ({ ...p, pickup: val }))} className={inputCls} placeholder="Pickup address" />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-widest mb-0.5 block">Dropoff Address</label>
                            <PlacesAutocompleteInput value={ie.dropoff} onChange={(val) => setEditingTripData(p => ({ ...p, dropoff: val }))} className={inputCls} placeholder="Dropoff address" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5 block">Pickup Phone</label>
                            <input value={ie.pickupPhone} onChange={(e) => setEditingTripData(p => ({ ...p, pickupPhone: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5 block">Dropoff Phone</label>
                            <input value={ie.dropoffPhone} onChange={(e) => setEditingTripData(p => ({ ...p, dropoffPhone: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-rose-500 uppercase tracking-widest mb-0.5 block">Hospital Phone</label>
                            <input value={ie.hospitalPhone || ''} onChange={(e) => setEditingTripData(p => ({ ...p, hospitalPhone: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5 block">Distance</label>
                            <input value={ie.distance} onChange={(e) => setEditingTripData(p => ({ ...p, distance: e.target.value }))} className={inputCls} />
                          </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5 block">Notes</label>
                          <textarea value={ie.notes} onChange={(e) => setEditingTripData(p => ({ ...p, notes: e.target.value }))} className={inputCls} rows="2" placeholder="Update notes..." />
                        </div>
                      </div>
                    ) : (
                      <>
                        <DetailRow label="TRIP ID" value={trip.bookingId || trip.id} valueColor="text-blue-700" />
                        <DetailRow label="DATE" value={trip.date} />
                        <DetailRow label="DRIVER" value={driver ? driver.name : (trip.driverName || '-')} />
                        <DetailRow label="VEHICLE" value={trip.completedVehicle || (driver ? driver.vehicle : '-')} />
                        <DetailRow label="SCHEDULED" value={formatClock(trip.time)} valueColor="text-blue-600" />

                        <div className="my-2 border-t border-slate-300/50"></div>

                        <DetailRow label="PICKUP ADDRESS" value={trip.pickup} valueColor="text-emerald-600" />
                        <DetailRow label="PICKUP ARRIVAL" value={formatClock(trip.arrivalTime)} valueColor="text-emerald-600" />
                        <DetailRow label="START ODOMETER" value={trip.pickupOdometer || '-'} valueColor="text-emerald-600" />

                        <div className="my-2 border-t border-slate-300/50"></div>

                        <DetailRow label="DROPOFF ADDRESS" value={trip.dropoff} valueColor="text-red-600" />
                        <DetailRow label="DROPOFF ARRIVAL" value={formatClock(trip.arrivalDropoffTime)} valueColor="text-red-600" />
                        <DetailRow label="END ODOMETER" value={trip.dropoffOdometer || '-'} valueColor="text-red-600" />

                        <div className="my-2 border-t border-slate-300/50"></div>

                        <DetailRow label="DISTANCE" value={`${calcMiles(trip.pickupOdometer, trip.dropoffOdometer, trip.distance)} mi`} />
                        <DetailRow label="TRAVEL TIME" value={trip.travelTime ? `${trip.travelTime}m` : '-'} />
                        <DetailRow label="SIGNATURE" value={trip.paperSignatureConfirmed ? 'Yes' : 'No'} />
                        <DetailRow label="REVIEW STATUS" value={trip.reviewed ? 'Reviewed' : 'Pending'} valueColor={trip.reviewed ? 'text-emerald-600' : 'text-orange-600'} />
                      </>
                    )}

                    <div className="grid grid-cols-2 gap-3 mt-4">
                      {isEditing ? (
                        <>
                          <button
                            onClick={saveInlineEdit}
                            disabled={savingTripId === trip.id}
                            className="flex items-center justify-center gap-2 bg-blue-600 border border-blue-700 rounded-xl py-3 shadow-sm text-white font-bold text-sm disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" />
                            {savingTripId === trip.id ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={cancelInlineEdit}
                            disabled={savingTripId === trip.id}
                            className="flex items-center justify-center gap-2 bg-white border border-slate-200 rounded-xl py-3 shadow-sm text-slate-700 font-bold text-sm disabled:opacity-50"
                          >
                            <X className="w-4 h-4" />
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => onUpdateTrip && onUpdateTrip(trip.id, { reviewed: !trip.reviewed })}
                            className={`col-span-2 flex items-center justify-center gap-2 border rounded-xl py-3 shadow-sm font-bold text-sm transition-colors ${trip.reviewed ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50' : 'bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700'}`}
                          >
                            <CheckCircle2 className={`w-4 h-4 ${trip.reviewed ? 'text-slate-500' : 'text-white'}`} />
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
          {filteredTrips.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-xs font-semibold">
              No trips found for this date/search.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MobileReportsPage;
