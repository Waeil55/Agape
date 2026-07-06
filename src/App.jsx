import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import {
  Truck, Users, MapPin, Clock, Search, ShieldCheck,
  ArrowRight, CheckCircle2, Archive, Map as MapIcon, LogOut, AlertTriangle,
  Settings, BrainCircuit, Zap,
  Target, Upload, AlertCircle,
  Activity, Wand2, Lock, Briefcase, User,
  RefreshCcw, X, MessageCircle
} from 'lucide-react';
import { auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, setPersistence, browserLocalPersistence, browserSessionPersistence, doc, getDoc, getDocFromServer, setDoc, deleteDoc, collection, addDoc, getDocs, getDocsFromServer, serverTimestamp, onSnapshot, query, where } from './config/firebase';
import { suggestOptimalDriver, suggestBatchAssignment } from './config/ai';

import { hasPermission } from './constants/roles';
import { timeToMinutes, tripCalendarDateKey, tripMatchesTodayOrTomorrow, isCalendarDateKeyWithinLastDays } from './utils/tripDate';
import { cleanPhone } from './utils/smartContacts';
import { filterDriversForRole, filterTripsForRole, getDispatcherForUser, isDriverAssignedToDispatcher, isTripInDispatcherScope, normalizeEmail } from './utils/accessControl';
import { requestNotificationPermission, showLocalNotification, onForegroundMessage } from './config/notifications';
import { playMessageSound, playNotificationSound, initAudioContext } from './utils/notificationSound';
import { makeCall, sendSMS } from './utils/nativeActions';
import { initPlatform } from './utils/platform';
import {
  buildTelemetryDocId,
  deriveMovementState,
  getDriverTelemetryForDate,
  shouldAppendBreadcrumb,
  todayLocal,
  trimTelemetryCollections,
} from './utils/driverTelemetry';
import { buildLocationFraudSignals } from './utils/locationFraud';
import { buildLocationEvent, emitSystemEvent } from './services/firestoreEventEngine';
import './utils/clientExport';
import { registerServiceWorker, setupSWMessageHandler, skipWaiting } from './utils/swManager';
import { syncQueueProcessor } from './services/syncQueueProcessor';
import { useFirestoreAppData } from './hooks/useFirestoreAppData';
import { useRealtimeReliability } from './hooks/useRealtimeReliability';
import { useDriverLiveState, useDriverLivenessMonitor } from './hooks/useDriverLiveState';
import { useDriverAssignments } from './hooks/useDriverAssignments';
import { PWAInstallPrompt, PWAUpdatePrompt, OfflineIndicator } from './components/pwa';

const ALLOW_SELF_PROVISIONING = import.meta.env.VITE_ALLOW_SELF_PROVISIONING === 'true';

const APP_VERSION_KEY = 'agape_app_version';
const APP_VERSION = 'v356';
const ROLE_CACHE_KEY = 'agape_session_v1';
const VALID_ROLES = new Set(['admin', 'dispatcher', 'driver']);
const ROLE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REPAIR_STORAGE_KEYS = [
  ROLE_CACHE_KEY,
  APP_VERSION_KEY,
  'agape_mobileDriverWorkDriverId',
  'agape_reportsDesktopView',
];

function removeStorageKeys(storage, keys = []) {
  if (!storage) return;
  keys.forEach((key) => {
    try { storage.removeItem(key); } catch {}
  });
}

async function clearAgapeStaticCaches() {
  if (typeof window === 'undefined' || !window.caches) return;
  const cacheNames = await window.caches.keys();
  await Promise.all(
    cacheNames
      .filter((name) => /^agape-|^workbox-|vite/i.test(name))
      .map((name) => window.caches.delete(name))
  );
}

async function repairBrowserStatePreservingAuth() {
  await clearAgapeStaticCaches();
  try { removeStorageKeys(window.localStorage, REPAIR_STORAGE_KEYS); } catch {}
  try { removeStorageKeys(window.sessionStorage, REPAIR_STORAGE_KEYS); } catch {}
  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.getRegistrations) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister().catch(() => null)));
  }
}

// Version changes should refresh stale app assets, never wipe Firebase Auth IndexedDB.
try {
  const storedVersion = localStorage.getItem(APP_VERSION_KEY);
  if (storedVersion && storedVersion !== APP_VERSION) {
    localStorage.setItem(APP_VERSION_KEY, APP_VERSION);
    const reloadKey = `${APP_VERSION_KEY}_reload_${APP_VERSION}`;
    if (!sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, '1');
      clearAgapeStaticCaches().finally(() => window.location.reload());
    }
  } else {
    localStorage.setItem(APP_VERSION_KEY, APP_VERSION);
  }
} catch {
  // Storage can be unavailable in restricted browser modes; let Firebase handle auth state.
}

// Lazy-loaded heavy components
const lazyWithRetry = (componentImport) =>
  lazy(async () => {
    try {
      return await componentImport();
    } catch (error) {
      console.warn('[LazyLoad] Chunk load failed, clearing cache and reloading...', error);
      try { caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))).catch(() => {}); } catch {}
      window.location.reload();
      return { default: LazyFallback };
    }
  });

const LiveMapPage = lazyWithRetry(() => import('./components/LiveMapPage'));
const DispatchAssistant = lazyWithRetry(() => import('./components/DispatchAssistant'));
const FileUploadTrips = lazyWithRetry(() => import('./components/FileUploadTrips'));
const ReportsPage = lazyWithRetry(() => import('./components/ReportsPage'));
const DriverPage = lazyWithRetry(() => import('./components/DriverPage'));
const EnterpriseDashboard = lazyWithRetry(() => import('./components/EnterpriseDashboard'));
const AddTripModal = lazyWithRetry(() => import('./components/AddTripModal'));

const LazyFallback = () => <div className="flex items-center justify-center p-12"><div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" /></div>;

const Badge = ({ children, variant = 'info' }) => {
  const variants = {
    info: "badge-info",
    success: "badge-success",
    warning: "badge-warning",
    danger: "badge-danger",
    ai: "badge-info",
  };
  return <span className={`badge ${variants[variant]}`}>{children}</span>;
};

const getLogTextColor = (color) => {
  const colors = { amber: 'text-amber-600', emerald: 'text-emerald-600', rose: 'text-rose-600', blue: 'text-blue-600', indigo: 'text-indigo-600' };
  return colors[color] || 'text-slate-600';
};

const todayStr = new Date().toISOString().split('T')[0];
const DRIVER_HISTORY_LOOKBACK_DAYS = 14;
const DRIVER_HISTORY_STATUSES = new Set(['completed', 'cancelled', 'canceled', 'no show', 'no_show', 'rerouted']);
const normalizeTripStatus = (status) => String(status || '').trim().toLowerCase();
const getTripHistoryDateKey = (trip) => {
  const dateKey = tripCalendarDateKey(trip?.date);
  const completedKey = tripCalendarDateKey(trip?.completedAt);
  if (!dateKey) return completedKey;
  if (!completedKey) return dateKey;
  return dateKey > completedKey ? dateKey : completedKey;
};
const isRecentDriverHistoryTrip = (trip) => (
  DRIVER_HISTORY_STATUSES.has(normalizeTripStatus(trip?.status))
  && isCalendarDateKeyWithinLastDays(getTripHistoryDateKey(trip), DRIVER_HISTORY_LOOKBACK_DAYS)
);

function isTripLate(tripTime) {
  if (!tripTime || tripTime === 'Will Call') return false;
  const now = new Date();
  const timeVal = timeToMinutes(tripTime);
  const scheduled = new Date();
  scheduled.setHours(Math.floor(timeVal / 60), timeVal % 60, 0, 0);
  return now > scheduled;
}

const DEFAULT_APP_SETTINGS = {
  theme: 'light',
  fontScale: 'md',
  readability: 'normal',
  navigationApp: 'google',
  routePlanNavApp: 'google',
};

const INTERNAL_AUTH_DOMAIN = 'auth.agapecare.local';

function normalizeUsername(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

function isEmailLike(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isInternalAuthEmail(value = '') {
  return String(value || '').trim().toLowerCase().endsWith(`@${INTERNAL_AUTH_DOMAIN}`);
}

function usernameToAuthEmail(username = '') {
  const normalized = normalizeUsername(username);
  return normalized ? `${normalized}@${INTERNAL_AUTH_DOMAIN}` : '';
}

function authEmailToUsername(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.endsWith(`@${INTERNAL_AUTH_DOMAIN}`)) {
    return normalized.split('@')[0];
  }
  return normalized.split('@')[0] || normalized;
}

function resolveAuthIdentifier(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return { authEmail: '', username: '' };
  if (isEmailLike(raw) && !isInternalAuthEmail(raw)) {
    return { authEmail: raw.toLowerCase(), username: authEmailToUsername(raw) };
  }
  const username = normalizeUsername(raw);
  return { authEmail: usernameToAuthEmail(username), username };
}

function buildDriverProfileFromEmail(email, uid = '') {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const seed = (uid || normalizedEmail.replace(/[^a-z0-9]/gi, '')).slice(0, 4).toUpperCase() || 'USER';
  const name = authEmailToUsername(normalizedEmail) || 'Driver';
  return {
    id: `DRV-${seed}`,
    name,
    email: normalizedEmail,
    phone: '',
    status: 'Available',
    vehicle: 'Pending Assignment',
    dist: '--',
    currentZone: 'TBD',
    odometer: 0,
    nextOilChange: 5000,
    assignedTo: '',
    schedule: [],
    clockedIn: false,
  };
}

function buildStableProfileId(role, uid = '') {
  const seed = String(uid || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'USER';
  if (role === 'dispatcher') return `DSP-${seed}`;
  if (role === 'driver') return `DRV-${seed}`;
  return null;
}

function getDriverProfileHealthScore(driver) {
  if (!driver) return Number.NEGATIVE_INFINITY;
  let score = 0;
  if (driver.clockedIn) score += 8;
  if (driver.activeMission) score += 6;
  if (driver.vehicle && driver.vehicle !== 'Pending Assignment') score += 5;
  if (driver.currentZone && !['TBD', '--'].includes(driver.currentZone)) score += 3;
  if (driver.phone) score += 2;
  if (Array.isArray(driver.schedule) && driver.schedule.length > 0) score += 2;
  if (driver.assignedTo) score += 2;
  if (Number(driver.odometer) > 0) score += 1;
  if (driver.status && !['Offline', ''].includes(driver.status)) score += 1;
  if (driver.vehicle === 'Pending Assignment') score -= 2;
  if (!driver.phone) score -= 1;
  if (driver.currentZone === 'TBD') score -= 1;
  return score;
}

function getDriverProfilesForEmail(drivers = [], email = '') {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return [];
  return (drivers || []).filter(driver => normalizeEmail(driver.email) === normalizedEmail);
}

function getBestDriverProfileForEmail(drivers = [], email = '', trips = []) {
  const matches = getDriverProfilesForEmail(drivers, email);
  if (matches.length === 0) return null;
  return [...matches].sort((a, b) => {
    const aExactTripCount = (trips || []).filter(trip => trip.driverId === a.id).length;
    const bExactTripCount = (trips || []).filter(trip => trip.driverId === b.id).length;
    if (bExactTripCount !== aExactTripCount) return bExactTripCount - aExactTripCount;
    const scoreDiff = getDriverProfileHealthScore(b) - getDriverProfileHealthScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    const aEmailTripCount = (trips || []).filter(trip => {
      const tripEmail = normalizeEmail(trip.driverEmail || drivers.find(driver => driver.id === trip.driverId)?.email);
      return tripEmail === normalizeEmail(a.email);
    }).length;
    const bEmailTripCount = (trips || []).filter(trip => {
      const tripEmail = normalizeEmail(trip.driverEmail || drivers.find(driver => driver.id === trip.driverId)?.email);
      return tripEmail === normalizeEmail(b.email);
    }).length;
    if (bEmailTripCount !== aEmailTripCount) return bEmailTripCount - aEmailTripCount;
    const aUpdated = Date.parse(a?.updatedAt || a?.updatedAtLocal || 0) || 0;
    const bUpdated = Date.parse(b?.updatedAt || b?.updatedAtLocal || 0) || 0;
    return bUpdated - aUpdated;
  })[0];
}

const AUTH_WATCHDOG_TIMEOUT_MS = 30000;

// --- Role cache: persist role to localStorage so boot is instant for returning users ---
function readRoleCache(uid) {
  try {
    const raw = localStorage.getItem(ROLE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const role = String(parsed?.role || '').toLowerCase();
    const cachedAt = Number(parsed?.cachedAt || 0);
    const isExpired = !cachedAt || Date.now() - cachedAt > ROLE_CACHE_TTL_MS;
    if (parsed?.uid === uid && VALID_ROLES.has(role) && !isExpired) return { ...parsed, role };
    clearRoleCache();
    return null;
  } catch { return null; }
}
function writeRoleCache(uid, role, email) {
  try {
    const normalizedRole = String(role || '').toLowerCase();
    if (!uid || !VALID_ROLES.has(normalizedRole)) return;
    localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ uid, role: normalizedRole, email, cachedAt: Date.now() }));
  } catch {}
}
function clearRoleCache() {
  try { localStorage.removeItem(ROLE_CACHE_KEY); } catch {}
}

const buildTravelDuration = (startTime, endTime) => {
  if (!startTime || !endTime) return '';
  const parseMinutes = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (raw.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(raw)) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        return d.getHours() * 60 + d.getMinutes();
      }
      return null;
    }
    const mins = timeToMinutes(raw);
    return Number.isFinite(mins) ? mins : null;
  };
  const s = new Date(startTime);
  const e = new Date(endTime);
  if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
    const diff = Math.round((e - s) / 60000);
    if (diff < 0) return '';
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return h > 0 ? `${h}h${m > 0 ? m : ''}` : `${m}m`;
  }
  const start = parseMinutes(startTime);
  const end = parseMinutes(endTime);
  if (start === null || end === null || end < start) return '';
  const diff = end - start;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  return hours > 0 ? `${hours}h${mins > 0 ? mins : ''}` : `${mins}m`;
};

const buildOdometerDistance = (startOdo, endOdo) => {
  const start = Number(startOdo);
  const end = Number(endOdo);
  if (Number.isNaN(start) || Number.isNaN(end)) return '';
  const diff = end - start;
  return diff >= 0 ? Number(diff.toFixed(1)) : '';
};

const TRACKING_ACTIVE_STATUSES = new Set([
  'Assigned',
  'In Mission',
  'In Progress',
  'Navigating Pickup',
  'En Route',
  'At Pickup',
  'In Transit',
  'Navigating Dropoff',
  'At Dropoff',
  'Arrived',
]);

function buildTripTrackingPhase(trip) {
  if (!trip) return { phase: 'idle', destination: '', destinationType: '' };
  if (['Assigned', 'In Mission', 'In Progress', 'Navigating Pickup', 'En Route'].includes(trip.status)) {
    return { phase: 'pickup', destination: trip.pickup || '', destinationType: 'pickup' };
  }
  if (['At Pickup', 'In Transit', 'Navigating Dropoff', 'At Dropoff', 'Arrived'].includes(trip.status)) {
    return { phase: 'dropoff', destination: trip.dropoff || '', destinationType: 'dropoff' };
  }
  return { phase: 'active', destination: trip.pickup || trip.dropoff || '', destinationType: 'unknown' };
}

function getRoleGateMessage(requestedRole, actualRole = '') {
  const portalMessage = requestedRole === 'admin'
    ? 'Access denied. Only CEO / Owner admin accounts can use Admin Login.'
    : requestedRole === 'dispatcher'
      ? 'Access denied. Only dispatcher accounts can use Dispatcher Login.'
      : 'Access denied. Only driver accounts can use Driver Login.';
  return `${portalMessage} Your account is registered as ${actualRole || 'unknown'}.`;
}

function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  return Promise.race([
    promise.then(value => ({ ok: true, value, label })),
    new Promise(resolve => {
      timeoutId = setTimeout(() => resolve({ ok: false, timeout: true, label }), timeoutMs);
    }),
  ]).catch(error => ({ ok: false, error, label })).finally(() => clearTimeout(timeoutId));
}

