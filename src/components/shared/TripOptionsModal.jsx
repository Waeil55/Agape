import React, { useEffect, useRef, useState } from 'react';
import { 
  X, 
  ChevronRight, 
  ChevronLeft,
  Edit2, 
  UserCheck, 
  CheckCircle2, 
  Route, 
  AlertCircle, 
  XCircle, 
  Archive,
  ArrowRight
} from 'lucide-react';

const getStatusBadgeStyle = (status) => {
  const s = String(status || '').toLowerCase().trim();
  if (['completed', 'arrived at dropoff', 'dropoff complete'].includes(s)) {
    return {
      dot: 'bg-emerald-500',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    };
  }
  if (['no show', 'no_show'].includes(s)) {
    return {
      dot: 'bg-orange-500',
      badge: 'bg-orange-50 text-orange-700 border-orange-200/80',
    };
  }
  if (['rerouted'].includes(s)) {
    return {
      dot: 'bg-amber-500',
      badge: 'bg-amber-50 text-amber-700 border-amber-200/80',
    };
  }
  if (['cancelled', 'canceled'].includes(s)) {
    return {
      dot: 'bg-rose-500',
      badge: 'bg-rose-50 text-rose-700 border-rose-200/80',
    };
  }
  if (['unassigned'].includes(s)) {
    return {
      dot: 'bg-rose-500',
      badge: 'bg-rose-50 text-rose-700 border-rose-200/80',
    };
  }
  return {
    dot: 'bg-blue-600',
    badge: 'bg-blue-50 text-blue-700 border-blue-200/80',
  };
};

