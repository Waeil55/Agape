import { Fragment, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, ChevronDown, ChevronLeft, ChevronRight, Download, MapPin, RotateCcw, Save, Search } from 'lucide-react';
import { forEachWithConcurrency } from '../utils/boundedConcurrency';
import { analyzeTripCostOverrides, filterTripCostOverrideRows, normalizeCityPair, normalizeOverridePolicy } from '../utils/tripCostOverrides';
import { downloadTripOverrideWorkbook } from '../utils/tripOverrideWorkbook';
import { localCalendarYmd } from '../utils/tripDate';
import { getGoogleDrivingRouteMiles } from '../utils/routedMileage';
import OverrideHomeAddressEditor, { getOverrideHomePolicyUpdates, verifyOverrideHomePolicy } from './OverrideHomeAddressEditor';

const currentWeek = () => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay(), 12);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 12);
  return { from: localCalendarYmd(start), to: localCalendarYmd(end) };
};
const shiftDate = (value, days) => {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return value;
  return localCalendarYmd(new Date(year, month - 1, day + days, 12));
};
const money = (value) => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const decimal = (value) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const odometer = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US') : 'Missing';
const text = (value) => String(value ?? '').trim();
const dateTime = (value) => value instanceof Date && Number.isFinite(value.getTime())
  ? value.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : 'Missing';

const FILTER_VIEWS = [
  ['override', 'Override candidates'],
  ['mileage', 'Mileage'],
  ['waiting', 'Waiting'],
  ['both', 'Both'],
  ['review', 'Needs review'],
  ['all', 'All evaluated gaps'],
];

const TABLE_COLUMNS = [
  ['Date', 'Trip Date', '8%'],
  ['Booking ID', 'Booking ID receiving the override', '9%'],
  ['Leg', 'Empty-leg type', '10%'],
  ['Driver', 'Driver', '9%'],
  ['Unloaded route', 'Empty vehicle origin to destination', '18%'],
  ['A/W', 'Ambulatory or Wheelchair', '4%'],
  ['Empty mi', 'Billable Unloaded Miles', '7%'],
  ['Mileage', 'Mileage Override Amount', '8%'],
  ['Wait hr', 'Billable Waiting Hours', '6%'],
  ['Wait cost', 'Waiting Cost', '8%'],
  ['Original', 'Original Trip Cost', '6%'],
  ['Total', 'Total Cost', '7%'],
];

