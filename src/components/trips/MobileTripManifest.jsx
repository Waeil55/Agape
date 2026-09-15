import React from 'react';
import { Layers, Navigation, User, AlertTriangle, Clock, CheckCircle2, Zap, Shield, Timer, ChevronRight, Copy } from 'lucide-react';
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
  completed: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
  'in progress': 'bg-blue-50 text-blue-700 border border-blue-200/80',
  'in mission': 'bg-blue-50 text-blue-700 border border-blue-200/80',
  'at pickup': 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
  'at dropoff': 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
  'in transit': 'bg-blue-50 text-blue-700 border border-blue-200/80',
  'en route': 'bg-amber-50 text-amber-700 border border-amber-200/80',
  'navigating pickup': 'bg-blue-50 text-blue-700 border border-blue-200/80',
  'navigating dropoff': 'bg-blue-50 text-blue-700 border border-blue-200/80',
  arrived: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
  unassigned: 'bg-rose-50 text-rose-700 border border-rose-200/80',
  'no show': 'bg-orange-50 text-orange-700 border border-orange-200/80',
  'trip rerouted': 'bg-purple-50 text-purple-700 border border-purple-200/80',
  rerouted: 'bg-purple-50 text-purple-700 border border-purple-200/80',
  cancelled: 'bg-slate-50 text-slate-700 border border-slate-200/80',
  canceled: 'bg-slate-50 text-slate-700 border border-slate-200/80',
  transferred: 'bg-slate-50 text-slate-700 border border-slate-200/80',
  no_show: 'bg-orange-50 text-orange-700 border border-orange-200/80',
  assigned: 'bg-blue-50 text-blue-700 border border-blue-200/80',
};
export function getManifestStatusBadge(status) {
  return STATUS_STYLES[String(status || '').trim().toLowerCase()] || 'bg-slate-100 text-slate-700';
}

// ---------------------------------------------------------------------------
// Enterprise: SLA tracking, priority badges, risk indicators, workflow viz
// ---------------------------------------------------------------------------

