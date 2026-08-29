import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, MapPin, RotateCcw, Search, Send, UploadCloud, UserRound, XCircle } from 'lucide-react';
import { localCalendarYmd, tripCalendarDateKey } from '../utils/tripDate';
import { tripMatchesSearch } from '../utils/search';
import { buildCostOverrideRows, buildCostOverrideWeekOptions, costOverrideWeekEnd, costOverrideWeekStart, resolveCostOverrideRules } from '../utils/unloadedMileage';

const money = value => value === null || value === undefined || value === '' ? 'Missing' : `$${Number(value).toFixed(2)}`;
const badgeClass = status => ({
  confirmed: 'bg-emerald-100 text-emerald-700', dismissed: 'bg-slate-100 text-slate-600',
  missing_data: 'bg-rose-100 text-rose-700', not_eligible: 'bg-slate-100 text-slate-600',
}[status] || 'bg-amber-100 text-amber-700');
const statusLabel = status => ({ candidate: 'Needs review', missing_data: 'Missing data', not_eligible: 'No override', dismissed: 'Excluded' }[status] || status);
const displayDate = dateKey => {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!year || !month || !day) return dateKey || 'Unknown';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(year, month - 1, day));
};
const displayClock = value => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return String(value);
};

const UnloadedTripsReport = ({ trips = [], drivers = [], onUpdateTrip, appSettings = {}, onOpenImport }) => {
  const [selectedWeek, setSelectedWeek] = useState(() => costOverrideWeekStart(localCalendarYmd()));
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [drafts, setDrafts] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const [expandedRows, setExpandedRows] = useState({});
  const rules = useMemo(() => resolveCostOverrideRules(appSettings.costOverrideRules), [appSettings.costOverrideRules]);
  const driverById = useMemo(() => new Map(drivers.map(driver => [driver.id, driver])), [drivers]);
  const weekOptions = useMemo(() => buildCostOverrideWeekOptions(trips), [trips]);
  const activeWeek = weekOptions.some(option => option.start === selectedWeek) ? selectedWeek : (weekOptions[0]?.start || selectedWeek);
  const selectedWeekEnd = costOverrideWeekEnd(activeWeek);
  const selectedWeekIndex = weekOptions.findIndex(option => option.start === activeWeek);
  const allWeekRows = useMemo(() => buildCostOverrideRows(trips, rules, { includeCoverage: true })
    .filter(row => {
      const date = tripCalendarDateKey(row.trip.date);
      if (!date || date < activeWeek || date > costOverrideWeekEnd(activeWeek)) return false;
      const driver = driverById.get(row.trip.driverId);
      return tripMatchesSearch(row.trip, searchQuery, [driver?.name, driver?.phone, row.fromCity, row.toCity]);
    })
    .sort((a, b) => tripCalendarDateKey(b.trip.date).localeCompare(tripCalendarDateKey(a.trip.date))),
  [activeWeek, driverById, rules, searchQuery, trips]);
  const rows = useMemo(() => allWeekRows.filter(row => {
    if (statusFilter === 'open') return ['candidate', 'missing_data'].includes(row.status);
    return statusFilter === 'all' || row.status === statusFilter;
  }), [allWeekRows, statusFilter]);

  const totals = useMemo(() => ({
    trips: allWeekRows.length,
    candidates: allWeekRows.filter(row => row.status === 'candidate').length,
    missing: allWeekRows.filter(row => row.status === 'missing_data').length,
    confirmed: allWeekRows.filter(row => row.status === 'confirmed').length,
    overrides: allWeekRows.filter(row => ['candidate', 'confirmed'].includes(row.status)).reduce((sum, row) => sum + row.overrideAmount, 0),
  }), [allWeekRows]);

  const draftValue = (row, field, fallback) => drafts[row.id]?.[field] ?? fallback;
  const setDraft = (row, field, value) => setDrafts(current => ({ ...current, [row.id]: { ...(current[row.id] || {}), [field]: value } }));
  const draftNumber = (row, field, fallback) => {
    const value = draftValue(row, field, fallback ?? '');
    if (value === '') return null;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const displayRow = row => {
    const unloadedMiles = draftNumber(row, 'unloadedMiles', row.unloadedMiles);
    const waitingHours = draftNumber(row, 'waitingHours', row.hasWaitingData ? row.waitingHours : null);
    const originalCost = draftNumber(row, 'originalCost', row.originalCost);
    const waitingNoInterveningTrips = Boolean(draftValue(row, 'waitingNoInterveningTrips', row.waitingNoInterveningTrips));
    const serviceAllowed = row.serviceCode === 'W' ? rules.includeWheelchair !== false : rules.includeAmbulatory !== false;
    const unloadedAmount = serviceAllowed && rules.collectUnloadedMileage !== false && row.routeVerified && unloadedMiles !== null && unloadedMiles > rules.minimumUnloadedMiles && !row.unloadedExclusionReason
      ? unloadedMiles * rules.unloadedRatePerMile : 0;
    const waitingRawMinutes = waitingHours === null ? null : (waitingHours * 60) + rules.waitingGraceMinutes;
    const waitingEvidenceAllowed = rules.requireNoInterveningTripsForWaiting === false || waitingNoInterveningTrips;
    const waitingAmount = serviceAllowed && rules.collectWaitingTime !== false && row.routeVerified && waitingHours !== null && waitingHours > 0
      && waitingRawMinutes > rules.minimumWaitingMinutes && waitingEvidenceAllowed && !row.waitingExclusionReason
      ? waitingHours * rules.waitingRatePerHour : 0;
    return {
      ...row, unloadedMiles, waitingHours, originalCost, unloadedAmount, waitingAmount, waitingRawMinutes, waitingNoInterveningTrips,
      overrideAmount: unloadedAmount + waitingAmount,
      totalCost: originalCost === null ? null : originalCost + unloadedAmount + waitingAmount,
    };
  };
  const saveDecision = (row, status, extra = {}) => {
    const current = displayRow(row);
    const { unloadedMiles, waitingHours, originalCost } = current;
    if (status !== 'confirmed') {
      setValidationErrors(errors => ({ ...errors, [row.id]: '' }));
      onUpdateTrip?.(row.trip.id, {
        costOverride: { ...(row.trip.costOverride || {}), status, reviewedAt: new Date().toISOString(), ...extra },
        unloadedMileage: { ...(row.trip.unloadedMileage || {}), status },
      });
      return;
    }
    if (unloadedMiles === null || unloadedMiles < 0 || waitingHours === null || waitingHours < 0 || originalCost === null || originalCost < 0) {
      setValidationErrors(errors => ({ ...errors, [row.id]: 'Enter the original cost, unloaded miles, and wait hours before saving.' }));
      return;
    }
    if (current.overrideAmount <= 0) {
      setValidationErrors(errors => ({ ...errors, [row.id]: 'This row has no override under the current rules. Exclude it instead of confirming a $0 override.' }));
      return;
    }
    setValidationErrors(errors => ({ ...errors, [row.id]: '' }));
    const serviceAllowed = row.serviceCode === 'W' ? rules.includeWheelchair !== false : rules.includeAmbulatory !== false;
    const unloadedEligible = serviceAllowed && rules.collectUnloadedMileage !== false && row.routeVerified && unloadedMiles > rules.minimumUnloadedMiles && !row.unloadedExclusionReason;
    const waitingEligible = serviceAllowed && rules.collectWaitingTime !== false && row.routeVerified && current.waitingRawMinutes > rules.minimumWaitingMinutes
      && (rules.requireNoInterveningTripsForWaiting === false || current.waitingNoInterveningTrips) && waitingHours > 0 && !row.waitingExclusionReason;
    const unloadedAmount = unloadedEligible ? unloadedMiles * rules.unloadedRatePerMile : 0;
    const waitingAmount = waitingEligible ? waitingHours * rules.waitingRatePerHour : 0;
    onUpdateTrip?.(row.trip.id, {
      costOverride: {
        ...(row.trip.costOverride || {}), status, unloadedMiles, waitingHours, waitingNoInterveningTrips: current.waitingNoInterveningTrips,
        unloadedAmount, waitingAmount, overrideAmount: unloadedAmount + waitingAmount,
        totalCost: originalCost + unloadedAmount + waitingAmount,
        fromCity: row.fromCity, toCity: row.toCity, bookingId: row.bookingId,
        detectionMethod: 'independent_booking_leg', rulesSnapshot: rules,
        reviewedAt: new Date().toISOString(), ...extra,
      },
      unloadedMileage: {
        ...(row.trip.unloadedMileage || {}), status, miles: unloadedMiles,
        detectionMethod: 'independent_booking_leg', minimumMiles: rules.minimumUnloadedMiles,
      },
      overrideWaitingHours: waitingHours,
      originalTripCost: originalCost,
      unloadedMileageMiles: unloadedMiles,
    });
  };

  const renderActions = row => {
    const requested = row.trip.costOverride?.paymentRequestStatus === 'requested';
    return <div className="flex flex-wrap items-center gap-1">
      {['candidate', 'missing_data'].includes(row.status) && <button type="button" onClick={() => saveDecision(row, 'confirmed', { paymentRequestStatus: 'ready' })} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-emerald-600 px-2 text-[10px] font-bold text-white"><CheckCircle2 size={13} /> Confirm</button>}
      {!['confirmed', 'dismissed'].includes(row.status) && <button type="button" onClick={() => saveDecision(row, 'dismissed', { paymentRequestStatus: 'not_applicable' })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] font-bold text-slate-600"><XCircle size={13} /> Exclude</button>}
      {row.status === 'confirmed' && !requested && <button type="button" onClick={() => saveDecision(row, 'confirmed', { paymentRequestStatus: 'requested', paymentRequestedAt: new Date().toISOString() })} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-blue-600 px-2 text-[10px] font-bold text-white"><Send size={13} /> Mark requested</button>}
      {['confirmed', 'dismissed'].includes(row.status) && <button type="button" onClick={() => saveDecision(row, 'candidate', { paymentRequestStatus: 'not_requested', paymentRequestedAt: null })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] font-bold text-slate-600"><RotateCcw size={13} /> Reopen</button>}
    </div>;
  };

  const renderTripDetails = row => {
    const assignedDriver = driverById.get(row.driverId);
    const driverName = row.driverName || assignedDriver?.name || 'Unassigned';
    const waitingEvidence = row.waitingVerificationStatus === 'verified'
      ? 'Automatically verified from the gap between this trip and the rider return trip.'
      : row.waitingVerificationStatus === 'blocked'
        ? `Blocked: ${row.interveningTripIds.length} other trip${row.interveningTripIds.length === 1 ? '' : 's'} occurred during this waiting window.`
        : row.waitingUnverifiableTripIds?.length
          ? `Cannot verify: ${row.waitingUnverifiableTripIds.length} same-driver trip${row.waitingUnverifiableTripIds.length === 1 ? '' : 's'} in this date has incomplete timestamps.`
        : row.hasWaitingData
          ? 'The report contains waiting time, but no-intervening-trip evidence still needs review.'
          : 'No waiting duration was reported or derived.';
    return <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="flex items-center gap-1 font-semibold uppercase tracking-wide text-slate-400"><UserRound size={13} /> Rider and driver</p><p className="mt-2 font-semibold text-slate-900">{row.patientName || 'Rider not recorded'}</p><p className="mt-1 text-slate-600">Driver: {driverName}</p><p className="mt-1 font-mono text-slate-500">Booking #{row.bookingId}</p></div>
      <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="flex items-center gap-1 font-semibold uppercase tracking-wide text-slate-400"><MapPin size={13} /> Complete route</p><p className="mt-2 font-semibold text-slate-900">Pickup: {row.pickupAddress || row.fromCity || 'Missing'}</p><p className="mt-1 font-semibold text-slate-700">Dropoff: {row.dropoffAddress || row.toCity || 'Missing'}</p><p className={`mt-2 font-semibold ${row.routeVerified ? 'text-emerald-700' : 'text-rose-700'}`}>{row.routeVerified ? `${row.fromCity} → ${row.toCity}` : 'City verification required'}</p></div>
      <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="flex items-center gap-1 font-semibold uppercase tracking-wide text-slate-400"><Clock3 size={13} /> Trip timeline</p><p className="mt-2 text-slate-700">Scheduled: <strong>{displayClock(row.scheduledPickupTime)}</strong></p><p className="mt-1 text-slate-700">Pickup arrival: <strong>{displayClock(row.pickupArrivalTime)}</strong></p><p className="mt-1 text-slate-700">Pickup departure: <strong>{displayClock(row.pickupDepartureTime)}</strong></p><p className="mt-1 text-slate-700">Dropoff arrival: <strong>{displayClock(row.dropoffArrivalTime)}</strong></p></div>
      <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="font-semibold uppercase tracking-wide text-slate-400">Waiting verification</p><p className={`mt-2 font-semibold ${row.waitingVerificationStatus === 'blocked' ? 'text-rose-700' : row.waitingNoInterveningTrips ? 'text-emerald-700' : 'text-amber-700'}`}>{waitingEvidence}</p>{row.waitingWindowStart && <p className="mt-2 text-slate-600">Window: {displayClock(row.waitingWindowStart)} – {displayClock(row.waitingWindowEnd)}</p>}
        {row.waitingVerificationStatus !== 'blocked' && row.hasWaitingData && <label className="mt-3 flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 font-semibold text-slate-700"><input type="checkbox" checked={Boolean(draftValue(row, 'waitingNoInterveningTrips', row.waitingNoInterveningTrips))} disabled={row.waitingVerificationStatus === 'verified'} onChange={event => setDraft(row, 'waitingNoInterveningTrips', event.target.checked)} className="h-4 w-4" />No other trip was worked during this wait</label>}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:col-span-2 lg:col-span-4"><p className="font-semibold uppercase tracking-wide text-slate-400">Calculation and decision evidence</p><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-semibold text-slate-700"><span>Unloaded: {row.unloadedMiles ?? 'Missing'} mi × {money(rules.unloadedRatePerMile)} = {money(row.unloadedAmount)}</span><span>Waiting: {row.waitingHours ?? 'Missing'} hr × {money(rules.waitingRatePerHour)} = {money(row.waitingAmount)}</span><span>Original: {money(row.originalCost)}</span><span>Total: {money(row.totalCost)}</span></div><p className="mt-2 text-slate-600">{row.reason}</p></div>
    </div>;
  };

  return <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
    <div className="border-b border-slate-200 bg-white px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Previous week" disabled={selectedWeekIndex < 0 || selectedWeekIndex >= weekOptions.length - 1} onClick={() => setSelectedWeek(weekOptions[selectedWeekIndex + 1]?.start || activeWeek)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 disabled:opacity-30"><ChevronLeft size={17} /></button>
        <label className="min-w-[230px] flex-1 sm:max-w-[340px]"><span className="sr-only">Report week</span><select value={activeWeek} onChange={event => setSelectedWeek(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800">
          {weekOptions.map(option => <option key={option.start} value={option.start}>{displayDate(option.start)} – {displayDate(option.end)} · {option.tripCount} completed</option>)}
        </select></label>
        <button type="button" aria-label="Next week" disabled={selectedWeekIndex <= 0} onClick={() => setSelectedWeek(weekOptions[selectedWeekIndex - 1]?.start || activeWeek)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 disabled:opacity-30"><ChevronRight size={17} /></button>
        <div className="flex min-h-10 w-full flex-none items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 sm:w-auto sm:max-w-[300px] sm:flex-1"><Search size={14} className="text-slate-400" /><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Booking, rider, driver, city…" className="w-full bg-transparent text-xs font-semibold text-slate-700 outline-none" /></div>
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"><option value="open">Needs review + missing</option><option value="candidate">Override candidates</option><option value="missing_data">Missing source data</option><option value="confirmed">Confirmed</option><option value="not_eligible">No override</option><option value="dismissed">Excluded</option><option value="all">All completed trips</option></select>
        {onOpenImport && <button type="button" onClick={onOpenImport} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white"><UploadCloud size={15} /> Import weekly report</button>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[['Completed trips', totals.trips, 'text-slate-900'], ['Override candidates', totals.candidates, 'text-amber-700'], ['Missing source data', totals.missing, 'text-rose-700'], ['Confirmed', totals.confirmed, 'text-emerald-700'], ['Eligible adjustment', money(totals.overrides), 'text-blue-700']].map(([label, value, tone], index) => <div key={label} className={`rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 ${index === 4 ? 'col-span-2 sm:col-span-1' : ''}`}><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-0.5 text-lg font-semibold ${tone}`}>{value}</p></div>)}
      </div>
    </div>
    <div className="mx-3 mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-900">Week: {displayDate(activeWeek)} – {displayDate(selectedWeekEnd)}. Eligible unloaded mileage must be more than {rules.minimumUnloadedMiles} mi. Waiting must exceed {rules.minimumWaitingMinutes / 60} hr{rules.requireNoInterveningTripsForWaiting !== false ? ' with no other trip worked during the waiting window' : ''}. Route exclusions and same-city rules follow the Cost Override settings; the default excludes Indianapolis → Indianapolis from both.</div>
    <div className="min-h-0 flex-1 overflow-auto px-3 pb-24 md:pb-3">
      <div className="mt-3 space-y-2 md:hidden">{rows.map(baseRow => { const row = displayRow(baseRow); return <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2"><div><p className="font-mono text-sm font-bold text-blue-700">#{row.bookingId}</p><p className="mt-0.5 text-sm font-semibold text-slate-900">{row.patientName || 'Rider not recorded'}</p><p className="mt-0.5 text-xs font-semibold text-slate-600">{row.fromCity || 'Unknown'} → {row.toCity || 'Unknown'}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${badgeClass(row.status)}`}>{statusLabel(row.status)}</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]"><div><p className="font-semibold text-slate-400">Date</p><p className="font-semibold text-slate-700">{row.date}</p></div><div><p className="font-semibold text-slate-400">A/W</p><p className="font-semibold text-slate-700">{row.serviceCode}</p></div>
          <label><span className="font-semibold text-slate-500">Original cost</span><input type="number" min="0" step="0.01" value={draftValue(row, 'originalCost', row.originalCost ?? '')} onChange={event => setDraft(row, 'originalCost', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 font-mono" /></label>
          <label><span className="font-semibold text-slate-500">Unloaded miles</span><input type="number" min="0" step="0.1" value={draftValue(row, 'unloadedMiles', row.unloadedMiles ?? '')} onChange={event => setDraft(row, 'unloadedMiles', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 font-mono" /></label>
          <label><span className="font-semibold text-slate-500">Billable wait hours</span><input type="number" min="0" step="0.25" value={draftValue(row, 'waitingHours', row.hasWaitingData ? row.waitingHours : '')} onChange={event => setDraft(row, 'waitingHours', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 font-mono" /></label></div>
        <div className="my-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2 text-xs"><div><span className="text-slate-500">Unloaded amount</span><strong className="block text-blue-700">{money(row.unloadedAmount)}</strong></div><div><span className="text-slate-500">Waiting amount</span><strong className="block text-blue-700">{money(row.waitingAmount)}</strong></div><div><span className="text-slate-500">Total adjustment</span><strong className="block text-blue-700">{money(row.overrideAmount)}</strong></div><div><span className="text-slate-500">Total cost</span><strong className="block text-slate-900">{money(row.totalCost)}</strong></div></div><details className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-2"><summary className="cursor-pointer text-xs font-bold text-blue-700">Full trip and waiting evidence</summary><div className="mt-2">{renderTripDetails(row)}</div></details>{validationErrors[row.id] && <p className="mb-2 flex items-start gap-1 text-[10px] font-semibold text-rose-700"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{validationErrors[row.id]}</p>}<p className="mb-3 text-[10px] font-semibold text-slate-500">{row.reason}</p>{renderActions(row)}
      </article>; })}</div>
      <table className="mt-3 hidden min-w-[1240px] w-full rounded-xl border border-slate-200 bg-white text-xs shadow-sm md:table"><thead className="sticky top-0 bg-blue-600 text-white"><tr>{['', 'Date / Booking', 'Rider / Driver', 'Route', 'A/W', 'Original', `Unloaded > ${rules.minimumUnloadedMiles} mi`, `Waiting > ${rules.minimumWaitingMinutes / 60} hr`, 'Adjustment', 'Total', 'Status', 'Actions'].map(label => <th key={label || 'details'} className="px-2 py-2 text-left font-semibold">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map(baseRow => { const row = displayRow(baseRow); const expanded = Boolean(expandedRows[row.id]); const assignedDriver = driverById.get(row.driverId); return <React.Fragment key={row.id}><tr className="align-top hover:bg-blue-50/60"><td className="px-2 py-2"><button type="button" aria-label={`${expanded ? 'Hide' : 'Show'} details ${row.bookingId}`} onClick={() => setExpandedRows(current => ({ ...current, [row.id]: !expanded }))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-blue-700">{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button></td><td className="whitespace-nowrap px-2 py-2"><p>{row.date}</p><p className="mt-1 font-mono font-semibold text-blue-700">#{row.bookingId}</p></td><td className="max-w-44 px-2 py-2"><p className="font-semibold text-slate-900">{row.patientName || 'Rider missing'}</p><p className="mt-1 text-slate-500">{row.driverName || assignedDriver?.name || 'Unassigned'}</p></td><td className="max-w-48 px-2 py-2"><p className="font-semibold text-slate-900">{row.fromCity || 'Missing'} → {row.toCity || 'Missing'}</p><p className={`mt-1 ${row.routeVerified ? 'text-slate-500' : 'font-semibold text-rose-700'}`}>{row.routeVerified ? 'Route verified' : 'Cities required'}</p></td><td className="px-2 py-2">{row.serviceCode}</td>
          <td className="px-2 py-2"><input aria-label={`Original cost ${row.bookingId}`} type="number" min="0" step="0.01" value={draftValue(row, 'originalCost', row.originalCost ?? '')} onChange={event => setDraft(row, 'originalCost', event.target.value)} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 font-mono" /></td>
          <td className="px-2 py-2"><input aria-label={`Unloaded miles ${row.bookingId}`} type="number" min="0" step="0.1" value={draftValue(row, 'unloadedMiles', row.unloadedMiles ?? '')} onChange={event => setDraft(row, 'unloadedMiles', event.target.value)} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 font-mono" /><p className="mt-1 font-mono font-semibold text-blue-700">{money(row.unloadedAmount)}</p></td>
          <td className="px-2 py-2"><input aria-label={`Wait hours ${row.bookingId}`} type="number" min="0" step="0.25" value={draftValue(row, 'waitingHours', row.hasWaitingData ? row.waitingHours : '')} onChange={event => setDraft(row, 'waitingHours', event.target.value)} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 font-mono" /><p className={`mt-1 font-semibold ${row.waitingNoInterveningTrips ? 'text-emerald-700' : 'text-amber-700'}`}>{row.waitingNoInterveningTrips ? 'No trip between' : 'Evidence needed'}</p><p className="mt-1 font-mono text-blue-700">{money(row.waitingAmount)}</p></td><td className="px-2 py-2 font-mono font-bold text-blue-700">{money(row.overrideAmount)}</td><td className="px-2 py-2 font-mono font-bold">{money(row.totalCost)}</td><td className="px-2 py-2"><span className={`whitespace-nowrap rounded-full px-2 py-1 text-[9px] font-bold uppercase ${badgeClass(row.status)}`}>{statusLabel(row.status)}</span>{validationErrors[row.id] && <p className="mt-2 max-w-40 text-[9px] font-semibold text-rose-700">{validationErrors[row.id]}</p>}</td><td className="px-2 py-2">{renderActions(row)}</td></tr>{expanded && <tr className="bg-slate-50"><td colSpan="12" className="p-3">{renderTripDetails(row)}</td></tr>}</React.Fragment>; })}</tbody></table>
      {!rows.length && <div className="mt-3 flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 text-center text-sm font-semibold text-slate-500">No completed trips match this week and status. Choose another week or import the weekly report.</div>}
    </div>
  </div>;
};

export default UnloadedTripsReport;