const UnloadedTripsReport = ({ trips = [], drivers = [], overridePolicy, overridePolicyStatus = 'ready', overridePolicyError = '', updateOverridePolicy, routeDistanceResolver = getGoogleDrivingRouteMiles }) => {
  const initialWeek = useMemo(() => currentWeek(), []);
  const [fromDate, setFromDate] = useState(initialWeek.from);
  const [toDate, setToDate] = useState(initialWeek.to);
  const [allDates, setAllDates] = useState(false);
  const [search, setSearch] = useState('');
  const [driverFilter, setDriverFilter] = useState('all');
  const [candidateType, setCandidateType] = useState('override');
  const [minimumUnloaded, setMinimumUnloaded] = useState('0');
  const [minimumWait, setMinimumWait] = useState('0');
  const [gapFromCity, setGapFromCity] = useState('all');
  const [gapToCity, setGapToCity] = useState('all');
  const [legType, setLegType] = useState('all');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState('');
  const [boundaryDistances, setBoundaryDistances] = useState(() => new Map());
  const [excludingRowId, setExcludingRowId] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [homeEditorOpen, setHomeEditorOpen] = useState(false);
  const [homeDraft, setHomeDraft] = useState(() => normalizeOverridePolicy(overridePolicy));
  const [homeSaving, setHomeSaving] = useState(false);
  const [homeStatus, setHomeStatus] = useState('');
  const policyReady = overridePolicyStatus === 'ready';
  const sharedHomeMissing = !overridePolicy?.homeAddress || !overridePolicy?.homeCity || !overridePolicy?.homeState || !overridePolicy?.homeZip;
  const showHomeEditor = sharedHomeMissing || homeEditorOpen;
  const sharedHomeLabel = sharedHomeMissing
    ? 'Not set'
    : (overridePolicy?.homeFormattedAddress
      || [overridePolicy?.homeAddress, overridePolicy?.homeCity, overridePolicy?.homeState].filter(Boolean).join(', '));

  const driverById = useMemo(() => new Map(drivers.map((driver) => [driver.id, driver])), [drivers]);
  const result = useMemo(() => {
    const analyzed = analyzeTripCostOverrides(trips, {
      policy: overridePolicy,
      drivers,
      allDates,
      fromDate,
      toDate,
      boundaryDistances,
    });
    return policyReady ? analyzed : { ...analyzed, rows: [] };
  }, [allDates, boundaryDistances, drivers, fromDate, overridePolicy, policyReady, toDate, trips]);

  useEffect(() => {
    if (!policyReady) return undefined;
    const requests = [...new Map(result.boundaryRequests
      .filter((request) => !boundaryDistances.has(request.id))
      .map((request) => [request.id, request])).values()];
    if (!requests.length) return undefined;
    setBoundaryDistances((current) => {
      const next = new Map(current);
      requests.forEach((request) => next.set(request.id, { status: 'loading' }));
      return next;
    });
    void forEachWithConcurrency(requests, async (request) => {
      try {
        const miles = await routeDistanceResolver(request.origin, request.destination);
        if (!Number.isFinite(miles)) throw new Error('Google route mileage is unavailable');
        setBoundaryDistances((current) => new Map(current).set(request.id, {
          status: 'ready',
          miles,
          source: 'Google routed mileage',
        }));
      } catch (error) {
        setBoundaryDistances((current) => new Map(current).set(request.id, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Google route mileage is unavailable',
        }));
      }
    }, 4);
    return undefined;
  }, [boundaryDistances, policyReady, result.boundaryRequests, routeDistanceResolver]);

  const driverNamesById = useMemo(() => new Map([...driverById].map(([id, driver]) => [id, driver?.name || ''])), [driverById]);
  const cityOptions = useMemo(() => [...new Set(result.rows.flatMap((row) => [row.originCity, row.destinationCity]).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right)), [result.rows]);
  const driverOptions = useMemo(() => [...new Map(result.rows.map((row) => {
    const driver = driverById.get(row.trip.driverId);
    return [row.driverKey, driver?.name || row.trip.completedDriverName || row.trip.driverName || 'Unassigned'];
  })).entries()].sort((left, right) => left[1].localeCompare(right[1])), [driverById, result.rows]);

  const viewCounts = useMemo(() => Object.fromEntries(FILTER_VIEWS.map(([key]) => [key,
    filterTripCostOverrideRows(result.rows, { candidateType: key }).length,
  ])), [result.rows]);

  const rows = useMemo(() => filterTripCostOverrideRows(result.rows, {
    candidateType,
    search,
    driverKey: driverFilter,
    minimumUnloadedMiles: minimumUnloaded,
    minimumWaitHours: minimumWait,
    gapFromCity,
    gapToCity,
    legType,
    driverNamesById,
  }), [candidateType, driverFilter, driverNamesById, gapFromCity, gapToCity, legType, minimumUnloaded, minimumWait, result.rows, search]);

  const totals = useMemo(() => rows.reduce((sum, row) => ({
    original: sum.original + row.originalTripCost,
    unloaded: sum.unloaded + row.unloadedAmount,
    waiting: sum.waiting + row.waitCost,
    total: sum.total + row.totalCost,
  }), { original: 0, unloaded: 0, waiting: 0, total: 0 }), [rows]);
  const boundaryStatus = useMemo(() => {
    const activeIds = new Set(result.boundaryRequests.map((request) => request.id));
    return [...boundaryDistances].reduce((summary, [id, value]) => ({
      loading: summary.loading + (activeIds.has(id) && value?.status === 'loading' ? 1 : 0),
      errors: summary.errors + (activeIds.has(id) && value?.status === 'error' ? 1 : 0),
    }), { loading: 0, errors: 0 });
  }, [boundaryDistances, result.boundaryRequests]);

  const driverName = (row) => driverById.get(row.trip.driverId)?.name
    || row.trip.completedDriverName
    || row.trip.driverName
    || 'Unassigned';
  const toggleExpanded = (rowId) => setExpandedRowId((current) => current === rowId ? '' : rowId);
  const moveWeek = (days) => {
    setAllDates(false);
    setFromDate((value) => shiftDate(value, days));
    setToDate((value) => shiftDate(value, days));
  };
  const resetFilters = () => {
    const week = currentWeek();
    setFromDate(week.from);
    setToDate(week.to);
    setAllDates(false);
    setSearch('');
    setDriverFilter('all');
    setCandidateType('override');
    setMinimumUnloaded('0');
    setMinimumWait('0');
    setGapFromCity('all');
    setGapToCity('all');
    setLegType('all');
    setExpandedRowId('');
  };
  const exportRows = () => {
    const range = allDates ? 'all-dates' : `${fromDate || 'start'}_to_${toDate || 'end'}`;
    downloadTripOverrideWorkbook(rows, driverById, `trip-cost-overrides_${range}.xlsx`);
  };
  const retryBoundaryMileage = () => {
    setBoundaryDistances((current) => new Map([...current].filter(([, value]) => value?.status !== 'error')));
  };
  const openHomeEditor = () => {
    setHomeDraft(normalizeOverridePolicy(overridePolicy));
    setHomeStatus('');
    setHomeEditorOpen(true);
  };
  const saveSharedHome = async () => {
    if (!updateOverridePolicy) {
      setHomeStatus('Shared override settings are unavailable.');
      return;
    }
    if (!policyReady) {
      setHomeStatus(overridePolicyError || 'Wait until the shared override policy finishes loading.');
      return;
    }
    setHomeSaving(true);
    setHomeStatus('Verifying the shared home address…');
    try {
      const verifiedPolicy = await verifyOverrideHomePolicy({
        ...normalizeOverridePolicy(overridePolicy),
        ...getOverrideHomePolicyUpdates(homeDraft),
      });
      const homeUpdates = getOverrideHomePolicyUpdates(verifiedPolicy);
      const savedPolicy = await updateOverridePolicy(homeUpdates);
      setHomeDraft(normalizeOverridePolicy(savedPolicy || { ...overridePolicy, ...homeUpdates }));
      setBoundaryDistances(new Map());
      setHomeEditorOpen(false);
      setHomeStatus('');
      setActionMessage(`Shared home saved: ${verifiedPolicy.homeFormattedAddress}. Home-route mileage is recalculating.`);
    } catch (error) {
      setHomeStatus(error instanceof Error ? error.message : 'The shared home address could not be saved.');
    } finally {
      setHomeSaving(false);
    }
  };
  const excludeRoute = async (row) => {
    if (!updateOverridePolicy || !row.originCity || !row.destinationCity) return;
    const route = `${row.originCity} > ${row.destinationCity}`;
    const existing = Array.isArray(overridePolicy?.excludedCityPairs) ? overridePolicy.excludedCityPairs : [];
    const routeKey = normalizeCityPair(route, overridePolicy?.sameCityNames);
    if (existing.some((pair) => normalizeCityPair(pair, overridePolicy?.sameCityNames) === routeKey)) {
      setActionMessage(`${route} is already excluded.`);
      return;
    }
    setExcludingRowId(row.rowId);
    setActionMessage('');
    try {
      await updateOverridePolicy({ excludedCityPairs: [...existing, route] });
      setActionMessage(`Excluded ${route}. You can remove it later in Settings.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'The route exclusion could not be saved.');
    } finally {
      setExcludingRowId('');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50" aria-busy={overridePolicyStatus === 'loading'}>
      {!policyReady && (
        <div className={`mx-3 mt-2 rounded-xl border px-3 py-2 text-xs font-semibold ${overridePolicyStatus === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`} role={overridePolicyStatus === 'error' ? 'alert' : 'status'}>
          {overridePolicyStatus === 'error'
            ? (overridePolicyError || 'Shared override settings could not be verified. Cost calculations and Excel export are blocked.')
            : 'Loading and verifying the shared override policy before calculating costs…'}
        </div>
      )}

      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2">
        <div className="app-filter-bar gap-2">
          <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Search size={14} className="shrink-0 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Booking, rider, driver, or empty-leg city" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs font-semibold outline-none" />
          </label>
          <div className="flex h-9 items-center rounded-xl border border-slate-200 bg-white">
            <button type="button" onClick={() => moveWeek(-7)} className="grid h-full w-8 place-items-center text-slate-600 hover:bg-slate-50" aria-label="Previous week"><ChevronLeft size={15} /></button>
            <input aria-label="From date" type="date" value={fromDate} disabled={allDates} onChange={(event) => setFromDate(event.target.value)} className="h-8 w-[122px] border-0 px-1 text-xs font-semibold disabled:opacity-40" />
            <span className="text-xs font-semibold text-slate-400">–</span>
            <input aria-label="To date" type="date" value={toDate} disabled={allDates} onChange={(event) => setToDate(event.target.value)} className="h-8 w-[122px] border-0 px-1 text-xs font-semibold disabled:opacity-40" />
            <button type="button" onClick={() => moveWeek(7)} className="grid h-full w-8 place-items-center text-slate-600 hover:bg-slate-50" aria-label="Next week"><ChevronRight size={15} /></button>
          </div>
          <select aria-label="Driver" value={driverFilter} onChange={(event) => setDriverFilter(event.target.value)} className="h-9 min-w-[145px] px-2 text-xs font-semibold"><option value="all">All drivers</option>{driverOptions.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select>
          <button type="button" onClick={openHomeEditor} aria-expanded={showHomeEditor} aria-label="Edit shared home address" className={`inline-flex h-9 min-w-0 max-w-[260px] items-center gap-1.5 rounded-xl border px-3 text-xs font-bold ${sharedHomeMissing ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><MapPin size={14} className="shrink-0" /><span className="shrink-0">Home:</span><span className="truncate font-semibold">{sharedHomeLabel}</span></button>
          <button type="button" onClick={resetFilters} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"><RotateCcw size={14} /> Reset</button>
          <button type="button" onClick={exportRows} disabled={!policyReady || !rows.length} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40"><Download size={14} /> Excel</button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {FILTER_VIEWS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setCandidateType(key)} aria-pressed={candidateType === key} className={`h-8 rounded-xl border px-3 text-[11px] font-bold transition ${candidateType === key ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'}`}>
              {label} <span className={candidateType === key ? 'text-blue-100' : 'text-slate-400'}>{viewCounts[key] || 0}</span>
            </button>
          ))}
          <button type="button" onClick={() => setAdvancedOpen((value) => !value)} aria-expanded={advancedOpen} className="ml-auto inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-700 hover:bg-slate-50">Advanced <ChevronDown size={13} className={advancedOpen ? 'rotate-180' : ''} /></button>
        </div>

        {advancedOpen && (
          <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 sm:grid-cols-2 xl:grid-cols-6">
            <label className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600">Minimum empty miles<input aria-label="Minimum unloaded miles" type="number" min="0" step="0.1" value={minimumUnloaded} onChange={(event) => setMinimumUnloaded(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent p-0 text-right text-xs" /></label>
            <label className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600">Minimum wait hours<input aria-label="Minimum waiting hours" type="number" min="0" step="0.5" value={minimumWait} onChange={(event) => setMinimumWait(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent p-0 text-right text-xs" /></label>
            <select aria-label="Empty leg from city" value={gapFromCity} onChange={(event) => setGapFromCity(event.target.value)} className="h-9 px-2 text-xs font-semibold"><option value="all">Any empty-leg origin</option>{cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}</select>
            <select aria-label="Empty leg to city" value={gapToCity} onChange={(event) => setGapToCity(event.target.value)} className="h-9 px-2 text-xs font-semibold"><option value="all">Any empty-leg destination</option>{cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}</select>
            <select aria-label="Empty leg type" value={legType} onChange={(event) => setLegType(event.target.value)} className="h-9 px-2 text-xs font-semibold"><option value="all">All empty-leg types</option><option value="before_pickup">Before pickup</option><option value="home_return">Return home</option></select>
            <label className="flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"><input type="checkbox" checked={allDates} onChange={(event) => setAllDates(event.target.checked)} /> Ignore date range</label>
          </div>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2 px-3 py-2 sm:grid-cols-4">
        {[
          ['Original', money(totals.original)],
          ['Mileage override', money(totals.unloaded)],
          ['Waiting override', money(totals.waiting)],
          ['Total', money(totals.total)],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="truncate text-base font-bold text-slate-900" title={value}>{value}</p></div>)}
      </div>

      {policyReady && (
        <div className="mx-3 mb-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-600">
          <span className="block truncate" title={`Unloaded miles must exceed ${result.policy.unloadedThresholdMiles} miles at ${money(result.policy.unloadedRate)} per mile. Waiting must exceed ${result.policy.waitingThresholdHours} hours; only time beyond the threshold is rounded up to ${result.policy.waitRoundingMinutes}-minute increments at ${money(result.policy.waitRate)} per hour.`}>
            Showing {rows.length} of {result.rows.length} evaluated gaps · {viewCounts.override || 0} override candidates · {viewCounts.review || 0} need data review · policy: empty miles &gt; {decimal(result.policy.unloadedThresholdMiles)} at {money(result.policy.unloadedRate)}/mi · wait &gt; {decimal(result.policy.waitingThresholdHours)} hr at {money(result.policy.waitRate)}/hr
          </span>
        </div>
      )}

      {(boundaryStatus.loading > 0 || boundaryStatus.errors > 0 || actionMessage) && (
        <div className={`mx-3 mb-2 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-[10px] font-semibold ${boundaryStatus.errors > 0 ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`} role={boundaryStatus.errors > 0 ? 'alert' : 'status'}>
          <span>{actionMessage || (boundaryStatus.errors > 0 ? `${boundaryStatus.errors} home-route mileage calculation${boundaryStatus.errors === 1 ? '' : 's'} failed. Check the shared home address in Settings → Override Pricing, then retry.` : `Calculating ${boundaryStatus.loading} home-route mileage${boundaryStatus.loading === 1 ? '' : 's'}…`)}</span>
          {boundaryStatus.errors > 0 && <button type="button" onClick={retryBoundaryMileage} className="shrink-0 rounded-lg border border-amber-300 bg-white px-2 py-1 font-bold">Retry</button>}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-24 md:pb-3">
        {showHomeEditor && (
          <div className="mb-3">
            <OverrideHomeAddressEditor policy={homeDraft} onChange={setHomeDraft} disabled={homeSaving} compact />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void saveSharedHome()} disabled={homeSaving || !policyReady || !updateOverridePolicy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40"><Save size={14} />{homeSaving ? 'Verifying and saving…' : 'Save home address'}</button>
              {!sharedHomeMissing && <button type="button" onClick={() => { setHomeEditorOpen(false); setHomeStatus(''); }} disabled={homeSaving} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700">Cancel</button>}
              {homeStatus && <p className="text-xs font-semibold text-amber-800" role="status">{homeStatus}</p>}
            </div>
          </div>
        )}
        {candidateType === 'review' && rows.length > 0 && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900"><AlertTriangle size={14} className="shrink-0" /> These gaps are blocked from cost calculation until the shown trip data is corrected.</div>
        )}

        <div className="space-y-2 md:hidden">
          {rows.map((row) => (
            <article key={row.rowId} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2"><p className="truncate font-mono text-xs font-bold text-blue-700">#{row.trip.bookingId || row.trip.id}</p><p className="shrink-0 text-xs font-bold text-slate-900">{money(row.totalCost)}</p></div>
              <p className="mt-1 truncate text-xs font-semibold text-slate-800" title={`${row.originCity} to ${row.destinationCity}`}>{row.originCity || 'Missing city'} → {row.destinationCity || 'Missing city'}</p>
              <p className="mt-1 truncate text-[10px] font-semibold text-slate-500">{row.legLabel} · {driverName(row)}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]"><div><p className="text-slate-500">Empty miles</p><p className="font-bold text-slate-900">{decimal(row.unloadedMiles)}</p></div><div><p className="text-slate-500">Mileage</p><p className="font-bold text-blue-700">{money(row.unloadedAmount)}</p></div><div><p className="text-slate-500">Wait</p><p className="font-bold text-slate-900">{decimal(row.waitHours)} hr · {money(row.waitCost)}</p></div></div>
              <details className="mt-2 border-t border-slate-100 pt-2 text-[10px] font-semibold text-slate-600"><summary className="cursor-pointer text-blue-700">Audit details</summary><div className="mt-2 space-y-1"><p>Passenger trip: {row.tripPickupCity || 'Missing'} → {row.tripDropoffCity || 'Missing'}</p><p>Empty leg: {row.originAddress || 'Missing origin'} → {row.destinationAddress || 'Missing destination'}</p><p>{row.mileageSource}: {row.mileageSource === 'Recorded odometer chain' ? `${odometer(row.originOdometer)} → ${odometer(row.destinationOdometer)} mi` : `${decimal(row.rawUnloadedMiles)} mi`}</p><p>{row.unloadedReason}</p><p>{row.waitReason}</p><button type="button" disabled={!updateOverridePolicy || row.pairExcluded || !row.cityPairComplete || excludingRowId === row.rowId} onClick={() => void excludeRoute(row)} className="mt-2 inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 font-bold text-rose-700 disabled:opacity-40"><Ban size={12} />{row.pairExcluded ? 'Route excluded' : excludingRowId === row.rowId ? 'Saving…' : 'Exclude this route'}</button></div></details>
            </article>
          ))}
        </div>

        <div className="app-table-frame hidden md:block">
          <table className="bg-white text-xs shadow-sm" aria-label="Trip cost override candidates">
            <colgroup>{TABLE_COLUMNS.map(([, fullLabel, width]) => <col key={fullLabel} style={{ width }} />)}</colgroup>
            <thead><tr>{TABLE_COLUMNS.map(([label, fullLabel]) => <th key={fullLabel} className="px-2 py-2 text-left" title={fullLabel}>{label}</th>)}</tr></thead>
            <tbody>
              {rows.map((row) => {
                const rowId = text(row.rowId);
                const expanded = expandedRowId === rowId;
                return (
                  <Fragment key={rowId}>
                    <tr tabIndex="0" data-agape-table-row="true" className="cursor-pointer border-b border-slate-100 hover:bg-blue-50/60 focus:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500" aria-expanded={expanded} aria-controls={`override-detail-${rowId}`} onClick={() => toggleExpanded(rowId)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleExpanded(rowId); } }}>
                      <td className="px-2 py-1.5" title={row.serviceDate}>{row.serviceDate}</td>
                      <td className="px-2 py-1.5 font-mono font-semibold text-blue-700" title={text(row.trip.bookingId || row.trip.id)}><span className="inline-flex max-w-full items-center gap-1"><ChevronRight size={12} className={`shrink-0 ${expanded ? 'rotate-90' : ''}`} /><span className="truncate">{row.trip.bookingId || row.trip.id}</span></span></td>
                      <td className="px-2 py-1.5" title={row.legLabel}>{row.legLabel}</td>
                      <td className="px-2 py-1.5" title={driverName(row)}>{driverName(row)}</td>
                      <td className="px-2 py-1.5 font-semibold" title={`${row.originCity || 'Missing'} → ${row.destinationCity || 'Missing'}`}>{row.originCity || 'Missing'} → {row.destinationCity || 'Missing'}</td>
                      <td className="px-2 py-1.5 text-center" title={row.tripType}>{row.tripType}</td>
                      <td className="px-2 py-1.5 font-mono" title={`${decimal(row.rawUnloadedMiles)} recorded raw miles`}>{decimal(row.unloadedMiles)}</td>
                      <td className="px-2 py-1.5 font-mono font-semibold text-blue-700" title={row.unloadedReason}>{money(row.unloadedAmount)}</td>
                      <td className="px-2 py-1.5 font-mono" title={`${decimal(row.rawGapHours)} raw hours`}>{decimal(row.waitHours)}</td>
                      <td className="px-2 py-1.5 font-mono" title={row.waitReason}>{money(row.waitCost)}</td>
                      <td className="px-2 py-1.5 font-mono" title={money(row.originalTripCost)}>{money(row.originalTripCost)}</td>
                      <td className="px-2 py-1.5 font-mono font-bold text-slate-950" title={money(row.totalCost)}>{money(row.totalCost)}</td>
                    </tr>
                    {expanded && (
                      <tr id={`override-detail-${rowId}`} data-agape-detail-row="true" className="bg-slate-50">
                        <td colSpan={TABLE_COLUMNS.length} className="px-3 py-3">
                          <div className="grid gap-3 text-[11px] font-semibold text-slate-700 lg:grid-cols-4">
                            <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Passenger trip</p><p className="mt-1 truncate" title={`${row.tripPickupCity} → ${row.tripDropoffCity}`}>{row.tripPickupCity || 'Missing'} → {row.tripDropoffCity || 'Missing'}</p><p className="truncate text-slate-500" title={`${row.tripPickupAddress} → ${row.tripDropoffAddress}`}>{row.tripPickupAddress || 'Pickup missing'} → {row.tripDropoffAddress || 'Dropoff missing'}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Unloaded leg</p><p className="mt-1">{row.legLabel}: {row.originCity || 'Missing'} → {row.destinationCity || 'Missing'}</p><p className="truncate text-slate-500" title={`${row.originAddress} → ${row.destinationAddress}`}>{row.originAddress || 'Origin missing'} → {row.destinationAddress || 'Destination missing'}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Mileage evidence</p><p className="mt-1">{row.mileageSource === 'Recorded odometer chain' ? `${odometer(row.originOdometer)} → ${odometer(row.destinationOdometer)} mi` : `${row.mileageSource} · raw ${decimal(row.rawUnloadedMiles)} mi`}</p><p className="text-slate-500">{decimal(row.unloadedMiles)} × {money(row.unloadedRate)} = {money(row.unloadedAmount)}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Waiting evidence</p><p className="mt-1">{row.originTimestamp ? `${dateTime(row.originTimestamp)} → ${dateTime(row.destinationTimestamp)}` : 'Not applicable to this home boundary leg'} · raw gap {decimal(row.rawGapHours)} hr</p><p className="text-slate-500">Billable {decimal(row.waitHours)} hr × {money(row.waitRate)} = {money(row.waitCost)}</p></div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2 text-[10px] font-semibold"><div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2"><p className={row.unloadedAmount > 0 ? 'text-emerald-700' : row.requiresReview ? 'text-amber-800' : 'text-slate-600'}>Mileage: {row.unloadedReason}</p><p className={row.waitCost > 0 ? 'text-emerald-700' : row.requiresReview ? 'text-amber-800' : 'text-slate-600'}>Waiting: {row.waitReason}</p></div><button type="button" disabled={!updateOverridePolicy || row.pairExcluded || !row.cityPairComplete || excludingRowId === row.rowId} onClick={(event) => { event.stopPropagation(); void excludeRoute(row); }} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-40"><Ban size={12} />{row.pairExcluded ? 'Route excluded' : excludingRowId === row.rowId ? 'Saving…' : 'Exclude route'}</button></div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            {!!rows.length && <tfoot><tr className="bg-slate-100 font-bold"><td className="px-2 py-2" colSpan="6">SUBTOTALS</td><td /><td className="px-2 py-2 font-mono">{money(totals.unloaded)}</td><td /><td className="px-2 py-2 font-mono">{money(totals.waiting)}</td><td className="px-2 py-2 font-mono">{money(totals.original)}</td><td className="px-2 py-2 font-mono">{money(totals.total)}</td></tr></tfoot>}
          </table>
        </div>
        {!rows.length && <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 text-center text-sm font-semibold text-slate-500">{candidateType === 'override' ? 'No trips qualify for a mileage or waiting override in this range.' : candidateType === 'review' ? 'No blocked gaps need data review in this range.' : 'No evaluated gaps match these filters.'}</div>}
      </div>
    </div>
  );
};

export default UnloadedTripsReport;
