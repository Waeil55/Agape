import React, { useState, useMemo, useEffect } from 'react';
import { 
  ChevronLeft, ChevronRight, Search, Clock, CheckCircle2, 
  XCircle, AlertTriangle, Edit2, Check, ChevronUp, X, Upload
} from 'lucide-react';
import { localCalendarYmd } from '../utils/tripDate';
import PlacesAutocompleteInput from './PlacesAutocompleteInput';

const DetailRow = ({ label, value, valueColor = "text-gray-900" }) => (
  <div className="grid grid-cols-[112px_1fr] gap-3 py-1.5 items-start">
    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.14em] mt-0.5">
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

const MobileReportsPage = ({ trips = [], drivers = [], onUpdateTrip, setShowUploadModal }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateStr, setDateStr] = useState(localCalendarYmd());
  const [expandedTripId, setExpandedTripId] = useState(null);
  const [editingTripId, setEditingTripId] = useState(null);
  const [editingTripData, setEditingTripData] = useState(null);
  const [sortKeyOverrides, setSortKeyOverrides] = useState({});

  const filteredTrips = useMemo(() => {
    let filtered = trips.filter(t => t.date === dateStr);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        (t.patient && t.patient.toLowerCase().includes(q)) || 
        (t.bookingId && t.bookingId.toLowerCase().includes(q)) ||
        (t.pickup && t.pickup.toLowerCase().includes(q)) ||
        (t.dropoff && t.dropoff.toLowerCase().includes(q))
      );
    }
    return filtered.sort((a, b) => {
      const aKey = sortKeyOverrides[a.id] ?? (a.time || '');
      const bKey = sortKeyOverrides[b.id] ?? (b.time || '');
      return aKey.localeCompare(bKey);
    });
  }, [trips, dateStr, searchQuery, sortKeyOverrides]);

  useEffect(() => {
    if (!editingTripId && Object.keys(sortKeyOverrides).length > 0) {
      const timer = setTimeout(() => setSortKeyOverrides({}), 1500);
      return () => clearTimeout(timer);
    }
  }, [editingTripId, sortKeyOverrides]);

  const shiftDate = (days) => {
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
    setExpandedTripId(trip.id);
    setSortKeyOverrides(() => {
      const next = {};
      next[trip.id] = trip.time || '';
      return next;
    });
  };

  const cancelInlineEdit = () => {
    setEditingTripId(null);
    setEditingTripData(null);
    setSortKeyOverrides({});
  };

  const saveInlineEdit = () => {
    if (!editingTripId || !editingTripData) return;
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
    setEditingTripId(null);
    setEditingTripData(null);
    setSortKeyOverrides(prev => {
      const next = { ...prev };
      if (editingTripId) next[editingTripId] = d.time || prev[editingTripId] || '';
      return next;
    });
    if (onUpdateTrip) onUpdateTrip(editingTripId, payload);
  };

  const inputCls = "w-full px-2.5 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-[11px] focus:border-[#2563EB] outline-none transition-all";

  return (
    <div className="agape-mobile-page agape-mobile-reports w-full flex-1 flex flex-col overflow-hidden overscroll-contain">
      {/* DATE & FILTERS BAR */}
      <div className="agape-mobile-toolbar shrink-0">
        <div className="flex min-w-0 items-center gap-2">
          <button onClick={() => shiftDate(-1)} className="agape-mobile-icon-btn" aria-label="Previous date">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button className="agape-mobile-date-pill">
            {new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            <span>({filteredTrips.length})</span>
          </button>
          <button onClick={() => shiftDate(1)} className="agape-mobile-icon-btn" aria-label="Next date">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        {setShowUploadModal && (
          <button onClick={() => setShowUploadModal(true)} className="agape-mobile-icon-btn agape-mobile-icon-btn-primary" aria-label="Upload reports">
            <Upload className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* SEARCH BAR */}
      <div className="agape-mobile-search-section shrink-0">
        <div className="agape-mobile-search">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input 
            type="text" 
            placeholder="Search by patient, booking ID, address..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-slate-700 outline-none placeholder:text-slate-400"
          />
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
            const isExpanded = expandedTripId === trip.id;
            const isEditing = editingTripId === trip.id;
            const ie = isEditing ? editingTripData : null;
            const tone = getReportTripTone(trip);
            const StatusIcon = getReportStatusIcon(tone);
            const displayStatus = isEditing ? ie.status : (trip.status || (trip.reviewed ? 'Reviewed' : 'Pending'));
            
            return (
              <div key={trip.id} className={`agape-trip-list-card agape-trip-${tone}`}>
                <div 
                  className="agape-trip-card-summary"
                  onClick={() => { if (isEditing) cancelInlineEdit(); setExpandedTripId(isExpanded ? null : trip.id); }}
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="agape-trip-title">{isEditing ? ie.patient : (trip.patient || 'UNKNOWN')}</h2>
                    <p className="agape-trip-id">#{isEditing ? ie.bookingId : (trip.bookingId || trip.id)}</p>
                  </div>
                  <div className="agape-trip-right">
                    <span className={`agape-trip-time ${tone === 'danger' ? 'text-rose-600' : tone === 'success' ? 'text-emerald-600' : 'text-blue-600'}`}>
                      {formatClock(isEditing ? ie.time : trip.time)}
                    </span>
                    <span className={`agape-trip-status-dot agape-trip-status-${tone}`} title={displayStatus} aria-label={displayStatus}>
                      <StatusIcon className="w-4 h-4" />
                    </span>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="agape-trip-card-details">
                    {isEditing ? (
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-0.5 block">Patient</label>
                            <input value={ie.patient} onChange={(e) => setEditingTripData(p => ({ ...p, patient: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-0.5 block">Booking ID</label>
                            <input value={ie.bookingId} onChange={(e) => setEditingTripData(p => ({ ...p, bookingId: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-0.5 block">Date</label>
                            <input type="date" value={ie.date} onChange={(e) => setEditingTripData(p => ({ ...p, date: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-0.5 block">Time</label>
                            <input value={ie.time} onChange={(e) => setEditingTripData(p => ({ ...p, time: e.target.value }))} className={inputCls} placeholder="8:30 AM" />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-0.5 block">Service Type</label>
                            <input value={ie.type} onChange={(e) => setEditingTripData(p => ({ ...p, type: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-0.5 block">Status</label>
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
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-0.5 block">Pickup Phone</label>
                            <input value={ie.pickupPhone} onChange={(e) => setEditingTripData(p => ({ ...p, pickupPhone: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-0.5 block">Dropoff Phone</label>
                            <input value={ie.dropoffPhone} onChange={(e) => setEditingTripData(p => ({ ...p, dropoffPhone: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-rose-500 uppercase tracking-widest mb-0.5 block">Hospital Phone</label>
                            <input value={ie.hospitalPhone || ''} onChange={(e) => setEditingTripData(p => ({ ...p, hospitalPhone: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-0.5 block">Distance</label>
                            <input value={ie.distance} onChange={(e) => setEditingTripData(p => ({ ...p, distance: e.target.value }))} className={inputCls} />
                          </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-0.5 block">Notes</label>
                          <textarea value={ie.notes} onChange={(e) => setEditingTripData(p => ({ ...p, notes: e.target.value }))} className={inputCls} rows="2" placeholder="Update notes..." />
                        </div>
                      </div>
                    ) : (
                      <>
                        <DetailRow label="TRIP ID" value={trip.bookingId || trip.id} valueColor="text-blue-700" />
                        <DetailRow label="DATE" value={trip.date} />
                        <DetailRow label="DRIVER" value={driver ? driver.name : (trip.driverName || '-')} />
                        <DetailRow label="VEHICLE" value={trip.completedVehicle || (driver ? driver.vehicle : '-')} />
                        <DetailRow label="SCHEDULED" value={formatClock(trip.time)} valueColor="text-[#2563EB]" />

                        <div className="my-2 border-t border-gray-300/50"></div>

                        <DetailRow label="PICKUP ADDRESS" value={trip.pickup} valueColor="text-emerald-600" />
                        <DetailRow label="PICKUP ARRIVAL" value={formatClock(trip.arrivalTime)} valueColor="text-emerald-600" />
                        <DetailRow label="START ODOMETER" value={trip.pickupOdometer || '-'} valueColor="text-emerald-600" />

                        <div className="my-2 border-t border-gray-300/50"></div>

                        <DetailRow label="DROPOFF ADDRESS" value={trip.dropoff} valueColor="text-red-600" />
                        <DetailRow label="DROPOFF ARRIVAL" value={formatClock(trip.arrivalDropoffTime)} valueColor="text-red-600" />
                        <DetailRow label="END ODOMETER" value={trip.dropoffOdometer || '-'} valueColor="text-red-600" />

                        <div className="my-2 border-t border-gray-300/50"></div>

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
                            className="flex items-center justify-center gap-2 bg-[#2563EB] border border-[#1D4ED8] rounded-xl py-3 shadow-sm text-white font-bold text-sm"
                          >
                            <Check className="w-4 h-4" />
                            Save
                          </button>
                          <button
                            onClick={cancelInlineEdit}
                            className="flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-xl py-3 shadow-sm text-gray-700 font-bold text-sm"
                          >
                            <X className="w-4 h-4" />
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startInlineEdit(trip)}
                            className="flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-xl py-3 shadow-sm hover:bg-gray-50 text-gray-700 font-bold text-sm"
                          >
                            <Edit2 className="w-4 h-4 text-gray-500" />
                            Edit
                          </button>
                          <button
                            onClick={() => onUpdateTrip && onUpdateTrip(trip.id, { reviewed: !trip.reviewed })}
                            className={`flex items-center justify-center gap-2 border rounded-xl py-3 shadow-sm font-bold text-sm transition-colors ${trip.reviewed ? 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50' : 'bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700'}`}
                          >
                            <CheckCircle2 className={`w-4 h-4 ${trip.reviewed ? 'text-gray-500' : 'text-white'}`} />
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
            <div className="text-center py-8 text-gray-400 text-xs font-semibold">
              No trips found for this date/search.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MobileReportsPage;
