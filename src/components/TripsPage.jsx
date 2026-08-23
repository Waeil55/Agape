import React, { useMemo, useState } from 'react';
import { timeToMinutes, tripMatchesCalendarDay } from '../utils/tripDate';
import { getManifestUrgency } from '../utils/portalSelectors';
import { MapPin, AlertCircle, Users, UserCheck, X, Plus, Trash2, Edit2, Phone, MessageSquare, Flag, Sparkles, Check, Archive, SlidersHorizontal, ChevronDown, Navigation, MoreHorizontal } from 'lucide-react';
import { suggestBatchAssignment } from '../config/ai';
import { makeCall, sendSMS } from '../utils/nativeActions';
import { isNativeShell } from '../utils/platform';
import PlacesAutocompleteInput from './PlacesAutocompleteInput';
import { tripMatchesSearch } from '../utils/search';
import TripActionCenter from './trips/TripActionCenter';

const TERMINAL_STATUSES = ['Completed', 'Cancelled', 'No Show', 'Rerouted'];

const getManifestStatusClass = (status) => {
  if (status === 'Unassigned') return 'bg-rose-100 text-rose-700';
  if (status === 'Assigned') return 'bg-blue-100 text-blue-700';
  if (['In Progress', 'In Mission', 'At Pickup', 'In Transit', 'At Dropoff', 'En Route', 'Navigating Pickup', 'Navigating Dropoff', 'Arrived'].includes(status)) return 'bg-amber-100 text-amber-700';
  if (status === 'Completed') return 'bg-emerald-100 text-emerald-700';
  if (status === 'Cancelled') return 'bg-rose-100 text-rose-700';
  if (status === 'No Show') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
};

