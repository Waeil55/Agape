import React from 'react';
import { Layers, Navigation, User } from 'lucide-react';
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
//                             Call + Text + Details. Archive inline (admin and
//                             dispatcher only; the delete itself stays
//                             password-gated in App.jsx requestDeleteTrip).
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

// Canonical status badge — EXACT design tokens (keys normalized so 'No Show'
// and 'no show', 'Rerouted' and 'Trip rerouted' all resolve). 'Assigned' is
// the only extension beyond the design (real trips need it; blue family).
// Unknown statuses fail to neutral slate, never crash.
const STATUS_STYLES = {
  completed: 'bg-emerald-100 text-emerald-800',
  'in transit': 'bg-blue-100 text-blue-800',
  'en route': 'bg-amber-100 text-amber-800',
  unassigned: 'bg-rose-100 text-rose-800',
  'no show': 'bg-orange-100 text-orange-800',
  'trip rerouted': 'bg-purple-100 text-purple-800',
  rerouted: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-slate-100 text-slate-700',
  assigned: 'bg-blue-100 text-blue-800',
};
export function getManifestStatusBadge(status) {
  return STATUS_STYLES[String(status || '').trim().toLowerCase()] || 'bg-slate-100 text-slate-700';
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

// Grace window for the on-time metric (arrived ≤ scheduled + grace).
export const ON_TIME_GRACE_MIN = 15;

// ---------------------------------------------------------------------------
// getOnTimeStats — HONEST on-time metric from recorded data only: completed
// trips with BOTH a scheduled time and a pickup arrival time. On-time =
// arrived within graceMin after scheduled. Trips missing either timestamp are
// excluded (never guessed). Zero eligible trips → rate null (callers show
// '—' and explain, instead of inventing a percent).
// Returns { eligible, lateTrips: [{ trip, lateBy }], rate }.
// ---------------------------------------------------------------------------
export function getOnTimeStats(trips = [], graceMin = ON_TIME_GRACE_MIN) {
  const sched = (t) => timeToMinutes(t?.time);
  const arrived = (t) => timeToMinutes(t?.arrivalTime);
  const eligible = (Array.isArray(trips) ? trips : []).filter((t) =>
    t?.status === 'Completed'
    && Number.isFinite(sched(t)) && sched(t) < 1440
    && Number.isFinite(arrived(t)) && arrived(t) < 1440);
  const lateTrips = eligible
    .map((trip) => ({ trip, lateBy: arrived(trip) - sched(trip) }))
    .filter((entry) => entry.lateBy > graceMin)
    .sort((a, b) => b.lateBy - a.lateBy);
  return {
    eligible: eligible.length,
    lateTrips,
    rate: eligible.length ? Math.round(((eligible.length - lateTrips.length) / eligible.length) * 100) : null,
  };
}

// ---------------------------------------------------------------------------
// buildInlineTripActions — role-gated inline bar model. Mirrors
// buildTripActionModel gates: canOperate (admin/dispatcher/fleet_manager),
// callback presence. Drive opens the workspace for ANY assigned trip (even
// terminal ones open read-only progress); unassigned trips get an assign CTA
// for operators. Reassign/Archive are operator-only; Archive has no status
// restriction (matches the design). Everything else belongs in the ⋯ sheet.
// Returns { primary, icons, reassign, archive } descriptors (null when gated).
// ---------------------------------------------------------------------------
export function buildInlineTripActions({ trip, driver, role, callbacks = {} }) {
  const canOperate = role === 'admin' || role === 'dispatcher' || role === 'fleet_manager';
  const terminal = TERMINAL_MANIFEST_STATUSES.has(trip?.status);
  const phone = callbacks.phone || '';
  const primary = (() => {
    if (!callbacks.onDrive) return null;
    if (driver) {
      if (role !== 'driver' && !canOperate) return null;
      return { id: 'drive', label: role === 'driver' ? 'Drive' : 'Drive', onSelect: () => callbacks.onDrive(trip) };
    }
    if (!canOperate || !callbacks.onAssign) return null;
    return { id: 'assign-drive', label: 'Assign to drive', onSelect: () => callbacks.onAssign(trip) };
  })();
  const icons = [
    callbacks.onNavigate && trip?.pickup && { id: 'navigate', label: 'Navigate to pickup', onSelect: () => callbacks.onNavigate(trip) },
    callbacks.onCall && phone && { id: 'call', label: `Call ${phone}`, onSelect: () => callbacks.onCall(trip) },
    callbacks.onMessage && phone && { id: 'message', label: `Text ${phone}`, onSelect: () => callbacks.onMessage(trip) },
  ].filter(Boolean);
  const reassign = callbacks.onReassign && canOperate && !terminal
    ? { id: 'reassign', label: 'Reassign', onSelect: () => callbacks.onReassign(trip) }
    : null;
  const archive = callbacks.onArchive && (role === 'admin' || role === 'dispatcher')
    ? { id: 'archive', label: 'Archive', onSelect: () => callbacks.onArchive(trip) }
    : null;
  return { primary, icons, reassign, archive };
}

// ---------------------------------------------------------------------------
// ManifestKpiStrip — tappable KPI cards driving parent filters. Values are
// always computed from real filtered trips by the parent; this strip never
// invents numbers and renders nothing when items is empty. Item shape:
// { id, label, value, active, activeClass, wide, valueClass, onSelect }.
// ---------------------------------------------------------------------------
export function ManifestKpiStrip({ items = [] }) {
  if (!items.length) return null;
  return (
    <div className="bg-white border-b border-slate-200 shrink-0 z-20 shadow-sm" role="group" aria-label="Trip queue summary">
      <div className="flex px-2 pb-2 gap-1.5 text-center pt-3">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={item.onSelect}
            aria-pressed={!!item.active}
            className={`${item.wide ? 'flex-[1.2]' : 'flex-1'} py-1 px-0.5 rounded-md border flex flex-col items-center justify-center leading-none gap-1 ${
              item.active ? item.activeClass : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            <span className={`font-semibold text-sm tabular-nums ${item.valueClass || ''}`}>{item.value}</span>
            <span className="text-[10px]">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ManifestTripCard — one trip, information-prioritized: decision (time +
// urgency + status) first, client + locations second, role-gated actions last.
// Exact design tokens. Slots: selectSlot (bulk checkbox), assignSlot
// (dispatcher assign block for unassigned trips), noteSlot (notes row).
// Bar: reassign + archive (operator-gated descriptors), call/text icons,
// centered driver chip, ⋯ overflow, Drive primary.
// ---------------------------------------------------------------------------
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
  driverName,
  reassignAction,
  archiveAction,
  primaryAction,
  iconActions = [],
  moreIcon: MoreIcon,
  onMore,
  moreLabel = 'More actions',
}) {
  const cd = countdown || getTripCountdown(trip);
  const statusBadge = getManifestStatusBadge(trip?.status);
  return (
    <article className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" aria-label={`Trip for ${trip?.patient || trip?.bookingId || 'unknown'}`}>
      <div className="px-2 pt-2 pb-1 flex items-start justify-between bg-slate-50/50 border-b border-slate-100">
        <div className="flex items-center gap-2">
          {selectSlot}
          <span className={`text-xl font-bold leading-none tabular-nums ${COUNTDOWN_TIME_TEXT[cd.level]}`}>
            {trip?.time || '—'}
          </span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${COUNTDOWN_BADGE[cd.level]}`}>
            {cd.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {legs > 1 && (
            <button
              type="button"
              onClick={onLegsClick}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full"
              aria-label={`View ${legs} legs for ${trip?.patient || 'trip'}`}
            >
              <Layers size={11} /> {legsLabel || `${legs} ${legs === 1 ? 'leg' : 'legs'}`}
            </button>
          )}
          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${statusBadge}`}>{trip?.status || 'Unknown'}</span>
        </div>
      </div>

      <div className="px-2 py-1 flex justify-between items-center">
        <span className="text-sm font-medium text-slate-700 truncate">{trip?.patient || 'Unknown client'}</span>
        {(trip?.bookingId || trip?.id) && (
          <span className="shrink-0 text-xs font-medium tabular-nums text-slate-500">Trip: {trip.bookingId || trip.id}</span>
        )}
      </div>

      <div className="px-2 pb-1">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-emerald-50/60 p-1.5 rounded-lg border border-emerald-100/50 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide leading-none">Pickup</div>
            </div>
            <div className="text-sm font-medium text-slate-800 leading-tight truncate" title={trip?.pickup || ''}>{trip?.pickup || '—'}</div>
          </div>
          <div className="bg-rose-50/60 p-1.5 rounded-lg border border-rose-100/50 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-[10px] font-semibold text-rose-700 uppercase tracking-wide leading-none">Dropoff</div>
              {mileage && (
                <div className="text-xs font-bold text-slate-700 bg-white/90 px-1.5 py-0.5 rounded shadow-sm border border-slate-200/60 leading-none tabular-nums">{mileage}</div>
              )}
            </div>
            <div className="text-sm font-medium text-slate-800 leading-tight truncate" title={trip?.dropoff || ''}>{trip?.dropoff || '—'}</div>
          </div>
        </div>
      </div>

      {assignSlot}
      {noteSlot}

      <div className="flex items-center gap-2 px-2 pb-2 pt-1 border-t border-slate-100 mt-1">
        {reassignAction && (
          <button type="button" onClick={reassignAction.onClick} className="px-2 py-1 bg-amber-50 text-amber-700 rounded-md text-xs font-semibold border border-amber-200">
            Reassign
          </button>
        )}
        {archiveAction && (
          <button type="button" onClick={archiveAction.onClick} className="px-2 py-1 bg-slate-50 text-slate-600 rounded-md text-xs font-semibold border border-slate-200">
            Archive
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
              className="p-1 bg-slate-50 text-slate-600 rounded-md border border-slate-200"
            >
              <Icon size={14} />
            </button>
          );
        })}
        <div className="flex-1" />
        <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
          <User size={12} /> {driverName}
        </div>
        {onMore && MoreIcon && (
          <button
            type="button"
            onClick={onMore}
            aria-label={typeof moreLabel === 'string' ? moreLabel : 'More actions'}
            title={typeof moreLabel === 'string' ? moreLabel : undefined}
            className="p-1 text-slate-500 bg-slate-50 rounded-md border border-slate-200"
          >
            <MoreIcon size={14} />
          </button>
        )}
        {primaryAction && (
          <button
            type="button"
            onClick={primaryAction.onClick}
            className="px-2 py-1 bg-blue-600 text-white rounded-md text-xs font-semibold flex items-center gap-1"
          >
            <Navigation size={12} /> {primaryAction.label}
          </button>
        )}
      </div>
    </article>
  );
}

export default React.memo(ManifestTripCard);
