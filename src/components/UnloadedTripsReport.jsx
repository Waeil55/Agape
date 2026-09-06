import { Fragment, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, ChevronDown, ChevronLeft, ChevronRight, Download, MapPin, RotateCcw, Save, Search } from 'lucide-react';
import { forEachWithConcurrency } from '../utils/boundedConcurrency';
import { addOverrideExclusionRule, analyzeTripCostOverrides, filterTripCostOverrideRows, normalizeOverridePolicy } from '../utils/tripCostOverrides';
import { downloadTripOverrideWorkbook } from '../utils/tripOverrideWorkbook';
import { localCalendarYmd } from '../utils/tripDate';
import { getGoogleDrivingRouteMiles } from '../utils/routedMileage';
import OverrideHomeAddressEditor, { getOverrideHomePolicyUpdates, verifyOverrideHomePolicy } from './OverrideHomeAddressEditor';
import OverrideExclusionRulesEditor, { getOverrideExclusionPolicyUpdates } from './OverrideExclusionRulesEditor';

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
const originalCostLabel = (row) => {
  if (row.originalTripCostStatus === 'valid') return money(row.originalTripCost);
  if (row.originalTripCostStatus === 'invalid') return 'Invalid fare';
  if (row.originalTripCostStatus === 'missing') return 'Not provided';
  return '—';
};
const isIncompleteTotal = (row) => row.originalTripCostIncluded && row.originalTripCostStatus !== 'valid';
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
  ['Date', 'Trip Date', '7%'],
  ['Booking ID', 'Booking ID receiving the override', '8%'],
  ['Client', 'Client name', '11%'],
  ['Leg', 'Empty-leg type', '8%'],
  ['Driver', 'Driver', '8%'],
  ['Unloaded route', 'Empty vehicle origin to destination', '16%'],
  ['A/W', 'Ambulatory or Wheelchair', '4%'],
  ['Empty mi', 'Billable Unloaded Miles', '7%'],
  ['Mileage', 'Mileage Override Amount', '8%'],
  ['Paid wait', 'Billable waiting hours after the threshold', '6%'],
  ['Wait cost', 'Waiting Cost', '7%'],
  ['Original', 'Original Trip Cost', '5%'],
  ['Total', 'Total Cost', '5%'],
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
  const [rulesEditorOpen, setRulesEditorOpen] = useState(false);
  const [rulesDraft, setRulesDraft] = useState(() => normalizeOverridePolicy(overridePolicy));
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesStatus, setRulesStatus] = useState('');
  const policyReady = overridePolicyStatus === 'ready';
  const sharedHomeMissing = !overridePolicy?.homeAddress || !overridePolicy?.homeCity || !overridePolicy?.homeState || !overridePolicy?.homeZip;
  const showHomeEditor = sharedHomeMissing || homeEditorOpen;
  const sharedHomeLabel = sharedHomeMissing
    ? 'Not set'
    : (overridePolicy?.homeFormattedAddress
      || [overridePolicy?.homeAddress, overridePolicy?.homeCity, overridePolicy?.homeState].filter(Boolean).join(', '));
  const exclusionRuleCount = normalizeOverridePolicy(overridePolicy).overrideExclusionRules.length;

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

  const totals = useMemo(() => rows.reduce((sum, row) => {
    const original = row.originalTripCostStatus === 'valid' ? Number(row.originalTripCost || 0) : 0;
    return {
      original: sum.original + original,
      unloaded: sum.unloaded + Number(row.unloadedAmount || 0),
      waiting: sum.waiting + Number(row.waitCost || 0),
      missingFares: sum.missingFares + (row.originalTripCostIncluded && row.originalTripCostStatus === 'missing' ? 1 : 0),
      invalidFares: sum.invalidFares + (row.originalTripCostIncluded && row.originalTripCostStatus === 'invalid' ? 1 : 0),
    };
  }, { original: 0, unloaded: 0, waiting: 0, missingFares: 0, invalidFares: 0 }), [rows]);
  const knownSubtotal = totals.original + totals.unloaded + totals.waiting;
  const incompleteFareCount = totals.missingFares + totals.invalidFares;
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
  const clientName = (row) => row.clientName || 'Client name missing';
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
  const toggleRulesEditor = () => {
    if (rulesEditorOpen) {
      setRulesEditorOpen(false);
      setRulesStatus('');
      return;
    }
    setRulesDraft(normalizeOverridePolicy(overridePolicy));
    setRulesStatus('');
    setRulesEditorOpen(true);
  };
  const saveExclusionRules = async () => {
    if (!updateOverridePolicy) {
      setRulesStatus('Shared override settings are unavailable.');
      return;
    }
    if (!policyReady) {
      setRulesStatus(overridePolicyError || 'Wait until the shared override policy finishes loading.');
      return;
    }
    setRulesSaving(true);
    setRulesStatus('Saving directional exclusion rules…');
    try {
      const updates = getOverrideExclusionPolicyUpdates(rulesDraft);
      const savedPolicy = await updateOverridePolicy(updates);
      setRulesDraft(normalizeOverridePolicy(savedPolicy || { ...overridePolicy, ...updates }));
      setBoundaryDistances(new Map());
      setRulesEditorOpen(false);
      setRulesStatus('');
      setActionMessage('Directional exclusion rules saved. Override rows were recalculated.');
    } catch (error) {
      setRulesStatus(error instanceof Error ? error.message : 'Directional exclusion rules could not be saved.');
    } finally {
      setRulesSaving(false);
    }
  };
  const excludeRoute = async (row) => {
    if (!updateOverridePolicy || !row.originCity || !row.destinationCity) return;
    const route = `${row.originCity} > ${row.destinationCity}`;
    const normalizedPolicy = normalizeOverridePolicy(overridePolicy);
    const nextRules = addOverrideExclusionRule(normalizedPolicy, {
      scope: 'all',
      fromCity: row.originCity,
      toCity: row.destinationCity,
    });
    if (nextRules.length === normalizedPolicy.overrideExclusionRules.length
      && nextRules.every((rule, index) => rule.id === normalizedPolicy.overrideExclusionRules[index]?.id)) {
      setActionMessage(`All overrides for ${route} are already excluded.`);
      return;
    }
    setExcludingRowId(row.rowId);
    setActionMessage('');
    try {
      await updateOverridePolicy({ excludedCityPairs: [], overrideExclusionRules: nextRules });
      setActionMessage(`Excluded all override calculations for ${route}. Edit the rule to limit it to waiting or mileage only.`);
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

      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-1.5">
        <div className="app-filter-bar !flex-nowrap gap-1.5" role="toolbar" aria-label="Trip cost override controls" data-testid="override-toolbar">
          <label className="flex h-8 !min-w-[100px] flex-1 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2">
            <Search size={12} className="shrink-0 text-slate-400" />
            <input aria-label="Search trip cost overrides" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search trips…" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[10px] font-semibold outline-none" />
          </label>
          <div className="flex h-8 shrink-0 items-center rounded-xl border border-slate-200 bg-white">
            <button type="button" onClick={() => moveWeek(-7)} className="grid h-full w-7 place-items-center rounded-l-xl text-slate-600 hover:bg-slate-50" aria-label="Previous week"><ChevronLeft size={14} /></button>
            <input aria-label="From date" type="date" value={fromDate} disabled={allDates} onChange={(event) => setFromDate(event.target.value)} className="h-7 w-[100px] border-0 px-1 text-[10px] font-semibold disabled:opacity-40 2xl:w-[112px]" />
            <span className="text-[10px] font-semibold text-slate-400">–</span>
            <input aria-label="To date" type="date" value={toDate} disabled={allDates} onChange={(event) => setToDate(event.target.value)} className="h-7 w-[100px] border-0 px-1 text-[10px] font-semibold disabled:opacity-40 2xl:w-[112px]" />
            <button type="button" onClick={() => moveWeek(7)} className="grid h-full w-7 place-items-center rounded-r-xl text-slate-600 hover:bg-slate-50" aria-label="Next week"><ChevronRight size={14} /></button>
          </div>
          <select aria-label="Driver" value={driverFilter} onChange={(event) => setDriverFilter(event.target.value)} className="h-8 w-[90px] min-w-0 shrink-0 px-1.5 text-[10px] font-semibold 2xl:w-[130px]"><option value="all">All drivers</option>{driverOptions.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select>
          <button type="button" onClick={openHomeEditor} aria-expanded={showHomeEditor} aria-label="Edit shared home address" title={`Edit shared home address: ${sharedHomeLabel}`} className={`inline-flex h-8 w-[140px] min-w-0 shrink-0 items-center gap-1.5 rounded-xl border px-2 text-[10px] font-bold 2xl:w-[220px] ${sharedHomeMissing ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><MapPin size={13} className="shrink-0" /><span className="shrink-0">Home:</span><span className="truncate font-semibold">{sharedHomeLabel}</span></button>
          <select aria-label="Override result view" value={candidateType} onChange={(event) => setCandidateType(event.target.value)} className="h-8 w-[150px] min-w-0 shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-2 text-[10px] font-bold text-blue-800 outline-none focus:ring-2 focus:ring-blue-500 2xl:w-[160px]">
            {FILTER_VIEWS.map(([key, label]) => <option key={key} value={key}>{label} ({viewCounts[key] || 0})</option>)}
          </select>
          <button type="button" onClick={resetFilters} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50" aria-label="Reset override filters" title="Reset override filters"><RotateCcw size={13} /></button>
          <button type="button" onClick={exportRows} disabled={!policyReady || !rows.length} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40" aria-label="Export override report to Excel" title="Export to Excel"><Download size={13} /></button>
          <button type="button" onClick={() => setAdvancedOpen((value) => !value)} aria-expanded={advancedOpen} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50">Advanced <ChevronDown size={12} className={advancedOpen ? 'rotate-180' : ''} /></button>
        </div>

        {advancedOpen && (
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
              <label className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600">Minimum empty miles<input aria-label="Minimum unloaded miles" type="number" min="0" step="0.1" value={minimumUnloaded} onChange={(event) => setMinimumUnloaded(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent p-0 text-right text-xs" /></label>
              <label className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600">Minimum wait hours<input aria-label="Minimum waiting hours" type="number" min="0" step="0.5" value={minimumWait} onChange={(event) => setMinimumWait(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent p-0 text-right text-xs" /></label>
              <select aria-label="Empty leg from city" value={gapFromCity} onChange={(event) => setGapFromCity(event.target.value)} className="h-9 px-2 text-xs font-semibold"><option value="all">Any empty-leg origin</option>{cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}</select>
              <select aria-label="Empty leg to city" value={gapToCity} onChange={(event) => setGapToCity(event.target.value)} className="h-9 px-2 text-xs font-semibold"><option value="all">Any empty-leg destination</option>{cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}</select>
              <select aria-label="Empty leg type" value={legType} onChange={(event) => setLegType(event.target.value)} className="h-9 px-2 text-xs font-semibold"><option value="all">All empty-leg types</option><option value="before_pickup">Before pickup</option><option value="home_return">Return home</option></select>
              <label className="flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"><input type="checkbox" checked={allDates} onChange={(event) => setAllDates(event.target.checked)} /> Ignore date range</label>
              <button type="button" onClick={toggleRulesEditor} aria-expanded={rulesEditorOpen} aria-label="Edit override exclusion rules" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-100"><Ban size={14} /> Exclusion rules ({exclusionRuleCount})</button>
            </div>
            {rulesEditorOpen && (
              <div className="mt-2 border-t border-slate-200 pt-2">
                <OverrideExclusionRulesEditor policy={rulesDraft} onChange={setRulesDraft} disabled={rulesSaving} compact />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => void saveExclusionRules()} disabled={rulesSaving || !policyReady || !updateOverridePolicy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40"><Save size={14} />{rulesSaving ? 'Saving rules…' : 'Save exclusion rules'}</button>
                  <button type="button" onClick={toggleRulesEditor} disabled={rulesSaving} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700">Cancel</button>
                  {rulesStatus && <p className="text-xs font-semibold text-amber-800" role="status">{rulesStatus}</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 px-3 py-2">
        <div className="app-summary-strip" aria-label="Override cost summary" data-testid="override-cost-summary">
          <div className="app-summary-metrics">
            <span className="app-summary-item"><strong>{money(totals.original)}</strong> known original</span>
            <span className="app-summary-item"><strong>{money(totals.unloaded)}</strong> mileage</span>
            <span className="app-summary-item"><strong>{money(totals.waiting)}</strong> waiting</span>
            <span className="app-summary-item app-summary-item--accent"><strong>{money(knownSubtotal)}</strong> known subtotal</span>
          </div>
        </div>
      </div>

      {policyReady && (
        <div className="mx-3 mb-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-600">
          <span className="block truncate" title={`Unloaded miles must exceed ${result.policy.unloadedThresholdMiles} miles at ${money(result.policy.unloadedRate)} per mile. Waiting must exceed ${result.policy.waitingThresholdHours} hours; only time beyond the threshold is rounded up to ${result.policy.waitRoundingMinutes}-minute increments at ${money(result.policy.waitRate)} per hour.`}>
            Showing {rows.length} of {result.rows.length} evaluated gaps · {viewCounts.override || 0} override candidates · {viewCounts.review || 0} need data review · policy: empty miles &gt; {decimal(result.policy.unloadedThresholdMiles)} at {money(result.policy.unloadedRate)}/mi · wait &gt; {decimal(result.policy.waitingThresholdHours)} hr at {money(result.policy.waitRate)}/hr
          </span>
        </div>
      )}

      {policyReady && incompleteFareCount > 0 && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-900" role="alert">
          <AlertTriangle size={14} className="shrink-0" />
          <span>{incompleteFareCount} Booking ID{incompleteFareCount === 1 ? '' : 's'} {incompleteFareCount === 1 ? 'has' : 'have'} an unavailable base fare ({totals.invalidFares} invalid, {totals.missingFares} not provided). Known original and subtotal exclude those fares; mileage and waiting supplements remain calculated.</span>
        </div>
      )}

      {(boundaryStatus.loading > 0 || boundaryStatus.errors > 0 || actionMessage) && (
        <div className={`mx-3 mb-2 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-[10px] font-semibold ${boundaryStatus.errors > 0 ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`} role={boundaryStatus.errors > 0 ? 'alert' : 'status'}>
          <span>{actionMessage || (boundaryStatus.errors > 0 ? `${boundaryStatus.errors} home-route mileage calculation${boundaryStatus.errors === 1 ? '' : 's'} failed. Use the Home button above to verify the shared address, then retry.` : `Calculating ${boundaryStatus.loading} home-route mileage${boundaryStatus.loading === 1 ? '' : 's'}…`)}</span>
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
              <div className="flex items-center justify-between gap-2"><p className="truncate font-mono text-xs font-bold text-blue-700">#{row.trip.bookingId || row.trip.id}</p><p className={`shrink-0 text-xs font-bold ${isIncompleteTotal(row) ? 'text-amber-800' : 'text-slate-900'}`}>{money(row.totalCost)}{isIncompleteTotal(row) ? ' partial' : ''}</p></div>
              <p className="mt-1 truncate text-sm font-semibold text-slate-950" title={clientName(row)}>{clientName(row)}</p>
              <p className="mt-1 truncate text-xs font-semibold text-slate-800" title={`${row.originCity} to ${row.destinationCity}`}>{row.originCity || 'Missing city'} → {row.destinationCity || 'Missing city'}</p>
              <p className="mt-1 truncate text-[10px] font-semibold text-slate-500">{row.legLabel} · {driverName(row)}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]"><div><p className="text-slate-500">Empty miles</p><p className="font-bold text-slate-900">{decimal(row.unloadedMiles)}</p></div><div><p className="text-slate-500">Mileage</p><p className="font-bold text-blue-700">{money(row.unloadedAmount)}</p></div><div><p className="text-slate-500">Wait</p><p className="font-bold text-slate-900">{decimal(row.waitHours)} hr · {money(row.waitCost)}</p></div></div>
              <details className="mt-2 border-t border-slate-100 pt-2 text-[10px] font-semibold text-slate-600"><summary className="cursor-pointer text-blue-700">Audit details</summary><div className="mt-2 space-y-1"><p>Passenger trip: {row.tripPickupCity || 'Missing'} → {row.tripDropoffCity || 'Missing'}</p><p>Empty leg: {row.originAddress || 'Missing origin'} → {row.destinationAddress || 'Missing destination'}</p><p>{row.mileageSource}: {row.mileageSource === 'Recorded odometer chain' ? `${odometer(row.originOdometer)} → ${odometer(row.destinationOdometer)} mi` : `${decimal(row.rawUnloadedMiles)} mi`}</p><p>Base fare: {originalCostLabel(row)} · {row.originalTripCostReason}</p><p>{row.unloadedReason}</p><p>Waiting: raw {decimal(row.rawGapHours)} hr; paid {decimal(row.waitHours)} hr. {row.waitReason}</p><button type="button" disabled={!updateOverridePolicy || row.pairExcluded || !row.cityPairComplete || excludingRowId === row.rowId} onClick={() => void excludeRoute(row)} className="mt-2 inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 font-bold text-rose-700 disabled:opacity-40"><Ban size={12} />{row.pairExcluded ? 'All overrides excluded' : excludingRowId === row.rowId ? 'Saving…' : 'Exclude all for this route'}</button></div></details>
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
                      <td className="px-2 py-1.5 font-semibold" title={clientName(row)}>{clientName(row)}</td>
                      <td className="px-2 py-1.5" title={row.legLabel}>{row.legLabel}</td>
                      <td className="px-2 py-1.5" title={driverName(row)}>{driverName(row)}</td>
                      <td className="px-2 py-1.5 font-semibold" title={`${row.originCity || 'Missing'} → ${row.destinationCity || 'Missing'}`}>{row.originCity || 'Missing'} → {row.destinationCity || 'Missing'}</td>
                      <td className="px-2 py-1.5 text-center" title={row.tripType}>{row.tripType}</td>
                      <td className="px-2 py-1.5 font-mono" title={`${decimal(row.rawUnloadedMiles)} recorded raw miles`}>{decimal(row.unloadedMiles)}</td>
                      <td className="px-2 py-1.5 font-mono font-semibold text-blue-700" title={row.unloadedReason}>{money(row.unloadedAmount)}</td>
                      <td className="px-2 py-1.5 font-mono" title={`${decimal(row.rawGapHours)} raw hours`}>{decimal(row.waitHours)}</td>
                      <td className="px-2 py-1.5 font-mono" title={row.waitReason}>{money(row.waitCost)}</td>
                      <td className={`px-2 py-1.5 font-mono ${row.originalTripCostStatus === 'invalid' || row.originalTripCostStatus === 'missing' ? 'font-semibold text-amber-800' : ''}`} title={row.originalTripCostReason}>{originalCostLabel(row)}</td>
                      <td className={`px-2 py-1.5 font-mono font-bold ${isIncompleteTotal(row) ? 'text-amber-800' : 'text-slate-950'}`} title={isIncompleteTotal(row) ? `Partial subtotal: ${row.originalTripCostReason}` : money(row.totalCost)}>{money(row.totalCost)}{isIncompleteTotal(row) ? ' partial' : ''}</td>
                    </tr>
                    {expanded && (
                      <tr id={`override-detail-${rowId}`} data-agape-detail-row="true" className="bg-slate-50">
                        <td colSpan={TABLE_COLUMNS.length} className="px-3 py-3">
                          <div className="grid gap-3 text-[11px] font-semibold text-slate-700 lg:grid-cols-4">
                            <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Passenger trip</p><p className="mt-1 truncate text-slate-900" title={clientName(row)}>{clientName(row)}</p><p className="truncate" title={`${row.tripPickupCity} → ${row.tripDropoffCity}`}>{row.tripPickupCity || 'Missing'} → {row.tripDropoffCity || 'Missing'}</p><p className="truncate text-slate-500" title={`${row.tripPickupAddress} → ${row.tripDropoffAddress}`}>{row.tripPickupAddress || 'Pickup missing'} → {row.tripDropoffAddress || 'Dropoff missing'}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Unloaded leg</p><p className="mt-1">{row.legLabel}: {row.originCity || 'Missing'} → {row.destinationCity || 'Missing'}</p><p className="truncate text-slate-500" title={`${row.originAddress} → ${row.destinationAddress}`}>{row.originAddress || 'Origin missing'} → {row.destinationAddress || 'Destination missing'}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Mileage evidence</p><p className="mt-1">{row.mileageSource === 'Recorded odometer chain' ? `${odometer(row.originOdometer)} → ${odometer(row.destinationOdometer)} mi` : `${row.mileageSource} · raw ${decimal(row.rawUnloadedMiles)} mi`}</p><p className="text-slate-500">{decimal(row.unloadedMiles)} × {money(row.unloadedRate)} = {money(row.unloadedAmount)}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Waiting evidence</p><p className="mt-1">{row.originTimestamp ? `${dateTime(row.originTimestamp)} → ${dateTime(row.destinationTimestamp)}` : 'Not applicable to this home boundary leg'} · raw gap {decimal(row.rawGapHours)} hr</p><p className="text-slate-500">Paid after threshold {decimal(row.waitHours)} hr × {money(row.waitRate)} = {money(row.waitCost)}</p><p className={row.originalTripCostStatus === 'invalid' || row.originalTripCostStatus === 'missing' ? 'text-amber-800' : 'text-slate-500'}>Base fare: {originalCostLabel(row)} · {row.originalTripCostReason}</p></div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2 text-[10px] font-semibold"><div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2"><p className={row.unloadedAmount > 0 ? 'text-emerald-700' : row.requiresReview ? 'text-amber-800' : 'text-slate-600'}>Mileage: {row.unloadedReason}</p><p className={row.waitCost > 0 ? 'text-emerald-700' : row.requiresReview ? 'text-amber-800' : 'text-slate-600'}>Waiting: {row.waitReason}</p></div><button type="button" disabled={!updateOverridePolicy || row.pairExcluded || !row.cityPairComplete || excludingRowId === row.rowId} onClick={(event) => { event.stopPropagation(); void excludeRoute(row); }} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-40"><Ban size={12} />{row.pairExcluded ? 'All overrides excluded' : excludingRowId === row.rowId ? 'Saving…' : 'Exclude all for route'}</button></div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            {!!rows.length && <tfoot><tr className="bg-slate-100 font-bold"><td className="px-2 py-2" colSpan="7">SUBTOTALS</td><td /><td className="px-2 py-2 font-mono">{money(totals.unloaded)}</td><td /><td className="px-2 py-2 font-mono">{money(totals.waiting)}</td><td className="px-2 py-2 font-mono" title={incompleteFareCount ? `${incompleteFareCount} base fares unavailable` : 'All displayed base fares verified'}>{money(totals.original)}{incompleteFareCount ? ' known' : ''}</td><td className="px-2 py-2 font-mono" title={incompleteFareCount ? 'Known subtotal excludes unavailable base fares' : 'Complete subtotal'}>{money(knownSubtotal)}{incompleteFareCount ? ' known' : ''}</td></tr></tfoot>}
          </table>
        </div>
        {!rows.length && <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 text-center text-sm font-semibold text-slate-500">{candidateType === 'override' ? 'No trips qualify for a mileage or waiting override in this range.' : candidateType === 'review' ? 'No blocked gaps need data review in this range.' : 'No evaluated gaps match these filters.'}</div>}
      </div>
    </div>
  );
};

export default UnloadedTripsReport;
