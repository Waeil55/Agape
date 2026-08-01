import React, { useState, useEffect } from 'react';
import { Edit2, X, Lock, Clock, Ruler, PenSquare, CheckCircle, CheckSquare } from 'lucide-react';
import PlacesAutocompleteInput from './PlacesAutocompleteInput';

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

const EditTripModal = ({ trip, onClose, onUpdate, drivers = [], onSave, driverMode, context = 'trip', inline = true }) => {
  const [editTrip, setEditTrip] = useState(null);

  useEffect(() => {
    if (trip) {
      setEditTrip({
        ...trip,
        _pickupTime: isoToTimeInput(trip.arrivalTime || trip.startTime || trip.pickupArrival),
        _pickupDeparture: isoToTimeInput(trip.departedPickupTime || trip.pickupDeparture || trip.arrivalTime),
        _pickupOdometer: trip.pickupOdometer || '',
        _dropoffTime: isoToTimeInput(trip.arrivalDropoffTime || trip.dropoffArrival || trip.dropoffTime),
        _dropoffDeparture: isoToTimeInput(trip.dropoffDeparture || trip.departedDropoffTime || trip.arrivalDropoffTime || trip.completedAt),
        _dropoffOdometer: trip.dropoffOdometer || '',
        _clientSigned: trip.paperSignatureConfirmed || false,
        _markCompleted: false,
      });
    }
  }, [trip]);

  if (!editTrip) return null;

  const handleField = (field, value) => {
    setEditTrip({ ...editTrip, [field]: value });
  };

  const handleUpdate = (e) => {
    e.preventDefault();
    const serviceDate = editTrip.date || trip?.date;
    const pickupIso = timeToIsoForTripDate(editTrip._pickupTime, serviceDate);
    const pickupDepartureIso = timeToIsoForTripDate(editTrip._pickupDeparture, serviceDate);
    const dropoffIso = timeToIsoForTripDate(editTrip._dropoffTime, serviceDate);
    const dropoffDepartureIso = timeToIsoForTripDate(editTrip._dropoffDeparture, serviceDate);
    const selectedDriver = drivers.find((driver) => driver.id === editTrip.driverId);
    const payload = {
      patient: editTrip.patient || '',
      bookingId: editTrip.bookingId || '',
      date: serviceDate || '',
      time: editTrip.time || '',
      type: editTrip.type || '',
      status: editTrip.status || trip?.status || 'Assigned',
      pickup: editTrip.pickup || '',
      dropoff: editTrip.dropoff || '',
      pickupPhone: editTrip.pickupPhone || '',
      dropoffPhone: editTrip.dropoffPhone || '',
      hospitalPhone: editTrip.hospitalPhone || '',
      distance: editTrip.distance || '',
      arrivalTime: pickupIso || editTrip.arrivalTime || null,
      startTime: pickupIso || editTrip.startTime || null,
      pickupOdometer: parseOdometerInput(editTrip._pickupOdometer),
      departedPickupTime: pickupDepartureIso || pickupIso || editTrip.departedPickupTime || null,
      arrivalDropoffTime: dropoffIso || editTrip.arrivalDropoffTime || null,
      dropoffDeparture: dropoffDepartureIso || dropoffIso || editTrip.dropoffDeparture || null,
      dropoffOdometer: parseOdometerInput(editTrip._dropoffOdometer),
      paperSignatureConfirmed: editTrip._clientSigned,
      driverId: editTrip.driverId || null,
      driverName: selectedDriver?.name || editTrip.driverName || null,
      driverEmail: selectedDriver?.email || editTrip.driverEmail || null,
      completedDriverName: selectedDriver?.name || editTrip.completedDriverName || editTrip.driverName || null,
      completedVehicle: editTrip.completedVehicle || editTrip.vehicle || '',
      notes: editTrip.notes || '',
    };
    if (driverMode && onSave) {
      onSave({ ...editTrip, ...payload });
    } else if (onUpdate) {
      onUpdate({ ...editTrip, ...payload });
      onClose();
    }
  };

  const inputClass = "w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-[0.875em] focus:border-blue-500 focus:bg-white outline-none transition-all";

  return (
    <div className={inline ? 'w-full p-2 sm:p-3' : 'fixed inset-0 z-[120] flex items-center justify-center p-3'}>
      {!inline && <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />}
      <div className={`bg-white w-full rounded-2xl relative border border-blue-200 overflow-hidden flex flex-col ${inline ? 'shadow-sm max-h-none' : 'max-w-lg z-10 max-h-[90vh] shadow-2xl'}`} style={{ fontSize: '97%' }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
          <h3 className="text-[1em] font-semibold text-slate-900 flex items-center gap-2">
            <Edit2 size={18} className="text-blue-500" /> {context === 'welltrans' ? 'Correct WellTrans Source Data' : 'Edit Trip'}
          </h3>
          <button onClick={onClose} className="p-1.5 bg-slate-100 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-200" aria-label="Close"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4 flex-1 overflow-x-hidden">
          <form id="tripEditForm" onSubmit={handleUpdate} className="space-y-3.5">
            <div className="bg-slate-50 rounded-xl px-3.5 py-3 border border-slate-200">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[0.875em] font-semibold text-slate-900 truncate min-w-0">{editTrip.patient || editTrip.patientName}</p>
                {editTrip.bookingId && <span className="text-[0.6875em] font-mono font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded shrink-0">Trip: {editTrip.bookingId}</span>}
              </div>
              <p className="text-[0.6875em] text-slate-500 mt-0.5">{editTrip.time || ''} &middot; {editTrip.date || ''}</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[0.6875em] font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Patient</label>
                <input value={editTrip.patient || ''} onChange={(e) => handleField('patient', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="text-[0.6875em] font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Booking ID</label>
                <input value={editTrip.bookingId || ''} onChange={(e) => handleField('bookingId', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="text-[0.6875em] font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Trip Date</label>
                <input type="date" value={editTrip.date || ''} onChange={(e) => handleField('date', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="text-[0.6875em] font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Scheduled Time</label>
                <input value={editTrip.time || ''} onChange={(e) => handleField('time', e.target.value)} className={inputClass} placeholder="8:30 AM" />
              </div>
              <div>
                <label className="text-[0.6875em] font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Service Type</label>
                <input value={editTrip.type || ''} onChange={(e) => handleField('type', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="text-[0.6875em] font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Status</label>
                <select value={editTrip.status || ''} onChange={(e) => handleField('status', e.target.value)} className={inputClass}>
                  {['Assigned', 'Navigating Pickup', 'At Pickup', 'In Transit', 'At Dropoff', 'Completed', 'No Show', 'Cancelled', 'Rerouted'].map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 bg-blue-50 border border-blue-100 rounded-xl p-3">
              <div>
                <label className="text-[0.6875em] font-semibold text-blue-700 uppercase tracking-widest mb-1 block flex items-center gap-1">
                  <Clock size={11} /> Pickup Time
                </label>
                <input type="time" value={editTrip._pickupTime} onChange={(e) => handleField('_pickupTime', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="text-[0.6875em] font-semibold text-blue-700 uppercase tracking-widest mb-1 block flex items-center gap-1">
                  <Clock size={11} /> Pickup Departure
                </label>
                <input type="time" value={editTrip._pickupDeparture} onChange={(e) => handleField('_pickupDeparture', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="text-[0.6875em] font-semibold text-blue-700 uppercase tracking-widest mb-1 block flex items-center gap-1">
                  <Ruler size={11} /> Pickup Odometer
                </label>
                <input type="number" min="0" step="1" placeholder="42500" value={editTrip._pickupOdometer} onChange={(e) => handleField('_pickupOdometer', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="text-[0.6875em] font-semibold text-blue-700 uppercase tracking-widest mb-1 block flex items-center gap-1">
                  <Clock size={11} /> Dropoff Time
                </label>
                <input type="time" value={editTrip._dropoffTime} onChange={(e) => handleField('_dropoffTime', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="text-[0.6875em] font-semibold text-blue-700 uppercase tracking-widest mb-1 block flex items-center gap-1">
                  <Clock size={11} /> Dropoff Departure
                </label>
                <input type="time" value={editTrip._dropoffDeparture} onChange={(e) => handleField('_dropoffDeparture', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="text-[0.6875em] font-semibold text-blue-700 uppercase tracking-widest mb-1 block flex items-center gap-1">
                  <Ruler size={11} /> Dropoff Odometer
                </label>
                <input type="number" min="0" step="1" placeholder="42750" value={editTrip._dropoffOdometer} onChange={(e) => handleField('_dropoffOdometer', e.target.value)} className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className="text-[0.6875em] font-semibold text-blue-700 uppercase tracking-widest mb-1 block">Pickup Address</label>
                <PlacesAutocompleteInput value={editTrip.pickup || ''} onChange={(v) => handleField('pickup', v)} placeholder="Pickup address" className={inputClass} required />
              </div>
              <div className="col-span-2">
                <label className="text-[0.6875em] font-semibold text-blue-700 uppercase tracking-widest mb-1 block">Dropoff Address</label>
                <PlacesAutocompleteInput value={editTrip.dropoff || ''} onChange={(v) => handleField('dropoff', v)} placeholder="Dropoff address" className={inputClass} required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 rounded-xl border border-slate-200 bg-white p-3">
              <div>
                <label className="text-[0.6875em] font-semibold text-slate-500 uppercase tracking-widest mb-1 block">Driver</label>
                <select value={editTrip.driverId || ''} onChange={(e) => {
                  const selected = drivers.find((driver) => driver.id === e.target.value);
                  setEditTrip(current => ({
                    ...current,
                    driverId: e.target.value,
                    driverName: selected?.name || '',
                    driverEmail: selected?.email || '',
                    completedDriverName: selected?.name || '',
                    completedVehicle: current.completedVehicle || selected?.vehicle || '',
                  }));
                }} className={inputClass}>
                  <option value="">Unassigned</option>
                  {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[0.6875em] font-semibold text-slate-500 uppercase tracking-widest mb-1 block">Vehicle name</label>
                <input value={editTrip.completedVehicle || editTrip.vehicle || ''} onChange={(e) => handleField('completedVehicle', e.target.value)} className={inputClass} placeholder="Example: TOYOTA 002" list="trip-vehicle-options" />
                <datalist id="trip-vehicle-options">
                  {[...new Set(drivers.map((driver) => driver.vehicle).filter(Boolean))].map((vehicle) => <option key={vehicle} value={vehicle} />)}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[0.6875em] font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Pickup Phone</label>
                <input value={editTrip.pickupPhone || ''} onChange={(e) => handleField('pickupPhone', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="text-[0.6875em] font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Dropoff Phone</label>
                <input value={editTrip.dropoffPhone || ''} onChange={(e) => handleField('dropoffPhone', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="text-[0.6875em] font-semibold text-rose-400 uppercase tracking-widest mb-1 block">Hospital Phone</label>
                <input value={editTrip.hospitalPhone || ''} onChange={(e) => handleField('hospitalPhone', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="text-[0.6875em] font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Distance</label>
                <input value={editTrip.distance || ''} onChange={(e) => handleField('distance', e.target.value)} className={inputClass} />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-3">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div onClick={(e) => { e.preventDefault(); handleField('_clientSigned', !editTrip._clientSigned); }} className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${editTrip._clientSigned ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 bg-white'}`}>
                  {editTrip._clientSigned && <CheckCircle size={12} />}
                </div>
                <div>
                  <p className="text-[0.875em] font-semibold text-slate-900">Client Signed</p>
                  <p className="text-[0.6875em] text-slate-500">Paper signature / waiver completed</p>
                </div>
              </label>
            </div>

            {driverMode && (
              <div className="bg-white border border-emerald-200 rounded-xl px-3.5 py-3">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div onClick={(e) => { e.preventDefault(); handleField('_markCompleted', !editTrip._markCompleted); }} className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${editTrip._markCompleted ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 bg-white'}`}>
                    {editTrip._markCompleted && <CheckSquare size={12} />}
                  </div>
                  <div>
                    <p className="text-[0.875em] font-semibold text-emerald-700">Mark as Completed</p>
                    <p className="text-[0.6875em] text-slate-500">Trip moves to history area after save</p>
                  </div>
                </label>
              </div>
            )}

            <div>
              <label className="text-[0.6875em] font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Notes</label>
              <textarea value={editTrip.notes || ''} onChange={(e) => handleField('notes', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-[0.875em] focus:border-blue-500 focus:bg-white outline-none transition-all" rows="2" placeholder="Update notes..." />
            </div>

            {driverMode && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-center gap-2.5">
                <Lock size={14} className="text-amber-600 shrink-0" />
                <p className="text-[0.6875em] font-semibold text-amber-800">Password required to save changes.</p>
              </div>
            )}
          </form>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 shrink-0">
          <button type="submit" form="tripEditForm" className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-bold text-[0.875em] shadow-lg shadow-blue-500/20 active:scale-[0.98] transition">{driverMode ? 'Save & Confirm Password' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
};

export default EditTripModal;
