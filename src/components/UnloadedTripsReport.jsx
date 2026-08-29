import React, { useMemo, useState } from 'react';
import { CheckCircle2, RotateCcw, Search, Send, XCircle } from 'lucide-react';
import { localCalendarYmd, tripCalendarDateKey } from '../utils/tripDate';
import { tripMatchesSearch } from '../utils/search';
import { buildUnloadedMileageRows, UNLOADED_MINIMUM_MILES } from '../utils/unloadedMileage';

const monthStart = () => `${localCalendarYmd().slice(0, 8)}01`;

const badgeClass = status => ({
  confirmed: 'bg-emerald-100 text-emerald-700',
  dismissed: 'bg-slate-100 text-slate-600',
}[status] || 'bg-amber-100 text-amber-700');

const UnloadedTripsReport = ({ trips = [], drivers = [], onUpdateTrip }) => {
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(localCalendarYmd);
  const [allDates, setAllDates] = useState(false);
  const [statusFilter, setStatusFilter] = useState('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [mileDrafts, setMileDrafts] = useState({});

  const driverById = useMemo(() => new Map(drivers.map(driver => [driver.id, driver])), [drivers]);
  const rows = useMemo(() => buildUnloadedMileageRows(trips)
    .filter(row => {
      const date = tripCalendarDateKey(row.trip.date);
      if (!allDates && ((fromDate && date < fromDate) || (toDate && date > toDate))) return false;
      if (statusFilter === 'open' && row.status !== 'candidate') return false;
      if (statusFilter !== 'all' && statusFilter !== 'open' && row.status !== statusFilter) return false;
      const driver = driverById.get(row.trip.driverId);
      return tripMatchesSearch(row.trip, searchQuery, [driver?.name, driver?.phone]);
    })
    .sort((a, b) => tripCalendarDateKey(b.trip.date).localeCompare(tripCalendarDateKey(a.trip.date))),
  [allDates, driverById, fromDate, searchQuery, statusFilter, toDate, trips]);

  const totals = useMemo(() => ({
    candidates: rows.filter(row => row.status === 'candidate').length,
    confirmed: rows.filter(row => row.status === 'confirmed').length,
    miles: rows.filter(row => row.status === 'confirmed').reduce((sum, row) => sum + row.miles, 0),
  }), [rows]);

  const saveDecision = (row, status, extra = {}) => {
    const miles = Number.parseFloat(mileDrafts[row.trip.id] ?? row.miles);
    if (!Number.isFinite(miles) || miles < UNLOADED_MINIMUM_MILES) return;
    onUpdateTrip?.(row.trip.id, {
      unloadedMileage: {
        ...(row.trip.unloadedMileage || {}),
        status,
        miles,
        detectionMethod: 'single_completed_leg_empty_return',
        minimumMiles: UNLOADED_MINIMUM_MILES,
        reviewedAt: new Date().toISOString(),
        ...extra,
      },
    });
  };

  const renderActions = row => {
    const requested = row.trip.unloadedMileage?.paymentRequestStatus === 'requested';
    return (
      <div className="flex flex-wrap items-center gap-1">
        {row.status !== 'confirmed' && <button type="button" onClick={() => saveDecision(row, 'confirmed', { paymentRequestStatus: 'ready' })} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-emerald-600 px-2 text-[10px] font-bold text-white hover:bg-emerald-700"><CheckCircle2 size={13} /> Confirm</button>}
        {row.status === 'candidate' && <button type="button" onClick={() => saveDecision(row, 'dismissed', { paymentRequestStatus: 'not_applicable' })} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50"><XCircle size={13} /> Not unloaded</button>}
        {row.status === 'confirmed' && !requested && <button type="button" onClick={() => saveDecision(row, 'confirmed', { paymentRequestStatus: 'requested', paymentRequestedAt: new Date().toISOString() })} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-blue-600 px-2 text-[10px] font-bold text-white hover:bg-blue-700"><Send size={13} /> Mark requested</button>}
        {row.status !== 'candidate' && <button type="button" onClick={() => saveDecision(row, 'candidate', { paymentRequestStatus: 'not_requested', paymentRequestedAt: null })} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50"><RotateCcw size={13} /> Reopen</button>}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
          <Search size={13} className="text-slate-400" />
          <input value={searchQuery} onChange={event => setSearchQuery(event.target.value)}
            placeholder="Passenger, trip, driver, phone…"
            className="w-52 bg-transparent text-xs font-medium text-slate-700 outline-none" />
        </div>
        <label className="flex items-center gap-1 text-xs font-semibold text-slate-600">
          From <input type="date" value={fromDate} disabled={allDates} onChange={event => setFromDate(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 disabled:opacity-40" />
        </label>
        <label className="flex items-center gap-1 text-xs font-semibold text-slate-600">
          To <input type="date" value={toDate} disabled={allDates} onChange={event => setToDate(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 disabled:opacity-40" />
        </label>
        <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={allDates} onChange={event => setAllDates(event.target.checked)} /> All dates
        </label>
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600">
          <option value="open">Needs review</option>
          <option value="confirmed">Confirmed</option>
          <option value="dismissed">Not unloaded</option>
          <option value="all">All decisions</option>
        </select>
        <div className="ml-auto flex gap-2 text-xs font-semibold">
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">{totals.candidates} review</span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">{totals.confirmed} confirmed</span>
          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-700">{totals.miles.toFixed(1)} mi</span>
        </div>
      </div>

      <div className="m-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
        Agape proposes completed one-leg rider days with at least {UNLOADED_MINIMUM_MILES} loaded miles. Return miles are estimates and require your confirmation before payment follow-up.
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 pb-24 md:pb-3">
        <div className="space-y-2 md:hidden">
          {rows.map(row => {
            const { trip } = row;
            const driver = driverById.get(trip.driverId);
            const requested = trip.unloadedMileage?.paymentRequestStatus === 'requested';
            return (
              <article key={trip.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-mono text-xs font-bold text-blue-700">#{trip.bookingId || trip.id}</p><p className="mt-0.5 text-sm font-bold text-slate-900">{trip.patient || '-'}</p></div>
                  <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${badgeClass(row.status)}`}>{requested ? 'Payment requested' : row.status === 'candidate' ? 'Needs review' : row.status}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div><p className="font-semibold text-slate-400">Date</p><p className="font-semibold text-slate-700">{tripCalendarDateKey(trip.date)}</p></div>
                  <div><p className="font-semibold text-slate-400">Driver</p><p className="font-semibold text-slate-700">{driver?.name || trip.completedDriverName || trip.driverName || '-'}</p></div>
                  <div><p className="font-semibold text-slate-400">Loaded miles</p><p className="font-mono font-semibold text-slate-700">{row.miles.toFixed(1)}</p></div>
                  <label><span className="font-semibold text-slate-400">Estimated empty return</span><input type="number" min={UNLOADED_MINIMUM_MILES} step="0.1" value={mileDrafts[trip.id] ?? row.miles.toFixed(1)} onChange={event => setMileDrafts(current => ({ ...current, [trip.id]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 font-mono outline-none focus:border-blue-400" /></label>
                </div>
                <p className="my-3 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-semibold text-amber-800">{row.reason}</p>
                {renderActions(row)}
              </article>
            );
          })}
        </div>
        <table className="hidden min-w-[980px] w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-xs shadow-sm md:table">
          <thead className="sticky top-0 bg-blue-600 text-white">
            <tr>{['Date', 'Trip ID', 'Passenger', 'Driver', 'Passenger phone', 'Loaded miles', 'Estimated empty return', 'Detection', 'Status', 'Actions'].map(label => <th key={label} className="px-3 py-2 text-left font-semibold">{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(row => {
              const { trip } = row;
              const driver = driverById.get(trip.driverId);
              const phone = trip.patientPhone || trip.clientPhone || trip.pickupPhone || trip.dropoffPhone || '-';
              const requested = trip.unloadedMileage?.paymentRequestStatus === 'requested';
              return (
                <tr key={trip.id} className="hover:bg-blue-50/60">
                  <td className="px-3 py-2 font-semibold text-slate-700">{tripCalendarDateKey(trip.date)}</td>
                  <td className="px-3 py-2 font-mono text-blue-700">{trip.bookingId || trip.id}</td>
                  <td className="px-3 py-2 font-semibold text-slate-900">{trip.patient || '-'}</td>
                  <td className="px-3 py-2 text-slate-700">{driver?.name || trip.completedDriverName || trip.driverName || '-'}</td>
                  <td className="px-3 py-2 font-mono text-slate-600">{phone}</td>
                  <td className="px-3 py-2 font-mono text-slate-700">{row.miles.toFixed(1)}</td>
                  <td className="px-3 py-2">
                    <input type="number" min={UNLOADED_MINIMUM_MILES} step="0.1"
                      value={mileDrafts[trip.id] ?? row.miles.toFixed(1)}
                      onChange={event => setMileDrafts(current => ({ ...current, [trip.id]: event.target.value }))}
                      className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 font-mono outline-none focus:border-blue-400" />
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.reason}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${badgeClass(row.status)}`}>{requested ? 'Payment requested' : row.status === 'candidate' ? 'Needs review' : row.status}</span></td>
                  <td className="px-3 py-2">
                    {renderActions(row)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-sm font-semibold text-slate-500">No unloaded-mileage records match this range and filter.</div>}
      </div>
    </div>
  );
};

export default UnloadedTripsReport;
