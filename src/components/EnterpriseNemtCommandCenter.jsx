import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BellRing,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileWarning,
  Gauge,
  HeartPulse,
  MapPin,
  MessageSquare,
  Navigation,
  PanelRight,
  Phone,
  Receipt,
  Route,
  ShieldCheck,
  Sparkles,
  Truck,
  UploadCloud,
  UserRound,
  Users,
  Wand2,
} from 'lucide-react';
import {
  compareTripsBySchedule,
  getTripSortMinutes,
  getTripTimeLabel,
  isInOutTrip,
  isWillCallTrip,
  timeToMinutes,
  UNSCHEDULED_SORT_MINUTES,
} from '../utils/tripDate';

const TERMINAL_STATUSES = ['Completed', 'Cancelled', 'No Show'];
const ACTIVE_STATUSES = ['Assigned', 'In Mission', 'En Route', 'At Pickup', 'At Dropoff', 'In Progress', 'Navigating Pickup', 'Navigating Dropoff', 'In Transit', 'Arrived'];
const ATTENTION_STATUSES = ['Unassigned', 'Rerouted', 'No Show', 'Cancelled'];
const FACILITY_WORDS = ['hospital', 'clinic', 'center', 'medical', 'health', 'care', 'rehab', 'dental', 'therapy', 'suite', 'office', 'dialysis', 'school', 'academy', 'pharmacy', 'surgery'];

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeText(value = '') {
  return String(value || '').trim();
}

function lower(value = '') {
  return normalizeText(value).toLowerCase();
}

function cleanPhone(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function formatPhone(value = '') {
  const digits = cleanPhone(value);
  if (digits.length === 11 && digits.startsWith('1')) return `+1 ${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return value || 'No phone';
}

function isTodayTrip(trip) {
  const date = normalizeText(trip?.date);
  return !date || date === todayKey();
}

function isTerminal(trip) {
  return TERMINAL_STATUSES.includes(trip?.status);
}

function isActiveTrip(trip) {
  return isTodayTrip(trip) && !isTerminal(trip);
}

function isLateTrip(trip) {
  if (!trip || isTerminal(trip) || isWillCallTrip(trip)) return false;
  if (isInOutTrip(trip) && timeToMinutes(trip.time) === UNSCHEDULED_SORT_MINUTES) return false;
  const mins = timeToMinutes(trip.time);
  if (mins === UNSCHEDULED_SORT_MINUTES) return false;
  const scheduled = new Date();
  scheduled.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return Date.now() > scheduled.getTime();
}

function minutesUntil(trip) {
  const mins = timeToMinutes(trip?.time);
  if (mins === UNSCHEDULED_SORT_MINUTES) return null;
  const scheduled = new Date();
  scheduled.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return Math.round((scheduled.getTime() - Date.now()) / 60000);
}

function urgency(trip) {
  if (isLateTrip(trip)) return 'late';
  const diff = minutesUntil(trip);
  if (diff !== null && diff >= 0 && diff <= 30 && !isTerminal(trip)) return 'soon';
  if (trip?.status === 'Unassigned') return 'unassigned';
  if (isInOutTrip(trip)) return 'wait';
  if (isWillCallTrip(trip)) return 'willcall';
  return 'normal';
}

function statusClass(kind) {
  if (kind === 'late' || kind === 'critical') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (kind === 'soon' || kind === 'warning' || kind === 'wait') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (kind === 'good' || kind === 'ready') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (kind === 'willcall' || kind === 'info') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}

function getDriverName(trip, drivers) {
  const driver = drivers.find(item => item.id === trip?.driverId || item.email === trip?.driverEmail);
  return driver?.name || trip?.driverName || (trip?.driverId ? 'Assigned driver' : 'Unassigned');
}

function hasAny(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function readinessPercent(checks) {
  if (!checks.length) return 0;
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function facilityNameFromAddress(address = '', siteName = '') {
  if (siteName) return siteName;
  const first = normalizeText(address).split(',')[0] || '';
  return first.length > 3 ? first : normalizeText(address);
}

function looksLikeFacility(trip, side) {
  const site = side === 'pickup' ? trip?.pickupSiteName : trip?.dropoffSiteName;
  const address = side === 'pickup' ? trip?.pickup : trip?.dropoff;
  const text = lower(`${site || ''} ${address || ''}`);
  return FACILITY_WORDS.some(word => text.includes(word));
}

function Metric({ icon: Icon, label, value, tone = 'info', detail }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${statusClass(tone)}`}>
          <Icon size={17} />
        </div>
        <div className="min-w-0 flex-1 text-right">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
          <p className="text-xl font-black leading-tight text-slate-950">{value}</p>
        </div>
      </div>
      {detail && <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">{detail}</p>}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white">
          <Icon size={17} />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-black text-slate-950">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs font-semibold text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ title, body }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white px-6 py-8 text-center">
      <div>
        <CheckCircle2 className="mx-auto text-emerald-500" size={28} />
        <p className="mt-2 text-sm font-black text-slate-900">{title}</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">{body}</p>
      </div>
    </div>
  );
}

