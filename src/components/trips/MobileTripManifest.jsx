import React from 'react';
import { Layers, Navigation } from 'lucide-react';
import { timeToMinutes, tripCalendarDateKey, localCalendarYmd } from '../../utils/tripDate';

// =============================================================================
// MobileTripManifest — shared mobile-only trip manifest language.
//
// ONE authoritative card + KPI strip for every mobile portal (driver,
// dispatcher, admin). Desktop views are untouched. Parents own data, filters,
// and callbacks; this module owns presentation + the role/action matrix so
// buttons are never mixed across roles:
//
//   driver                → Drive (workflow) + Navigate + Call + Text + Details.
//                             NEVER Reassign / Archive / Edit / Assign.
//   dispatcher/fleet_manager → Drive (workspace) + Reassign/Assign + Navigate +
//                             Call + Text + Details. Archive lives in the
//                             TripActionCenter sheet (password-gated there).
//   admin                 → everything above incl. Archive/Restore via sheet.
//
// The inline bar mirrors src/components/trips/TripActionCenter.jsx gates
// (canOperate, terminal statuses) — keep both matrices in sync. Anything the
// bar hides must also be absent from the sheet and vice versa.
//
// Design: light-only, slate palette, rounded-xl cards, semibold body,
// tabular numerals for time/mileage/counts, min 44px touch targets on icon
// buttons (min-h-11 on text buttons), pb clearance handled by parents.
// =============================================================================

export const TERMINAL_MANIFEST_STATUSES = new Set(['Completed', 'Cancelled', 'No Show', 'Rerouted']);

export const ACTIVE_MANIFEST_STATUSES = new Set([
  'In Progress', 'In Mission', 'At Pickup', 'In Transit', 'At Dropoff',
  'En Route', 'Navigating Pickup', 'Navigating Dropoff', 'Arrived',
]);

// Canonical status badge. Single source — TripsPage imports this (its former
// local copy is removed). Unknown statuses fail to neutral slate, never crash.
export function getManifestStatusBadge(status) {
  if (status === 'Unassigned') return 'bg-rose-100 text-rose-700';
  if (status === 'Assigned') return 'bg-blue-100 text-blue-700';
  if (ACTIVE_MANIFEST_STATUSES.has(status)) return 'bg-amber-100 text-amber-700';
  if (status === 'Completed') return 'bg-emerald-100 text-emerald-700';
  if (status === 'Cancelled') return 'bg-rose-100 text-rose-700';
  if (status === 'No Show') return 'bg-amber-100 text-amber-700';
  if (status === 'Rerouted') return 'bg-purple-100 text-purple-700';
  return 'bg-slate-100 text-slate-700';
}

// ---------------------------------------------------------------------------
// getTripCountdown — deterministic scheduled-time countdown for cards.
//
// Uses tripCalendarDateKey scoping (never raw string equality) + timeToMinutes.
// Returns { minutes: number|null, level, label }:
//   done        — terminal status (Completed/Cancelled/No Show/Rerouted).
//   unscheduled — no parseable time (Will Call keeps its own label).
//   overdue     — scheduled time passed, trip still open.
//   critical    — within 20 min. soon — within 60 min. later — beyond that.
// Fail closed: anything unparseable is 'unscheduled', never a guessed time.
// ---------------------------------------------------------------------------
export function getTripCountdown(trip, now = new Date()) {
  const status = String(trip?.status || '');
  if (TERMINAL_MANIFEST_STATUSES.has(status)) {
    return { minutes: null, level: 'done', label: 'Done' };
  }
  const rawTime = String(trip?.time || '').trim();
  if (/will\s*call/i.test(rawTime)) {
    return { minutes: null, level: 'unscheduled', label: 'Will Call' };
  }
  const clock = timeToMinutes(trip?.time);
  if (!Number.isFinite(clock) || clock < 0 || clock >= 1440) {
    return { minutes: null, level: 'unscheduled', label: rawTime ? 'No time' : 'No time' };
  }
  const serviceDate = tripCalendarDateKey(trip?.date) || localCalendarYmd(now);
  const scheduled = new Date(`${serviceDate}T00:00:00`);
  scheduled.setHours(Math.floor(clock / 60), clock % 60, 0, 0);
  const minutes = Math.round((scheduled.getTime() - now.getTime()) / 60000);
  if (minutes < 0) return { minutes, level: 'overdue', label: 'Overdue' };
  if (minutes <= 20) return { minutes, level: 'critical', label: minutes === 0 ? 'Now' : `${minutes}m away` };
  if (minutes <= 60) return { minutes, level: 'soon', label: `${minutes}m away` };
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return { minutes, level: 'later', label: rest ? `${hours}h ${rest}m away` : `${hours}h away` };
}

