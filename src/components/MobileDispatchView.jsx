import { useState, useMemo, useEffect, useRef } from "react";
import { Search, Plus, Upload, Route, Users, Truck, MapPin, Phone, X, Edit2, Ban, Repeat, MessageSquare, SlidersHorizontal, ChevronRight, XCircle, Play, UserCheck, MoreHorizontal, Navigation, Check, Copy } from "lucide-react";
import { getDriverLiveStatus } from "../constants/statuses";
import { tripCalendarDateKey, localCalendarYmd } from "../utils/tripDate";
import { tripMatchesSearch } from "../utils/search";
import { resolveClientPhoneForTrip } from "../utils/clientPhoneResolution";
import { saveClientProfile } from "../utils/clientProfileUtils";
import { openNavigation } from "../utils/nativeActions";
import AdminQuickSmsSheet from "./trips/AdminQuickSmsSheet";
import ScheduleEditorModal from "./trips/ScheduleEditorModal";
import { TripOptionsModal } from "./shared";
import { ManifestTripCard, getTripCountdown } from "./trips/MobileTripManifest";

/* ─── Helpers ─────────────────────────────────────────────────────── */
const timeToMinutes = (t) => {
  if (!t) return 1440;
  const s = String(t).toUpperCase().trim();
  if (s === "WILL CALL" || s === "WC") return 1440;
  const m = s.match(/(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?/);
  if (!m) return 1440;
  let h = parseInt(m[1], 10), min = parseInt(m[2] || "0", 10);
  const p = m[3];
  if (p === "PM" && h < 12) h += 12;
  if (p === "AM" && h === 12) h = 0;
  return h * 60 + min;
};

const to12hr = (time) => {
  if (!time || time === "Will Call") return "Will Call";
  const m = String(time).match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
  if (!m) return time;
  let h = parseInt(m[1]);
  const min = m[2] || "00", p = m[3]?.toUpperCase();
  const ampm = p || (h >= 12 ? "PM" : "AM");
  h = h % 12 || 12;
  return h + ":" + min + " " + ampm;
};

const getUrgency = (trip) => {
  const mins = timeToMinutes(trip?.time);
  if (mins === 1440) return null;
  const now = new Date(), sched = new Date();
  sched.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  const diff = sched - now;
  if (diff < 0) return "Late";
  const dm = Math.round(diff / 60000);
  if (dm <= 60) return "in " + dm + "m";
  return null;
};

const TERMINAL = ["Completed", "Cancelled", "No Show", "Rerouted"];
const IN_PROGRESS = ["In Mission","En Route","At Pickup","At Dropoff","In Progress",
  "Navigating Pickup","Navigating Dropoff","In Transit","Arrived","Assigned"];

const getStatusConfig = (status) => {
  if (status === "Unassigned") return { bg: "bg-rose-500", text: "text-rose-700", pill: "bg-rose-100 text-rose-700 border-rose-200", dot: "bg-rose-500" };
  if (status === "Assigned") return { bg: "bg-blue-500", text: "text-blue-700", pill: "bg-blue-100 text-blue-700 border-blue-200", dot: "bg-blue-500" };
  if (IN_PROGRESS.includes(status)) return { bg: "bg-amber-500", text: "text-amber-700", pill: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-500" };
  if (status === "Completed") return { bg: "bg-emerald-500", text: "text-emerald-700", pill: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" };
  if (status === "Cancelled") return { bg: "bg-slate-400", text: "text-slate-500", pill: "bg-slate-100 text-slate-500 border-slate-200", dot: "bg-slate-400" };
  if (status === "No Show") return { bg: "bg-orange-500", text: "text-orange-700", pill: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-500" };
  return { bg: "bg-slate-400", text: "text-slate-700", pill: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-400" };
};

const trunc = (str, n) => str && str.length > n ? str.slice(0, n) + "…" : str || "";
const getAddr = (v) => typeof v === "object" ? v?.address || "" : v || "";

/* ─── Admin Trip Card ─────────────────────────────────────────────── */
const AdminTripCard = ({ trip, allTrips, drivers, onOpenTripDetails, onOpenTripWorkflow, assignTripToDriver, makeCall, sendSMS, updateTrip, requestAuthAction, currentUser, addToast, role, onTimeEdit, onQuickSms, requestDeleteTrip, onSendToPlan, isSelected = false, onSelect = null }) => {
  const [showActions, setShowActions] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [saveAsProfile, setSaveAsProfile] = useState(false);
  const [draft, setDraft] = useState(() => ({ ...trip, pickup: getAddr(trip.pickup), dropoff: getAddr(trip.dropoff) }));
  const statusCfg = getStatusConfig(trip.status);
  const urgency = getUrgency(trip);
  const driver = drivers.find(d => d.id === trip.driverId || (trip.driverName && d.name === trip.driverName));
  const clientPhone = resolveClientPhoneForTrip(trip, allTrips);
  const isTerminal = TERMINAL.includes(trip.status);
  const isActive = IN_PROGRESS.includes(trip.status);
  const pickup = getAddr(trip.pickup);
  const dropoff = getAddr(trip.dropoff);
  const timeLabel = trip.time === "Will Call" || !trip.time ? "Will Call" : to12hr(trip.time);
  const legsCount = (allTrips || []).filter(t => (t.patient || '').toLowerCase() === (trip.patient || '').toLowerCase()).length;

  const markException = (status, notes = '') => {
    const run = () => {
      if (updateTrip) {
        updateTrip(trip.id, {
          status,
          workflowUpdatedAt: new Date().toISOString(),
          updatedBy: currentUser,
          exceptionAt: new Date().toISOString(),
          exceptionBy: currentUser,
          exceptionSource: role,
          ...(notes ? { notes: trip.notes ? `${trip.notes}\n[${status}]: ${notes}` : `[${status}]: ${notes}` } : {}),
        });
      }
      addToast?.("Trip Updated", `${trip.patient || trip.id} marked as ${status}.`, "warning");
      setShowActions(false);
    };
    if (requestAuthAction) {
      requestAuthAction(`Mark ${trip.patient || "trip"} as ${status}`, run);
    } else {
      run();
    }
  };

  const availableDrivers = drivers.filter(d => !["Offline","Unavailable"].includes(d.status));

  const handleQuickAssign = (e) => {
    e.stopPropagation();
    if (!assignTripToDriver) return;
    if (driver) {
      // Already assigned — show reassign sheet via actions
      setShowActions(true);
      return;
    }
    if (availableDrivers.length === 1) {
      assignTripToDriver(trip.id, availableDrivers[0].id);
      addToast?.("Trip Assigned", `Assigned to ${availableDrivers[0].name}`, "success");
    } else {
      setShowActions(true);
    }
  };

  const saveInline = async (event) => {
    event.preventDefault();
    if (!updateTrip || saving) return;
    setSaving(true);
    setEditError('');
    try {
      const saved = await Promise.resolve(updateTrip(trip.id, draft));
      if (saved === false) throw new Error('The trip update was rejected.');
      if (saveAsProfile && draft.patient) {
        await saveClientProfile(draft.patient, draft, currentUser).catch(() => {});
      }
      setEditing(false);
      setSaveAsProfile(false);
      setShowActions(false);
      addToast?.('Trip Updated', `${draft.patient || trip.id} saved.`, 'success');
    } catch (error) {
      setEditError(error?.message || 'Trip was not saved.');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    const fieldClass = 'w-full rounded-lg border border-blue-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600';
    return (
      <form onSubmit={saveInline} className="w-full rounded-xl border-2 border-blue-400 bg-blue-50/50 p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-blue-700">Editing this card</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setEditing(false); setEditError(''); }} disabled={saving} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input autoFocus value={draft.patient || ''} onChange={event => setDraft(current => ({ ...current, patient: event.target.value }))} className={fieldClass} placeholder="Passenger" aria-label="Passenger" />
          <input value={draft.bookingId || ''} onChange={event => setDraft(current => ({ ...current, bookingId: event.target.value }))} className={fieldClass} placeholder="Booking ID" aria-label="Booking ID" />
          <input type="date" value={draft.date || ''} onChange={event => setDraft(current => ({ ...current, date: event.target.value }))} className={fieldClass} aria-label="Service date" />
          <input value={draft.time || ''} onChange={event => setDraft(current => ({ ...current, time: event.target.value }))} className={fieldClass} placeholder="Scheduled time" aria-label="Scheduled time" />
          <select value={draft.driverId || ''} onChange={event => setDraft(current => ({ ...current, driverId: event.target.value }))} className={fieldClass} aria-label="Driver">
            <option value="">Unassigned</option>
            {drivers.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
          <select value={draft.status || ''} onChange={event => setDraft(current => ({ ...current, status: event.target.value }))} className={fieldClass} aria-label="Status">
            {['Unassigned', 'Assigned', 'Navigating Pickup', 'At Pickup', 'In Transit', 'At Dropoff', 'Completed', 'No Show', 'Cancelled', 'Rerouted'].map(status => <option key={status} value={status}>{status}</option>)}
          </select>
          <textarea value={draft.pickup || ''} onChange={event => setDraft(current => ({ ...current, pickup: event.target.value }))} className={`${fieldClass} col-span-2`} rows="2" placeholder="Pickup address" aria-label="Pickup address" />
          <textarea value={draft.dropoff || ''} onChange={event => setDraft(current => ({ ...current, dropoff: event.target.value }))} className={`${fieldClass} col-span-2`} rows="2" placeholder="Dropoff address" aria-label="Dropoff address" />
          <input value={draft.clientPhone || draft.patientPhone || ''} onChange={event => setDraft(current => ({ ...current, clientPhone: event.target.value, patientPhone: event.target.value }))} className={fieldClass} placeholder="Client main phone" aria-label="Client main phone" />
          <input value={draft.pickupPhone || ''} onChange={event => setDraft(current => ({ ...current, pickupPhone: event.target.value }))} className={fieldClass} placeholder="Pickup location phone" aria-label="Pickup location phone" />
          <input value={draft.dropoffPhone || ''} onChange={event => setDraft(current => ({ ...current, dropoffPhone: event.target.value }))} className={fieldClass} placeholder="Dropoff location phone" aria-label="Dropoff location phone" />
          <textarea value={draft.notes || ''} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} className={`${fieldClass} col-span-2`} rows="2" placeholder="Notes" aria-label="Notes" />
          <label className={`${fieldClass} col-span-2 flex items-center gap-2 cursor-pointer rounded-lg border border-slate-100 bg-slate-50`}>
            <input type="checkbox" checked={saveAsProfile} onChange={e => setSaveAsProfile(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            Save as client default for future trips
          </label>
        </div>
        {editError && <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-xs font-semibold text-rose-700">{editError}</p>}
      </form>
    );
  }

  return (
    <>
      <div className={`mb-1.5 rounded-xl [&_button]:!min-h-0 max-md:[&_button]:!min-h-0 ${isSelected ? 'ring-2 ring-blue-500 shadow-sm' : ''}`}>
        <ManifestTripCard
          trip={trip}
          countdown={getTripCountdown(trip)}
          mileage={trip.distance || trip.mileage ? `${trip.distance || trip.mileage}${String(trip.distance || trip.mileage).includes('mi') ? '' : ' mi'}` : null}
          selected={isSelected}
          onSelect={onSelect ? () => onSelect(trip) : undefined}
          selectSlot={onSelect ? (
            <button
              type="button"
              role="checkbox"
              aria-checked={!!isSelected}
              onClick={(e) => { e.stopPropagation(); onSelect(); }}
              aria-label={`${isSelected ? 'Deselect' : 'Select'} trip for ${trip.patient || trip.bookingId || 'trip'}`}
              className="shrink-0 !w-5 !h-5 !min-h-0 rounded-md border-2 flex items-center justify-center transition-colors cursor-pointer"
              style={isSelected ? { backgroundColor: '#2563eb', borderColor: '#2563eb' } : { borderColor: '#cbd5e1', backgroundColor: 'white' }}
            >
              {isSelected ? (
                <div className="w-full h-full bg-blue-600 border-blue-600 flex items-center justify-center rounded-[3px]">
                  <Check size={11} className="text-white" strokeWidth={3} />
                </div>
              ) : null}
            </button>
          ) : null}
          driverName={driver?.name || trip.driverName || 'Unassigned'}
          iconActions={[
            clientPhone && { id: 'call', onClick: () => makeCall?.(clientPhone, trip.patient) },
            clientPhone && { id: 'message', onClick: () => (onQuickSms ? onQuickSms(trip) : sendSMS?.(clientPhone, trip.patient)) },
          ].filter(Boolean)}
          moreIcon={MoreHorizontal}
          onMore={() => setShowActions(true)}
          onTimeEdit={onTimeEdit ? () => onTimeEdit(trip) : undefined}
          onCardClick={() => (onOpenTripDetails ? onOpenTripDetails(trip) : onOpenTripWorkflow?.(trip))}
        />
      </div>

      {/* AUTHORITATIVE SHARED TRIP OPTIONS MODAL */}
      <TripOptionsModal
        isOpen={showActions}
        onClose={() => setShowActions(false)}
        trip={trip}
        driverName={driver?.name || trip.driverName || 'Driver'}
        role={role}
        isAdmin={role === 'admin' || role === 'dispatcher'}
        isDriver={role === 'driver'}
        isDispatcher={role === 'dispatcher'}
        onEditDetails={(t) => {
          setDraft({ ...t, pickup: getAddr(t.pickup), dropoff: getAddr(t.dropoff) });
          setEditing(true);
          setShowActions(false);
        }}
        onReassign={() => {
          setShowActions(false);
          setShowReassign(true);
        }}
        onSendToPlan={onSendToPlan ? (t) => {
          onSendToPlan(t);
          setShowActions(false);
        } : null}
        onComplete={() => {
          markException("Completed");
          setShowActions(false);
        }}
        onRerouted={(t, reason, notes) => {
          markException("Rerouted", notes || reason);
          setShowActions(false);
        }}
        onNoShow={(t, reason, notes) => {
          markException("No Show", notes || reason);
          setShowActions(false);
        }}
        onCancel={(t, reason, notes) => {
          markException("Cancelled", notes || reason);
          setShowActions(false);
        }}
        onArchive={(t) => {
          requestDeleteTrip?.(t.id, t.patient || 'trip');
          setShowActions(false);
        }}
      />

      {/* REASSIGN MODAL */}
      {showReassign && availableDrivers.length > 0 && (
        <div className="fixed inset-0 z-[110] bg-slate-900/40 flex items-end justify-center sm:items-center sm:p-4" onClick={() => setShowReassign(false)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-4 shadow-2xl flex flex-col max-h-[85dvh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b pb-3 border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Reassign to...</h3>
              <button type="button" onClick={() => setShowReassign(false)} aria-label="Close reassign" className="flex min-h-11 min-w-11 items-center justify-center bg-slate-100 rounded-xl text-slate-500 hover:bg-slate-200 active:scale-95"><X size={18} /></button>
            </div>
            <div className="space-y-1.5 overflow-y-auto flex-1 py-2 pr-1">
              {availableDrivers.map(d => {
                const isCurrent = trip.driverId === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={isCurrent}
                    onClick={() => {
                      assignTripToDriver?.(trip.id, d.id);
                      addToast?.("Trip Assigned", `Assigned to ${d.name}`, "success");
                      setShowReassign(false);
                    }}
                    className={`min-h-12 w-full flex items-center justify-between p-2.5 rounded-xl border transition-colors text-left ${isCurrent ? 'border-blue-200 bg-blue-50 opacity-60' : 'border-slate-200 bg-white hover:bg-slate-50 active:scale-[0.98]'}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                        {(d.name || "D")[0]}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-800">{d.name}</div>
                        <div className="text-[11px] text-slate-500">{d.vehicle || 'No vehicle'}</div>
                      </div>
                    </div>
                    <div className={`text-xs font-bold px-2.5 py-1 rounded-lg ${isCurrent ? 'text-slate-400 bg-slate-100' : 'text-blue-600 bg-blue-50'}`}>
                      {isCurrent ? 'Current' : 'Assign'}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="pt-2 border-t border-slate-100 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] mt-2">
              <button
                type="button"
                onClick={() => setShowReassign(false)}
                className="w-full min-h-11 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/* ─── Driver Row ──────────────────────────────────────────────────── */
const DriverRow = ({ driver, trips }) => {
  const ds = getDriverLiveStatus(driver);
  const active = trips.find(t => IN_PROGRESS.includes(t.status) && (t.driverId===driver.id||t.driverName===driver.name));
  const activeStatus = active?.status || ds.label;
  const todayCount = trips.filter(t => t.driverId === driver.id || t.driverName === driver.name).length;
  return (
    <div className="bg-white rounded-xl border border-slate-100 px-3.5 py-3 flex items-center gap-3 shadow-sm">
      <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm uppercase shrink-0 ${ds.color}`}>
        {(driver.name || "D")[0]}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-slate-900 truncate">{driver.name}</p>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${active ? "bg-amber-100 text-amber-700" : ds.color}`}>
            {activeStatus}
          </span>
        </div>
        <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">{driver.vehicle || "No vehicle"}</p>
        {active && (
          <p className="text-[10px] text-amber-600 font-semibold mt-0.5 truncate">▶ {trunc(active.patient || "", 30)}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-base font-black text-slate-900">{todayCount}</p>
        <p className="text-[10px] font-semibold text-slate-500 uppercase">trips</p>
      </div>
    </div>
  );
};

/* ─── Main Component ──────────────────────────────────────────────── */
const MobileDispatchView = ({ role, currentUser, trips = [], drivers = [], assignTripToDriver, setBulkAssignModal, requestDeleteTrip, updateTrip, makeCall, sendSMS, requestAuthAction, setShowAddTripModal, setShowUploadModal, onOpenSequencer, onSendToPlan, onOpenLiveMap, searchQuery, setSearchQuery, addToast, onOpenTripDetails, onOpenTripWorkflow, workspaceControls = null, activeTab = "trips" }) => {
  const [filter, setFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [selectedTripIds, setSelectedTripIds] = useState([]);
  const toggleSelectTrip = (tripId) => setSelectedTripIds(prev => prev.includes(tripId) ? prev.filter(id => id !== tripId) : [...prev, tripId]);
  const [showTools, setShowTools] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchQuery || "");
  const [showSearch, setShowSearch] = useState(false);
  const [quickSmsTrip, setQuickSmsTrip] = useState(null);
  const [scheduleEditTrip, setScheduleEditTrip] = useState(null);
  const searchInputRef = useRef(null);

  useEffect(() => { const t = setTimeout(() => setSearchQuery?.(localSearch), 250); return () => clearTimeout(t); }, [localSearch, setSearchQuery]);

  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  const todayStr = localCalendarYmd();

  const todayTrips = useMemo(() =>
    trips
      .filter(t => tripCalendarDateKey(t.date) === todayStr)
      .sort((a, b) => {
        const aT = TERMINAL.includes(a.status), bT = TERMINAL.includes(b.status);
        if (aT && !bT) return 1; if (!aT && bT) return -1;
        return timeToMinutes(a.time) - timeToMinutes(b.time);
      }),
    [trips, todayStr]
  );

  const filtered = useMemo(() => {
    let r = todayTrips;
    if (filter === "unassigned") r = r.filter(t => t.status === "Unassigned");
    else if (filter === "active") r = r.filter(t => IN_PROGRESS.includes(t.status));
    else if (filter === "completed") r = r.filter(t => t.status === "Completed");
    else if (filter === "cancelled") r = r.filter(t => t.status === "Cancelled" || t.status === "No Show" || t.status === "Rerouted");
    else if (filter === "willcall") r = r.filter(t => t.time === "Will Call");
    if (driverFilter === "unassigned") {
      r = r.filter(t => !t.driverId || t.status === "Unassigned");
    } else if (driverFilter !== "all") {
      r = r.filter(t => t.driverId === driverFilter || t.driverName === driverFilter);
    }
    if (localSearch) {
      r = r.filter(t => tripMatchesSearch(t, localSearch));
    }
    return r;
  }, [todayTrips, filter, driverFilter, localSearch]);

  const unassignedN = todayTrips.filter(t => t.status === "Unassigned").length;
  const activeN = todayTrips.filter(t => IN_PROGRESS.includes(t.status)).length;
  const doneN = todayTrips.filter(t => t.status === "Completed").length;
  const cancelledN = todayTrips.filter(t => t.status === "Cancelled" || t.status === "No Show" || t.status === "Rerouted").length;

  const CHIPS = [
    { id: "all", label: "All", n: todayTrips.length },
    { id: "unassigned", label: "Unassigned", n: unassignedN },
    { id: "active", label: "Active", n: activeN },
    { id: "willcall", label: "Will Call", n: todayTrips.filter(t => t.time === "Will Call").length },
    { id: "completed", label: "Done", n: doneN },
    ...(cancelledN > 0 ? [{ id: "cancelled", label: "Exceptions", n: cancelledN }] : []),
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden pb-24">
      {/* Header: stats + workspace controls + search */}
      <div className="px-3 pt-3 pb-2 bg-white border-b border-slate-200 sm:px-4 shrink-0">
        {/* Stats row (only when no workspace controls) */}
        {!workspaceControls && (
          <div className="flex gap-2 mb-2.5">
            {[
              { label: "Total", value: todayTrips.length, color: "text-slate-900", bg: "bg-slate-50", border: "border-slate-200" },
              { label: "Dispatch", value: unassignedN, color: unassignedN > 0 ? "text-rose-600" : "text-slate-900", bg: unassignedN > 0 ? "bg-rose-50" : "bg-slate-50", border: unassignedN > 0 ? "border-rose-200" : "border-slate-200" },
              { label: "Live", value: activeN, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
              { label: "Done", value: doneN, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
            ].map(s => (
              <div key={s.label} className={`flex-1 rounded-xl px-2 py-2 text-center border ${s.bg} ${s.border}`}>
                <p className={`text-lg font-black leading-none ${s.color}`}>{s.value}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {workspaceControls}

        {/* Search + tools row */}
        <div className="flex items-center gap-2 mt-2">
          {showSearch ? (
            <div className="relative flex-1 flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={localSearch}
                  onChange={e => setLocalSearch(e.target.value)}
                  placeholder="Search patient, ID, address…"
                  className="w-full min-h-11 bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-8 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-colors"
                />
                {localSearch && (
                  <button type="button" onClick={() => setLocalSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X size={13} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setShowSearch(false); setLocalSearch(""); }}
                className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 active:scale-95 transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 active:scale-95 transition-colors shadow-sm shrink-0"
              >
                <Search size={16} />
              </button>
              <button
                type="button"
                onClick={() => setShowTools(true)}
                className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 active:scale-95 transition-colors shadow-sm shrink-0"
              >
                <SlidersHorizontal size={16} />
              </button>
              {/* Upload trips button */}
              <button
                type="button"
                onClick={() => setShowUploadModal?.(true)}
                className="min-h-11 w-11 rounded-xl bg-blue-500 text-white flex items-center justify-center active:scale-95 transition-colors shadow-sm shrink-0"
                title="Upload CSV or scan trips"
              >
                <Upload size={16} />
              </button>
              {/* Add trip button */}
              <button
                type="button"
                onClick={() => setShowAddTripModal?.(true)}
                className="min-h-11 px-3 rounded-xl bg-blue-600 text-white text-[12px] font-bold flex items-center gap-1.5 active:scale-95 transition-colors shadow-sm ml-auto"
              >
                <Plus size={14} /> Add Trip
              </button>
            </>
          )}
        </div>
      </div>

      {/* Single-line Filter Bar with Dropdowns */}
      {activeTab === "trips" && (
        <div className="app-filter-bar shrink-0 gap-1.5 border-b border-slate-100 bg-white px-3 py-2 sm:px-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {/* Status / Queue Dropdown */}
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              aria-label="Filter trips by queue status"
              className="min-h-11 h-11 flex-1 min-w-0 max-w-[170px] bg-slate-50 border border-slate-200 rounded-xl px-2.5 text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-blue-600 transition-colors"
            >
              {CHIPS.map(c => (
                <option key={c.id} value={c.id}>
                  {c.label} ({c.n})
                </option>
              ))}
            </select>

            {/* Driver Dropdown */}
            <select
              value={driverFilter}
              onChange={e => setDriverFilter(e.target.value)}
              aria-label="Filter trips by driver"
              className="min-h-11 h-11 flex-1 min-w-0 max-w-[160px] bg-slate-50 border border-slate-200 rounded-xl px-2.5 text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-blue-600 transition-colors"
            >
              <option value="all">All Drivers ({todayTrips.length})</option>
              <option value="unassigned">Unassigned ({unassignedN})</option>
              {drivers.map(d => {
                const count = todayTrips.filter(t => t.driverId === d.id || t.driverName === d.name).length;
                return (
                  <option key={d.id} value={d.id}>
                    {d.name} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {(filter !== "all" || driverFilter !== "all") && (
            <button
              type="button"
              onClick={() => { setFilter("all"); setDriverFilter("all"); }}
              className="min-h-11 px-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-700 text-xs font-bold shrink-0 active:scale-95 transition-colors"
              title="Reset filters"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {/* Selected trips bulk action bar */}
      {activeTab === "trips" && selectedTripIds.length > 0 && (
        <div className="bg-indigo-50 border-b border-indigo-200 px-3 py-2 flex items-center justify-between gap-2 shrink-0 animate-in fade-in">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-bold text-indigo-700">{selectedTripIds.length} selected</span>
            <button
              type="button"
              onClick={() => setSelectedTripIds([])}
              className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-700 underline"
            >
              Clear
            </button>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                const selectedList = trips.filter(t => selectedTripIds.includes(t.id));
                if (onSendToPlan) {
                  onSendToPlan(selectedList);
                } else if (onOpenSequencer) {
                  onOpenSequencer(selectedTripIds);
                } else {
                  addToast?.("Queued for plan", `${selectedTripIds.length} trips queued for Plan`, "info");
                }
              }}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-xs active:scale-95 transition-colors cursor-pointer"
            >
              <Route size={12} /> Plan
            </button>
            {setBulkAssignModal && (
              <button
                type="button"
                onClick={() => setBulkAssignModal(selectedTripIds)}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-xs active:scale-95 transition-colors cursor-pointer"
              >
                <Users size={12} /> Assign
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: "calc(88px + env(safe-area-inset-bottom,0px))" }}
      >
        {/* Trips tab */}
        {activeTab === "trips" && (
          <div className="px-3 py-3 space-y-2.5">
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
                  <Truck size={28} className="opacity-30" />
                </div>
                <p className="text-sm font-semibold text-slate-500">No trips found</p>
                <p className="text-xs text-slate-400 mt-1 text-center max-w-[200px]">
                  {localSearch ? "Try a different search" : "No trips match this filter for today"}
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddTripModal?.(true)}
                  className="mt-4 min-h-11 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold active:scale-95 transition-colors"
                >
                  + Add New Trip
                </button>
              </div>
            )}
            {filtered.map(trip => (
              <AdminTripCard
                key={trip.id}
                trip={trip}
                allTrips={trips}
                drivers={drivers}
                onOpenTripDetails={onOpenTripDetails}
                onOpenTripWorkflow={onOpenTripWorkflow}
                assignTripToDriver={assignTripToDriver}
                makeCall={makeCall}
                sendSMS={sendSMS}
                requestDeleteTrip={requestDeleteTrip}
                updateTrip={updateTrip}
                requestAuthAction={requestAuthAction}
                currentUser={currentUser}
                addToast={addToast}
                role={role}
                onTimeEdit={(t) => setScheduleEditTrip(t)}
                onQuickSms={(t) => setQuickSmsTrip(t)}
                onSendToPlan={(t) => {
                  if (onOpenSequencer) {
                    onOpenSequencer([t.id]);
                  } else {
                    addToast?.('Trip queued for Plan');
                  }
                }}
                isSelected={selectedTripIds.includes(trip.id)}
                onSelect={() => toggleSelectTrip(trip.id)}
              />
            ))}
          </div>
        )}

        {/* Drivers tab */}
        {activeTab === "drivers" && (
          <div className="px-3 py-3 space-y-2.5">
            {[...drivers].sort((a, b) => {
              const aA = !["Offline","Unavailable"].includes(a.status);
              const bA = !["Offline","Unavailable"].includes(b.status);
              if (aA && !bA) return -1; if (!aA && bA) return 1;
              return (a.name || "").localeCompare(b.name || "");
            }).map(d => <DriverRow key={d.id} driver={d} trips={todayTrips} />)}
            {drivers.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
                  <Users size={28} className="opacity-30" />
                </div>
                <p className="text-sm font-semibold text-slate-500">No drivers found</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Multi-Trip Selection Floating Bar */}
      {selectedTripIds.length > 0 && (
        <div className="fixed bottom-20 left-3 right-3 z-40 bg-slate-900 text-white rounded-2xl shadow-xl px-4 py-3 flex items-center justify-between gap-3 border border-slate-700/60">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
              {selectedTripIds.length}
            </span>
            <span className="text-xs font-semibold text-slate-200 truncate">
              {selectedTripIds.length === 1 ? '1 trip selected' : `${selectedTripIds.length} trips selected`}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (onOpenSequencer) {
                  onOpenSequencer(selectedTripIds);
                } else {
                  addToast?.(`${selectedTripIds.length} trips queued for Plan`);
                }
              }}
              className="min-h-11 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-xs font-bold text-white transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Route size={13} />
              <span>Plan</span>
            </button>
            {setBulkAssignModal && (
              <button
                type="button"
                onClick={() => setBulkAssignModal({ tripIds: selectedTripIds })}
                className="min-h-11 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-xs font-bold text-white transition-colors cursor-pointer"
              >
                Assign Selected
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedTripIds([])}
              className="min-h-11 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold active:scale-95 transition-colors cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Tools Bottom Sheet */}
      {showTools && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowTools(false)}>
          <div className="absolute inset-0 bg-slate-950/65" />
          <div className="relative w-full bg-white rounded-t-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>
            <div className="px-5 pb-2 pt-2 border-b border-slate-100">
              <h2 className="text-sm font-black text-slate-900">Dispatch Tools</h2>
              <p className="text-xs text-slate-400 mt-0.5">Quick access to all operations</p>
            </div>
            <div className="px-4 py-3 grid grid-cols-3 gap-3" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))" }}>
              {/* NOTE: Upload Trips and Add Trip live in the header toolbar above
                  (single authoritative entry points). Do NOT re-add them here —
                  duplicate entry points for the same action are forbidden. */}
              {[
                { label: "Route Plan", icon: Route, color: "bg-indigo-50 text-indigo-700 border-indigo-200", action: () => { onOpenSequencer?.(); setShowTools(false); } },
                { label: "Live Map", icon: MapPin, color: "bg-emerald-50 text-emerald-700 border-emerald-200", action: () => { onOpenLiveMap?.(); setShowTools(false); } },
                { label: "Bulk Assign", icon: Users, color: "bg-amber-50 text-amber-700 border-amber-200", action: () => { setBulkAssignModal?.(true); setShowTools(false); } },
              ].map(item => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.action}
                  className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border font-black text-xs transition-colors active:scale-95 ${item.color}`}
                >
                  <item.icon size={20} />
                  <span className="text-center leading-tight px-1">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {quickSmsTrip && (
        <AdminQuickSmsSheet
          trip={quickSmsTrip}
          onSend={async (text) => {
            const { getFunctions, httpsCallable } = await import('firebase/functions');
            const sendClientSms = httpsCallable(getFunctions(), 'sendClientSms');
            await sendClientSms({
              to: quickSmsTrip.patientPhone || quickSmsTrip.phone || quickSmsTrip.clientPhone || '',
              body: text,
              tripId: quickSmsTrip.id,
            });
          }}
          onClose={() => setQuickSmsTrip(null)}
        />
      )}
      {scheduleEditTrip && (
        <ScheduleEditorModal
          trip={scheduleEditTrip}
          onSave={(payload) => {
            updateTrip?.(scheduleEditTrip.id, payload);
            setScheduleEditTrip(null);
            addToast?.('Schedule updated');
          }}
          onClose={() => setScheduleEditTrip(null)}
        />
      )}
    </div>
  );
};

export default MobileDispatchView;