export const TripOptionsModal = ({
  isOpen,
  onClose,
  trip,
  role = 'dispatcher',
  driverName = '',
  onEditDetails,
  onReassignDriver: onReassignDriverProp,
  onReassign,
  onTransferTrip,
  onMarkCompleted,
  onComplete,
  onMarkRerouted,
  onRerouted,
  onPassengerNoShow,
  onNoShow,
  onCancelTrip,
  onCancel,
  onConfirmException,
  onArchiveTrip: onArchiveTripProp,
  onArchive,
}) => {
  const panelRef = useRef(null);
  const [selectedException, setSelectedException] = useState(null);
  const [exceptionReason, setExceptionReason] = useState('');
  const [exceptionNote, setExceptionNote] = useState('');
  const [savingException, setSavingException] = useState(false);
  const [exceptionError, setExceptionError] = useState('');

  const onReassignDriver = onReassignDriverProp || onReassign;
  const onArchiveTrip = onArchiveTripProp || onArchive;
  const handleCompleted = onMarkCompleted || onComplete;
  const handleRerouted = onMarkRerouted || onRerouted;
  const handleNoShow = onPassengerNoShow || onNoShow;
  const handleCancel = onCancelTrip || onCancel;

  // Reset internal exception form when modal opens or trip changes
  useEffect(() => {
    setSelectedException(null);
    setExceptionReason('');
    setExceptionNote('');
    setSavingException(false);
    setExceptionError('');
  }, [isOpen, trip?.id]);

  useEffect(() => {
    if (!isOpen) return;
    document.documentElement.classList.add('trip-window-open');
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.documentElement.classList.remove('trip-window-open');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !trip) return null;

  const isAdmin = role === 'admin' || role === 'dispatcher';
  const isDriver = role === 'driver';
  const tripNumber = trip.bookingId || trip.id || '—';
  const passengerName = trip.patient || 'Passenger';
  const resolvedDriver = driverName || trip.driverName || trip.driver || 'Unassigned';
  const currentStatus = trip.status || 'Assigned';
  const badgeStyle = getStatusBadgeStyle(currentStatus);

  const sLower = String(currentStatus).toLowerCase().trim();
  const isTerminal = ['completed', 'cancelled', 'canceled', 'no show', 'no_show', 'rerouted'].includes(sLower);

  const handleExceptionClick = (status, directHandler) => {
    if (onConfirmException) {
      setSelectedException(status);
      setExceptionReason('');
      setExceptionNote('');
      setExceptionError('');
    } else if (directHandler) {
      onClose();
      directHandler(trip);
    }
  };

  const handleConfirmExceptionSubmit = async () => {
    if (!selectedException || !onConfirmException || savingException) return;
    setSavingException(true);
    setExceptionError('');
    try {
      await onConfirmException(trip, selectedException, {
        reason: exceptionReason,
        note: exceptionNote.trim(),
      });
      onClose();
    } catch (err) {
      setExceptionError(err?.message || 'Failed to update trip status');
    } finally {
      setSavingException(false);
    }
  };

  return (
    <div
      className="trip-window-overlay bg-black/40"
      style={{ zIndex: 140 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`trip-options-title-${trip.id}`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="trip-window-panel max-w-[23.5rem] p-4 sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Title / Back + Close Button */}
        <div className="flex items-center justify-between pb-3.5 shrink-0">
          {selectedException ? (
            <button
              type="button"
              onClick={() => setSelectedException(null)}
              className="flex items-center gap-1 -ml-1.5 px-2 py-1 text-sm font-semibold text-blue-600 hover:text-blue-700 active:scale-95 transition-all rounded-lg cursor-pointer"
            >
              <ChevronLeft size={18} />
              <span>Back</span>
            </button>
          ) : (
            <h2
              id={`trip-options-title-${trip.id}`}
              className="text-lg font-bold text-slate-900 tracking-tight"
            >
              Trip #{tripNumber} Options
            </h2>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close options"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-2.5 pr-0.5 pb-1">
          {/* Passenger & Driver Summary Card */}
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-xs text-slate-500 font-medium truncate">
                Passenger: <span className="text-slate-900 font-bold">{passengerName}</span>
              </p>
              <p className="text-xs text-slate-500 font-medium truncate">
                Driver: <span className="text-blue-600 font-bold">{resolvedDriver}</span>
              </p>
            </div>
            <span
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${badgeStyle.badge}`}
            >
              <span className={`w-2 h-2 rounded-full ${badgeStyle.dot}`} />
              {currentStatus}
            </span>
          </div>

          {selectedException ? (
            /* Exception confirmation form (Reason + Note) */
            <div className="space-y-3 pt-1">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Status Update</p>
                <p className="text-sm font-bold text-slate-900">Mark as {selectedException}</p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Reason (optional)
                </label>
                <select
                  value={exceptionReason}
                  onChange={(e) => setExceptionReason(e.target.value)}
                  className="w-full bg-white border border-slate-200 text-slate-800 text-xs font-medium rounded-xl px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Select reason</option>
                  <option value="Heavy Traffic">Heavy Traffic</option>
                  <option value="Client Delay">Client Delay</option>
                  <option value="Vehicle Issue">Vehicle Issue</option>
                  <option value="Weather Conditions">Weather Conditions</option>
                  <option value="No Show / Unreachable">No Show / Unreachable</option>
                  <option value="Client Cancelled">Client Cancelled</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Note (optional)
                </label>
                <textarea
                  placeholder="Add details about this update..."
                  value={exceptionNote}
                  onChange={(e) => setExceptionNote(e.target.value)}
                  rows={2}
                  className="w-full bg-white border border-slate-200 text-slate-800 text-xs font-medium rounded-xl px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
                />
              </div>

              {exceptionError && (
                <p className="text-xs font-semibold text-rose-600">{exceptionError}</p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedException(null)}
                  disabled={savingException}
                  className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleConfirmExceptionSubmit}
                  disabled={savingException}
                  className="flex-1 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold transition-all active:scale-95 disabled:opacity-50 shadow-sm"
                >
                  {savingException ? 'Saving…' : `Confirm ${selectedException}`}
                </button>
              </div>
            </div>
          ) : (
            /* Action Rows */
            <>
              {/* Action Row 1: Edit Trip Details */}
              {onEditDetails && (
                <button
                  type="button"
                  onClick={() => { onClose(); onEditDetails(trip); }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-blue-200/80 bg-blue-50/40 hover:bg-blue-50 active:bg-blue-100/60 text-blue-700 transition-all text-sm font-semibold cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <Edit2 size={18} className="shrink-0 text-blue-600" />
                    <span>Edit Trip Details</span>
                  </div>
                  <ChevronRight size={18} className="shrink-0 opacity-60 text-blue-700" />
                </button>
              )}

              {/* Action Row 2: Reassign Driver (Admin/Dispatcher) */}
              {isAdmin && onReassignDriver && (
                <button
                  type="button"
                  onClick={() => { onClose(); onReassignDriver(trip); }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-indigo-200/80 bg-indigo-50/40 hover:bg-indigo-50 active:bg-indigo-100/60 text-indigo-700 transition-all text-sm font-semibold cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <UserCheck size={18} className="shrink-0 text-indigo-600" />
                    <span>Reassign Driver</span>
                  </div>
                  <ChevronRight size={18} className="shrink-0 opacity-60 text-indigo-700" />
                </button>
              )}

              {/* Action Row 2 (Driver variant): Transfer Trip */}
              {isDriver && onTransferTrip && !isTerminal && (
                <button
                  type="button"
                  onClick={() => { onClose(); onTransferTrip(trip); }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-indigo-200/80 bg-indigo-50/40 hover:bg-indigo-50 active:bg-indigo-100/60 text-indigo-700 transition-all text-sm font-semibold cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <ArrowRight size={18} className="shrink-0 text-indigo-600" />
                    <span>Transfer Trip</span>
                  </div>
                  <ChevronRight size={18} className="shrink-0 opacity-60 text-indigo-700" />
                </button>
              )}

              {/* Action Row 3: Mark Completed */}
              {handleCompleted && !isTerminal && (
                <button
                  type="button"
                  onClick={() => { onClose(); handleCompleted(trip); }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/40 hover:bg-emerald-50 active:bg-emerald-100/60 text-emerald-700 transition-all text-sm font-semibold cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
                    <span>Mark Completed</span>
                  </div>
                  <ChevronRight size={18} className="shrink-0 opacity-60 text-emerald-700" />
                </button>
              )}

              {/* Action Row 4: Mark Rerouted */}
              {(handleRerouted || onConfirmException) && !isTerminal && (
                <button
                  type="button"
                  onClick={() => handleExceptionClick('Rerouted', handleRerouted)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-amber-200/80 bg-amber-50/40 hover:bg-amber-50 active:bg-amber-100/60 text-amber-800 transition-all text-sm font-semibold cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <Route size={18} className="shrink-0 text-amber-600" />
                    <span>Mark Rerouted</span>
                  </div>
                  <ChevronRight size={18} className="shrink-0 opacity-60 text-amber-800" />
                </button>
              )}

              {/* Action Row 5: Passenger No Show */}
              {(handleNoShow || onConfirmException) && !isTerminal && (
                <button
                  type="button"
                  onClick={() => handleExceptionClick('No Show', handleNoShow)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-orange-200/80 bg-orange-50/40 hover:bg-orange-50 active:bg-orange-100/60 text-orange-800 transition-all text-sm font-semibold cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <AlertCircle size={18} className="shrink-0 text-orange-600" />
                    <span>Passenger No Show</span>
                  </div>
                  <ChevronRight size={18} className="shrink-0 opacity-60 text-orange-800" />
                </button>
              )}

              {/* Action Row 6: Cancel Trip */}
              {(handleCancel || onConfirmException) && !isTerminal && (
                <button
                  type="button"
                  onClick={() => handleExceptionClick('Cancelled', handleCancel)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-rose-200/80 bg-rose-50/40 hover:bg-rose-50 active:bg-rose-100/60 text-rose-700 transition-all text-sm font-semibold cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <XCircle size={18} className="shrink-0 text-rose-600" />
                    <span>Cancel Trip</span>
                  </div>
                  <ChevronRight size={18} className="shrink-0 opacity-60 text-rose-700" />
                </button>
              )}

              {/* Action Row 7: Archive Trip (Admin/Dispatcher only) */}
              {isAdmin && onArchiveTrip && (
                <button
                  type="button"
                  onClick={() => { onClose(); onArchiveTrip(trip); }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-slate-100 active:bg-slate-200/60 text-slate-700 transition-all text-sm font-semibold cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <Archive size={18} className="shrink-0 text-slate-500" />
                    <span>Archive Trip</span>
                  </div>
                  <ChevronRight size={18} className="shrink-0 opacity-60 text-slate-600" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TripOptionsModal;