export const COUNTDOWN_TIME_TEXT = {
  done: 'text-slate-400',
  overdue: 'text-rose-600',
  critical: 'text-rose-600',
  soon: 'text-amber-600',
  later: 'text-slate-900',
  unscheduled: 'text-slate-500',
};

export const COUNTDOWN_BADGE = {
  done: 'bg-emerald-50 text-emerald-700',
  overdue: 'bg-rose-100 text-rose-700',
  critical: 'bg-rose-50 text-rose-700',
  soon: 'bg-amber-50 text-amber-700',
  later: 'bg-slate-100 text-slate-500',
  unscheduled: 'bg-slate-100 text-slate-500',
};

// ---------------------------------------------------------------------------
// buildInlineTripActions — role-gated inline bar model. Mirrors
// buildTripActionModel gates: canOperate (admin/dispatcher/fleet_manager),
// terminal statuses, callback presence. Returns { primary, icons } where
// primary is the Drive descriptor (or assign-driver CTA when unassigned) and
// icons are navigate/call/message descriptors. Everything else belongs in the
// TripActionCenter sheet (⋯ button), never inline.
// ---------------------------------------------------------------------------
export function buildInlineTripActions({ trip, driver, role, callbacks = {} }) {
  const canOperate = role === 'admin' || role === 'dispatcher' || role === 'fleet_manager';
  const terminal = TERMINAL_MANIFEST_STATUSES.has(trip?.status);
  const phone = callbacks.phone || '';
  const primary = (() => {
    if (!callbacks.onDrive || terminal) return null;
    if (driver) {
      if (role !== 'driver' && !canOperate) return null;
      return { id: 'drive', label: role === 'driver' ? 'Drive' : 'Drive trip', onSelect: () => callbacks.onDrive(trip) };
    }
    if (!canOperate || !callbacks.onAssign) return null;
    return { id: 'assign-drive', label: 'Assign to drive', onSelect: () => callbacks.onAssign(trip) };
  })();
  const icons = [
    callbacks.onNavigate && trip?.pickup && { id: 'navigate', label: 'Navigate to pickup', onSelect: () => callbacks.onNavigate(trip) },
    callbacks.onCall && phone && { id: 'call', label: `Call ${phone}`, onSelect: () => callbacks.onCall(trip) },
    callbacks.onMessage && phone && { id: 'message', label: `Text ${phone}`, onSelect: () => callbacks.onMessage(trip) },
  ].filter(Boolean);
  return { primary, icons };
}

