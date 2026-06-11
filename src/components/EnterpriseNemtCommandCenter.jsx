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
        detail: `${getTripTimeLabel(trip)} · ${trip.patient || 'Unknown client'} · ${getDriverName(trip, drivers)}`,
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
        detail: `${getTripTimeLabel(trip)} · ${trip.patient || 'Unknown client'} · pickup ${trip.pickup || 'missing'}`,
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
        detail: `${trip.patient || 'Client'} · keep below timed manifest until call arrives`,
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
      const key = lower(trip.patient || trip.clientName || 'Unknown client');
      const record = clients.get(key) || {
        name: trip.patient || trip.clientName || 'Unknown client',
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

  const nav = [
    { id: 'command', label: 'Command', icon: Gauge },
    { id: 'dispatch', label: 'Dispatch', icon: Route },
    { id: 'exceptions', label: 'Exceptions', icon: AlertTriangle },
    { id: 'timeline', label: 'Timeline', icon: CalendarClock },
    { id: 'predictive', label: 'Predictive', icon: Sparkles },
    { id: 'billing', label: 'Billing', icon: Receipt },
    { id: 'compliance', label: 'Compliance', icon: ShieldCheck },
    { id: 'clients', label: 'Clients', icon: UserRound },
    { id: 'facilities', label: 'Facilities', icon: Building2 },
    { id: 'import', label: 'Import QA', icon: UploadCloud },
  ];

  const renderExceptionList = (items = model.exceptions) => (
    <div className="space-y-2">
      {items.length === 0 ? <EmptyState title="No critical exceptions" body="The live board has no urgent operational exceptions right now." /> : items.map(item => (
        <button key={item.id} type="button" onClick={() => focusTrip(item.trip)} className="flex w-full items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-blue-200 hover:bg-blue-50/40">
          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${statusClass(item.severity)}`}>
            {item.severity === 'critical' ? <AlertTriangle size={16} /> : item.severity === 'wait' ? <Clock size={16} /> : <BellRing size={16} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black text-slate-950">{item.title}</p>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${statusClass(item.severity)}`}>{urgency(item.trip)}</span>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">{item.detail}</p>
          </div>
          <ArrowRight size={16} className="mt-2 text-slate-300" />
        </button>
      ))}
    </div>
  );

  const renderCommand = () => (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Route} label="Today Trips" value={model.todayTrips.length} detail={`${model.activeTrips.length} active · ${model.completedTrips.length} completed`} tone="info" />
        <Metric icon={AlertTriangle} label="Exceptions" value={model.exceptions.length} detail={`${model.late.length} late · ${model.unassigned.length} unassigned`} tone={model.exceptions.length ? 'critical' : 'good'} />
        <Metric icon={Truck} label="Driver Coverage" value={`${model.activeDrivers.length}/${drivers.length}`} detail={`${model.availableDrivers.length} available or clocked in`} tone="ready" />
        <Metric icon={Receipt} label="Billing Ready" value={`${model.billing.filter(item => item.score >= 85).length}/${model.billing.length}`} detail="Completed proof and required fields" tone="good" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <SectionHeader icon={AlertTriangle} title="Exception Command Board" subtitle="Late risk, assignment gaps, IN/OUT waits, and will-call aging." />
          <div className="mt-3">{renderExceptionList(model.exceptions.slice(0, 10))}</div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <SectionHeader icon={Sparkles} title="Predictive Dispatch" subtitle="System-generated next best actions from current operations." action={<button type="button" onClick={onOpenSequencer} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">Route</button>} />
          <div className="mt-3 space-y-2">
            {model.predictions.length === 0 ? <EmptyState title="No predictions" body="Once trips are active, predictive actions appear here." /> : model.predictions.slice(0, 8).map((item, index) => (
              <button key={`${item.title}-${index}`} type="button" onClick={() => focusTrip(item.trip)} className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-left hover:bg-white">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${statusClass(item.tone)}`}>{item.tone}</span>
                  <p className="text-xs font-black text-slate-900">{item.title}</p>
                </div>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{item.body}</p>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <SectionHeader icon={MessageSquare} title="Communication Readiness" subtitle="Client/facility contact quality." />
          <div className="mt-3 space-y-2 text-xs font-semibold text-slate-600">
            <p>{model.todayTrips.filter(trip => hasAny(trip.patientPhone) || hasAny(trip.pickupPhone) || hasAny(trip.dropoffPhone)).length} trips have at least one phone number.</p>
            <p>{model.todayTrips.filter(trip => !hasAny(trip.patientPhone) && !hasAny(trip.pickupPhone) && !hasAny(trip.dropoffPhone)).length} trips need contact cleanup.</p>
            <p>{model.willCall.length} will-call conversations should be monitored.</p>
          </div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <SectionHeader icon={ClipboardCheck} title="Import Reconciliation" subtitle="Potential upload/data quality problems." />
          <div className="mt-3 text-2xl font-black text-slate-950">{model.importIssues.length}</div>
          <p className="text-xs font-semibold text-slate-500">missing fields, possible duplicates, or malformed rows</p>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <SectionHeader icon={HeartPulse} title="Service Quality" subtitle="What leadership cares about today." />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div><p className="text-lg font-black text-slate-950">{model.late.length}</p><p className="text-[10px] font-bold uppercase text-slate-400">Late</p></div>
            <div><p className="text-lg font-black text-slate-950">{model.inOut.length}</p><p className="text-[10px] font-bold uppercase text-slate-400">IN/OUT</p></div>
            <div><p className="text-lg font-black text-slate-950">{model.willCall.length}</p><p className="text-[10px] font-bold uppercase text-slate-400">Will Call</p></div>
          </div>
        </section>
      </div>
    </div>
  );

  const renderTimeline = () => (
    <div className="space-y-3">
      {model.driverLines.length === 0 ? <EmptyState title="No drivers configured" body="Add drivers to see the live operational timeline." /> : model.driverLines.map(line => (
        <section key={line.driver.id || line.driver.email || line.driver.name} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-950">{line.driver.name || 'Driver'}</p>
              <p className="text-xs font-semibold text-slate-500">{line.driver.vehicle || 'No vehicle'} · {line.driver.status || 'No status'} · readiness {line.readiness}%</p>
            </div>
            <div className="flex gap-2">
              <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${line.lateCount ? statusClass('critical') : statusClass('good')}`}>{line.lateCount} late</span>
              <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${line.waitCount ? statusClass('wait') : statusClass('info')}`}>{line.waitCount} waits</span>
            </div>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {line.assigned.length === 0 ? (
              <div className="min-w-[220px] rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-400">No active trips assigned.</div>
            ) : line.assigned.slice(0, 12).map(trip => (
              <button key={trip.id} type="button" onClick={() => focusTrip(trip)} className={`min-w-[220px] rounded-lg border p-3 text-left ${isLateTrip(trip) ? 'border-rose-200 bg-rose-50' : isInOutTrip(trip) ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                <p className="text-xs font-black text-slate-950">{getTripTimeLabel(trip)} · {trip.patient || 'Client'}</p>
                <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">{trip.pickup || 'Pickup missing'}</p>
                <p className="mt-1 text-[10px] font-black uppercase text-slate-400">{trip.status || 'No status'}</p>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );

  const renderBilling = () => (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Metric icon={Receipt} label="Ready Packets" value={model.billing.filter(item => item.score >= 85).length} tone="good" />
        <Metric icon={FileWarning} label="Needs Review" value={model.billing.filter(item => item.score < 85).length} tone="warning" />
        <Metric icon={CheckCircle2} label="Completed Today" value={model.completedTrips.length} tone="info" />
      </div>
      {model.billing.slice(0, 40).map(item => (
        <button key={item.trip.id} type="button" onClick={() => focusTrip(item.trip)} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left hover:bg-slate-50">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${item.score >= 85 ? statusClass('good') : item.score >= 60 ? statusClass('warning') : statusClass('critical')}`}>
            {item.score}%
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-slate-950">{item.trip.patient || 'Client'} · {item.trip.bookingId || item.trip.id}</p>
            <p className="truncate text-xs font-semibold text-slate-500">{item.trip.status || 'No status'} · {getDriverName(item.trip, drivers)} · {item.trip.distance || 'mileage pending'}</p>
          </div>
          <Receipt size={16} className="text-slate-300" />
        </button>
      ))}
    </div>
  );

  const renderCompliance = () => (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <SectionHeader icon={ShieldCheck} title="Driver Compliance Readiness" subtitle="Assignment blockers and missing profile fields." />
        <div className="mt-3 space-y-2">
          {model.complianceDrivers.map(item => (
            <div key={item.driver.id || item.driver.email || item.driver.name} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-black text-slate-950">{item.driver.name}</p>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${item.score >= 80 ? statusClass('good') : statusClass('warning')}`}>{item.score}%</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.checks.map(check => (
                  <span key={check.label} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${check.ok ? statusClass('good') : statusClass('warning')}`}>{check.label}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <SectionHeader icon={Truck} title="Vehicle Readiness" subtitle="Vehicle assignment and service signals from driver profiles." />
        <div className="mt-3 space-y-2">
          {drivers.map(driver => (
            <div key={`${driver.id || driver.email}-vehicle`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950">{driver.vehicle || 'No vehicle assigned'}</p>
                <p className="truncate text-xs font-semibold text-slate-500">{driver.name} · odo {driver.odometer || 0} · next oil {driver.nextOilChange || 'n/a'}</p>
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${driver.vehicle ? statusClass('good') : statusClass('warning')}`}>{driver.vehicle ? 'Ready' : 'Missing'}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  const renderClients = () => (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
      {model.clients.slice(0, 60).map(client => (
        <button key={client.name} type="button" onClick={() => focusTrip(client.trips[0])} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-blue-200 hover:bg-blue-50/30">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-950">{client.name}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{formatPhone(client.phone)}</p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black text-slate-600">{client.trips.length} legs</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {client.inOut > 0 && <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClass('wait')}`}>{client.inOut} IN/OUT</span>}
            {client.willCall > 0 && <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClass('info')}`}>{client.willCall} Will Call</span>}
            {client.noShow > 0 && <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClass('critical')}`}>{client.noShow} No Show</span>}
          </div>
        </button>
      ))}
    </div>
  );

  const renderFacilities = () => (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
      {model.facilities.length === 0 ? <EmptyState title="No facility patterns found" body="Facility cards appear when site names or medical/facility addresses are present." /> : model.facilities.slice(0, 60).map(facility => (
        <button key={facility.name} type="button" onClick={() => focusTrip(facility.trips[0])} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-blue-200 hover:bg-blue-50/30">
          <p className="truncate text-sm font-black text-slate-950">{facility.name}</p>
          <p className="mt-1 truncate text-xs font-semibold text-slate-500">{facility.address}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div><p className="text-lg font-black text-slate-950">{facility.pickups}</p><p className="text-[10px] font-bold uppercase text-slate-400">PU</p></div>
            <div><p className="text-lg font-black text-slate-950">{facility.dropoffs}</p><p className="text-[10px] font-bold uppercase text-slate-400">DO</p></div>
            <div><p className="text-lg font-black text-slate-950">{facility.waitRisk}</p><p className="text-[10px] font-bold uppercase text-slate-400">Wait</p></div>
          </div>
        </button>
      ))}
    </div>
  );

  const renderImportQa = () => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <SectionHeader icon={UploadCloud} title="Broker Import Quality Center" subtitle="Diff-style review for missing IDs, duplicates, addresses, and client data." />
        <button type="button" onClick={() => setShowUploadModal?.(true)} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">Upload trips</button>
      </div>
      {model.importIssues.length === 0 ? <EmptyState title="Import data looks clean" body="No missing critical fields or likely duplicates found in today’s manifest." /> : model.importIssues.slice(0, 80).map((issue, index) => (
        <button key={`${issue.type}-${issue.trip.id}-${index}`} type="button" onClick={() => focusTrip(issue.trip)} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left hover:bg-slate-50">
          <FileWarning size={18} className="shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-950">{issue.type}</p>
            <p className="truncate text-xs font-semibold text-slate-500">{issue.trip.patient || 'Unknown client'} · {issue.trip.bookingId || issue.trip.id || 'No ID'} · {getTripTimeLabel(issue.trip)}</p>
          </div>
        </button>
      ))}
    </div>
  );

  const content = {
    command: renderCommand,
    dispatch: () => operationsBoard,
    exceptions: () => <section className="rounded-xl border border-slate-200 bg-slate-50 p-4"><SectionHeader icon={AlertTriangle} title="Exception Command Board" subtitle="Prioritized operational failures and near-failures." /><div className="mt-3">{renderExceptionList()}</div></section>,
    timeline: renderTimeline,
    predictive: () => <section className="rounded-xl border border-slate-200 bg-white p-4"><SectionHeader icon={Sparkles} title="Predictive Dispatch Queue" subtitle="Next best actions before trips fail." /><div className="mt-3 space-y-2">{model.predictions.map((item, index) => <button key={`${item.title}-${index}`} type="button" onClick={() => focusTrip(item.trip)} className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-left hover:bg-white"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${statusClass(item.tone)}`}>{item.tone}</span><p className="mt-2 text-sm font-black text-slate-950">{item.title}</p><p className="mt-1 text-xs font-semibold text-slate-500">{item.body}</p></button>)}</div></section>,
    billing: renderBilling,
    compliance: renderCompliance,
    clients: renderClients,
    facilities: renderFacilities,
    import: renderImportQa,
  }[module] || renderCommand;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-black text-slate-950">NEMT Enterprise Command OS</h1>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${isOnline ? statusClass('good') : statusClass('critical')}`}>{isOnline ? 'Live' : 'Offline'}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase text-slate-500">{role}</span>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">Dispatch, routing, billing readiness, compliance, client/facility intelligence, and predictive exceptions in one operating surface.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onOpenLiveMap} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700"><MapPin size={14} /> Map</button>
            <button type="button" onClick={onOpenSequencer} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700"><Navigation size={14} /> Route</button>
            <button type="button" onClick={() => setShowUploadModal?.(true)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700"><UploadCloud size={14} /> Import</button>
            <button type="button" onClick={onTogglePanel} className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-black text-white"><PanelRight size={14} /> Panel</button>
          </div>
        </div>
        <div className="mt-3 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
          {nav.map(item => {
            const Icon = item.icon;
            const active = module === item.id;
            return (
              <button key={item.id} type="button" onClick={() => setModule(item.id)} className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-black ${active ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                <Icon size={14} /> {item.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {content()}
      </div>
    </div>
  );
}
