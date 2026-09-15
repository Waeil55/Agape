import React, { useMemo, useState } from 'react';
import { timeToMinutes, tripMatchesCalendarDay } from '../utils/tripDate';
import { getManifestUrgency } from '../utils/portalSelectors';
import { Users, UserCheck, X, Plus, Upload, MessageSquare, Sparkles, Check, CheckSquare, Square, Archive, SlidersHorizontal, ChevronDown, Navigation, MoreHorizontal, Phone, Zap, Filter } from 'lucide-react';

import { makeCall, sendSMS, openNavigation } from '../utils/nativeActions';
import { saveClientProfile } from '../utils/clientProfileUtils';
import ScheduleEditorModal from './trips/ScheduleEditorModal';
import AdminQuickSmsSheet from './trips/AdminQuickSmsSheet';

import PlacesAutocompleteInput from './PlacesAutocompleteInput';
import { tripMatchesSearch } from '../utils/search';
import { resolveClientPhoneForTrip } from '../utils/clientPhoneResolution';
import { resolveTripDriver } from '../utils/driverIdentity';
// Shared mobile manifest language (single card + KPI strip for all mobile
// portals).
import {
  ManifestKpiStrip,
  ManifestTripCard,
  ON_TIME_GRACE_MIN,
  buildInlineTripActions,
  getManifestStatusBadge,
  isActiveManifestTrip,
  isCompletedManifestTrip,
  isTripActionTerminal,
  getOnTimeStats,
  getTripCountdown,
} from './trips/MobileTripManifest';
import { getTripActionCapabilities } from './trips/tripActionPolicy';

const MANIFEST_EXCEPTION_STATUSES = new Set(['No Show', 'Rerouted', 'Cancelled']);

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

const buildNewTripDraft = (date) => ({ patient: '', bookingId: '', date, time: '', type: '', pickup: '', dropoff: '', patientPhone: '', clientPhone: '', pickupPhone: '', dropoffPhone: '', notes: '', driverId: '' });