const App = () => {
  const noopRef = useRef(() => {});
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [startupIssue, setStartupIssue] = useState('');
  const [showLoadingRecovery, setShowLoadingRecovery] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const authBootResolvedRef = useRef(false);
  const loginPortalRoleRef = useRef(null);
  const loginInProgressRef = useRef(false);
  const loginAttemptRef = useRef(0);
  const lastTrailWriteRef = useRef(0);
  const skipNextSignedOutResetRef = useRef(false);
  const loadingStartedAtRef = useRef(Date.now());
  
  const [refreshTick, setRefreshTick] = useState(0);
  const [role, setRole] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const roleRef = useRef(null);
  const currentUserRef = useRef(null);
  const driversRef = useRef([]);
  const tripsRef = useRef([]);
  const driverProfileBootstrapRef = useRef('');
  const [driverTelemetry, setDriverTelemetry] = useState([]);
  const driverTelemetryRef = useRef([]);
  const realtimeReliability = useRealtimeReliability({ enabled: isAuthenticated });

  // Platform initialization only. Firestore reliability is handled by useRealtimeReliability.
  useEffect(() => {
    initPlatform();
  }, []);

  useEffect(() => {
    if (isAuthenticated && realtimeReliability.isOnline) setRefreshTick(t => t + 1);
  }, [isAuthenticated, realtimeReliability.isOnline, realtimeReliability.resubscribeKey]);

  // Clear SW reload flag after successful boot to allow future SW updates
  useEffect(() => {
    if (isAuthenticated) {
      window.sessionStorage.removeItem('sw-reload-pending');
    }
  }, [isAuthenticated]);

  // Handle dynamic import failures (stale chunk hashes after deploy) by clearing cache and reloading once
  useEffect(() => {
    let reloaded = false;
    const onError = (event) => {
      if (reloaded) return;
      if (event.target?.tagName === 'LINK' && event.target?.rel === 'modulepreload') {
        event.preventDefault();
        reloaded = true;
        caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))).catch(() => {});
        window.location.reload();
        return;
      }
      if (event.target?.tagName === 'SCRIPT' && event.target?.type === 'module' && event.target?.src) {
        if (!event.target.src.includes(location.origin)) return;
        event.preventDefault();
        reloaded = true;
        caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))).catch(() => {});
        window.location.reload();
      }
    };
    const onRejection = (event) => {
      if (reloaded) return;
        if (event.reason && typeof event.reason === 'object' && event.reason?.message?.includes('dynamically imported module')) {
        event.preventDefault();
        reloaded = true;
        caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))).catch(() => {});
        window.location.reload();
      }
    };
    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError, true);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  // Initialize Service Worker for PWA auto-update across all platforms
  useEffect(() => {
    let cleanupSWMessages = () => {};

    const onSWUpdate = () => { skipWaiting(); };
    window.addEventListener('swUpdateAvailable', onSWUpdate);
    const onControllerChange = () => {
      // Signal controller change locally; main thread registers separate effect below to show non-blocking toast
      window.dispatchEvent(new CustomEvent('agape:sw-updated'));
    };
    window.addEventListener('swControllerChanged', onControllerChange);

    (async () => {
      try {
        // Register service worker
        await registerServiceWorker();
        
        // Service worker is static-cache only; Firestore reads own data sync.
        cleanupSWMessages = setupSWMessageHandler((data) => {
          if (data?.type === 'STATIC_CACHE_UPDATED') setRefreshTick(t => t + 1);
        });

        console.log('PWA auto-update enabled');
      } catch (error) {
        console.error('PWA setup error:', error);
      }
    })();
    return () => {
      cleanupSWMessages();
      window.removeEventListener('swUpdateAvailable', onSWUpdate);
      window.removeEventListener('swControllerChanged', onControllerChange);
    };
  }, []);

  // Start the sync queue processor to drain pending offline writes
  useEffect(() => {
    syncQueueProcessor.start();
    return () => syncQueueProcessor.stop();
  }, []);

  // ALL DATA COMES FROM FIRESTORE — single source of truth
  const {
    trips, drivers, dispatchers, vehicles, trashedTrips, logs, phoneNumbers,
    loading: dataLoading, saving: dataSaving, error: dataError, lastSavedAt,
    setTrips, setDrivers, upsertDriverProfile, setDispatchers, setVehicles,
    setTrashedTrips, setLogs, setPhoneNumbers,
    addLog, initializeAppData,
  } = useFirestoreAppData({ resubscribeKey: realtimeReliability.resubscribeKey, enabled: isAuthenticated });

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const chatUnreadCountsRef = useRef({});
  const chatUnreadPrimedRef = useRef(false);

  const scopedDrivers = useMemo(
    () => filterDriversForRole(role, currentUser, drivers, dispatchers),
    [role, currentUser, drivers, dispatchers]
  );
  const scopedTrips = useMemo(
    () => filterTripsForRole(role, currentUser, trips, drivers, dispatchers),
    [role, currentUser, trips, drivers, dispatchers]
  );
  const currentUserEmailTripMatches = useMemo(() => {
    const email = normalizeEmail(currentUser);
    if (!email) return [];
    return trips.filter(trip => {
      const tripEmail = normalizeEmail(trip.driverEmail || drivers.find(driver => driver.id === trip.driverId)?.email);
      return tripEmail === email;
    });
  }, [trips, drivers, currentUser]);
  const currentUserDriverProfile = useMemo(() => {
    if (role !== 'driver') return null;
    const email = normalizeEmail(currentUser);
    if (!email) return null;
    const matchedProfile = getBestDriverProfileForEmail(drivers, email, trips);
    if (matchedProfile) return matchedProfile;
    if (dataLoading) return null;
    if (currentUserEmailTripMatches.length > 0) {
      const seedTrip = currentUserEmailTripMatches[0];
      return {
        ...buildDriverProfileFromEmail(email, auth.currentUser?.uid || ''),
        id: seedTrip.driverId || buildDriverProfileFromEmail(email, auth.currentUser?.uid || '').id,
        name: seedTrip.driverName || buildDriverProfileFromEmail(email, auth.currentUser?.uid || '').name,
        status: 'Available',
        clockedIn: true,
        vehicle: 'Assigned Route',
        currentZone: seedTrip.pickup || 'Assigned Work',
        isVirtualProfile: true,
      };
    }
    return {
      ...buildDriverProfileFromEmail(email, auth.currentUser?.uid || ''),
      id: buildStableProfileId('driver', auth.currentUser?.uid || '') || buildDriverProfileFromEmail(email, auth.currentUser?.uid || '').id,
      isProvisioningProfile: true,
    };
  }, [drivers, currentUser, role, dataLoading, trips, currentUserEmailTripMatches]);
  const currentUserDriverTrips = useMemo(() => {
    if (role === 'admin' || role === 'dispatcher') return trips;
    if (role !== 'driver') return [];
    const email = normalizeEmail(currentUserDriverProfile?.email || currentUser);
    if (!email) return [];
    const driverIds = new Set([
      ...getDriverProfilesForEmail(drivers, email).map(driver => driver.id),
      currentUserDriverProfile?.id,
    ].filter(Boolean));
    return trips.filter(trip => {
      const tripEmail = normalizeEmail(trip.driverEmail || drivers.find(driver => driver.id === trip.driverId)?.email);
      const assignedToCurrentDriver = driverIds.has(trip.driverId) || tripEmail === email;
      const incomingTransfer = trip.transferRequest?.status === 'pending'
        && (
          driverIds.has(trip.transferRequest?.toDriverId)
          || normalizeEmail(trip.transferRequest?.toDriverEmail) === email
        );
      const activeStatus = !DRIVER_HISTORY_STATUSES.has(normalizeTripStatus(trip.status));
      const visibleManifestTrip = tripMatchesTodayOrTomorrow(trip.date) || activeStatus || incomingTransfer;
      const visibleHistoryTrip = isRecentDriverHistoryTrip(trip);
      return (assignedToCurrentDriver || incomingTransfer) && (visibleManifestTrip || visibleHistoryTrip);
    });
  }, [trips, drivers, currentUserDriverProfile, currentUser, role]);
  useEffect(() => {
    if (role !== 'driver' || dataLoading || !auth.currentUser || !currentUserDriverProfile) return;
    const normalizedEmail = normalizeEmail(currentUser);
    if (!normalizedEmail) return;

    const driverId = currentUserDriverProfile.id || buildStableProfileId('driver', auth.currentUser.uid);
    if (!driverId) return;

    const existingProfile = drivers.find((driver) => (
      driver.id === driverId || normalizeEmail(driver.email) === normalizedEmail
    ));
    const bootstrapKey = `${auth.currentUser.uid}:${driverId}:${normalizedEmail}`;
    const needsProfileProvision = !existingProfile || !normalizeEmail(existingProfile.email) || existingProfile.id !== driverId;

    if (!needsProfileProvision && driverProfileBootstrapRef.current === bootstrapKey) return;

    // If drivers haven't loaded yet (empty array), defer profile creation to avoid
    // overwriting Firestore fields (e.g. vehicle) with synthetic defaults.
    if (!existingProfile && drivers.length === 0) return;

    driverProfileBootstrapRef.current = bootstrapKey;
    const baseProfile = buildDriverProfileFromEmail(normalizedEmail, auth.currentUser.uid);
    const nextProfile = {
      ...baseProfile,
      ...existingProfile,
      ...currentUserDriverProfile,
      id: driverId,
      email: normalizedEmail,
      name: existingProfile?.name || currentUserDriverProfile.name || baseProfile.name,
      phone: existingProfile?.phone || auth.currentUser.phoneNumber || '',
      updatedAtLocal: new Date().toISOString(),
    };

    upsertDriverProfile(driverId, nextProfile).catch((err) => {
      console.error('Driver profile bootstrap failed:', err);
    });
    setDoc(doc(db, 'users', auth.currentUser.uid), { profileId: driverId, email: normalizedEmail }, { merge: true }).catch((err) => {
      console.error('User profileId sync failed:', err);
    });
  }, [role, dataLoading, currentUser, currentUserDriverProfile, drivers, upsertDriverProfile]);
  const currentDispatcherRecord = useMemo(
    () => getDispatcherForUser(dispatchers, currentUser),
    [dispatchers, currentUser]
  );
  const canControlDriver = useCallback((driver) => {
    if (role === 'admin') return true;
    if (role === 'dispatcher') return isDriverAssignedToDispatcher(driver, currentDispatcherRecord);
    return normalizeEmail(driver?.email) === normalizeEmail(currentUser);
  }, [role, currentDispatcherRecord, currentUser]);
  const canControlTrip = useCallback((trip) => {
    if (role === 'admin') return true;
    if (role === 'dispatcher') return isTripInDispatcherScope(trip, scopedDrivers);
    return normalizeEmail(trip?.driverEmail) === normalizeEmail(currentUser);
  }, [role, scopedDrivers, currentUser]);

  // Generate a deterministic dedup key for any trip
  const getTripKey = useCallback((trip) => {
    if (!trip) return '';
    const bk = trip.bookingId;
    if (bk && !/^(BK-\d+-\d+|TRP-\d+|TRIP-\d{10,}-\d+)$/i.test(bk)) return `bk::${bk}`;
    if (trip.id && !trip.id.startsWith('TRIP-')) return `id::${trip.id}`;
    const parts = [
      (trip.patient || '').trim().toLowerCase(),
      (trip.date || '').trim(),
      (trip.time || '').trim(),
      (trip.pickup || '').trim().toLowerCase().replace(/\s+/g, ' '),
      (trip.dropoff || '').trim().toLowerCase().replace(/\s+/g, ' '),
    ];
    return `cmp::${parts.join('|')}`;
  }, []);

  // Dedup an array of trips using getTripKey
  const dedupTrips = useCallback((tripArray) => {
    const seen = new Set();
    return tripArray.filter(t => {
      const key = getTripKey(t);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [getTripKey]);

  const [activeTab, setActiveTab] = useState(() => 'dashboard');
  const [toasts, setToasts] = useState([]);
  const [messageBanners, setMessageBanners] = useState([]);
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  // eslint-disable-next-line no-unused-vars
  const [isInspected, setIsInspected] = useState(false);

  const [smartAssignTrip, setSmartAssignTrip] = useState(null);
  const [manualAssignTrip, setManualAssignTrip] = useState(null);
  const [smartAssignResult, setSmartAssignResult] = useState(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadAssignDriver, setUploadAssignDriver] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authActionPayload, setAuthActionPayload] = useState(null);
  const [authPassword, setAuthPassword] = useState('');
  const [reAuthError, setReAuthError] = useState('');
  const [bulkAssignModal, setBulkAssignModal] = useState(false);
  const [showDispatcherArchive, setShowDispatcherArchive] = useState(false);
  const [showAddTripModal, setShowAddTripModal] = useState(false);
  const [appSettings, setAppSettings] = useState(() => {
    try {
      const local = localStorage.getItem('agape_appSettings');
      return local ? { ...DEFAULT_APP_SETTINGS, ...JSON.parse(local) } : { ...DEFAULT_APP_SETTINGS };
    } catch {
      return { ...DEFAULT_APP_SETTINGS };
    }
  });
  const [, setUserSettingsLoaded] = useState(false);

  const addToast = useCallback((title, message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  // Show a non-blocking toast notification when the service worker updates,
  // prompting the user to reload instead of calling location.reload() automatically (which hangs/freezes WebKit PWAs)
  useEffect(() => {
    const handleUpdate = () => {
      addToast(
        'App Updated', 
        'A new version of the app is ready. Pull down to refresh or reopen to apply.', 
        'success'
      );
    };
    window.addEventListener('agape:sw-updated', handleUpdate);
    return () => {
      window.removeEventListener('agape:sw-updated', handleUpdate);
    };
  }, [addToast]);

  const addMessageBanner = useCallback((banner) => {
    const id = `${banner.channelId || 'chat'}-${Date.now()}`;
    setMessageBanners(prev => [
      { ...banner, id },
      ...prev.filter(item => item.channelId !== banner.channelId),
    ].slice(0, 3));
    setTimeout(() => {
      setMessageBanners(prev => prev.filter(item => item.id !== id));
    }, 5500);
  }, []);

  const openMessageBanner = useCallback((banner) => {
    if (banner?.channelId) {
      sessionStorage.setItem('agape_open_chat_channel', banner.channelId);
    }
    window.dispatchEvent(new CustomEvent('agape:open-chat', { detail: { channelId: banner?.channelId || '' } }));
    setMessageBanners(prev => prev.filter(item => item.id !== banner?.id));
  }, []);

  const dataErrorRef = useRef(dataError);
  useEffect(() => {
    if (dataError && dataError !== dataErrorRef.current) {
      addToast('Data Save Error', dataError, 'danger');
    }
    dataErrorRef.current = dataError;
  }, [dataError]);

  const updateAppSettings = useCallback((updates, isProfileUpdate = false) => {
    if (isProfileUpdate && role === 'driver' && updates.odometer !== undefined) {
      setDrivers(prev => prev.map(d => d.email === currentUser ? { ...d, odometer: updates.odometer } : d));
      addToast('Profile Updated', 'Your vehicle odometer has been synchronized.', 'success');
    } else {
      setAppSettings((prev) => ({ ...prev, ...updates }));
    }
  }, [role, currentUser, setDrivers]);

  const handleUpdatePhoneNumbers = useCallback((updates) => {
    setPhoneNumbers(prev => ({ ...prev, ...updates }));
  }, [setPhoneNumbers]);

  const requestAuthAction = useCallback((label, callback) => {
    setReAuthError('');
    setAuthPassword('');
    setAuthActionPayload({ label, callback });
    setShowAuthModal(true);
  }, []);

  // eslint-disable-next-line no-unused-vars
  const [activeManifest, setActiveManifest] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginStep, setLoginStep] = useState('role_selection');
  const [pendingRole, setPendingRole] = useState(null);
  const [loginError, setLoginError] = useState('');

  const resetSessionState = useCallback((options = {}) => {
    const {
      loginErrorMessage = '',
      preserveEmail = false,
      emailValue = '',
      pendingRoleValue = null,
      nextLoginStep = 'role_selection',
      clearStartupIssue = true,
      clearLoading = true,
    } = options;

    loginPortalRoleRef.current = pendingRoleValue;
    roleRef.current = null;
    currentUserRef.current = null;
    authBootResolvedRef.current = true;

    setIsAuthenticated(false);
    setRole(null);
    setCurrentUser(null);
    setDataLoaded(false);
    setActiveTab('dashboard');
    setActiveManifest(null);
    setIsInspected(false);
    setSelectedTasks([]);
    setSearchQuery('');
    setSmartAssignTrip(null);
    setManualAssignTrip(null);
    setSmartAssignResult(null);
    setAiAnalyzing(false);
    setShowOptimizeModal(false);
    setShowUploadModal(false);
    setUploadAssignDriver('');
    setShowAuthModal(false);
    setAuthActionPayload(null);
    setAuthPassword('');
    setReAuthError('');
    setBulkAssignModal(false);
    setShowDispatcherArchive(false);
    setShowAddTripModal(false);
    setChatUnreadCount(0);
    setDriverTelemetry([]);
    setPassword('');
    setEmail(preserveEmail ? emailValue : '');
    setPendingRole(pendingRoleValue);
    setLoginStep(nextLoginStep);
    setLoginError(loginErrorMessage);
    setShowLoadingRecovery(false);
    if (clearStartupIssue) setStartupIssue('');
    if (clearLoading) setIsLoading(false);
  }, []);

  const handleDriverSessionInvalidated = useCallback((session = {}) => {
    if (roleRef.current !== 'driver') return;
    skipNextSignedOutResetRef.current = true;
    clearRoleCache();
    signOut(auth).catch(() => {});
    resetSessionState({
      loginErrorMessage: session.invalidatedReason === 'new_login'
        ? 'Your driver session moved to another device. Please sign in again on this device if needed.'
        : 'Your driver session expired. Please sign in again.',
    });
  }, [resetSessionState]);

  useDriverLiveState({
    enabled: isAuthenticated && role === 'driver' && Boolean(currentUserDriverProfile?.id),
    driver: currentUserDriverProfile,
    trips: currentUserDriverTrips,
    currentUser,
    onInvalidSession: handleDriverSessionInvalidated,
    resubscribeKey: realtimeReliability.resubscribeKey,
  });
  const driverAssignmentInbox = useDriverAssignments({
    enabled: isAuthenticated && role === 'driver' && Boolean(currentUserDriverProfile?.id),
    driver: currentUserDriverProfile,
    currentUser,
    resubscribeKey: realtimeReliability.resubscribeKey,
  });
  useDriverLivenessMonitor({
    enabled: isAuthenticated && (role === 'admin' || role === 'dispatcher'),
    resubscribeKey: realtimeReliability.resubscribeKey,
  });

  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => { driversRef.current = drivers; }, [drivers]);
  useEffect(() => { tripsRef.current = trips; }, [trips]);
  useEffect(() => {
    driverTelemetryRef.current = driverTelemetry;
  }, [driverTelemetry]);

  useEffect(() => {
    if (!isAuthenticated) {
      setDriverTelemetry([]);
      return undefined;
    }
    
    const unsubscribe = onSnapshot(collection(db, 'driverTelemetry'), (snap) => {
      const recentDocs = [];
      snap.forEach((itemDoc) => {
        recentDocs.push({ id: itemDoc.id, ...itemDoc.data() });
      });
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 10);
      const cutoffKey = todayLocal(cutoff);
      const filtered = recentDocs
        .filter((item) => !item.date || item.date >= cutoffKey)
        .sort((a, b) => Date.parse(b?.lastPingAt || b?.updatedAtLocal || 0) - Date.parse(a?.lastPingAt || a?.updatedAtLocal || 0));
      setDriverTelemetry(filtered);
    }, (err) => {
      console.error('Driver telemetry listener failed:', err);
    });

    return () => unsubscribe();
  }, [isAuthenticated, realtimeReliability.resubscribeKey]);

  useEffect(() => {
    if (!isLoading) {
      setShowLoadingRecovery(false);
      return;
    }
    const timer = setTimeout(() => setShowLoadingRecovery(true), 3000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    if (!isAuthenticated) {
      setDataLoaded(false);
      return;
    }
    if (!dataLoading) {
      setDataLoaded(true);
    }
  }, [isAuthenticated, dataLoading]);

  // Persist activeTab and appSettings to Firestore user document for authenticated users
  const persistUserSettings = async (settingsToPersist) => {
    try {
      if (!auth.currentUser) return;
      const uid = auth.currentUser.uid;
      await setDoc(
        doc(db, 'users', uid),
        { settings: settingsToPersist },
        { merge: true }
      );
    } catch (err) {
      console.error('Persisting user settings failed:', err);
    }
  };

  useEffect(() => {
    const theme = appSettings.theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : appSettings.theme || 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.dataset.fontScale = appSettings.fontScale || 'md';
    document.documentElement.dataset.readability = appSettings.readability || 'normal';

    const themeColor = theme === 'dark' ? '#020617' : '#f8fafc';
    let themeMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.name = 'theme-color';
      document.head.appendChild(themeMeta);
    }
    themeMeta.setAttribute('content', themeColor);

    try {
      localStorage.setItem('agape_appSettings', JSON.stringify(appSettings));
    } catch {}

    // Persist settings to Firestore for logged in user
    if (isAuthenticated && auth.currentUser) {
      persistUserSettings(appSettings);
    }
  }, [appSettings]);

  useEffect(() => {
    let unsubData = null;
    let unsubFcm = null;
    let cancelled = false;
    authBootResolvedRef.current = false;

    // Watchdog: if nothing resolves, unblock loading and show recovery.
    const bootWatchdog = setTimeout(() => {
      if (cancelled || authBootResolvedRef.current) return;
      authBootResolvedRef.current = true;
      setIsLoading(false);
      setStartupIssue('Startup took too long. Retry, repair browser files, or return to the Access Portal.');
    }, AUTH_WATCHDOG_TIMEOUT_MS);

    // Helper: apply authenticated session state and clear loading immediately
    const applySession = (userRole, userEmail, userDoc, capturedUser) => {
      if (cancelled) return;
      const requestedPortalRole = loginPortalRoleRef.current;

      // Role gate check
      if (requestedPortalRole && requestedPortalRole !== userRole) {
        const preferredLoginId = String(userDoc?.data?.()?.username || authEmailToUsername(userEmail || '') || userEmail || '').trim();
        skipNextSignedOutResetRef.current = true;
        signOut(auth).catch(() => {});
        resetSessionState({
          loginErrorMessage: getRoleGateMessage(requestedPortalRole, userRole),
          preserveEmail: true,
          emailValue: preferredLoginId,
          pendingRoleValue: requestedPortalRole,
          nextLoginStep: 'credentials',
        });
        return;
      }

      // Cache the role so next boot is instant
      writeRoleCache(capturedUser.uid, userRole, userEmail);

      loginPortalRoleRef.current = null;
      roleRef.current = userRole;
      currentUserRef.current = userEmail || '';
      setRole(userRole);
      setCurrentUser(userEmail);
      setIsAuthenticated(true);
      setLoginStep('role_selection');
      setPendingRole(null);
      setPassword('');
      setLoginError('');
      setStartupIssue('');

      const driverTabs = ['driverHome', 'completed', 'cancelled', 'noshow', 'settings'];
      const userSettings = userDoc && userDoc.exists?.() ? (userDoc.data().settings || {}) : {};
      const preferredTab = userSettings.activeTab || null;
      const validTab = userRole === 'driver'
        ? (driverTabs.includes(preferredTab) ? preferredTab : 'driverHome')
        : (preferredTab && preferredTab !== 'login' ? preferredTab : 'dashboard');
      setActiveTab(validTab);

      if (userSettings && Object.keys(userSettings).length > 0) {
        setAppSettings(prev => ({ ...prev, ...userSettings }));
        setUserSettingsLoaded(true);
      }

      requestNotificationPermission().then(token => {
        if (token) { setNotificationsEnabled(true); }
      });

      unsubFcm = onForegroundMessage((payload) => {
        const title = payload.notification?.title || payload.data?.title || 'Agape Care';
        const body = payload.notification?.body || payload.data?.body || '';
        const type = payload.data?.type === 'chat' ? 'message' : 'notification';
        if (title && body) {
          if (type === 'message') {
            if (!window.isChatPageOpen) {
              playMessageSound();
              showLocalNotification(title, body, type);
            }
          } else {
            playNotificationSound();
            showLocalNotification(title, body, type);
          }
        }
      });

      setDataLoaded(false);
      authBootResolvedRef.current = true;
      const elapsed = Date.now() - loadingStartedAtRef.current;
      const delay = Math.max(0, 1000 - elapsed);
      if (delay > 0) setTimeout(() => setIsLoading(false), delay);
      else setIsLoading(false);
    };

    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
      // If a login is actively being processed and we got a null event,
      // Firebase may be toggling state. Let the login resolve instead of signing out.
      if (!user && loginInProgressRef.current) {
        console.warn('[Auth] Null event during active login — ignoring (race guard)');
        return;
      }
      if (user) {
        const requestedPortalRole = loginPortalRoleRef.current;
        const userEmail = user.email || '';

        // ── FAST PATH: use cached role for instant boot ──────────────────────
        const cached = readRoleCache(user.uid);
        if (cached && cached.role && (!requestedPortalRole || requestedPortalRole === cached.role)) {
          // Apply session immediately — loading clears in milliseconds
          loginInProgressRef.current = false;
          applySession(cached.role, userEmail, null, user);

          // Then verify role from Firestore in the background (non-blocking)
          getDoc(doc(db, 'users', user.uid)).then((freshDoc) => {
            if (cancelled || !freshDoc.exists()) return;
            const freshRole = String(freshDoc.data()?.role || '').toLowerCase();
            if (freshRole && freshRole !== cached.role) {
              writeRoleCache(user.uid, freshRole, userEmail);
              window.location.reload();
              return;
            }
            // Load user settings from Firestore (theme, nav app, etc.)
            // so they survive hard refresh even when the role cache is present.
            const settings = freshDoc.data()?.settings || {};
            if (Object.keys(settings).length > 0) {
              setAppSettings(prev => ({ ...prev, ...settings }));
              setUserSettingsLoaded(true);
            }
          }).catch(() => { /* background check — ignore network errors */ });
          return;
        }

        // ── FIRST LOGIN or EXPLICIT ROLE CHECK: fetch from Firestore ─────────
        const userDocResult = await withTimeout(
          getDocFromServer(doc(db, 'users', user.uid)),
          4000,
          'user profile'
        );
        if (cancelled) return;

        let userDoc = userDocResult.ok ? userDocResult.value : null;
        let userRole = userDoc?.exists?.() ? String(userDoc.data()?.role || '').toLowerCase() : '';

        // If Firestore timed out, try one more time quickly then proceed
        if (!userDocResult.ok || (!userRole && userDoc)) {
          const retryResult = await withTimeout(getDocFromServer(doc(db, 'users', user.uid)), 4000, 'user profile retry');
          if (cancelled) return;
          if (retryResult.ok && retryResult.value?.exists?.()) {
            userDoc = retryResult.value;
            userRole = String(userDoc.data()?.role || '').toLowerCase();
          }
        }

        if (!userRole) {
          // Check if this could be the first-ever admin bootstrapping
          const usersSnap = await withTimeout(getDocs(collection(db, 'users')), 4000, 'user directory');
          const hasExistingUsers = usersSnap.ok ? !usersSnap.value.empty : true;
          const canBootstrapFirstAdmin = !hasExistingUsers && requestedPortalRole === 'admin';

          if (canBootstrapFirstAdmin) {
            const normalizedAuthEmail = String(user.email || '').trim().toLowerCase();
            const username = normalizeUsername(
              authEmailToUsername(normalizedAuthEmail) || user.displayName || 'admin'
            ) || 'admin';
            await setDoc(
              doc(db, 'users', user.uid),
              {
                role: 'admin',
                email: normalizedAuthEmail,
                username,
                name: user.displayName || username,
                loginType: isInternalAuthEmail(normalizedAuthEmail) ? 'username' : 'email',
                profileId: null,
                bootstrappedAt: new Date().toISOString(),
              },
              { merge: true }
            );
            userRole = 'admin';
            userDoc = await getDocFromServer(doc(db, 'users', user.uid)).catch(() => null);
          } else if (!usersSnap.ok) {
            // Firestore completely unreachable — show login so user can retry
            loginInProgressRef.current = false;
            authBootResolvedRef.current = true;
            setIsLoading(false);
            setStartupIssue('Could not reach the server. Check your connection and sign in again.');
            return;
          } else {
            loginInProgressRef.current = false;
            skipNextSignedOutResetRef.current = true;
            await signOut(auth).catch(() => {});
            clearRoleCache();
            resetSessionState({
              loginErrorMessage: hasExistingUsers
                ? 'Account not found in Agape system. Please contact your administrator.'
                : 'No Agape admin profile exists yet. Sign in through Admin Login with the first Firebase Auth account to initialize the system.',
            });
            return;
          }
        }

        loginInProgressRef.current = false;
        applySession(userRole, userEmail, userDoc, user);
        
        try {
          const r = roleRef.current;
          if (r === 'admin' || r === 'dispatcher') {
            const usersResult = await getDocs(collection(db, 'users'));
            const allUsers = usersResult.docs.map(u => ({ id: u.id, ...u.data() }));
            
            // Sync new drivers from users collection — batch into single write
            const activeDriverUsers = allUsers.filter(u => u.role && u.role.toLowerCase() === 'driver');
            const nonDriverEmails = new Set(
              allUsers
                .filter(u => u.role && u.role.toLowerCase() !== 'driver')
                .map(u => normalizeEmail(u.email))
                .filter(Boolean)
            );
            setDrivers(prev => {
              const normalizedPrev = prev.filter((driver) => {
                const email = normalizeEmail(driver.email);
                if (!email) return true;
                return !nonDriverEmails.has(email);
              });
              const toAdd = [];
              for (const au of activeDriverUsers) {
                if (!normalizedPrev.find(d => normalizeEmail(d.email) === normalizeEmail(au.email))) {
                  const stableId = au.profileId || buildStableProfileId('driver', au.id);
                  toAdd.push({
                    id: stableId,
                    name: au.name || au.username || authEmailToUsername(au.email || '') || 'driver',
                    email: au.email,
                    phone: au.phone || '',
                    status: 'Available', vehicle: 'Pending Assignment', dist: '--',
                    currentZone: 'TBD', odometer: 0, nextOilChange: 5000,
                    assignedTo: '', schedule: [], clockedIn: false
                  });
                }
              }
              return toAdd.length > 0 || normalizedPrev.length !== prev.length ? [...normalizedPrev, ...toAdd] : prev;
            });
            
            // Sync new dispatchers — batch into single write
            const activeDispatcherUsers = allUsers.filter(u => u.role && u.role.toLowerCase() === 'dispatcher');
            const nonDispatcherEmails = new Set(
              allUsers
                .filter(u => u.role && u.role.toLowerCase() !== 'dispatcher')
                .map(u => normalizeEmail(u.email))
                .filter(Boolean)
            );
            setDispatchers(prev => {
              const normalizedPrev = prev.filter((dispatcher) => {
                const email = normalizeEmail(dispatcher.email);
                if (!email) return true;
                return !nonDispatcherEmails.has(email);
              });
              const toAdd = [];
              for (const au of activeDispatcherUsers) {
                if (!normalizedPrev.find(ds => normalizeEmail(ds.email) === normalizeEmail(au.email))) {
                  toAdd.push({
                    id: au.profileId || buildStableProfileId('dispatcher', au.id),
                    name: au.name || au.username || authEmailToUsername(au.email || '') || 'dispatcher',
                    email: au.email,
                  });
                }
              }
              return toAdd.length > 0 || normalizedPrev.length !== prev.length ? [...normalizedPrev, ...toAdd] : prev;
            });
          }
        } catch (err) {
          console.error("User list sync failed:", err);
          setStartupIssue('Realtime data is open, but user list sync is delayed.');
        } finally {
          // User sync complete
        }
      } else {
        loginInProgressRef.current = false;
        if (skipNextSignedOutResetRef.current) {
          skipNextSignedOutResetRef.current = false;
          authBootResolvedRef.current = true;
          setIsLoading(false);
          return;
        }
        // If user was already authenticated in this session, this could be a transient
        // token refresh or an IndexedDB corruption issue. Wait for session restoration.
        if (authBootResolvedRef.current) {
          console.warn('[Auth] Session went null after boot — waiting 3s for token refresh');
          await new Promise(r => setTimeout(r, 3000));
          if (cancelled) return;
          if (auth.currentUser) {
            loginAttemptRef.current = 0;
            return;
          }
          // Session truly lost — show login immediately
          // But increment attempt counter: if we've been through this loop too many
          // times, skip the signOut to prevent an infinite reload cycle.
          loginAttemptRef.current += 1;
          if (loginAttemptRef.current > 3) {
            console.warn('[Auth] Multiple rapid null-state cycles detected — clearing all local state');
            clearRoleCache();
            // Attempt to clear Firebase Auth IndexedDB state by signing out forcefully
            skipNextSignedOutResetRef.current = true;
            signOut(auth).catch(() => {});
            resetSessionState({ loginErrorMessage: 'Session expired. Please sign in again.' });
            loginAttemptRef.current = 0;
            return;
          }
          clearRoleCache();
          skipNextSignedOutResetRef.current = true;
          signOut(auth).catch(() => {});
          resetSessionState({ loginErrorMessage: 'Session expired. Please sign in again.' });
          return;
        }
        // Initial boot with no session — show login IMMEDIATELY.
        // Firebase Auth persistence restores sessions synchronously before firing
        // onAuthStateChanged. If it fired with null, there IS no saved session.
        authBootResolvedRef.current = true;
        setIsLoading(false);
      }
      } catch (bootErr) {
        console.error("Auth boot error:", bootErr);
        loginInProgressRef.current = false;
        setStartupIssue('Startup encountered an error. Please retry.');
        if (authBootResolvedRef.current) {
          return;
        }
        resetSessionState({ loginErrorMessage: 'Could not initialize your session. Please sign in again.' });
      }
    });
    return () => {
      cancelled = true;
      clearTimeout(bootWatchdog);
      unsub();
      if (unsubData) unsubData();
      if (typeof unsubFcm === 'function') unsubFcm();
    };
  }, [resetSessionState]);

  useEffect(() => {
    if (startupIssue === 'Worker driver profile was missing and has been provisioned while cloud records sync.') {
      setStartupIssue('');
    }
  }, [startupIssue]);

  useEffect(() => {
    const metaTags = [
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'theme-color', content: '#f8fafc' }
    ];
    metaTags.forEach(tag => {
      let el = document.querySelector(`meta[name="${tag.name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.name = tag.name;
        document.head.appendChild(el);
      }
      el.content = tag.content;
    });

    let linkApple = document.querySelector('link[rel="apple-touch-icon"]');
    if (!linkApple) {
      linkApple = document.createElement('link');
      linkApple.rel = 'apple-touch-icon';
      document.head.appendChild(linkApple);
    }
    linkApple.href = '/agape.png';
    initAudioContext();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search || '');
    const channelId = params.get('chatChannel') || params.get('channelId') || '';
    if (!channelId) return;
    sessionStorage.setItem('agape_open_chat_channel', channelId);
    window.history.replaceState({}, document.title, window.location.pathname || '/');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('agape:open-chat', { detail: { channelId } }));
    }, 0);
  }, []);

  useEffect(() => {
    const activeUid = auth.currentUser?.uid || '';
    const activeEmail = normalizeEmail(currentUser || auth.currentUser?.email || '');
    if (!isAuthenticated || !activeUid || !activeEmail) {
      setChatUnreadCount(0);
      chatUnreadCountsRef.current = {};
      chatUnreadPrimedRef.current = false;
      return undefined;
    }

    const readUnreadCount = (data) => {
      const byUid = data?.unreadByUid || {};
      const legacy = data?.unreadCounts || {};
      return Number(byUid[activeUid] || legacy[activeUid] || legacy[activeEmail] || 0);
    };

    const channelsRef = collection(db, 'chat_channels');
    const unsubscribe = onSnapshot(
      query(channelsRef, where('participantIds', 'array-contains', activeEmail)),
      (snap) => {
        let total = 0;
        const nextCounts = {};
        let bannerCandidate = null;
        snap.forEach(channel => {
          const data = channel.data();
          if (data?.type !== 'dm') return;
          const unread = readUnreadCount(data);
          total += unread;
          nextCounts[channel.id] = unread;

          const previousUnread = chatUnreadCountsRef.current[channel.id] || 0;
          const senderEmail = normalizeEmail(data.lastMessageBy || '');
          const isActiveChat = window.__agapeActiveChatChannel === channel.id;
          if (
            chatUnreadPrimedRef.current &&
            unread > previousUnread &&
            senderEmail &&
            senderEmail !== activeEmail &&
            !isActiveChat
          ) {
            const lastMessageMs = data.lastMessageAt?.toMillis?.() || 0;
            if (!bannerCandidate || lastMessageMs > (bannerCandidate.lastMessageMs || 0)) {
              const participants = (data.dmParticipants || data.participantIds || []).map(normalizeEmail).filter(Boolean);
              const senderLabel = senderEmail.split('@')[0] || 'New message';
              bannerCandidate = {
                channelId: channel.id,
                senderName: data.lastMessageSenderName || senderLabel,
                senderEmail,
                message: data.lastMessage || 'Sent a message',
                lastMessageMs,
                participants,
              };
            }
          }
        });
        chatUnreadCountsRef.current = nextCounts;
        chatUnreadPrimedRef.current = true;
        setChatUnreadCount(total);
        if (bannerCandidate && document.visibilityState === 'visible') {
          addMessageBanner(bannerCandidate);
        }
      },
      (err) => console.error('Chat DM unread listener failed:', err)
    );

    return () => unsubscribe();
  }, [addMessageBanner, isAuthenticated, currentUser]);

  useEffect(() => {
    const count = Math.max(0, Number(chatUnreadCount) || 0);
    if (typeof navigator === 'undefined') return;

    if ('setAppBadge' in navigator || 'clearAppBadge' in navigator) {
      try {
        if (count > 0 && navigator.setAppBadge) {
          navigator.setAppBadge(count).catch?.(() => {});
        } else if (navigator.clearAppBadge) {
          navigator.clearAppBadge().catch?.(() => {});
        }
      } catch {
        // Browser does not support badge updates in this mode.
      }
    }
  }, [chatUnreadCount]);

  const addAuditLog = useCallback((title, desc, color, meta = null) => {
    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const actorEmail = currentUser || 'system';
    let actorRole = 'admin';
    try {
      const norm = (s) => String(s || '').trim().toLowerCase();
      if (drivers && drivers.some(d => norm(d.email) === norm(actorEmail))) actorRole = 'driver';
      else if (dispatchers && dispatchers.some(d => norm(d.email) === norm(actorEmail))) actorRole = 'dispatcher';
      else if (!currentUser) actorRole = 'system';
    } catch (e) { /* ignore */ }
    setLogs(prev => [{ t: title, d: desc, c: color, type: 'audit', timestamp: timeStr, time: now, actor: actorEmail, actorRole, meta }, ...prev].slice(0, 100));
    addLog({ t: title, d: desc, c: color, type: 'audit', time: now, actor: actorEmail, actorRole, meta });
  }, [currentUser, drivers, dispatchers, addLog]);


  const handleCreateAccount = async () => {
    if (!ALLOW_SELF_PROVISIONING) {
      setLoginError('Self-provisioning is disabled for this enterprise deployment. Ask an administrator to create the account from User Management.');
      return;
    }
    if (!email || !password) { setLoginError('Enter username and password first.'); return; }
    if (password.length < 6) { setLoginError('Password must be at least 6 characters.'); return; }
    if (!pendingRole) {
      setLoginError('Select a role before creating an account.');
      return;
    }
    if (pendingRole !== 'driver') {
      setLoginError('Only driver accounts can be self-provisioned. Contact an administrator for other roles.');
      return;
    }
    try {
      const { authEmail, username } = resolveAuthIdentifier(email);
      if (!authEmail || !username) {
        setLoginError('Enter a valid username using letters, numbers, dot, dash, or underscore.');
        return;
      }
      loginInProgressRef.current = true;
      await setPersistence(auth, browserLocalPersistence);
      const userCred = await createUserWithEmailAndPassword(auth, authEmail, password);
      await setDoc(
        doc(db, 'users', userCred.user.uid),
        { role: pendingRole, email: authEmail, username, name: username, profileId: buildStableProfileId(pendingRole, userCred.user.uid), loginType: 'username' },
        { merge: true }
      );
      await initializeAppData();
      setRole(pendingRole);
      setCurrentUser(authEmail);
      setIsAuthenticated(true);
      setActiveTab('dashboard');
      setLoginError('');
      requestNotificationPermission().then(token => { if (token) { setNotificationsEnabled(true); } });
    } catch (err) {
      setLoginError(err.message.replace('Firebase: ', ''));
    } finally {
      loginInProgressRef.current = false;
    }
  };

  const handlePasswordReset = async () => {
    setLoginError('');
    if (!email) {
      setLoginError('Enter your username first.');
      return;
    }
    try {
      const { authEmail } = resolveAuthIdentifier(email);
      if (!authEmail) {
        setLoginError('Enter a valid username first.');
        return;
      }
      if (isInternalAuthEmail(authEmail)) {
        setLoginError('Password resets for username accounts are handled by your admin inside Agape Care.');
        return;
      }
      await sendPasswordResetEmail(auth, authEmail);
      setLoginError('Password reset email sent. Check your inbox.');
    } catch (err) {
      setLoginError(err.message.replace('Firebase: ', ''));
    }
  };

  const executeLogin = async (selectedRole) => {
    const requestedRole = String(selectedRole || '').toLowerCase();
    loginPortalRoleRef.current = requestedRole;
    // Clear any stale role cache before attempting login — prevents ghost sessions
    // from interfering when Firebase Auth IndexedDB has stale state.
    clearRoleCache();
    setLoginError('');
    setIsLoading(true);
    loginInProgressRef.current = true;
    loginAttemptRef.current = 0;
    try {
      // Re-apply persistence before each sign-in attempt for robustness.
      // Try IndexedDB first, fall back to session storage.
      await setPersistence(auth, browserLocalPersistence).catch(() =>
        setPersistence(auth, browserSessionPersistence).catch(() => {})
      );
      const { authEmail, username } = resolveAuthIdentifier(email);
      if (!authEmail || !username) {
        setIsLoading(false);
        setLoginError('Enter a valid username.');
        loginInProgressRef.current = false;
        return;
      }
      await signInWithEmailAndPassword(auth, authEmail, password);
    } catch (err) {
      loginInProgressRef.current = false;
      loginPortalRoleRef.current = requestedRole;
      setIsLoading(false);
      setPassword('');
      // If the error mentions persistence or IndexedDB, hint at clearing browser data
      const msg = String(err?.message || err || '').replace('Firebase: ', '');
      // Only match Firebase-specific persistence errors — not ReferenceErrors
      // for variable names that happen to contain "persist".
      if (/auth.*persist|indexeddb|quota.*exceeded|storage.*unavailable/i.test(msg)) {
        setLoginError(`${msg} — Try clearing your browser cache or use a private/incognito window.`);
      } else {
        setLoginError(msg);
      }
    }
  };

  const handleLogout = async () => {
    try {
      if (role === 'dispatcher') addAuditLog('Dispatcher Logged Out', `Dispatcher ${currentUser} left the system.`, 'slate');
      clearRoleCache();
      loginInProgressRef.current = false;
      skipNextSignedOutResetRef.current = true;
      await signOut(auth);
    } finally {
      resetSessionState();
    }
  };

  const toggleTaskSelection = (id) => {
    setSelectedTasks(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const createSharedRide = () => {
    const selectedTrips = trips.filter(t => selectedTasks.includes(t.id) && canControlTrip(t));
    if (selectedTrips.length < 2) return;
    const sharedGroupId = `SR-${Date.now().toString().slice(-6)}`;
    setTrips(prev => prev.map(t => selectedTasks.includes(t.id) && canControlTrip(t) ? { ...t, sharedRideGroup: sharedGroupId, status: t.status === 'Unassigned' ? 'Unassigned' : t.status } : t));
    addAuditLog('Shared Ride Created', `${currentUser} grouped ${selectedTrips.length} trips as shared ride ${sharedGroupId}.`, 'blue');
    setSelectedTasks([]);
    setBulkAssignModal(false);
    // Firestore auto-syncs via useFirestoreAppData
  };

  const createLegMission = (driverId) => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver || !canControlDriver(driver)) {
      addAuditLog('Scope Blocked', `${currentUser} attempted to create a mission for an out-of-scope driver.`, 'rose');
      return;
    }
    const selectedTrips = trips.filter(t => selectedTasks.includes(t.id) && canControlTrip(t));
    if (selectedTrips.length === 0) return;
    
    // Build map of patient → best client phone (detect home address as one that appears in both pickup and dropoff)
    const patientPhoneMap = {};
    const patientAddresses = {};
    const FACILITY_KEYWORDS = ['hospital','center','clinic','academy','school','treatment','health','dental','pharmacy','office','suite','care','medical','therapy','rehab','wellness','surgery','diagnostic','lab','institute', 'skills', 'senior', 'living', 'manor', 'village'];
    selectedTrips.forEach(t => {
      const key = (t.patient || '').trim().toLowerCase();
      if (!patientAddresses[key]) patientAddresses[key] = { pickups: [], dropoffs: [], trips: [] };
      if (t.pickup) patientAddresses[key].pickups.push(t.pickup.trim().toLowerCase());
      if (t.dropoff) patientAddresses[key].dropoffs.push(t.dropoff.trim().toLowerCase());
      patientAddresses[key].trips.push(t);
    });
    Object.values(patientAddresses).forEach(({ pickups, dropoffs, trips: pTrips }) => {
      // Find home address (appears in both pickups and dropoffs for same patient)
      const homeAddr = pickups.find(p => dropoffs.includes(p)) || '';
      let clientPhone = '';
      
      const allPossiblePhones = pTrips.flatMap(t => [t.pickupPhone, t.dropoffPhone]).filter(Boolean);
      
      // Heuristic: A phone is a facility if it's shared by other patients in the main trips list
      const isShared = (p) => {
        if (!p) return false;
        const cleaned = cleanPhone(p);
        if (cleaned.length < 7) return false;
        return trips.some(t => 
          (t.patient || '').toLowerCase() !== (pTrips[0].patient || '').toLowerCase() && 
          (cleanPhone(t.pickupPhone) === cleaned || cleanPhone(t.dropoffPhone) === cleaned)
        );
      };

      if (homeAddr) {
        const homeTrip = pTrips.find(t => (t.pickup || '').trim().toLowerCase() === homeAddr);
        if (homeTrip && !isShared(homeTrip.pickupPhone)) clientPhone = homeTrip.pickupPhone || '';
        if (!clientPhone) {
          const returnTrip = pTrips.find(t => (t.dropoff || '').trim().toLowerCase() === homeAddr);
          if (returnTrip && !isShared(returnTrip.dropoffPhone)) clientPhone = returnTrip.dropoffPhone || '';
        }
      } 
      
      if (!clientPhone) {
        // Find any phone for this patient that is NOT shared
        clientPhone = allPossiblePhones.find(p => !isShared(p)) || '';
      }

      if (!clientPhone) {
        // Final fallback to existing keyword detection
        const trip = pTrips[0];
        const isPickupFacility = FACILITY_KEYWORDS.some(k => (trip.pickup || '').toLowerCase().includes(k)) || 
                                 FACILITY_KEYWORDS.some(k => (trip.pickupSiteName || '').toLowerCase().includes(k));
        const isDropoffFacility = FACILITY_KEYWORDS.some(k => (trip.dropoff || '').toLowerCase().includes(k)) || 
                                  FACILITY_KEYWORDS.some(k => (trip.dropoffSiteName || '').toLowerCase().includes(k));
        if (isPickupFacility && !isDropoffFacility) {
          clientPhone = trip.dropoffPhone || '';
        } else if (!isPickupFacility && isDropoffFacility) {
          clientPhone = trip.pickupPhone || '';
        } else {
          clientPhone = trip.patientPhone || trip.pickupPhone || trip.dropoffPhone || '';
        }
      }
      
      pTrips.forEach(t => {
        const key = (t.patient || '').trim().toLowerCase();
        patientPhoneMap[key] = clientPhone;
      });
    });
    
    // Create legs: all pickups then all dropoffs (can be reordered later by driver)
    const legs = [];
    selectedTrips.forEach(t => {
      const clientPhone = t.patientPhone || patientPhoneMap[(t.patient || '').trim().toLowerCase()] || t.pickupPhone;
      legs.push({ id: `L-${Math.random().toString(36).substr(2, 5)}`, type: 'PICKUP', tripId: t.id, bookingId: t.bookingId, patient: t.patient, address: t.pickup, notes: t.notes, phone: clientPhone });
    });
    selectedTrips.forEach(t => {
      const clientPhone = t.patientPhone || patientPhoneMap[(t.patient || '').trim().toLowerCase()] || t.pickupPhone;
      legs.push({ id: `L-${Math.random().toString(36).substr(2, 5)}`, type: 'DROPOFF', tripId: t.id, bookingId: t.bookingId, patient: t.patient, address: t.dropoff, notes: t.notes, phone: clientPhone });
    });
    
    // Update trips status and assign to driver
    setTrips(prev => prev.map(t => selectedTasks.includes(t.id) && canControlTrip(t) ? {
      ...t,
      status: 'In Mission',
      driverId,
      driverEmail: driver?.email || null,
      driverName: driver?.name || null,
    } : t));
    
    // Save mission to driver document or a separate missions collection (using a special field for now)
    if (driver) {
      setDrivers(prev => prev.map(d => d.id === driverId ? { ...d, activeMission: { id: `M-${Date.now()}`, legs, currentLegIndex: 0 } } : d));
      addAuditLog('Mission Created', `${currentUser} created a ${legs.length}-leg mission for ${driver.name} with ${selectedTrips.length} patients.`, 'indigo');
    }
    
    setSelectedTasks([]);
    setBulkAssignModal(false);
    // Firestore auto-syncs via useFirestoreAppData
  };

  const assignTripToDriver = useCallback((tripId, driverId) => {
    const driver = drivers.find(d => d.id === driverId);
    const tripToAssign = trips.find(t => t.id === tripId);
    if (!driver || !tripToAssign) return;
    if (!canControlDriver(driver) || !canControlTrip(tripToAssign)) {
      addAuditLog('Scope Blocked', `${currentUser} attempted to assign a trip outside their dispatcher scope.`, 'rose');
      return;
    }
    const prevTrip = { ...tripToAssign };
    setTrips(prev => prev.map(t => t.id === tripId ? {
      ...t,
      status: 'Assigned',
      driverId,
      driverEmail: driver?.email || null,
      driverName: driver?.name || null,
    } : t));
    setSmartAssignTrip(null);
    setSmartAssignResult(null);
    const changed = [
      { field: 'status', before: prevTrip.status, after: 'Assigned' },
      { field: 'driverId', before: prevTrip.driverId || null, after: driverId },
      { field: 'driverName', before: prevTrip.driverName || null, after: driver.name },
    ];
    addAuditLog('Trip Assigned', `${currentUser} assigned ${tripToAssign.patient}'s trip to ${driver.name}.`, 'emerald', { entity: 'trip', id: tripId, diffs: changed });
    if (notificationsEnabled && tripToAssign) {
      playNotificationSound();
      showLocalNotification(
        '🚗 New Trip Assigned',
        `${tripToAssign.patient} — ${tripToAssign.pickup} → ${tripToAssign.dropoff}`
      );
    }
  }, [drivers, trips, currentUser, addAuditLog, notificationsEnabled, canControlDriver, canControlTrip]);

  const bulkAssignTrips = useCallback((driverId) => {
    if (selectedTasks.length === 0) return;
    const driver = drivers.find(d => d.id === driverId);
    if (!driver || !canControlDriver(driver)) {
      addAuditLog('Scope Blocked', `${currentUser} attempted bulk assignment to an out-of-scope driver.`, 'rose');
      return;
    }
    const allowedSelection = selectedTasks.filter(id => {
      const trip = trips.find(t => t.id === id);
      return trip && canControlTrip(trip);
    });
    setTrips(prev => prev.map(t => allowedSelection.includes(t.id) ? {
      ...t,
      status: 'Assigned',
      driverId,
      driverEmail: driver?.email || null,
      driverName: driver?.name || null,
    } : t));
    addAuditLog('Bulk Assignment', `${currentUser} assigned ${allowedSelection.length} trips to ${driver?.name || 'Unknown'}`, 'emerald');
    setSelectedTasks([]);
    setBulkAssignModal(false);
  }, [selectedTasks, drivers, trips, currentUser, addAuditLog, canControlDriver, canControlTrip]);

  const triggerSmartAssign = async (trip) => {
    if (!canControlTrip(trip)) {
      addAuditLog('AI Scope Blocked', `${currentUser} requested AI assignment for an out-of-scope trip.`, 'rose');
      return;
    }
    setSmartAssignTrip(trip);
    setSmartAssignResult(null);
    setAiAnalyzing(true);
    const result = await suggestOptimalDriver(trip, scopedDrivers, scopedTrips);
    setSmartAssignResult(result);
    setAiAnalyzing(false);
  };

  const triggerFleetOptimization = async () => {
    setAiAnalyzing(true);
    try {
      const unassigned = scopedTrips.filter(t => t.status === 'Unassigned');
      const available = scopedDrivers.filter(d => d.status === 'Available' || d.status === 'On Trip');
      if (unassigned.length > 0 && available.length > 0) {
        const assignments = await suggestBatchAssignment(unassigned, available, scopedTrips);
        if (assignments && Object.keys(assignments).length > 0) {
          setTrips(prev => prev.map(t => {
            const assignedDriverId = assignments[t.id];
            if (!assignedDriverId) return t;
            const assignedDriver = available.find(driver => driver.id === assignedDriverId);
            if (!assignedDriver) return t;
            return {
              ...t,
              status: 'Assigned',
              driverId: assignedDriverId,
              driverEmail: assignedDriver?.email || null,
              driverName: assignedDriver?.name || null,
            };
          }));
          const count = Object.keys(assignments).length;
          addAuditLog('Fleet Optimized', `${currentUser || 'System'} ran AI optimization. ${count} trip${count !== 1 ? 's' : ''} assigned.`, 'indigo');
          Object.entries(assignments).forEach(([tripId]) => {
            const trip = trips.find(t => t.id === tripId);
            if (trip && notificationsEnabled) {
              playNotificationSound();
              showLocalNotification('🚗 Trip Assigned', `${trip.patient} — ${trip.pickup} → ${trip.dropoff}`);
            }
          });
        }
      } else {
        addAuditLog('Fleet Optimize', 'No unassigned trips or available drivers to assign.', 'amber');
      }
    } catch {
      addAuditLog('Fleet Optimize Error', 'AI optimization failed.', 'rose');
    }
    setAiAnalyzing(false);
  };

  const requestDeleteTrip = (tripId) => {
    if (!hasPermission(role, 'canDeleteTrip')) {
      addAuditLog('Permission Denied', `${currentUser} attempted to delete a trip without authorization.`, 'rose');
      return;
    }
    const trip = trips.find(t => t.id === tripId);
    if (trip && !canControlTrip(trip)) {
      addAuditLog('Scope Blocked', `${currentUser} attempted to archive an out-of-scope trip.`, 'rose');
      return;
    }
    requestAuthAction('archive_trip', () => {
      executeDeleteTrip(tripId);
    });
  };

  const enrichTripMetrics = (trip) => {
    const travelTime = buildTravelDuration(trip.arrivalTime, trip.arrivalDropoffTime || trip.completedAt);
    const distance = buildOdometerDistance(trip.pickupOdometer, trip.dropoffOdometer);
    return {
      ...trip,
      travelTime: travelTime || trip.travelTime || '',
      distance: distance !== '' ? distance : trip.distance || '',
    };
  };

  const updateTrip = (tripIdOrObject, partialFields = null) => {
    const updatedTrip = typeof tripIdOrObject === 'string'
      ? (() => { const existing = trips.find(t => t.id === tripIdOrObject); return existing ? { ...existing, ...partialFields } : null; })()
      : tripIdOrObject;
    if (!updatedTrip) return;
    if (!canControlTrip(updatedTrip)) {
      addAuditLog('Scope Blocked', `${currentUser} attempted to edit an out-of-scope trip.`, 'rose');
      return;
    }
    const prevTrip = trips.find(t => t.id === updatedTrip.id) || null;
    let nextTripState = { ...updatedTrip };
    if (nextTripState.driverId) {
      const driver = drivers.find(d => d.id === nextTripState.driverId);
      if (driver) {
        nextTripState.driverEmail = driver.email || nextTripState.driverEmail;
        // Preserve the existing driverName on the trip — only set from profile
        // if the trip doesn't already have one. This prevents overwriting a
        // correctly-stored driver name with stale/mismatched profile data.
        if (!nextTripState.driverName) {
          nextTripState.driverName = driver.name || null;
        }
      }
    } else if (nextTripState.driverId === '') {
      nextTripState.driverEmail = null;
      nextTripState.driverName = null;
    }
    
    // Auto-complete trip if dropoffOdometer is filled and it's not already terminal
    const isTerminal = ['completed', 'cancelled', 'canceled', 'no show', 'no_show', 'rerouted'].includes(String(nextTripState.status).toLowerCase().trim());
    if (nextTripState.dropoffOdometer !== undefined && nextTripState.dropoffOdometer !== '' && nextTripState.dropoffOdometer !== null) {
      if (!isTerminal && !nextTripState.completedAt) {
        nextTripState.status = 'Completed';
        nextTripState.completedAt = new Date().toISOString();
      }
    }

    const enrichedTrip = enrichTripMetrics(nextTripState);
    setTrips(prev => prev.map(t => t.id === enrichedTrip.id ? enrichedTrip : t));
    // Log detailed before/after changes
    if (prevTrip) {
      const changed = [];
      Object.keys(enrichedTrip).forEach((k) => {
        const a = prevTrip[k];
        const b = enrichedTrip[k];
        if (String(a) !== String(b)) changed.push({ field: k, before: a, after: b });
      });
      if (changed.length > 0) {
        const details = changed.map(c => `${c.field}: ${c.before ?? '—'} → ${c.after ?? '—'}`).join('; ');
        addAuditLog(
          'Trip Updated',
          `${currentUser} modified trip ${enrichedTrip.id} (${enrichedTrip.patient}): ${details}`,
          'blue',
          { entity: 'trip', id: enrichedTrip.id, diffs: changed, summary: details }
        );
      } else {
        addAuditLog('Trip Updated', `${currentUser} modified trip ${enrichedTrip.id} (${enrichedTrip.patient})`, 'blue');
      }
    } else {
      addAuditLog('Trip Updated', `${currentUser} modified trip ${enrichedTrip.id} (${enrichedTrip.patient})`, 'blue');
    }
  };

  const updateTrashedTrip = (updatedTrip) => {
    const prevTrip = trashedTrips.find(t => t.id === updatedTrip.id) || null;
    setTrashedTrips(prev => prev.map(t => t.id === updatedTrip.id ? updatedTrip : t));
    if (prevTrip) {
      const diffs = [];
      Object.keys(updatedTrip).forEach((key) => {
        if (String(prevTrip[key]) !== String(updatedTrip[key])) {
          diffs.push({ field: key, before: prevTrip[key], after: updatedTrip[key] });
        }
      });
      addAuditLog(
        'Archived Trip Updated',
        `${currentUser} modified archived trip ${updatedTrip.id} (${updatedTrip.patient})`,
        'blue',
        { entity: 'trip', id: updatedTrip.id, diffs, summary: diffs.map((diff) => `${diff.field}: ${diff.before ?? '—'} → ${diff.after ?? '—'}`).join('; ') }
      );
      return;
    }
    addAuditLog('Archived Trip Updated', `${currentUser} modified archived trip ${updatedTrip.id} (${updatedTrip.patient})`, 'blue');
  };

  const addTrip = useCallback((newTrip) => {
    let tripToAdd = { ...newTrip };
    if (role === 'driver') {
      const driverProfile = currentUserDriverProfile || buildDriverProfileFromEmail(currentUser || '', auth.currentUser?.uid || '');
      if (!driverProfile?.id) {
        addAuditLog('Trip Blocked', `${currentUser} attempted to add a trip before driver profile sync completed.`, 'rose');
        addToast('Trip Not Saved', 'Your driver profile is still syncing. Try again in a moment.', 'danger');
        return;
      }
      tripToAdd = {
        ...tripToAdd,
        status: 'Assigned',
        driverId: driverProfile.id,
        driverEmail: driverProfile.email || normalizeEmail(currentUser),
        driverName: driverProfile.name || currentUser,
        createdByRole: 'driver',
      };
    }
    if (tripToAdd.driverId) {
      const selectedDriver = drivers.find(driver => driver.id === tripToAdd.driverId) || (role === 'driver' ? currentUserDriverProfile : null);
      if (!canControlDriver(selectedDriver)) {
        addAuditLog('Scope Blocked', `${currentUser} attempted to add a trip for an out-of-scope driver.`, 'rose');
        addToast('Trip Blocked', role === 'driver' ? 'Drivers can only create trips for themselves.' : 'Dispatchers can only assign trips to their assigned drivers.', 'danger');
        return;
      }
    }
    setTrips(prev => {
      const all = dedupTrips([tripToAdd, ...prev]);
      return all;
    });
    addAuditLog('Trip Added', `${currentUser} manually added trip for ${tripToAdd.patient} (${tripToAdd.bookingId}).`, 'emerald');
    addToast('Trip Added', `${tripToAdd.patient}'s trip has been added successfully.`, 'success');
  }, [currentUser, role, currentUserDriverProfile, dedupTrips, drivers, canControlDriver, addAuditLog, addToast]);

  const resetSystemData = () => {
    if (role !== 'admin') return;
    setTrips([]);
    setTrashedTrips([]);
    setDrivers([]);
    setLogs([{ t: 'System Reset', d: 'Administrator wiped all operational data.', c: 'rose', type: 'system' }]);
    addAuditLog('System Reset', 'Master data wipe performed by Admin.', 'rose');
    // Firestore auto-syncs via useFirestoreAppData
  };

  const executeDeleteTrip = (tripId) => {
    // CRITICAL FIX: Use refs instead of closures to avoid stale data from Firestore sync
    let tripToDelete = null;
    
    setTrips(currentTrips => {
      tripToDelete = currentTrips.find(t => t.id === tripId);
      if (!tripToDelete) return currentTrips;
      return currentTrips.filter(t => t.id !== tripId);
    });
    
    setTimeout(() => {
      if (tripToDelete) {
        setTrashedTrips(currentTrashed => {
          if (currentTrashed.find(t => t.id === tripId)) return currentTrashed;
          return [tripToDelete, ...currentTrashed];
        });
        
        // Writes directly to Firestore via setTrips/setTrashedTrips
        const changed = Object.keys(tripToDelete).map(k => ({ field: k, before: tripToDelete[k], after: undefined }));
        addAuditLog('Trip Archived', `${currentUser} archived trip ${tripId} (${tripToDelete.patient}).`, 'rose', { entity: 'trip', id: tripId, diffs: [{ field: 'status', before: 'active', after: 'archived' }] });
      }
    }, 0);
    
    setSelectedTasks(prev => prev.filter(id => id !== tripId));
  };

  const requestBulkDelete = (tripIds, onSuccess) => {
    if (!hasPermission(role, 'canDeleteTrip')) {
      addAuditLog('Permission Denied', `${currentUser} attempted bulk archive without authorization.`, 'rose');
      return;
    }
    requestAuthAction('archive_trips', () => {
      let tripsToDelete = [];
      setTrips(currentTrips => {
        tripsToDelete = currentTrips.filter(t => tripIds.includes(t.id));
        if (tripsToDelete.length === 0) return currentTrips;
        return currentTrips.filter(t => !tripIds.includes(t.id));
      });
      
      setTimeout(() => {
        if (tripsToDelete.length > 0) {
          setTrashedTrips(currentTrashed => {
            const newTrashed = tripsToDelete.filter(td => !currentTrashed.some(ct => ct.id === td.id));
            return [...newTrashed, ...currentTrashed];
          });
          
          setSelectedTasks([]);
          if (onSuccess) onSuccess();
          addAuditLog('Bulk Trip Archived', `${currentUser} archived ${tripsToDelete.length} trips.`, 'rose');
        }
      }, 0);
    });
  };

  const restoreTrip = (tripId) => {
    requestAuthAction('restore_trip', () => {
      let tripToRestore = null;
      setTrashedTrips(currentTrashed => {
        tripToRestore = currentTrashed.find(t => t.id === tripId);
        if (!tripToRestore) return currentTrashed;
        return currentTrashed.filter(t => t.id !== tripId);
      });
      
      setTimeout(() => {
        if (tripToRestore) {
          setTrips(currentTrips => {
            const restoreKey = getTripKey(tripToRestore);
            const alreadyExists = currentTrips.some(et => getTripKey(et) === restoreKey);
            if (alreadyExists) return currentTrips;
            
            return dedupTrips([...currentTrips, tripToRestore]);
          });

          setDoc(doc(db, 'trips', tripId), { archiveState: null }, { merge: true }).catch(err => {
            console.error('Failed to clear archiveState in Firestore:', err);
          });
          
          addAuditLog('Trip Restored', `${currentUser || 'Admin'} restored trip ${tripId} (${tripToRestore.patient}) from Archive.`, 'emerald', { entity: 'trip', id: tripId, diffs: [{ field: 'status', before: 'archived', after: 'active' }] });
        }
      }, 0);
    });
  };

  const deleteTrashedTrip = (tripId) => {
    requestAuthAction('delete_trip', () => {
      let deletedTrip = null;
      setTrashedTrips(currentTrashed => {
        deletedTrip = currentTrashed.find(t => t.id === tripId);
        if (!deletedTrip) return currentTrashed;
        return currentTrashed.filter(t => t.id !== tripId);
      });
      setTimeout(() => {
        if (deletedTrip) {
          deleteDoc(doc(db, 'trips', tripId)).catch(err => {
            console.error('Failed to delete trip from Firestore:', err);
          });
          addAuditLog('Trip Permanently Deleted', `${currentUser || 'Admin'} permanently deleted trip ${tripId} (${deletedTrip.patient}) from Archive.`, 'rose', { entity: 'trip', id: tripId, diffs: [{ field: 'status', before: 'archived', after: 'deleted' }] });
        }
      }, 0);
    });
  };

  const handleDriverStatusUpdate = (driverId, clockedIn, extraFields = {}) => {
    const prevDriverState = drivers.find(d => d.id === driverId) || {};
    const now = new Date().toISOString();
    const {
      clockLocation,
      clockTimestamp,
      autoClockIn,
      clockEventType,
      timeTrackingState,
      ...persistableExtraFields
    } = extraFields || {};
    const eventTimestamp = clockTimestamp || autoClockIn || now;
    const wasClockedIn = Boolean(prevDriverState.clockedIn);
    const clockChanged = wasClockedIn !== clockedIn;
    let clockEvents = prevDriverState.clockEvents || [];
    if (clockChanged && clockedIn) {
      const event = { type: clockEventType || (autoClockIn ? 'auto_in' : 'in'), timestamp: eventTimestamp };
      if (clockLocation) event.lat = clockLocation.lat;
      if (clockLocation) event.lng = clockLocation.lng;
      clockEvents = [...clockEvents, event];
    } else if (clockChanged && !clockedIn) {
      const event = { type: clockEventType || 'out', timestamp: eventTimestamp };
      if (clockLocation) event.lat = clockLocation.lat;
      if (clockLocation) event.lng = clockLocation.lng;
      clockEvents = [...clockEvents, event];
    } else if (clockEventType === 'break_start' || clockEventType === 'break_end') {
      const event = { type: clockEventType, timestamp: eventTimestamp };
      if (clockLocation) event.lat = clockLocation.lat;
      if (clockLocation) event.lng = clockLocation.lng;
      clockEvents = [...clockEvents, event];
    }
    let extraPersist = { ...persistableExtraFields };
    if (clockEventType === 'break_start') {
      extraPersist.lastBreakStart = eventTimestamp;
    } else if (clockEventType === 'break_end') {
      const prevBreakStart = prevDriverState.lastBreakStart;
      const breakMs = prevBreakStart ? new Date(eventTimestamp) - new Date(prevBreakStart) : 0;
      const breakMin = Math.round(breakMs / 60000);
      extraPersist.lastBreakStart = null;
      extraPersist.totalBreakMinutes = (prevDriverState.totalBreakMinutes || 0) + breakMin;
    }
    const merged = {
      ...extraPersist,
      ...(clockChanged ? { clockEvents } : {}),
      ...(clockEventType && !clockChanged ? { clockEvents } : {}),
      ...(clockedIn && clockChanged ? { clockedInAt: eventTimestamp } : {}),
    };
    if (merged.clockLocation) delete merged.clockLocation;
    setDrivers(prevDrivers => {
      const driverExists = prevDrivers.some(d => d.id === driverId);
      const workingDrivers = driverExists
        ? prevDrivers
        : [...prevDrivers, { ...buildDriverProfileFromEmail(currentUser || '', auth.currentUser?.uid || ''), id: driverId }];
      const updated = workingDrivers.map(d => d.id === driverId ? {
        ...d,
        clockedIn,
        lastUpdate: now,
        status: clockedIn ? 'Available' : 'Offline',
        ...merged,
      } : d);
      return updated;
    });
    const driverName = prevDriverState?.name || driverId;
    const changed = [];
    if (wasClockedIn !== clockedIn) changed.push({ field: 'clockedIn', before: prevDriverState.clockedIn, after: clockedIn });
    if (prevDriverState.status !== (clockedIn ? 'Available' : 'Offline')) changed.push({ field: 'status', before: prevDriverState.status, after: clockedIn ? 'Available' : 'Offline' });
    addAuditLog(
      clockedIn ? 'Driver Clocked In' : 'Driver Clocked Out',
      `${driverName} ${clockedIn ? 'clocked in' : 'clocked out'}.`,
      clockedIn ? 'emerald' : 'blue',
      { entity: 'driver', id: driverId, diffs: changed }
    );
    if (driverId) {
      upsertDriverProfile(driverId, {
        clockedIn,
        status: clockedIn ? 'Available' : 'Offline',
        ...merged,
        lastUpdate: now,
        updatedAtLocal: now,
      }).catch((err) => console.error('Driver status update failed:', err));
    }
  };

  const handleDispatcherStatusUpdate = (dispatcherId, clockedIn) => {
    const prevState = dispatchers.find(d => d.id === dispatcherId) || {};
    setDispatchers(prevDispatchers => {
      const updated = prevDispatchers.map(d => d.id === dispatcherId ? {
        ...d,
        clockedIn,
        lastUpdate: new Date().toISOString(),
      } : d);
      return updated;
    });
    const changed = [];
    if (Boolean(prevState.clockedIn) !== clockedIn) changed.push({ field: 'clockedIn', before: prevState.clockedIn, after: clockedIn });
    addAuditLog(
      clockedIn ? 'Dispatcher Clocked In' : 'Dispatcher Clocked Out',
      `${prevState?.name || dispatcherId} ${clockedIn ? 'clocked in' : 'clocked out'}.`,
      clockedIn ? 'emerald' : 'blue',
      { entity: 'dispatcher', id: dispatcherId, diffs: changed }
    );
  };

  const handleCompleteTrip = (tripId, driverId, odometer) => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip?.pickupOdometer || !trip?.arrivalTime || !trip?.departedPickupTime || !trip?.arrivalDropoffTime || (!trip?.paperSignatureConfirmed && !trip?.unableToSign)) {
      addAuditLog('Trip Completion Blocked', `${currentUser || 'Driver'} attempted to complete ${trip?.patient || tripId} before all required steps were finished.`, 'rose');
      return;
    }
    const completedAt = new Date().toISOString();
    const nextTrip = enrichTripMetrics({
      ...trip,
      status: 'Completed',
      dropoffOdometer: odometer,
      completedAt,
    });
    setTrips(prev => prev.map(t => t.id === tripId ? nextTrip : t));
    setDrivers(prev => prev.map(d => d.id === driverId ? { ...d, odometer } : d));
    const diffs = [];
    Object.keys(nextTrip || {}).forEach((key) => {
      if (String(trip?.[key]) !== String(nextTrip?.[key])) {
        diffs.push({ field: key, before: trip?.[key], after: nextTrip?.[key] });
      }
    });
    const driver = driversRef.current.find(d => d.id === driverId);
    addAuditLog(
      'Trip Completed',
      `${driver?.name || 'Driver'} completed trip ${tripId} (${trip?.patient}). Odometer: ${odometer?.toLocaleString()} mi.`,
      'emerald',
      { entity: 'trip', id: tripId, diffs, summary: diffs.map((diff) => `${diff.field}: ${diff.before ?? '—'} → ${diff.after ?? '—'}`).join('; ') }
    );
    // Maintenance check
    if (driver) {
      const dueIn = (driver.nextOilChange || 50000) - odometer;
      if (dueIn <= 200) {
        addAuditLog('⚠️ Maintenance Alert', `${driver.name}'s vehicle needs oil change at ${driver.nextOilChange?.toLocaleString()} mi (current: ${odometer?.toLocaleString()} mi).`, 'amber');
      }
    }
    if (notificationsEnabled) {
      playNotificationSound();
      showLocalNotification('✅ Trip Completed', `${trip?.patient || 'Trip'} marked as completed. Odometer: ${odometer?.toLocaleString()} mi.`);
    }
  };

  const handleUpdateDriverLocation = useCallback(async (driverId, latitude, longitude, telemetry = {}) => {
    if (!driverId) return;

    const updatedAt = telemetry.recordedAt ? new Date(telemetry.recordedAt) : new Date();
    const updatedAtIso = updatedAt.toISOString();
    const currentDrivers = driversRef.current || [];
    const currentTrips = tripsRef.current || [];
    const existingDriver = currentDrivers.find((driver) => driver.id === driverId) || {
      ...buildDriverProfileFromEmail(currentUserRef.current || '', auth.currentUser?.uid || ''),
      id: driverId,
    };
    const driverEmail = normalizeEmail(existingDriver.email);
    const activeTrip = [...currentTrips]
      .filter((trip) => (
        trip.driverId === driverId ||
        (driverEmail && normalizeEmail(trip.driverEmail) === driverEmail)
      ))
      .filter((trip) => TRACKING_ACTIVE_STATUSES.has(trip.status))
      .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))[0] || null;
    const phase = buildTripTrackingPhase(activeTrip);
    const movement = deriveMovementState(existingDriver, latitude, longitude, telemetry, updatedAt);
    const speedMph = Number.isFinite(Number(telemetry.speedMph))
      ? Number(telemetry.speedMph)
      : movement.inferredSpeedMph || existingDriver.speedMph || 0;
    const previousLocationSample = Number.isFinite(Number(existingDriver.latitude)) && Number.isFinite(Number(existingDriver.longitude))
      ? {
          lat: Number(existingDriver.latitude),
          lng: Number(existingDriver.longitude),
          capturedAt: existingDriver.lastLocationUpdate || existingDriver.telemetry?.updatedAt || existingDriver.updatedAtLocal || null,
        }
      : null;
    const fraudSignals = telemetry.fraudSignals || buildLocationFraudSignals(previousLocationSample, {
      lat: latitude,
      lng: longitude,
      accuracy: telemetry.accuracy ?? existingDriver.locationAccuracy ?? null,
      speedMph,
      capturedAt: telemetry.capturedAt || telemetry.recordedAt || updatedAtIso,
    });
    const mergedTelemetry = {
      ...(existingDriver.telemetry || {}),
      ...telemetry,
      movementState: movement.movementState,
      stoppedSince: movement.stoppedSince,
      movingSince: movement.movingSince,
      dwellMinutes: movement.dwellMinutes,
      movingMinutes: movement.movingMinutes,
      inferredSpeedMph: movement.inferredSpeedMph,
      distanceDeltaMiles: movement.distanceMiles,
      updatedAt: updatedAtIso,
      activeTripId: activeTrip?.id || null,
      activeTripStatus: activeTrip?.status || null,
      activeDestination: phase.destination || '',
      activePhase: phase.phase,
      actorRole: telemetry.actorRole || roleRef.current || existingDriver.role || 'driver',
      source: telemetry.source || 'driver-pwa',
      fraudSignals,
    };

    const profileUpdates = {
      latitude,
      longitude,
      lastLocationUpdate: updatedAtIso,
      lastUpdate: updatedAtIso,
      locationAccuracy: telemetry.accuracy ?? existingDriver.locationAccuracy ?? null,
      speedMph,
      heading: telemetry.heading ?? existingDriver.heading ?? null,
      movementState: movement.movementState,
      stoppedSince: movement.stoppedSince,
      movingSince: movement.movingSince,
      currentDwellMinutes: movement.dwellMinutes,
      currentMovingMinutes: movement.movingMinutes,
      lastMotionChangeAt: movement.stateChanged ? updatedAtIso : (existingDriver.lastMotionChangeAt || updatedAtIso),
      telemetry: mergedTelemetry,
      fraudFlags: fraudSignals.flags || [],
      lastFraudSignals: fraudSignals,
    };

    if (upsertDriverProfile) {
      try {
        await upsertDriverProfile(driverId, profileUpdates);
      } catch (upsertErr) {
        console.warn('Driver profile upsert failed, continuing with location sync:', upsertErr);
      }
    }

    const locationDoc = {
      driverId,
      userId: auth.currentUser?.uid || '',
      driverEmail: existingDriver.email || '',
      driverName: existingDriver.name || '',
      sessionId: existingDriver.activeSessionId || telemetry.sessionId || null,
      tripId: activeTrip?.id || telemetry.tripId || null,
      assignmentId: activeTrip?.assignmentId || telemetry.assignmentId || null,
      lat: Number(latitude),
      lng: Number(longitude),
      accuracy: telemetry.accuracy ?? null,
      altitude: telemetry.altitude ?? null,
      speedMph: Number(Number(speedMph || 0).toFixed(1)),
      heading: telemetry.heading ?? null,
      movementState: movement.movementState,
      activeTripStatus: activeTrip?.status || telemetry.currentTripStatus || null,
      activeDestination: phase.destination || '',
      activePhase: phase.phase,
      source: telemetry.source || 'driver-pwa',
      streamIntervalMs: telemetry.streamIntervalMs || null,
      clientTimeMs: telemetry.clientTimeMs || Date.now(),
      capturedAt: telemetry.capturedAt || telemetry.recordedAt || updatedAtIso,
      capturedAtLocal: telemetry.capturedAt || telemetry.recordedAt || updatedAtIso,
      updatedAtLocal: updatedAtIso,
      fraudFlags: fraudSignals.flags || [],
      fraudSignals,
    };

    const nowMs = Date.now();
    const trailPromises = [];
    if (nowMs - lastTrailWriteRef.current >= 15000) {
      lastTrailWriteRef.current = nowMs;
      trailPromises.push(
        addDoc(collection(db, 'driver_locations', driverId, 'trail'), {
          ...locationDoc,
          receivedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          ttlExpireAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }).catch(() => undefined)
      );
    }

    try {
      await Promise.all([
        setDoc(doc(db, 'driver_locations', driverId), {
          ...locationDoc,
          receivedAt: serverTimestamp(),
        }, { merge: true }),
        setDoc(doc(db, 'drivers', driverId), {
          ...profileUpdates,
          id: driverId,
          userId: auth.currentUser?.uid || existingDriver.userId || '',
          email: existingDriver.email || '',
          name: existingDriver.name || '',
          currentLocation: {
            lat: Number(latitude),
            lng: Number(longitude),
            accuracy: telemetry.accuracy ?? null,
            speedMph: Number(Number(speedMph || 0).toFixed(1)),
            heading: telemetry.heading ?? null,
            capturedAt: telemetry.capturedAt || telemetry.recordedAt || updatedAtIso,
          },
          lastLocationAt: serverTimestamp(),
          updatedAtLocal: updatedAtIso,
        }, { merge: true }),
        setDoc(doc(db, 'driverProfiles', driverId), {
          ...profileUpdates,
          id: driverId,
          userId: auth.currentUser?.uid || existingDriver.userId || '',
          email: existingDriver.email || '',
          name: existingDriver.name || '',
          lat: Number(latitude),
          lng: Number(longitude),
          locationAccuracy: telemetry.accuracy ?? null,
          speedMph: Number(Number(speedMph || 0).toFixed(1)),
          heading: telemetry.heading ?? null,
          lastLocationUpdate: updatedAtIso,
          updatedAtLocal: updatedAtIso,
        }, { merge: true }),
        ...trailPromises,
      ]);
      emitSystemEvent(buildLocationEvent(driverId, locationDoc, {
        userId: auth.currentUser?.uid || currentUserRef.current || driverId,
        email: auth.currentUser?.email || currentUserRef.current || '',
        role: telemetry.actorRole || roleRef.current || 'driver',
      })).catch((eventErr) => console.error('Location event emission failed:', eventErr));
    } catch (locationErr) {
      console.error('Driver live location write failed:', locationErr);
    }

    const telemetryDate = todayLocal(updatedAt);
    const docId = buildTelemetryDocId(driverId, telemetryDate);
    const previousDoc = getDriverTelemetryForDate(driverTelemetryRef.current, driverId, telemetryDate) || null;
    const previousSample = previousDoc?.breadcrumbs?.[previousDoc.breadcrumbs.length - 1] || null;
    const distanceContribution = movement.elapsedSeconds > 0 && movement.elapsedSeconds <= 15 * 60
      ? movement.distanceMiles
      : 0;
    const totalMovingMinutes = Number(previousDoc?.totalMovingMinutes || 0) + (movement.previousState === 'moving' ? movement.elapsedMinutes : 0);
    const totalStoppedMinutes = Number(previousDoc?.totalStoppedMinutes || 0) + (movement.previousState === 'stopped' ? movement.elapsedMinutes : 0);
    const totalTrackedMiles = Number(previousDoc?.totalTrackedMiles || 0) + distanceContribution;

    const sample = {
      at: updatedAtIso,
      lat: Number(Number(latitude).toFixed(6)),
      lng: Number(Number(longitude).toFixed(6)),
      accuracy: telemetry.accuracy ?? null,
      speedMph: Number(Number(speedMph || 0).toFixed(1)),
      heading: telemetry.heading ?? null,
      state: movement.movementState,
      fraudFlags: fraudSignals.flags || [],
      dwellMinutes: movement.dwellMinutes,
      movingMinutes: movement.movingMinutes,
      tripId: activeTrip?.id || null,
      tripStatus: activeTrip?.status || null,
      patient: activeTrip?.patient || null,
      destination: phase.destination || '',
      destinationType: phase.destinationType,
      distanceDeltaMiles: movement.distanceMiles,
    };

    let breadcrumbs = Array.isArray(previousDoc?.breadcrumbs) ? [...previousDoc.breadcrumbs] : [];
    if (shouldAppendBreadcrumb(previousSample, sample)) {
      breadcrumbs.push(sample);
    } else if (breadcrumbs.length > 0) {
      breadcrumbs[breadcrumbs.length - 1] = sample;
    } else {
      breadcrumbs = [sample];
    }

    let stopEvents = Array.isArray(previousDoc?.stopEvents) ? [...previousDoc.stopEvents] : [];
    const latestStop = stopEvents[stopEvents.length - 1];
    if (movement.movementState === 'stopped') {
      if (movement.stateChanged || !latestStop || latestStop.endedAt) {
        stopEvents.push({
          startedAt: movement.stoppedSince || updatedAtIso,
          endedAt: null,
          minutes: movement.dwellMinutes,
          lat: sample.lat,
          lng: sample.lng,
          tripId: activeTrip?.id || null,
          tripStatus: activeTrip?.status || null,
          patient: activeTrip?.patient || null,
          destination: phase.destination || '',
          destinationType: phase.destinationType,
          lastUpdatedAt: updatedAtIso,
        });
      } else {
        stopEvents[stopEvents.length - 1] = {
          ...latestStop,
          minutes: movement.dwellMinutes,
          lastUpdatedAt: updatedAtIso,
          tripStatus: activeTrip?.status || latestStop.tripStatus || null,
          patient: activeTrip?.patient || latestStop.patient || null,
          destination: phase.destination || latestStop.destination || '',
        };
      }
    } else if (movement.previousState === 'stopped' && latestStop && !latestStop.endedAt) {
      stopEvents[stopEvents.length - 1] = {
        ...latestStop,
        endedAt: updatedAtIso,
        minutes: Math.max(Number(latestStop.minutes || 0), Number(movement.elapsedMinutes || 0)),
        lastUpdatedAt: updatedAtIso,
      };
    }

    const longestStopMinutes = stopEvents.reduce((max, stop) => Math.max(max, Number(stop?.minutes || 0)), Number(previousDoc?.longestStopMinutes || 0));
    const nextTelemetryDoc = trimTelemetryCollections({
      ...(previousDoc || {}),
      id: docId,
      driverId,
      date: telemetryDate,
      driverName: existingDriver.name || 'Driver',
      driverEmail: existingDriver.email || '',
      vehicle: existingDriver.vehicle || '',
      assignedTo: existingDriver.assignedTo || '',
      actorRole: telemetry.actorRole || roleRef.current || existingDriver.role || 'driver',
      liveSample: sample,
      movementState: movement.movementState,
      firstPingAt: previousDoc?.firstPingAt || updatedAtIso,
      lastPingAt: updatedAtIso,
      movingSince: movement.movingSince,
      stoppedSince: movement.stoppedSince,
      currentDwellMinutes: movement.dwellMinutes,
      currentMovingMinutes: movement.movingMinutes,
      totalMovingMinutes: Number(totalMovingMinutes.toFixed(1)),
      totalStoppedMinutes: Number(totalStoppedMinutes.toFixed(1)),
      totalOnlineMinutes: Number((totalMovingMinutes + totalStoppedMinutes).toFixed(1)),
      totalTrackedMiles: Number(totalTrackedMiles.toFixed(2)),
      totalPings: Number(previousDoc?.totalPings || 0) + 1,
      stopCount: stopEvents.filter((stop) => stop?.startedAt).length,
      longestStopMinutes: Number(longestStopMinutes.toFixed(1)),
      maxSpeedMph: Math.max(Number(previousDoc?.maxSpeedMph || 0), Number(speedMph || 0)),
      activeTripId: activeTrip?.id || null,
      activeTripStatus: activeTrip?.status || null,
      activePatient: activeTrip?.patient || null,
      activeDestination: phase.destination || '',
      activePhase: phase.phase,
      breadcrumbs,
      stopEvents,
      updatedAtLocal: updatedAtIso,
    });

    setDriverTelemetry((prev) => {
      const others = prev.filter((item) => item.id !== docId);
      return [nextTelemetryDoc, ...others]
        .sort((a, b) => Date.parse(b?.lastPingAt || b?.updatedAtLocal || 0) - Date.parse(a?.lastPingAt || a?.updatedAtLocal || 0));
    });

    try {
      await setDoc(doc(db, 'driverTelemetry', docId), nextTelemetryDoc, { merge: true });
    } catch (err) {
      console.error('Driver telemetry write failed:', err);
    }
  }, [upsertDriverProfile]);

  const submitAuthAction = async (e) => {
    e.preventDefault();
    setReAuthError('');
    const user = auth.currentUser;
    if (!user || !user.email) {
      setReAuthError('Authentication error. Please log in again.');
      return;
    }
    try {
      const credential = EmailAuthProvider.credential(user.email, authPassword);
      await reauthenticateWithCredential(user, credential);
      if (authActionPayload?.callback) {
        await authActionPayload.callback();
      }
      setShowAuthModal(false);
      setAuthPassword('');
      setAuthActionPayload(null);
      setReAuthError('');
    } catch {
      setReAuthError('Invalid password. Action denied.');
    }
  };

  const renderLoginScreen = () => {
    const handleRoleSelect = (roleKey) => {
      loginPortalRoleRef.current = roleKey;
      setPendingRole(roleKey);
      setPassword('');
      setLoginError('');
      setLoginStep('credentials');
    };

    const submitLogin = async (e) => {
      e.preventDefault();
      setLoginError('');
      await executeLogin(pendingRole);
    };

    return (
      <div className="flex-1 bg-[#5a94af] flex flex-col justify-start lg:justify-center items-center px-4 py-6 relative overflow-y-auto font-outfit" style={{paddingTop: 'max(var(--sat), 1.5rem)', paddingBottom: 'max(var(--sab), 1.5rem)'}}>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(90,148,175,0.45)),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[length:auto,48px_48px,48px_48px]" />
        
        <div className="w-full max-w-lg bg-white border border-slate-200/50 rounded-[2.5rem] overflow-hidden shadow-2xl p-6 sm:p-8 relative z-10">
          <div className="flex flex-col items-center mb-6 text-center">
            <div className="w-20 h-20 sm:w-24 sm:h-24 mb-4 relative">
              <img src="/agape.png" alt="Agape Care" className="w-full h-full object-contain relative z-10" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900 mb-2 leading-tight">Agape<span className="text-blue-600">Care</span></h1>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-full border border-blue-100">
              <ShieldCheck size={14} className="text-blue-600" />
              <p className="text-xs font-semibold text-blue-800 uppercase tracking-[0.18em]">Enterprise Fleet OS</p>
            </div>
          </div>

          {loginStep === 'role_selection' ? (
            <div className="space-y-4">
              <h2 className="text-center text-sm font-semibold text-slate-500 tracking-wide">Secure Access Portal</h2>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { key: 'admin', Icon: ShieldCheck, label: 'Admin Login', sub: 'CEO / Owner only', color: 'indigo' },
                  { key: 'dispatcher', Icon: Briefcase, label: 'Dispatcher Login', sub: 'Fleet Logistics & Command', color: 'blue' },
                  { key: 'driver', Icon: Truck, label: 'Driver Login', sub: 'Field Operations & Service', color: 'emerald' }
                ].map(r => {
                  const Icon = r.Icon;
                  const colorMap = {
                    indigo: 'bg-indigo-600 shadow-indigo-600/20',
                    blue: 'bg-blue-600 shadow-blue-600/20',
                    emerald: 'bg-emerald-600 shadow-emerald-600/20'
                  };
                  return (
                    <button key={r.key} onClick={() => handleRoleSelect(r.key)} 
                      className="flex items-center gap-4 p-4 bg-white border border-slate-100 rounded-2xl hover:bg-slate-50 hover:border-blue-200 active:scale-[0.98] transition-all duration-300 group text-left shadow-sm min-h-[84px]">
                      <div className={`${colorMap[r.color]} rounded-xl text-white shadow-lg shrink-0 transition-transform group-hover:scale-105 flex items-center justify-center w-12 h-12`}>
                        <Icon size={22} strokeWidth={2.5} />
                      </div>
                      <div className="flex-1">
                        <span className="block text-lg font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors">{r.label}</span>
                        <span className="block text-sm font-medium text-slate-500 mt-0.5">{r.sub}</span>
                      </div>
                      <ArrowRight size={20} className="text-slate-300 group-hover:text-blue-600 transition-all transform group-hover:translate-x-1" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <form onSubmit={submitLogin} className="space-y-4">
              <div className="flex items-center gap-4 mb-5 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <button type="button" onClick={() => {
                  loginPortalRoleRef.current = null;
                  setPendingRole(null);
                  setPassword('');
                  setLoginError('');
                  setLoginStep('role_selection');
                }} className="p-2.5 bg-white rounded-xl text-slate-500 hover:text-slate-900 shadow-sm active:scale-95 transition-all"><ArrowRight className="rotate-180" size={18} /></button>
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-widest leading-none mb-1">Authenticating as</p>
                  <p className="text-base font-semibold text-slate-900 capitalize">{pendingRole}</p>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest ml-1">Username</label>
                <div className="relative">
                  <input type="text" required autoCapitalize="none" autoCorrect="off" spellCheck="false" placeholder="waeil.admin" value={email} onChange={(e) => setEmail(e.target.value)} 
                    className="w-full p-3.5 bg-slate-50 rounded-2xl font-semibold border border-slate-200 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:bg-white transition-all outline-none text-base" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest ml-1">Secure Password</label>
                <div className="relative">
                  <input type="password" required placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} 
                    className="w-full p-3.5 bg-slate-50 rounded-2xl font-semibold border border-slate-200 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:bg-white transition-all outline-none text-base" />
                </div>
              </div>

              {loginError && <p className={`text-sm font-semibold text-center mt-2 p-3 rounded-lg border ${loginError.toLowerCase().includes('sent') ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-rose-600 bg-rose-50 border-rose-100'}`}>{loginError}</p>}
              
              <button type="submit" className="w-full py-4 mt-2 bg-[#23568E] hover:bg-[#1B4471] text-white rounded-full font-bold text-lg transition-all shadow-md shadow-blue-800/10 active:scale-95">Authorize Access</button>
              
              <div className="pt-2 flex items-center justify-between text-sm font-bold">
                <button type="button" onClick={handleCreateAccount} className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-full font-semibold transition text-sm">{ALLOW_SELF_PROVISIONING ? 'Provision Account' : 'Request Access'}</button>
                <button type="button" onClick={handlePasswordReset} className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-full font-semibold transition text-sm">Reset Help</button>
              </div>
            </form>
          )}
        </div>
        
        <div className="mt-5 flex flex-col items-center gap-3 relative z-10">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-[0.3em] text-center opacity-60">
            Agape Care Cloud Infrastructure<br />
            Certified Enterprise Environment
          </p>
        </div>
      </div>
    );
  };

  const renderSecurityAuthModal = () => {
    if (!showAuthModal) return null;
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setShowAuthModal(false)} />
        <div className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-sm relative z-10 border border-slate-200">
          <div className="w-16 h-16 bg-gradient-to-tr from-rose-600 to-rose-400 text-white rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-rose-500/30">
            <Lock size={32} />
          </div>
          <h3 className="text-xl font-semibold text-center text-slate-900 mb-2">Security Verification</h3>
          <p className="text-xs text-center text-slate-500 font-medium mb-2">Re-enter your password to authorize: <span className="font-bold text-slate-800">{authActionPayload?.label || 'Action'}</span></p>
          {reAuthError && <p className="text-xs text-center text-rose-600 font-semibold mb-4">{reAuthError}</p>}
          <form onSubmit={submitAuthAction}>
            <input type="password" required placeholder="Enter your password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className="w-full p-4 bg-slate-100/50 rounded-[1rem] font-semibold border border-slate-200/50 focus:border-rose-500 focus:bg-white mb-4" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowAuthModal(false)} className="flex-1 py-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold active:scale-95 transition-all">Cancel</button>
              <button type="submit" className="flex-1 py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold active:scale-95 transition-all shadow-md shadow-rose-500/20">Authorize</button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderBulkAssignModal = () => {
    if (!bulkAssignModal) return null;
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setBulkAssignModal(false)} />
        <div className="bg-white/90 backdrop-blur-xl w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl relative z-10 border border-white/50 max-h-[85vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
              <Truck size={24} className="text-emerald-600" /> Bulk Assignment
            </h3>
            <button onClick={() => setBulkAssignModal(false)} className="p-2 bg-slate-100 rounded-[1rem] text-slate-600 active:scale-95 transition-all"><X size={20} /></button>
          </div>
          
          <div className="bg-emerald-50 rounded-2xl p-4 mb-6 border border-emerald-100">
            <p className="text-sm font-bold text-emerald-900">Assigning {selectedTasks.length} Trips</p>
            <p className="text-sm font-medium text-emerald-700 mt-0.5">Select a driver below to assign all selected tasks.</p>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-1">Available Fleet</h4>
            <div className="grid grid-cols-1 gap-2">
              {scopedDrivers.map(d => (
                <button key={d.id} onClick={() => bulkAssignTrips(d.id)} className="w-full flex items-center justify-between p-4 bg-white/50 border border-slate-200 rounded-2xl hover:bg-white hover:border-blue-300 hover:shadow-md transition-all group text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                      <User size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{d.name}</p>
                      <p className="text-xs font-medium text-slate-500">{d.vehicle || 'No Vehicle'} &bull; Active</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="success">Active</Badge>
                    <span className="text-xs font-bold text-blue-600">Assign &rarr;</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
          
          <button onClick={() => setBulkAssignModal(false)} className="w-full mt-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold active:scale-95 transition-all">Cancel</button>
        </div>
      </div>
    );
  };
  const renderSmartAssignModal = () => {
    if (!smartAssignTrip) return null;
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-12">
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => { setSmartAssignTrip(null); setSmartAssignResult(null); }} />
        <div className="bg-white/90 backdrop-blur-xl w-full max-w-2xl rounded-[2.5rem] sm:rounded-[3rem] p-6 sm:p-10 shadow-2xl relative z-10 border border-white/50 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-6">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-[1.2rem] flex items-center justify-center shadow-md ${aiAnalyzing ? 'bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white animate-pulse' : 'bg-indigo-100 text-indigo-700'}`}>
                {aiAnalyzing ? <Activity size={28} /> : <BrainCircuit size={28} />}
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-semibold text-slate-900">AI Chain-Route</h3>
                <p className="text-sm font-semibold text-slate-500 mt-1 uppercase tracking-widest">Target: {smartAssignTrip.patient}</p>
              </div>
            </div>
            <button onClick={() => { setSmartAssignTrip(null); setSmartAssignResult(null); }} className="p-2.5 bg-slate-100 rounded-[1rem] text-slate-600 active:scale-95 transition-all"><X size={20} /></button>
          </div>
          <div className="bg-slate-50/80 rounded-2xl p-4 mb-6 border border-slate-200/50">
            <div className="grid grid-cols-2 gap-4 text-xs font-bold text-slate-600">
              <div><span className="text-slate-500 block mb-1">Time</span>{smartAssignTrip.time}</div>
              <div><span className="text-slate-500 block mb-1">Type</span>{smartAssignTrip.type}</div>
              <div className="col-span-2"><span className="text-slate-500 block mb-1">Route</span>{smartAssignTrip.pickup} <ArrowRight size={12} className="inline text-slate-300 mx-1" /> {(smartAssignTrip.dropoff || '').split(' ')[0]}</div>
            </div>
          </div>
          {aiAnalyzing ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 relative">
                <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                <Zap className="absolute inset-0 m-auto text-indigo-600 animate-pulse" size={24} />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800">Analyzing live telemetry...</p>
                <p className="text-xs font-medium text-slate-500 mt-1">Checking schedules, traffic, and proximities.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2"><Target size={14} /> AI Assignment Result</h4>
              {smartAssignResult && smartAssignResult.driverId ? (
                (() => {
                  const d = scopedDrivers.find(drv => drv.id === smartAssignResult.driverId);
                  if (!d) return <p className="text-sm text-slate-500">Suggested driver not found in fleet.</p>;
                  const isHighScore = smartAssignResult.score >= 80;
                  const isMidScore = smartAssignResult.score >= 50;
                  const borderClass = isHighScore ? 'border-emerald-200 bg-emerald-50/50' : isMidScore ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-slate-50';
                  const badgeClass = isHighScore ? 'bg-emerald-500' : isMidScore ? 'bg-amber-500' : 'bg-slate-400';
                  const btnClass = isHighScore ? 'bg-emerald-600 shadow-emerald-500/20' : isMidScore ? 'bg-amber-600 shadow-amber-500/20' : 'bg-slate-600 shadow-slate-500/20';
                  return (
                    <div className={`border ${borderClass} rounded-[1.5rem] p-5 shadow-sm relative overflow-hidden`}>
                      <div className={`absolute top-0 right-0 ${badgeClass} text-white px-3 py-1 rounded-bl-xl font-bold text-xs tracking-wider`}>{smartAssignResult.score}% Match</div>
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-[1rem] bg-slate-200/50 text-slate-700 flex items-center justify-center font-semibold">{d.name.split(' ').map(n => n[0]).join('')}</div>
                          <div>
                            <h4 className="text-lg font-semibold text-slate-900">{d.name}</h4>
                            <p className="text-sm font-semibold text-slate-500">{d.vehicle} &bull; {d.dist}</p>
                          </div>
                        </div>
                        <button onClick={() => assignTripToDriver(smartAssignTrip.id, d.id)} className={`${btnClass} text-white px-5 py-2.5 rounded-[1rem] font-bold text-sm active:scale-95 transition-all shadow-md`}>Assign</button>
                      </div>
                      {smartAssignResult.reason && (
                        <div className="mt-4 pt-4 border-t border-slate-200/50">
                          <div className="flex gap-2 items-start">
                            <BrainCircuit size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                            <p className="text-xs font-medium text-slate-700 leading-snug">{smartAssignResult.reason}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : smartAssignResult && !smartAssignResult.driverId ? (
                <div className="p-6 text-center bg-slate-50 rounded-2xl">
                  <AlertCircle size={24} className="mx-auto text-amber-500 mb-2" />
                  <p className="text-xs font-bold text-slate-600">{smartAssignResult.reason || 'No suitable driver found'}</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderManualAssignModal = () => {
    if (!manualAssignTrip) return null;
    const availableDrivers = scopedDrivers.filter(d => d.status === 'Available');
    const otherDrivers = scopedDrivers.filter(d => d.status !== 'Available');
    
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-12">
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setManualAssignTrip(null)} />
        <div className="bg-white/95 backdrop-blur-xl w-full max-w-xl rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-10 shadow-2xl relative z-10 border border-white/50 max-h-[90vh] flex flex-col">
          <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-[1rem] bg-blue-100 text-blue-700 flex items-center justify-center shadow-sm">
                <Users size={24} />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-900">Manual Assignment</h3>
                <p className="text-xs font-semibold text-slate-500 mt-0.5 uppercase tracking-widest">Assign: {manualAssignTrip.patient}</p>
              </div>
            </div>
            <button onClick={() => setManualAssignTrip(null)} className="p-2.5 bg-slate-100 rounded-[1rem] text-slate-600 active:scale-95 transition-all"><X size={20} /></button>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-6 scrollbar-thin">
            {availableDrivers.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-emerald-600 uppercase tracking-widest flex items-center gap-1.5"><CheckCircle2 size={12} /> Available Fleet</h4>
                <div className="grid grid-cols-1 gap-2">
                  {availableDrivers.map(d => (
                    <button key={d.id} onClick={() => { assignTripToDriver(manualAssignTrip.id, d.id); setManualAssignTrip(null); }}
                      className="flex items-center justify-between p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl hover:bg-emerald-50 active:scale-[0.98] transition-all group">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">{String(d?.name || '?').charAt(0)}</div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-slate-900">{d.name}</p>
                          <p className="text-xs font-medium text-slate-500">{d.vehicle} • {d.currentZone}</p>
                        </div>
                      </div>
                      <ArrowRight size={16} className="text-emerald-400 group-hover:translate-x-1 transition-transform" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {otherDrivers.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Clock size={12} /> Other Drivers ({otherDrivers.length})</h4>
                <div className="grid grid-cols-1 gap-2">
                  {otherDrivers.map(d => (
                    <button key={d.id} onClick={() => { assignTripToDriver(manualAssignTrip.id, d.id); setManualAssignTrip(null); }}
                      className="flex items-center justify-between p-4 bg-slate-50/50 border border-slate-100 rounded-2xl hover:bg-slate-50 active:scale-[0.98] transition-all group opacity-80 hover:opacity-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold">{String(d?.name || '?').charAt(0)}</div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-slate-900">{d.name}</p>
                          <p className="text-xs font-medium text-slate-500">Active &bull; {d.vehicle}</p>
                        </div>
                      </div>
                      <ArrowRight size={16} className="text-slate-300 group-hover:translate-x-1 transition-transform" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderOptimizeAllModal = () => {
    if (!showOptimizeModal) return null;
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-12">
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => !aiAnalyzing && setShowOptimizeModal(false)} />
        <div className="bg-white/90 backdrop-blur-xl w-full max-w-xl rounded-[2.5rem] p-8 shadow-2xl relative z-10 border border-white/50">
          <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-6">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white p-3 rounded-[1rem] shadow-md"><Wand2 size={24} /></div>
              <h3 className="text-2xl font-semibold text-slate-900">Fleet AI Optimizer</h3>
            </div>
            {!aiAnalyzing && <button onClick={() => setShowOptimizeModal(false)} className="p-2.5 bg-slate-100 rounded-[1rem] text-slate-600 active:scale-95 transition-all"><X size={20} /></button>}
          </div>
          {aiAnalyzing ? (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-24 h-24 relative">
                <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                <BrainCircuit className="absolute inset-0 m-auto text-indigo-600 animate-pulse" size={32} />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-800">Processing Daily Trips...</p>
                <p className="text-sm font-medium text-slate-500 mt-2">Distributing for maximum fuel efficiency and zero wait time.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100 text-center">
                <p className="text-sm font-bold text-indigo-900 mb-2">Ready to optimize Agape Care routes?</p>
                <p className="text-xs text-indigo-700/80">This will auto-assign all unassigned trips based on live traffic, capacity, and schedules.</p>
              </div>
              <button onClick={() => { triggerFleetOptimization().then(() => setShowOptimizeModal(false)); }} className="w-full py-4 bg-indigo-600 text-white rounded-[1rem] font-bold text-lg active:scale-95 transition-all flex items-center justify-center gap-3 shadow-md shadow-indigo-500/30">
                <Zap size={20} /> Launch Optimization
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };


  return (
    <>
      <div className="h-full flex-1 flex flex-col bg-[var(--bg-app)] overflow-hidden w-full">
      {/* Header removed: DriverPage handles its own UI */}
      {startupIssue && !isLoading && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2 text-xs sm:text-sm font-semibold text-amber-800 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 min-w-0"><AlertCircle size={16} className="shrink-0" /> <span className="truncate">{startupIssue}</span></span>
          <button onClick={() => setStartupIssue('')} className="text-amber-700 hover:text-amber-900 font-bold shrink-0">Dismiss</button>
        </div>
      )}
      {isAuthenticated && (
        // Status bar removed per UX request — connection indicator now next to company name in page headers
        <></>
      )}

      {/* LOADING SCREEN */}
      {isLoading ? (
        <div className="flex-1 bg-gradient-to-br from-[#3d7a96] via-[#5a94af] to-[#7bb3c9] flex items-center justify-center px-4 font-outfit overflow-hidden relative">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-32 -right-32 w-96 h-96 bg-white/5 rounded-full animate-pulse" />
            <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-white/5 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/[0.03] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
          </div>
          <div className="relative z-10 flex flex-col items-center gap-8 text-center max-w-sm">
            <div className="relative">
              <div className="absolute inset-0 bg-white/20 rounded-full blur-2xl scale-150 animate-pulse" />
              <div className="relative bg-white/15 backdrop-blur-sm rounded-3xl p-6 border border-white/20 shadow-2xl">
                <img src="/agape.png" alt="Agape Care" className="w-20 h-20 object-contain drop-shadow-lg" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-black text-white tracking-tight drop-shadow-md">Agape Care</h1>
              <p className="text-sm font-medium text-white/70">Preparing your workspace...</p>
            </div>
            <div className="w-48 h-1 bg-white/15 rounded-full overflow-hidden">
              <div className="h-full bg-white/60 rounded-full animate-loadingSlide" />
            </div>
            {startupIssue && (
              <p className="text-xs font-bold text-amber-200 bg-amber-500/20 border border-amber-400/30 rounded-xl px-4 py-2 backdrop-blur-sm">{startupIssue}</p>
            )}
            {showLoadingRecovery && (
              <div className="w-full space-y-3">
                <p className="text-xs font-semibold text-white/60 leading-relaxed">This is taking longer than expected.</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => window.location.reload()} className="h-11 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-sm backdrop-blur-sm border border-white/20 transition active:scale-95">Retry</button>
                  <button onClick={async () => { skipNextSignedOutResetRef.current = true; await signOut(auth).catch(() => {}); resetSessionState({ loginErrorMessage: 'Session reset. Please sign in again.' }); }} className="h-11 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 font-bold text-sm backdrop-blur-sm border border-white/15 transition active:scale-95">Sign In Again</button>
                </div>
                <button onClick={async () => { await repairBrowserStatePreservingAuth().catch(() => {}); window.location.reload(); }} className="w-full h-11 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 font-bold text-sm backdrop-blur-sm border border-amber-400/25 transition active:scale-95">Repair & Reload</button>
              </div>
            )}
          </div>
        </div>
      ) : !isAuthenticated ? (
        renderLoginScreen()
      ) : (
        <>
          {role === 'driver' ? (() => {
            // Build a provisional profile if none exists yet — never block on profile existence
            const myDriver = currentUserDriverProfile || (
              auth.currentUser ? {
                ...buildDriverProfileFromEmail(
                  auth.currentUser.email || currentUser || '',
                  auth.currentUser.uid
                ),
                id: buildStableProfileId('driver', auth.currentUser.uid) ||
                    buildDriverProfileFromEmail(auth.currentUser.email || currentUser || '', auth.currentUser.uid).id,
                isProvisioningProfile: true,
              } : null
            );
            if (!myDriver) return null;
            const driverId = myDriver.id;
            const myTrips = currentUserDriverTrips;
            const myDrivers = myDriver ? [myDriver] : [];
            return <Suspense fallback={<LazyFallback />}><DriverPage currentUser={currentUser} role={role} drivers={myDrivers} trips={myTrips}
              allDrivers={drivers}
              dispatchers={dispatchers}
              chatUnreadCount={chatUnreadCount}
              driverAssignments={driverAssignmentInbox.assignments}
              assignmentUnreadCount={driverAssignmentInbox.unseenCount}
              onAcknowledgeAssignment={driverAssignmentInbox.acknowledgeAssignment}
              onAcceptAssignment={driverAssignmentInbox.acceptAssignment}
              appSettings={appSettings}
              activeMission={myDriver?.activeMission}
              phoneNumbers={phoneNumbers}
              onOpenSettings={() => setActiveTab('settings')}
              onLogout={handleLogout}
              onUpdateAppSettings={updateAppSettings}
              onUpdateMission={(updatedMission) => {
                setDrivers(prev => prev.map(d => d.id === driverId ? { ...d, activeMission: updatedMission } : d));
                // Firestore auto-syncs via useFirestoreAppData
              }}
              onUpdateDriverLocation={handleUpdateDriverLocation}
              onUpdateTrip={(tripId, status, extraData = {}) => {
                const prevTrip = trips.find(t => t.id === tripId);
                setTrips(prev => prev.map(t => t.id === tripId ? { ...t, status, ...extraData } : t));
                if (prevTrip) {
                  const newTrip = { ...prevTrip, status, ...extraData };
                  const changed = [];
                  Object.keys(newTrip).forEach((k) => {
                    const a = prevTrip[k];
                    const b = newTrip[k];
                    if (String(a) !== String(b)) changed.push({ field: k, before: a, after: b });
                  });
                  if (changed.length > 0) {
                    const details = changed.map(c => `${c.field}: ${c.before ?? '—'} → ${c.after ?? '—'}`).join('; ');
                    addAuditLog('Driver Update', `${currentUser} (Driver) updated trip ${tripId} (${prevTrip?.patient || 'Unknown'})`, 'blue', { entity: 'trip', id: tripId, diffs: changed, summary: details });
                  }
                }
              }}
              onDriverStatusUpdate={handleDriverStatusUpdate}
              onCompleteTrip={(tripId, driverId, odometer) => {
                handleCompleteTrip(tripId, driverId, odometer);
              }}
              onAddAuditLog={addAuditLog}
              onAddTrip={addTrip}
              requestAuthAction={requestAuthAction}
              showAddTripModal={showAddTripModal}
              setShowAddTripModal={setShowAddTripModal}
            /></Suspense>;
          })() : (
            <Suspense fallback={<LazyFallback />}><EnterpriseDashboard
              role={role}
              currentUser={currentUser}
              trips={scopedTrips}
              setTrips={setTrips}
              drivers={scopedDrivers}
              setDrivers={setDrivers}
              upsertDriverProfile={upsertDriverProfile}
              dispatchers={dispatchers}
              setDispatchers={setDispatchers}
              vehicles={vehicles}
              setVehicles={setVehicles}
              onDispatcherStatusUpdate={handleDispatcherStatusUpdate}
              trashedTrips={trashedTrips}
              restoreTrip={restoreTrip}
              deleteTrashedTrip={deleteTrashedTrip}
              logs={logs}
              setLogs={setLogs}
              phoneNumbers={phoneNumbers}
              setPhoneNumbers={setPhoneNumbers}
              setTrashedTrips={setTrashedTrips}
              appSettings={appSettings}
              updateAppSettings={updateAppSettings}
              selectedTasks={selectedTasks}
              setSelectedTasks={setSelectedTasks}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              smartAssignTrip={smartAssignTrip}
              setSmartAssignTrip={setSmartAssignTrip}
              manualAssignTrip={manualAssignTrip}
              setManualAssignTrip={setManualAssignTrip}
              smartAssignResult={smartAssignResult}
              setSmartAssignResult={setSmartAssignResult}
              aiAnalyzing={aiAnalyzing}
              setAiAnalyzing={setAiAnalyzing}
              showOptimizeModal={showOptimizeModal}
              setShowOptimizeModal={setShowOptimizeModal}
              showUploadModal={showUploadModal}
              setShowUploadModal={setShowUploadModal}
              uploadAssignDriver={uploadAssignDriver}
              setUploadAssignDriver={setUploadAssignDriver}
              bulkAssignModal={bulkAssignModal}
              setBulkAssignModal={setBulkAssignModal}
              showDispatcherArchive={showDispatcherArchive}
              setShowDispatcherArchive={setShowDispatcherArchive}
              addToast={addToast}
              addAuditLog={addAuditLog}
              persistState={noopRef.current}
              driverTelemetry={driverTelemetry}
              hasPermission={hasPermission}
              requestAuthAction={requestAuthAction}
              triggerSmartAssign={triggerSmartAssign}
              triggerFleetOptimization={triggerFleetOptimization}
              assignTripToDriver={assignTripToDriver}
              bulkAssignTrips={bulkAssignTrips}
              createSharedRide={createSharedRide}
              createLegMission={createLegMission}
              requestDeleteTrip={requestDeleteTrip}
              requestBulkDelete={requestBulkDelete}
              updateTrip={updateTrip}
              updateTrashedTrip={updateTrashedTrip}
              chatUnreadCount={chatUnreadCount}
              makeCall={makeCall}
              sendSMS={sendSMS}
              handleUpdateDriverLocation={handleUpdateDriverLocation}
              addTrip={addTrip}
              showAddTripModal={showAddTripModal}
              setShowAddTripModal={setShowAddTripModal}
              driverWorkDrivers={role === 'admin' ? drivers : role === 'dispatcher' ? scopedDrivers : currentUserDriverProfile ? [currentUserDriverProfile] : []}
              driverWorkTrips={role === 'admin' ? trips : role === 'dispatcher' ? scopedTrips : currentUserDriverTrips}
              allDrivers={drivers}
              onUpdateMission={(updatedMission) => {
                setDrivers(prev => prev.map(d => normalizeEmail(d.email) === normalizeEmail(currentUser) ? { ...d, activeMission: updatedMission } : d));
              }}
              onUpdateDriverTrip={(tripId, status, extraData = {}) => {
                const prevTrip = trips.find(t => t.id === tripId);
                setTrips(prev => prev.map(t => t.id === tripId ? { ...t, status, ...extraData } : t));
                if (prevTrip) {
                  const nextTrip = { ...prevTrip, status, ...extraData };
                  const diffs = [];
                  Object.keys(nextTrip).forEach((key) => {
                    if (String(prevTrip?.[key]) !== String(nextTrip?.[key])) {
                      diffs.push({ field: key, before: prevTrip?.[key], after: nextTrip?.[key] });
                    }
                  });
                  addAuditLog(
                    'Worker Driver Update',
                    `${currentUser} updated trip ${tripId} (${prevTrip?.patient || 'Unknown'}) to ${status}`,
                    'blue',
                    { entity: 'trip', id: tripId, diffs, summary: diffs.map((diff) => `${diff.field}: ${diff.before ?? '—'} → ${diff.after ?? '—'}`).join('; ') }
                  );
                }
              }}
              onDriverStatusUpdate={handleDriverStatusUpdate}
              onCompleteTrip={handleCompleteTrip}
              onLogout={handleLogout}
            /></Suspense>
          )}

          {/* Global Modals */}
          {showAddTripModal && (
            <Suspense fallback={<LazyFallback />}>
            <AddTripModal
              onClose={() => setShowAddTripModal(false)}
              onAddTrip={addTrip}
              role={role}
              currentUser={currentUser}
              drivers={role === 'driver' ? (currentUserDriverProfile ? [currentUserDriverProfile] : []) : role === 'dispatcher' ? scopedDrivers : drivers}
              dispatchers={dispatchers}
            />
            </Suspense>
          )}
          {renderSecurityAuthModal()}

          {messageBanners.length > 0 && (
            <div
              className="fixed left-3 right-3 top-[calc(env(safe-area-inset-top,0px)+10px)] z-[210] mx-auto flex max-w-md flex-col gap-2 md:left-auto md:right-6 md:top-6"
              aria-live="polite"
            >
              {messageBanners.map(banner => (
                <button
                  key={banner.id}
                  type="button"
                  onClick={() => openMessageBanner(banner)}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 text-left shadow-xl shadow-slate-900/10 ring-1 ring-white/80 transition hover:bg-white"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-black uppercase text-white shadow-sm">
                    {(banner.senderName || banner.senderEmail || 'M').slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <MessageCircle size={14} className="shrink-0 text-blue-600" />
                      <p className="truncate text-sm font-black text-slate-950">{banner.senderName || 'New message'}</p>
                    </div>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-600">{banner.message}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">
                    Open
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Toast Notifications - Global */}
          <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-[200] flex flex-col gap-3 pointer-events-none">
            {toasts.map(toast => (
              <div key={toast.id} className="pointer-events-auto bg-white/90 backdrop-blur-xl border border-slate-200 rounded-xl p-4 shadow-2xl flex gap-3 items-start animate-in max-w-sm">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  toast.type === 'success' ? 'bg-emerald-50 text-emerald-600' :
                  toast.type === 'danger' ? 'bg-red-50 text-red-600' :
                  'bg-blue-50 text-blue-600'
                }`}>
                  {toast.type === 'success' ? <CheckCircle2 size={20} /> :
                   toast.type === 'danger' ? <AlertTriangle size={20} /> :
                   <Zap size={20} />}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">{toast.title}</h4>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">{toast.message}</p>
                </div>
              </div>
            ))}
          </div>

          {/* PWA Components */}
          <PWAInstallPrompt />
          <PWAUpdatePrompt />
          <OfflineIndicator />
        </>
      )}
    </div>
    </>
  );
};

export default App;