const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const toTimeInput = (value) => {
  const raw = String(value || '').trim();
  const twelveHour = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (twelveHour) {
    let hour = Number(twelveHour[1]);
    if (twelveHour[3].toUpperCase() === 'PM' && hour < 12) hour += 12;
    if (twelveHour[3].toUpperCase() === 'AM' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${twelveHour[2]}`;
  }
  const clock = raw.match(/^(\d{1,2}):(\d{2})/);
  return clock ? `${clock[1].padStart(2, '0')}:${clock[2]}` : '';
};

const buildNewTripDraft = (date) => ({ patient: '', bookingId: '', date, time: '', type: '', pickup: '', dropoff: '', pickupPhone: '', dropoffPhone: '', notes: '', driverId: '' });

const TripsPage = ({ trips = [], role, currentUser = '', drivers = [], selectedTasks = [], toggleTaskSelection = () => {}, onCreateLegMission, onBulkAssignTrips, onAssignTrip, onUnassignTrip, onDriveTrip, onAddTrip, onUpdateTrip, onDeleteTrip }) => {
  const today = useMemo(() => getTodayStr(), []);
  const [sortBy, setSortBy] = useState('time');
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [legsDetailPatient, setLegsDetailPatient] = useState(null);
  const [showAssign, setShowAssign] = useState(false);
  const [assignMode, setAssignMode] = useState('assign');
  const [isBatchAssigning, setIsBatchAssigning] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [assignmentFeedback, setAssignmentFeedback] = useState('');
  const feedbackTimerRef = React.useRef(null);

  React.useEffect(() => () => clearTimeout(feedbackTimerRef.current), []);
  const [newTrip, setNewTrip] = useState(() => buildNewTripDraft(today));
  const [savingCreate, setSavingCreate] = useState(false);
  const [createError, setCreateError] = useState('');
  const [editTrip, setEditTrip] = useState(null);
  const [manifestDate, setManifestDate] = useState(today);
  const [showAllDates, setShowAllDates] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [driverFilter, setDriverFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [layoutMode, setLayoutMode] = useState('grouped');
  const [groupBy, setGroupBy] = useState('driver');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [renderLimit, setRenderLimit] = useState(150);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [actionTrip, setActionTrip] = useState(null);

  const activeFilterCount = [
    sortBy !== 'time',
    statusFilter !== 'all',
    driverFilter !== 'all',
    serviceFilter !== 'all',
    showAllDates,
    attentionOnly,
    layoutMode !== 'grouped',
    groupBy !== 'driver',
  ].filter(Boolean).length;

  const handleBulkAssign = (driverId) => {
    if (assignMode === 'mission') {
      onCreateLegMission(driverId);
      return;
    }
    if (onBulkAssignTrips) {
      onBulkAssignTrips(driverId);
      setShowAssign(false);
      setAssignmentFeedback(`✓ Assigned ${selectedTasks.length} trips`);
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setAssignmentFeedback(''), 3000);
    }
  };

  const handleBulkReassign = (driverId) => {
    selectedTasks.forEach(tripId => {
      onAssignTrip(tripId, driverId);
    });
    setShowReassignModal(false);
    setAssignmentFeedback(`✓ Reassigned ${selectedTasks.length} trips`);
    clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setAssignmentFeedback(''), 3000);
  };

  const handleBulkUnassign = () => {
    if (!window.confirm(`Unassign ${selectedTasks.length} trips?`)) return;
    selectedTasks.forEach(tripId => {
      onAssignTrip(tripId, '');
    });
    setAssignmentFeedback(`✓ Unassigned ${selectedTasks.length} trips`);
    clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setAssignmentFeedback(''), 3000);
  };

  const handleBulkDelete = () => {
    if (!window.confirm(`Archive ${selectedTasks.length} selected trips?`)) return;
    selectedTasks.forEach(id => {
      onDeleteTrip(id);
    });
    selectedTasks.forEach(id => toggleTaskSelection(id));
  };

  const getZip = (addr) => (addr || '').match(/\b(\d{5})\b/)?.[1] || '';

  const serviceOptions = useMemo(
    () => [...new Set(trips.map((trip) => trip.type || trip.serviceType).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b))),
    [trips]
  );

  const filteredTrips = useMemo(() => [...trips]
    .filter(t => showAllDates || tripMatchesCalendarDay(t.date, manifestDate))
    .filter((trip) => {
      if (statusFilter !== 'all' && trip.status !== statusFilter) return false;
      if (driverFilter === 'unassigned' && trip.driverId) return false;
      if (driverFilter !== 'all' && driverFilter !== 'unassigned' && trip.driverId !== driverFilter) return false;
      if (serviceFilter !== 'all' && (trip.type || trip.serviceType || '') !== serviceFilter) return false;
      if (attentionOnly) {
        const urgency = getManifestUrgency(trip);
        if (!(trip.status === 'Unassigned' || urgency === 'late' || urgency === 'soon')) return false;
      }
      if (!searchTerm.trim()) return true;
      return tripMatchesSearch(trip, searchTerm);
    })
    .sort((a, b) => {
      if (sortBy === 'time') {
        const timeA = timeToMinutes(a.time);
        const timeB = timeToMinutes(b.time);

        if (timeA !== timeB) return timeA - timeB;
        // If times are same, sort by patient
        return (a.patient || '').localeCompare(b.patient || '');
      }
      if (sortBy === 'patient') return (a.patient || '').localeCompare(b.patient || '');
      if (sortBy === 'zip') {
        const za = getZip(a.pickup);
        const zb = getZip(b.pickup);
        if (za !== zb) return za.localeCompare(zb);
        return (a.patient || '').localeCompare(b.patient || '');
      }
      if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '');
      return 0;
    }), [trips, showAllDates, manifestDate, statusFilter, driverFilter, serviceFilter, attentionOnly, searchTerm, sortBy]);

  const visibleTrips = useMemo(() => filteredTrips.slice(0, renderLimit), [filteredTrips, renderLimit]);

  React.useEffect(() => {
    setRenderLimit(150);
  }, [showAllDates, manifestDate, searchTerm, statusFilter, driverFilter, serviceFilter, attentionOnly, sortBy, layoutMode, groupBy]);

  const manifestSummary = useMemo(() => ({
    total: filteredTrips.length,
    late: filteredTrips.filter((trip) => getManifestUrgency(trip) === 'late').length,
    soon: filteredTrips.filter((trip) => getManifestUrgency(trip) === 'soon').length,
    unassigned: filteredTrips.filter((trip) => !trip.driverId || trip.status === 'Unassigned').length,
    assigned: filteredTrips.filter((trip) => trip.driverId).length,
  }), [filteredTrips]);

  const groupedTrips = useMemo(() => {
    const sections = new Map();
    visibleTrips.forEach((trip) => {
      let key = 'all';
      let label = 'Live Queue';
      let order = 0;
      if (groupBy === 'driver') {
        const driver = drivers.find((entry) => entry.id === trip.driverId);
        key = driver?.id || 'unassigned';
        label = driver?.name || 'Unassigned Pool';
        order = driver ? 1 : 0;
      } else if (groupBy === 'status') {
        key = trip.status || 'Unknown';
        label = trip.status || 'Unknown';
      } else if (groupBy === 'service') {
        key = trip.type || trip.serviceType || 'Unclassified';
        label = key;
      } else if (groupBy === 'date') {
        key = trip.date || 'No Date';
        label = trip.date || 'No Date';
      }
      if (!sections.has(key)) {
        sections.set(key, { key, label, order, trips: [], late: 0 });
      }
      const section = sections.get(key);
      section.trips.push(trip);
      if (getManifestUrgency(trip) === 'late') section.late += 1;
    });
    return [...sections.values()]
      .map((section) => ({
        ...section,
        trips: section.trips.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)),
      }))
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return String(a.label || '').localeCompare(String(b.label || ''));
      });
  }, [drivers, groupBy, visibleTrips]);

  const handleAssign = (driverId) => {
    if (onAssignTrip && selectedTrip) {
      const driver = drivers.find(d => d.id === driverId);
      onAssignTrip(selectedTrip.id, driverId);
      setAssignmentFeedback(`✓ ${selectedTrip.patient} assigned to ${driver?.name || 'Driver'}`);
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setAssignmentFeedback(''), 3000);
      setShowAssign(false);
      setSelectedTrip(null);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editTrip || savingEdit) return;
    setSavingEdit(true);
    try {
      const saved = await Promise.resolve(onUpdateTrip(editTrip));
      if (saved === false) throw new Error('The trip update was rejected.');
      setAssignmentFeedback(`✓ Trip ${editTrip.bookingId || editTrip.id} saved`);
      setEditTrip(null);
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setAssignmentFeedback(''), 3000);
    } catch (error) {
      setAssignmentFeedback(`Trip was not saved: ${error?.message || 'unknown error'}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (savingCreate) return;
    setCreateError('');
    if (!onAddTrip) {
      setCreateError('Trip creation is unavailable in this workspace.');
      return;
    }
    const selectedDriver = drivers.find((driver) => driver.id === newTrip.driverId);
    const createdAt = new Date().toISOString();
    const reference = String(newTrip.bookingId || '').trim() || `MANUAL-${Date.now()}`;
    const record = {
      ...newTrip,
      id: `trip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      bookingId: reference,
      patient: String(newTrip.patient || '').trim(),
      pickup: String(newTrip.pickup || '').trim(),
      dropoff: String(newTrip.dropoff || '').trim(),
      status: selectedDriver ? 'Assigned' : 'Unassigned',
      driverId: selectedDriver?.id || null,
      driverName: selectedDriver?.name || null,
      driverEmail: selectedDriver?.email || null,
      createdAt,
      createdBy: currentUser || role || 'operations',
      createdByRole: role || 'operations',
      source: 'manual_manifest',
      pickupOdometer: null,
      dropoffOdometer: null,
      arrivalTime: null,
      arrivalDropoffTime: null,
      departedPickupTime: null,
      completedAt: null,
      reviewed: false,
    };
    setSavingCreate(true);
    try {
      const saved = await Promise.resolve(onAddTrip(record));
      if (saved === false) throw new Error('The trip was rejected by access or validation rules.');
      setNewTrip(buildNewTripDraft(record.date || today));
      setManifestDate(record.date || today);
      setShowAllDates(false);
      setShowCreateForm(false);
      setAssignmentFeedback(`Trip ${reference} created`);
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setAssignmentFeedback(''), 3000);
    } catch (error) {
      setCreateError(error?.message || 'Trip could not be saved.');
    } finally {
      setSavingCreate(false);
    }
  };

  const openEdit = (trip) => {
    setEditTrip({ ...trip, time: toTimeInput(trip.time) });
  };

  const renderManifestTripCard = (trip) => {
    const driver = drivers.find((entry) => entry.id === trip.driverId);
    const isSelected = selectedTasks.includes(trip.id);
    const urgency = getManifestUrgency(trip);
    const isLate = urgency === 'late';
    const isEditing = editTrip?.id === trip.id;

    const handleAssignClick = () => {
      setSelectedTrip(trip);
      setAssignMode('assign');
      setShowAssign(true);
    };

    const handleReassignClick = () => {
      setSelectedTrip(trip);
      setAssignMode('reassign');
      setShowReassignModal(true);
    };

    if (isEditing) {
      const fieldClass = 'w-full rounded-lg border border-blue-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100';
      return (
        <form key={trip.id} onSubmit={handleUpdate} className="rounded-xl border-2 border-blue-400 bg-blue-50/50 p-3 shadow-sm" onClick={event => event.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">Editing in manifest</p>
              <p className="text-sm font-bold text-slate-900">{trip.bookingId || trip.id}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setEditTrip(null)} disabled={savingEdit} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={savingEdit} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{savingEdit ? 'Saving…' : 'Save row'}</button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <input autoFocus value={editTrip.patient || ''} onChange={event => setEditTrip(current => ({ ...current, patient: event.target.value }))} className={fieldClass} placeholder="Passenger" aria-label="Passenger" />
            <input value={editTrip.bookingId || ''} onChange={event => setEditTrip(current => ({ ...current, bookingId: event.target.value }))} className={fieldClass} placeholder="Booking ID" aria-label="Booking ID" />
            <input type="date" value={editTrip.date || ''} onChange={event => setEditTrip(current => ({ ...current, date: event.target.value }))} className={fieldClass} aria-label="Service date" />
            <input type="time" value={editTrip.time || ''} onChange={event => setEditTrip(current => ({ ...current, time: event.target.value }))} className={fieldClass} aria-label="Scheduled time" />
            <input value={editTrip.type || ''} onChange={event => setEditTrip(current => ({ ...current, type: event.target.value }))} className={fieldClass} placeholder="Service type" aria-label="Service type" />
            <select value={editTrip.status || ''} onChange={event => setEditTrip(current => ({ ...current, status: event.target.value }))} className={fieldClass} aria-label="Status">
              {['Unassigned', 'Assigned', 'Navigating Pickup', 'At Pickup', 'In Transit', 'At Dropoff', 'Completed', 'No Show', 'Cancelled', 'Rerouted'].map(status => <option key={status} value={status}>{status}</option>)}
            </select>
            <select value={editTrip.driverId || ''} onChange={event => setEditTrip(current => ({ ...current, driverId: event.target.value }))} className={fieldClass} aria-label="Driver">
              <option value="">Unassigned</option>
              {drivers.map(entry => <option key={entry.id} value={entry.id}>{entry.name} {entry.vehicle ? `(${entry.vehicle})` : ''}</option>)}
            </select>
            <input value={editTrip.pickupPhone || ''} onChange={event => setEditTrip(current => ({ ...current, pickupPhone: event.target.value }))} className={fieldClass} placeholder="Patient phone" aria-label="Patient phone" />
            <div className="sm:col-span-2">
              <PlacesAutocompleteInput value={editTrip.pickup || ''} onChange={value => setEditTrip(current => ({ ...current, pickup: value }))} className={fieldClass} placeholder="Pickup address" required />
            </div>
            <div className="sm:col-span-2">
              <PlacesAutocompleteInput value={editTrip.dropoff || ''} onChange={value => setEditTrip(current => ({ ...current, dropoff: value }))} className={fieldClass} placeholder="Dropoff address" required />
            </div>
            <textarea value={editTrip.notes || ''} onChange={event => setEditTrip(current => ({ ...current, notes: event.target.value }))} className={`${fieldClass} sm:col-span-2 xl:col-span-4`} rows="2" placeholder="Notes" aria-label="Notes" />
          </div>
        </form>
      );
    }

    return (
      <div key={trip.id} className={`rounded-xl border bg-white p-3 transition-all ${isSelected ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-300' : isLate ? 'border-rose-200 bg-rose-50' : 'border-slate-200 hover:border-slate-300'}`}>
        <div className="flex items-start gap-2">
          <input type="checkbox" checked={isSelected} onChange={() => toggleTaskSelection(trip.id)} className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
          <div className="min-w-0 flex-1">
            {/* Header Row: Time, Status, Badges */}
            <div className="mb-2 flex items-center gap-2 flex-wrap">
              <span className={`text-lg font-black leading-none ${isLate ? 'text-rose-600' : urgency === 'soon' ? 'text-amber-600' : 'text-slate-700'}`}>{trip.time}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getManifestStatusClass(trip.status)}`}>{trip.status}</span>
              {trip.type && <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{trip.type}</span>}
              {trip.bookingId && <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{trip.bookingId}</span>}
            </div>

            {/* Patient Name */}
            <div className="mb-2 flex items-center gap-2 flex-wrap">
              <p className="break-words text-sm font-semibold text-slate-900">{trip.patient}</p>
              {(() => {
                const legs = filteredTrips.filter((entry) => (entry.patient || '').toLowerCase() === (trip.patient || '').toLowerCase()).length;
                return legs > 1 ? (
                  <button onClick={(e) => { e.stopPropagation(); setLegsDetailPatient(trip.patient); }} className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full hover:bg-blue-100 cursor-pointer">
                    {legs} legs
                  </button>
                ) : null;
              })()}
            </div>

            {/* Addresses */}
            <div className="mb-2 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-2">
                <div className="text-[9px] font-semibold uppercase text-emerald-700">Pickup</div>
                <p className="mt-0.5 break-words text-xs font-semibold text-slate-700 line-clamp-2">{trip.pickup}</p>
              </div>
              <div className="rounded-lg border border-rose-100 bg-rose-50 p-2">
                <div className="text-[9px] font-semibold uppercase text-rose-700">Dropoff</div>
                <p className="mt-0.5 break-words text-xs font-semibold text-slate-700 line-clamp-2">{trip.dropoff}</p>
              </div>
            </div>

            {/* Assignment Buttons - PROMINENT */}
            <div className="flex gap-2 flex-wrap items-center">
              {driver ? (
                <>
                  <div className="flex-1 min-w-[150px]">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-100 px-2.5 py-1.5 rounded-lg">
                      <UserCheck size={12} /> {driver.name} {driver.vehicle ? `• ${driver.vehicle}` : ''}
                    </span>
                  </div>
                  <button onClick={handleReassignClick} className="px-3 py-1.5 rounded-lg bg-amber-500 text-white font-bold text-xs uppercase hover:bg-amber-600 transition whitespace-nowrap">Reassign</button>
                  <button onClick={() => onAssignTrip(trip.id, '')} className="px-3 py-1.5 rounded-lg bg-slate-500 text-white font-bold text-xs uppercase hover:bg-slate-600 transition whitespace-nowrap">Remove</button>
                </>
              ) : (
                <button onClick={handleAssignClick} className="w-full px-4 py-2.5 rounded-lg bg-emerald-500 text-white font-bold text-sm uppercase hover:bg-emerald-600 transition flex items-center justify-center gap-2 shadow-md shadow-emerald-500/30 border-2 border-emerald-600">
                  <Users size={16} /> ASSIGN DRIVER
                </button>
              )}
            </div>

            {/* Contact Info - Compact */}
            {(role === 'admin' || role === 'dispatcher') && (trip.pickupPhone || trip.notes) && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {trip.pickupPhone && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => makeCall(trip.pickupPhone, trip.patient)} className="text-blue-600 hover:underline font-bold">{trip.pickupPhone}</button>
                    <button onClick={() => sendSMS(trip.pickupPhone, trip.patient)} className="text-blue-600 hover:text-blue-700" aria-label="SMS"><MessageSquare size={12} /></button>
                  </div>
                )}
                {trip.notes && (
                  <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded">📌 {trip.notes}</span>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (driver) onDriveTrip?.(trip);
                  else handleAssignClick();
                }}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-700"
              >
                <Navigation size={14} /> {driver ? 'Drive trip' : 'Assign to drive'}
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setActionTrip(trip); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-blue-200 hover:bg-blue-50" aria-label={`More actions for ${trip.patient || trip.bookingId || 'trip'}`}><MoreHorizontal size={15} /> Actions</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-6 pb-24 max-md:[&_button]:min-h-11">
      {/* Assignment Success Feedback */}
      {assignmentFeedback && (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50 animate-in">
          <div className="bg-emerald-600 text-white px-6 py-4 rounded-xl font-semibold text-base shadow-xl shadow-emerald-500/30 flex items-center gap-2">
            <Check size={20} /> {assignmentFeedback}
          </div>
        </div>
      )}
      <TripActionCenter
        open={Boolean(actionTrip)}
        trip={actionTrip}
        driver={actionTrip ? drivers.find((entry) => entry.id === actionTrip.driverId) : null}
        role={role}
        onClose={() => setActionTrip(null)}
        callbacks={{
          onDrive: (trip) => {
            const assigned = drivers.find((entry) => entry.id === trip.driverId);
            if (assigned) onDriveTrip?.(trip);
            else { setSelectedTrip(trip); setAssignMode('assign'); setShowAssign(true); }
          },
          onAssign: (trip) => { setSelectedTrip(trip); setAssignMode(trip.driverId ? 'reassign' : 'assign'); trip.driverId ? setShowReassignModal(true) : setShowAssign(true); },
          onNavigate: (trip) => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(trip.pickup || '')}`, '_blank', 'noopener,noreferrer'),
          onCall: (trip) => makeCall(trip.patientPhone || trip.pickupPhone || trip.dropoffPhone, trip.patient),
          onMessage: (trip) => sendSMS(trip.patientPhone || trip.pickupPhone || trip.dropoffPhone, trip.patient),
          onEdit: openEdit,
          onArchive: (trip) => onDeleteTrip?.(trip.id),
        }}
      />
      {/* HEADER CONTROLS */}
      <div className="card p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:hidden">
          <button
            type="button"
            aria-expanded={mobileFiltersOpen}
            aria-controls="mobile-manifest-filters"
            onClick={() => setMobileFiltersOpen((open) => !open)}
            className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 text-left text-sm font-bold text-slate-700"
          >
            <span className="flex min-w-0 items-center gap-2">
              <SlidersHorizontal size={17} className="shrink-0 text-blue-600" />
              <span className="truncate">Filters · {manifestDate}</span>
              {activeFilterCount > 0 && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] text-white">{activeFilterCount}</span>}
            </span>
            <ChevronDown size={16} className={`shrink-0 transition-transform ${mobileFiltersOpen ? 'rotate-180' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white shadow-sm shadow-emerald-500/20"
          >
            <Plus size={16} className="inline" /> New
          </button>
        </div>

        <div id="mobile-manifest-filters" className={`${mobileFiltersOpen ? 'space-y-4' : 'hidden'} sm:block sm:space-y-4`}>
        {/* First Row: Main Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Patient, booking, phone..."
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 font-semibold text-sm outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Sort</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 font-semibold text-sm outline-none">
              <option value="time">By Time</option>
              <option value="patient">By Patient</option>
              <option value="zip">By Zip</option>
              <option value="status">By Status</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 font-semibold text-sm outline-none">
              <option value="all">All</option>
              <option value="Unassigned">Unassigned</option>
              <option value="Assigned">Assigned</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Driver</label>
            <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 font-semibold text-sm outline-none">
              <option value="all">All Drivers</option>
              <option value="unassigned">No Driver</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Second Row: Additional Filters & Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Service</label>
            <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 font-semibold text-sm outline-none">
              <option value="all">All Services</option>
              {serviceOptions.map((service) => (
                <option key={service} value={service}>{service}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Date</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={manifestDate}
                disabled={showAllDates}
                onChange={(e) => setManifestDate(e.target.value)}
                className={`flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 font-semibold text-sm outline-none transition-opacity ${showAllDates ? 'opacity-50' : 'opacity-100'}`}
              />
              <button onClick={() => setShowAllDates(!showAllDates)} className={`px-3 py-2.5 rounded-lg text-xs font-bold uppercase whitespace-nowrap ${showAllDates ? 'bg-blue-100 text-blue-700' : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                {showAllDates ? 'All' : 'Today'}
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <select value={layoutMode} onChange={(e) => setLayoutMode(e.target.value)} className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 font-semibold text-sm outline-none">
              <option value="grouped">Grouped</option>
              <option value="list">List</option>
            </select>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 font-semibold text-sm outline-none">
              <option value="driver">By Driver</option>
              <option value="status">By Status</option>
              <option value="service">By Service</option>
              <option value="date">By Date</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAttentionOnly((prev) => !prev)}
              className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-bold uppercase whitespace-nowrap ${attentionOnly ? 'bg-rose-100 text-rose-700' : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
            >
              {attentionOnly ? '⚠ Attention' : 'Full Queue'}
            </button>
            <button onClick={() => setShowCreateForm(true)} className="hidden flex-1 px-3 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold text-sm uppercase sm:block">
              <Plus size={14} className="inline mr-1" /> New
            </button>
          </div>
        </div>
        </div>

        {/* Bulk Actions - Only show when items selected */}
        {selectedTasks.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-xs font-semibold text-blue-700 self-center">{selectedTasks.length} selected:</span>
            <button onClick={() => { setAssignMode('assign'); setShowAssign(true); }} className="px-3 py-2 bg-emerald-600 text-white rounded-lg font-bold text-xs uppercase hover:bg-emerald-700">
              <Users size={12} className="inline mr-1" /> Assign
            </button>
            <button onClick={() => { setShowReassignModal(true); }} className="px-3 py-2 bg-amber-600 text-white rounded-lg font-bold text-xs uppercase hover:bg-amber-700">
              <UserCheck size={12} className="inline mr-1" /> Reassign
            </button>
            <button onClick={handleBulkUnassign} className="px-3 py-2 bg-slate-600 text-white rounded-lg font-bold text-xs uppercase hover:bg-slate-700">
              <X size={12} className="inline mr-1" /> Remove
            </button>
            {selectedTasks.length > 1 && (
              <button onClick={() => { setAssignMode('mission'); setShowAssign(true); }} className="px-3 py-2 bg-indigo-600 text-white rounded-lg font-bold text-xs uppercase hover:bg-indigo-700">
                <Sparkles size={12} className="inline mr-1" /> Mission
              </button>
            )}
            <button onClick={handleBulkDelete} className="px-3 py-2 bg-rose-600 text-white rounded-lg font-bold text-xs uppercase hover:bg-rose-700 ml-auto">
              <Archive size={12} className="inline mr-1" /> Archive
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {[
          { label: 'Trips', value: manifestSummary.total, tone: 'text-slate-900 bg-white border-slate-200' },
          { label: 'Late', value: manifestSummary.late, tone: manifestSummary.late > 0 ? 'text-rose-700 bg-rose-50 border-rose-200' : 'text-slate-600 bg-slate-50 border-slate-200' },
          { label: 'Soon', value: manifestSummary.soon, tone: 'text-amber-700 bg-amber-50 border-amber-200' },
          { label: 'Open', value: manifestSummary.unassigned, tone: manifestSummary.unassigned > 0 ? 'text-rose-700 bg-rose-50 border-rose-200' : 'text-slate-600 bg-slate-50 border-slate-200' },
          { label: 'Assigned', value: manifestSummary.assigned, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
        ].map((metric) => (
          <div key={metric.label} className={`rounded-xl border px-4 py-3 shadow-sm ${metric.label === 'Trips' ? 'col-span-2 xl:col-span-1' : ''} ${metric.tone}`}>
            <p className="text-[10px] font-semibold uppercase tracking-widest">{metric.label}</p>
            <p className="mt-1 text-2xl font-black">{metric.value}</p>
          </div>
        ))}
      </div>

      {/* TABLE / LIST */}
      <div className="card overflow-hidden">
        <div className="p-3 sm:p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-heading text-slate-900">Live Manifest Queue</h3>
          <div className="flex items-center gap-3">
            {showAllDates && <span className="badge badge-warning text-xs">Viewing All Dates</span>}
            <span className="badge badge-info">Showing {visibleTrips.length} / {filteredTrips.length}</span>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {filteredTrips.length === 0 ? (
            <div className="p-12 text-center">
              <AlertCircle size={48} className="mx-auto text-slate-200 mb-4" />
              <p className="text-slate-400 font-semibold text-lg">Queue is empty</p>
            </div>
          ) : (
            layoutMode === 'grouped' ? (
              <div className="space-y-4 p-3 sm:p-4">
                {groupedTrips.map((section) => (
                  <section key={section.key} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-black text-slate-900">{section.label}</h4>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">{section.trips.length} trip{section.trips.length !== 1 ? 's' : ''}</span>
                          {section.late > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">{section.late} late</span>}
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{groupBy}</span>
                    </div>
                    <div className="space-y-3">
                      {section.trips.map((trip) => renderManifestTripCard(trip))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              visibleTrips.map((trip) => renderManifestTripCard(trip))
            )
          )}
        </div>
        {filteredTrips.length > visibleTrips.length && (
          <div className="p-4 border-t border-slate-100 flex justify-center">
            <button
              type="button"
              onClick={() => setRenderLimit((prev) => prev + 150)}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              Load 150 More Trips
            </button>
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {showCreateForm && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-950/60" onClick={() => setShowCreateForm(false)} />
          <div className="relative z-10 my-0 max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-none border border-slate-200 rounded-t-3xl bg-white p-5 shadow-2xl sm:my-auto sm:rounded-3xl sm:p-8">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-extrabold text-slate-900 flex items-center gap-3"><Plus size={28} className="text-emerald-500" /> New Manifest Entry</h3>
              <button onClick={() => setShowCreateForm(false)} className="p-2.5 bg-slate-100 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-200" aria-label="Close"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">Patient Name</label>
                  <input type="text" required value={newTrip.patient} onChange={(e) => setNewTrip({...newTrip, patient: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-base focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">Booking ID</label>
                  <input type="text" value={newTrip.bookingId} onChange={(e) => setNewTrip({...newTrip, bookingId: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-base focus:border-blue-500 outline-none" placeholder="Optional" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">Service Date</label>
                  <input type="date" required value={newTrip.date} onChange={(e) => setNewTrip({...newTrip, date: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-base focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">Pickup Time</label>
                  <input type="time" required value={newTrip.time} onChange={(e) => setNewTrip({...newTrip, time: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-base focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">Service Type</label>
                  <input type="text" required placeholder="AM1" value={newTrip.type} onChange={(e) => setNewTrip({...newTrip, type: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-base focus:border-blue-500 outline-none" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">Pickup Address</label>
                  <PlacesAutocompleteInput
                    value={newTrip.pickup}
                    onChange={(v) => setNewTrip({...newTrip, pickup: v})}
                    placeholder="Pickup address"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-base focus:border-blue-500 outline-none"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">Dropoff Address</label>
                  <PlacesAutocompleteInput
                    value={newTrip.dropoff}
                    onChange={(v) => setNewTrip({...newTrip, dropoff: v})}
                    placeholder="Dropoff address"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-base focus:border-blue-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">Patient Phone</label>
                  <input type="text" value={newTrip.pickupPhone} onChange={(e) => setNewTrip({...newTrip, pickupPhone: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-base focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">Hospital Phone</label>
                  <input type="text" value={newTrip.dropoffPhone} onChange={(e) => setNewTrip({...newTrip, dropoffPhone: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-base focus:border-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">Notes</label>
                <textarea value={newTrip.notes} onChange={(e) => setNewTrip({...newTrip, notes: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-base focus:border-blue-500 outline-none" rows="2" placeholder="Special instructions, comments..." />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">Assign to Driver</label>
                <select value={newTrip.driverId} onChange={(e) => setNewTrip({...newTrip, driverId: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-base focus:border-blue-500 outline-none">
                  <option value="">Unassigned</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name} {d.vehicle ? `(${d.vehicle})` : ''}</option>)}
                </select>
              </div>
              {createError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{createError}</div>}
              <button type="submit" disabled={savingCreate} className="w-full py-5 bg-emerald-600 text-white rounded-xl font-bold text-base shadow-xl shadow-emerald-500/20 active:scale-[0.98] transition disabled:cursor-wait disabled:opacity-60">{savingCreate ? 'Saving Trip...' : 'Create Manifest Entry'}</button>
            </form>
          </div>
        </div>
      )}

      {/* ASSIGN MODAL */}
      {showAssign && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-950/60" onClick={() => setShowAssign(false)} />
          <div className="relative z-10 flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-3xl border border-slate-200 bg-white p-4 shadow-2xl sm:rounded-3xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                {assignMode === 'mission' ? (
                  <><Sparkles size={20} className="text-indigo-600" /> Mission</>
                ) : (
                  <><Users size={20} className="text-emerald-600" /> Assign</>
                )}
              </h3>
              <button onClick={() => setShowAssign(false)} className="p-1.5 bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-200" aria-label="Close"><X size={18} /></button>
            </div>
            <p className="text-[11px] font-semibold text-slate-500 mb-3 uppercase tracking-widest line-clamp-1">
              {assignMode === 'mission'
                ? `Mission for ${selectedTasks.length || 1} trip${selectedTasks.length !== 1 ? 's' : ''}`
                : `Select driver (${selectedTasks.length > 0 ? selectedTasks.length : 1})`}
            </p>
            <div className="space-y-1.5 overflow-y-auto flex-1 pr-2">
              {drivers.map(d => (
                <button key={d.id} onClick={() => {
                  if (assignMode === 'mission') {
                    onCreateLegMission(d.id);
                    setShowAssign(false);
                  } else if (selectedTasks.length > 0) {
                    handleBulkAssign(d.id);
                  } else if (selectedTrip) {
                    handleAssign(d.id);
                  }
                }}
                  className="w-full flex items-center justify-between p-2.5 bg-slate-50 hover:bg-emerald-50 border border-slate-100 rounded-xl transition group">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-emerald-600 font-bold text-sm shadow-sm group-hover:bg-emerald-600 group-hover:text-white transition-colors shrink-0">{String(d?.name || '?').charAt(0)}</div>
                    <div className="text-left min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">{d.name}</p>
                      <p className="text-[10px] font-semibold text-slate-400 truncate">{d.vehicle || '—'}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-600 uppercase shrink-0 ml-1">→</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* REASSIGN MODAL */}
      {showReassignModal && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-950/60" onClick={() => setShowReassignModal(false)} />
          <div className="relative z-10 flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-3xl border border-slate-200 bg-white p-4 shadow-2xl sm:rounded-3xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <UserCheck size={20} className="text-amber-600" /> Reassign
              </h3>
              <button onClick={() => setShowReassignModal(false)} className="p-1.5 bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-200" aria-label="Close"><X size={18} /></button>
            </div>
            <p className="text-[11px] font-semibold text-slate-500 mb-3 uppercase tracking-widest line-clamp-1">
              Replace for {selectedTasks.length > 0 ? selectedTasks.length : 1} trip{selectedTasks.length !== 1 ? 's' : ''}
            </p>
            <div className="space-y-1.5 overflow-y-auto flex-1 pr-2">
              {drivers.map(d => (
                <button key={d.id} onClick={() => {
                  if (selectedTasks.length > 0) {
                    handleBulkReassign(d.id);
                  } else if (selectedTrip) {
                    handleAssign(d.id);
                    setShowReassignModal(false);
                  }
                }}
                  className="w-full flex items-center justify-between p-2.5 bg-slate-50 hover:bg-amber-50 border border-slate-100 rounded-xl transition group">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-amber-600 font-bold text-sm shadow-sm group-hover:bg-amber-600 group-hover:text-white transition-colors shrink-0">{String(d?.name || '?').charAt(0)}</div>
                    <div className="text-left min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">{d.name}</p>
                      <p className="text-[10px] font-semibold text-slate-400 truncate">{d.vehicle || '—'}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-amber-600 uppercase shrink-0 ml-1">→</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Legs Detail Modal */}
      {legsDetailPatient && (() => {
        const patientName = legsDetailPatient;
        const legs = filteredTrips.filter(t => (t.patient || '').trim().toLowerCase() === patientName.trim().toLowerCase());
        return (
          <div className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center sm:p-4" onClick={() => setLegsDetailPatient(null)}>
            <div className="absolute inset-0 bg-slate-950/60" />
            <div className="relative z-10 max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-3xl" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-slate-900">{patientName}</h3>
                <button onClick={() => setLegsDetailPatient(null)} className="p-1.5 bg-slate-100 rounded-xl text-slate-500 hover:bg-slate-200" aria-label="Close"><X size={16} /></button>
              </div>
              <p className="text-xs text-slate-500 font-medium mb-4">{legs.length} leg{legs.length !== 1 ? 's' : ''}</p>
              <div className="space-y-2">
                {legs.map((leg, idx) => (
                  <div key={leg.id} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-400 uppercase">Leg {idx + 1}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${leg.status === 'Completed' ? 'bg-emerald-50 text-emerald-600' : leg.status === 'Assigned' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{leg.status}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-400 mb-1">Booking: {leg.bookingId || '—'}</p>
                    <div className="space-y-1.5">
                      <div className="flex items-start gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-500">Pickup</p>
                          <p className="text-sm text-slate-500 truncate">{leg.pickup}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-500">Dropoff</p>
                          <p className="text-sm text-slate-500 truncate">{leg.dropoff}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                      <span>Time: {leg.time || '—'}</span>
                      <span>Type: {leg.type || '—'}</span>
                    </div>
                    {leg.notes && <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">{leg.notes}</p>}
                    {leg.pickupPhone && <p className="mt-1.5 text-xs text-slate-400">Phone: {leg.pickupPhone}</p>}
                    {leg.driverId && (() => {
                      const d = drivers.find(drv => drv.id === leg.driverId);
                      return d ? <p className="mt-1.5 text-xs text-slate-400">Driver: {d.name}</p> : null;
                    })()}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default TripsPage;
