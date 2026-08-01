import React, { useState, useMemo, useEffect, useRef, Suspense, lazy } from "react";
import {
  Search, Plus, Upload, Route, Users, Truck, MapPin, Phone,
  ChevronDown, X, User, Edit2, Archive, Ban, AlertTriangle,
  Repeat, MessageSquare, SlidersHorizontal, ChevronRight,
  Navigation, Clock, CheckCircle2, XCircle, Play, UserCheck,
  MoreHorizontal
} from "lucide-react";
import { getDriverLiveStatus } from "../constants/statuses";
import { tripCalendarDateKey, localCalendarYmd } from "../utils/tripDate";
import { tripMatchesSearch } from "../utils/search";

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
const AdminTripCard = ({ 
  trip, drivers, onOpenTripDetails, onOpenTripWorkflow, assignTripToDriver, makeCall, sendSMS,
  requestDeleteTrip, updateTrip, requestAuthAction, currentUser, addToast, role
}) => {
  const [showActions, setShowActions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [draft, setDraft] = useState(() => ({ ...trip, pickup: getAddr(trip.pickup), dropoff: getAddr(trip.dropoff) }));
  const statusCfg = getStatusConfig(trip.status);
  const urgency = getUrgency(trip);
  const driver = drivers.find(d => d.id === trip.driverId || (trip.driverName && d.name === trip.driverName));
  const isTerminal = TERMINAL.includes(trip.status);
  const isActive = IN_PROGRESS.includes(trip.status);
  const pickup = getAddr(trip.pickup);
  const dropoff = getAddr(trip.dropoff);
  const timeLabel = trip.time === "Will Call" || !trip.time ? "Will Call" : to12hr(trip.time);

  const markException = (status) => {
    const run = () => {
      if (updateTrip) {
        updateTrip(trip.id, {
          status,
          workflowUpdatedAt: new Date().toISOString(),
          updatedBy: currentUser,
          exceptionAt: new Date().toISOString(),
          exceptionBy: currentUser,
          exceptionSource: role,
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
      setEditing(false);
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
          <input value={draft.pickupPhone || draft.patientPhone || ''} onChange={event => setDraft(current => ({ ...current, pickupPhone: event.target.value }))} className={fieldClass} placeholder="Patient phone" aria-label="Patient phone" />
          <input value={draft.dropoffPhone || ''} onChange={event => setDraft(current => ({ ...current, dropoffPhone: event.target.value }))} className={fieldClass} placeholder="Dropoff phone" aria-label="Dropoff phone" />
          <textarea value={draft.notes || ''} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} className={`${fieldClass} col-span-2`} rows="2" placeholder="Notes" aria-label="Notes" />
        </div>
        {editError && <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-xs font-semibold text-rose-700">{editError}</p>}
      </form>
    );
  }

  return (
    <>
      {/* Main Trip Card — full tap opens DriverPage trip view */}
      <button
        type="button"
        onClick={() => onOpenTripDetails?.(trip)}
        className={`w-full text-left bg-white rounded-xl border shadow-sm active:scale-[0.985] transition-all duration-150 overflow-hidden ${
          isActive ? "border-amber-200 shadow-amber-100/60" : 
          isTerminal ? "border-slate-100 opacity-80" : 
          trip.status === "Unassigned" ? "border-rose-200 shadow-rose-50" : "border-slate-200"
        }`}
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        {/* Status accent line */}
        <div className={`h-0.5 w-full ${statusCfg.bg} opacity-60`} />
        
        <div className="px-3.5 pt-3 pb-2.5">
          {/* Row 1: Time + Patient + Status */}
          <div className="flex items-start gap-2.5">
            {/* Time badge */}
            <div className={`shrink-0 text-center px-2 py-1.5 rounded-xl min-w-[52px] ${
              urgency === "Late" ? "bg-rose-600 text-white" :
              urgency ? "bg-amber-50 border border-amber-200" :
              "bg-slate-50 border border-slate-200"
            }`}>
              <p className={`text-[13px] font-black leading-none ${
                urgency === "Late" ? "text-white" :
                urgency ? "text-amber-700" : "text-slate-800"
              }`}>{timeLabel}</p>
              {urgency && (
                <p className={`text-[9px] font-semibold mt-0.5 ${urgency === "Late" ? "text-white/80" : "text-amber-600"}`}>
                  {urgency}
                </p>
              )}
            </div>

            {/* Patient + booking */}
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-[15px] font-bold text-slate-900 truncate leading-tight">
                  {trip.patient || "Unknown Patient"}
                </p>
                {trip.urgentTrip && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[8px] font-black uppercase tracking-wide">
                    URGENT
                  </span>
                )}
              </div>
              {trip.bookingId && (
                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">#{trip.bookingId}</p>
              )}
            </div>

            {/* Status pill + chevron */}
            <div className="shrink-0 flex flex-col items-end gap-1.5 pt-0.5">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusCfg.pill}`}>
                {trip.status || "Open"}
              </span>
              <ChevronRight size={14} className="text-slate-300" />
            </div>
          </div>

          {/* Row 2: Pickup → Dropoff */}
          {(pickup || dropoff) && (
            <div className="mt-2.5 flex items-start gap-1.5">
              <div className="shrink-0 mt-1 flex flex-col items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500 border-2 border-white shadow-sm shadow-emerald-200" />
                <div className="w-px h-4 bg-slate-200" />
                <div className="w-2 h-2 rounded-full bg-rose-500 border-2 border-white shadow-sm shadow-rose-200" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-[11px] font-semibold text-slate-600 truncate leading-tight">
                  {trunc(pickup, 45) || "Pickup pending"}
                </p>
                <p className="text-[11px] font-semibold text-slate-600 truncate leading-tight">
                  {trunc(dropoff, 45) || "Dropoff pending"}
                </p>
              </div>
            </div>
          )}

          {/* Row 3: Driver info + quick action buttons */}
          <div className="mt-2.5 flex items-center justify-between gap-2">
            {/* Driver info */}
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {driver ? (
                <>
                  <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-[9px] font-black text-blue-700">{(driver.name || "D")[0]}</span>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-600 truncate">{driver.name}</span>
                </>
              ) : (
                <span className={`text-[11px] font-semibold ${trip.status === "Unassigned" ? "text-rose-500" : "text-slate-400"}`}>
                  {trip.driverName || "Unassigned"}
                </span>
              )}
            </div>

            {/* Quick action buttons */}
            <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
              {!isTerminal && (
                <button
                  type="button"
                  onClick={handleQuickAssign}
                  className="h-7 px-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-semibold flex items-center gap-1 active:scale-95 transition-all"
                >
                  <UserCheck size={11} />
                  {driver ? "Reassign" : "Assign"}
                </button>
              )}
              {trip.patientPhone && (
                <>
                  <button
                    type="button"
                    onClick={() => makeCall?.(trip.patientPhone, trip.patient)}
                    className="w-7 h-7 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center active:scale-95 transition-all"
                    title="Call patient"
                  >
                    <Phone size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => sendSMS?.(trip.patientPhone, trip.patient)}
                    className="w-7 h-7 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center active:scale-95 transition-all"
                    title="SMS patient"
                  >
                    <MessageSquare size={12} />
                  </button>
                </>
              )}
              {!isTerminal && (
                <button
                  type="button"
                  onClick={() => setShowActions(true)}
                  className="w-7 h-7 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center active:scale-95 transition-all"
                >
                  <MoreHorizontal size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Open trip hint */}
        <div className={`px-3.5 py-1.5 border-t flex items-center justify-between ${
          isActive ? "bg-amber-50/60 border-amber-100" : "bg-slate-50/60 border-slate-100"
        }`}>
          <span className={`text-[10px] font-semibold ${isActive ? "text-amber-600" : "text-slate-400"}`}>
            {isActive ? "▶ Trip in progress — tap to manage" : isTerminal ? "Tap to view details" : "Tap to open trip workflow"}
          </span>
          {trip.mileage && (
            <span className="text-[10px] font-semibold text-slate-400">{trip.mileage} mi</span>
          )}
        </div>
      </button>

      {/* Actions Bottom Sheet */}
      {showActions && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowActions(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full bg-white rounded-t-3xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>
            <div className="px-4 pt-2 pb-2 border-b border-slate-100">
              <p className="text-sm font-black text-slate-900">{trip.patient || "Trip"}</p>
              <p className="text-[11px] text-slate-400 font-semibold">{timeLabel} · {trip.status}</p>
            </div>
            <div className="px-4 py-3 space-y-2" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))" }}>
              {/* Assign to driver */}
              {!isTerminal && availableDrivers.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Assign to Driver</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {availableDrivers.map(d => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          assignTripToDriver?.(trip.id, d.id);
                          addToast?.("Trip Assigned", `Assigned to ${d.name}`, "success");
                          setShowActions(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all active:scale-[0.98] text-left ${
                          d.id === trip.driverId 
                            ? "border-blue-200 bg-blue-50" 
                            : "border-slate-100 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 font-black text-sm flex items-center justify-center shrink-0">
                          {(d.name || "D")[0]}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">{d.name}</p>
                          <p className="text-[11px] text-slate-400 font-semibold">{d.vehicle || "No vehicle"} · {d.currentZone || "--"}</p>
                        </div>
                        {d.id === trip.driverId && (
                          <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide shrink-0">Current</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Exception actions */}
              {!isTerminal && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => markException("No Show")}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-orange-200 bg-orange-50 text-orange-700 text-[11px] font-semibold active:scale-95 transition-all"
                  >
                    <XCircle size={18} />
                    No Show
                  </button>
                  <button
                    type="button"
                    onClick={() => markException("Cancelled")}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-[11px] font-semibold active:scale-95 transition-all"
                  >
                    <Ban size={18} />
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => markException("Rerouted")}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 text-[11px] font-semibold active:scale-95 transition-all"
                  >
                    <Repeat size={18} />
                    Reroute
                  </button>
                </div>
              )}
              {/* Call patient */}
              {trip.patientPhone && (
                <button
                    type="button"
                    onClick={() => { makeCall?.(trip.patientPhone, trip.patient); setShowActions(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-semibold active:scale-95 transition-all"
                  >
                    <Phone size={18} /> Call Patient
                  </button>
              )}
              {/* SMS patient */}
              {trip.patientPhone && (
                <button
                  type="button"
                  onClick={() => { sendSMS?.(trip.patientPhone, trip.patient); setShowActions(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-sky-200 bg-sky-50 text-sky-700 text-sm font-semibold active:scale-95 transition-all"
                >
                  <MessageSquare size={18} /> SMS Patient
                </button>
              )}
              {/* Edit trip */}
              {!isTerminal && updateTrip && (
                <button
                  type="button"
                  onClick={() => { setDraft({ ...trip, pickup: getAddr(trip.pickup), dropoff: getAddr(trip.dropoff) }); setEditing(true); setShowActions(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-sm font-semibold active:scale-95 transition-all"
                >
                  <Edit2 size={18} /> Edit Trip
                </button>
              )}
              {/* Open full trip workflow */}
              <button
                type="button"
                onClick={() => { onOpenTripWorkflow?.(trip); setShowActions(false); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 text-white text-sm font-bold active:scale-95 transition-all shadow-sm"
              >
                <Play size={16} /> Open Trip Workflow
              </button>
              <button
                type="button"
                onClick={() => setShowActions(false)}
                className="w-full text-center text-sm font-semibold text-slate-500 py-2"
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
          <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${active ? "bg-amber-100 text-amber-700" : ds.color}`}>
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
        <p className="text-[9px] font-semibold text-slate-400 uppercase">trips</p>
      </div>
    </div>
  );
};

/* ─── Main Component ──────────────────────────────────────────────── */
const MobileDispatchView = ({
  role, currentUser, trips=[], drivers=[], dispatchers=[],
  assignTripToDriver, bulkAssignTrips, setBulkAssignModal,
  requestDeleteTrip, updateTrip, makeCall, sendSMS, requestAuthAction,
  setTripDetails, setShowAddTripModal, setShowUploadModal,
  onOpenSequencer, onOpenLiveMap, searchQuery, setSearchQuery,
  addToast, phoneNumbers, onOpenTripDetails, onOpenTripWorkflow,
  workspaceControls = null,
  activeTab = "trips", // Controlled by parent bottom nav
  expandedId: expandedIdProp, setExpandedId: setExpandedIdProp
}) => {
  const [filter, setFilter] = useState("all");
  const [showTools, setShowTools] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchQuery || "");
  const [showSearch, setShowSearch] = useState(false);
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
    if (localSearch) {
      r = r.filter(t => tripMatchesSearch(t, localSearch));
    }
    return r;
  }, [todayTrips, filter, localSearch]);

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
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
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
                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wide mt-0.5">{s.label}</p>
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-8 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all"
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
                className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 active:scale-95 transition-all shrink-0"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 active:scale-95 transition-all shadow-sm shrink-0"
              >
                <Search size={16} />
              </button>
              <button
                type="button"
                onClick={() => setShowTools(true)}
                className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 active:scale-95 transition-all shadow-sm shrink-0"
              >
                <SlidersHorizontal size={16} />
              </button>
              {/* Add trip button */}
              <button
                type="button"
                onClick={() => setShowAddTripModal?.(true)}
                className="h-9 px-3 rounded-xl bg-blue-600 text-white text-[12px] font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-sm ml-auto"
              >
                <Plus size={14} /> Add Trip
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter chips */}
      {activeTab === "trips" && (
        <div className="shrink-0 flex gap-1.5 px-3 py-2.5 overflow-x-auto bg-white border-b border-slate-100 sm:px-4" style={{ scrollbarWidth: "none" }}>
          {CHIPS.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all active:scale-95 ${
                filter === c.id ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {c.label}
              <span className={`text-[9px] px-1 py-0.5 rounded-full font-semibold ${filter === c.id ? "bg-white/20 text-white" : "bg-slate-200 text-slate-500"}`}>
                {c.n}
              </span>
            </button>
          ))}
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
                  className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold active:scale-95 transition-all"
                >
                  + Add New Trip
                </button>
              </div>
            )}
            {filtered.map(trip => (
              <AdminTripCard
                key={trip.id}
                trip={trip}
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

      {/* Tools Bottom Sheet */}
      {showTools && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowTools(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full bg-white rounded-t-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>
            <div className="px-5 pb-2 pt-2 border-b border-slate-100">
              <h2 className="text-sm font-black text-slate-900">Dispatch Tools</h2>
              <p className="text-xs text-slate-400 mt-0.5">Quick access to all operations</p>
            </div>
            <div className="px-4 py-3 grid grid-cols-3 gap-3" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))" }}>
              {[
                { label: "Upload Trips", icon: Upload, color: "bg-blue-50 text-blue-700 border-blue-200", action: () => { setShowUploadModal?.(true); setShowTools(false); } },
                { label: "Route Plan", icon: Route, color: "bg-indigo-50 text-indigo-700 border-indigo-200", action: () => { onOpenSequencer?.(); setShowTools(false); } },
                { label: "Live Map", icon: MapPin, color: "bg-emerald-50 text-emerald-700 border-emerald-200", action: () => { onOpenLiveMap?.(); setShowTools(false); } },
                { label: "Bulk Assign", icon: Users, color: "bg-amber-50 text-amber-700 border-amber-200", action: () => { setBulkAssignModal?.(true); setShowTools(false); } },
                { label: "Add Trip", icon: Plus, color: "bg-rose-50 text-rose-700 border-rose-200", action: () => { setShowAddTripModal?.(true); setShowTools(false); } },
              ].map(item => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.action}
                  className={`flex flex-col items-center justify-center gap-2 h-20 rounded-xl border font-black text-xs transition-all active:scale-95 ${item.color}`}
                >
                  <item.icon size={20} />
                  <span className="text-center leading-tight px-1">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileDispatchView;
