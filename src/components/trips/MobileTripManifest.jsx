import React from 'react';
import { Layers, Navigation, User } from 'lucide-react';
import { timeToMinutes, tripCalendarDateKey } from '../../utils/tripDate';
import { getTripActionCapabilities, isTripActionTerminal, TRIP_TERMINAL_STATUSES } from './tripActionPolicy';

// =============================================================================
// MobileTripManifest — shared mobile-only trip manifest language.
//
// ONE authoritative card + KPI strip for every mobile portal (driver,
// dispatcher, admin). Desktop views are untouched. Parents own data, filters,
// and callbacks; this module owns presentation + the role/action matrix so
// buttons are never mixed across roles:
//
//   driver                → Drive (workflow) + Call + Text + Details.
//                             NEVER Reassign / Archive / Edit / Assign.
//   dispatcher/fleet_manager → Drive (workspace) + Reassign/Assign +
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

export const TERMINAL_MANIFEST_STATUSES = TRIP_TERMINAL_STATUSES;
export { isTripActionTerminal };

export const ACTIVE_MANIFEST_STATUSES = new Set([
  'In Progress', 'In Mission', 'At Pickup', 'In Transit', 'At Dropoff',
  'En Route', 'Navigating Pickup', 'Navigating Dropoff', 'Arrived',
]);
const ACTIVE_MANIFEST_STATUS_KEYS = new Set(
  [...ACTIVE_MANIFEST_STATUSES].map((status) => status.toLowerCase()),
);

export function isActiveManifestTrip(trip) {
  return !isTripActionTerminal(trip)
    && ACTIVE_MANIFEST_STATUS_KEYS.has(String(trip?.status || '').trim().toLowerCase());
}

export function isCompletedManifestTrip(trip) {
  const status = String(trip?.status || '').trim().toLowerCase();
  return status === 'completed' || Boolean(trip?.completedAt && !TRIP_TERMINAL_STATUSES.has(status));
}

export function getManifestDisplayStatus(trip) {
  return isCompletedManifestTrip(trip) ? 'Completed' : (trip?.status || 'Unknown');
}

