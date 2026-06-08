import React, { useState, useEffect } from 'react';
import { Edit2, X, Lock, Clock, Ruler, PenSquare, CheckCircle, CheckSquare, ArrowLeft } from 'lucide-react';

const isoToTimeInput = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return ''; }
};

const EditTripModal = ({ trip, onClose, onUpdate, drivers, onSave, driverMode }) => {
  const [editTrip, setEditTrip] = useState(null);

  useEffect(() => {
    if (trip) {
      setEditTrip({
        ...trip,
        _pickupTime: isoToTimeInput(trip.arrivalTime || trip.startTime),
        _pickupOdometer: trip.pickupOdometer || '',
        _departPickupTime: isoToTimeInput(trip.departedPickupTime),
        _dropoffArrivalTime: isoToTimeInput(trip.arrivalDropoffTime),
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
    const timeToIso = (timeStr) => {
      if (!timeStr) return '';
      const parts = timeStr.match(/(\d{1,2}):(\d{2})/);
      if (!parts) return '';
      const d = new Date();
      d.setHours(parseInt(parts[1], 10), parseInt(parts[2], 10), 0, 0);
      return d.toISOString();
    };
    const payload = {
      arrivalTime: timeToIso(editTrip._pickupTime) || editTrip.arrivalTime,
      startTime: timeToIso(editTrip._pickupTime) || editTrip.startTime,
      pickupOdometer: parseInt(editTrip._pickupOdometer, 10) || 0,
      departedPickupTime: timeToIso(editTrip._departPickupTime) || editTrip.departedPickupTime,
      arrivalDropoffTime: timeToIso(editTrip._dropoffArrivalTime) || editTrip.arrivalDropoffTime,
      dropoffOdometer: parseInt(editTrip._dropoffOdometer, 10) || 0,
      paperSignatureConfirmed: editTrip._clientSigned,
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
    <div className="fixed inset-0 z-[120] bg-white flex flex-col animate-slide-up">
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3 shrink-0">
        <button type="button" onClick={onClose} className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center active:scale-90 cursor-pointer shrink-0">
          <ArrowLeft size={20} className="text-slate-700" />
        </button>
        <div className="flex-1 text-center">
          <h2 className="font-bold text-base text-slate-900 flex items-center justify-center gap-2">
            <Edit2 size={16} className="text-blue-500" /> Edit Trip
          </h2>
        </div>
        <div className="w-10 shrink-0" />
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <form id="tripEditForm" onSubmit={handleUpdate} className="space-y-4">
          <div className="bg-slate-50 rounded-2xl px-4 py-3 border border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-900 truncate min-w-0">{editTrip.patient || editTrip.patientName}</p>
              {editTrip.bookingId && <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-lg shrink-0">Trip: {editTrip.bookingId}</span>}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{editTrip.time || ''} &middot; {editTrip.date || ''}</p>
          </div>

          <div>
            <label className="text-micro font-bold uppercase tracking-wider text-slate-500 mb-2 block">Pickup Time</label>
            <input type="time" value={editTrip._pickupTime} onChange={(e) => handleField('_pickupTime', e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none transition-all" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-micro font-bold uppercase tracking-wider text-slate-500 mb-2 block">Pickup Odometer</label>
              <input type="number" min="0" step="1" placeholder="42500" value={editTrip._pickupOdometer} onChange={(e) => handleField('_pickupOdometer', e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none transition-all" />
            </div>
            <div>
              <label className="text-micro font-bold uppercase tracking-wider text-slate-500 mb-2 block">Depart Pickup</label>
              <input type="time" value={editTrip._departPickupTime} onChange={(e) => handleField('_departPickupTime', e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none transition-all" />
            </div>
            <div>
              <label className="text-micro font-bold uppercase tracking-wider text-slate-500 mb-2 block">Dropoff Arrival</label>
              <input type="time" value={editTrip._dropoffArrivalTime} onChange={(e) => handleField('_dropoffArrivalTime', e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none transition-all" />
            </div>
            <div>
              <label className="text-micro font-bold uppercase tracking-wider text-slate-500 mb-2 block">Dropoff Odometer</label>
              <input type="number" min="0" step="1" placeholder="42750" value={editTrip._dropoffOdometer} onChange={(e) => handleField('_dropoffOdometer', e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none transition-all" />
            </div>
          </div>

          <button type="button" onClick={() => handleField('_clientSigned', !editTrip._clientSigned)} className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition cursor-pointer ${editTrip._clientSigned ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition ${editTrip._clientSigned ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
              {editTrip._clientSigned && <CheckCircle size={14} className="text-white" />}
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-slate-900">Client Signed</p>
              <p className="text-xs text-slate-500">Paper signature / waiver completed</p>
            </div>
          </button>

          {driverMode && (
            <button type="button" onClick={() => handleField('_markCompleted', !editTrip._markCompleted)} className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition cursor-pointer ${editTrip._markCompleted ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition ${editTrip._markCompleted ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                {editTrip._markCompleted && <CheckSquare size={14} className="text-white" />}
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-emerald-700">Mark as Completed</p>
                <p className="text-xs text-slate-500">Trip moves to history area after save</p>
              </div>
            </button>
          )}

          <div>
            <label className="text-micro font-bold uppercase tracking-wider text-slate-500 mb-2 block">Notes</label>
            <textarea value={editTrip.notes || ''} onChange={(e) => handleField('notes', e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none transition-all" rows="3" placeholder="Update notes..." />
          </div>

          {driverMode && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
              <Lock size={16} className="text-amber-600 shrink-0" />
              <p className="text-sm font-semibold text-amber-800">Password required to save changes.</p>
            </div>
          )}
        </form>
      </div>
      <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3">
        <button type="submit" form="tripEditForm" className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-500/20 active:scale-[0.98] transition">{driverMode ? 'Save & Confirm Password' : 'Save Changes'}</button>
      </div>
    </div>
  );
};

export default EditTripModal;
