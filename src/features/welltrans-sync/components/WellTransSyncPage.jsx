import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertTriangle, Bot, CheckCircle2, Code, Download, Eye,
  Loader2, Play, RefreshCw, RotateCcw, Save, Search,
  ShieldCheck, Sparkles, X, XCircle, ChevronLeft, ChevronRight, Image, Copy,
  BarChart3, Activity, Edit2,
  KeyRound, Trash2, Lock,
} from 'lucide-react';
import {
  auth, EmailAuthProvider, reauthenticateWithCredential,
} from '../../../config/firebase';
import { useWellTransSync } from '../hooks/useWellTransSync';
import { useWellTransAutoSync } from '../hooks/useWellTransAutoSync';
import {
  confirmWellTransReviewBatchApplied,
  explainWellTransFailure, explainWellTransFailureAI,
  isWellTransFailureRetryable, queueWellTransSync, saveWellTransSettings,
  clearLocalWellTransCredentials, getLocalWellTransCredentialStatus,
  saveLocalWellTransCredentials,
  categorizeFailure, FAILURE_CATEGORIES,
} from '../services/welltransService';
import {
  buildWellTransPayload, calculateWellTransDraftMileage, DEFAULT_WELLTRANS_FIELD_MAPPING, hydrateWellTransTrip,
  validateTripForWellTrans,
} from '../utils/welltransMapping';
import { pageWellTransRows, WELLTRANS_TABLE_PAGE_SIZE } from '../utils/welltransScale';
import { isValidWellTransServiceDate } from '../utils/welltransDate';
import { buildWellTransReviewState } from '../utils/welltransReviewState';
import { tripMatchesSearch } from '../../../utils/search';

const statusStyle = {
  pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  processing: 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse',
  awaiting_review: 'bg-purple-50 text-purple-700 border border-purple-200',
  completed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  failed: 'bg-rose-50 text-rose-700 border border-rose-200',
};

const AUTHORIZED_ROLES = ['admin', 'dispatcher'];
const CREDENTIAL_ADMIN_ROLES = ['admin'];
const TABLE_PAGE_SIZE = WELLTRANS_TABLE_PAGE_SIZE;
const statusLabel = {
  pending: 'Queued',
  processing: 'Filling',
  awaiting_review: 'Ready to review',
  completed: 'Applied & verified',
  failed: 'Needs correction',
};

const toTripTimeInput = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  const clock = raw.match(/^(\d{1,2}):(\d{2})/);
  if (clock) return `${clock[1].padStart(2, '0')}:${clock[2]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
};

const tripTimeToIso = (value, serviceDate) => {
  if (!value) return null;
  const clock = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!clock || !serviceDate) return value;
  const parsed = new Date(`${serviceDate}T${clock[1].padStart(2, '0')}:${clock[2]}:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
};

const tripOdometerValue = (value) => {
  if (value === '' || value == null) return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const tripClockMinutes = (value) => {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  return match ? (Number(match[1]) * 60) + Number(match[2]) : null;
};

const displayScalar = (value, fallback = '—') => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date?.getTime?.()) ? fallback : date.toLocaleString();
  }
  if (typeof value === 'object') {
    const candidate = value.name || value.label || value.address || value.value || value.id;
    return candidate === undefined || candidate === null ? fallback : String(candidate);
  }
  return String(value);
};

const displayTimestamp = value => {
  const parsed = value?.toDate?.() || (value ? new Date(value) : null);
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString() : '—';
};

const createWellTransEditDraft = (trip) => ({
  ...trip,
  _pickupArrival: toTripTimeInput(trip.arrivalTime || trip.pickupArrival || trip.startTime),
  _pickupDeparture: toTripTimeInput(trip.departedPickupTime || trip.pickupDeparture || trip.arrivalTime),
  _dropoffArrival: toTripTimeInput(trip.arrivalDropoffTime || trip.dropoffArrival || trip.completedAt),
  _dropoffDeparture: toTripTimeInput(trip.dropoffDeparture || trip.departedDropoffTime || trip.arrivalDropoffTime || trip.completedAt),
  _pickupOdometer: trip.pickupOdometer ?? '',
  _dropoffOdometer: trip.dropoffOdometer ?? '',
  _signed: Boolean(trip.paperSignatureConfirmed),
});