const TripsPage = ({ trips = [], role, currentUser = '', drivers = [], selectedTasks = [], toggleTaskSelection = () => {}, onCreateLegMission, onBulkAssignTrips, onAssignTrip, onDriveTrip, onAddTrip, onUpdateTrip, onDeleteTrip, onShowUploadModal, requestAuthAction, hasPermission }) => {
  const getClientPhone = (trip) => resolveClientPhoneForTrip(trip, trips);
  const resolveDriverForTrip = React.useCallback((trip) => resolveTripDriver(trip, drivers), [drivers]);
  const today = useMemo(() => getTodayStr(), []);
  const [sortBy, setSortBy] = useState('time');
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [legsDetailPatient, setLegsDetailPatient] = useState(null);
  const [showAssign, setShowAssign] = useState(false);
  const [assignMode, setAssignMode] = useState('assign');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [assignmentFeedback, setAssignmentFeedback] = useState('');
  const feedbackTimerRef = React.useRef(null);

  React.useEffect(() => () => clearTimeout(feedbackTimerRef.current), []);
  const [newTrip, setNewTrip] = useState(() => buildNewTripDraft(today));
  const [savingCreate, setSavingCreate] = useState(false);
  const [createError, setCreateError] = useState('');
  const [editTrip, setEditTrip] = useState(null);
  const [saveAsProfile, setSaveAsProfile] = useState(false);
  const [manifestDate, setManifestDate] = useState(today);
  const [showAllDates, setShowAllDates] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [driverFilter, setDriverFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [layoutMode, setLayoutMode] = useState('list');
  const [groupBy, setGroupBy] = useState('driver');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [renderLimit, setRenderLimit] = useState(150);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  // Update-status modal (⋯ button): status + reason + note, wired to real
  // updates below. Replaces the generic action sheet for this manifest.
  const [detailModalTrip, setDetailModalTrip] = useState(null);
  const [modalForm, setModalForm] = useState({ status: '', reason: '', note: '' });
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [toastMessage, setToastMessage] = useState(null);
  const [scheduleEditTrip, setScheduleEditTrip] = useState(null);
  const [quickSmsTrip, setQuickSmsTrip] = useState(null);

  React.useEffect(() => {
    if (!toastMessage) return undefined;
    const timer = setTimeout(() => setToastMessage(null), 2000);
    return () => clearTimeout(timer);
  }, [toastMessage]);
  const showToast = (msg) => setToastMessage(msg);

  React.useEffect(() => {
    if (!detailModalTrip) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { setDetailModalTrip(null); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [detailModalTrip]);

  const activeFilterCount = [
    sortBy !== 'time',
    statusFilter !== 'all',
    driverFilter !== 'all',
    serviceFilter !== 'all',
    showAllDates,
    attentionOnly,
    layoutMode !== 'list',
    groupBy !== 'driver',
  ].filter(Boolean).length;

  const handleBulkAssign = (driverId) => {
    if (!canOperateTrips) return;
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
    if (!canOperateTrips) return;
    selectedTasks.forEach(tripId => {
      onAssignTrip(tripId, driverId);
    });
    setShowReassignModal(false);
    setAssignmentFeedback(`✓ Reassigned ${selectedTasks.length} trips`);
    clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setAssignmentFeedback(''), 3000);
  };

  const handleBulkUnassign = () => {
    if (!canOperateTrips) return;
    if (!window.confirm(`Unassign ${selectedTasks.length} trips?`)) return;
    selectedTasks.forEach(tripId => {
      onAssignTrip(tripId, '');
    });
    setAssignmentFeedback(`✓ Unassigned ${selectedTasks.length} trips`);
    clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setAssignmentFeedback(''), 3000);
  };

  const handleBulkDelete = () => {
    if (!canArchiveTrips) return;
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
      const resolvedDriverId = resolveDriverForTrip(trip)?.id || '';
      if (statusFilter !== 'all' && String(trip.status || '').trim().toLowerCase() !== statusFilter.toLowerCase()) return false;
      if (driverFilter === 'unassigned' && resolvedDriverId) return false;
      if (driverFilter !== 'all' && driverFilter !== 'unassigned' && resolvedDriverId !== driverFilter) return false;
      if (serviceFilter !== 'all' && (trip.type || trip.serviceType || '') !== serviceFilter) return false;
      if (attentionOnly) {
        const urgency = getManifestUrgency(trip);
        if (!(String(trip.status || '').trim().toLowerCase() === 'unassigned' || urgency === 'late' || urgency === 'soon')) return false;
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
    }), [trips, showAllDates, manifestDate, statusFilter, driverFilter, serviceFilter, attentionOnly, searchTerm, sortBy, resolveDriverForTrip]);

  // KPI layer — tappable summary driving an extra filter pass over the
  // existing filters (states above are untouched). Counts always come from
  // real filtered trips; the strip replaces the old static summary below.
  // NOTE: this block MUST stay above visibleTrips/groupedTrips (TDZ) — moving
  // it below crashes every render (portal outage, Sep 2026).
  const [kpiFilter, setKpiFilter] = useState('all');
  const [auditOpen, setAuditOpen] = useState(false);
  const kpiCounts = useMemo(() => ({
    total: filteredTrips.length,
    active: filteredTrips.filter(isActiveManifestTrip).length,
    done: filteredTrips.filter(isCompletedManifestTrip).length,
    pending: filteredTrips.filter((trip) => !resolveDriverForTrip(trip) || String(trip.status || '').trim().toLowerCase() === 'unassigned').length,
  }), [filteredTrips, resolveDriverForTrip]);
  const kpiFilteredTrips = useMemo(() => {
    if (kpiFilter === 'active') return filteredTrips.filter(isActiveManifestTrip);
    if (kpiFilter === 'done') return filteredTrips.filter(isCompletedManifestTrip);
    if (kpiFilter === 'pending') return filteredTrips.filter((trip) => !resolveDriverForTrip(trip) || String(trip.status || '').trim().toLowerCase() === 'unassigned');
    return filteredTrips;
  }, [filteredTrips, kpiFilter, resolveDriverForTrip]);
  // On-time metric — honest definition in getOnTimeStats (recorded data only,
  // missing timestamps excluded, null rate when nothing eligible).
  const onTimeStats = useMemo(() => getOnTimeStats(filteredTrips), [filteredTrips]);

  const visibleTrips = useMemo(() => kpiFilteredTrips.slice(0, renderLimit), [kpiFilteredTrips, renderLimit]);

  React.useEffect(() => {
    setRenderLimit(150);
  }, [showAllDates, manifestDate, searchTerm, statusFilter, driverFilter, serviceFilter, attentionOnly, sortBy, layoutMode, groupBy, kpiFilter]);

  const groupedTrips = useMemo(() => {
    const sections = new Map();
    visibleTrips.forEach((trip) => {
      let key = 'all';
      let label = 'Live Queue';
      let order = 0;
      if (groupBy === 'driver') {
        const driver = resolveDriverForTrip(trip);
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
  }, [groupBy, resolveDriverForTrip, visibleTrips]);

  const handleAssign = (driverId) => {
    if (!canOperateTrips) return;
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
    if (!canOperateTrips || !editTrip || savingEdit) return;
    setSavingEdit(true);
    try {
      const saved = await Promise.resolve(onUpdateTrip(editTrip));
      if (saved === false) throw new Error('The trip update was rejected.');
      if (saveAsProfile && editTrip.patient) {
        await saveClientProfile(editTrip.patient, editTrip, currentUser).catch(() => {});
      }
      setAssignmentFeedback(`✓ Trip ${editTrip.bookingId || editTrip.id} saved`);
      setEditTrip(null);
      setSaveAsProfile(false);
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
    if (!canCreateTrips || savingCreate) return;
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
    if (!canOperateTrips) return;
    if (isTripActionTerminal(trip)) {
      showToast('Restore this trip before editing it');
      return;
    }
    setEditTrip({ ...trip, time: toTimeInput(trip.time) });
    setSaveAsProfile(false);
  };

  // Status exceptions are separate from workflow completion. Completion stays
  // inside the persisted driver flow where odometer/signature requirements are
  // enforced; the manifest More sheet cannot manufacture a completed trip.
  const roleAccess = getTripActionCapabilities({ role, trip: { status: 'Assigned' }, hasAssignedDriver: true });
  const canOperateTrips = roleAccess.isOperator;
  const canCreateTrips = roleAccess.canCreate;
  const canUploadTrips = roleAccess.canUpload;
  const canArchiveTrips = roleAccess.canArchive;
  const hasExceptionPermission = typeof hasPermission === 'function'
    ? hasPermission(role, 'canDeleteTrip')
    : (role === 'admin' || role === 'dispatcher');
  const detailDriver = detailModalTrip ? resolveDriverForTrip(detailModalTrip) : null;
  const detailAccess = detailModalTrip
    ? getTripActionCapabilities({ role, trip: detailModalTrip, hasAssignedDriver: Boolean(detailDriver) })
    : null;
  const canEditDetail = Boolean(detailAccess?.canEdit && onUpdateTrip);
  const canMarkDetailException = Boolean(detailAccess?.canMarkException && hasExceptionPermission && onUpdateTrip);
  const canArchiveDetail = Boolean(detailAccess?.canArchive && onDeleteTrip);
  const canOpenDetailMenu = Boolean(detailAccess && (
    canEditDetail || canMarkDetailException || canArchiveDetail || detailAccess.canReassign || detailAccess.isTerminal
  ));

  const closeDetailModal = () => {
    setDetailModalTrip(null);
    setModalForm({ status: '', reason: '', note: '' });
    setModalError('');
  };

  const markTripException = (trip, status, meta = {}) => {
    if (!trip || !MANIFEST_EXCEPTION_STATUSES.has(status)) {
      setModalError('Choose an available exception status.');
      return;
    }
    const driver = resolveDriverForTrip(trip);
    const access = getTripActionCapabilities({ role, trip, hasAssignedDriver: Boolean(driver) });
    if (!access.canMarkException || !hasExceptionPermission || !onUpdateTrip) {
      setModalError('This status change is not available for your role.');
      return;
    }
    const apply = async () => {
      setModalSaving(true);
      setModalError('');
      try {
        const saved = await Promise.resolve(onUpdateTrip({
          ...trip,
          status,
          exceptionAt: new Date().toISOString(),
          exceptionBy: currentUser,
          exceptionSource: role,
          ...(meta.reason ? { cancellationReason: meta.reason } : {}),
          ...(meta.note ? { exceptionNote: meta.note } : {}),
        }));
        if (saved === false) throw new Error('The trip update was rejected.');
        closeDetailModal();
        showToast(`${trip.patient || 'Trip'} marked ${status}`);
      } catch (error) {
        setModalError(error?.message || 'The trip was not updated. Check the connection and retry.');
      } finally {
        setModalSaving(false);
      }
    };
    if (requestAuthAction) {
      requestAuthAction(`Mark ${trip.patient || 'trip'} as ${status}`, apply);
      return;
    }
    apply();
  };
  const submitStatusUpdate = () => {
    if (!detailModalTrip || modalSaving || !modalForm.status) return;
    markTripException(detailModalTrip, modalForm.status, {
      reason: modalForm.reason,
      note: modalForm.note.trim(),
    });
  };

  const renderManifestTripCard = (trip) => {
    const driver = resolveDriverForTrip(trip);
    const isSelected = selectedTasks.includes(trip.id);
    const isEditing = editTrip?.id === trip.id;
    const isTerminal = isTripActionTerminal(trip);
    const tripAccess = getTripActionCapabilities({ role, trip, hasAssignedDriver: Boolean(driver) });
    const canOpenTripMenu = Boolean(
      tripAccess.isTerminal
      || tripAccess.canEdit
      || tripAccess.canReassign
      || (tripAccess.canMarkException && hasExceptionPermission)
      || (tripAccess.canArchive && onDeleteTrip)
    );

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
            <div className={`${fieldClass} flex items-center justify-between`} aria-label={`Workflow status: ${editTrip.status || 'Unknown'}`}>
              <span className="text-slate-500">Workflow status</span>
              <span className={`rounded-lg px-2 py-1 ${getManifestStatusBadge(editTrip.status)}`}>{editTrip.status || 'Unknown'}</span>
            </div>
            <select value={editTrip.driverId || ''} onChange={event => setEditTrip(current => ({ ...current, driverId: event.target.value }))} className={fieldClass} aria-label="Driver">
              <option value="">Unassigned</option>
              {drivers.map(entry => <option key={entry.id} value={entry.id}>{entry.name} {entry.vehicle ? `(${entry.vehicle})` : ''}</option>)}
            </select>
            <input value={editTrip.clientPhone || editTrip.patientPhone || ''} onChange={event => setEditTrip(current => ({ ...current, clientPhone: event.target.value, patientPhone: event.target.value }))} className={fieldClass} placeholder="Client main phone" aria-label="Client main phone" />
            <input value={editTrip.pickupPhone || ''} onChange={event => setEditTrip(current => ({ ...current, pickupPhone: event.target.value }))} className={fieldClass} placeholder="Pickup location phone" aria-label="Pickup location phone" />
            <input value={editTrip.dropoffPhone || ''} onChange={event => setEditTrip(current => ({ ...current, dropoffPhone: event.target.value }))} className={fieldClass} placeholder="Dropoff location phone" aria-label="Dropoff location phone" />
            <div className="sm:col-span-2">
              <PlacesAutocompleteInput value={editTrip.pickup || ''} onChange={value => setEditTrip(current => ({ ...current, pickup: value }))} className={fieldClass} placeholder="Pickup address" required />
            </div>
            <div className="sm:col-span-2">
              <PlacesAutocompleteInput value={editTrip.dropoff || ''} onChange={value => setEditTrip(current => ({ ...current, dropoff: value }))} className={fieldClass} placeholder="Dropoff address" required />
            </div>
            <textarea value={editTrip.notes || ''} onChange={event => setEditTrip(current => ({ ...current, notes: event.target.value }))} className={`${fieldClass} sm:col-span-2 xl:col-span-4`} rows="2" placeholder="Notes" aria-label="Notes" />
            <label className={`sm:col-span-2 xl:col-span-4 flex items-center gap-2 cursor-pointer rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600`}>
              <input type="checkbox" checked={saveAsProfile} onChange={e => setSaveAsProfile(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              Save as client default for future trips
            </label>
          </div>
        </form>
      );
    }

    // Role-gated inline bar — mirrors TripActionCenter gates (canOperate,
    // terminal statuses). Drivers never see assign/reassign/remove; those stay
    // dispatcher/admin-only. Everything else lives in the ⋯ sheet.
    const countdown = getTripCountdown(trip);
    const legsCount = filteredTrips.filter((entry) => (entry.patient || '').toLowerCase() === (trip.patient || '').toLowerCase()).length;
    const inline = buildInlineTripActions({
      trip,
      driver,
      role,
      callbacks: {
        phone: getClientPhone(trip),
        onDrive: (trip) => { if (driver) onDriveTrip?.(trip); else handleAssignClick(); },
        onAssign: () => handleAssignClick(),
        onReassign: () => handleReassignClick(),
        onArchive: (trip) => onDeleteTrip?.(trip.id),
        onNavigate: (trip) => openNavigation(trip.pickup || ''),
        onCall: (trip) => makeCall(getClientPhone(trip), trip.patient),
        onMessage: (trip) => setQuickSmsTrip(trip),
      },
    });
    const ICONS = { navigate: Navigation, call: Phone, message: MessageSquare };

    return (
      <div key={trip.id} className={`rounded-xl transition-all ${isSelected ? 'ring-2 ring-blue-300' : countdown.level === 'overdue' ? 'ring-1 ring-rose-200' : ''}`}>
      <ManifestTripCard
        trip={trip}
        countdown={countdown}
        legs={legsCount}
        onLegsClick={() => setLegsDetailPatient(trip.patient)}
        mileage={trip.distance ? (/\bmi$/i.test(String(trip.distance).trim()) ? String(trip.distance).trim() : `${trip.distance} mi`) : null}
        selectSlot={canOperateTrips && (bulkSelectMode || selectedTasks.length > 0) ? (
          <button type="button" onClick={() => toggleTaskSelection(trip.id)} aria-label={`${isSelected ? 'Deselect' : 'Select'} trip for ${trip.patient || trip.bookingId || 'trip'}`} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-blue-600">
            {isSelected ? <CheckSquare size={19} /> : <Square size={19} className="text-slate-400" />}
          </button>
        ) : null}
        noteSlot={null}
        primaryAction={inline.primary ? { label: inline.primary.label, onClick: () => inline.primary.onSelect() } : null}
        iconActions={inline.icons.map((action) => ({ ...action, icon: ICONS[action.id], onClick: () => action.onSelect() }))}
        driverName={driver ? driver.name : 'Unassigned'}
        reassignAction={inline.reassign ? { onClick: () => inline.reassign.onSelect() } : null}
        archiveAction={inline.archive ? { onClick: () => inline.archive.onSelect() } : null}
        moreIcon={MoreHorizontal}
        onMore={canOpenTripMenu ? () => {
          setDetailModalTrip(trip);
          setModalForm({ status: '', reason: '', note: '' });
          setModalError('');
        } : null}
        moreLabel={`${isTerminal ? 'Review' : 'Update'} ${trip.patient || trip.bookingId || 'trip'}`}
        onTimeEdit={(t) => setScheduleEditTrip(t)}
        onCardClick={(t) => {
          setDetailModalTrip(t);
          setModalForm({ status: '', reason: '', note: '' });
          setModalError('');
        }}
      />
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-2 pb-24">
      {toastMessage && (
        <div role="status" aria-live="polite" className="absolute top-10 left-4 right-4 z-50 flex items-center gap-1.5 bg-slate-900/95 text-white px-3 py-2 rounded-lg shadow-xl text-xs">
          <Zap size={14} className="text-amber-400" />
          <span className="font-semibold">{toastMessage}</span>
        </div>
      )}
      {/* Assignment Success Feedback */}
      {assignmentFeedback && (
        <div role="status" aria-live="polite" className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50 animate-in">
          <div className="bg-emerald-600 text-white px-6 py-4 rounded-xl font-semibold text-base shadow-xl shadow-emerald-500/30 flex items-center gap-2">
            <Check size={20} /> {assignmentFeedback}
          </div>
        </div>
      )}
      {/* The overflow sheet exposes only capabilities allowed for this role and
          record. Terminal records remain review/archive-only. */}
      {detailModalTrip && canOpenDetailMenu && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={isTripActionTerminal(detailModalTrip) ? 'Review trip record' : 'Update trip status'}>
          <div className="bg-white w-full max-w-sm rounded-3xl p-4 shadow-2xl space-y-3">
            <div className="flex justify-between items-center border-b pb-2 border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">{isTripActionTerminal(detailModalTrip) ? 'Trip record' : 'Update status'}</h3>
              <button onClick={closeDetailModal} aria-label="Close trip actions" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><X size={16} /></button>
            </div>

            {isTripActionTerminal(detailModalTrip) ? (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{detailModalTrip.patient || 'Trip'}</span>
                    <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ${getManifestStatusBadge(detailModalTrip.status)}`}>{detailModalTrip.status}</span>
                  </div>
                  <p className="mt-2 text-xs font-medium text-slate-600">Terminal trips are read-only. Review the recorded progress or restore the trip before changing it.</p>
                </div>
                {resolveDriverForTrip(detailModalTrip) && onDriveTrip && (
                  <button
                    type="button"
                    onClick={() => { const trip = detailModalTrip; setDetailModalTrip(null); onDriveTrip(trip); }}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-bold text-white"
                  >
                    <Navigation size={17} /> Review trip progress
                  </button>
                )}
                {canArchiveDetail && (
                  <button
                    type="button"
                    onClick={() => { const tripId = detailModalTrip.id; closeDetailModal(); onDeleteTrip(tripId); }}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700"
                  >
                    <Archive size={17} /> Archive record
                  </button>
                )}
              </>
            ) : (
              <>
            {canMarkDetailException && <div className="grid grid-cols-1 gap-2 mb-1 min-[340px]:grid-cols-3" role="group" aria-label="Trip exception status">
              {[
                { value: 'No Show', label: 'No show' },
                { value: 'Rerouted', label: 'Trip rerouted' },
                { value: 'Cancelled', label: 'Trip cancelled' },
              ].map((st) => {
                const isSelected = modalForm.status === st.value;
                let btnClass = '';
                if (isSelected) {
                  if (st.value === 'No Show') btnClass = 'bg-orange-500 text-white border-orange-600 shadow-inner';
                  if (st.value === 'Rerouted') btnClass = 'bg-purple-600 text-white border-purple-700 shadow-inner';
                  if (st.value === 'Cancelled') btnClass = 'bg-slate-700 text-white border-slate-800 shadow-inner';
                } else {
                  if (st.value === 'No Show') btnClass = 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100';
                  if (st.value === 'Rerouted') btnClass = 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100';
                  if (st.value === 'Cancelled') btnClass = 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100';
                }
                return (
                  <button
                    key={st.value}
                    type="button"
                    onClick={() => setModalForm((prev) => ({ ...prev, status: st.value }))}
                    aria-pressed={isSelected}
                    className={`min-h-11 px-2 rounded-xl text-xs font-semibold border transition-all ${btnClass}`}
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>}

            {canMarkDetailException && <select
              value={modalForm.reason}
              onChange={(e) => setModalForm((prev) => ({ ...prev, reason: e.target.value }))}
              className="min-h-11 w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl px-2 py-2 outline-none focus:border-slate-400"
              aria-label="Status reason"
            >
              <option value="">Select Reason (Optional)</option>
              <option value="Heavy Traffic">Heavy Traffic</option>
              <option value="Client Delay">Client Delay</option>
              <option value="Vehicle Issue">Vehicle Issue</option>
              <option value="Weather Conditions">Weather Conditions</option>
              <option value="Other">Other</option>
            </select>}

            {canMarkDetailException && <textarea
              placeholder="Add a note... (Optional)"
              value={modalForm.note}
              onChange={(e) => setModalForm((prev) => ({ ...prev, note: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl px-2 py-2 h-16 resize-none outline-none focus:border-slate-400"
              aria-label="Status note"
            />}

            {modalError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{modalError}</div>}

            {canMarkDetailException && <button
              type="button"
              onClick={submitStatusUpdate}
              disabled={!modalForm.status || modalSaving}
              className="min-h-11 w-full bg-slate-900 disabled:bg-slate-400 disabled:cursor-not-allowed text-white py-2 rounded-xl text-sm font-bold mt-1 transition-colors"
            >
              {modalSaving ? 'Saving…' : 'Confirm exception'}
            </button>}
            {detailAccess?.canReassign && <button
              type="button"
              onClick={() => {
                const trip = detailModalTrip;
                closeDetailModal();
                setSelectedTrip(trip);
                setAssignMode('reassign');
                setShowReassignModal(true);
              }}
              className="min-h-11 w-full rounded-xl border border-amber-200 bg-amber-50 text-center text-xs font-bold text-amber-700"
            >
              Reassign driver
            </button>}
            {canArchiveDetail && <button
              type="button"
              onClick={() => { const tripId = detailModalTrip.id; closeDetailModal(); onDeleteTrip(tripId); }}
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 text-center text-xs font-bold text-slate-700"
            >
              Archive trip
            </button>}
            {canEditDetail && <button
              type="button"
              onClick={() => { const t = detailModalTrip; setDetailModalTrip(null); setModalForm({ status: '', reason: '', note: '' }); openEdit(t); }}
              className="min-h-11 w-full rounded-xl text-center text-xs font-bold text-blue-600 hover:bg-blue-50"
            >
              Edit full details instead
            </button>}
              </>
            )}
          </div>
        </div>
      )}
      {/* HEADER CONTROLS — 44px mobile buttons kept here (filters/upload/new).
          Manifest cards + manifest modals below follow the approved compact
          manifest design instead (exact small buttons); the min-height rule is
          intentionally scoped to this chrome, not the page root. */}
      <div className="card p-4 sm:p-6 space-y-4 max-md:[&_button]:min-h-11">
        <div className="flex gap-2 md:hidden">
          <button
            type="button"
            aria-expanded={mobileFiltersOpen}
            aria-controls="mobile-manifest-filters"
            onClick={() => setMobileFiltersOpen((open) => !open)}
            className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 text-left text-sm font-bold text-slate-700"
          >
            <span className="flex min-w-0 items-center gap-2">
              <SlidersHorizontal size={17} className="shrink-0 text-blue-600" />
              <span className="truncate">Filters · {manifestDate}</span>
              {activeFilterCount > 0 && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] text-white">{activeFilterCount}</span>}
            </span>
            <ChevronDown size={16} className={`shrink-0 transition-transform ${mobileFiltersOpen ? 'rotate-180' : ''}`} />
          </button>
          {canOperateTrips && (
            <button
              type="button"
              aria-pressed={bulkSelectMode}
              onClick={() => {
                if (bulkSelectMode) selectedTasks.forEach((tripId) => toggleTaskSelection(tripId));
                setBulkSelectMode((active) => !active);
              }}
              className={`min-w-11 rounded-xl px-3 text-sm font-bold ${bulkSelectMode ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600'}`}
              title={bulkSelectMode ? 'Exit trip selection' : 'Select trips'}
              aria-label={bulkSelectMode ? 'Exit trip selection' : 'Select trips'}
            >
              <CheckSquare size={16} className="inline" />
            </button>
          )}
          {canUploadTrips && onShowUploadModal && (
            <button
              type="button"
              onClick={() => onShowUploadModal(true)}
              className="rounded-xl bg-blue-500 px-3 text-sm font-bold text-white shadow-sm shadow-blue-500/20 active:scale-95 transition-transform"
              title="Upload CSV or scan trips"
            >
              <Upload size={16} className="inline" />
            </button>
          )}
          {canCreateTrips && <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white shadow-sm shadow-emerald-500/20 active:scale-95 transition-transform"
          >
            <Plus size={16} className="inline" /> New
          </button>}
        </div>

        <div id="mobile-manifest-filters" className={`${mobileFiltersOpen ? 'space-y-4' : 'hidden'} md:block md:space-y-4`}>
        {/* First Row: Main Filters (driver lives in the chips row above) */}
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
              <option value="No Show">No Show</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Rerouted">Rerouted</option>
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
            <button onClick={() => setShowCreateForm(true)} className={`${canCreateTrips ? 'hidden md:block' : 'hidden'} flex-1 px-3 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold text-sm uppercase`}>
              <Plus size={14} className="inline mr-1" /> New
            </button>
          </div>
        </div>
        </div>

        {/* Bulk Actions - Only show when items selected */}
        {canOperateTrips && selectedTasks.length > 0 && (
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
            {canArchiveTrips && <button onClick={handleBulkDelete} className="px-3 py-2 bg-rose-600 text-white rounded-lg font-bold text-xs uppercase hover:bg-rose-700 ml-auto">
              <Archive size={12} className="inline mr-1" /> Archive
            </button>}
          </div>
        )}
      </div>

      {/* KPI strip — tappable queue summary wired to the kpiFilter layer.
          Replaces the former static summary; counts are real filtered trips.
          The data-testid is pinned by GlobalPageTableContract — keep it. */}
      <div data-testid="trip-manifest-summary" aria-label="Trip manifest summary">
      <ManifestKpiStrip
        items={[
          { id: 'all', label: 'All', value: kpiCounts.total, active: kpiFilter === 'all', activeClass: 'bg-slate-800 border-slate-800 text-white', onSelect: () => { setKpiFilter('all'); showToast('Viewing all trips'); } },
          { id: 'active', label: 'Active', value: kpiCounts.active, active: kpiFilter === 'active', activeClass: 'bg-blue-50 border-blue-400 text-blue-700', onSelect: () => { const next = kpiFilter === 'active' ? 'all' : 'active'; setKpiFilter(next); showToast(next === 'all' ? 'Cleared active filter' : 'Filtered: active trips'); } },
          { id: 'done', label: 'Done', value: kpiCounts.done, active: kpiFilter === 'done', activeClass: 'bg-emerald-50 border-emerald-400 text-emerald-700', onSelect: () => { const next = kpiFilter === 'done' ? 'all' : 'done'; setKpiFilter(next); showToast(next === 'all' ? 'Cleared done filter' : 'Filtered: completed'); } },
          { id: 'pending', label: 'Pending', value: kpiCounts.pending, active: kpiFilter === 'pending', activeClass: 'bg-rose-50 border-rose-400 text-rose-700', onSelect: () => { const next = kpiFilter === 'pending' ? 'all' : 'pending'; setDriverFilter('all'); setKpiFilter(next); showToast(next === 'all' ? 'Viewing all fleet' : 'Viewing unassigned queue'); } },
          { id: 'ontime', label: 'On-time', value: onTimeStats.rate === null ? '—' : `${onTimeStats.rate}%`, wide: true, valueClass: 'text-slate-900', onSelect: () => setAuditOpen(true) },
        ]}
      />
      </div>

      {/* On-time audit — real late arrivals only (completed + both timestamps).
          Empty/insufficient-data states explain instead of inventing. */}
      {auditOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="On-time audit">
          <div className="absolute inset-0 bg-slate-950/60" onClick={() => setAuditOpen(false)} />
          <div className="relative max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
            <div className="mb-3 text-center">
              <p className="text-4xl font-bold tabular-nums text-emerald-600">{onTimeStats.rate === null ? '—' : `${onTimeStats.rate}%`}</p>
              <h3 className="mt-1 text-base font-bold text-slate-900">On-time arrivals</h3>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {onTimeStats.eligible === 0
                  ? 'No completed trips with both scheduled and arrival times in scope.'
                  : `${onTimeStats.eligible - onTimeStats.lateTrips.length} of ${onTimeStats.eligible} arrived within ${ON_TIME_GRACE_MIN} min of scheduled.`}
              </p>
            </div>
            {onTimeStats.lateTrips.length > 0 && (
              <ul className="space-y-1.5">
                {onTimeStats.lateTrips.slice(0, 20).map(({ trip, lateBy }) => (
                  <li key={trip.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="min-w-0 truncate text-xs font-bold text-slate-800">{trip.patient || trip.bookingId || 'Trip'}</span>
                    <span className="shrink-0 text-xs font-bold tabular-nums text-rose-600">+{lateBy}m</span>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => setAuditOpen(false)} className="mt-4 min-h-11 w-full rounded-xl bg-slate-100 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200 active:scale-95">Dismiss</button>
          </div>
        </div>
      )}

      {/* Driver chips — quick queue filter. drivers prop is pre-scoped by role
          (App.jsx driverWorkDrivers), so chips never leak out-of-scope drivers.
          Replaces the old driver dropdown in the filter panel below. */}
      <section aria-label="Filter by driver" className="bg-white px-3 py-2 border-b border-slate-200 shrink-0 shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
          {[
            { id: 'all', name: 'All', count: filteredTrips.length, dot: 'bg-blue-400' },
            ...drivers.map((driver) => {
              const mine = filteredTrips.filter((t) => resolveDriverForTrip(t)?.id === driver.id);
              const live = mine.some(isActiveManifestTrip);
              return {
                id: driver.id,
                name: driver.name || 'Driver',
                count: mine.length,
                dot: live ? 'bg-emerald-400' : 'bg-slate-300',
              };
            }),
            {
              id: 'unassigned',
              name: 'Wait pool',
              count: filteredTrips.filter((t) => !resolveDriverForTrip(t) || String(t.status || '').trim().toLowerCase() === 'unassigned').length,
              dot: 'bg-rose-400',
            },
          ].map((chip) => {
            const selected = driverFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setDriverFilter(selected ? 'all' : chip.id)}
                aria-pressed={selected}
                className={`flex min-h-11 items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium whitespace-nowrap shrink-0 ${
                  selected ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${chip.dot}`} aria-hidden="true" />
                {chip.name}
                <span className={`text-xs tabular-nums ${selected ? 'text-slate-300' : 'text-slate-400'}`}>({chip.count})</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* LIST — flat queue by default (grouped sections stay available via
          the layout control in filters). Shows kpi-filtered trips. */}
      <div>
        <div>
          {kpiFilteredTrips.length === 0 ? (
            <div className="bg-white rounded-lg p-6 text-center border border-slate-200 shadow-sm mt-2">
              <Filter size={24} className="mx-auto text-slate-400 mb-2" />
              <p className="text-base font-medium text-slate-600">No trips found</p>
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
              <div className="space-y-2">
                {visibleTrips.map((trip) => renderManifestTripCard(trip))}
              </div>
            )
          )}
        </div>
        {kpiFilteredTrips.length > visibleTrips.length && (
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
      {showCreateForm && canCreateTrips && (
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
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">Client Main Phone</label>
                  <input type="tel" value={newTrip.patientPhone} onChange={(e) => setNewTrip({...newTrip, patientPhone: e.target.value, clientPhone: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-base focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">Pickup Location Phone</label>
                  <input type="tel" value={newTrip.pickupPhone} onChange={(e) => setNewTrip({...newTrip, pickupPhone: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-base focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">Dropoff Location Phone</label>
                  <input type="tel" value={newTrip.dropoffPhone} onChange={(e) => setNewTrip({...newTrip, dropoffPhone: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-base focus:border-blue-500 outline-none" />
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
      {showAssign && canOperateTrips && (
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
      {showReassignModal && canOperateTrips && (
        <div className="fixed inset-0 z-[110] bg-slate-900/40 flex items-end justify-center sm:items-center sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-4 shadow-2xl space-y-3">
            <div className="flex justify-between items-center border-b pb-2 border-slate-100">
              <h3 className="text-base font-bold">Reassign to...</h3>
              <button onClick={() => setShowReassignModal(false)} aria-label="Close reassign" className="flex min-h-11 min-w-11 items-center justify-center bg-slate-100 rounded-xl text-slate-500"><X size={16} /></button>
            </div>
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              {drivers.map(d => {
                const isCurrent = selectedTrip && selectedTrip.driverId === d.id;
                return (
                  <button
                    key={d.id}
                    disabled={isCurrent}
                    onClick={() => {
                      if (selectedTasks.length > 0) {
                        handleBulkReassign(d.id);
                      } else if (selectedTrip) {
                        handleAssign(d.id);
                        setShowReassignModal(false);
                      }
                    }}
                    className="min-h-11 w-full flex items-center justify-between p-2 rounded-xl border border-slate-200 bg-white text-left disabled:opacity-50 disabled:bg-slate-50"
                  >
                    <div>
                      <div className="text-sm font-bold text-slate-800">{d.name}</div>
                      <div className="text-[10px] text-slate-500">{d.vehicle || '—'}</div>
                    </div>
                    <div className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">Assign</div>
                  </button>
                );
              })}
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

      {scheduleEditTrip && (
        <ScheduleEditorModal
          trip={scheduleEditTrip}
          onSave={(payload) => {
            onUpdateTrip?.(scheduleEditTrip.id, payload);
            setScheduleEditTrip(null);
            showToast('Schedule updated');
          }}
          onClose={() => setScheduleEditTrip(null)}
        />
      )}

      {quickSmsTrip && (
        <AdminQuickSmsSheet
          trip={quickSmsTrip}
          onSend={async (text) => {
            const { getFunctions, httpsCallable } = await import('firebase/functions');
            const sendClientSms = httpsCallable(getFunctions(), 'sendClientSms');
            await sendClientSms({ to: quickSmsTrip.patientPhone || quickSmsTrip.phone || quickSmsTrip.clientPhone || '', body: text, tripId: quickSmsTrip.id });
          }}
          onClose={() => setQuickSmsTrip(null)}
        />
      )}
    </div>
  );
};

export default TripsPage;
