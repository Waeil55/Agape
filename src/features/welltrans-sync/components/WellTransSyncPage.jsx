import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, Bot, CheckCircle2, Clock3, Code, Download, ExternalLink, Eye,
  FileText, Loader2, Play, RefreshCw, RotateCcw, Save, Search, Settings2,
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

const AUTHORIZED_ROLES = ['admin', 'superadmin', 'dispatcher', 'manager', 'biller', 'owner'];

const WellTransSyncPage = ({ trips = [], role = 'dispatcher' }) => {
  const [syncDate, setSyncDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const {
    settings, logs, worker, workerOnline, workerCalibrated, workerUpgradeRequired,
    requiredWorkerVersion, workerStandby, loading, completedTrips, readyTrips,
    latestByTrip, healthScore, successfulCount,
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
  const stagedCount = currentLogs.filter(l => l.status === 'awaiting_review').length;
  const failedLogs = currentLogs.filter(l => l.status === 'failed');
  const retryableFailed = failedLogs.filter(isWellTransFailureRetryable);
  const unmatchedCount = failedLogs.length - retryableFailed.length;

  const filteredTrips = useMemo(() => {
    return completedTrips.filter(trip => {
      const q = searchQuery.toLowerCase().trim();
      const bid = (trip.bookingId || trip.id || '').toLowerCase();
      const patient = (trip.patient || trip.clientName || '').toLowerCase();
      const driver = (trip.driverName || '').toLowerCase();
      if (q && !bid.includes(q) && !patient.includes(q) && !driver.includes(q)) return false;
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
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center bg-white rounded-2xl border border-slate-200 p-8 max-w-sm">
          <ShieldCheck className="h-12 w-12 text-rose-400 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-slate-900 mb-1">Access Restricted</h2>
          <p className="text-xs text-slate-500">Your role (<span className="font-mono text-rose-500">{role}</span>) does not have permission for WellTrans.</p>
        </div>
      </div>
    );
  }

  const runQueue = async (ids, mode) => {
    if (!ids.length) return setNotice('No eligible trips selected.');
    setBusy(mode); setNotice('');
    try {
      const result = await queueWellTransSync(ids, mode, syncDate);
      setNotice(`${result.data.queued} trip${result.data.queued === 1 ? '' : 's'} queued. ${result.data.rejected || 0} rejected.`);
      setSelectedIds([]);
    } catch (e) { setNotice(e.message || 'Unable to create queue.'); }
    finally { setBusy(''); }
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-blue-500" />
              <h1 className="text-base font-semibold text-slate-900">WellTrans Automation Center</h1>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Broker sync staging · field mapping · worker telemetry</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => { window.location.href = 'agape-welltrans://start'; }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-[11px] font-semibold text-white hover:bg-blue-700 transition"
            >
              <Play size={13} className="fill-current" /> Start Worker
            </button>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${settings.enabled && workerOnline ? 'bg-emerald-400 opacity-75' : 'bg-amber-400 opacity-75'}`} />
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${settings.enabled && workerOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              </span>
              <span className="text-[11px] font-semibold text-slate-600">
                {!settings.enabled ? 'Disabled' : workerOnline ? 'Online' : workerStandby ? 'Standby' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="shrink-0 border-b border-slate-100 bg-white px-4 py-2.5">
        <div className="flex items-center gap-4 overflow-x-auto">
          {[
            { label: 'Total', value: completedTrips.length, color: 'text-slate-900' },
            { label: 'Ready', value: readyTrips.length, color: 'text-blue-600' },
            { label: 'Synced', value: successfulCount, color: 'text-emerald-600' },
            { label: 'Review', value: stagedCount, color: 'text-purple-600' },
            { label: 'Failed', value: failedLogs.length, color: 'text-rose-600' },
            { label: 'Health', value: `${healthScore}%`, color: 'text-amber-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-1.5 shrink-0">
              <span className={`text-sm font-bold ${color}`}>{value}</span>
              <span className="text-[10px] font-medium text-slate-400">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Notifications */}
      {notice && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs font-medium text-amber-800">
          <AlertTriangle size={14} className="shrink-0" />
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice('')} className="text-amber-500 hover:text-amber-700"><X size={14} /></button>
        </div>
      )}

      {/* Control bar */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
            <span className="text-[11px] font-semibold text-slate-500">Date:</span>
            <input
              type="date"
              value={syncDate}
              onChange={e => { setSyncDate(e.target.value); setSelectedIds([]); }}
              className="bg-transparent text-[11px] font-semibold text-slate-900 outline-none w-[110px]"
            />
          </label>
          <button
            disabled={!workerDateMatches || !readyTrips.length || Boolean(busy)}
            onClick={() => runQueue(readyTrips.map(t => t.id), 'selected-date')}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition"
          >
            {busy === 'selected-date' ? <Loader2 size={12} className="inline animate-spin mr-1" /> : null}
            Stage Date ({readyTrips.length})
          </button>
          <button
            disabled={!settings.enabled || !selectedIds.length || Boolean(busy)}
            onClick={() => runQueue(selectedIds, 'selected')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
          >
            Sync Selected ({selectedIds.length})
          </button>
          <button
            disabled={!readyTrips.length}
            onClick={() => setSelectedIds(readyTrips.map(t => t.id))}
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40 transition"
          >
            Select All Ready
          </button>
          {selectedIds.length > 0 && (
            <button onClick={() => setSelectedIds([])} className="rounded-lg text-[11px] font-semibold text-slate-400 hover:text-slate-600 px-2 py-1.5">
              Clear
            </button>
          )}
          <button
            disabled={!workerDateMatches || !retryableFailed.length || Boolean(busy)}
            onClick={() => runQueue(retryableFailed.map(l => l.tripId), 'retry')}
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-40 transition"
          >
            <RefreshCw size={12} className="inline mr-1" /> Retry ({retryableFailed.length})
          </button>
          <button
            onClick={() => exportWellTransLogsCSV(logs, syncDate)}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition"
          >
            <Download size={12} className="inline mr-1" /> CSV
          </button>
        </div>
      </div>

      {/* Worker warnings */}
      {(workerUpgradeRequired || (workerCalibrated && !workerDateMatches) || unmatchedCount > 0) && (
        <div className="shrink-0 border-b border-slate-100 bg-white px-4 py-2 space-y-1.5">
          {workerUpgradeRequired && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-1.5 text-[11px] font-medium text-rose-700">
              <AlertTriangle size={13} /> Worker upgrade required (v{worker?.version || '?'} → v{requiredWorkerVersion})
            </div>
          )}
          {workerCalibrated && !workerDateMatches && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-1.5 text-[11px] font-medium text-rose-700">
              <AlertTriangle size={13} /> Date mismatch: Agape {syncDate} vs Worker {worker.selectedDate}
            </div>
          )}
          {unmatchedCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-[11px] font-medium text-amber-700">
              <AlertTriangle size={13} /> {unmatchedCount} trip(s) with unmatched Booking IDs
            </div>
          )}
        </div>
      )}

      {/* Tabs + content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {/* Tab bar */}
        <div className="shrink-0 flex items-center gap-1 border-b border-slate-200 bg-white px-4 py-1.5">
          {[
            { id: 'queue', label: 'Queue', count: completedTrips.length },
            { id: 'logs', label: 'Logs', count: logs.length },
            { id: 'settings', label: 'Settings' },
          ].map(({ id, label, count }) => (
            <button
              key={id}
              onClick={() => {
                if (id === 'settings' && !draftSettings) setDraftSettings({ ...settings, fieldMapping: { ...settings.fieldMapping } });
                setTab(id);
              }}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                tab === id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {label}{count !== undefined ? ` (${count})` : ''}
            </button>
          ))}
          {/* Search for queue tab */}
          {tab === 'queue' && (
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-40 rounded-lg border border-slate-200 bg-white pl-7 pr-2 py-1.5 text-[11px] text-slate-900 placeholder-slate-400 outline-none focus:border-blue-400"
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 outline-none"
              >
                <option value="all">All</option>
                <option value="ready">Ready</option>
                <option value="staged">Review</option>
                <option value="completed">Synced</option>
                <option value="failed">Failed</option>
                <option value="invalid">Invalid</option>
              </select>
            </div>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : tab === 'queue' ? (
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 font-semibold text-slate-500"><input type="checkbox" className="rounded border-slate-300" onChange={() => {
                    const allIds = filteredTrips.map(t => t.id);
                    setSelectedIds(ids => ids.length === allIds.length ? [] : allIds);
                  }} checked={selectedIds.length === filteredTrips.length && filteredTrips.length > 0} /></th>
                  <th className="px-3 py-2 font-semibold text-slate-500">Booking</th>
                  <th className="px-3 py-2 font-semibold text-slate-500">Passenger</th>
                  <th className="px-3 py-2 font-semibold text-slate-500">Driver</th>
                  <th className="px-3 py-2 font-semibold text-slate-500">Pickup</th>
                  <th className="px-3 py-2 font-semibold text-slate-500">Dropoff</th>
                  <th className="px-3 py-2 font-semibold text-slate-500">Miles</th>
                  <th className="px-3 py-2 font-semibold text-slate-500">Status</th>
                  <th className="px-3 py-2 font-semibold text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTrips.length === 0 ? (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-xs text-slate-400">No trips for this date.</td></tr>
                ) : filteredTrips.map(trip => {
                  const validation = validateTripForWellTrans(trip);
                  const latest = latestByTrip.get(trip.id);
                  const locked = ['pending', 'processing', 'completed', 'awaiting_review'].includes(latest?.status);
                  const unmatched = latest?.status === 'failed' && !isWellTransFailureRetryable(latest);
                  const payload = validation.payload;
                  return (
                    <tr key={trip.id} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          disabled={!validation.valid || locked || unmatched}
                          checked={selectedIds.includes(trip.id)}
                          onChange={() => setSelectedIds(ids => ids.includes(trip.id) ? ids.filter(id => id !== trip.id) : [...ids, trip.id])}
                          className="rounded border-slate-300"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold text-blue-600">{trip.bookingId || trip.id}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{trip.patient || trip.clientName || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{trip.driverName || '—'}</td>
                      <td className="px-3 py-2 text-slate-600 font-mono">{payload?.pickup?.arrival || '—'}</td>
                      <td className="px-3 py-2 text-slate-600 font-mono">{payload?.dropoff?.arrival || '—'}</td>
                      <td className="px-3 py-2 font-mono">{payload?.dropoff?.mileage != null ? <span className="text-emerald-600 font-semibold">{payload.dropoff.mileage}</span> : '—'}</td>
                      <td className="px-3 py-2">
                        {unmatched ? (
                          <span className="text-[10px] font-semibold text-amber-600">Not Found</span>
                        ) : validation.valid ? (
                          <span className="text-[10px] font-semibold text-emerald-600">Ready</span>
                        ) : (
                          <span className="text-[10px] font-semibold text-rose-600">{validation.errors[0]}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${statusStyle[latest?.status] || 'bg-slate-100 text-slate-500'}`}>
                            {latest?.status || '—'}
                          </span>
                          <button onClick={() => setInspectPayloadTrip(trip)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition" title="Inspect payload">
                            <Code size={13} />
                          </button>
                          {latest?.status === 'failed' && (
                            <button onClick={() => setSelectedFailure(latest)} className="rounded p-1 text-rose-400 hover:bg-rose-50 transition" title="View failure">
                              <Eye size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : tab === 'logs' ? (
          <div className="flex-1 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-400">No logs for {syncDate}.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {logs.map(log => (
                  <div key={log.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase shrink-0 ${statusStyle[log.status] || 'bg-slate-100 text-slate-500'}`}>
                      {log.status}
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-blue-600 shrink-0">{log.bookingId || log.tripId}</span>
                    <span className="flex-1 text-[11px] text-slate-500 truncate">{log.errorMessage || log.stage || 'Completed'}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">{new Date(log.completedAt || log.stagedAt || log.createdAt).toLocaleString()}</span>
                    {log.status === 'awaiting_review' && (
                      <button
                        disabled={busy === log.id}
                        onClick={async () => {
                          if (!window.confirm(`Confirm Booking ${log.bookingId || log.tripId} applied in WellTrans?`)) return;
                          setBusy(log.id);
                          try { await confirmWellTransApplied(log.id); setNotice(`Booking ${log.bookingId || log.tripId} confirmed.`); }
                          catch (e) { setNotice(e.message || 'Failed.'); }
                          finally { setBusy(''); }
                        }}
                        className="rounded-lg bg-purple-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-purple-700 disabled:opacity-50 transition shrink-0"
                      >
                        Confirm
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Settings tab */
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
              <div>
                <p className="text-xs font-semibold text-slate-900">Enable Automation Queue</p>
                <p className="text-[11px] text-slate-500">Auto-process jobs when worker is online</p>
              </div>
              <input
                type="checkbox"
                checked={effectiveSettings.enabled}
                onChange={e => setDraftSettings(v => ({ ...v, enabled: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600">Portal URL</label>
              <input
                value={effectiveSettings.portalUrl || ''}
                onChange={e => setDraftSettings(v => ({ ...v, portalUrl: e.target.value }))}
                placeholder="https://tripspark.welltransnemt.com/"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-semibold text-slate-600">Field Mapping</label>
                <button onClick={() => setDraftSettings(v => ({ ...v, fieldMapping: { ...DEFAULT_WELLTRANS_FIELD_MAPPING } }))} className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1">
                  <RotateCcw size={11} /> Reset
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(effectiveSettings.fieldMapping || {}).map(([key, value]) => (
                  <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <span className="text-[10px] font-semibold uppercase text-slate-500">{key}</span>
                    <input
                      value={value}
                      onChange={e => setDraftSettings(curr => ({ ...curr, fieldMapping: { ...curr.fieldMapping, [key]: e.target.value } }))}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-900 outline-none focus:border-blue-400"
                    />
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={async () => {
                await saveWellTransSettings(effectiveSettings, auth.currentUser?.uid || 'unknown');
                setDraftSettings(null);
                setNotice('Settings saved.');
              }}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 transition flex items-center gap-1.5"
            >
              <Save size={14} /> Save Configuration
            </button>
          </div>
        )}
      </div>

      {/* AI Supervisor — only when failure selected */}
      {selectedFailure && (
        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-200">
              <Bot size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-bold text-purple-600 uppercase">AI Diagnostic</p>
                <button onClick={() => setSelectedFailure(null)} className="text-slate-400 hover:text-slate-600"><X size={13} /></button>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">{explainWellTransFailure(selectedFailure)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Payload modal */}
      {inspectPayloadTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <div className="flex items-center gap-2 min-w-0">
                <Code size={16} className="text-blue-500 shrink-0" />
                <span className="text-sm font-semibold text-slate-900 truncate">Payload: #{inspectPayloadTrip.bookingId || inspectPayloadTrip.id}</span>
              </div>
              <button onClick={() => setInspectPayloadTrip(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="p-4 max-h-[400px] overflow-y-auto bg-slate-50 rounded-xl mx-4 my-3 border border-slate-200">
              <pre className="text-[11px] font-mono text-blue-700 whitespace-pre-wrap">{JSON.stringify(buildWellTransPayload(inspectPayloadTrip), null, 2)}</pre>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 pb-3">
              <button
                onClick={() => { navigator.clipboard.writeText(JSON.stringify(buildWellTransPayload(inspectPayloadTrip), null, 2)); setNotice('Copied.'); setInspectPayloadTrip(null); }}
                className="rounded-xl bg-blue-600 px-4 py-2 text-[11px] font-semibold text-white hover:bg-blue-700 transition"
              >
                Copy JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WellTransSyncPage;