const SLA_THRESHOLDS = Object.freeze({
  excellent: { maxMinutes: 0, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', label: 'On Time' },
  good: { maxMinutes: 15, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', label: 'Within SLA' },
  warning: { maxMinutes: 30, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', label: 'At Risk' },
  critical: { maxMinutes: 60, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', label: 'Critical' },
  breach: { maxMinutes: Infinity, color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200', label: 'SLA Breach' },
});

export function getSLAStatus(trip, now = new Date()) {
  if (isTripActionTerminal(trip)) return { level: 'done', ...SLA_THRESHOLDS.excellent, label: 'Completed' };
  const scheduled = timeToMinutes(trip?.time);
  if (!Number.isFinite(scheduled) || scheduled < 0 || scheduled >= 1440) return { level: 'unknown', ...SLA_THRESHOLDS.good, label: 'No SLA' };
  const serviceDate = tripCalendarDateKey(trip?.date);
  if (!serviceDate) return { level: 'unknown', ...SLA_THRESHOLDS.good, label: 'No Date' };
  const scheduledDate = new Date(`${serviceDate}T00:00:00`);
  scheduledDate.setHours(Math.floor(scheduled / 60), scheduled % 60, 0, 0);
  const diffMin = Math.round((now.getTime() - scheduledDate.getTime()) / 60000);
  if (diffMin <= SLA_THRESHOLDS.good.maxMinutes) return { level: 'excellent', ...SLA_THRESHOLDS.excellent, minutes: diffMin };
  if (diffMin <= SLA_THRESHOLDS.warning.maxMinutes) return { level: 'good', ...SLA_THRESHOLDS.good, minutes: diffMin };
  if (diffMin <= SLA_THRESHOLDS.critical.maxMinutes) return { level: 'warning', ...SLA_THRESHOLDS.warning, minutes: diffMin };
  if (diffMin <= SLA_THRESHOLDS.breach.maxMinutes) return { level: 'critical', ...SLA_THRESHOLDS.critical, minutes: diffMin };
  return { level: 'breach', ...SLA_THRESHOLDS.breach, minutes: diffMin };
}

const PRIORITY_STYLES = Object.freeze({
  urgent: { color: 'text-rose-700', bg: 'bg-rose-100 border-rose-200', icon: Zap, label: 'URGENT' },
  high: { color: 'text-amber-700', bg: 'bg-amber-100 border-amber-200', icon: AlertTriangle, label: 'HIGH' },
  normal: { color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: null, label: 'NORMAL' },
  low: { color: 'text-slate-500', bg: 'bg-slate-100 border-slate-200', icon: null, label: 'LOW' },
});

export function getPriorityBadge(trip) {
  const priority = String(trip?.priority || 'normal').toLowerCase();
  return PRIORITY_STYLES[priority] || PRIORITY_STYLES.normal;
}

const WORKFLOW_STEPS = [
  { key: 'Assigned', label: 'Assigned', order: 0 },
  { key: 'Navigating Pickup', label: 'Navigate', order: 1 },
  { key: 'At Pickup', label: 'At PU', order: 2 },
  { key: 'In Transit', label: 'Transit', order: 3 },
  { key: 'At Dropoff', label: 'At DO', order: 4 },
  { key: 'Completed', label: 'Done', order: 5 },
];

export function getWorkflowStep(trip) {
  const status = String(trip?.status || '').trim();
  const idx = WORKFLOW_STEPS.findIndex(s => s.key === status);
  if (idx >= 0) return { ...WORKFLOW_STEPS[idx], index: idx, total: WORKFLOW_STEPS.length };
  if (isTripActionTerminal(trip)) return { ...WORKFLOW_STEPS[5], index: 5, total: 6 };
  return { ...WORKFLOW_STEPS[0], index: 0, total: 6 };
}

export function WorkflowProgressBar({ trip }) {
  const step = getWorkflowStep(trip);
  const pct = step.total > 0 ? Math.round((step.index / (step.total - 1)) * 100) : 0;
  const isComplete = step.index >= step.total - 1;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Workflow</span>
        <span className={`text-[9px] font-bold ${isComplete ? 'text-emerald-600' : 'text-blue-600'}`}>{step.label}</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full transition-all duration-500 ${isComplete ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between">
        {WORKFLOW_STEPS.map((s, i) => (
          <span key={s.key} className={`text-[7px] font-bold ${i <= step.index ? 'text-blue-600' : 'text-slate-300'}`}>{s.label}</span>
        ))}
      </div>
    </div>
  );
}

export function SLABadge({ trip }) {
  const sla = getSLAStatus(trip);
  if (sla.level === 'done' || sla.level === 'unknown') return null;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${sla.bg} ${sla.color}`}>
      <Timer size={8} />
      {sla.label}
    </span>
  );
}

export function PriorityBadge({ trip }) {
  const p = getPriorityBadge(trip);
  if (p.label === 'NORMAL') return null;
  const Icon = p.icon;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-black tracking-wider ${p.bg} ${p.color}`}>
      {Icon && <Icon size={8} />}
      {p.label}
    </span>
  );
}

export function BatchOperationBar({ selectedCount, totalCount, onSelectAll, onDeselectAll, onBatchAction }) {
  if (selectedCount === 0) return null;
  return (
    <div className="flex items-center gap-2 rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-2 animate-in fade-in duration-150">
      <div className="flex items-center gap-1.5 flex-1">
        <span className="text-[11px] font-bold text-indigo-700">{selectedCount}/{totalCount} selected</span>
        <button onClick={selectedCount === totalCount ? onDeselectAll : onSelectAll}
          className="text-[10px] font-bold text-indigo-600 underline">
          {selectedCount === totalCount ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onBatchAction('reassign')} className="px-2 py-1 rounded-lg bg-white border border-indigo-200 text-[10px] font-bold text-indigo-700 hover:bg-indigo-100 transition-colors">Reassign</button>
        <button onClick={() => onBatchAction('archive')} className="px-2 py-1 rounded-lg bg-white border border-indigo-200 text-[10px] font-bold text-indigo-700 hover:bg-indigo-100 transition-colors">Archive</button>
        <button onClick={() => onBatchAction('reschedule')} className="px-2 py-1 rounded-lg bg-indigo-600 text-[10px] font-bold text-white hover:bg-indigo-700 transition-colors">Reschedule</button>
      </div>
    </div>
  );
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
// ManifestTripCard — modern fleet-dispatch card matching reference design:
// header (checkbox + time + name + ID), route timeline with dashed connector,
// compact footer (driver pill + action icons + telemetry + status badge).
// Slots: selectSlot (bulk checkbox), assignSlot, primaryAction, iconActions, onMore.
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
  const isDone = isTripActionTerminal(trip);
  const timeColor = trip?.urgent
    ? 'text-rose-600'
    : cd.level === 'on-time' || cd.level === 'ready'
      ? 'text-blue-600'
      : cd.level === 'approaching'
        ? 'text-amber-600'
        : 'text-slate-700';
  const statusPulseColor = isDone
    ? 'bg-emerald-500'
    : cd.level === 'on-time' || cd.level === 'ready'
      ? 'bg-blue-600'
      : cd.level === 'approaching'
        ? 'bg-amber-500'
        : 'bg-slate-400';

  return (
    <article className="bg-white rounded-2xl border border-slate-200/90 shadow-card overflow-hidden transition-all duration-150" aria-label={`Trip for ${trip?.patient || trip?.bookingId || 'unknown'}`}>

      {/* ── HEADER: Checkbox + Time | Passenger Name + Trip ID ── */}
      <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-slate-100 bg-slate-50/60 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {selectSlot}
          {onTimeEdit ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); onTimeEdit(trip); }}
              className={`text-[17px] font-extrabold tracking-tight shrink-0 hover:underline decoration-1 underline-offset-2 ${timeColor}`}
              title="Edit schedule">
              {trip?.time || '—'}
            </button>
          ) : (
            <span className={`text-[17px] font-extrabold tracking-tight shrink-0 ${timeColor}`}>{trip?.time || '—'}</span>
          )}
          <span className="text-slate-300 shrink-0 font-light">|</span>
          <div className="flex items-baseline gap-1.5 min-w-0 flex-1 truncate">
            <span className="text-[15px] font-bold text-slate-900 truncate">{trip?.patient || 'Unknown client'}</span>
            {legs > 0 && (
              onLegsClick ? (
                <button type="button" onClick={onLegsClick} className="text-[11px] text-slate-500 hidden sm:inline shrink-0"
                  aria-label={`View ${legs} legs for ${trip?.patient || 'trip'}`}>
                  ({legsLabel || `${legs} ${legs === 1 ? 'leg' : 'legs'}`})
                </button>
              ) : (
                <span className="text-[11px] text-slate-500 hidden sm:inline shrink-0">({legsLabel || `${legs} ${legs === 1 ? 'leg' : 'legs'}`})</span>
              )
            )}
          </div>
        </div>
        <div className="flex items-center shrink-0 gap-1.5">
          <PriorityBadge trip={trip} />
          <SLABadge trip={trip} />
          <span className="text-xs font-bold text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded-md border border-slate-300/60 tracking-wide">
            #{trip?.bookingId || trip?.id || '—'}
          </span>
        </div>
      </div>

      {/* ── ROUTE TIMELINE: Pickup → Dropoff with dashed connector ── */}
      <div className="px-3.5 py-2">
        <div className="relative pl-3.5 space-y-1.5 before:content-[''] before:absolute before:left-[3.5px] before:top-2 before:bottom-2 before:w-[1.5px] before:border-l-[1.5px] before:border-dashed before:border-slate-300">

          {/* Pickup Line */}
          <div className="relative flex items-center justify-between gap-1.5 text-xs">
            <div className="absolute -left-3.5 top-1.5 w-2 h-2 rounded-full border-2 border-emerald-500 bg-white" />
            <div className="flex items-baseline gap-1.5 truncate min-w-0">
              <span className="text-[10px] font-black uppercase text-emerald-600 shrink-0">PU</span>
              <span className="text-[13.5px] font-semibold text-slate-800 truncate">{pickup.street}</span>
              {pickup.locality && <span className="text-[11px] text-slate-500 truncate hidden sm:inline">• {pickup.locality}</span>}
            </div>
            <PriorityBadge trip={trip} />
          </div>

          {/* Dropoff Line */}
          <div className="relative flex items-center justify-between gap-1.5 text-xs">
            <div className="absolute -left-3.5 top-1.5 w-2 h-2 rounded-full border-2 border-rose-500 bg-white" />
            <div className="flex items-baseline gap-1.5 truncate min-w-0">
              <span className="text-[10px] font-black uppercase text-rose-600 shrink-0">DO</span>
              <span className="text-[13.5px] font-semibold text-slate-800 truncate">{dropoff.street}</span>
              {dropoff.locality && <span className="text-[11px] text-slate-500 truncate hidden sm:inline">• {dropoff.locality}</span>}
            </div>
            {mileage && (
              <span className="text-[11px] font-bold text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200/50 tabular-nums shrink-0">{mileage}</span>
            )}
          </div>

        </div>
      </div>

      {/* ── WORKFLOW PROGRESS (non-terminal only) ── */}
      {!isDone && trip?.status && (
        <div className="px-3.5 pb-1">
          <WorkflowProgressBar trip={trip} />
        </div>
      )}

      {assignSlot}

      {/* ── FOOTER: Driver pill + Action icons + Telemetry + Status ── */}
      <div className="px-3 py-2 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between gap-1">

        {/* Left: Driver Pill + Call/SMS/Options buttons */}
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Driver Pill */}
          <div className="flex items-center gap-1 h-7 px-2 rounded-lg bg-white border border-slate-200/80 text-[11px] font-semibold text-slate-700 shadow-2xs">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusPulseColor}`} />
            <span className="truncate max-w-[100px]">{driverName || trip?.driverName || '—'}</span>
          </div>

          {/* Call Button */}
          {iconActions.find(a => a.id === 'call') ? (
            <button type="button" onClick={iconActions.find(a => a.id === 'call')?.onClick}
              title="Call" className="w-7 h-7 rounded-lg bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors shadow-2xs shrink-0">
              <User size={13} className="text-emerald-600" />
            </button>
          ) : null}

          {/* SMS Button */}
          {iconActions.find(a => a.id === 'message') ? (
            <button type="button" onClick={iconActions.find(a => a.id === 'message')?.onClick}
              title="Text" className="w-7 h-7 rounded-lg bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors shadow-2xs shrink-0">
              <Navigation size={13} className="text-blue-500" />
            </button>
          ) : null}

          {/* More / Options Button */}
          {onMore && (
            <button type="button" onClick={onMore}
              aria-label={typeof moreLabel === 'string' ? moreLabel : 'More actions'}
              title={typeof moreLabel === 'string' ? moreLabel : undefined}
              className="w-7 h-7 rounded-lg bg-white border border-slate-200/80 text-slate-500 hover:bg-slate-100 flex items-center justify-center transition-colors shadow-2xs shrink-0">
              {MoreIcon ? <MoreIcon size={13} /> : <AlertTriangle size={13} />}
            </button>
          )}
        </div>

        {/* Right: Telemetry (countdown/time away + distance) + Status Badge */}
        <div className="flex items-center gap-1 shrink-0 justify-end">
          {/* Telemetry Pill */}
          <div className="flex items-center h-7 rounded-lg border border-slate-200 bg-white overflow-hidden text-[11px] font-semibold shadow-2xs">
            {!isDone ? (
              <div className={`flex items-center gap-1 px-1.5 h-full border-r border-slate-200 whitespace-nowrap ${
                trip?.urgent ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'
              }`}>
                <Navigation size={10} className="text-blue-500 fill-current" />
                <span>{cd.label}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 px-1.5 h-full bg-emerald-50 text-emerald-700 border-r border-slate-200 whitespace-nowrap">
                <CheckCircle2 size={10} className="text-emerald-500" />
              </div>
            )}
            {mileage && (
              <div className="flex items-center gap-1 px-1.5 h-full text-slate-700 whitespace-nowrap font-bold">
                <span>{mileage}</span>
              </div>
            )}
          </div>

          {/* Status Badge */}
          <span title={displayStatus} className={`inline-flex items-center h-7 gap-1 px-2 rounded-lg text-[11px] font-bold whitespace-nowrap ${statusBadge}`}>
            {isDone && <CheckCircle2 size={11} />}
            {!isDone && <span className={`w-1.5 h-1.5 rounded-full ${statusPulseColor}`} />}
            {displayStatus}
          </span>
        </div>

      </div>
    </article>
  );
}

export default React.memo(ManifestTripCard);
