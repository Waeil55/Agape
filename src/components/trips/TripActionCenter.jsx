import React, { useEffect, useMemo } from 'react';
import {
  AlertCircle, Archive, BrainCircuit, ClipboardList, Edit2, History, MapPin, MessageSquare,
  Navigation, Phone, RotateCcw, UserRoundCog, X, XCircle,
} from 'lucide-react';
import { resolveClientPhoneForTrip } from '../../utils/clientPhoneResolution';

const TERMINAL_STATUSES = new Set(['Completed', 'Cancelled', 'No Show', 'Rerouted']);

export const buildTripActionModel = ({ trip, role, driver, phone: resolvedPhone, callbacks = {} }) => {
  if (!trip) return [];
  const canOperate = role === 'admin' || role === 'dispatcher' || role === 'fleet_manager';
  const phone = resolvedPhone || resolveClientPhoneForTrip(trip);
  const actions = [
    callbacks.onView && { id: 'view', label: 'Trip details', hint: 'Review the complete trip record', icon: ClipboardList, onSelect: callbacks.onView },
    callbacks.onDrive && canOperate && !TERMINAL_STATUSES.has(trip.status) && {
      id: 'drive',
      label: driver ? 'Open driver workspace' : 'Assign before driving',
      hint: driver ? `Continue as ${driver.name || 'assigned driver'}` : 'A driver is required before work can begin',
      icon: Navigation,
      onSelect: callbacks.onDrive,
      tone: 'primary',
    },
    callbacks.onAssign && canOperate && { id: 'assign', label: driver ? 'Reassign driver' : 'Assign driver', hint: driver?.name || 'Choose an available driver', icon: UserRoundCog, onSelect: callbacks.onAssign },
    callbacks.onSmartAssign && canOperate && { id: 'smart-assign', label: 'AI driver suggestion', hint: 'Review the best available assignment', icon: BrainCircuit, onSelect: callbacks.onSmartAssign },
    callbacks.onNavigate && trip.pickup && { id: 'navigate', label: 'Navigate to pickup', hint: trip.pickup, icon: MapPin, onSelect: callbacks.onNavigate },
    callbacks.onCall && phone && { id: 'call', label: 'Call passenger', hint: phone, icon: Phone, onSelect: callbacks.onCall },
    callbacks.onMessage && phone && { id: 'message', label: 'Message passenger', hint: phone, icon: MessageSquare, onSelect: callbacks.onMessage },
    callbacks.onEdit && canOperate && { id: 'edit', label: 'Edit trip', hint: 'Update manifest details', icon: Edit2, onSelect: callbacks.onEdit },
    callbacks.onToggleInOut && canOperate && { id: 'toggle-in-out', label: trip.inOutTrip || trip.inOut ? 'Remove IN/OUT' : 'Mark IN/OUT', hint: 'Update the trip direction workflow', icon: RotateCcw, onSelect: callbacks.onToggleInOut },
    callbacks.onReroute && canOperate && { id: 'reroute', label: 'Reroute trip', hint: 'Record this trip as rerouted', icon: MapPin, onSelect: callbacks.onReroute, tone: 'warning' },
    callbacks.onNoShow && canOperate && { id: 'no-show', label: 'Mark no show', hint: 'Record a passenger no-show', icon: AlertCircle, onSelect: callbacks.onNoShow, tone: 'warning' },
    callbacks.onCancel && canOperate && { id: 'cancel', label: 'Cancel trip', hint: 'Record this trip as cancelled', icon: XCircle, onSelect: callbacks.onCancel, tone: 'danger' },
    callbacks.onAudit && { id: 'audit', label: 'Audit history', hint: 'Review recorded changes', icon: History, onSelect: callbacks.onAudit },
    callbacks.onRestore && role === 'admin' && { id: 'restore', label: 'Restore trip', hint: 'Return this trip to operations', icon: RotateCcw, onSelect: callbacks.onRestore, tone: 'success' },
    callbacks.onArchive && (role === 'admin' || role === 'dispatcher') && { id: 'archive', label: 'Archive trip', hint: 'Password confirmation is required', icon: Archive, onSelect: callbacks.onArchive, tone: 'danger' },
  ];
  return actions.filter(Boolean);
};

const TripActionCenter = ({ open, trip, driver, phone, role, onClose, callbacks = {} }) => {
  const actions = useMemo(
    () => buildTripActionModel({ trip, driver, phone, role, callbacks }),
    [callbacks, driver, phone, role, trip],
  );

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open || !trip) return null;
  const title = trip.patient || trip.memberName || trip.bookingId || trip.id || 'Trip';

  return (
    <div className="fixed inset-0 z-[260] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Actions for ${title}`}
        className="max-h-[88vh] w-full overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-xl sm:rounded-3xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Navigation size={19} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-700">Trip action center</p>
            <h2 className="truncate text-lg font-semibold text-slate-950">{title}</h2>
            <p className="truncate text-xs font-semibold text-slate-500">{trip.bookingId || trip.id} · {trip.time || 'No time'} · {trip.status || 'Unknown status'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close trip actions" className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200"><X size={19} /></button>
        </header>

        <div className="grid max-h-[65vh] grid-cols-1 gap-2 overflow-y-auto p-3 pb-6 sm:grid-cols-2 sm:p-4">
          {actions.map((action) => {
            const Icon = action.icon;
            const tone = action.tone === 'primary'
              ? 'border-blue-200 bg-blue-600 text-white hover:bg-blue-700'
              : action.tone === 'danger'
                ? 'border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100'
              : action.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                  : action.tone === 'warning'
                    ? 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
                  : 'border-slate-200 bg-white text-slate-900 hover:border-blue-200 hover:bg-blue-50';
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => { action.onSelect?.(trip); onClose?.(); }}
                className={`flex min-h-[68px] items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${tone}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${action.tone === 'primary' ? 'bg-white/15' : 'bg-white shadow-sm'}`}><Icon size={17} /></span>
                <span className="min-w-0"><span className="block text-sm font-bold">{action.label}</span><span className={`block truncate text-[11px] font-semibold ${action.tone === 'primary' ? 'text-blue-100' : 'text-slate-500'}`}>{action.hint}</span></span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default React.memo(TripActionCenter);