const WellTransSyncPage = ({ trips = [], drivers = [], vehicles = [], role = 'dispatcher', onUpdateTrip }) => {
  const [syncDate, setSyncDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [driverScopeId, setDriverScopeId] = useState('all');
  const hydratedTrips = useMemo(
    () => trips.reduce((records, trip) => {
      if (!trip || typeof trip !== 'object' || Array.isArray(trip)) return records;
      try { records.push(hydrateWellTransTrip(trip, drivers)); } catch {
        records.push({ ...trip, _wellTransSourceError: 'This legacy trip contains unreadable source fields.' });
      }
      return records;
    }, []),
    [trips, drivers],
  );
  const vehicleOptions = useMemo(() => {
    const unique = new Map();
    vehicles.forEach((vehicle) => {
      const name = String(vehicle?.name || vehicle?.vehicleName || '').trim();
      if (!name || vehicle?.archived === true || vehicle?.active === false) return;
      const key = name.toLowerCase();
      if (!unique.has(key)) unique.set(key, {
        name,
        plate: String(vehicle?.plate || vehicle?.licensePlate || '').trim(),
      });
    });
    return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [vehicles]);
  const {
    settings, logs, worker, activeWorkers, operations, canary, manifest, coverage,
    workerOnline, workerCalibrated, workerUpgradeRequired,
    requiredWorkerVersion, workerStandby, loading, allCompletedTrips, completedTrips, readyTrips,
    latestByTrip, healthScore, successfulCount,
  } = useWellTransSync(hydratedTrips, syncDate, driverScopeId === 'all' ? '' : driverScopeId);

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
  const [editingTrip, setEditingTrip] = useState(null);
  const [savingTripId, setSavingTripId] = useState('');
  const [recentlySavedTripId, setRecentlySavedTripId] = useState('');
  const [queuePage, setQueuePage] = useState(0);
  const [logsPage, setLogsPage] = useState(0);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [agentRelease, setAgentRelease] = useState(null);
  const [credentialStatus, setCredentialStatus] = useState({ loading: false, connected: false, configured: false, username: '' });
  const [credentialDraft, setCredentialDraft] = useState({ username: '', password: '' });
  const [credentialBusy, setCredentialBusy] = useState('');
  const [credentialError, setCredentialError] = useState('');
  const [credentialUnlocked, setCredentialUnlocked] = useState(false);
  const [credentialUnlockPassword, setCredentialUnlockPassword] = useState('');
  const [credentialUnlockBusy, setCredentialUnlockBusy] = useState(false);
  const [credentialRefreshKey, setCredentialRefreshKey] = useState(0);
  const [autoRetry, setAutoRetry] = useState(() => {
    try { return JSON.parse(localStorage.getItem('agape_wt_autoRetry') || '{}'); } catch { return {}; }
  });
  const pageRef = useRef(null);

  const changeSyncDate = useCallback((nextDate) => {
    const normalized = String(nextDate || '').trim();
    // Native date controls can emit an empty intermediate value. Publishing
    // that value used to tear down the valid subscriptions and crash the page.
    if (!isValidWellTransServiceDate(normalized)) return false;
    setSelectedIds([]);
    setDriverScopeId('all');
    setQueuePage(0);
    setLogsPage(0);
    setTripDrawer(null);
    setEditingTrip(null);
    setSelectedFailure(null);
    setInspectPayloadTrip(null);
    setNotice('');
    setSyncProgress(null);
    setSyncDate(normalized);
    return true;
  }, []);

  const beginTripEdit = useCallback((trip) => {
    setEditingTrip(createWellTransEditDraft(trip));
    setTripDrawer(null);
  }, []);

  const saveTripEdit = useCallback(async () => {
    if (!editingTrip || !onUpdateTrip || savingTripId) return;
    const pickupArrivalMinutes = tripClockMinutes(editingTrip._pickupArrival);
    const pickupDepartureMinutes = tripClockMinutes(editingTrip._pickupDeparture);
    const dropoffArrivalMinutes = tripClockMinutes(editingTrip._dropoffArrival);
    const dropoffDepartureMinutes = tripClockMinutes(editingTrip._dropoffDeparture);
    const pickupOdometer = tripOdometerValue(editingTrip._pickupOdometer);
    const dropoffOdometer = tripOdometerValue(editingTrip._dropoffOdometer);
    if (pickupArrivalMinutes != null && pickupDepartureMinutes != null && pickupDepartureMinutes < pickupArrivalMinutes) {
      setNotice(`Trip ${editingTrip.bookingId || editingTrip.id} was not saved: pickup departure cannot precede pickup arrival.`);
      return;
    }
    if (dropoffArrivalMinutes != null && dropoffDepartureMinutes != null && dropoffDepartureMinutes < dropoffArrivalMinutes) {
      setNotice(`Trip ${editingTrip.bookingId || editingTrip.id} was not saved: dropoff departure cannot precede dropoff arrival.`);
      return;
    }
    if (pickupOdometer != null && dropoffOdometer != null && dropoffOdometer < pickupOdometer) {
      setNotice(`Trip ${editingTrip.bookingId || editingTrip.id} was not saved: end odometer cannot be lower than start odometer.`);
      return;
    }
    const selectedDriver = drivers.find(driver => driver.id === editingTrip.driverId);
    const serviceDate = editingTrip.date;
    const updatedTrip = {
      ...editingTrip,
      arrivalTime: tripTimeToIso(editingTrip._pickupArrival, serviceDate),
      startTime: tripTimeToIso(editingTrip._pickupArrival, serviceDate),
      departedPickupTime: tripTimeToIso(editingTrip._pickupDeparture || editingTrip._pickupArrival, serviceDate),
      arrivalDropoffTime: tripTimeToIso(editingTrip._dropoffArrival, serviceDate),
      dropoffDeparture: tripTimeToIso(editingTrip._dropoffDeparture || editingTrip._dropoffArrival, serviceDate),
      pickupOdometer,
      dropoffOdometer,
      paperSignatureConfirmed: Boolean(editingTrip._signed),
      driverName: selectedDriver?.name || editingTrip.driverName || null,
      driverEmail: selectedDriver?.email || editingTrip.driverEmail || null,
      completedDriverName: selectedDriver?.name || editingTrip.completedDriverName || editingTrip.driverName || null,
      completedVehicle: editingTrip.completedVehicle || '',
    };
    Object.keys(updatedTrip).filter(key => key.startsWith('_')).forEach(key => delete updatedTrip[key]);
    setSavingTripId(editingTrip.id);
    try {
      const saved = await Promise.resolve(onUpdateTrip(updatedTrip));
      if (saved === false) throw new Error('Firestore rejected the trip update.');
      setRecentlySavedTripId(editingTrip.id);
      setEditingTrip(null);
      setNotice(`Trip ${updatedTrip.bookingId || updatedTrip.id} saved. The WellTrans payload and validation now use these changes.`);
      window.setTimeout(() => setRecentlySavedTripId(current => current === updatedTrip.id ? '' : current), 5000);
    } catch (error) {
      setNotice(`Trip ${updatedTrip.bookingId || updatedTrip.id} was not saved: ${error?.message || 'unknown persistence error'}`);
    } finally {
      setSavingTripId('');
    }
  }, [drivers, editingTrip, onUpdateTrip, savingTripId]);

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

  useEffect(() => {
    if (tab !== 'settings' || !credentialUnlocked) return undefined;
    let active = true;
    setCredentialStatus(current => ({ ...current, loading: true }));
    getLocalWellTransCredentialStatus()
      .then(status => {
        if (!active) return;
        setCredentialStatus({
          loading: false,
          connected: true,
          configured: Boolean(status.configured),
          username: String(status.username || ''),
        });
        setCredentialDraft(current => ({
          ...current,
          username: current.username || String(status.username || ''),
        }));
        setCredentialError('');
      })
      .catch(() => {
        if (!active) return;
        setCredentialStatus({ loading: false, connected: false, configured: false, username: '' });
        setCredentialError('Open the local WellTrans Agent on this computer, then retry.');
      });
    return () => { active = false; };
  }, [tab, credentialUnlocked, credentialRefreshKey]);

  useEffect(() => {
    if (!credentialUnlocked) return undefined;
    const timer = window.setTimeout(() => {
      setCredentialUnlocked(false);
      setCredentialUnlockPassword('');
      setCredentialDraft({ username: '', password: '' });
      setCredentialStatus({ loading: false, connected: false, configured: false, username: '' });
      setCredentialError('');
    }, 5 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [credentialUnlocked]);

  useEffect(() => {
    if (tab === 'settings') return;
    setCredentialUnlocked(false);
    setCredentialUnlockPassword('');
    setCredentialDraft({ username: '', password: '' });
    setCredentialStatus({ loading: false, connected: false, configured: false, username: '' });
  }, [tab]);

  const normalizedRole = String(role || '').toLowerCase().trim();
  const isAuthorized = AUTHORIZED_ROLES.includes(normalizedRole);
  const canManageWellTransCredentials = CREDENTIAL_ADMIN_ROLES.includes(normalizedRole);
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
  const workerHealthy = settings.enabled && workerOnline
    && !workerNeedsLogin && !workerNeedsDate && !workerConnecting
    && !workerReviewError && !workerReconciliationBlocked
    && (!workerCalibrated || workerDateMatches);
  const canaryHealthy = canary?.passed === true
    && (!canary?.serviceDate || canary.serviceDate === syncDate);
  const liveActiveAgentCount = Math.max(activeWorkers.length, workerOnline ? 1 : 0);
  const operationsNeedsAttention = Boolean(operations && (
    Number(operations.staleProcessingCount || 0) > 0
    || Number(operations.blockedDateCount || 0) > 0
    || (liveActiveAgentCount === 0 && Number(operations.activeWorkerCount || 0) === 0)
  ));
  const scopedCompletedTripIds = useMemo(
    () => new Set(completedTrips.map(trip => String(trip.id))),
    [completedTrips],
  );
  const currentLogs = useMemo(() => [...latestByTrip.values()]
    .filter(log => scopedCompletedTripIds.has(String(log.tripId))),
  [latestByTrip, scopedCompletedTripIds]);
  const reviewState = useMemo(() => buildWellTransReviewState({
    serviceDate: syncDate,
    worker,
    manifest,
    workerOnline: workerOnline && !workerUpgradeRequired,
    completedTripIds: completedTrips.map(trip => trip.id),
    currentLogs: [...latestByTrip.values()],
  }), [completedTrips, latestByTrip, manifest, syncDate, worker, workerOnline, workerUpgradeRequired]);
  const workerBatchReady = reviewState.ready;
  const stagedCount = reviewState.stagedCount;
  const workerStatusLabel = !settings.enabled
    ? 'Disabled'
    : workerReviewError
      ? 'Safety stop — discard review'
    : workerReconciliationBlocked
      ? 'Incomplete date — action required'
    : workerOnline && worker?.selectedDate && worker.selectedDate !== syncDate
      ? `Agent on ${worker.selectedDate}`
    : workerBatchReady
      ? `${stagedCount} independently verified for Apply`
    : worker?.state === 'indexing_schedule'
      ? 'Indexing schedule'
    : worker?.state === 'running_portal_canary'
      ? 'Verifying portal contract'
    : worker?.state === 'verifying_applied_records'
      ? 'Verifying applied records'
    : worker?.state === 'verifying_staged_records'
      ? 'Verifying staged records'
    : worker?.state === 'staging'
      ? 'Filling WellTrans'
    : workerNeedsLogin
      ? 'Sign-in required'
      : workerNeedsDate
        ? `Select ${worker?.requestedDate || syncDate} in WellTrans`
      : workerConnecting
        ? 'Starting Agent'
        : workerOnline
          ? 'Online'
          : workerStandby
            ? 'Standby'
            : 'Offline';
  const failedLogs = currentLogs.filter(l => l.status === 'failed');
  const retryableFailed = failedLogs.filter(isWellTransFailureRetryable);
  const driverScopes = useMemo(() => {
    const grouped = new Map();
    for (const trip of allCompletedTrips) {
      const driverId = String(trip.driverId || '').trim();
      if (!driverId) continue;
      let payload = null;
      try { payload = buildWellTransPayload(trip); } catch {}
      const driverName = String(
        trip.completedDriverName || payload?.driver || trip.driverName || driverId,
      ).trim();
      if (!grouped.has(driverId)) grouped.set(driverId, { id: driverId, name: driverName, trips: [] });
      grouped.get(driverId).trips.push(trip);
    }
    return [...grouped.values()].map(item => {
      const states = item.trips.map(trip => latestByTrip.get(trip.id));
      const verified = states.filter(log => log?.status === 'completed'
        && log?.portalVerification?.verified === true).length;
      const reviewing = states.filter(log => log?.status === 'awaiting_review').length;
      const active = states.filter(log => ['pending', 'processing'].includes(log?.status)).length;
      const issues = states.filter(log => log?.status === 'failed').length;
      const state = verified === item.trips.length && item.trips.length
        ? 'done'
        : issues
          ? 'needs correction'
          : reviewing
            ? 'ready for review'
            : active
              ? 'filling'
              : 'not started';
      return { ...item, total: item.trips.length, verified, state };
    }).sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
  }, [allCompletedTrips, latestByTrip]);
  const selectedDriverScope = driverScopeId === 'all'
    ? null
    : driverScopes.find(item => item.id === driverScopeId) || null;
  const activeScope = useMemo(() => selectedDriverScope
    ? { type: 'driver', driverId: selectedDriverScope.id }
    : { type: 'all' }, [selectedDriverScope]);

  useEffect(() => {
    if (driverScopeId !== 'all' && !driverScopes.some(item => item.id === driverScopeId)) {
      const timer = window.setTimeout(() => setDriverScopeId('all'), 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [driverScopeId, driverScopes]);

  const { autoLog } = useWellTransAutoSync({
    settings: effectiveSettings, worker, readyTrips, retryableFailed,
    retryCategories: autoRetry, syncDate, busy, workerDateMatches,
  });

  const enrichedTrips = useMemo(() => {
    return completedTrips.map(trip => {
      let validation;
      try { validation = validateTripForWellTrans(trip); } catch (error) {
        validation = { valid: false, errors: [`Unreadable source trip: ${error?.message || 'invalid record'}`] };
      }
      if (trip._wellTransSourceError) validation = { valid: false, errors: [trip._wellTransSourceError] };
      let payload = null;
      try { payload = buildWellTransPayload(trip); } catch {}
      return { ...trip, _valid: validation.valid, _errors: validation.errors, _payload: payload };
    });
  }, [completedTrips]);

  const filteredTrips = useMemo(() => {
    return enrichedTrips.filter(trip => {
      if (!tripMatchesSearch(trip, searchQuery, [trip._payload?.driver])) return false;
      if (statusFilter === 'all') return true;
      const latest = latestByTrip.get(trip.id);
      if (statusFilter === 'ready') return trip._valid && !latest;
      if (statusFilter === 'staged') return latest?.status === 'awaiting_review';
      if (statusFilter === 'synced') return latest?.status === 'completed'
        && latest?.portalVerification?.verified === true;
      if (statusFilter === 'failed') return latest?.status === 'failed';
      if (statusFilter === 'invalid') return !trip._valid;
      return true;
    });
  }, [enrichedTrips, searchQuery, statusFilter, latestByTrip]);
  const selectableFilteredTrips = useMemo(
    () => filteredTrips.filter(trip => trip._valid),
    [filteredTrips],
  );
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
    const requestedIds = mode === 'selected'
      ? ids.filter(id => !latestByTrip.get(id))
      : ids;
    const alreadyCovered = mode === 'selected'
      ? ids.filter(id => ['pending', 'processing', 'awaiting_review', 'completed'].includes(latestByTrip.get(id)?.status)).length
      : 0;
    const needsCorrection = mode === 'selected'
      ? ids.filter(id => latestByTrip.get(id)?.status === 'failed').length
      : 0;
    if (!requestedIds.length) {
      setNotice(`${ids.length} trip(s) selected: ${alreadyCovered} already in progress or verified`
        + `${needsCorrection ? `, ${needsCorrection} needing correction` : ''}.`);
      return;
    }
    setBusy(mode); setNotice(''); setSyncProgress({ done: 0, total: requestedIds.length });
    try {
      const result = await queueWellTransSync(requestedIds, mode, syncDate, activeScope);
      setNotice(`${result.data.queued} trip${result.data.queued === 1 ? '' : 's'} queued`
        + `${alreadyCovered ? `, ${alreadyCovered} already covered` : ''}`
        + `${needsCorrection ? `, ${needsCorrection} needing correction` : ''}.`);
      setSyncProgress({ done: result.data.queued + (result.data.rejected || 0), total: requestedIds.length });
      setSelectedIds([]);
      setTimeout(() => setSyncProgress(null), 5000);
    } catch (e) { setNotice(e.message || 'Unable to create queue.'); setSyncProgress(null); }
    finally { setBusy(''); }
  }, [activeScope, latestByTrip, syncDate]);

  const openLocalAgent = useCallback(() => {
    const protocol = new URL('agape-welltrans://start');
    protocol.searchParams.set('date', syncDate);
    protocol.searchParams.set('scope', activeScope.type);
    if (activeScope.type === 'driver') protocol.searchParams.set('driverId', activeScope.driverId);
    // A real anchor click preserves the user's activation for the registered
    // Windows protocol handler. Assigning window.location from later async
    // work is commonly blocked by Chromium and left the portal unopened.
    const launchLink = document.createElement('a');
    launchLink.href = protocol.toString();
    launchLink.setAttribute('aria-hidden', 'true');
    launchLink.style.display = 'none';
    document.body.appendChild(launchLink);
    launchLink.click();
    launchLink.remove();
  }, [activeScope, syncDate]);

  const startAndFillDate = useCallback(async () => {
    if (!settings.enabled || busy) return;
    // Keep launch inside the synchronous click path. The backend work follows
    // without stealing the browser user gesture required by custom protocols.
    openLocalAgent();
    setBusy('start-fill');
    setNotice('');
    if (!completedTrips.length) {
      setNotice(`WellTrans was opened for ${syncDate}. Agape has no completed trips to fill for this date.`);
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
        activeScope,
      );
      setSyncProgress({
        done: result.data.orchestrated
          || result.data.queued + (result.data.rejected || 0),
        total: result.data.expected || completedTrips.length,
      });
      setNotice(result.data.orchestrated != null
        ? `${result.data.orchestrated} completed trips prepared for ${syncDate}`
          + `${selectedDriverScope ? ` for ${selectedDriverScope.name}` : ' across all drivers'}. The Agent will reconcile every scoped trip.`
        : `${result.data.expected || completedTrips.length} completed trips prepared: `
          + `${result.data.queued} queued, ${result.data.covered || 0} already covered, `
          + `${result.data.rejected || 0} requiring correction.`);
      setSelectedIds([]);
      setTimeout(() => setSyncProgress(null), 5000);
      setTimeout(() => setNotice(''), 8000);
    } catch (error) {
      setNotice(error.message || 'The agent was requested, but trips could not be queued.');
      setSyncProgress(null);
    } finally {
      setBusy('');
    }
  }, [activeScope, busy, completedTrips, openLocalAgent, selectedDriverScope, settings.enabled, syncDate]);

  const confirmReviewBatchApplied = useCallback(async () => {
    if (!workerBatchReady || !worker?.reviewSessionId || !worker?.workerInstanceId || !stagedCount) {
      setNotice(reviewState.reasons[0]
        ? `Apply verification is locked: ${reviewState.reasons[0]}`
        : 'No live WellTrans review batch is ready for Apply confirmation.');
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
        worker.workerInstanceId,
      );
      setNotice(
        `${result.data.confirmed} trips marked Applied. Live WellTrans verification is running before the next batch.`,
      );
    } catch (error) {
      setNotice(error.message || 'The review batch could not be confirmed.');
    } finally {
      setBusy('');
    }
  }, [reviewState.reasons, stagedCount, syncDate, worker, workerBatchReady]);

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedIds(filteredTrips.filter(t => t._valid).map(t => t.id));
      }
      if (e.key === 'Escape') {
        setSelectedIds([]);
        setTripDrawer(null);
        setSelectedFailure(null);
        setInspectPayloadTrip(null);
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

  const navigateDate = (offset) => {
    const baseDate = isValidWellTransServiceDate(syncDate)
      ? syncDate
      : new Date().toLocaleDateString('en-CA');
    const d = new Date(`${baseDate}T12:00:00`);
    d.setDate(d.getDate() + offset);
    changeSyncDate(d.toISOString().slice(0, 10));
  };

  const toggleAutoRetry = (category) => {
    setAutoRetry(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const exportAllTripsCSV = () => {
    const headers = ['Booking ID', 'Passenger', 'Driver', 'Vehicle', 'Pickup Arrival', 'Pickup Departure', 'Start Odometer', 'Dropoff Arrival', 'Dropoff Departure', 'End Odometer', 'Trip Miles', 'Signature Captured', 'Validation', 'Sync Status', 'Error'];
    const rows = enrichedTrips.map(trip => {
      const log = latestByTrip.get(trip.id);
      return [
        `"${trip.bookingId || trip.id || ''}"`,
        `"${(trip.patient || trip.clientName || '').replace(/"/g, '""')}"`,
        `"${(trip._payload?.driver || trip.completedDriverName || '').replace(/"/g, '""')}"`,
        `"${(trip._payload?.vehicle || '').replace(/"/g, '""')}"`,
        `"${trip._payload?.pickup?.arrival || ''}"`,
        `"${trip._payload?.pickup?.departure || ''}"`,
        `"${trip._payload?.pickup?.mileage ?? ''}"`,
        `"${trip._payload?.dropoff?.arrival || ''}"`,
        `"${trip._payload?.dropoff?.departure || ''}"`,
        `"${trip._payload?.dropoff?.mileage ?? ''}"`,
        `"${trip._payload?.pickup?.mileage != null && trip._payload?.dropoff?.mileage != null ? Math.max(0, trip._payload.dropoff.mileage - trip._payload.pickup.mileage) : ''}"`,
        `"${trip._payload?.dropoff?.signatureCaptured ? 'Yes' : 'No'}"`,
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

  const todayStr = new Date().toLocaleDateString('en-CA');
  const coveragePct = Math.min(100, healthScore);
  const coverageBarColor = coverage.coverageComplete ? 'bg-emerald-500' : coveragePct >= 75 ? 'bg-amber-400' : 'bg-rose-500';
  const issueCount = failedLogs.length + Number(coverage.invalid || 0);
  const agentHealth = worker?.agentV5 || worker?.agentV4;
  const portalHealthy = workerHealthy && canaryHealthy && agentHealth?.healthy !== false;
  const portalStatusLabel = agentHealth?.healthy === false
    ? 'Agent needs attention'
    : workerStatusLabel === 'Online'
      ? (canaryHealthy ? 'Portal ready' : 'Portal verification needed')
      : workerStatusLabel;
  const portalStatusTitle = [
    agentHealth ? `Agent ${agentHealth.healthy ? 'healthy' : 'needs attention'}` : 'Agent status unavailable',
    `Portal contract ${canaryHealthy ? 'verified' : 'not verified'}`,
    workerStatusLabel,
  ].join(' · ');

  return (
    <div ref={pageRef} className="flex flex-col h-full min-h-0 overflow-hidden" tabIndex={-1}>

      {/* One compact, authoritative toolbar. Counts and status are not repeated. */}
      <div className="shrink-0 border-b border-slate-200 bg-white shadow-sm">
        <div
          data-testid="welltrans-toolbar"
          className="app-filter-bar !flex-nowrap gap-1.5 px-2 py-1.5"
        >
          <div className="flex h-8 shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-2.5 text-[10px] font-bold text-white">
            <Sparkles size={12} className="text-blue-300" />
            <span className="hidden tracking-wider 2xl:inline">PORTAL COMPLETION</span>
            <span className="tracking-wider 2xl:hidden">PORTAL</span>
          </div>

          <div className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            <button
              onClick={() => navigateDate(-1)}
              title="Previous day (←)"
              aria-label="Previous service date"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-800"
            >
              <ChevronLeft size={14} />
            </button>
            <input
              type="date"
              value={syncDate}
              disabled={Boolean(busy)}
              onChange={event => changeSyncDate(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'ArrowLeft') { event.preventDefault(); navigateDate(-1); }
                if (event.key === 'ArrowRight') { event.preventDefault(); navigateDate(1); }
              }}
              aria-label="Service date"
              className="h-7 w-[96px] bg-transparent px-1 text-[10px] font-bold text-slate-900 outline-none disabled:cursor-not-allowed 2xl:w-[112px]"
            />
            <button
              onClick={() => navigateDate(1)}
              title="Next day (→)"
              aria-label="Next service date"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-800"
            >
              <ChevronRight size={14} />
            </button>
            {syncDate !== todayStr && (
              <button
                onClick={() => changeSyncDate(todayStr)}
                title="Go to today"
                className="h-7 rounded-lg bg-blue-50 px-2 text-[9px] font-bold text-blue-700 transition hover:bg-blue-100"
              >
                Today
              </button>
            )}
          </div>

          <div
            className="flex h-8 min-w-0 shrink items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2"
            title={`Coverage ${coveragePct}% — ${successfulCount} of ${completedTrips.length} verified`}
          >
            <BarChart3 size={11} className="hidden shrink-0 text-slate-400 2xl:block" />
            <strong className={`text-[11px] ${coverage.coverageComplete ? 'text-emerald-600' : coveragePct >= 75 ? 'text-amber-600' : 'text-rose-600'}`}>
              {coveragePct}%
            </strong>
            <span className="text-[9px] font-semibold text-slate-600">{successfulCount}/{completedTrips.length} verified</span>
            <div className="hidden h-1 w-10 shrink-0 overflow-hidden rounded-full bg-slate-200 2xl:block">
              <div className={`h-full rounded-full transition-all duration-500 ${coverageBarColor}`} style={{ width: `${coveragePct}%` }} />
            </div>
            {stagedCount > 0 && <span className="text-[9px] font-bold text-purple-700">{stagedCount} review</span>}
            {issueCount > 0 && <span className="text-[9px] font-bold text-rose-700">{issueCount} issues</span>}
          </div>

          <button
            type="button"
            onClick={() => setShowInstallHelp(true)}
            title={`${portalStatusTitle} — open agent setup`}
            className={`flex h-8 w-[92px] min-w-0 shrink-0 items-center gap-1.5 rounded-xl border px-2 text-[9px] font-bold transition 2xl:w-auto ${
              portalHealthy
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            <ShieldCheck size={11} className="shrink-0" />
            <span className="max-w-[132px] truncate">{portalStatusLabel}</span>
          </button>

          <select value={driverScopeId} disabled={stagedCount > 0 || Boolean(busy)} onChange={event => {
            setDriverScopeId(event.target.value);
            setSelectedIds([]);
            setQueuePage(0);
          }} aria-label="Choose drivers to fill"
            title="Fill every driver or isolate one authoritative driver batch"
            className="h-8 w-[100px] min-w-0 rounded-xl border border-indigo-200 bg-indigo-50 px-2 text-[9px] font-bold text-indigo-800 outline-none focus:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 2xl:w-[clamp(112px,11vw,180px)]">
            <option value="all">All drivers ({allCompletedTrips.length})</option>
            {driverScopes.map(item => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.total}) · {item.state === 'done' ? 'DONE' : item.state}
              </option>
            ))}
          </select>

          <button disabled={!settings.enabled || Boolean(busy)} onClick={startAndFillDate}
            title={selectedDriverScope ? `Open WellTrans and fill ${selectedDriverScope.name}` : 'Open WellTrans and reconcile every completed trip'}
            className="flex h-8 shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-2.5 text-[9px] font-bold text-white transition hover:bg-blue-700 disabled:opacity-40">
            {busy === 'start-fill' ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
            Open &amp; Fill ({completedTrips.length})
          </button>

          {stagedCount > 0 && (
            <button disabled={!workerBatchReady || Boolean(busy)} onClick={confirmReviewBatchApplied}
              title={workerBatchReady ? 'Confirm your manual Apply, then run live portal verification' : reviewState.reasons.join(' ')}
              className="flex h-8 shrink-0 items-center gap-1 rounded-xl border border-purple-300 bg-purple-600 px-2 text-[9px] font-bold text-white transition hover:bg-purple-700 disabled:opacity-40">
              <CheckCircle2 size={10} /> Applied — Verify ({stagedCount})
            </button>
          )}

          {selectedIds.length > 0 && (
            <button disabled={!settings.enabled || Boolean(busy)} onClick={() => runQueue(selectedIds, 'selected')}
              className="h-8 shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-2 text-[9px] font-bold text-blue-700 transition disabled:opacity-40">
              Sync ({selectedIds.length})
            </button>
          )}

          {retryableFailed.length > 0 && (
            <button disabled={!workerDateMatches || Boolean(busy)} onClick={() => runQueue(retryableFailed.map(log => log.tripId), 'retry')}
              className="flex h-8 shrink-0 items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-2 text-[9px] font-bold text-amber-700 transition disabled:opacity-40">
              <RefreshCw size={10} /> Retry ({retryableFailed.length})
            </button>
          )}

          <button
            onClick={exportAllTripsCSV}
            title="Export current trips"
            aria-label="Export current trips"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-white text-slate-600 transition hover:bg-emerald-50"
          >
            <Download size={11} />
          </button>

          <div className="flex h-8 shrink-0 items-center rounded-xl bg-slate-100 p-0.5">
            {[
              ['queue', 'Trips'],
              ['logs', 'History'],
              ...(canManageWellTransCredentials ? [['settings', 'Settings']] : []),
            ].map(([id, label]) => (
              <button key={id} onClick={() => {
                if (id === 'settings' && !draftSettings) setDraftSettings({ ...settings, fieldMapping: { ...settings.fieldMapping } });
                setTab(id);
              }} aria-pressed={tab === id} className={`h-7 rounded-lg px-2 text-[9px] font-semibold transition ${tab === id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'queue' && (
            <>
              <div className="relative !min-w-[84px] flex-1">
                <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Search trips…" value={searchQuery} onChange={event => setSearchQuery(event.target.value)}
                  className="h-8 w-full rounded-xl border border-slate-200 bg-white pl-6 pr-2 text-[9px] outline-none focus:border-blue-400" />
              </div>
              <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}
                aria-label="Filter portal trips"
                className="h-8 w-[82px] shrink-0 rounded-xl border border-slate-200 bg-white px-1.5 text-[9px] font-semibold text-slate-600 outline-none">
                <option value="all">All trips</option>
                <option value="ready">Not queued</option>
                <option value="staged">Review</option>
                <option value="synced">Verified</option>
                <option value="failed">Failed</option>
                <option value="invalid">Invalid</option>
              </select>
            </>
          )}
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

      {/* Notifications */}
      {operationsNeedsAttention && ['critical', 'degraded'].includes(operations.state) && (
        <div className={`shrink-0 flex items-center gap-2 border-b px-4 py-2 text-xs font-semibold ${
          operations.state === 'critical'
            ? 'border-rose-200 bg-rose-50 text-rose-800'
            : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}>
          <AlertTriangle size={14} className="shrink-0" />
          <span>
            Operations {operations.state}: {liveActiveAgentCount} live agents,
            {' '}{operations.staleProcessingCount || 0} stuck jobs,
            {' '}{operations.blockedDateCount || 0} blocked dates
            {operations.canaryPassed === false ? ', portal contract failed.' : '.'}
          </span>
        </div>
      )}
      {agentRelease?.signed === false && showInstallHelp && (
        <div className="shrink-0 flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] font-semibold text-amber-800">
          <ShieldCheck size={13} className="shrink-0" />
          The current Agent package is integrity-checked but not Authenticode-signed. Organization-managed Windows computers may require a trusted publisher certificate.
        </div>
      )}
      {notice && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-200 text-xs font-medium text-blue-800">
          <CheckCircle2 size={14} className="shrink-0" />
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice('')} className="text-blue-500 hover:text-blue-700"><X size={14} /></button>
        </div>
      )}

      {/* Worker warnings */}
      {(workerUpgradeRequired || workerReviewError || workerNeedsDate
        || (workerCalibrated && !workerDateMatches)
        || coverage.missingCount > 0 || coverage.invalid > 0 || coverage.unverifiedCompleted > 0) && (
        <div className="shrink-0 border-b border-slate-100 bg-white px-4 py-2 space-y-1.5">
          {workerReviewError && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-300 px-3 py-2 text-[11px] font-semibold text-rose-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                Safety stop: this WellTrans review session contains unverified edits. Do not click Apply.
                Click Close in the Edit Itinerary window, close that agent browser, then click Reconcile &amp; Fill Date
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
          {(coverage.missingCount > 0 || coverage.invalid > 0 || coverage.unverifiedCompleted > 0) && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-1.5 text-[11px] font-medium text-rose-700">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                {coverage.unverifiedCompleted > 0
                  ? `${coverage.unverifiedCompleted} Applied trip(s) are still awaiting live portal verification. `
                  : ''}
                {coverage.missingCount + coverage.invalid > 0
                  ? `${coverage.missingCount + coverage.invalid} completed trip(s) need correction or reconciliation. `
                  : ''}
                The date remains locked until every completed trip is independently verified.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Tabs + content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
        ) : tab === 'queue' ? (
          <div className="app-table-frame flex-1 overflow-y-auto">
            <table className="w-full table-fixed text-left text-[11px]">
              <colgroup>
                <col className="w-[3%]" />
                <col className="w-[8%]" />
                <col className="w-[9%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[5%]" />
                <col className="w-[5%]" />
                <col className="w-[6%]" />
                <col className="w-[5%]" />
                <col className="w-[5%]" />
                <col className="w-[6%]" />
                <col className="w-[5%]" />
                <col className="w-[5%]" />
                <col className="w-[8%]" />
                <col className="w-[7%]" />
                <col className="w-[6%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 border-b border-blue-700 bg-blue-600 text-white shadow-sm">
                <tr>
                  <th className="px-2 py-2 font-semibold">
                    <input type="checkbox" className="rounded border-blue-300"
                      onChange={() => setSelectedIds(ids => selectableFilteredTrips.every(t => ids.includes(t.id))
                        ? ids.filter(id => !selectableFilteredTrips.some(t => t.id === id))
                        : [...new Set([...ids, ...selectableFilteredTrips.map(t => t.id)])])}
                      checked={selectableFilteredTrips.length > 0 && selectableFilteredTrips.every(t => selectedIds.includes(t.id))} />
                  </th>
                  <th className="px-2 py-2 font-semibold">Booking</th>
                  <th className="px-2 py-2 font-semibold">Passenger</th>
                  <th className="px-2 py-2 font-semibold">Driver</th>
                  <th className="px-2 py-2 font-semibold">Vehicle</th>
                  <th className="px-2 py-2 font-semibold">PU arrive</th>
                  <th className="px-2 py-2 font-semibold">PU depart</th>
                  <th className="px-2 py-2 font-semibold">Start odo</th>
                  <th className="px-2 py-2 font-semibold">DO arrive</th>
                  <th className="px-2 py-2 font-semibold">DO depart</th>
                  <th className="px-2 py-2 font-semibold">End odo</th>
                  <th className="px-2 py-2 font-semibold">Miles</th>
                  <th className="px-2 py-2 font-semibold">Signed</th>
                  <th className="px-2 py-2 font-semibold">Validation</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                  <th className="px-2 py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTrips.length === 0 ? (
                  <tr><td colSpan={16} className="px-3 py-8 text-center text-xs text-slate-400">No trips for this date.</td></tr>
                ) : displayedTrips.map(trip => {
                  const latest = latestByTrip.get(trip.id);
                  const unmatched = latest?.status === 'failed' && !isWellTransFailureRetryable(latest);
                  const isEditing = editingTrip?.id === trip.id;
                  const draft = isEditing ? editingTrip : null;
                  const inlineInputClass = 'w-full min-w-0 rounded-md border border-blue-400 bg-white px-1.5 py-1 font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-200';
                  const draftMiles = calculateWellTransDraftMileage(draft);
                  return (
                    <React.Fragment key={trip.id}>
                    <tr className={`group ${isEditing ? 'bg-blue-50/80' : 'cursor-pointer hover:bg-slate-50/50'} ${recentlySavedTripId === trip.id ? 'ring-1 ring-inset ring-emerald-300' : ''}`} onClick={() => { if (!isEditing) setTripDrawer(trip); }}>
                      <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" disabled={!trip._valid}
                          checked={selectedIds.includes(trip.id)}
                          onChange={() => setSelectedIds(ids => ids.includes(trip.id) ? ids.filter(id => id !== trip.id) : [...ids, trip.id])}
                          className="rounded border-slate-300" />
                      </td>
                      <td className="px-2 py-2 font-mono font-semibold text-blue-600" onClick={event => event.stopPropagation()}>
                        {isEditing ? <input value={draft.bookingId || ''} onChange={event => setEditingTrip(current => ({ ...current, bookingId: event.target.value }))} className={inlineInputClass} aria-label="Booking ID" /> : displayScalar(trip.bookingId || trip.id)}
                      </td>
                      <td className="px-2 py-2 font-medium text-slate-900" title={trip.patient || trip.clientName} onClick={event => event.stopPropagation()}>
                        {isEditing ? <input value={draft.patient || ''} onChange={event => setEditingTrip(current => ({ ...current, patient: event.target.value }))} className={inlineInputClass} aria-label="Passenger" /> : <span className="block truncate">{displayScalar(trip.patient || trip.clientName)}</span>}
                      </td>
                      <td className="px-2 py-2 text-slate-700" title={trip._payload?.driver} onClick={event => event.stopPropagation()}>
                        {isEditing ? (
                          <select value={draft.driverId || ''} onChange={event => {
                            const driver = drivers.find(candidate => candidate.id === event.target.value);
                            setEditingTrip(current => ({ ...current, driverId: event.target.value, completedDriverName: driver?.name || '', completedVehicle: current.completedVehicle || driver?.vehicle || '' }));
                          }} className={inlineInputClass} aria-label="Driver">
                            <option value="">Unassigned</option>
                            {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name || driver.email}</option>)}
                          </select>
                        ) : <span className="block truncate">{displayScalar(trip._payload?.driver || trip.completedDriverName)}</span>}
                      </td>
                      <td className="px-2 py-2 text-slate-700" title={trip._payload?.vehicle} onClick={event => event.stopPropagation()}>
                        {isEditing ? (
                          <select value={draft.completedVehicle || ''}
                            onChange={event => setEditingTrip(current => ({ ...current, completedVehicle: event.target.value }))}
                            className={inlineInputClass} aria-label="Vehicle">
                            <option value="">Leave WellTrans vehicle blank</option>
                            {draft.completedVehicle && !vehicleOptions.some(option => option.name === draft.completedVehicle) && (
                              <option value={draft.completedVehicle}>{draft.completedVehicle} (current)</option>
                            )}
                            {vehicleOptions.map(option => (
                              <option key={option.name} value={option.name}>
                                {option.name}{option.plate ? ` (${option.plate})` : ''}
                              </option>
                            ))}
                          </select>
                        ) : <span className="block truncate">{displayScalar(trip._payload?.vehicle)}</span>}
                      </td>
                      {[
                        ['_pickupArrival', trip._payload?.pickup?.arrival, 'text-emerald-700', 'Pickup arrival'],
                        ['_pickupDeparture', trip._payload?.pickup?.departure, 'text-emerald-700', 'Pickup departure'],
                      ].map(([field, value, tone, label]) => (
                        <td key={field} className={`px-2 py-2 font-mono ${tone}`} onClick={event => event.stopPropagation()}>
                          {isEditing ? <input type="time" value={draft[field] || ''} onChange={event => setEditingTrip(current => ({ ...current, [field]: event.target.value }))} className={inlineInputClass} aria-label={label} /> : (value || '—')}
                        </td>
                      ))}
                      <td className="px-2 py-2 font-mono text-emerald-700" onClick={event => event.stopPropagation()}>
                        {isEditing ? <input type="number" min="0" value={draft._pickupOdometer} onChange={event => setEditingTrip(current => ({ ...current, _pickupOdometer: event.target.value }))} className={inlineInputClass} aria-label="Start odometer" /> : (trip._payload?.pickup?.mileage ?? '—')}
                      </td>
                      {[
                        ['_dropoffArrival', trip._payload?.dropoff?.arrival, 'Dropoff arrival'],
                        ['_dropoffDeparture', trip._payload?.dropoff?.departure, 'Dropoff departure'],
                      ].map(([field, value, label]) => (
                        <td key={field} className="px-2 py-2 font-mono text-rose-700" onClick={event => event.stopPropagation()}>
                          {isEditing ? <input type="time" value={draft[field] || ''} onChange={event => setEditingTrip(current => ({ ...current, [field]: event.target.value }))} className={inlineInputClass} aria-label={label} /> : (value || '—')}
                        </td>
                      ))}
                      <td className="px-2 py-2 font-mono text-rose-700" onClick={event => event.stopPropagation()}>
                        {isEditing ? <input type="number" min="0" value={draft._dropoffOdometer} onChange={event => setEditingTrip(current => ({ ...current, _dropoffOdometer: event.target.value }))} className={inlineInputClass} aria-label="End odometer" /> : (trip._payload?.dropoff?.mileage ?? '—')}
                      </td>
                      <td className="px-2 py-2 font-mono font-semibold text-blue-600">{isEditing ? (draftMiles ?? '—') : (trip._payload?.pickup?.mileage != null && trip._payload?.dropoff?.mileage != null ? Math.max(0, trip._payload.dropoff.mileage - trip._payload.pickup.mileage) : '—')}</td>
                      <td className="px-2 py-2 text-center font-semibold text-emerald-700" onClick={event => event.stopPropagation()}>
                        {isEditing ? <input type="checkbox" checked={draft._signed} onChange={event => setEditingTrip(current => ({ ...current, _signed: event.target.checked }))} className="h-5 w-5 rounded border-slate-300 text-emerald-600" aria-label="Signature captured" /> : (trip._payload?.dropoff?.signatureCaptured ? 'Yes' : 'No')}
                      </td>
                      <td className="px-2 py-2 relative">
                        {isEditing ? (
                          <span className="text-[10px] font-semibold text-blue-700">Editing source</span>
                        ) : recentlySavedTripId === trip.id ? (
                          <span className="text-[10px] font-semibold text-emerald-700">Saved</span>
                        ) : unmatched ? (
                          <span className="text-[10px] font-semibold text-amber-600">Not Found</span>
                        ) : trip._valid ? (
                          <span className="text-[10px] font-semibold text-emerald-600">Valid</span>
                        ) : (
                          <button type="button" onClick={(event) => { event.stopPropagation(); beginTripEdit(trip); }}
                            className="text-left text-[10px] font-semibold text-rose-600 underline decoration-rose-200 underline-offset-2 hover:text-rose-800"
                            title={`${trip._errors?.join('; ') || 'Invalid'} — click to correct`}>
                            {trip._errors?.[0] || 'Invalid'}
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                          latest?.status === 'completed' && latest?.portalVerification?.verified !== true
                            ? 'border border-blue-200 bg-blue-50 text-blue-700'
                            : statusStyle[latest?.status] || 'bg-slate-100 text-slate-500'
                        }`}>
                          {latest?.status === 'completed' && latest?.portalVerification?.verified !== true
                            ? 'Verifying Apply'
                            : statusLabel[latest?.status] || 'Not queued'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {onUpdateTrip && (isEditing ? (
                            <>
                              <button type="button" onClick={saveTripEdit} disabled={savingTripId === trip.id}
                                className="rounded bg-emerald-100 p-1.5 text-emerald-700 transition hover:bg-emerald-200 disabled:opacity-50" title="Save changes">
                                {savingTripId === trip.id ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                              </button>
                              <button type="button" onClick={() => setEditingTrip(null)} disabled={savingTripId === trip.id}
                                className="rounded bg-rose-50 p-1.5 text-rose-600 transition hover:bg-rose-100 disabled:opacity-50" title="Cancel changes">
                                <X size={13} />
                              </button>
                            </>
                          ) : (
                            <button type="button" onClick={() => beginTripEdit(trip)}
                              className={`rounded p-1 transition ${trip._valid ? 'text-slate-400 hover:bg-blue-50 hover:text-blue-600' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'}`} title="Edit this row">
                              <Edit2 size={13} />
                            </button>
                          ))}
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
                    </React.Fragment>
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
                      {displayScalar(log.status, 'unknown')}
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-blue-600 shrink-0">{displayScalar(log.bookingId || log.tripId)}</span>
                    <span className="flex-1 text-[11px] text-slate-500 truncate">{displayScalar(log.errorMessage || log.stage, 'Completed')}</span>
                    {log.screenshot && <Image size={12} className="text-slate-300 group-hover:text-blue-500 shrink-0 transition" />}
                    <span className="text-[10px] text-slate-400 shrink-0">{displayTimestamp(log.completedAt || log.stagedAt || log.createdAt)}</span>
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
                  <p className="text-[11px] font-semibold text-slate-900">{displayScalar(log.bookingId || log.tripId)}</p>
                  <p className="text-[10px] text-slate-500 truncate">{displayScalar(log.stage, 'Queued')} · {displayScalar(log.status, 'unknown')}</p>
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">
                  {displayTimestamp(log.updatedAt || log.createdAt)}
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
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-900">
                    <KeyRound size={13} /> Secure local WellTrans sign-in
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-emerald-800">
                    Encrypted on this computer only. The username and password are never saved in Firestore,
                    included in a URL, or shared with another Agent computer.
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${
                  !credentialUnlocked
                    ? 'bg-slate-200 text-slate-700'
                    : credentialStatus.loading
                    ? 'bg-slate-100 text-slate-500'
                    : credentialStatus.connected
                      ? credentialStatus.configured
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-700'
                }`}>
                  {!credentialUnlocked
                    ? 'Locked'
                    : credentialStatus.loading
                    ? 'Checking'
                    : credentialStatus.connected
                      ? credentialStatus.configured ? 'Saved locally' : 'Not configured'
                      : 'Agent offline'}
                </span>
              </div>
              {!canManageWellTransCredentials ? (
                <div className="rounded-lg border border-slate-200 bg-white p-3 text-[10px] font-semibold text-slate-600">
                  An administrator or owner must unlock and manage the local WellTrans credentials.
                </div>
              ) : !credentialUnlocked ? (
                <form
                  className="rounded-lg border border-emerald-200 bg-white p-3"
                  onSubmit={async event => {
                    event.preventDefault();
                    setCredentialUnlockBusy(true);
                    setCredentialError('');
                    try {
                      const user = auth.currentUser;
                      if (!user?.email) throw new Error('The signed-in Agape account does not support password verification.');
                      const credential = EmailAuthProvider.credential(user.email, credentialUnlockPassword);
                      await reauthenticateWithCredential(user, credential);
                      setCredentialUnlockPassword('');
                      setCredentialUnlocked(true);
                    } catch (error) {
                      const code = String(error?.code || '');
                      setCredentialError(
                        /invalid-credential|wrong-password/i.test(code)
                          ? 'The Agape account password is incorrect.'
                          : error?.message || 'Account verification failed.',
                      );
                    } finally {
                      setCredentialUnlockBusy(false);
                    }
                  }}
                >
                  <label className="text-[10px] font-semibold text-emerald-900">Agape account password</label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="password"
                      value={credentialUnlockPassword}
                      autoComplete="current-password"
                      onChange={event => setCredentialUnlockPassword(event.target.value)}
                      placeholder="Verify your identity"
                      className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500"
                    />
                    <button
                      type="submit"
                      disabled={credentialUnlockBusy || !credentialUnlockPassword}
                      className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      <Lock size={11} /> {credentialUnlockBusy ? 'Verifying…' : 'Unlock'}
                    </button>
                  </div>
                  {credentialError && <p className="mt-2 text-[10px] font-semibold text-rose-700">{credentialError}</p>}
                  <p className="mt-2 text-[9px] text-slate-500">
                    Unlocks credential management for five minutes. The saved WellTrans password is never displayed.
                  </p>
                </form>
              ) : (
                <>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] font-semibold text-emerald-900">Login name</label>
                  <input
                    value={credentialDraft.username}
                    autoComplete="username"
                    onChange={event => setCredentialDraft(current => ({ ...current, username: event.target.value }))}
                    placeholder="WellTrans username"
                    className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-emerald-900">Password</label>
                  <input
                    type="password"
                    value={credentialDraft.password}
                    autoComplete="current-password"
                    onChange={event => setCredentialDraft(current => ({ ...current, password: event.target.value }))}
                    placeholder={credentialStatus.configured ? 'Enter to replace saved password' : 'WellTrans password'}
                    className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              {credentialError && <p className="text-[10px] font-semibold text-rose-700">{credentialError}</p>}
              {!credentialStatus.connected && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCredentialError('Starting the secure local Agent service…');
                      openLocalAgent();
                      window.setTimeout(() => setCredentialRefreshKey(value => value + 1), 2500);
                    }}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-semibold text-white hover:bg-blue-700"
                  >
                    Start local Agent
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCredentialError('');
                      setCredentialRefreshKey(value => value + 1);
                    }}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-[10px] font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    Retry connection
                  </button>
                  <span className="text-[9px] text-amber-800">
                    Your open WellTrans review window will remain open and unchanged.
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={Boolean(credentialBusy) || !credentialDraft.username.trim() || !credentialDraft.password}
                  onClick={async () => {
                    setCredentialBusy('save');
                    setCredentialError('');
                    try {
                      const result = await saveLocalWellTransCredentials(
                        credentialDraft.username.trim(),
                        credentialDraft.password,
                      );
                      setCredentialStatus({
                        loading: false, connected: true, configured: true, username: result.username,
                      });
                      setCredentialDraft({ username: result.username, password: '' });
                      setNotice('WellTrans credentials encrypted on this computer. Automatic sign-in is ready.');
                    } catch (error) {
                      setCredentialError(error?.message || 'Could not reach the local Agent.');
                    } finally {
                      setCredentialBusy('');
                    }
                  }}
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {credentialBusy === 'save' ? 'Encrypting…' : 'Save on this computer'}
                </button>
                {credentialStatus.configured && (
                  <button
                    type="button"
                    disabled={Boolean(credentialBusy)}
                    onClick={async () => {
                      setCredentialBusy('clear');
                      setCredentialError('');
                      try {
                        await clearLocalWellTransCredentials();
                        setCredentialStatus({ loading: false, connected: true, configured: false, username: '' });
                        setCredentialDraft({ username: '', password: '' });
                        setNotice('Saved WellTrans credentials removed from this computer.');
                      } catch (error) {
                        setCredentialError(error?.message || 'Could not reach the local Agent.');
                      } finally {
                        setCredentialBusy('');
                      }
                    }}
                    className="flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <Trash2 size={11} /> Remove
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCredentialUnlocked(false);
                    setCredentialDraft({ username: '', password: '' });
                    setCredentialStatus({ loading: false, connected: false, configured: false, username: '' });
                    setCredentialError('');
                  }}
                  className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <Lock size={11} /> Lock
                </button>
              </div>
                </>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
              <p className="text-xs font-semibold text-slate-900 flex items-center gap-1.5"><Activity size={13} /> Self-Control</p>
              <p className="text-[10px] text-slate-500">
                Automated staging with mandatory operator review before Apply.
              </p>
              {[
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
                  ['Driver', tripDrawer.completedDriverName || tripDrawer._payload?.driver || '—'],
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
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
                  'Select the service date and click Reconcile & Fill Date.',
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
