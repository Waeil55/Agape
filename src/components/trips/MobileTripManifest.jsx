import React from 'react';
import { Layers, Navigation, User, AlertTriangle, Clock, CheckCircle2, Zap, Shield, Timer, ChevronRight, Copy, Phone, MessageSquare, MoreHorizontal, Check, Ban, GitBranch, Pencil } from 'lucide-react';
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
  completed: { cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80', dot: 'bg-emerald-600', icon: Check },
  'in progress': { cls: 'bg-blue-50 text-blue-700 border border-blue-200/80', dot: 'bg-blue-600', icon: null, pulse: true },
  'in mission': { cls: 'bg-blue-50 text-blue-700 border border-blue-200/80', dot: 'bg-blue-600', icon: null, pulse: true },
  'at pickup': { cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80', dot: 'bg-emerald-600', icon: null, pulse: true },
  'at dropoff': { cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80', dot: 'bg-emerald-600', icon: null, pulse: true },
  'in transit': { cls: 'bg-blue-50 text-blue-700 border border-blue-200/80', dot: 'bg-blue-600', icon: null, pulse: true },
  'en route': { cls: 'bg-amber-50 text-amber-700 border border-amber-200/80', dot: 'bg-amber-500', icon: null },
  'navigating pickup': { cls: 'bg-blue-50 text-blue-700 border border-blue-200/80', dot: 'bg-blue-600', icon: null },
  'navigating dropoff': { cls: 'bg-blue-50 text-blue-700 border border-blue-200/80', dot: 'bg-blue-600', icon: null },
  arrived: { cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80', dot: 'bg-emerald-600', icon: null },
  unassigned: { cls: 'bg-rose-50 text-rose-700 border border-rose-200/80', dot: 'bg-rose-500', icon: null },
  'no show': { cls: 'bg-orange-50 text-orange-700 border border-orange-200/80', dot: 'bg-orange-500', icon: User },
  'trip rerouted': { cls: 'bg-amber-50 text-amber-700 border border-amber-200/80', dot: 'bg-amber-500', icon: GitBranch },
  rerouted: { cls: 'bg-amber-50 text-amber-700 border border-amber-200/80', dot: 'bg-amber-500', icon: GitBranch },
  cancelled: { cls: 'bg-rose-50 text-rose-700 border border-rose-200/80', dot: 'bg-rose-500', icon: Ban },
  canceled: { cls: 'bg-rose-50 text-rose-700 border border-rose-200/80', dot: 'bg-rose-500', icon: Ban },
  transferred: { cls: 'bg-slate-50 text-slate-700 border border-slate-200/80', dot: 'bg-slate-500', icon: null },
  no_show: { cls: 'bg-orange-50 text-orange-700 border border-orange-200/80', dot: 'bg-orange-500', icon: User },
  assigned: { cls: 'bg-blue-50 text-blue-700 border border-blue-200/80', dot: 'bg-blue-600', icon: null },
  pending: { cls: 'bg-purple-50 text-purple-700 border border-purple-200/80', dot: 'bg-purple-500', icon: Clock },
};
export function getManifestStatusBadge(status) {
  return STATUS_STYLES[String(status || '').trim().toLowerCase()] || { cls: 'bg-slate-100 text-slate-700 border border-slate-200/80', dot: 'bg-slate-400', icon: null };
}

export function formatManifestMileage(mileage, trip = {}) {
  const value = mileage ?? trip?.distance ?? trip?.mileage ?? trip?.distanceMiles;
  if (value === undefined || value === null || value === '') return '— mi';
  const text = String(value).trim();
  if (!text) return '— mi';
  return /\bmi(?:les)?\b/i.test(text) ? text : `${text} mi`;
}

// The footer status is also the mobile workflow action box. Once work has
// started, use a solid color so drivers can identify the current phase at a
// glance without reading small text.
export function getManifestActionBox(status) {
  const key = String(status || '').trim().toLowerCase();
  if (key === 'in progress' || key === 'in mission') return { cls: 'bg-emerald-600 text-white border-emerald-700', dot: 'bg-white' };
  if (key === 'en route' || key === 'navigating pickup') return { cls: 'bg-cyan-600 text-white border-cyan-700', dot: 'bg-white' };
  if (key === 'at pickup') return { cls: 'bg-amber-500 text-white border-amber-600', dot: 'bg-white' };
  if (key === 'in transit' || key === 'navigating dropoff') return { cls: 'bg-indigo-600 text-white border-indigo-700', dot: 'bg-white' };
  if (key === 'at dropoff' || key === 'arrived') return { cls: 'bg-purple-600 text-white border-purple-700', dot: 'bg-white' };
  return getManifestStatusBadge(status);
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
    <div className="bg-white border-b border-slate-200 shrink-0 z-20 shadow-xs" role="group" aria-label="Trip queue summary">
      <div className="flex px-2 py-1.5 gap-1.5 text-center">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={item.onSelect}
            aria-pressed={!!item.active}
            className={`${item.wide ? 'flex-[1.2]' : 'flex-1'} min-h-9 h-9 rounded-lg border px-0.5 py-0.5 flex flex-col items-center justify-center leading-none gap-0.5 ${
              item.active ? item.activeClass : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            <span className={`font-bold text-xs tabular-nums ${item.valueClass || ''}`}>{item.value}</span>
            <span className="text-[9px] font-semibold">{item.label}</span>
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

export function getFullAddress(value, explicitCity = '') {
  const rawAddress = typeof value === 'object'
    ? String(value?.address || value?.formattedAddress || '').trim()
    : String(value || '').trim();
  const city = String(explicitCity || (typeof value === 'object' ? value?.city || '' : '')).trim();
  if (!rawAddress) return '—';
  if (city && !rawAddress.toLowerCase().includes(city.toLowerCase())) {
    return `${rawAddress} ${city}`;
  }
  return rawAddress;
}

// ---------------------------------------------------------------------------
// ManifestTripCard — modern fleet-dispatch card matching reference design:
// header (checkbox + time + name + ID + options), route timeline with dashed connector,
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
  selected,
  onSelect,
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
  onCardClick,
  showAddresses = true,
  hideCountdown = false,
  mutedAddress = false,
}) {
  const cd = countdown || getTripCountdown(trip);
  const displayStatus = getManifestDisplayStatus(trip);
  const statusBadge = getManifestActionBox(displayStatus);
  const mileageLabel = formatManifestMileage(mileage, trip);
  const pickupAddress = getFullAddress(trip?.pickup, trip?.pickupCity);
  const dropoffAddress = getFullAddress(trip?.dropoff, trip?.dropoffCity);
  const isDone = isTripActionTerminal(trip);
  const isInOut = String(trip?.time || '').toUpperCase().includes('IN/OUT') || trip?.inOut || trip?.tripIsInOut;
  const timeColor = isInOut ? 'text-slate-900' : 'text-red-600';
  const statusPulseColor = statusBadge.dot || (isDone ? 'bg-emerald-600' : 'bg-rose-500');
  const HeaderMoreIcon = MoreIcon || MoreHorizontal;

  const handleArticleClick = (e) => {
    if (e.target.closest('button, a, input, select, textarea, [role="button"], [role="checkbox"], label')) {
      return;
    }
    if (onCardClick) {
      onCardClick(trip);
    }
  };

  return (
    <article
      onClick={onCardClick ? handleArticleClick : undefined}
      className={`bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition duration-150 overflow-hidden [&_button]:!min-h-0 max-md:[&_button]:!min-h-0 ${
        selected ? 'ring-2 ring-blue-500' : ''
      } ${onCardClick ? 'cursor-pointer active:scale-[0.99]' : ''}`}
      aria-label={`Trip for ${trip?.patient || trip?.bookingId || 'unknown'}`}
    >
      {/* ── CARD HEADER ── */}
      <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between">
        <div className="flex items-center space-x-2.5 min-w-0">
          {selectSlot ? (
            selectSlot
          ) : onSelect ? (
            <label className="cursor-pointer flex items-center shrink-0">
              <input
                type="checkbox"
                role="checkbox"
                checked={!!selected}
                onChange={(e) => { e.stopPropagation(); onSelect(trip); }}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select trip ${trip?.patient || trip?.bookingId || ''}`}
                className="w-[18px] h-[18px] rounded text-blue-600 border-slate-300 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
              />
            </label>
          ) : null}

          {/* Scheduled Time in Red or IN/OUT */}
          {onTimeEdit ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onTimeEdit(trip); }}
              className={`text-[17px] font-extrabold tracking-tight shrink-0 hover:underline cursor-pointer !min-h-0 ${timeColor}`}
              title="Edit schedule"
              aria-label={`Edit schedule for ${trip?.patient || 'trip'}`}
            >
              {isInOut ? 'IN/OUT' : (trip?.time || '—')}
            </button>
          ) : (
            <span className={`text-[17px] font-extrabold tracking-tight shrink-0 ${timeColor}`}>
              {isInOut ? 'IN/OUT' : (trip?.time || '—')}
            </span>
          )}

          <span className="text-slate-300 text-base font-normal">|</span>

          {/* Passenger Name */}
          <span className="text-[16px] font-bold text-slate-900 tracking-tight truncate">
            {trip?.patient || trip?.patientName || 'Unknown client'}
          </span>
        </div>

        {/* Trip ID + globally consistent top-right options */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="bg-white/90 text-slate-900 text-[13px] font-bold px-2.5 py-0.5 rounded-md border border-slate-300/90 tracking-wide">
            {trip?.bookingId || trip?.id || '—'}
          </span>
          {onMore && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMore(e); }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
              title={typeof moreLabel === 'string' ? moreLabel : 'More options'}
              aria-label={typeof moreLabel === 'string' ? moreLabel : 'More options'}
            >
              <HeaderMoreIcon className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      </div>

      {/* ── CARD BODY: Addresses (Hidden before opened in reports/history) ── */}
      {showAddresses && (
        <div className="px-3.5 py-2 space-y-1.5 text-[14px] leading-tight">
          {/* Pickup Address */}
          <div className="flex items-center space-x-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
            <span className={`${mutedAddress ? 'text-slate-500' : 'text-slate-700'} font-medium tracking-tight truncate flex-1 min-w-0`} title={pickupAddress}>
              {pickupAddress}
            </span>
          </div>

          {/* Dropoff Address */}
          <div className="flex items-center space-x-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
            <span className={`${mutedAddress ? 'text-slate-500' : 'text-slate-700'} font-medium tracking-tight truncate flex-1 min-w-0`} title={dropoffAddress}>
              {dropoffAddress}
            </span>
          </div>
        </div>
      )}

      {assignSlot}

      {/* ── CARD FOOTER ── */}
      <div className="px-3 py-1.5 bg-slate-50/20 border-t border-slate-100/70 flex items-center justify-between text-[13px]">
        {/* Driver & Comm Icons */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5">
            <span className={`w-2 h-2 rounded-full ${statusPulseColor}`} />
            <span className="font-semibold text-slate-700 text-[13px] truncate max-w-[100px]">
              {driverName || trip?.driverName || '—'}
            </span>
          </div>

          {/* Call Button */}
          {iconActions.find(a => a.id === 'call') ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); iconActions.find(a => a.id === 'call')?.onClick?.(e); }}
              className="text-slate-400 hover:text-blue-600 p-0.5 transition-colors cursor-pointer"
              title="Call Passenger"
              aria-label="Call Passenger"
            >
              <Phone className="w-3.5 h-3.5 text-blue-600" />
            </button>
          ) : null}

          {/* Chat / SMS Button */}
          {iconActions.find(a => a.id === 'message') ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); iconActions.find(a => a.id === 'message')?.onClick?.(e); }}
              className="text-slate-400 hover:text-blue-600 p-0.5 transition-colors cursor-pointer"
              title="Chat Passenger"
              aria-label="Chat Passenger"
            >
              <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
            </button>
          ) : null}

        </div>

        {/* Route Metrics & Status Pill */}
        <div className="flex items-center space-x-1.5 shrink-0">
          <div className="inline-flex items-center text-[12.5px] font-medium text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200" aria-label={`Trip mileage ${mileageLabel}`}>
              {hideCountdown ? (
                <>
                  <Navigation className="w-2.5 h-2.5 mr-1 text-sky-600 fill-current" />
                  <span>{mileageLabel}</span>
                </>
              ) : (
                <>
                  <Navigation className="w-2.5 h-2.5 mr-1 text-sky-600 fill-current" />
                  <span>{cd?.label || 'No time'}</span>
                  <span className="mx-1 text-slate-400">•</span>
                  <span>{mileageLabel}</span>
                </>
              )}
          </div>

          <button
            type="button"
            className={`status-btn inline-flex items-center text-[13px] font-bold px-2 py-0.5 rounded border transition hover:opacity-90 ${statusBadge.cls}`}
            title={displayStatus}
            onClick={(e) => {
              if (primaryAction?.onClick) {
                e.stopPropagation();
                primaryAction.onClick();
              }
            }}
          >
            <span className={`w-1.5 h-1.5 rounded-full mr-1 ${statusBadge.dot || statusPulseColor}`} />
            <span className="status-label">{displayStatus}</span>
          </button>
        </div>
      </div>
    </article>
  );
}

export default React.memo(ManifestTripCard);