// ---------------------------------------------------------------------------
// ManifestKpiStrip — tappable KPI cards driving parent filters. Values are
// always computed from real filtered trips by the parent; this strip never
// invents numbers and renders nothing when items is empty.
// ---------------------------------------------------------------------------
export function ManifestKpiStrip({ items = [] }) {
  if (!items.length) return null;
  return (
    <div className="grid shrink-0 grid-cols-4 gap-1.5" role="group" aria-label="Trip queue summary">
      {items.map((item) => {
        const active = !!item.active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={item.onSelect}
            aria-pressed={active}
            className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 leading-none transition-colors active:scale-95 ${
              active ? item.activeClass : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            <span className="text-sm font-bold tabular-nums">{item.value}</span>
            <span className="text-[10px] font-semibold">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ManifestTripCard — one trip, information-prioritized: decision (time +
// urgency + status) first, client + locations second, role-gated actions last.
// Slots: selectSlot (bulk checkbox), assignSlot (dispatcher assign block),
// noteSlot (notes/flags), footerSlot (driver chip / extra meta).
// ---------------------------------------------------------------------------
const ICON_BUTTON_CLASS =
  'flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 active:scale-95 transition-colors';

export function ManifestTripCard({
  trip,
  countdown,
  legs,
  legsLabel,
  onLegsClick,
  mileage,
  selectSlot,
  assignSlot,
  noteSlot,
  footerSlot,
  primaryAction,
  iconActions = [],
  moreIcon: MoreIcon,
  onMore,
  moreLabel = 'More actions',
}) {
  const cd = countdown || getTripCountdown(trip);
  const statusBadge = getManifestStatusBadge(trip?.status);
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label={`Trip for ${trip?.patient || trip?.bookingId || 'unknown'}`}>
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-3 pt-2.5 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          {selectSlot}
          <span className={`text-xl font-bold leading-none tabular-nums ${COUNTDOWN_TIME_TEXT[cd.level]}`}>
            {trip?.time || '—'}
          </span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${COUNTDOWN_BADGE[cd.level]}`}>
            {cd.label}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {legs > 1 && (
            <button
              type="button"
              onClick={onLegsClick}
              className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500 active:scale-95"
              aria-label={`View ${legs} legs for ${trip?.patient || 'trip'}`}
            >
              <Layers size={11} /> {legsLabel || `${legs} legs`}
            </button>
          )}
          <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${statusBadge}`}>{trip?.status || 'Unknown'}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <p className="min-w-0 truncate text-sm font-semibold text-slate-900">{trip?.patient || 'Unknown client'}</p>
        {(trip?.bookingId || trip?.id) && (
          <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-400">Trip: {trip.bookingId || trip.id}</span>
        )}
      </div>

      <div className="px-3 pb-1.5">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-emerald-100/70 bg-emerald-50/60 p-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Pickup</p>
            <p className="mt-0.5 truncate text-[13px] font-semibold leading-tight text-slate-800" title={trip?.pickup || ''}>{trip?.pickup || '—'}</p>
          </div>
          <div className="rounded-lg border border-rose-100/70 bg-rose-50/60 p-1.5">
            <div className="flex items-center justify-between gap-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-rose-700">Dropoff</p>
              {mileage && (
                <span className="rounded border border-slate-200/70 bg-white/90 px-1.5 py-px text-[11px] font-bold tabular-nums text-slate-700 shadow-sm">{mileage}</span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[13px] font-semibold leading-tight text-slate-800" title={trip?.dropoff || ''}>{trip?.dropoff || '—'}</p>
          </div>
        </div>
      </div>

      {assignSlot}
      {noteSlot}

      <div className="flex items-center gap-1.5 border-t border-slate-100 px-3 py-2">
        {primaryAction && (
          <button
            type="button"
            onClick={primaryAction.onClick}
            className="flex min-h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white shadow-sm active:scale-95 transition-transform hover:bg-blue-700"
          >
            <Navigation size={13} /> {primaryAction.label}
          </button>
        )}
        {iconActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              onClick={action.onClick}
              title={action.label}
              aria-label={action.ariaLabel || action.label}
              className={ICON_BUTTON_CLASS}
            >
              <Icon size={16} />
            </button>
          );
        })}
        <div className="min-w-0 flex-1">{footerSlot}</div>
        {onMore && MoreIcon && (
          <button
            type="button"
            onClick={onMore}
            aria-label={typeof moreLabel === 'string' ? moreLabel : 'More actions'}
            title={typeof moreLabel === 'string' ? moreLabel : undefined}
            className={ICON_BUTTON_CLASS}
          >
            <MoreIcon size={16} />
          </button>
        )}
      </div>
    </article>
  );
}

export default React.memo(ManifestTripCard);
