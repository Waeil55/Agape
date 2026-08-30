import { useMemo, useState } from 'react';
import { AlertTriangle, Download, Search } from 'lucide-react';
import { analyzeTripCostOverrides } from '../utils/tripCostOverrides';
import { downloadTripOverrideWorkbook } from '../utils/tripOverrideWorkbook';
import { localCalendarYmd } from '../utils/tripDate';

const monthStart = () => `${localCalendarYmd().slice(0, 8)}01`;
const money = (value) => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const decimal = (value) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const text = (value) => String(value ?? '').trim();

const UnloadedTripsReport = ({ trips = [], drivers = [], overridePolicy }) => {
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(localCalendarYmd);
  const [allDates, setAllDates] = useState(false);
  const [search, setSearch] = useState('');
  const [driverFilter, setDriverFilter] = useState('all');
  const [minimumUnloaded, setMinimumUnloaded] = useState('0');
  const [minimumWait, setMinimumWait] = useState('0');
  const [gapFromCity, setGapFromCity] = useState('all');
  const [gapToCity, setGapToCity] = useState('all');

  const driverById = useMemo(() => new Map(drivers.map((driver) => [driver.id, driver])), [drivers]);
  const result = useMemo(() => analyzeTripCostOverrides(trips, {
    policy: overridePolicy,
    allDates,
    fromDate,
    toDate,
  }), [allDates, fromDate, overridePolicy, toDate, trips]);
  const cityOptions = useMemo(() => [...new Set(result.rows.flatMap((row) => [row.dropoffCity, row.nextPickupCity]).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right)), [result.rows]);

  const rows = useMemo(() => {
    const query = text(search).toLowerCase();
    const unloadedFloor = Math.max(0, Number(minimumUnloaded) || 0);
    const waitFloor = Math.max(0, Number(minimumWait) || 0);
    return result.rows.filter((row) => {
      const driver = driverById.get(row.trip.driverId);
      if (driverFilter !== 'all' && row.driverKey !== driverFilter) return false;
      if (row.unloadedMiles < unloadedFloor || row.waitHours < waitFloor) return false;
      if (gapFromCity !== 'all' && row.dropoffCity !== gapFromCity) return false;
      if (gapToCity !== 'all' && row.nextPickupCity !== gapToCity) return false;
      if (!query) return true;
      return [row.trip.bookingId, row.trip.id, row.trip.patient, driver?.name, row.pickupCity, row.dropoffCity, row.nextPickupCity]
        .some((value) => text(value).toLowerCase().includes(query));
    });
  }, [driverById, driverFilter, gapFromCity, gapToCity, minimumUnloaded, minimumWait, result.rows, search]);

  const totals = useMemo(() => rows.reduce((sum, row) => ({
    original: sum.original + row.originalTripCost,
    unloaded: sum.unloaded + row.unloadedAmount,
    waiting: sum.waiting + row.waitCost,
    total: sum.total + row.totalCost,
  }), { original: 0, unloaded: 0, waiting: 0, total: 0 }), [rows]);

  const driverOptions = useMemo(() => [...new Map(result.rows.map((row) => {
    const driver = driverById.get(row.trip.driverId);
    return [row.driverKey, driver?.name || row.trip.completedDriverName || row.trip.driverName || 'Unassigned'];
  })).entries()].sort((left, right) => left[1].localeCompare(right[1])), [driverById, result.rows]);

  const exportRows = () => {
    const range = allDates ? 'all-dates' : `${fromDate || 'start'}_to_${toDate || 'end'}`;
    downloadTripOverrideWorkbook(rows, driverById, `trip-cost-overrides_${range}.xlsx`);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
      <div className="app-filter-bar shrink-0 gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <label className="flex min-w-[190px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <Search size={14} className="shrink-0 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Trip, rider, driver, or city" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs font-semibold outline-none" />
        </label>
        <input aria-label="From date" type="date" value={fromDate} disabled={allDates} onChange={(event) => setFromDate(event.target.value)} className="h-9 px-2 text-xs font-semibold disabled:opacity-40" />
        <input aria-label="To date" type="date" value={toDate} disabled={allDates} onChange={(event) => setToDate(event.target.value)} className="h-9 px-2 text-xs font-semibold disabled:opacity-40" />
        <label className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700"><input type="checkbox" checked={allDates} onChange={(event) => setAllDates(event.target.checked)} /> All dates</label>
        <select aria-label="Driver" value={driverFilter} onChange={(event) => setDriverFilter(event.target.value)} className="h-9 px-2 text-xs font-semibold"><option value="all">All drivers</option>{driverOptions.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select>
        <label className="flex h-9 items-center gap-1 rounded-xl border border-slate-200 px-2 text-[11px] font-semibold text-slate-600">Min empty mi<input aria-label="Minimum unloaded miles" type="number" min="0" step="0.1" value={minimumUnloaded} onChange={(event) => setMinimumUnloaded(event.target.value)} className="w-16 border-0 bg-transparent p-0 text-right text-xs" /></label>
        <label className="flex h-9 items-center gap-1 rounded-xl border border-slate-200 px-2 text-[11px] font-semibold text-slate-600">Min wait hr<input aria-label="Minimum waiting hours" type="number" min="0" step="0.5" value={minimumWait} onChange={(event) => setMinimumWait(event.target.value)} className="w-14 border-0 bg-transparent p-0 text-right text-xs" /></label>
        <select aria-label="Gap from city" value={gapFromCity} onChange={(event) => setGapFromCity(event.target.value)} className="h-9 px-2 text-xs font-semibold"><option value="all">All gap-from cities</option>{cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}</select>
        <select aria-label="Gap to city" value={gapToCity} onChange={(event) => setGapToCity(event.target.value)} className="h-9 px-2 text-xs font-semibold"><option value="all">All gap-to cities</option>{cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}</select>
        <button type="button" onClick={exportRows} disabled={!rows.length} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40"><Download size={14} /> Excel</button>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2 px-3 py-2 sm:grid-cols-4">
        {[
          ['Original', money(totals.original)],
          ['Unloaded override', money(totals.unloaded)],
          ['Waiting cost', money(totals.waiting)],
          ['Total cost', money(totals.total)],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="truncate text-base font-bold text-slate-900" title={value}>{value}</p></div>)}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-24 md:pb-3">
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-semibold text-blue-900">
          <AlertTriangle size={14} className="shrink-0" />
          <span className="truncate" title="Only completed trips with recorded pickup and dropoff timestamps are included. Empty mileage uses the previous dropoff and next pickup odometers.">
            {rows.length} eligible rows · {result.excluded.missingTimestamps} missing timestamps · {result.excluded.notCompleted} incomplete/cancelled/no-show excluded
          </span>
        </div>

        <div className="space-y-2 md:hidden">
          {rows.map((row) => {
            const driver = driverById.get(row.trip.driverId);
            return (
              <article key={row.trip.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2"><p className="truncate font-mono text-xs font-bold text-blue-700">#{row.trip.bookingId || row.trip.id}</p><p className="shrink-0 text-xs font-bold text-slate-900">{money(row.totalCost)}</p></div>
                <p className="mt-1 truncate text-xs font-semibold text-slate-700" title={`${row.pickupCity} to ${row.dropoffCity}`}>{row.pickupCity || 'Unknown'} → {row.dropoffCity || 'Unknown'} · {driver?.name || row.trip.completedDriverName || 'Unassigned'}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]"><div><p className="text-slate-500">Empty miles</p><p className="font-bold text-slate-900">{decimal(row.unloadedMiles)}</p></div><div><p className="text-slate-500">Empty cost</p><p className="font-bold text-slate-900">{money(row.unloadedAmount)}</p></div><div><p className="text-slate-500">Wait cost</p><p className="font-bold text-slate-900">{money(row.waitCost)}</p></div></div>
                <p className="mt-2 truncate text-[10px] font-semibold text-slate-500" title={`${row.unloadedReason}. ${row.waitReason}`}>{row.unloadedReason} · {row.waitReason}</p>
              </article>
            );
          })}
        </div>

        <div className="app-table-frame hidden md:block">
          <table className="bg-white text-xs shadow-sm" aria-label="Trip cost override calculation">
            <thead><tr>{['Trip Date', 'Booking ID', 'From City', 'To City', 'Original Cost', 'A/W', 'Unloaded Miles', '$ / Empty Mi', 'Override Amount', 'Wait Hours', 'Wait Cost', 'Total Cost'].map((label) => <th key={label} className="px-2 py-2 text-left" title={label}>{label}</th>)}</tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.trip.id} className="border-b border-slate-100 hover:bg-blue-50/60">
                  <td className="px-2 py-1.5" title={row.serviceDate}>{row.serviceDate}</td>
                  <td className="px-2 py-1.5 font-mono text-blue-700" title={text(row.trip.bookingId || row.trip.id)}>{row.trip.bookingId || row.trip.id}</td>
                  <td className="px-2 py-1.5" title={row.pickupCity}>{row.pickupCity || '—'}</td>
                  <td className="px-2 py-1.5" title={row.dropoffCity}>{row.dropoffCity || '—'}</td>
                  <td className="px-2 py-1.5 font-mono" title={money(row.originalTripCost)}>{money(row.originalTripCost)}</td>
                  <td className="px-2 py-1.5 text-center" title={row.tripType}>{row.tripType}</td>
                  <td className="px-2 py-1.5 font-mono" title={`${row.dropoffCity || 'Unknown'} → ${row.nextPickupCity || 'No next trip'}: ${row.unloadedReason}`}>{decimal(row.unloadedMiles)}</td>
                  <td className="px-2 py-1.5 font-mono" title={money(row.unloadedRate)}>{money(row.unloadedRate)}</td>
                  <td className="px-2 py-1.5 font-mono font-semibold text-blue-700" title={row.unloadedReason}>{money(row.unloadedAmount)}</td>
                  <td className="px-2 py-1.5 font-mono" title={`${decimal(row.rawGapHours)} raw hours. ${row.waitReason}`}>{decimal(row.waitHours)}</td>
                  <td className="px-2 py-1.5 font-mono" title={row.waitReason}>{money(row.waitCost)}</td>
                  <td className="px-2 py-1.5 font-mono font-bold text-slate-950" title={money(row.totalCost)}>{money(row.totalCost)}</td>
                </tr>
              ))}
            </tbody>
            {!!rows.length && <tfoot><tr className="bg-slate-100 font-bold"><td className="px-2 py-2" colSpan="4">SUBTOTALS</td><td className="px-2 py-2 font-mono">{money(totals.original)}</td><td /><td /><td /><td className="px-2 py-2 font-mono">{money(totals.unloaded)}</td><td /><td className="px-2 py-2 font-mono">{money(totals.waiting)}</td><td className="px-2 py-2 font-mono">{money(totals.total)}</td></tr></tfoot>}
          </table>
        </div>
        {!rows.length && <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 text-center text-sm font-semibold text-slate-500">No completed trip rows match the selected date and filters.</div>}
      </div>
    </div>
  );
};

export default UnloadedTripsReport;