export default function EnterpriseNemtCommandCenter({
  trips = [],
  drivers = [],
  dispatchers = [],
  role,
  operationsTab,
  setOperationsTab,
  setSearchQuery,
  setShowUploadModal,
  onOpenSequencer,
  onOpenLiveMap,
  onTogglePanel,
  addToast,
  operationsBoard,
  isOnline,
}) {
  const [module, setModule] = useState('command');

  const model = useMemo(() => {
    const todayTrips = trips.filter(isTodayTrip).sort(compareTripsBySchedule);
    const activeTrips = todayTrips.filter(trip => !isTerminal(trip));
    const completedTrips = todayTrips.filter(trip => trip.status === 'Completed');
    const unassigned = activeTrips.filter(trip => !trip.driverId || trip.status === 'Unassigned');
    const inProgress = activeTrips.filter(trip => ACTIVE_STATUSES.includes(trip.status));
    const late = activeTrips.filter(isLateTrip);
    const soon = activeTrips.filter(trip => {
      const diff = minutesUntil(trip);
      return diff !== null && diff >= 0 && diff <= 30 && !trip.driverId;
    });
    const inOut = activeTrips.filter(isInOutTrip);
    const willCall = activeTrips.filter(isWillCallTrip);
    const activeDrivers = drivers.filter(driver => driver.status && !['Offline', 'Unavailable'].includes(driver.status));
    const availableDrivers = drivers.filter(driver => driver.status === 'Available' || driver.clockedIn);
    const onlineDispatchers = dispatchers.filter(dispatcher => dispatcher.clockedIn || dispatcher.online);

    const exceptions = [
      ...late.map(trip => ({
        id: `late-${trip.id}`,
        severity: 'critical',
        title: 'Late trip risk',
        trip,
        detail: `${getTripTimeLabel(trip)} | ${trip.patient || 'No client name'} | ${getDriverName(trip, drivers)}`,
        action: 'Focus trip',
      })),
      ...unassigned.filter(trip => {
        const diff = minutesUntil(trip);
        return diff === null || diff <= 90;
      }).map(trip => ({
        id: `unassigned-${trip.id}`,
        severity: minutesUntil(trip) !== null && minutesUntil(trip) <= 30 ? 'critical' : 'warning',
        title: 'Unassigned trip',
        trip,
        detail: `${getTripTimeLabel(trip)} | ${trip.patient || 'No client name'} | pickup ${trip.pickup || 'missing'}`,
        action: 'Assign',
      })),
      ...inOut.filter(trip => trip.legRelationship === 'in_out_return' || timeToMinutes(trip.time) === UNSCHEDULED_SORT_MINUTES).map(trip => ({
        id: `inout-${trip.id}`,
        severity: 'wait',
        title: 'IN/OUT wait return',
        trip,
        detail: `${trip.patient || 'Client'} should stay with same driver after A leg`,
        action: 'Review pair',
      })),
      ...willCall.filter(trip => !isInOutTrip(trip)).map(trip => ({
        id: `willcall-${trip.id}`,
        severity: 'info',
        title: 'Will Call pending',
        trip,
        detail: `${trip.patient || 'Client'} | keep below timed manifest until call arrives`,
        action: 'Monitor',
      })),
    ].slice(0, 40);

    const driverLines = drivers.map(driver => {
      const assigned = activeTrips.filter(trip => trip.driverId === driver.id || trip.driverEmail === driver.email).sort(compareTripsBySchedule);
      const next = assigned.find(trip => !isTerminal(trip));
      const lateCount = assigned.filter(isLateTrip).length;
      const waitCount = assigned.filter(isInOutTrip).length;
      const readiness = readinessPercent([
        hasAny(driver.phone),
        hasAny(driver.vehicle),
        driver.status && driver.status !== 'Offline',
        hasAny(driver.email),
        Number(driver.odometer || 0) >= 0,
      ]);
      return { driver, assigned, next, lateCount, waitCount, readiness };
    }).sort((a, b) => b.assigned.length - a.assigned.length || a.driver.name.localeCompare(b.driver.name));

    const billing = todayTrips.map(trip => {
      const checks = [
        hasAny(trip.bookingId),
        hasAny(trip.patient),
        hasAny(trip.pickup),
        hasAny(trip.dropoff),
        hasAny(trip.driverId) || hasAny(trip.driverName),
        trip.status === 'Completed' ? hasAny(trip.completedAt) || hasAny(trip.arrivalDropoffTime) : true,
        trip.status === 'Completed' ? hasAny(trip.pickupOdometer) || hasAny(trip.dropoffOdometer) || hasAny(trip.distance) : true,
        trip.status === 'Completed' ? trip.paperSignatureConfirmed || hasAny(trip.signature) || hasAny(trip.notes) : true,
      ];
      const score = readinessPercent(checks);
      return { trip, score, missing: checks.filter(Boolean).length };
    }).sort((a, b) => a.score - b.score || compareTripsBySchedule(a.trip, b.trip));

    const complianceDrivers = drivers.map(driver => {
      const checks = [
        { label: 'Phone', ok: hasAny(driver.phone) },
        { label: 'Email', ok: hasAny(driver.email) },
        { label: 'Vehicle', ok: hasAny(driver.vehicle) && driver.vehicle !== 'Pending Assignment' },
        { label: 'Status', ok: hasAny(driver.status) },
        { label: 'Odometer', ok: Number(driver.odometer || 0) >= 0 },
      ];
      return { driver, checks, score: readinessPercent(checks.map(item => item.ok)) };
    }).sort((a, b) => a.score - b.score);

    const clients = new Map();
    todayTrips.forEach(trip => {
      const key = lower(trip.patient || trip.clientName || 'No client name');
      const record = clients.get(key) || {
        name: trip.patient || trip.clientName || 'No client name',
        phone: trip.patientPhone || trip.pickupPhone || trip.dropoffPhone || '',
        trips: [],
        inOut: 0,
        willCall: 0,
        noShow: 0,
      };
      record.trips.push(trip);
      if (isInOutTrip(trip)) record.inOut += 1;
      if (isWillCallTrip(trip)) record.willCall += 1;
      if (trip.status === 'No Show') record.noShow += 1;
      clients.set(key, record);
    });

    const facilities = new Map();
    todayTrips.forEach(trip => {
      [
        ['pickup', trip.pickup, trip.pickupSiteName],
        ['dropoff', trip.dropoff, trip.dropoffSiteName],
      ].forEach(([side, address, site]) => {
        if (!address || !looksLikeFacility(trip, side)) return;
        const name = facilityNameFromAddress(address, site);
        const key = lower(name);
        const record = facilities.get(key) || { name, address, pickups: 0, dropoffs: 0, trips: [], waitRisk: 0 };
        if (side === 'pickup') record.pickups += 1;
        else record.dropoffs += 1;
        if (isInOutTrip(trip) || isWillCallTrip(trip)) record.waitRisk += 1;
        record.trips.push(trip);
        facilities.set(key, record);
      });
    });

    const duplicateGroups = new Map();
    todayTrips.forEach(trip => {
      const key = [lower(trip.patient), lower(trip.pickup), lower(trip.dropoff), getTripTimeLabel(trip)].join('|');
      const group = duplicateGroups.get(key) || [];
      group.push(trip);
      duplicateGroups.set(key, group);
    });
    const duplicates = Array.from(duplicateGroups.values()).filter(group => group.length > 1);
    const importIssues = [
      ...todayTrips.filter(trip => !hasAny(trip.bookingId)).map(trip => ({ type: 'Missing booking ID', trip })),
      ...todayTrips.filter(trip => !hasAny(trip.pickup) || !hasAny(trip.dropoff)).map(trip => ({ type: 'Missing address', trip })),
      ...todayTrips.filter(trip => !hasAny(trip.patient)).map(trip => ({ type: 'Missing client', trip })),
      ...duplicates.flatMap(group => group.map(trip => ({ type: 'Possible duplicate', trip }))),
    ];

    const predictions = [
      ...late.slice(0, 8).map(trip => ({
        tone: 'critical',
        title: 'Recover late trip',
        body: `${trip.patient || 'Client'} is already past scheduled pickup. Dispatch should call driver/client and record reason.`,
        trip,
      })),
      ...unassigned.slice(0, 8).map(trip => ({
        tone: minutesUntil(trip) !== null && minutesUntil(trip) <= 30 ? 'critical' : 'warning',
        title: 'Assign before service failure',
        body: `${getTripTimeLabel(trip)} ${trip.patient || 'client'} needs a driver. Nearby available drivers: ${availableDrivers.slice(0, 3).map(driver => driver.name).join(', ') || 'none online'}.`,
        trip,
      })),
      ...inOut.filter(trip => trip.legRelationship === 'in_out_return').slice(0, 6).map(trip => ({
        tone: 'wait',
        title: 'Preserve IN/OUT pairing',
        body: `${trip.patient || 'Client'} return leg should stay after booking ${trip.pairedAfterBookingId || 'A-leg'} with the same driver.`,
        trip,
      })),
      ...willCall.slice(0, 6).map(trip => ({
        tone: 'info',
        title: 'Will Call staging',
        body: `${trip.patient || 'Client'} is unscheduled. Keep under timed trips until the client/facility calls.`,
        trip,
      })),
    ].slice(0, 20);

    return {
      todayTrips,
      activeTrips,
      completedTrips,
      unassigned,
      inProgress,
      late,
      soon,
      inOut,
      willCall,
      activeDrivers,
      availableDrivers,
      onlineDispatchers,
      exceptions,
      driverLines,
      billing,
      complianceDrivers,
      clients: Array.from(clients.values()).sort((a, b) => b.trips.length - a.trips.length),
      facilities: Array.from(facilities.values()).sort((a, b) => b.trips.length - a.trips.length),
      importIssues,
      predictions,
    };
  }, [dispatchers, drivers, trips]);

  const focusTrip = (trip) => {
    if (!trip) return;
    setSearchQuery?.(trip.bookingId || trip.patient || trip.id || '');
    setOperationsTab?.('manifest');
    setModule('dispatch');
    addToast?.('Focused trip', `${trip.patient || 'Trip'} is now in the dispatch search.`, 'success');
  };

  const nav = [];

  const content = () => operationsBoard;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {content()}
      </div>
    </div>
  );
}