// Canonical status badge — EXACT design tokens (keys normalized so 'No Show'
// and 'no show', 'Rerouted' and 'Trip rerouted' all resolve). 'Assigned' is
// the only extension beyond the design (real trips need it; blue family).
// Unknown statuses fail to neutral slate, never crash.
const STATUS_STYLES = {
  completed: 'bg-emerald-100 text-emerald-800',
  'in progress': 'bg-blue-100 text-blue-800',
  'in mission': 'bg-blue-100 text-blue-800',
  'at pickup': 'bg-emerald-100 text-emerald-800',
  'at dropoff': 'bg-emerald-100 text-emerald-800',
  'in transit': 'bg-blue-100 text-blue-800',
  'en route': 'bg-amber-100 text-amber-800',
  'navigating pickup': 'bg-blue-100 text-blue-800',
  'navigating dropoff': 'bg-blue-100 text-blue-800',
  arrived: 'bg-emerald-100 text-emerald-800',
  unassigned: 'bg-rose-100 text-rose-800',
  'no show': 'bg-orange-100 text-orange-800',
  'trip rerouted': 'bg-purple-100 text-purple-800',
  rerouted: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-slate-100 text-slate-700',
  canceled: 'bg-slate-100 text-slate-700',
  transferred: 'bg-slate-100 text-slate-700',
  no_show: 'bg-orange-100 text-orange-800',
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
  if (isTripActionTerminal(trip)) {
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
  const serviceDate = tripCalendarDateKey(trip?.date);
  if (!serviceDate) {
    return { minutes: null, level: 'unscheduled', label: 'Date needed' };
  }
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
    isCompletedManifestTrip(t)
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
// buildTripActionModel gates: explicit role, assignment, and terminal status,
// callback presence. Drive opens the workspace for ANY assigned trip (even
// terminal ones open read-only progress); unassigned trips get an assign CTA
// for operators. Reassign/Archive are operator-only; Archive has no status
// restriction (matches the design). Everything else belongs in the ⋯ sheet.
// Returns { primary, icons, reassign, archive } descriptors (null when gated).
// ---------------------------------------------------------------------------
export function buildInlineTripActions({ trip, driver, role, callbacks = {} }) {
  const access = getTripActionCapabilities({ role, trip, hasAssignedDriver: Boolean(driver) });
  const phone = callbacks.phone || '';
  const primary = (() => {
    if (!callbacks.onDrive) return null;
    if (driver) {
      if (!access.canOpenWorkflow) return null;
      const active = isActiveManifestTrip(trip);
      return { id: 'drive', label: active ? 'Continue' : 'Drive', onSelect: () => callbacks.onDrive(trip) };
    }
    if (!access.canAssign || !callbacks.onAssign) return null;
    return { id: 'assign-drive', label: 'Assign to drive', onSelect: () => callbacks.onAssign(trip) };
  })();
  const icons = [
    callbacks.onNavigate && access.canShowInlineNavigation && trip?.pickup && { id: 'navigate', label: 'Navigate to pickup', onSelect: () => callbacks.onNavigate(trip) },
    callbacks.onCall && phone && access.canCommunicate && { id: 'call', label: `Call ${phone}`, onSelect: () => callbacks.onCall(trip) },
    callbacks.onMessage && phone && access.canCommunicate && { id: 'message', label: `Text ${phone}`, onSelect: () => callbacks.onMessage(trip) },
  ].filter(Boolean);
  const reassign = callbacks.onReassign && access.canReassign
    ? { id: 'reassign', label: 'Reassign', onSelect: () => callbacks.onReassign(trip) }
    : null;
  const archive = callbacks.onArchive && access.canArchive
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
            className={`${item.wide ? 'flex-[1.2]' : 'flex-1'} min-h-11 rounded-xl border px-0.5 py-1 flex flex-col items-center justify-center leading-none gap-1 ${
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

export function getManifestAddressLines(value, explicitCity = '') {
  const rawAddress = typeof value === 'object'
    ? String(value?.address || value?.formattedAddress || '').trim()
    : String(value || '').trim();
  const city = String(explicitCity || (typeof value === 'object' ? value?.city || '' : '')).trim();
  if (!rawAddress) return { street: '—', locality: city };
  const parts = rawAddress.split(',').map((part) => part.trim()).filter(Boolean);
  if (city) {
    const cityIndex = parts.findIndex((part) => part.toLowerCase() === city.toLowerCase());
    if (cityIndex > 0) {
      return { street: parts.slice(0, cityIndex).join(', '), locality: parts.slice(cityIndex).join(', ') };
    }
    return { street: rawAddress, locality: city };
  }
  if (parts.length < 2) return { street: rawAddress, locality: '' };
  return { street: parts[0], locality: parts.slice(1).join(', ') };
}

// ---------------------------------------------------------------------------
// ManifestTripCard — one trip, information-prioritized: decision (time +
// urgency + status) first, client + locations second, role-gated actions last.
// Exact design tokens. Slots: selectSlot (bulk checkbox), assignSlot
// (optional parent content), noteSlot (notes row). The primary and overflow
// controls stay pinned on narrow phones; lower-priority actions progressively
// move to the parent's More sheet instead of creating a hidden action rail.
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
  onTimeEdit,
}) {
  const cd = countdown || getTripCountdown(trip);
  const displayStatus = getManifestDisplayStatus(trip);
  const statusBadge = getManifestStatusBadge(displayStatus);
  const pickup = getManifestAddressLines(trip?.pickup, trip?.pickupCity);
  const dropoff = getManifestAddressLines(trip?.dropoff, trip?.dropoffCity);
  return (
    <article className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" aria-label={`Trip for ${trip?.patient || trip?.bookingId || 'unknown'}`}>
      {/* Header — time + countdown + legs + status */}
      <div className="px-2 pt-1 pb-0.5 flex items-start justify-between gap-2 bg-slate-50/50 border-b border-slate-100">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {selectSlot}
          {onTimeEdit ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onTimeEdit(trip); }}
              className={`text-base font-bold leading-none tabular-nums hover:underline decoration-1 underline-offset-2 ${COUNTDOWN_TIME_TEXT[cd.level]}`}
              title="Edit schedule"
            >
              {trip?.time || '—'}
            </button>
          ) : (
            <span className={`text-base font-bold leading-none tabular-nums ${COUNTDOWN_TIME_TEXT[cd.level]}`}>
              {trip?.time || '—'}
            </span>
          )}
          <span className={`text-[10px] font-semibold px-1.5 py-px rounded-full ${COUNTDOWN_BADGE[cd.level]}`}>
            {cd.label}
          </span>
        </div>
        <div className="flex max-w-[48%] shrink-0 items-center gap-1">
          {legs > 0 && (
            onLegsClick ? (
              <button
                type="button"
                onClick={onLegsClick}
                className="flex min-h-9 items-center rounded-xl text-[10px] font-semibold text-slate-600"
                aria-label={`View ${legs} legs for ${trip?.patient || 'trip'}`}
              >
                <span className="flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-px">
                  <Layers size={10} /> {legsLabel || `${legs} ${legs === 1 ? 'leg' : 'legs'}`}
                </span>
              </button>
            ) : (
              <span className="flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-semibold text-slate-600">
                <Layers size={10} /> {legsLabel || `${legs} ${legs === 1 ? 'leg' : 'legs'}`}
              </span>
            )
          )}
          <span title={displayStatus} className={`max-w-[100px] truncate px-1.5 py-px rounded text-[10px] font-semibold ${statusBadge}`}>{displayStatus}</span>
        </div>
      </div>

      {/* Client + trip ID */}
      <div className="px-2 py-0 flex justify-between items-center gap-2">
        <span className="min-w-0 truncate text-[13px] font-semibold text-slate-700">{trip?.patient || 'Unknown client'}</span>
        {(trip?.bookingId || trip?.id) && (
          <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400">#{trip.bookingId || trip.id}</span>
        )}
      </div>

      {/* Pickup / Dropoff grid — compact cells */}
      <div className="px-2 pb-0.5">
        <div className="grid grid-cols-2 gap-1">
          <div className="bg-emerald-50/60 p-1 rounded-lg border border-emerald-100/50 min-w-0">
            <div className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider leading-none mb-0.5">Pickup</div>
            <div className="truncate text-[13px] font-semibold leading-tight text-slate-800" title={pickup.street}>{pickup.street}</div>
            {pickup.locality && <div className="mt-0.5 truncate text-[11px] font-medium leading-none text-slate-400" title={pickup.locality}>{pickup.locality}</div>}
          </div>
          <div className="bg-rose-50/60 p-1 rounded-lg border border-rose-100/50 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-[9px] font-bold text-rose-600 uppercase tracking-wider leading-none">Dropoff</div>
              {mileage && (
                <div className="text-[10px] font-bold text-slate-600 bg-white/80 px-1 py-px rounded border border-slate-200/50 leading-none tabular-nums">{mileage}</div>
              )}
            </div>
            <div className="truncate text-[13px] font-semibold leading-tight text-slate-800" title={dropoff.street}>{dropoff.street}</div>
            {dropoff.locality && <div className="mt-0.5 truncate text-[11px] font-medium leading-none text-slate-400" title={dropoff.locality}>{dropoff.locality}</div>}
          </div>
        </div>
      </div>

      {assignSlot}

      {/* Action bar — compact */}
      <div className="flex items-center gap-1.5 px-2 pb-1 pt-0 border-t border-slate-100">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {reassignAction && (
            <button type="button" onClick={reassignAction.onClick} className="hidden px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-[11px] font-semibold border border-amber-200 shrink-0 min-[340px]:flex min-h-9 items-center">
              Reassign
            </button>
          )}
          {archiveAction && (
            <button type="button" onClick={archiveAction.onClick} className="hidden px-2 py-0.5 bg-slate-50 text-slate-600 rounded text-[11px] font-semibold border border-slate-200 shrink-0 min-[520px]:flex min-h-9 items-center">
              Archive
            </button>
          )}
          {iconActions.slice(0, 2).map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                title={action.label}
                aria-label={action.ariaLabel || action.label}
                className="p-0 bg-slate-50 text-slate-600 rounded border border-slate-200 shrink-0 min-h-9 min-w-9 flex items-center justify-center"
              >
                <Icon size={13} />
              </button>
            );
          })}
          <div className="flex-1" />
          <div className="flex items-center gap-0.5 text-[11px] font-medium text-slate-400 shrink-0">
            <User size={11} /> <span className="truncate max-w-[60px]">{driverName}</span>
          </div>
          {onMore && MoreIcon && (
            <button
              type="button"
              onClick={onMore}
              aria-label={typeof moreLabel === 'string' ? moreLabel : 'More actions'}
              title={typeof moreLabel === 'string' ? moreLabel : undefined}
              className="p-0 text-slate-400 bg-slate-50 rounded border border-slate-200 shrink-0 min-h-9 min-w-9 flex items-center justify-center"
            >
              <MoreIcon size={13} />
            </button>
          )}
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              className="px-2 py-0.5 bg-blue-600 text-white rounded text-[11px] font-bold flex items-center gap-1 shrink-0 min-h-9 shadow-sm"
            >
              <Navigation size={11} /> {primaryAction.label}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default React.memo(ManifestTripCard);
