import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertTriangle, Bot, CheckCircle2, Code, Download, Eye,
  Loader2, Play, RefreshCw, RotateCcw, Save, Search,
  ShieldCheck, Sparkles, X, XCircle, ChevronLeft, ChevronRight, Image, Copy,
  BarChart3, Zap, ListFilter, Activity,
} from 'lucide-react';
import { auth } from '../../../config/firebase';
import { useWellTransSync } from '../hooks/useWellTransSync';
import { useWellTransAutoSync } from '../hooks/useWellTransAutoSync';
import {
  confirmWellTransReviewBatchApplied,
  explainWellTransFailure, explainWellTransFailureAI, exportWellTransLogsCSV,
  isWellTransFailureRetryable, queueWellTransSync, saveWellTransSettings,
  categorizeFailure, FAILURE_CATEGORIES,
} from '../services/welltransService';
import {
  buildWellTransPayload, DEFAULT_WELLTRANS_FIELD_MAPPING, validateTripForWellTrans,
} from '../utils/welltransMapping';
import { pageWellTransRows, WELLTRANS_TABLE_PAGE_SIZE } from '../utils/welltransScale';

const statusStyle = {
  pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  processing: 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse',
  awaiting_review: 'bg-purple-50 text-purple-700 border border-purple-200',
  completed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  failed: 'bg-rose-50 text-rose-700 border border-rose-200',
};

const AUTHORIZED_ROLES = ['admin', 'superadmin', 'dispatcher', 'manager', 'biller', 'owner'];
const TABLE_PAGE_SIZE = WELLTRANS_TABLE_PAGE_SIZE;

