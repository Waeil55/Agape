import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Search, Plus, Upload, Route, Users, Truck, MapPin, Phone,
  ChevronDown, X, User, Edit2, Archive, Ban, AlertTriangle,
  Repeat, MessageSquare, SlidersHorizontal
} from "lucide-react";
import { getDriverLiveStatus } from "../constants/statuses";

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

const getStatusStyle = (status) => {
  if (status === "Unassigned") return { pill: "bg-rose-100 text-rose-700 border-rose-200", border: "border-l-rose-500" };
  if (status === "Assigned") return { pill: "bg-blue-100 text-blue-700 border-blue-200", border: "border-l-blue-500" };
  if (IN_PROGRESS.includes(status)) return { pill: "bg-amber-100 text-amber-700 border-amber-200", border: "border-l-amber-500" };
  if (status === "Completed") return { pill: "bg-emerald-100 text-emerald-700 border-emerald-200", border: "border-l-emerald-500" };
  if (status === "Cancelled") return { pill: "bg-slate-100 text-slate-500 border-slate-200", border: "border-l-slate-400" };
  if (status === "No Show") return { pill: "bg-orange-100 text-orange-700 border-orange-200", border: "border-l-orange-500" };
  return { pill: "bg-slate-100 text-slate-700 border-slate-200", border: "border-l-slate-400" };
};

const trunc = (str, n) => str && str.length > n ? str.slice(0, n) + "…" : str || "";
const getAddr = (v) => typeof v === "object" ? v?.address || "" : v || "";

