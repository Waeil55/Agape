import React, { useMemo, useState } from 'react';
import { CheckCircle2, RotateCcw, Search, Send, XCircle } from 'lucide-react';
import { localCalendarYmd, tripCalendarDateKey } from '../utils/tripDate';
import { tripMatchesSearch } from '../utils/search';
import { buildCostOverrideRows, resolveCostOverrideRules } from '../utils/unloadedMileage';

const monthStart = () => `${localCalendarYmd().slice(0, 8)}01`;
const money = value => `$${Number(value || 0).toFixed(2)}`;
const badgeClass = status => ({ confirmed: 'bg-emerald-100 text-emerald-700', dismissed: 'bg-slate-100 text-slate-600' }[status] || 'bg-amber-100 text-amber-700');

const UnloadedTripsReport = ({ trips = [], drivers = [], onUpdateTrip, appSettings = {} }) => {
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(localCalendarYmd);
  const [allDates, setAllDates] = useState(false);
  const [statusFilter, setStatusFilter] = useState('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [drafts, setDrafts] = useState({});
  const rules = useMemo(() => resolveCostOverrideRules(appSettings.costOverrideRules), [appSettings.costOverrideRules]);
  const driverById = useMemo(() => new Map(drivers.map(driver => [driver.id, driver])), [drivers]);
  const rows = useMemo(() => buildCostOverrideRows(trips, rules)
    .filter(row => {
      const date = tripCalendarDateKey(row.trip.date);
      if (!allDates && ((fromDate && date < fromDate) || (toDate && date > toDate))) return false;
      if (statusFilter === 'open' && row.status !== 'candidate') return false;
      if (statusFilter !== 'all' && statusFilter !== 'open' && row.status !== statusFilter) return false;
      const driver = driverById.get(row.trip.driverId);
      return tripMatchesSearch(row.trip, searchQuery, [driver?.name, driver?.phone, row.fromCity, row.toCity]);
    })
    .sort((a, b) => tripCalendarDateKey(b.trip.date).localeCompare(tripCalendarDateKey(a.trip.date))),
  [allDates, driverById, fromDate, rules, searchQuery, statusFilter, toDate, trips]);

  const totals = useMemo(() => ({
    candidates: rows.filter(row => row.status === 'candidate').length,
    confirmed: rows.filter(row => row.status === 'confirmed').length,
    overrides: rows.filter(row => row.status === 'confirmed').reduce((sum, row) => sum + row.overrideAmount, 0),
  }), [rows]);

  const draftValue = (row, field, fallback) => drafts[row.id]?.[field] ?? fallback;
  const setDraft = (row, field, value) => setDrafts(current => ({ ...current, [row.id]: { ...(current[row.id] || {}), [field]: value } }));
  const saveDecision = (row, status, extra = {}) => {
    const unloadedMiles = Number.parseFloat(draftValue(row, 'unloadedMiles', row.unloadedMiles));
    const waitingHours = Number.parseFloat(draftValue(row, 'waitingHours', row.waitingHours));
    if (!Number.isFinite(unloadedMiles) || unloadedMiles < 0 || !Number.isFinite(waitingHours) || waitingHours < 0) return;
    const unloadedEligible = unloadedMiles >= rules.minimumUnloadedMiles && !row.unloadedExclusionReason;
    const waitingEligible = waitingHours > 0 && !row.waitingExclusionReason;
    const unloadedAmount = unloadedEligible ? unloadedMiles * rules.unloadedRatePerMile : 0;
    const waitingAmount = waitingEligible ? waitingHours * rules.waitingRatePerHour : 0;
    onUpdateTrip?.(row.trip.id, {
      costOverride: {
        ...(row.trip.costOverride || {}), status, unloadedMiles, waitingHours,
        unloadedAmount, waitingAmount, overrideAmount: unloadedAmount + waitingAmount,
        totalCost: row.originalCost + unloadedAmount + waitingAmount,
        fromCity: row.fromCity, toCity: row.toCity, bookingId: row.bookingId,
        detectionMethod: 'independent_booking_leg', rulesSnapshot: rules,
        reviewedAt: new Date().toISOString(), ...extra,
      },
      unloadedMileage: {
        ...(row.trip.unloadedMileage || {}), status, miles: unloadedMiles,
        detectionMethod: 'independent_booking_leg', minimumMiles: rules.minimumUnloadedMiles,
      },
      overrideWaitingHours: waitingHours,
    });
  };

  const renderActions = row => {
    const requested = row.trip.costOverride?.paymentRequestStatus === 'requested';
    return <div className="flex flex-wrap items-center gap-1">
      {row.status !== 'confirmed' && <button type="button" onClick={() => saveDecision(row, 'confirmed', { paymentRequestStatus: 'ready' })} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-emerald-600 px-2 text-[10px] font-bold text-white"><CheckCircle2 size={13} /> Confirm</button>}
      {row.status === 'candidate' && <button type="button" onClick={() => saveDecision(row, 'dismissed', { paymentRequestStatus: 'not_applicable' })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] font-bold text-slate-600"><XCircle size={13} /> Exclude</button>}
      {row.status === 'confirmed' && !requested && <button type="button" onClick={() => saveDecision(row, 'confirmed', { paymentRequestStatus: 'requested', paymentRequestedAt: new Date().toISOString() })} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-blue-600 px-2 text-[10px] font-bold text-white"><Send size={13} /> Mark requested</button>}
      {row.status !== 'candidate' && <button type="button" onClick={() => saveDecision(row, 'candidate', { paymentRequestStatus: 'not_requested', paymentRequestedAt: null })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] font-bold text-slate-600"><RotateCcw size={13} /> Reopen</button>}
    </div>;
  };

  return <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
      <div className="flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2"><Search size={13} className="text-slate-400" /><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Trip, rider, driver, or city…" className="w-52 bg-transparent text-xs font-semibold text-slate-700 outline-none" /></div>
      <label className="flex items-center gap-1 text-xs font-semibold text-slate-600">From <input type="date" value={fromDate} disabled={allDates} onChange={event => setFromDate(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 disabled:opacity-40" /></label>
      <label className="flex items-center gap-1 text-xs font-semibold text-slate-600">To <input type="date" value={toDate} disabled={allDates} onChange={event => setToDate(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 disabled:opacity-40" /></label>
      <label className="flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={allDates} onChange={event => setAllDates(event.target.checked)} /> All dates</label>
      <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="min-h-10 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600"><option value="open">Needs review</option><option value="confirmed">Confirmed</option><option value="dismissed">Excluded</option><option value="all">All decisions</option></select>
      <div className="ml-auto flex gap-2 text-xs font-semibold"><span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">{totals.candidates} review</span><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">{totals.confirmed} confirmed</span><span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-700">{money(totals.overrides)}</span></div>
    </div>
    <div className="m-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-900">Each Booking ID is evaluated as its own leg. Current rules: {rules.minimumUnloadedMiles}+ unloaded mi at {money(rules.unloadedRatePerMile)}/mi; waiting after {rules.waitingGraceMinutes} min at {money(rules.waitingRatePerHour)}/hr. Configure exclusions in Settings → Cost overrides.</div>
    <div className="min-h-0 flex-1 overflow-auto px-3 pb-24 md:pb-3">
      <div className="space-y-2 md:hidden">{rows.map(row => <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2"><div><p className="font-mono text-sm font-bold text-blue-700">#{row.bookingId}</p><p className="mt-0.5 text-sm font-semibold text-slate-900">{row.fromCity || 'Unknown'} → {row.toCity || 'Unknown'}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${badgeClass(row.status)}`}>{row.status === 'candidate' ? 'Needs review' : row.status}</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]"><div><p className="font-semibold text-slate-400">Date</p><p className="font-semibold text-slate-700">{row.date}</p></div><div><p className="font-semibold text-slate-400">Original cost</p><p className="font-mono font-semibold">{money(row.originalCost)}</p></div>
          <label><span className="font-semibold text-slate-400">Unloaded miles</span><input type="number" min="0" step="0.1" value={draftValue(row, 'unloadedMiles', row.unloadedMiles.toFixed(1))} onChange={event => setDraft(row, 'unloadedMiles', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 font-mono" /></label>
          <label><span className="font-semibold text-slate-400">Billable wait hours</span><input type="number" min="0" step="0.25" value={draftValue(row, 'waitingHours', row.waitingHours.toFixed(2))} onChange={event => setDraft(row, 'waitingHours', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 font-mono" /></label></div>
        <div className="my-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2 text-xs"><div><span className="text-slate-500">Override</span><strong className="block text-blue-700">{money(row.overrideAmount)}</strong></div><div><span className="text-slate-500">Total cost</span><strong className="block text-slate-900">{money(row.totalCost)}</strong></div></div><p className="mb-3 text-[10px] font-semibold text-slate-500">{row.reason}</p>{renderActions(row)}
      </article>)}</div>
      <table className="hidden min-w-[1180px] w-full rounded-xl border border-slate-200 bg-white text-xs shadow-sm md:table"><thead className="sticky top-0 bg-blue-600 text-white"><tr>{['Date', 'Booking ID', 'From city', 'To city', 'A/W', 'Original cost', 'Unloaded miles', 'Unloaded amount', 'Wait hours', 'Waiting amount', 'Override', 'Total cost', 'Status', 'Actions'].map(label => <th key={label} className="px-2 py-2 text-left font-semibold">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.id} className="hover:bg-blue-50/60"><td className="px-2 py-2">{row.date}</td><td className="px-2 py-2 font-mono text-blue-700">{row.bookingId}</td><td className="px-2 py-2 font-semibold">{row.fromCity || '—'}</td><td className="px-2 py-2 font-semibold">{row.toCity || '—'}</td><td className="px-2 py-2">{row.serviceCode}</td><td className="px-2 py-2 font-mono">{money(row.originalCost)}</td>
          <td className="px-2 py-2"><input type="number" min="0" step="0.1" value={draftValue(row, 'unloadedMiles', row.unloadedMiles.toFixed(1))} onChange={event => setDraft(row, 'unloadedMiles', event.target.value)} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 font-mono" /></td><td className="px-2 py-2 font-mono">{money(row.unloadedAmount)}</td>
          <td className="px-2 py-2"><input type="number" min="0" step="0.25" value={draftValue(row, 'waitingHours', row.waitingHours.toFixed(2))} onChange={event => setDraft(row, 'waitingHours', event.target.value)} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 font-mono" /></td><td className="px-2 py-2 font-mono">{money(row.waitingAmount)}</td><td className="px-2 py-2 font-mono font-bold text-blue-700">{money(row.overrideAmount)}</td><td className="px-2 py-2 font-mono font-bold">{money(row.totalCost)}</td><td className="px-2 py-2"><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${badgeClass(row.status)}`}>{row.status}</span></td><td className="px-2 py-2">{renderActions(row)}</td></tr>)}</tbody></table>
      {!rows.length && <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 text-center text-sm font-semibold text-slate-500">No individual trip legs match the current override rules and date range.</div>}
    </div>
  </div>;
};

export default UnloadedTripsReport;
