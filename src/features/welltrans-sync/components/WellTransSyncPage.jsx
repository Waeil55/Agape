import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, Bot, CheckCircle2, Clock3, Code, Download, ExternalLink, Eye,
  FileText, Filter, Loader2, Play, RefreshCw, RotateCcw, Save, Search, Settings2,
  ShieldCheck, Sparkles, X, XCircle,
} from 'lucide-react';
import { auth } from '../../../config/firebase';
import { useWellTransSync } from '../hooks/useWellTransSync';
import {
  confirmWellTransApplied, explainWellTransFailure, exportWellTransLogsCSV,
  isWellTransFailureRetryable, queueWellTransSync, saveWellTransSettings,
} from '../services/welltransService';
import {
  buildWellTransPayload, DEFAULT_WELLTRANS_FIELD_MAPPING, validateTripForWellTrans,
} from '../utils/welltransMapping';

const statusStyle = {
  pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  processing: 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse',
  awaiting_review: 'bg-purple-50 text-purple-700 border border-purple-200',
  completed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  failed: 'bg-rose-50 text-rose-700 border border-rose-200',
};

const asDate = value => value?.toDate?.() || (value ? new Date(value) : null);
const displayTime = value => {
  const date = asDate(value);
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : 'Never';
};

const AUTHORIZED_ROLES = ['admin', 'superadmin', 'dispatcher', 'manager', 'biller', 'owner'];