/* ─── Trip Card ───────────────────────────────────────────────────── */
const TripCard = ({ trip, drivers, expanded, onToggle, assignTripToDriver, makeCall, sendSMS,
  requestDeleteTrip, onSetTripDetails, role, updateTrip, requestAuthAction, currentUser, addToast }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showConfirm, setShowConfirm] = useState(null); // { action, label, color }
  const urgency = getUrgency(trip);
  const isLate = urgency === "Late", isSoon = urgency && urgency !== "Late";
  const sty = getStatusStyle(trip.status);
  const driver = drivers.find(d => d.id === trip.driverId || (trip.driverName && d.name === trip.driverName));
  const ds = driver ? getDriverLiveStatus(driver) : null;
  const pickup = getAddr(trip.pickup), dropoff = getAddr(trip.dropoff);
  const dispTime = to12hr(trip.time);
  const isTerminal = TERMINAL.includes(trip.status);
  const available = drivers.filter(d => !["Offline","Unavailable"].includes(d.status));
  const timeParts = trip.time !== "Will Call" ? dispTime.split(" ") : [];

  const markTripException = (status) => {
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
      addToast?.('Trip Updated', `${trip.patient || trip.id} marked as ${status}.`, status === 'Cancelled' || status === 'No Show' ? 'warning' : 'success');
    };
    if (requestAuthAction) {
      requestAuthAction(`Mark ${trip.patient || 'trip'} as ${status}`, run);
    } else {
      run();
    }
    setShowConfirm(null);
  };

  return (
    <div className={(isLate ? "bg-rose-50 " : "bg-white ") + "rounded-xl border border-slate-200 border-l-[5px] " + sty.border + " shadow-sm overflow-visible transition-all duration-200"}>
      <button type="button" onClick={onToggle} className="w-full text-left px-3 pt-2.5 pb-2 focus:outline-none active:bg-slate-50/70 sm:px-3.5">
        <div className="flex items-start gap-2.5">
          <div className="shrink-0 text-center w-[50px] rounded-xl bg-slate-50 border border-slate-100 py-1.5">
            {trip.time === "Will Call" ? (
              <span className="text-sm font-bold text-slate-700 uppercase">WC</span>
            ) : (
              <>
                <p className={"text-base font-semibold leading-none " + (isLate ? "text-rose-600" : isSoon ? "text-amber-600" : "text-slate-900")}>{timeParts[0]}</p>
                <p className={"text-[9px] font-semibold uppercase tracking-wide mt-0.5 " + (isLate ? "text-rose-400" : isSoon ? "text-amber-400" : "text-slate-400")}>{timeParts[1] || ""}</p>
              </>
            )}
            {urgency && <span className={"mt-1.5 inline-block px-1.5 py-0.5 rounded-md text-[9px] font-semibold uppercase " + (isLate ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700")}>{urgency}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {(() => {
                  const parts = (trip.patient || "Unknown").trim().split(/\s+/);
                  return (
                    <>
                      <h3 className="text-[15px] font-bold text-slate-950 leading-tight">{parts[0]}</h3>
                      {parts.length > 1 && <h4 className="text-[11px] font-semibold text-slate-500 leading-tight mt-0.5">{parts.slice(1).join(' ')}</h4>}
                    </>
                  );
                })()}
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">#{trip.bookingId || trip.id || "—"}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={"px-2 py-1 rounded-lg border text-[10px] font-semibold uppercase tracking-wide " + sty.pill}>{trip.status || "Unknown"}</span>
                <ChevronDown size={13} className={"text-slate-400 transition-transform duration-200 " + (expanded ? "rotate-180" : "")} />
              </div>
            </div>
            <div className="mt-2 rounded-xl bg-slate-50/80 border border-slate-100 px-2.5 py-2">
              <div className="grid grid-cols-[12px_1fr] gap-x-2.5 gap-y-2">
                <div className="flex flex-col items-center pt-[5px] row-span-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="w-px flex-1 min-h-[20px] my-1 bg-gradient-to-b from-blue-300 to-emerald-400" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-blue-600">Pickup</p>
                  <p className="text-[11px] font-semibold leading-snug text-slate-800 line-clamp-2">{pickup || "-"}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-emerald-600">Dropoff</p>
                  <p className="text-[11px] font-semibold leading-snug text-slate-800 line-clamp-2">{dropoff || "-"}</p>
                </div>
              </div>
            </div>
            {driver ? (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-white border border-slate-100 px-2.5 py-1.5">
                <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-600 shrink-0 uppercase">{(driver.name||"D")[0]}</div>
                <span className="text-[11px] font-semibold text-slate-700 truncate">{driver.name}</span>
                {ds && <span className={"ml-auto px-1.5 py-0.5 rounded-md text-[8px] font-semibold uppercase tracking-wide " + ds.color}>{ds.label}</span>}
              </div>
            ) : trip.status !== "Completed" && trip.status !== "Cancelled" ? (
              <div className="mt-2"><span className="text-[10px] font-semibold text-rose-500 flex items-center gap-1.5"><User size={11} /> No driver assigned</span></div>
            ) : null}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/80">
          <div className="px-3.5 py-3 space-y-3 sm:px-4">
            {trip.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 mb-1">Driver Notes</p>
                <p className="text-[12px] font-semibold text-amber-900 leading-relaxed">{trip.notes}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {trip.time && <div className="bg-white rounded-xl border border-slate-100 px-3 py-2 shadow-sm"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Scheduled</p><p className="text-sm font-black text-slate-900 mt-0.5">{dispTime}</p></div>}
              {trip.date && <div className="bg-white rounded-xl border border-slate-100 px-3 py-2 shadow-sm"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Date</p><p className="text-sm font-black text-slate-900 mt-0.5">{trip.date}</p></div>}
              {trip.startOdometer != null && <div className="bg-white rounded-xl border border-slate-100 px-3 py-2 shadow-sm"><p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Start Odo</p><p className="text-sm font-black text-slate-900 mt-0.5">{Number(trip.startOdometer).toLocaleString()}</p></div>}
              {trip.endOdometer != null && <div className="bg-white rounded-xl border border-slate-100 px-3 py-2 shadow-sm"><p className="text-[9px] font-black uppercase tracking-wider text-rose-600">End Odo</p><p className="text-sm font-black text-slate-900 mt-0.5">{Number(trip.endOdometer).toLocaleString()}</p></div>}
              {trip.mileage && <div className="bg-white rounded-xl border border-slate-100 px-3 py-2 shadow-sm"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Distance</p><p className="text-sm font-black text-slate-900 mt-0.5">{trip.mileage} mi</p></div>}
              {trip.signature != null && <div className="bg-white rounded-xl border border-slate-100 px-3 py-2 shadow-sm"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Signature</p><p className="text-sm font-black text-slate-900 mt-0.5">{trip.signature ? "Yes" : "No"}</p></div>}
            </div>
            <div className="bg-white rounded-xl border border-slate-100 px-3 py-2.5 shadow-sm space-y-2">
              <div className="flex items-start gap-2.5">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                <div><p className="text-[9px] font-black uppercase tracking-wider text-blue-600">Pickup</p><p className="text-xs font-semibold text-slate-800 leading-relaxed mt-0.5">{pickup||"—"}</p></div>
              </div>
              <div className="border-t border-dashed border-slate-100 pt-2 flex items-start gap-2.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <div><p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Dropoff</p><p className="text-xs font-semibold text-slate-800 leading-relaxed mt-0.5">{dropoff||"—"}</p></div>
              </div>
            </div>
            {(trip.patientPhone||trip.pickupPhone||trip.dropoffPhone) && (
              <div className="bg-white rounded-xl border border-slate-100 px-3 py-2.5 shadow-sm space-y-1.5">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Contacts</p>
                {trip.patientPhone && <div className="flex items-center gap-1">
                  <button type="button" onClick={() => makeCall?.(trip.patientPhone,trip.patient)} className="flex-1 flex items-center gap-2 text-blue-700 active:opacity-70 py-0.5"><Phone size={12}/><span className="text-xs font-bold">{trip.patient}: {trip.patientPhone}</span></button>
                  {sendSMS && <button type="button" onClick={() => sendSMS(trip.patientPhone,`Hi ${trip.patient||''}, this is Agape Care.`)} className="shrink-0 w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 active:scale-95"><MessageSquare size={11}/></button>}
                </div>}
                {trip.pickupPhone && trip.pickupPhone!==trip.patientPhone && <div className="flex items-center gap-1">
                  <button type="button" onClick={() => makeCall?.(trip.pickupPhone,"Pickup")} className="flex-1 flex items-center gap-2 text-emerald-700 active:opacity-70 py-0.5"><Phone size={12}/><span className="text-xs font-bold">Pickup: {trip.pickupPhone}</span></button>
                  {sendSMS && <button type="button" onClick={() => sendSMS(trip.pickupPhone,`Hello, this is Agape Care regarding ${trip.patient||'a patient'}.`)} className="shrink-0 w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 active:scale-95"><MessageSquare size={11}/></button>}
                </div>}
                {(trip.hospitalPhone || trip.dropoffPhone) && <div className="flex items-center gap-1">
                  <button type="button" onClick={() => makeCall?.(trip.hospitalPhone || trip.dropoffPhone,"Hospital")} className="flex-1 flex items-center gap-2 text-rose-700 active:opacity-70 py-0.5"><Phone size={12}/><span className="text-xs font-bold">Hospital: {trip.hospitalPhone || trip.dropoffPhone}</span></button>
                  {sendSMS && <button type="button" onClick={() => sendSMS(trip.hospitalPhone || trip.dropoffPhone,`Agape Care update for ${trip.patient||'patient'}.`)} className="shrink-0 w-7 h-7 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 active:scale-95"><MessageSquare size={11}/></button>}
                </div>}
              </div>
            )}
          </div>
          <div className="px-3.5 pb-3.5 space-y-2.5 sm:px-4">
            {/* Primary: Open Trip */}
            <button type="button" onClick={()=>onSetTripDetails?.(trip)} className="w-full h-11 rounded-xl bg-slate-900 text-white font-black text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all">
              <Edit2 size={14}/> Open Trip
            </button>

            {/* Status Actions (only for non-terminal trips) */}
            {!isTerminal && (
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={()=>setShowConfirm({action:'reroute', label:'Reroute', color:'amber'})}
                  className="h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 font-bold text-[11px] flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all">
                  <Repeat size={13}/> Reroute
                </button>
                <button type="button" onClick={()=>setShowConfirm({action:'noshow', label:'No Show', color:'rose'})}
                  className="h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 font-bold text-[11px] flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all">
                  <Ban size={13}/> No Show
                </button>
                <button type="button" onClick={()=>setShowConfirm({action:'cancel', label:'Cancel', color:'slate'})}
                  className="h-10 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 font-bold text-[11px] flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all">
                  <AlertTriangle size={13}/> Cancel
                </button>
              </div>
            )}

            {/* Reassign Driver */}
            {!isTerminal && (
              <div className="relative">
                <button type="button" onClick={() => setShowMenu(p=>!p)}
                  className={"w-full h-11 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all " + (trip.status==="Unassigned" ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-800 hover:bg-slate-900")}>
                  <Users size={15}/> {trip.status==="Unassigned" ? "Assign Driver" : "Re-assign Driver"}
                  <ChevronDown size={13} className={"transition-transform "+(showMenu?"rotate-180":"")} />
                </button>
                {showMenu && (
                  <div className="absolute bottom-full mb-2 left-0 right-0 bg-white rounded-2xl border border-slate-200 shadow-2xl z-20 overflow-hidden max-h-52 overflow-y-auto">
                    <div className="px-3 py-2 border-b border-slate-100 sticky top-0 bg-white"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Select Driver</p></div>
                    {available.length===0 ? <p className="text-xs text-slate-400 text-center py-4">No available drivers</p> : available.map(d=>{
                      const dss=getDriverLiveStatus(d);
                      const isCurrentDriver = d.id === trip.driverId || d.name === trip.driverName;
                      return (
                        <button key={d.id} type="button" onClick={()=>{assignTripToDriver?.(trip.id,d.id);setShowMenu(false);}}
                          className={"w-full flex items-center gap-3 px-3 py-2.5 active:bg-slate-100 text-left border-b border-slate-50 last:border-0 "+(isCurrentDriver?"bg-blue-50":"hover:bg-slate-50")}>
                          <div className={"w-8 h-8 rounded-full flex items-center justify-center font-black text-xs uppercase shrink-0 "+(isCurrentDriver?"bg-blue-200 text-blue-800":"bg-blue-100 text-blue-700")}>{(d.name||"D")[0]}</div>
                          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-900 truncate">{d.name}</p><p className="text-[10px] text-slate-400">{d.vehicle||"No vehicle"}</p></div>
                          <span className={"text-[9px] font-black uppercase px-2 py-0.5 rounded "+dss.color}>{dss.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Contact & Archive row */}
            <div className="flex gap-2">
              {driver?.phone && <button type="button" onClick={()=>makeCall?.(driver.phone,driver.name)} className="flex-1 h-10 px-3 border border-blue-200 bg-blue-50 text-blue-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 active:scale-[0.99] transition-all"><Phone size={13}/> Driver</button>}
              {driver?.phone && sendSMS && <button type="button" onClick={()=>sendSMS(driver.phone,`Hi ${driver.name||''}, from Agape Care dispatch.`)} className="h-10 px-3 border border-blue-200 bg-blue-50 text-blue-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 active:scale-[0.99] transition-all"><MessageSquare size={13}/></button>}
              {!isTerminal && requestDeleteTrip && <button type="button" onClick={()=>requestDeleteTrip(trip)} className="flex-1 h-10 px-3 border border-rose-200 bg-rose-50 text-rose-600 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 active:scale-[0.99] transition-all"><Archive size={13}/> Archive</button>}
            </div>
          </div>

          {/* Confirm Modal */}
          {showConfirm && (() => {
            const isAmber = showConfirm.color === 'amber';
            const isRose = showConfirm.color === 'rose';
            const iconBg = isAmber ? 'bg-amber-100' : isRose ? 'bg-rose-100' : 'bg-slate-100';
            const iconClr = isAmber ? 'text-amber-600' : isRose ? 'text-rose-600' : 'text-slate-600';
            const btnBg = isAmber ? 'bg-amber-600' : isRose ? 'bg-rose-600' : 'bg-slate-800';
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={()=>setShowConfirm(null)}>
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
                <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5" onClick={e=>e.stopPropagation()}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={"w-10 h-10 rounded-full flex items-center justify-center " + iconBg}>
                      <AlertTriangle size={20} className={iconClr}/>
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900">{showConfirm.label} Trip?</p>
                      <p className="text-xs text-slate-500 mt-0.5">Mark {trip.patient || 'this trip'} as {showConfirm.label}?</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={()=>setShowConfirm(null)} className="flex-1 h-10 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs active:scale-[0.97] transition-all">Keep</button>
                    <button type="button" onClick={()=>markTripException(showConfirm.action==='noshow'?'No Show':showConfirm.action==='cancel'?'Cancelled':'Rerouted')}
                      className={"flex-1 h-10 rounded-xl font-bold text-xs text-white active:scale-[0.97] transition-all " + btnBg}>
                      {showConfirm.label}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

/* ─── Driver Row ──────────────────────────────────────────────────── */
const DriverRow = ({ driver, trips }) => {
  const ds = getDriverLiveStatus(driver);
  const active = trips.find(t => IN_PROGRESS.includes(t.status) && (t.driverId===driver.id||t.driverName===driver.name));
  const activeStatus = active?.status || ds.label;
  return (
    <div className="bg-white rounded-xl border border-slate-100 px-3.5 py-3 flex items-center gap-3 shadow-sm">
      <div className={"w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm uppercase shrink-0 "+ds.color}>{(driver.name||"D")[0]}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 truncate">{driver.name}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">{driver.vehicle||"No vehicle"}</p>
        {active && <p className="text-[10px] text-amber-600 font-semibold mt-0.5 truncate">→ {trunc(active.patient||"",22)}</p>}
      </div>
      <span className={"text-[9px] font-semibold uppercase px-2.5 py-1 rounded-lg text-center shrink-0 "+(active ? "bg-amber-100 text-amber-700" : ds.color)}>{activeStatus}</span>
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
  addToast, phoneNumbers,
  workspaceControls = null,
  activeTab = "trips", // Controlled by parent bottom nav
  expandedId: expandedIdProp, setExpandedId: setExpandedIdProp
}) => {
  const [filter, setFilter] = useState("all");
  const [localExpandedId, setLocalExpandedId] = useState(null);
  const expandedId = expandedIdProp !== undefined ? expandedIdProp : localExpandedId;
  const setExpandedId = setExpandedIdProp || setLocalExpandedId;
  const [showTools, setShowTools] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchQuery||"");

  useEffect(()=>{ const t=setTimeout(()=>setSearchQuery?.(localSearch),250); return()=>clearTimeout(t); },[localSearch,setSearchQuery]);

  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();

  const todayTrips = useMemo(()=>
    trips
      .filter(t=>t.date===todayStr||!t.date)
      .sort((a,b)=>{
        const aT=TERMINAL.includes(a.status),bT=TERMINAL.includes(b.status);
        if(aT&&!bT) return 1; if(!aT&&bT) return -1;
        return timeToMinutes(a.time)-timeToMinutes(b.time);
      }),
    [trips,todayStr]
  );

  const filtered = useMemo(()=>{
    let r=todayTrips;
    if(filter==="unassigned") r=r.filter(t=>t.status==="Unassigned");
    else if(filter==="active") r=r.filter(t=>IN_PROGRESS.includes(t.status));
    else if(filter==="completed") r=r.filter(t=>t.status==="Completed");
    else if(filter==="cancelled") r=r.filter(t=>t.status==="Cancelled"||t.status==="No Show"||t.status==="Rerouted");
    else if(filter==="willcall") r=r.filter(t=>t.time==="Will Call");
    if(localSearch){const q=localSearch.toLowerCase();r=r.filter(t=>(t.patient||"").toLowerCase().includes(q)||(t.bookingId||"").toLowerCase().includes(q)||getAddr(t.pickup).toLowerCase().includes(q)||getAddr(t.dropoff).toLowerCase().includes(q)||(t.driverName||"").toLowerCase().includes(q));}
    return r;
  },[todayTrips,filter,localSearch]);

  const unassignedN=todayTrips.filter(t=>t.status==="Unassigned").length;
  const activeN=todayTrips.filter(t=>IN_PROGRESS.includes(t.status)).length;
  const doneN=todayTrips.filter(t=>t.status==="Completed").length;

  const cancelledN=todayTrips.filter(t=>t.status==="Cancelled"||t.status==="No Show"||t.status==="Rerouted").length;

  const CHIPS=[
    {id:"all",label:"All",n:todayTrips.length},
    {id:"unassigned",label:"Unassigned",n:unassignedN},
    {id:"active",label:"Active",n:activeN},
    {id:"willcall",label:"Will Call",n:todayTrips.filter(t=>t.time==="Will Call").length},
    {id:"completed",label:"Done",n:doneN},
    ...(cancelledN>0?[{id:"cancelled",label:"Exceptions",n:cancelledN}]:[]),
  ];

  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <div className="px-3 pt-3 pb-3 bg-white border-b border-slate-200 sm:px-4 shrink-0">
        {!workspaceControls && <div className="flex gap-2 mb-3">
          {[{label:"Total",value:todayTrips.length,color:"text-slate-900",bg:"bg-slate-50"},{label:"Unassigned",value:unassignedN,color:unassignedN>0?"text-rose-600":"text-slate-900",bg:unassignedN>0?"bg-rose-50":"bg-slate-50"},{label:"Active",value:activeN,color:"text-amber-600",bg:"bg-amber-50"},{label:"Done",value:doneN,color:"text-emerald-600",bg:"bg-emerald-50"}].map(s=>(
            <div key={s.label} className={"flex-1 rounded-xl px-2 py-2 text-center border border-slate-100 " + s.bg}>
              <p className={"text-lg font-semibold leading-none "+s.color}>{s.value}</p>
              <p className="text-[8px] font-semibold text-slate-500 uppercase tracking-wide mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>}
        {workspaceControls}
        <div className="flex items-center gap-2 mt-2">
          {showSearch ? (
            <div className="relative flex-1 flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
                <input ref={searchInputRef} type="text" value={localSearch} onChange={e=>setLocalSearch(e.target.value)}
                  placeholder="Search patient, ID, address…"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-8 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#2b4c7e] focus:ring-1 focus:ring-[#2b4c7e] transition-all"/>
                {localSearch && <button type="button" onClick={()=>setLocalSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={13}/></button>}
              </div>
              <button type="button" onClick={()=>{setShowSearch(false);setLocalSearch("");}}
                className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 active:scale-95 transition-all shrink-0">
                <X size={16}/>
              </button>
            </div>
          ) : (
            <>
              <button type="button" onClick={()=>setShowSearch(true)}
                className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 active:scale-95 transition-all shadow-sm shrink-0">
                <Search size={16}/>
              </button>
              <button type="button" onClick={()=>setShowTools(true)}
                className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 active:scale-95 transition-all shadow-sm shrink-0">
                <SlidersHorizontal size={16}/>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter chips */}
      {activeTab==="trips" && (
        <div className="shrink-0 flex gap-2 px-3 py-2.5 overflow-x-auto bg-white border-b border-slate-100 sm:px-4" style={{scrollbarWidth:"none"}}>
          {CHIPS.map(c=>(
            <button key={c.id} type="button" onClick={()=>setFilter(c.id)}
              className={"flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 "+(filter===c.id?"bg-[#1e3a5f] text-white shadow-sm":"bg-slate-100 text-slate-500 hover:bg-slate-200")}>
              {c.label}
              <span className={"text-[9px] px-1 py-0.5 rounded-full font-semibold "+(filter===c.id?"bg-white/20 text-white":"bg-slate-200 text-slate-500")}>{c.n}</span>
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{paddingBottom:"calc(88px + env(safe-area-inset-bottom,0px))"}}>
        {activeTab==="trips" && (
          <div className="px-3 py-3 space-y-3">
            {filtered.length===0 && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4"><Truck size={28} className="opacity-30"/></div>
                <p className="text-sm font-semibold text-slate-500">No trips found</p>
                <p className="text-xs text-slate-400 mt-1 text-center max-w-[200px]">{localSearch?"Try a different search":"No trips match this filter"}</p>
              </div>
            )}
            {filtered.map(trip=>(
              <TripCard key={trip.id} trip={trip} drivers={drivers} expanded={expandedId===trip.id}
                onToggle={()=>setExpandedId(expandedId===trip.id?null:trip.id)}
                assignTripToDriver={assignTripToDriver} makeCall={makeCall} sendSMS={sendSMS}
                updateTrip={updateTrip} requestDeleteTrip={requestDeleteTrip}
                onSetTripDetails={setTripDetails} role={role}
                requestAuthAction={requestAuthAction} currentUser={currentUser}
                addToast={addToast}/>
            ))}
          </div>
        )}
        {activeTab==="drivers" && (
          <div className="px-2.5 py-3 space-y-2 sm:px-4">
            {[...drivers].sort((a,b)=>{
              const aA=!["Offline","Unavailable"].includes(a.status),bA=!["Offline","Unavailable"].includes(b.status);
              if(aA&&!bA) return -1; if(!aA&&bA) return 1;
              return (a.name||"").localeCompare(b.name||"");
            }).map(d=><DriverRow key={d.id} driver={d} trips={todayTrips}/>)}
            {drivers.length===0 && (
              <div className="flex flex-col items-center justify-center py-20"><div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4"><Users size={28} className="opacity-30"/></div><p className="text-sm font-semibold text-slate-500">No drivers found</p></div>
            )}
          </div>
        )}
      </div>

      {/* FAB */}
      <button type="button" onClick={()=>setShowAddTripModal?.(true)}
        className="fixed z-20 right-4 w-14 h-14 rounded-full shadow-xl flex items-center justify-center bg-[#2b4c7e] active:scale-95 transition-all border border-[#1e3a5f]"
        style={{bottom:"calc(80px + env(safe-area-inset-bottom,0px))",boxShadow:"0 8px 24px rgba(43,76,126,0.3)"}}>
        <Plus size={24} className="text-white"/>
      </button>

      {/* Tools Sheet */}
      {showTools && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={()=>setShowTools(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"/>
          <div className="relative w-full bg-white rounded-t-3xl shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-200"/></div>
            <div className="px-5 pb-2 pt-2"><h2 className="text-sm font-black text-slate-900">Dispatch Tools</h2><p className="text-xs text-slate-400 mt-0.5">Quick access to all operations</p></div>
            <div className="px-4 py-3 grid grid-cols-3 gap-3" style={{paddingBottom:"max(1.5rem,env(safe-area-inset-bottom,1.5rem))"}}>
              {[
                {label:"Upload Trips",icon:Upload,color:"bg-blue-50 text-blue-700 border-blue-200",action:()=>{setShowUploadModal?.(true);setShowTools(false);}},
                {label:"Route Plan",icon:Route,color:"bg-indigo-50 text-indigo-700 border-indigo-200",action:()=>{onOpenSequencer?.();setShowTools(false);}},
                {label:"Live Map",icon:MapPin,color:"bg-emerald-50 text-emerald-700 border-emerald-200",action:()=>{onOpenLiveMap?.();setShowTools(false);}},
                {label:"Bulk Assign",icon:Users,color:"bg-amber-50 text-amber-700 border-amber-200",action:()=>{setBulkAssignModal?.(true);setShowTools(false);}},
                {label:"Add Trip",icon:Plus,color:"bg-rose-50 text-rose-700 border-rose-200",action:()=>{setShowAddTripModal?.(true);setShowTools(false);}},
              ].map(item=>(
                <button key={item.label} type="button" onClick={item.action}
                  className={"flex flex-col items-center justify-center gap-2 h-20 rounded-2xl border font-black text-xs transition-all active:scale-95 "+item.color}>
                  <item.icon size={20}/><span className="text-center leading-tight px-1">{item.label}</span>
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
