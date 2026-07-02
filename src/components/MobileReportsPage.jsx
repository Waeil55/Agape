import React, { useState, useMemo } from 'react';
import { 
  ChevronLeft, ChevronRight, Search, Clock, CheckCircle2, 
  XCircle, AlertTriangle, RefreshCw, User, ChevronDown, 
  Edit2, RotateCcw, PhoneCall, Check, ChevronUp, X
} from 'lucide-react';
import { localCalendarYmd } from '../utils/tripDate';

const DetailRow = ({ label, value, valueColor = "text-gray-900" }) => (
  <div className="grid grid-cols-[130px_1fr] gap-4 py-1.5 items-start">
    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mt-0.5">
      {label}
    </span>
    <span className={`text-[13px] font-bold ${valueColor}`}>
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
  const parts = String(timeStr).match(/(\d{1,2}):(\d{2})/);
  if (!parts) return '';
  const base = tripDate ? new Date(`${tripDate}T12:00:00`) : new Date();
  const d = Number.isNaN(base.getTime()) ? new Date() : base;
  d.setHours(parseInt(parts[1], 10), parseInt(parts[2], 10), 0, 0);
  return d.toISOString();
};

const parseOdometerInput = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const cleaned = String(value).replace(/,/g, '').trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const MobileReportsPage = ({ trips = [], drivers = [], onUpdateTrip }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateStr, setDateStr] = useState(localCalendarYmd());
  const [expandedTripId, setExpandedTripId] = useState(null);
  const [editingTripId, setEditingTripId] = useState(null);
  const [editingTripData, setEditingTripData] = useState(null);

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
    return filtered.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }, [trips, dateStr, searchQuery]);

  const shiftDate = (days) => {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setDateStr(d.toISOString().split('T')[0]);
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
      distance: trip.distance || '',
      _pickupTime: isoToTimeInput(trip.arrivalTime || trip.startTime || trip.pickupArrival || trip.departedPickupTime),
      _pickupOdometer: trip.pickupOdometer || '',
      _dropoffTime: isoToTimeInput(trip.arrivalDropoffTime || trip.dropoffArrival || trip.dropoffTime),
      _dropoffOdometer: trip.dropoffOdometer || '',
      notes: trip.notes || '',
    });
    setExpandedTripId(trip.id);
  };

  const cancelInlineEdit = () => {
    setEditingTripId(null);
    setEditingTripData(null);
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
    if (onUpdateTrip) onUpdateTrip(editingTripId, payload);
  };

  const inputCls = "w-full px-2.5 py-2 bg-white border border-gray-200 rounded-lg font-bold text-xs focus:border-[#2b4c7e] outline-none transition-all";

  return (
    <div className="w-full flex-1 flex flex-col bg-white overflow-hidden pb-16">
      
      {/* DATE & FILTERS BAR */}
      <div className="px-4 py-3 flex items-center justify-between bg-white shrink-0 border-b border-gray-100">
        <div className="flex items-center gap-1">
          <button onClick={() => shiftDate(-1)} className="p-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button className="px-3 py-1 text-sm font-bold text-gray-800 border border-gray-200 rounded hover:bg-gray-50">
            {new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            <span className="text-gray-400 font-normal text-xs ml-1">({filteredTrips.length})</span>
          </button>
          <button onClick={() => shiftDate(1)} className="p-1 border border-gray-200 rounded text-gray-300">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="px-4 py-3 bg-white shrink-0 border-b border-gray-100">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Search by patient, booking ID, address..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 pl-9 pr-4 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2b4c7e]/20 focus:border-[#2b4c7e]"
          />
        </div>
      </div>

      {/* MAIN SCROLLABLE CONTENT */}
      <div className="flex-1 overflow-y-auto bg-gray-50 relative">
        {/* DAILY SUMMARY BAR */}
        <div className="bg-white px-4 py-3 mb-3 border-b border-gray-200 flex flex-col gap-3 sticky top-0 z-10 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-gray-600">
            <span className="bg-gray-100 px-2 py-1 rounded-md border border-gray-200 text-gray-800">{filteredTrips.length} trips</span>
            <span className="bg-gray-100 px-2 py-1 rounded-md border border-gray-200 text-gray-800">{filteredTrips.filter(t => t.reviewed).length}/{filteredTrips.length} reviewed</span>
          </div>
          <button 
            className="flex items-center justify-center gap-1.5 w-full bg-[#e8f7f0] text-emerald-700 border border-emerald-200 rounded-lg py-2 text-sm font-bold shadow-sm hover:bg-[#d1f0e1] transition-colors"
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

        <div className="px-4 space-y-4 pb-4">
          {filteredTrips.map(trip => {
            const driver = getDriverRecord(trip.driverId);
            const isExpanded = expandedTripId === trip.id;
            const isEditing = editingTripId === trip.id;
            const ie = isEditing ? editingTripData : null;
            
            return (
              <div key={trip.id} className="rounded-xl shadow-sm overflow-hidden border border-gray-200 bg-white">
                <div 
                  className="bg-[#2b4c7e] px-4 py-3 flex items-center justify-between cursor-pointer transition-colors hover:bg-[#203a60]"
                  onClick={() => { if (isEditing) cancelInlineEdit(); setExpandedTripId(isExpanded ? null : trip.id); }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-gray-400 shrink-0">
                      <User className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-white font-extrabold text-sm uppercase tracking-wide truncate">{isEditing ? ie.patient : (trip.patient || 'UNKNOWN')}</h2>
                      <p className="text-blue-200 text-xs font-semibold truncate">#{isEditing ? ie.bookingId : (trip.bookingId || trip.id)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-extrabold px-2 py-1 rounded uppercase tracking-wider ${trip.status === 'Completed' ? 'bg-[#c2f0d9] text-emerald-800' : 'bg-gray-200 text-gray-700'}`}>
                      {isEditing ? ie.status : (trip.status || 'Scheduled')}
                    </span>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-blue-200" /> : <ChevronDown className="w-5 h-5 text-blue-200" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="bg-[#eaf0f6] p-4">
                    {isEditing ? (
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5 block">Patient</label>
                            <input value={ie.patient} onChange={(e) => setEditingTripData(p => ({ ...p, patient: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5 block">Booking ID</label>
                            <input value={ie.bookingId} onChange={(e) => setEditingTripData(p => ({ ...p, bookingId: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5 block">Date</label>
                            <input type="date" value={ie.date} onChange={(e) => setEditingTripData(p => ({ ...p, date: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5 block">Time</label>
                            <input value={ie.time} onChange={(e) => setEditingTripData(p => ({ ...p, time: e.target.value }))} className={inputCls} placeholder="8:30 AM" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5 block">Service Type</label>
                            <input value={ie.type} onChange={(e) => setEditingTripData(p => ({ ...p, type: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5 block">Status</label>
                            <select value={ie.status} onChange={(e) => setEditingTripData(p => ({ ...p, status: e.target.value }))} className={inputCls}>
                              {['Assigned', 'Navigating Pickup', 'At Pickup', 'In Transit', 'At Dropoff', 'Completed', 'No Show', 'Cancelled', 'Rerouted'].map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 bg-blue-50 border border-blue-100 rounded-xl p-2.5">
                          <div>
                            <label className="text-[10px] font-bold text-blue-700 uppercase tracking-widest mb-0.5 block">Pickup Time</label>
                            <input type="time" value={ie._pickupTime} onChange={(e) => setEditingTripData(p => ({ ...p, _pickupTime: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-blue-700 uppercase tracking-widest mb-0.5 block">Pickup Odo</label>
                            <input type="number" min="0" step="1" placeholder="42500" value={ie._pickupOdometer} onChange={(e) => setEditingTripData(p => ({ ...p, _pickupOdometer: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-blue-700 uppercase tracking-widest mb-0.5 block">Dropoff Time</label>
                            <input type="time" value={ie._dropoffTime} onChange={(e) => setEditingTripData(p => ({ ...p, _dropoffTime: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-blue-700 uppercase tracking-widest mb-0.5 block">Dropoff Odo</label>
                            <input type="number" min="0" step="1" placeholder="42750" value={ie._dropoffOdometer} onChange={(e) => setEditingTripData(p => ({ ...p, _dropoffOdometer: e.target.value }))} className={inputCls} />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] font-bold text-blue-700 uppercase tracking-widest mb-0.5 block">Pickup Address</label>
                            <textarea value={ie.pickup} onChange={(e) => setEditingTripData(p => ({ ...p, pickup: e.target.value }))} className={inputCls} rows="2" />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] font-bold text-blue-700 uppercase tracking-widest mb-0.5 block">Dropoff Address</label>
                            <textarea value={ie.dropoff} onChange={(e) => setEditingTripData(p => ({ ...p, dropoff: e.target.value }))} className={inputCls} rows="2" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5 block">Pickup Phone</label>
                            <input value={ie.pickupPhone} onChange={(e) => setEditingTripData(p => ({ ...p, pickupPhone: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5 block">Dropoff Phone</label>
                            <input value={ie.dropoffPhone} onChange={(e) => setEditingTripData(p => ({ ...p, dropoffPhone: e.target.value }))} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5 block">Distance</label>
                            <input value={ie.distance} onChange={(e) => setEditingTripData(p => ({ ...p, distance: e.target.value }))} className={inputCls} />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5 block">Notes</label>
                          <textarea value={ie.notes} onChange={(e) => setEditingTripData(p => ({ ...p, notes: e.target.value }))} className={inputCls} rows="2" placeholder="Update notes..." />
                        </div>
                      </div>
                    ) : (
                      <>
                        <DetailRow label="TRIP ID" value={trip.bookingId || trip.id} valueColor="text-blue-700" />
                        <DetailRow label="DATE" value={trip.date} />
                        <DetailRow label="DRIVER" value={driver ? driver.name : (trip.driverName || '-')} />
                        <DetailRow label="VEHICLE" value={trip.completedVehicle || (driver ? driver.vehicle : '-')} />
                        <DetailRow label="SCHEDULED" value={formatClock(trip.time)} valueColor="text-[#2b4c7e]" />

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
                            className="flex items-center justify-center gap-2 bg-[#2b4c7e] border border-[#203a60] rounded-xl py-3 shadow-sm text-white font-bold text-sm"
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
            <div className="text-center py-10 text-gray-400 text-sm font-medium">
              No trips found for this date/search.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MobileReportsPage;