const WellTransSyncPage = ({ trips = [], role = 'dispatcher' }) => {
  const [syncDate, setSyncDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const {
    settings, logs, worker, workerOnline, workerCalibrated, workerUpgradeRequired,
    requiredWorkerVersion, workerStandby, loading, completedTrips, readyTrips,
    latestByTrip, healthScore, successfulCount, failedCount,
  } = useWellTransSync(trips, syncDate);

  const [selectedIds, setSelectedIds] = useState([]);
  const [tab, setTab] = useState('queue');
  const [draftSettings, setDraftSettings] = useState(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedFailure, setSelectedFailure] = useState(null);
  const [inspectPayloadTrip, setInspectPayloadTrip] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const normalizedRole = String(role || '').toLowerCase().trim();
  const isAuthorized = AUTHORIZED_ROLES.includes(normalizedRole);

  const effectiveSettings = draftSettings || settings;
  const workerDateMatches = Boolean(workerCalibrated && worker?.selectedDate === syncDate);
  const currentLogs = useMemo(() => [...latestByTrip.values()], [latestByTrip]);
  const stagedCount = currentLogs.filter(log => log.status === 'awaiting_review').length;
  const failedLogs = currentLogs.filter(log => log.status === 'failed');
  const retryableFailed = failedLogs.filter(isWellTransFailureRetryable);
  const unmatchedCount = failedLogs.length - retryableFailed.length;

  // Filtered trips list for grid
  const filteredCompletedTrips = useMemo(() => {
    return completedTrips.filter(trip => {
      const q = searchQuery.toLowerCase().trim();
      const bookingId = (trip.bookingId || trip.id || '').toString().toLowerCase();
      const passenger = (trip.patient || trip.clientName || '').toLowerCase();
      const driver = (trip.driverName || '').toLowerCase();
      const matchesSearch = !q || bookingId.includes(q) || passenger.includes(q) || driver.includes(q);

      if (!matchesSearch) return false;

      if (statusFilter === 'all') return true;
      const latest = latestByTrip.get(trip.id);
      const validation = validateTripForWellTrans(trip);

      if (statusFilter === 'ready') return validation.valid && !latest;
      if (statusFilter === 'staged') return latest?.status === 'awaiting_review';
      if (statusFilter === 'completed') return latest?.status === 'completed';
      if (statusFilter === 'failed') return latest?.status === 'failed';
      if (statusFilter === 'invalid') return !validation.valid;
      return true;
    });
  }, [completedTrips, searchQuery, statusFilter, latestByTrip]);

  if (!isAuthorized) {
    return (
      <div className="flex min-h-[500px] flex-col items-center justify-center p-8 text-center bg-white rounded-3xl border border-slate-200 text-slate-500">
        <ShieldCheck className="h-16 w-16 text-rose-400 mb-4 animate-bounce" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">Restricted Module Access</h2>
        <p className="max-w-md text-sm text-slate-500">
          Your current role (<span className="font-mono text-rose-500">{role}</span>) does not have dispatch or administrative permissions for WellTrans broker automation.
        </p>
      </div>
    );
  }

  const runQueue = async (ids, mode) => {
    if (!ids.length) return setNotice('No eligible trips selected.');
    setBusy(mode); setNotice('');
    try {
      const result = await queueWellTransSync(ids, mode, syncDate);
      setNotice(`${result.data.queued} trip${result.data.queued === 1 ? '' : 's'} queued for WellTrans sync. ${result.data.rejected || 0} rejected by pre-validation.`);
      setSelectedIds([]);
    } catch (error) {
      setNotice(error.message || 'Unable to create the sync queue.');
    } finally { setBusy(''); }
  };

  const cards = [
    { label: 'Total Service Date Trips', value: completedTrips.length, icon: FileText, color: 'from-blue-50 to-indigo-50 text-blue-700 border-blue-200' },
    { label: 'Ready To Sync', value: readyTrips.length, icon: Play, color: 'from-cyan-50 to-blue-50 text-cyan-700 border-cyan-200' },
    { label: 'Successfully Synced', value: successfulCount, icon: CheckCircle2, color: 'from-emerald-50 to-teal-50 text-emerald-700 border-emerald-200' },
    { label: 'Awaiting Review', value: stagedCount, icon: Clock3, color: 'from-purple-50 to-violet-50 text-purple-700 border-purple-200' },
    { label: 'Failed / Exception', value: failedLogs.length, icon: XCircle, color: 'from-rose-50 to-red-50 text-rose-700 border-rose-200' },
    { label: 'Sync Health Score', value: `${healthScore}%`, icon: Sparkles, color: 'from-amber-50 to-orange-50 text-amber-700 border-amber-200' },
  ];

  return (
    <div className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8 text-slate-700 font-sans">
      <div className="mx-auto max-w-[1600px] space-y-6">

        {/* --- MAIN HEADER BANNER --- */}
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-100 via-white to-slate-50 p-6 sm:p-8 border border-slate-200 shadow-sm">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 h-64 w-64 rounded-full bg-blue-500/5 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 -mb-8 h-48 w-48 rounded-full bg-indigo-500/5 blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 backdrop-blur-md">
                <Sparkles size={14} className="text-blue-500" />
                <span>Broker Integrations · WellTrans Playwright Core</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
                WellTrans Automation Center
              </h1>
              <p className="max-w-3xl text-sm text-slate-500 leading-relaxed">
                Automated grid staging with Booking-ID-only precision, field mapping validation, isolated Playwright execution, and real-time operational telemetry.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                onClick={() => { window.location.href = 'agape-welltrans://start'; }}
                className="group relative inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-blue-500/15 transition-all hover:scale-105 hover:from-blue-500 hover:to-indigo-500 active:scale-95"
              >
                <Play size={16} className="fill-current transition-transform group-hover:translate-x-0.5" />
                <span>OPEN WELLTRANS WORKER</span>
              </button>

              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <span className={`relative flex h-3 w-3`}>
                  <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${settings.enabled && workerOnline ? 'bg-emerald-400 opacity-75' : 'bg-amber-400 opacity-75'}`} />
                  <span className={`relative inline-flex h-3 w-3 rounded-full ${settings.enabled && workerOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Worker Status</p>
                  <p className="text-xs font-bold text-slate-800">
                    {!settings.enabled ? 'Queue Disabled' : workerOnline ? `Online · ${worker?.workerId || 'connected'}` : workerStandby ? 'Standby Lock' : 'Offline'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* --- METRICS / KPI GRID --- */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          {cards.map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              className={`relative overflow-hidden rounded-2xl border bg-gradient-to-b ${color} p-4 shadow-sm transition-all hover:-translate-y-1`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold tracking-wide text-slate-500">{label}</p>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white border border-slate-200">
                  <Icon size={16} />
                </div>
              </div>
              <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{value}</p>
            </div>
          ))}
        </section>

        {/* --- CONTROL BAR & NOTIFICATIONS --- */}
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2">
                <span className="text-xs font-bold text-slate-500">Service Date:</span>
                <input
                  type="date"
                  value={syncDate}
                  onChange={event => { setSyncDate(event.target.value); setSelectedIds([]); }}
                  className="bg-transparent text-xs font-bold text-slate-900 outline-none"
                />
              </label>

              <button
                disabled={!workerDateMatches || !readyTrips.length || Boolean(busy)}
                onClick={() => runQueue(readyTrips.map(trip => trip.id), 'selected-date')}
                className="rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-purple-500/15 transition hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40"
              >
                {busy === 'selected-date' ? <Loader2 size={15} className="inline animate-spin mr-1" /> : `STAGE SELECTED DATE (${readyTrips.length})`}
              </button>

              <button
                disabled={!settings.enabled || !selectedIds.length || Boolean(busy)}
                onClick={() => runQueue(selectedIds, 'selected')}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
              >
                SYNC SELECTED ({selectedIds.length})
              </button>

              <button
                disabled={!readyTrips.length}
                onClick={() => setSelectedIds(readyTrips.map(trip => trip.id))}
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-40"
              >
                SELECT ALL READY ({readyTrips.length})
              </button>

              {selectedIds.length > 0 && (
                <button
                  onClick={() => setSelectedIds([])}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-700"
                >
                  CLEAR SELECTION
                </button>
              )}

              <button
                disabled={!workerDateMatches || !retryableFailed.length || Boolean(busy)}
                onClick={() => runQueue(retryableFailed.map(log => log.tripId), 'retry')}
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-700 transition hover:bg-amber-100 disabled:opacity-40"
              >
                <RefreshCw size={14} className="mr-1.5 inline" /> RETRY FIXABLE ({retryableFailed.length})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => exportWellTransLogsCSV(logs, syncDate)}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100"
              >
                <Download size={14} className="mr-1.5 inline" /> EXPORT CSV
              </button>
            </div>
          </div>

          {/* Alert notifications */}
          {notice && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
              <AlertTriangle size={16} className="text-amber-500 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {workerUpgradeRequired && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800">
              <AlertTriangle size={16} className="text-rose-500 shrink-0" />
              <span>Worker Upgrade Required: Connected worker is version {worker?.version || 'older'}. Target required version is {requiredWorkerVersion}.</span>
            </div>
          )}

          {workerCalibrated && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
              <ShieldCheck size={16} className="text-emerald-500 shrink-0" />
              <span>Attached Grid: Worker calibrated for live WellTrans date <strong className="text-slate-900">{worker.selectedDate}</strong>.</span>
            </div>
          )}

          {workerCalibrated && !workerDateMatches && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800">
              <AlertTriangle size={16} className="text-rose-500 shrink-0" />
              <span>Date Mismatch: Agape selected date is {syncDate}, but WellTrans worker grid is calibrated to {worker.selectedDate}.</span>
            </div>
          )}

          {unmatchedCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
              <AlertTriangle size={16} className="text-amber-500 shrink-0" />
              <span>{unmatchedCount} trip(s) failed unmatched because the Booking ID does not exist on WellTrans grid for {syncDate}. Excluded from auto-retry.</span>
            </div>
          )}
        </section>

        {/* --- MAIN CONTENT & NAVIGATION TABS --- */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            
            {/* Tab header & filter bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 gap-3">
              <div className="flex items-center gap-2">
                {[
                  { id: 'queue', label: 'Staging Queue', icon: FileText, count: completedTrips.length },
                  { id: 'logs', label: 'Audit Logs', icon: Clock3, count: logs.length },
                  { id: 'settings', label: 'Field Mapping', icon: Settings2 },
                ].map(({ id, label, icon: TabIcon, count }) => (
                  <button
                    key={id}
                    onClick={() => {
                      if (id === 'settings' && !draftSettings) {
                        setDraftSettings({ ...settings, fieldMapping: { ...settings.fieldMapping } });
                      }
                      setTab(id);
                    }}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                      tab === id
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/15'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                    }`}
                  >
                    <TabIcon size={14} />
                    <span>{label}</span>
                    {count !== undefined && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${tab === id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Search & Status Filter pills for Queue tab */}
              {tab === 'queue' && (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search Booking ID, Patient, Driver..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-48 sm:w-64 rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500"
                  >
                    <option value="all">Filter: All Statuses</option>
                    <option value="ready">Ready to Sync</option>
                    <option value="staged">Awaiting Review</option>
                    <option value="completed">Synced / Completed</option>
                    <option value="failed">Failed / Exception</option>
                    <option value="invalid">Validation Error</option>
                  </select>
                </div>
              )}
            </div>

            {/* TAB CONTENTS */}
            {loading ? (
              <div className="p-16 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-500" />
                <p className="mt-3 text-xs font-semibold text-slate-500">Loading WellTrans trip grid...</p>
              </div>
            ) : tab === 'queue' ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[950px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3.5 font-bold">Select</th>
                      <th className="px-4 py-3.5 font-bold">Booking ID</th>
                      <th className="px-4 py-3.5 font-bold">Passenger</th>
                      <th className="px-4 py-3.5 font-bold">Driver / Vehicle</th>
                      <th className="px-4 py-3.5 font-bold">Pickup Activity</th>
                      <th className="px-4 py-3.5 font-bold">Dropoff Activity</th>
                      <th className="px-4 py-3.5 font-bold">Mileage</th>
                      <th className="px-4 py-3.5 font-bold">Validation</th>
                      <th className="px-4 py-3.5 font-bold">Sync Status</th>
                      <th className="px-4 py-3.5 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCompletedTrips.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-12 text-center text-slate-400">
                          No trips match the selected service date or filter options.
                        </td>
                      </tr>
                    ) : (
                      filteredCompletedTrips.map(trip => {
                        const validation = validateTripForWellTrans(trip);
                        const latest = latestByTrip.get(trip.id);
                        const locked = ['pending', 'processing', 'completed', 'awaiting_review'].includes(latest?.status);
                        const unmatchedBooking = latest?.status === 'failed' && !isWellTransFailureRetryable(latest);
                        const payload = validation.payload;

                        return (
                          <tr key={trip.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                disabled={!validation.valid || locked || unmatchedBooking}
                                checked={selectedIds.includes(trip.id)}
                                onChange={() => setSelectedIds(ids => ids.includes(trip.id) ? ids.filter(id => id !== trip.id) : [...ids, trip.id])}
                                className="h-4 w-4 rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-4 py-3 font-mono font-bold text-blue-600">
                              {trip.bookingId || trip.id}
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              {trip.patient || trip.clientName || '—'}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              <div className="font-semibold text-slate-900">{trip.driverName || '—'}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{trip.completedVehicle || trip.vehicle || '—'}</div>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-mono text-slate-700">
                                <Clock3 size={11} className="text-blue-500" />
                                {payload?.pickup?.arrival || 'Missing'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-mono text-slate-700">
                                <Clock3 size={11} className="text-purple-500" />
                                {payload?.dropoff?.arrival || 'Missing'}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-600">
                              {payload?.dropoff?.mileage !== undefined ? (
                                <span className="font-semibold text-emerald-600">{payload.dropoff.mileage} mi</span>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-3">
                              {unmatchedBooking ? (
                                <span className="font-semibold text-amber-600">Booking ID Not Found</span>
                              ) : validation.valid ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                                  <CheckCircle2 size={13} /> Ready
                                </span>
                              ) : (
                                <span title={validation.errors.join(', ')} className="font-semibold text-rose-600">
                                  {validation.errors[0]}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusStyle[latest?.status] || 'bg-slate-100 text-slate-600'}`}>
                                {latest?.status || 'Not Queued'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => setInspectPayloadTrip(trip)}
                                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                                  title="Inspect WellTrans Payload JSON"
                                >
                                  <Code size={12} className="inline mr-1" /> Payload
                                </button>
                                {latest?.status === 'failed' && (
                                  <button
                                    onClick={() => setSelectedFailure(latest)}
                                    className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-bold text-rose-700 hover:bg-rose-100"
                                  >
                                    <Eye size={12} className="inline mr-1" /> Failure
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : tab === 'logs' ? (
              <div className="divide-y divide-slate-100">
                {logs.length ? (
                  logs.map(log => (
                    <div key={log.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 hover:bg-slate-50 transition-colors">
                      <button
                        onClick={() => log.status === 'failed' && setSelectedFailure(log)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase ${statusStyle[log.status] || 'bg-slate-100 text-slate-600'}`}>
                          {log.status}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs font-extrabold text-blue-600">{log.bookingId || log.tripId}</p>
                          <p className="truncate text-xs text-slate-500">{log.errorMessage || log.stage || 'Synchronization completed'}</p>
                        </div>
                        <span className="text-[10px] font-semibold text-slate-400">
                          {displayTime(log.completedAt || log.stagedAt || log.createdAt)}
                        </span>
                        {log.screenshot && <ExternalLink size={14} className="text-slate-400 hover:text-slate-700 shrink-0" />}
                      </button>

                      {log.status === 'awaiting_review' && (
                        <button
                          disabled={busy === log.id}
                          onClick={async () => {
                            if (!window.confirm(`Confirm that you reviewed Booking ${log.bookingId || log.tripId} and clicked Apply in WellTrans?`)) return;
                            setBusy(log.id);
                            try {
                              await confirmWellTransApplied(log.id);
                              setNotice(`Booking ${log.bookingId || log.tripId} confirmed as applied.`);
                            } catch (error) {
                              setNotice(error.message || 'Unable to confirm manual apply.');
                            } finally { setBusy(''); }
                          }}
                          className="shrink-0 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-md transition hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50"
                        >
                          CONFIRM APPLIED
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-16 text-center text-xs font-semibold text-slate-400">
                    No synchronization logs found for service date {syncDate}.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6 p-6">
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Enable Automation Queue</p>
                    <p className="text-xs text-slate-500">When enabled, jobs will automatically process when worker is online.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={effectiveSettings.enabled}
                    onChange={e => setDraftSettings(v => ({ ...v, enabled: e.target.checked }))}
                    className="h-5 w-5 rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600">WellTrans Portal URL</label>
                  <input
                    value={effectiveSettings.portalUrl || ''}
                    onChange={e => setDraftSettings(v => ({ ...v, portalUrl: e.target.value }))}
                    placeholder="https://tripspark.welltransnemt.com/"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-900 outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-600">Agape → WellTrans Field Selector Mapping</p>
                    <button
                      onClick={() => setDraftSettings(v => ({ ...v, fieldMapping: { ...DEFAULT_WELLTRANS_FIELD_MAPPING } }))}
                      className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <RotateCcw size={12} /> Reset Defaults
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {Object.entries(effectiveSettings.fieldMapping || {}).map(([key, value]) => (
                      <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{key}</span>
                        <input
                          value={value}
                          onChange={e => setDraftSettings(curr => ({
                            ...curr,
                            fieldMapping: { ...curr.fieldMapping, [key]: e.target.value },
                          }))}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={async () => {
                    await saveWellTransSettings(effectiveSettings, auth.currentUser?.uid || 'unknown');
                    setDraftSettings(null);
                    setNotice('Settings successfully saved.');
                  }}
                  className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-bold text-white shadow-lg transition hover:bg-blue-500 flex items-center gap-2"
                >
                  <Save size={15} /> SAVE CONFIGURATION
                </button>
              </div>
            )}
          </section>

          {/* --- SIDEBAR: AI SUPERVISOR TELEMETRY --- */}
          <aside className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 border border-purple-200">
                  <Bot size={22} />
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-purple-600">AI Supervisor</p>
                  <h2 className="text-sm font-bold text-slate-900">Diagnostic Insights</h2>
                </div>
              </div>

              {selectedFailure && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-medium leading-relaxed text-slate-700">
                  {explainWellTransFailure(selectedFailure)}
                </div>
              )}

              <p className="mt-3 text-[10px] font-semibold text-slate-400 leading-normal">
                AI diagnostic analyzes snapshot errors and fields. Credentials remain strictly encrypted on worker nodes.
              </p>
            </div>
          </aside>
        </div>

        {/* --- PAYLOAD INSPECTION MODAL --- */}
        {inspectPayloadTrip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div className="flex items-center gap-2">
                  <Code size={18} className="text-blue-500" />
                  <h3 className="text-base font-bold text-slate-900">
                    WellTrans Staging Payload: Booking #{inspectPayloadTrip.bookingId || inspectPayloadTrip.id}
                  </h3>
                </div>
                <button
                  onClick={() => setInspectPayloadTrip(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-4 max-h-[450px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-blue-700">
                <pre>{JSON.stringify(buildWellTransPayload(inspectPayloadTrip), null, 2)}</pre>
              </div>

              <div className="mt-4 flex justify-between items-center">
                <p className="text-[11px] text-slate-500 font-sans">
                  Calculated using configured Agape → WellTrans field mapping.
                </p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(buildWellTransPayload(inspectPayloadTrip), null, 2));
                    setNotice('Payload JSON copied to clipboard.');
                    setInspectPayloadTrip(null);
                  }}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500"
                >
                  Copy JSON Payload
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default WellTransSyncPage;
