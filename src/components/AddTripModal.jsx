import React, { useState, useCallback } from 'react';
import {
  X, Plus, MapPin, Clock, User, Phone, FileText, Calendar,
  CheckCircle2, AlertCircle, Repeat, Hash, Truck, Navigation
} from 'lucide-react';
import PlacesAutocompleteInput from './PlacesAutocompleteInput';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAY_SHORT = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };

const generateTripId = () => `TRIP-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
const generateBookingId = () => `BK-${Math.floor(100000 + Math.random() * 900000)}`;

const todayStr = () => new Date().toISOString().split('T')[0];
const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();
const normalizeLogin = (value = '') => normalizeEmail(value).replace(/@auth\.agapecare\.local$/i, '');

const AddTripModal = ({ onClose, onAddTrip, role, currentUser, drivers = [], dispatchers = [] }) => {
  const [form, setForm] = useState({
    patient: '',
    bookingId: generateBookingId(),
    date: todayStr(),
    time: '',
    willCall: false,
    pickup: '',
    dropoff: '',
    pickupPhone: '',
    dropoffPhone: '',
    patientPhone: '',
    notes: '',
    driverId: '',
    // Scheduling
    recurring: false,
    oneTimeOnly: false,
    schedule: [], // weekdays for recurring
    tripDate: todayStr(), // for one-time
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Determine which drivers are selectable based on role
  const selectableDrivers = React.useMemo(() => {
    if (role === 'admin') return drivers;
    if (role === 'dispatcher') {
      // Dispatchers manage their assigned drivers — for now, show all drivers
      return drivers;
    }
    if (role === 'driver') {
      // Driver can only see themselves
      const userEmail = normalizeEmail(currentUser);
      const userLogin = normalizeLogin(currentUser);
      return drivers.filter((d) => (
        normalizeEmail(d.email) === userEmail
        || normalizeLogin(d.email) === userLogin
        || normalizeLogin(d.name) === userLogin
        || normalizeLogin(d.id) === userLogin
      ));
    }
    return [];
  }, [role, currentUser, drivers]);

  // Auto-assign self for driver role
  React.useEffect(() => {
    if (role === 'driver') {
      const me = selectableDrivers[0];
      if (me) {
        setForm(prev => ({ ...prev, driverId: me.id }));
      }
    }
  }, [role, selectableDrivers]);

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const toggleWeekday = (day) => {
    setForm(prev => ({
      ...prev,
      schedule: prev.schedule.includes(day)
        ? prev.schedule.filter(d => d !== day)
        : [...prev.schedule, day]
    }));
  };

  const validate = () => {
    const e = {};
    if (!form.patient.trim()) e.patient = 'Patient name is required';
    if (!form.pickup.trim()) e.pickup = 'Pickup address is required';
    if (!form.dropoff.trim()) e.dropoff = 'Dropoff address is required';
    if (!form.willCall && !form.time.trim()) e.time = 'Time is required (or select Will Call)';
    if (form.recurring && form.schedule.length === 0) e.schedule = 'Select at least one day for recurring trips';
    if (role === 'driver' && selectableDrivers.length === 0) e.driverId = 'Your driver profile is still syncing. Try again in a moment.';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSubmitting(true);

    const forcedDriver = role === 'driver' ? selectableDrivers[0] : null;
    const selectedDriver = forcedDriver || selectableDrivers.find(d => d.id === form.driverId);
    const tripDate = form.oneTimeOnly ? form.tripDate : form.date;

    const newTrip = {
      id: generateTripId(),
      bookingId: form.bookingId || generateBookingId(),
      patient: form.patient.trim(),
      date: tripDate,
      time: form.willCall ? 'Will Call' : form.time,
      pickup: form.pickup.trim(),
      dropoff: form.dropoff.trim(),
      pickupPhone: form.pickupPhone.trim(),
      dropoffPhone: form.dropoffPhone.trim(),
      patientPhone: form.patientPhone.trim(),
      notes: form.notes.trim(),
      status: selectedDriver?.id ? 'Assigned' : 'Unassigned',
      driverId: selectedDriver?.id || null,
      driverEmail: selectedDriver?.email || null,
      driverName: selectedDriver?.name || null,
      recurring: form.recurring && !form.oneTimeOnly,
      schedule: form.recurring && !form.oneTimeOnly ? form.schedule : [],
      tripDate: form.oneTimeOnly ? form.tripDate : null,
      createdAt: new Date().toISOString(),
      createdBy: currentUser,
      // Initialize trip metrics
      pickupOdometer: null,
      dropoffOdometer: null,
      arrivalTime: null,
      arrivalDropoffTime: null,
      departedPickupTime: null,
      completedAt: null,
      completedVehicle: null,
      paperSignatureConfirmed: false,
      unableToSign: false,
      travelTime: '',
      distance: null,
      reviewed: false,
    };

    await onAddTrip(newTrip);
    setSubmitting(false);
    onClose();
  };

  const inputClass = (field) => `
    w-full px-3 py-2.5 rounded-xl border text-sm transition-all duration-200 outline-none
    ${errors[field]
      ? 'border-rose-400 bg-rose-50 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
      : 'border-slate-200 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 hover:border-slate-300'
    }
    text-slate-900 placeholder:text-slate-400
  `;

  const labelClass = 'text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5';

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col bg-white sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden z-10 animate-in slide-in-from-bottom sm:zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Plus size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-black text-white">Add New Trip</h2>
              <p className="text-xs text-white/70 font-medium capitalize">{role} • Manual Entry</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all"
          >
            <X size={16} className="text-white" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-5">

            {/* Section: Patient Info */}
            <div className="bg-slate-50 rounded-2xl p-4 space-y-4">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <User size={12} className="text-blue-600" /> Patient Information
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelClass}><User size={11} /> Patient Name *</label>
                  <input
                    type="text"
                    value={form.patient}
                    onChange={e => update('patient', e.target.value)}
                    placeholder="Full name"
                    className={inputClass('patient')}
                    autoFocus
                  />
                  {errors.patient && <p className="text-xs text-rose-600 mt-1 font-medium">{errors.patient}</p>}
                </div>

                <div>
                  <label className={labelClass}><Hash size={11} /> Booking ID</label>
                  <input
                    type="text"
                    value={form.bookingId}
                    onChange={e => update('bookingId', e.target.value)}
                    placeholder="BK-000000"
                    className={inputClass('bookingId')}
                  />
                </div>

                <div>
                  <label className={labelClass}><Phone size={11} /> Patient Phone</label>
                  <input
                    type="tel"
                    value={form.patientPhone}
                    onChange={e => update('patientPhone', e.target.value)}
                    placeholder="(555) 000-0000"
                    className={inputClass('patientPhone')}
                  />
                </div>
              </div>
            </div>

            {/* Section: Schedule */}
            <div className="bg-slate-50 rounded-2xl p-4 space-y-4">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Calendar size={12} className="text-indigo-600" /> Schedule
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}><Calendar size={11} /> Date *</label>
                  <input
                    type="date"
                    value={form.oneTimeOnly ? form.tripDate : form.date}
                    onChange={e => update(form.oneTimeOnly ? 'tripDate' : 'date', e.target.value)}
                    className={inputClass('date')}
                    min={todayStr()}
                  />
                </div>

                <div>
                  <label className={labelClass}><Clock size={11} /> Time *</label>
                  <div className="flex gap-2">
                    <input
                      type="time"
                      value={form.time}
                      onChange={e => update('time', e.target.value)}
                      disabled={form.willCall}
                      className={`${inputClass('time')} flex-1 ${form.willCall ? 'opacity-40 cursor-not-allowed' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => update('willCall', !form.willCall)}
                      className={`px-2 py-1.5 rounded-xl text-xs font-bold transition-all border whitespace-nowrap ${
                        form.willCall
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400'
                      }`}
                    >
                      WC
                    </button>
                  </div>
                  {errors.time && <p className="text-xs text-rose-600 mt-1 font-medium">{errors.time}</p>}
                </div>
              </div>

              {/* Recurring Toggle */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => update('recurring', !form.recurring)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                      form.recurring
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400'
                    }`}
                  >
                    <Repeat size={12} /> Recurring Trip
                  </button>

                  {/* One-Time Only button — next to day selectors */}
                  <button
                    type="button"
                    onClick={() => {
                      update('oneTimeOnly', !form.oneTimeOnly);
                      if (!form.oneTimeOnly) update('recurring', false);
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                      form.oneTimeOnly
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-amber-400'
                    }`}
                  >
                    <Calendar size={12} /> One Time Only
                  </button>
                </div>

                {/* Weekday Picker */}
                {form.recurring && !form.oneTimeOnly && (
                  <div>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAYS.map(day => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleWeekday(day)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                            form.schedule.includes(day)
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-400'
                          }`}
                        >
                          {WEEKDAY_SHORT[day]}
                        </button>
                      ))}
                    </div>
                    {errors.schedule && <p className="text-xs text-rose-600 mt-1 font-medium">{errors.schedule}</p>}
                  </div>
                )}

                {/* One-Time Date Picker */}
                {form.oneTimeOnly && (
                  <div>
                    <label className={labelClass}><Calendar size={11} /> Specific Date</label>
                    <input
                      type="date"
                      value={form.tripDate}
                      onChange={e => update('tripDate', e.target.value)}
                      className={inputClass('tripDate')}
                      min={todayStr()}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Section: Route */}
            <div className="bg-slate-50 rounded-2xl p-4 space-y-4">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Navigation size={12} className="text-emerald-600" /> Route
              </h3>

              <div>
                <label className={labelClass}><MapPin size={11} className="text-emerald-600" /> Pickup Address *</label>
                <PlacesAutocompleteInput
                  value={form.pickup}
                  onChange={v => update('pickup', v)}
                  placeholder="Full pickup address"
                  className={inputClass('pickup')}
                  required
                />
                {errors.pickup && <p className="text-xs text-rose-600 mt-1 font-medium">{errors.pickup}</p>}
              </div>

              <div>
                <label className={labelClass}><Phone size={11} /> Pickup Phone</label>
                <input
                  type="tel"
                  value={form.pickupPhone}
                  onChange={e => update('pickupPhone', e.target.value)}
                  placeholder="(555) 000-0000"
                  className={inputClass('pickupPhone')}
                />
              </div>

              <div>
                <label className={labelClass}><MapPin size={11} className="text-rose-600" /> Dropoff Address *</label>
                <PlacesAutocompleteInput
                  value={form.dropoff}
                  onChange={v => update('dropoff', v)}
                  placeholder="Full dropoff address"
                  className={inputClass('dropoff')}
                  required
                />
                {errors.dropoff && <p className="text-xs text-rose-600 mt-1 font-medium">{errors.dropoff}</p>}
              </div>

              <div>
                <label className={labelClass}><Phone size={11} /> Dropoff Phone</label>
                <input
                  type="tel"
                  value={form.dropoffPhone}
                  onChange={e => update('dropoffPhone', e.target.value)}
                  placeholder="(555) 000-0000"
                  className={inputClass('dropoffPhone')}
                />
              </div>
            </div>

            {/* Section: Driver Assignment */}
            {selectableDrivers.length > 0 && (
              <div className="bg-slate-50 rounded-2xl p-4 space-y-4">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Truck size={12} className="text-blue-600" /> Driver Assignment
                </h3>

                {role === 'driver' ? (
                  // Driver: show their own name, read-only
                  <div className={`${inputClass()} flex items-center gap-2 bg-blue-50 border-blue-200`}>
                    <Truck size={14} className="text-blue-600 shrink-0" />
                    <span className="text-sm font-semibold text-blue-700">
                      {selectableDrivers[0]?.name || currentUser} (You)
                    </span>
                  </div>
                ) : (
                  <>
                    <select
                      value={form.driverId}
                      onChange={e => update('driverId', e.target.value)}
                      className={inputClass('driverId')}
                    >
                      <option value="">— Unassigned —</option>
                      {selectableDrivers.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name} {d.status ? `(${d.status})` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400 font-medium">
                      {role === 'admin' ? 'Admin can assign to any driver.' : 'Assign to one of your drivers.'}
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Section: Notes */}
            <div className="bg-slate-50 rounded-2xl p-4">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-3">
                <FileText size={12} className="text-amber-600" /> Notes & Special Requirements
              </h3>
              <textarea
                value={form.notes}
                onChange={e => update('notes', e.target.value)}
                placeholder="Wheelchair, oxygen, mobility aids, special instructions..."
                rows={3}
                className={`${inputClass('notes')} resize-none`}
              />
            </div>

          </div>
        </form>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-slate-100 bg-white rounded-b-3xl">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black text-sm hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            {submitting ? 'Adding Trip...' : 'Add Trip'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddTripModal;