const WellTransSyncPage = ({ trips = [], role = 'dispatcher' }) => {
  const [syncDate, setSyncDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const {
    settings, logs, worker, workers, activeWorkers, standbyWorkers, operations, canary, manifest, coverage,
    workerOnline, workerCalibrated, workerUpgradeRequired,
    requiredWorkerVersion, workerStandby, loading, completedTrips, readyTrips,
    latestByTrip, healthScore, successfulCount,
  } = useWellTransSync(trips, syncDate);

  const [selectedIds, setSelectedIds] = useState([]);
  const [tab, setTab] = useState('queue');
  const [draftSettings, setDraftSettings] = useState(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedFailure, setSelectedFailure] = useState(null);
  const [aiDiagnostic, setAiDiagnostic] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [inspectPayloadTrip, setInspectPayloadTrip] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [syncProgress, setSyncProgress] = useState(null);
  const [tripDrawer, setTripDrawer] = useState(null);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [queuePage, setQueuePage] = useState(0);
  const [logsPage, setLogsPage] = useState(0);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [agentRelease, setAgentRelease] = useState(null);
  const [autoRetry, setAutoRetry] = useState(() => {
    try { return JSON.parse(localStorage.getItem('agape_wt_autoRetry') || '{}'); } catch { return {}; }
  });
  const bulkMenuRef = useRef(null);
  const pageRef = useRef(null);

  useEffect(() => {
    let active = true;
    fetch('/welltrans-agent/version.json', { cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error(`Agent manifest returned ${response.status}`);
        return response.json();
      })
      .then(release => { if (active) setAgentRelease(release); })
      .catch(() => { if (active) setAgentRelease(null); });
    return () => { active = false; };
  }, []);

  const normalizedRole = String(role || '').toLowerCase().trim();
  const isAuthorized = AUTHORIZED_ROLES.includes(normalizedRole);
  const effectiveSettings = draftSettings || settings;
  const workerDateMatches = Boolean(workerCalibrated && worker?.selectedDate === syncDate);
  const workerNeedsLogin = worker?.state === 'waiting_for_login';
  const workerConnecting = worker?.state === 'connecting';
  const workerNeedsDate = worker?.state === 'date_selection_required';
  const workerReviewError = worker?.state === 'review_error';
  const workerReconciliationBlocked = [
    'reconciliation_blocked',
    'reconciliation_blocked_do_not_apply',
  ].includes(worker?.state);
  const workerBatchReady = [
    'review_batch_ready',
    'review_ready',
    'review_batch_verified',
    'review_ready_verified',
  ].includes(worker?.state);
  const workerStatusLabel = !settings.enabled
    ? 'Disabled'
    : workerReviewError
      ? 'Safety stop — discard review'
    : workerReconciliationBlocked
      ? 'Incomplete date — action required'
    : workerBatchReady
      ? `${worker?.reviewBatchStaged || 0} ready for Apply`
    : worker?.state === 'indexing_schedule'
      ? 'Indexing schedule for turbo fill'
    : worker?.state === 'running_portal_canary'
      ? 'Verifying portal contract'
    : worker?.state === 'verifying_applied_records'
      ? 'Verifying applied records'
    : worker?.state === 'staging'
      ? 'Filling WellTrans'
    : workerNeedsLogin
      ? 'Sign-in required'
      : workerNeedsDate
        ? `Select ${worker?.requestedDate || syncDate} in WellTrans`
      : workerConnecting
        ? 'Starting agent'
        : workerOnline
          ? 'Online'
          : workerStandby
            ? 'Standby'
            : 'Offline';
  const workerHealthy = settings.enabled && workerOnline
    && !workerNeedsLogin && !workerNeedsDate && !workerConnecting
    && !workerReviewError && !workerReconciliationBlocked;
  const canaryHealthy = canary?.passed === true
    && (!canary?.serviceDate || canary.serviceDate === syncDate);
  const currentLogs = useMemo(() => [...latestByTrip.values()], [latestByTrip]);
  const stagedCount = currentLogs.filter(l =>
    l.status === 'awaiting_review'
    && (!worker?.reviewSessionId || l.reviewSessionId === worker.reviewSessionId)).length;
  const failedLogs = currentLogs.filter(l => l.status === 'failed');
  const retryableFailed = failedLogs.filter(isWellTransFailureRetryable);
  const unmatchedCount = failedLogs.length - retryableFailed.length;

  const { autoLog } = useWellTransAutoSync({
    settings: effectiveSettings, worker, readyTrips, retryableFailed,
    retryCategories: autoRetry, syncDate, busy, workerDateMatches,
  });

  const enrichedTrips = useMemo(() => {
    return completedTrips.map(trip => {
      const validation = validateTripForWellTrans(trip);
      let payload = null;
      try { payload = buildWellTransPayload(trip); } catch {}
      return { ...trip, _valid: validation.valid, _errors: validation.errors, _payload: payload };
    });
  }, [completedTrips]);

  const filteredTrips = useMemo(() => {
    return enrichedTrips.filter(trip => {
      const q = searchQuery.toLowerCase().trim();
      const bid = (trip.bookingId || trip.id || '').toLowerCase();
      const patient = (trip.patient || trip.clientName || '').toLowerCase();
      const driver = (trip.driverName || '').toLowerCase();
      if (q && !bid.includes(q) && !patient.includes(q) && !driver.includes(q)) return false;
      if (statusFilter === 'all') return true;
      const latest = latestByTrip.get(trip.id);
      if (statusFilter === 'ready') return trip._valid && !latest;
      if (statusFilter === 'staged') return latest?.status === 'awaiting_review';
      if (statusFilter === 'completed') return latest?.status === 'completed';
      if (statusFilter === 'failed') return latest?.status === 'failed';
      if (statusFilter === 'invalid') return !trip._valid;
      return true;
    });
  }, [enrichedTrips, searchQuery, statusFilter, latestByTrip]);
  const queuePageCount = Math.max(1, Math.ceil(filteredTrips.length / TABLE_PAGE_SIZE));
  const displayedTrips = useMemo(
    () => pageWellTransRows(filteredTrips, queuePage),
    [filteredTrips, queuePage],
  );
  const logsPageCount = Math.max(1, Math.ceil(logs.length / TABLE_PAGE_SIZE));
  const displayedLogs = useMemo(
    () => pageWellTransRows(logs, logsPage),
    [logs, logsPage],
  );
  useEffect(() => { setQueuePage(0); }, [searchQuery, statusFilter, syncDate]);
  useEffect(() => {
    if (queuePage >= queuePageCount) setQueuePage(queuePageCount - 1);
  }, [queuePage, queuePageCount]);
  useEffect(() => {
    if (logsPage >= logsPageCount) setLogsPage(logsPageCount - 1);
  }, [logsPage, logsPageCount]);

  const workerActivity = useMemo(() => {
    return currentLogs
      .filter(l => l.status === 'processing' || l.status === 'pending')
      .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0))
      .slice(0, 10);
  }, [currentLogs]);

  const runQueue = useCallback(async (ids, mode) => {
    if (!ids.length) return setNotice('No eligible trips selected.');
    setBusy(mode); setNotice(''); setSyncProgress({ done: 0, total: ids.length });
    try {
      const result = await queueWellTransSync(ids, mode, syncDate);
      setNotice(`${result.data.queued} trip${result.data.queued === 1 ? '' : 's'} queued. ${result.data.rejected || 0} rejected.`);
      setSyncProgress({ done: result.data.queued + (result.data.rejected || 0), total: ids.length });
      setSelectedIds([]);
      setTimeout(() => setSyncProgress(null), 5000);
    } catch (e) { setNotice(e.message || 'Unable to create queue.'); setSyncProgress(null); }
    finally { setBusy(''); }
  }, [syncDate]);

  const startAndFillDate = useCallback(async () => {
    if (!settings.enabled || busy) return;
    setBusy('start-fill');
    setNotice('');
    window.location.href = `agape-welltrans://start?date=${encodeURIComponent(syncDate)}`;
    if (!completedTrips.length) {
      setNotice(`Agent start requested for ${syncDate}. Agape has no completed trips for this date.`);
      setBusy('');
      return;
    }
    setSyncProgress({ done: 0, total: completedTrips.length });
    try {
      // Full-date mode is reconciled again by the trusted backend. Passing the
      // complete client set is a second independent guard against UI filters
      // silently omitting an invalid, failed, or never-queued completed trip.
      const result = await queueWellTransSync(
        completedTrips.map(trip => trip.id),
        'full-date',
        syncDate,
      );
      setSyncProgress({
        done: result.data.orchestrated
          || result.data.queued + (result.data.rejected || 0),
        total: result.data.expected || completedTrips.length,
      });
      setNotice(result.data.orchestrated != null
        ? `Durable reconciliation dispatched for ${syncDate}: ${result.data.orchestrated} completed trips across ${result.data.shardCount || 0} recoverable task shard(s).`
        : `Full-date reconciliation requested for ${syncDate}: ${result.data.expected || completedTrips.length} completed, `
          + `${result.data.queued} queued, ${result.data.covered || 0} already covered, `
          + `${result.data.rejected || 0} blocked for correction.`);
      setSelectedIds([]);
      setTimeout(() => setSyncProgress(null), 5000);
    } catch (error) {
      setNotice(error.message || 'The agent was requested, but trips could not be queued.');
      setSyncProgress(null);
    } finally {
      setBusy('');
    }
  }, [busy, completedTrips, settings.enabled, syncDate]);

  const confirmReviewBatchApplied = useCallback(async () => {
    if (!workerBatchReady || !worker?.reviewSessionId || !stagedCount) {
      setNotice('No live WellTrans review batch is ready for Apply confirmation.');
      return;
    }
    if (!window.confirm(
      `Confirm that you reviewed all ${stagedCount} staged trips and clicked Apply in WellTrans for ${syncDate}? `
      + 'The agent will read every field back before starting the next batch.',
    )) return;
    setBusy('confirm-batch');
    try {
      const result = await confirmWellTransReviewBatchApplied(
        syncDate,
        worker.reviewSessionId,
      );
      setNotice(
        `${result.data.confirmed} trips marked Applied. Live WellTrans verification is running before the next batch.`,
      );
    } catch (error) {
      setNotice(error.message || 'The review batch could not be confirmed.');
    } finally {
      setBusy('');
    }
  }, [stagedCount, syncDate, worker, workerBatchReady]);

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedIds(filteredTrips.map(t => t.id));
      }
      if (e.key === 'Escape') {
        setSelectedIds([]);
        setTripDrawer(null);
        setSelectedFailure(null);
        setInspectPayloadTrip(null);
        setBulkMenuOpen(false);
      }
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
        if (workerDateMatches && retryableFailed.length && !busy) {
          runQueue(retryableFailed.map(l => l.tripId), 'retry');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filteredTrips, workerDateMatches, retryableFailed, busy, runQueue]);

  useEffect(() => {
    const handleClick = (e) => {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(e.target)) setBulkMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    localStorage.setItem('agape_wt_autoRetry', JSON.stringify(autoRetry));
  }, [autoRetry]);

  if (!isAuthorized) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center bg-white rounded-2xl border border-slate-200 p-8 max-w-sm">
          <ShieldCheck className="h-12 w-12 text-rose-400 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-slate-900 mb-1">Access Restricted</h2>
          <p className="text-xs text-slate-500">Your role (<span className="font-mono text-rose-500">{role}</span>) does not have permission.</p>
        </div>
      </div>
    );
  }

  const handleBulkSelect = (type) => {
    setBulkMenuOpen(false);
    if (type === 'failed') setSelectedIds(failedLogs.map(l => l.tripId).filter(id => enrichedTrips.some(t => t.id === id)));
    else if (type === 'invalid') setSelectedIds(enrichedTrips.filter(t => !t._valid).map(t => t.id));
    else if (type === 'retryable') setSelectedIds(retryableFailed.map(l => l.tripId).filter(id => enrichedTrips.some(t => t.id === id)));
    else if (type === 'ready') setSelectedIds(readyTrips.map(t => t.id));
    else if (type === 'invert') setSelectedIds(ids => filteredTrips.map(t => t.id).filter(id => !ids.includes(id)));
    else if (type === 'none') setSelectedIds([]);
  };

  const navigateDate = (offset) => {
    const d = new Date(syncDate + 'T12:00:00');
    d.setDate(d.getDate() + offset);
    setSyncDate(d.toISOString().slice(0, 10));
    setSelectedIds([]);
  };

  const toggleAutoRetry = (category) => {
    setAutoRetry(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const exportAllTripsCSV = () => {
    const headers = ['Booking ID', 'Passenger', 'Driver', 'Pickup Time', 'Dropoff Time', 'Mileage', 'Validation', 'Sync Status', 'Error'];
    const rows = enrichedTrips.map(trip => {
      const log = latestByTrip.get(trip.id);
      return [
        `"${trip.bookingId || trip.id || ''}"`,
        `"${(trip.patient || trip.clientName || '').replace(/"/g, '""')}"`,
        `"${(trip.driverName || '').replace(/"/g, '""')}"`,
        `"${trip._payload?.pickup?.arrival || ''}"`,
        `"${trip._payload?.dropoff?.arrival || ''}"`,
        `"${trip._payload?.dropoff?.mileage ?? ''}"`,
        `"${trip._valid ? 'Valid' : (trip._errors || []).join('; ')}"`,
        `"${log?.status || 'Not Queued'}"`,
        `"${(log?.errorMessage || '').replace(/"/g, '""')}"`,
      ];
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `WellTrans_Queue_${syncDate}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div ref={pageRef} className="flex flex-col h-full min-h-0 overflow-hidden" tabIndex={-1}>
      {/* Header */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-blue-500" />
              <h1 className="text-base font-semibold text-slate-900">WellTrans Automation Center</h1>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Broker sync · field mapping · worker telemetry</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href="/welltrans-agent/agape-welltrans-agent.zip"
              download
              onClick={() => setShowInstallHelp(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[11px] font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
            >
              <Download size={13} /> Download Agent ZIP
            </a>
            <button
              type="button"
              onClick={() => setShowInstallHelp(true)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-semibold text-slate-500 transition hover:border-blue-300 hover:text-blue-700"
            >
              Windows install help
            </button>
            <button
              onClick={startAndFillDate}
              disabled={!settings.enabled || Boolean(busy)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-[11px] font-semibold text-white hover:bg-blue-700 transition"
            >
              <Play size={13} className="fill-current" /> Reconcile & Fill {syncDate}
            </button>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${workerHealthy ? 'bg-emerald-400 opacity-75' : 'bg-amber-400 opacity-75'}`} />
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${workerHealthy ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              </span>
              <span className="text-[11px] font-semibold text-slate-600">
                {workerStatusLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sync progress bar */}
      {syncProgress && (
        <div className="shrink-0 border-b border-blue-200 bg-blue-50 px-4 py-2">
          <div className="flex items-center gap-3">
            <Loader2 size={14} className="animate-spin text-blue-600 shrink-0" />
            <div className="flex-1">
              <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (syncProgress.done / syncProgress.total) * 100)}%` }} />
              </div>
            </div>
            <span className="text-[11px] font-semibold text-blue-700 shrink-0">{syncProgress.done}/{syncProgress.total}</span>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="shrink-0 border-b border-slate-100 bg-white px-4 py-2.5">
        <div className="flex items-center gap-4 overflow-x-auto">
          {[
            { label: 'Total', value: completedTrips.length, color: 'text-slate-900' },
            { label: 'Verified', value: coverage.verified, color: 'text-blue-600' },
            { label: 'Synced', value: successfulCount, color: 'text-emerald-600' },
            { label: 'Review', value: stagedCount, color: 'text-purple-600' },
            { label: 'Failed', value: failedLogs.length, color: 'text-rose-600' },
            { label: 'Missing', value: coverage.missingCount, color: coverage.missingCount ? 'text-rose-600' : 'text-emerald-600' },
            { label: 'Blocked', value: coverage.blockedCount, color: coverage.blockedCount ? 'text-rose-600' : 'text-emerald-600' },
            { label: 'Coverage', value: `${healthScore}%`, color: coverage.coverageComplete ? 'text-emerald-600' : 'text-amber-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-1.5 shrink-0">
              <span className={`text-sm font-bold ${color}`}>{value}</span>
              <span className="text-[10px] font-medium text-slate-400">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Multi-agent operations strip */}
      <div className="shrink-0 border-b border-slate-100 bg-slate-50/80 px-4 py-2">
        <div className="flex items-center gap-3 overflow-x-auto">
          <div className="flex shrink-0 items-center gap-2 pr-2">
            <Activity size={13} className="text-slate-500" />
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Agent fleet</span>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
              activeWorkers.length ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
            }`}>
              {activeWorkers.length} online
            </span>
            {standbyWorkers.length > 0 && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-bold text-blue-700">
                {standbyWorkers.length} standby
              </span>
            )}
            {activeWorkers.length > 1 && (
              <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[9px] font-bold text-cyan-700">
                Failover ready
              </span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
              canaryHealthy ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
            }`}>
              Portal contract {canaryHealthy ? 'verified' : 'not verified'}
            </span>
          </div>
          {workers.length ? workers.slice(0, 6).map(item => {
            const ageLabel = Number.isFinite(item.ageMs)
              ? item.ageMs < 60_000
                ? `${Math.max(0, Math.round(item.ageMs / 1000))}s ago`
                : `${Math.round(item.ageMs / 60_000)}m ago`
              : 'never';
            return (
              <div key={item.id}
                className={`flex shrink-0 items-center gap-2 rounded-lg border bg-white px-2.5 py-1 ${
                  item.online ? 'border-emerald-200' : 'border-slate-200 opacity-60'
                }`}>
                <span className={`h-2 w-2 rounded-full ${item.online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <div className="leading-tight">
                  <p className="max-w-[140px] truncate text-[10px] font-bold text-slate-700">
                    {item.workerId || item.id}
                  </p>
                  <p className="text-[9px] text-slate-400">
                    v{item.version || '?'} · {String(item.state || 'unknown').replaceAll('_', ' ')}
                    {item.selectedDate ? ` · ${item.selectedDate}` : ''} · {ageLabel}
                  </p>
                </div>
              </div>
            );
          }) : (
            <span className="text-[10px] font-medium text-slate-400">No enrolled Agent heartbeat has been received.</span>
          )}
        </div>
      </div>

      {/* Notifications */}
      {operations && ['critical', 'degraded'].includes(operations.state) && (
        <div className={`shrink-0 flex items-center gap-2 border-b px-4 py-2 text-xs font-semibold ${
          operations.state === 'critical'
            ? 'border-rose-200 bg-rose-50 text-rose-800'
            : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}>
          <AlertTriangle size={14} className="shrink-0" />
          <span>
            Operations {operations.state}: {operations.activeWorkerCount || 0} active agents,
            {' '}{operations.staleProcessingCount || 0} stuck jobs,
            {' '}{operations.blockedDateCount || 0} blocked dates
            {operations.canaryPassed === false ? ', portal contract failed.' : '.'}
          </span>
        </div>
      )}
      {agentRelease?.signed === false && (
        <div className="shrink-0 flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] font-semibold text-amber-800">
          <ShieldCheck size={13} className="shrink-0" />
          The current Agent package is integrity-checked but not Authenticode-signed. Organization-managed Windows computers may require a trusted publisher certificate.
        </div>
      )}
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
          <div className="flex items-center gap-1">
            <button onClick={() => navigateDate(-1)} className="p-1 rounded hover:bg-slate-100 text-slate-500"><ChevronLeft size={16} /></button>
            <label className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
              <input type="date" value={syncDate} onChange={e => { setSyncDate(e.target.value); setSelectedIds([]); }}
                className="bg-transparent text-[11px] font-semibold text-slate-900 outline-none w-[110px]" />
            </label>
            <button onClick={() => navigateDate(1)} className="p-1 rounded hover:bg-slate-100 text-slate-500"><ChevronRight size={16} /></button>
          </div>
          <button disabled={!settings.enabled || Boolean(busy)}
            onClick={startAndFillDate}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition">
            {busy === 'start-fill' ? <Loader2 size={12} className="inline animate-spin mr-1" /> : null}
            Reconcile & Fill Date ({completedTrips.length})
          </button>
          <button disabled={!workerBatchReady || !stagedCount || Boolean(busy)}
            onClick={confirmReviewBatchApplied}
            className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-[11px] font-semibold text-purple-700 hover:bg-purple-100 disabled:opacity-40 transition">
            <CheckCircle2 size={12} className="inline mr-1" />
            I Applied Current Batch ({stagedCount})
          </button>
          <button disabled={!settings.enabled || !selectedIds.length || Boolean(busy)}
            onClick={() => runQueue(selectedIds, 'selected')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition">
            Sync Selected ({selectedIds.length})
          </button>

          {/* Bulk select dropdown */}
          <div className="relative" ref={bulkMenuRef}>
            <button onClick={() => setBulkMenuOpen(o => !o)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 transition flex items-center gap-1">
              <ListFilter size={12} /> Bulk <span className="text-[9px]">▾</span>
            </button>
            {bulkMenuOpen && (
              <div className="absolute top-full left-0 mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1">
                <button onClick={() => handleBulkSelect('ready')} className="w-full text-left px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50">Select All Ready ({readyTrips.length})</button>
                <button onClick={() => handleBulkSelect('failed')} className="w-full text-left px-3 py-1.5 text-[11px] font-medium text-rose-600 hover:bg-rose-50">Select All Failed ({failedLogs.length})</button>
                <button onClick={() => handleBulkSelect('retryable')} className="w-full text-left px-3 py-1.5 text-[11px] font-medium text-amber-600 hover:bg-amber-50">Select All Retryable ({retryableFailed.length})</button>
                <button onClick={() => handleBulkSelect('invalid')} className="w-full text-left px-3 py-1.5 text-[11px] font-medium text-orange-600 hover:bg-orange-50">Select All Invalid</button>
                <div className="border-t border-slate-100 my-1" />
                <button onClick={() => handleBulkSelect('invert')} className="w-full text-left px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50">Invert Selection</button>
                <button onClick={() => handleBulkSelect('none')} className="w-full text-left px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50">Clear Selection</button>
              </div>
            )}
          </div>

          <button disabled={!workerDateMatches || !retryableFailed.length || Boolean(busy)}
            onClick={() => runQueue(retryableFailed.map(l => l.tripId), 'retry')}
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-40 transition">
            <RefreshCw size={12} className="inline mr-1" /> Retry ({retryableFailed.length})
          </button>
          <button onClick={exportAllTripsCSV}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition">
            <Download size={12} className="inline mr-1" /> Export Queue
          </button>
          <button onClick={() => exportWellTransLogsCSV(logs, syncDate)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 transition">
            <Download size={12} className="inline mr-1" /> Logs
          </button>
          {Number(worker?.throughputPerMinute) > 0 && (
            <div className="ml-auto flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[10px] font-semibold text-cyan-800">
              <Zap size={12} />
              Turbo {worker.throughputPerMinute} trips/min
              {worker.estimatedMinutesRemaining != null && (
                <span className="text-cyan-600">ETA {worker.estimatedMinutesRemaining} min</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Worker warnings */}
      {(workerUpgradeRequired || workerReviewError || workerNeedsDate
        || (workerCalibrated && !workerDateMatches) || unmatchedCount > 0
        || coverage.missingCount > 0 || coverage.invalid > 0) && (
        <div className="shrink-0 border-b border-slate-100 bg-white px-4 py-2 space-y-1.5">
          {workerReviewError && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-300 px-3 py-2 text-[11px] font-semibold text-rose-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                Safety stop: this WellTrans review session contains unverified edits. Do not click Apply.
                Click Close in the Edit Itinerary window, close that agent browser, then click Start &amp; Fill Date
                to begin a clean verified session.
              </span>
            </div>
          )}
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
          {workerNeedsDate && (
            <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-1.5 text-[11px] font-medium text-blue-800">
              <AlertTriangle size={13} />
              In the open WellTrans schedule chooser, select {worker?.requestedDate || syncDate}. The agent is paused and will never write to {worker?.selectedDate || 'the currently open date'}.
            </div>
          )}
          {unmatchedCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-[11px] font-medium text-amber-700">
              <AlertTriangle size={13} /> {unmatchedCount} trip(s) with unmatched Booking IDs
            </div>
          )}
          {(coverage.missingCount > 0 || coverage.invalid > 0) && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-1.5 text-[11px] font-medium text-rose-700">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                Date is not complete: {coverage.missingCount} completed trip(s) are not queued or verified
                and {coverage.invalid} have incomplete Agape source data. Reconcile &amp; Fill will include
                every completed trip and keep Apply confirmation locked until coverage reaches 100%.
              </span>
            </div>
          )}
          {manifest?.state === 'blocked' && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-1.5 text-[11px] font-medium text-rose-700">
              <ShieldCheck size={13} className="mt-0.5 shrink-0" />
              <span>Server reconciliation is blocked: {manifest.blockedCount || 0} trip(s) require correction.</span>
            </div>
          )}
        </div>
      )}

      {/* Tabs + content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="shrink-0 flex items-center gap-1 border-b border-slate-200 bg-white px-4 py-1.5">
          {[
            { id: 'queue', label: 'Queue', count: completedTrips.length },
            { id: 'logs', label: 'Logs', count: logs.length },
            { id: 'activity', label: 'Activity', icon: Zap },
            { id: 'retry', label: 'Auto-Retry', icon: RotateCcw },
            { id: 'settings', label: 'Settings' },
          ].map(({ id, label, count, icon: Icon }) => (
            <button key={id} onClick={() => {
              if (id === 'settings' && !draftSettings) setDraftSettings({ ...settings, fieldMapping: { ...settings.fieldMapping } });
              setTab(id);
            }} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
              tab === id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'
            }`}>
              {Icon && <Icon size={12} />}
              {label}{count !== undefined ? ` (${count})` : ''}
            </button>
          ))}
          {tab === 'queue' && (
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="w-40 rounded-lg border border-slate-200 bg-white pl-7 pr-2 py-1.5 text-[11px] text-slate-900 placeholder-slate-400 outline-none focus:border-blue-400" />
              </div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 outline-none">
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

        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
        ) : tab === 'queue' ? (
          <div className="flex-1 overflow-auto">
            <table className="w-full table-fixed text-left text-[11px]">
              <colgroup>
                <col className="w-8" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                <tr>
                  <th className="px-3 py-2 font-semibold text-slate-500 w-8">
                    <input type="checkbox" className="rounded border-slate-300"
                      onChange={() => setSelectedIds(ids => ids.length === filteredTrips.length ? [] : filteredTrips.map(t => t.id))}
                      checked={selectedIds.length === filteredTrips.length && filteredTrips.length > 0} />
                  </th>
                  <th className="px-3 py-2 font-semibold text-slate-500">Booking</th>
                  <th className="px-3 py-2 font-semibold text-slate-500">Passenger</th>
                  <th className="px-3 py-2 font-semibold text-slate-500">Driver</th>
                  <th className="px-3 py-2 font-semibold text-slate-500">Pickup</th>
                  <th className="px-3 py-2 font-semibold text-slate-500">Dropoff</th>
                  <th className="px-3 py-2 font-semibold text-slate-500">Miles</th>
                  <th className="px-3 py-2 font-semibold text-slate-500">Validation</th>
                  <th className="px-3 py-2 font-semibold text-slate-500">Status</th>
                  <th className="px-3 py-2 font-semibold text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTrips.length === 0 ? (
                  <tr><td colSpan={10} className="px-3 py-8 text-center text-xs text-slate-400">No trips for this date.</td></tr>
                ) : displayedTrips.map(trip => {
                  const latest = latestByTrip.get(trip.id);
                  const locked = ['pending', 'processing', 'completed', 'awaiting_review'].includes(latest?.status);
                  const unmatched = latest?.status === 'failed' && !isWellTransFailureRetryable(latest);
                  return (
                    <tr key={trip.id} className="hover:bg-slate-50/50 cursor-pointer group" onClick={() => setTripDrawer(trip)}>
                      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" disabled={!trip._valid || locked || unmatched}
                          checked={selectedIds.includes(trip.id)}
                          onChange={() => setSelectedIds(ids => ids.includes(trip.id) ? ids.filter(id => id !== trip.id) : [...ids, trip.id])}
                          className="rounded border-slate-300" />
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold text-blue-600">{trip.bookingId || trip.id}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{trip.patient || trip.clientName || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{trip.driverName || '—'}</td>
                      <td className="px-3 py-2 text-slate-600 font-mono">{trip._payload?.pickup?.arrival || '—'}</td>
                      <td className="px-3 py-2 text-slate-600 font-mono">{trip._payload?.dropoff?.arrival || '—'}</td>
                      <td className="px-3 py-2 font-mono">{trip._payload?.dropoff?.mileage != null ? <span className="text-emerald-600 font-semibold">{trip._payload.dropoff.mileage}</span> : '—'}</td>
                      <td className="px-3 py-2 relative">
                        {unmatched ? (
                          <span className="text-[10px] font-semibold text-amber-600">Not Found</span>
                        ) : trip._valid ? (
                          <span className="text-[10px] font-semibold text-emerald-600">Valid</span>
                        ) : (
                          <span className="text-[10px] font-semibold text-rose-600" title={trip._errors?.join('; ')}>
                            {trip._errors?.[0] || 'Invalid'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${statusStyle[latest?.status] || 'bg-slate-100 text-slate-500'}`}>
                          {latest?.status || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {latest?.screenshot && (
                            <a href={latest.screenshot} target="_blank" rel="noopener noreferrer"
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition" title="Screenshot">
                              <Image size={13} />
                            </a>
                          )}
                          <button onClick={() => setInspectPayloadTrip(trip)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition" title="Payload">
                            <Code size={13} />
                          </button>
                          {latest?.status === 'failed' && (
                            <button onClick={() => setSelectedFailure(latest)}
                              className="rounded p-1 text-rose-400 hover:bg-rose-50 transition" title="Failure">
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
            {filteredTrips.length > TABLE_PAGE_SIZE && (
              <div className="sticky bottom-0 flex items-center justify-between border-t border-slate-200 bg-white px-4 py-2 text-[11px] text-slate-500">
                <span>Showing {queuePage * TABLE_PAGE_SIZE + 1}–{Math.min((queuePage + 1) * TABLE_PAGE_SIZE, filteredTrips.length)} of {filteredTrips.length}</span>
                <div className="flex gap-2">
                  <button type="button" disabled={queuePage === 0} onClick={() => setQueuePage(page => Math.max(0, page - 1))}
                    className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 disabled:opacity-40">Previous</button>
                  <button type="button" disabled={queuePage + 1 >= queuePageCount} onClick={() => setQueuePage(page => Math.min(queuePageCount - 1, page + 1))}
                    className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </div>
        ) : tab === 'logs' ? (
          <div className="flex-1 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-400">No logs for {syncDate}.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {displayedLogs.map(log => (
                  <div key={log.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition cursor-pointer group"
                    onClick={() => log.screenshot ? window.open(log.screenshot, '_blank') : null}>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase shrink-0 ${statusStyle[log.status] || 'bg-slate-100 text-slate-500'}`}>
                      {log.status}
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-blue-600 shrink-0">{log.bookingId || log.tripId}</span>
                    <span className="flex-1 text-[11px] text-slate-500 truncate">{log.errorMessage || log.stage || 'Completed'}</span>
                    {log.screenshot && <Image size={12} className="text-slate-300 group-hover:text-blue-500 shrink-0 transition" />}
                    <span className="text-[10px] text-slate-400 shrink-0">{new Date(log.completedAt || log.stagedAt || log.createdAt).toLocaleString()}</span>
                  </div>
                ))}
                {logs.length > TABLE_PAGE_SIZE && (
                  <div className="sticky bottom-0 flex items-center justify-between bg-white px-4 py-2 text-[11px] text-slate-500">
                    <span>Showing {logsPage * TABLE_PAGE_SIZE + 1}–{Math.min((logsPage + 1) * TABLE_PAGE_SIZE, logs.length)} of {logs.length}</span>
                    <div className="flex gap-2">
                      <button type="button" disabled={logsPage === 0} onClick={() => setLogsPage(page => Math.max(0, page - 1))}
                        className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 disabled:opacity-40">Previous</button>
                      <button type="button" disabled={logsPage + 1 >= logsPageCount} onClick={() => setLogsPage(page => Math.min(logsPageCount - 1, page + 1))}
                        className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 disabled:opacity-40">Next</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : tab === 'activity' ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 size={14} className="text-blue-500" />
              <span className="text-xs font-semibold text-slate-900">Worker Activity Log</span>
              <span className="text-[10px] text-slate-400">({workerActivity.length} active)</span>
            </div>
            {workerActivity.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">No active sync jobs.</div>
            ) : workerActivity.map(log => (
              <div key={log.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className={`w-2 h-2 rounded-full shrink-0 ${log.status === 'processing' ? 'bg-blue-500 animate-pulse' : 'bg-amber-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-slate-900">{log.bookingId || log.tripId}</p>
                  <p className="text-[10px] text-slate-500 truncate">{log.stage || 'Queued'} · {log.status}</p>
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">
                  {new Date(log.updatedAt || log.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        ) : tab === 'retry' ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <RotateCcw size={14} className="text-amber-500" />
              <span className="text-xs font-semibold text-slate-900">Auto-Retry Rules</span>
            </div>
            <p className="text-[11px] text-slate-500">Toggle which failure categories should auto-retry on the next sync cycle.</p>
            {FAILURE_CATEGORIES.filter(c => c.key !== 'other').map(cat => {
              const count = failedLogs.filter(l => categorizeFailure(l) === cat.key).length;
              return (
                <div key={cat.key} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-900">{cat.label}</p>
                    <p className="text-[10px] text-slate-500">{count} failure(s) in this category</p>
                  </div>
                  <button onClick={() => toggleAutoRetry(cat.key)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${autoRetry[cat.key] ? 'bg-blue-600' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${autoRetry[cat.key] ? 'left-5.5 translate-x-0' : 'left-0.5'}`}
                      style={{ left: autoRetry[cat.key] ? '22px' : '2px' }} />
                  </button>
                </div>
              );
            })}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold text-slate-700">Auto-retry enabled for: {Object.entries(autoRetry).filter(([, v]) => v).map(([k]) => FAILURE_CATEGORIES.find(c => c.key === k)?.label || k).join(', ') || 'None'}</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
              <div>
                <p className="text-xs font-semibold text-slate-900">Enable Automation Queue</p>
                <p className="text-[11px] text-slate-500">Auto-process when worker is online</p>
              </div>
              <input type="checkbox" checked={effectiveSettings.enabled}
                onChange={e => setDraftSettings(v => ({ ...v, enabled: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600">Portal URL</label>
              <input value={effectiveSettings.portalUrl || ''}
                onChange={e => setDraftSettings(v => ({ ...v, portalUrl: e.target.value }))}
                placeholder="https://tripspark.welltransnemt.com/"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-400" />
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-[11px] font-semibold text-emerald-900">Credentials stay on the worker computer</p>
              <p className="mt-1 text-[10px] leading-relaxed text-emerald-800">
                Agape never stores the WellTrans username or password in Firestore. The local worker reuses its encrypted browser session and requests a manual sign-in only when that session expires.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
              <p className="text-xs font-semibold text-slate-900 flex items-center gap-1.5"><Activity size={13} /> Self-Control</p>
              <p className="text-[10px] text-slate-500">
                Automated staging with mandatory operator review before Apply.
              </p>
              {[
                { key: 'autoStart', label: 'Auto-Start Worker', desc: 'Automatically launch worker when offline' },
                { key: 'autoQueue', label: 'Auto-Queue Trips', desc: 'Queue ready trips when worker comes online' },
                { key: 'autoRetryEnabled', label: 'Auto-Retry Failures', desc: 'Retry failed trips based on auto-retry rules' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-800">{label}</p>
                    <p className="text-[10px] text-slate-500">{desc}</p>
                  </div>
                  <button type="button" onClick={() => setDraftSettings(v => ({ ...v, [key]: !v[key] }))}
                    className={`relative w-10 h-5 rounded-full transition-colors ${effectiveSettings[key] ? 'bg-blue-600' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform`}
                      style={{ left: effectiveSettings[key] ? '22px' : '2px' }} />
                  </button>
                </div>
              ))}
              {autoLog.length > 0 && (
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-2 max-h-24 overflow-y-auto">
                  <p className="text-[10px] font-semibold text-slate-500 mb-1">Activity Log</p>
                  {autoLog.slice(-5).map(entry => (
                    <p key={entry.id} className="text-[10px] text-slate-600 font-mono">
                      <span className="text-slate-400">{entry.ts}</span> {entry.msg}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-semibold text-slate-600">Field Mapping</label>
                <button onClick={() => setDraftSettings(v => ({ ...v, fieldMapping: { ...DEFAULT_WELLTRANS_FIELD_MAPPING } }))}
                  className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1">
                  <RotateCcw size={11} /> Reset
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(effectiveSettings.fieldMapping || {}).map(([key, value]) => (
                  <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <span className="text-[10px] font-semibold uppercase text-slate-500">{key}</span>
                    <input value={value}
                      onChange={e => setDraftSettings(curr => ({ ...curr, fieldMapping: { ...curr.fieldMapping, [key]: e.target.value } }))}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-900 outline-none focus:border-blue-400" />
                  </div>
                ))}
              </div>
            </div>
            <button onClick={async () => {
              await saveWellTransSettings(effectiveSettings, auth.currentUser?.uid || 'unknown');
              setDraftSettings(null); setNotice('Settings saved.');
            }} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 transition flex items-center gap-1.5">
              <Save size={14} /> Save Configuration
            </button>
          </div>
        )}
      </div>

      {/* AI Diagnostic bar */}
      {selectedFailure && (
        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-200">
              <Bot size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-bold text-purple-600 uppercase">AI Diagnostic</p>
                <button onClick={() => { setSelectedFailure(null); setAiDiagnostic(null); }} className="text-slate-400 hover:text-slate-600"><X size={13} /></button>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">{explainWellTransFailure(selectedFailure)}</p>
              {aiDiagnostic?.explanation && (
                <div className="mt-2 rounded-lg border border-purple-100 bg-purple-50/60 p-2 text-[11px] text-slate-700">
                  <p className="font-semibold text-purple-700">{aiDiagnostic.category || 'Supervised analysis'}</p>
                  <p className="mt-0.5">{aiDiagnostic.explanation}</p>
                  {aiDiagnostic.recommendedAction && <p className="mt-1"><span className="font-semibold">Next:</span> {aiDiagnostic.recommendedAction}</p>}
                  <p className="mt-1 text-[9px] uppercase tracking-wide text-slate-400">
                    {aiDiagnostic.aiEnhanced ? 'Gemini-enhanced explanation' : 'Deterministic safety explanation'} · read-only
                  </p>
                </div>
              )}
              <button
                disabled={aiBusy}
                onClick={async () => {
                  setAiBusy(true);
                  try {
                    const result = await explainWellTransFailureAI(selectedFailure.id);
                    setAiDiagnostic(result.data);
                  } catch (error) {
                    setAiDiagnostic({
                      explanation: error.message || 'The supervised explanation is unavailable.',
                      recommendedAction: 'Use the deterministic diagnosis above and inspect the captured portal evidence.',
                      aiEnhanced: false,
                    });
                  } finally {
                    setAiBusy(false);
                  }
                }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-purple-700 hover:bg-purple-50 disabled:opacity-50">
                {aiBusy ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                Explain securely
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trip detail drawer */}
      {tripDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setTripDrawer(null)} />
          <div className="relative w-full max-w-md bg-white border-l border-slate-200 shadow-2xl flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 truncate">{tripDrawer.patient || tripDrawer.clientName || 'Trip'}</h3>
                <p className="text-[11px] text-slate-500 font-mono">#{tripDrawer.bookingId || tripDrawer.id}</p>
              </div>
              <button onClick={() => setTripDrawer(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Trip info */}
              <div className="space-y-2">
                {[
                  ['Driver', tripDrawer.driverName || '—'],
                  ['Vehicle', tripDrawer.completedVehicle || tripDrawer.vehicle || '—'],
                  ['Pickup', tripDrawer.pickup || tripDrawer.pickupAddress || '—'],
                  ['Dropoff', tripDrawer.dropoff || tripDrawer.dropoffAddress || '—'],
                  ['Scheduled', tripDrawer.scheduledTime || tripDrawer.time || '—'],
                  ['Status', tripDrawer.status || '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex gap-3">
                    <span className="text-[11px] font-semibold text-slate-500 w-20 shrink-0">{label}</span>
                    <span className="text-[11px] text-slate-900 break-words">{value}</span>
                  </div>
                ))}
              </div>

              {/* WellTrans payload */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-900">WellTrans Payload</span>
                  {tripDrawer._valid ? (
                    <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1"><CheckCircle2 size={11} /> Valid</span>
                  ) : (
                    <span className="text-[10px] font-semibold text-rose-600">{tripDrawer._errors?.[0]}</span>
                  )}
                </div>
                {tripDrawer._payload ? (
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 max-h-[200px] overflow-y-auto">
                    <pre className="text-[10px] font-mono text-slate-700 whitespace-pre-wrap">{JSON.stringify(tripDrawer._payload, null, 2)}</pre>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">Cannot build payload — missing required fields.</p>
                )}
              </div>

              {/* Validation errors */}
              {tripDrawer._errors?.length > 0 && (
                <div>
                  <span className="text-[11px] font-bold text-rose-600 mb-1 block">Validation Errors</span>
                  <div className="space-y-1">
                    {tripDrawer._errors.map((err, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-1.5">
                        <XCircle size={12} className="text-rose-500 mt-0.5 shrink-0" />
                        <span className="text-[11px] text-rose-700">{err}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sync log */}
              {latestByTrip.get(tripDrawer.id) && (
                <div>
                  <span className="text-[11px] font-bold text-slate-900 mb-1 block">Sync Log</span>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                    {(() => { const log = latestByTrip.get(tripDrawer.id); return (
                      <>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${statusStyle[log.status] || 'bg-slate-100 text-slate-500'}`}>{log.status}</span>
                          <span className="text-[10px] text-slate-400">{new Date(log.completedAt || log.stagedAt || log.createdAt).toLocaleString()}</span>
                        </div>
                        {log.errorMessage && <p className="text-[11px] text-rose-600">{log.errorMessage}</p>}
                        {log.stage && <p className="text-[10px] text-slate-500">Stage: {log.stage}</p>}
                        {log.screenshot && (
                          <a href={log.screenshot} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline">
                            <Image size={12} /> View Screenshot
                          </a>
                        )}
                      </>
                    ); })()}
                  </div>
                </div>
              )}
            </div>
            <div className="shrink-0 border-t border-slate-200 px-4 py-2.5 flex gap-2">
              <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(tripDrawer._payload || {}, null, 2)); setNotice('Payload copied.'); }}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition flex items-center justify-center gap-1">
                <Copy size={12} /> Copy Payload
              </button>
              {latestByTrip.get(tripDrawer.id)?.status === 'failed' && isWellTransFailureRetryable(latestByTrip.get(tripDrawer.id)) && (
                <button onClick={() => { setTripDrawer(null); runQueue([tripDrawer.id], 'retry'); }}
                  className="flex-1 rounded-xl bg-amber-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-amber-700 transition flex items-center justify-center gap-1">
                  <RefreshCw size={12} /> Retry This Trip
                </button>
              )}
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
                className="rounded-xl bg-blue-600 px-4 py-2 text-[11px] font-semibold text-white hover:bg-blue-700 transition">
                Copy JSON
              </button>
            </div>
          </div>
        </div>
      )}

      {showInstallHelp && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Install the managed Windows agent</h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  Version {agentRelease?.version || requiredWorkerVersion} · no terminal commands required
                </p>
              </div>
              <button type="button" onClick={() => setShowInstallHelp(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4 text-[11px] text-slate-700">
              <ol className="space-y-2">
                {[
                  'Download the Agent ZIP. Do not open files inside the ZIP yet.',
                  'In Downloads, right-click the ZIP, choose Properties, select Unblock, then Apply.',
                  'Choose Extract All and open the extracted agape-welltrans-agent folder.',
                  'Double-click Install-Agent.cmd. Return to Agape when installation completes.',
                  'Select the service date and click Start & Fill Date.',
                ].map((step, index) => (
                  <li key={step} className="flex gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                      {index + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <p className="font-bold">If Windows says “blocked by your organization”</p>
                <p className="mt-1 leading-relaxed">
                  This is an enforced App Control policy, not an Agape error. It cannot be safely bypassed by a
                  website. Your Windows administrator must approve the Agape agent or deploy a trusted
                  organization-signed build.
                </p>
              </div>
              {agentRelease?.sha256 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-700">Official ZIP SHA-256</p>
                  <p className="mt-1 break-all font-mono text-[9px] text-slate-500">{agentRelease.sha256}</p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <a href="/welltrans-agent/agape-welltrans-agent.zip" download
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-[11px] font-semibold text-white hover:bg-blue-700">
                <Download size={13} /> Download Agent ZIP
              </a>
              <button type="button" onClick={() => setShowInstallHelp(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screenshot viewer */}
      {selectedFailure?.screenshot && !tripDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="relative max-w-3xl w-full bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Image size={16} className="text-blue-500" />
                <span className="text-sm font-semibold text-slate-900">Failure Screenshot</span>
                <span className="text-[11px] text-slate-500 font-mono">#{selectedFailure.bookingId || selectedFailure.tripId}</span>
              </div>
              <button onClick={() => setSelectedFailure(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="p-4 max-h-[70vh] overflow-auto bg-slate-50">
              <img src={selectedFailure.screenshot} alt="Failure screenshot" className="w-full rounded-lg border border-slate-200" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WellTransSyncPage;
