import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { tripMatchesTodayOrTomorrow, timeToMinutes, isTripLate } from '../utils/tripDate';
import { auth, db, doc, onSnapshot, setDoc, EmailAuthProvider, reauthenticateWithCredential, saveOdometerReading, saveTripWorkflowUpdate } from '../config/firebase';
import { optimizeRoute as aiOptimizeRoute } from '../config/ai';
import { getDistanceMiles } from '../config/maps';
import { showLocalNotification } from '../config/notifications';
import { playNotificationSound } from '../utils/notificationSound';
import ChatPage from './ChatPage';
import DriverToolsPage from './DriverToolsPage';
import { getDriverActiveRoutePlan, ROUTE_ASSIGNMENT_STATUS } from '../utils/routePlans';
import TaskCard from './TaskCard';
import EditTripModal from './EditTripModal';
import {
  Truck, MapPin, Phone, MessageCircle, CheckCircle2, XCircle,
  AlertCircle, Navigation, Gauge, Clock, User, ChevronRight, Play, Check,
  ChevronUp, ChevronDown, RotateCcw, Lock, RefreshCw, Forward,
  Home, Settings, LogOut,
  Wifi, WifiOff, ArrowLeft, ArrowRight, Search,
  Repeat, Zap, X, Route,
  CheckSquare, Square, Map, BarChart3, Sun, Moon,
  Download, Trash2, FileText, AlertTriangle, Info,
  Copy, PhoneForwarded, Shield, Headphones, Building, Edit2
} from 'lucide-react';
import { openNavigation, showNavActionSheet, makeCall, sendSMS, showCallActionSheet } from '../utils/nativeActions';
import { impact } from '../utils/haptics';
import { isNativeShell } from '../utils/platform';
import { buildContactList, getPrimaryContact, getContactWarning, formatPhoneDisplay, cleanPhone, getContactRoleIcon, getContactRoleActions } from '../utils/smartContacts';
import { resolveStatus } from '../constants/tripSeverity';
import { normalizeEmail } from '../utils/accessControl';

import ErrorBoundary from './ErrorBoundary';
const RouteSequencerApp = lazy(() => import('./RouteSequencer'));
const LazyFallback = () => <div className="flex items-center justify-center p-12"><div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" /></div>;

const isInOutTrip = (trip) => {
  if (!trip) return false;
  const notes = String(trip.notes || '').toUpperCase();
  return notes.includes('IN/OUT') || notes.includes('IN OUT') || notes.includes('IN & OUT');
};

const isWillCall = (trip) => {
  if (isInOutTrip(trip)) return false;
  const t = (trip && typeof trip === 'object') ? trip.time : trip;
  if (t === undefined || t === null) return true;
  const s = String(t).toUpperCase().trim();
  return s === '' || s === 'WILL CALL' || s === 'WC';
};

const to12hr = (time) => {
  if (!time || time === 'Will Call' || time === 'WC') return time || 'Will Call';
  const m = String(time).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (m && m[3]) return time;
  const parts = String(time).match(/(\d{1,2}):(\d{2})/);
  if (!parts) return time;
  let h = parseInt(parts[1], 10);
  const min = parts[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${min} ${ampm}`;
};

const to24hr = (time) => {
  if (!time || time === 'Will Call' || time === 'WC') return time || 'Will Call';
  const m = String(time).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (m && m[3]) {
    let h = parseInt(m[1], 10);
    const min = m[2];
    const ap = m[3].toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    else if (ap === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${min}`;
  }
  const parts = String(time).match(/(\d{1,2}):(\d{2})/);
  if (parts) return `${parts[1].padStart(2, '0')}:${parts[2]}`;
  return time || '';
};

const formatIsoTo24hr = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const formatTimeInput = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (!isNaN(d.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const m = String(v).match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : v;
};

const formatDuration = (minutes) => {
  if (!minutes || minutes < 0) return '--';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
};

const buildFallbackDriverProfile = (email = '') => ({
  id: '',
  email,
  name: String(email || 'Driver').replace(/@auth\.agapecare\.local$/i, '').split('@')[0] || 'Driver',
  phone: '',
  status: 'Offline',
  vehicle: '',
  currentZone: '',
  odometer: 0,
  nextOilChange: 5000,
  clockedIn: false,
});

const WORKFLOW_TERMINAL_STATUSES = new Set(['Completed', 'Cancelled', 'No Show', 'Rerouted']);
const normalizeWorkflowStatus = (status) => String(status || '').trim().toLowerCase();
const isWorkflowTerminalTrip = (trip) => {
  if (!trip) return false;
  const status = normalizeWorkflowStatus(trip.status);
  return [...WORKFLOW_TERMINAL_STATUSES].some((terminal) => normalizeWorkflowStatus(terminal) === status);
};

const getWorkflowStepIndex = (trip) => {
  if (!trip) return -1;
  if (isWorkflowTerminalTrip(trip)) return 6;
  if (trip.arrivalDropoffTime || trip.status === 'At Dropoff' || trip.status === 'Arrived') return 5;
  if (trip.status === 'Navigating Dropoff') return 4;
  if (trip.departedPickupTime || trip.paperSignatureConfirmed || trip.unableToSign || trip.status === 'In Transit') return 3;
  if (trip.pickupOdometer || trip.arrivalTime || trip.status === 'At Pickup') return 2;
  if (trip.status === 'Navigating Pickup') return 1;
  if (trip.startedAt || trip.status === 'In Progress' || trip.status === 'In Mission' || trip.status === 'En Route') return 0;
  return -1;
};

const getWorkflowSteps = (trip) => {
  const idx = getWorkflowStepIndex(trip);
  return [
    { key: 'start', label: 'Start Trip', phase: 'pickup', done: idx >= 0 },
    { key: 'nav-pickup', label: 'Navigate to Pickup', phase: 'pickup', done: idx >= 1 },
    { key: 'arrive-pickup', label: 'Arrive at Pickup', phase: 'pickup', done: idx >= 2 },
    { key: 'begin-transport', label: 'Begin Transport', phase: 'pickup', done: idx >= 3 },
    { key: 'nav-dropoff', label: 'Navigate to Dropoff', phase: 'dropoff', done: idx >= 4 },
    { key: 'arrive-dropoff', label: 'Arrive at Dropoff', phase: 'dropoff', done: idx >= 5 },
    { key: 'complete', label: 'Complete Trip', phase: 'dropoff', done: idx >= 6 },
  ];
};

const getCurrentWorkflowStep = (trip) => getWorkflowSteps(trip).findIndex(s => !s.done);

const WORKFLOW_PROGRESS_FIELDS = [
  'startedAt',
  'pickupOdometer',
  'arrivalTime',
  'startTime',
  'departedPickupTime',
  'paperSignatureConfirmed',
  'unableToSign',
  'arrivalDropoffTime',
  'dropoffOdometer',
  'completedAt',
  'completedVehicle',
];

const WORKFLOW_FIELD_MIN_STEP = {
  startedAt: 0,
  pickupOdometer: 2,
  arrivalTime: 2,
  startTime: 2,
  departedPickupTime: 3,
  paperSignatureConfirmed: 3,
  unableToSign: 3,
  arrivalDropoffTime: 5,
  dropoffOdometer: 6,
  completedAt: 6,
  completedVehicle: 6,
};

const hasWorkflowValue = (value) => value !== undefined && value !== null && value !== '';

const readWorkflowProgress = (storageKey) => {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

const getWorkflowExtraFields = (progress = {}) => {
  const extraFields = {};
  WORKFLOW_PROGRESS_FIELDS.forEach((field) => {
    if (hasWorkflowValue(progress[field])) extraFields[field] = progress[field];
  });
  return extraFields;
};

const applyWorkflowProgress = (trip, progress) => {
  if (!trip || !progress) return trip;
  const merged = { ...trip };
  WORKFLOW_PROGRESS_FIELDS.forEach((field) => {
    if (hasWorkflowValue(progress[field]) && !hasWorkflowValue(merged[field])) {
      merged[field] = progress[field];
    }
  });

  if (hasWorkflowValue(progress.status)) {
    const currentIndex = getWorkflowStepIndex(merged);
    const progressTrip = { ...merged, ...getWorkflowExtraFields(progress), status: progress.status };
    const progressIndex = getWorkflowStepIndex(progressTrip);
    if (progress.workflowRegression || progressIndex >= currentIndex) {
      merged.status = progress.status;
    }
  }

  return merged;
};

const DriverPage = ({ currentUser, role, drivers = [], trips = [], activeMission, onUpdateMission, onUpdateTrip, onDriverStatusUpdate, onCompleteTrip, onOpenSettings, onLogout, appSettings = {}, phoneNumbers = {}, onUpdateDriverLocation, onUpdateAppSettings, allDrivers, dispatchers, chatUnreadCount = 0, onAddTrip, showAddTripModal, setShowAddTripModal, onAddAuditLog, requestAuthAction }) => {
  const me = useMemo(
    () =>
      drivers.find(d => (d.email || '').toLowerCase() === (currentUser || '').toLowerCase()) ||
      (allDrivers || []).find(d => (d.email || '').toLowerCase() === (currentUser || '').toLowerCase()) ||
      buildFallbackDriverProfile(currentUser || ''),
    [drivers, allDrivers, currentUser]
  );
  const normalizedCurrentUserEmail = useMemo(
    () => (currentUser || me?.email || '').trim().toLowerCase(),
    [currentUser, me?.email]
  );
  const driverIdentityIds = useMemo(() => {
    const knownProfiles = [...(drivers || []), ...(allDrivers || [])];
    return new Set(
      knownProfiles
        .filter((driver) => (driver?.email || '').trim().toLowerCase() === normalizedCurrentUserEmail)
        .map((driver) => driver.id)
        .concat(me?.id ? [me.id] : [])
        .filter(Boolean)
    );
  }, [drivers, allDrivers, me?.id, normalizedCurrentUserEmail]);
  const tripBelongsToCurrentDriver = useCallback((trip) => {
    if (!trip) return false;
    if (trip.driverId && driverIdentityIds.has(trip.driverId)) return true;
    const resolvedDriverEmail = (
      trip.driverEmail ||
      drivers.find((driver) => driver.id === trip.driverId)?.email ||
      (allDrivers || []).find((driver) => driver.id === trip.driverId)?.email ||
      ''
    ).trim().toLowerCase();
    return !!normalizedCurrentUserEmail && resolvedDriverEmail === normalizedCurrentUserEmail;
  }, [driverIdentityIds, normalizedCurrentUserEmail, drivers, allDrivers]);
  const rawDriverScopedTrips = useMemo(
    () => (Array.isArray(trips) ? trips.filter(tripBelongsToCurrentDriver) : []),
    [trips, tripBelongsToCurrentDriver]
  );
  const userKey = (currentUser || 'anon').replace(/[^a-zA-Z0-9@._-]/g, '_');
  const workflowStorageKey = `agape_drvWorkflow_${userKey}`;
  const [workflowProgressState, setWorkflowProgressState] = useState(() => ({
    storageKey: workflowStorageKey,
    data: readWorkflowProgress(workflowStorageKey),
  }));
  const workflowProgress = workflowProgressState.data;
  const setWorkflowProgressData = useCallback((updater) => {
    setWorkflowProgressState((prev) => {
      const baseData = prev.storageKey === workflowStorageKey ? prev.data : readWorkflowProgress(workflowStorageKey);
      const nextData = typeof updater === 'function' ? updater(baseData) : updater;
      return { storageKey: workflowStorageKey, data: nextData || {} };
    });
  }, [workflowStorageKey]);
  const driverScopedTrips = useMemo(
    () => rawDriverScopedTrips.map((trip) => applyWorkflowProgress(trip, workflowProgress[trip.id])),
    [rawDriverScopedTrips, workflowProgress]
  );

  useEffect(() => {
    if (workflowProgressState.storageKey !== workflowStorageKey) {
      setWorkflowProgressState({
        storageKey: workflowStorageKey,
        data: readWorkflowProgress(workflowStorageKey),
      });
    }
  }, [workflowProgressState.storageKey, workflowStorageKey]);

  useEffect(() => {
    if (workflowProgressState.storageKey !== workflowStorageKey) return;
    try {
      localStorage.setItem(workflowStorageKey, JSON.stringify(workflowProgress));
    } catch {}
  }, [workflowProgressState.storageKey, workflowStorageKey, workflowProgress]);

  const [activeNav, setActiveNav] = useState(() => {
    const savedNav = localStorage.getItem(`agape_drvNav_${userKey}`) || 'trips';
    return ['trips', 'tools', 'history', 'chat', 'settings'].includes(savedNav) ? savedNav : 'trips';
  });
  const [historyFilter, setHistoryFilter] = useState(() => localStorage.getItem(`agape_drvHistFilter_${userKey}`) || 'all');
  const [historySearch, setHistorySearch] = useState(() => localStorage.getItem(`agape_drvHistSearch_${userKey}`) || '');
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const [historyDate, setHistoryDate] = useState(todayStr);

  useEffect(() => {
    localStorage.setItem(`agape_drvNav_${userKey}`, activeNav);
    localStorage.setItem(`agape_drvHistFilter_${userKey}`, historyFilter);
    localStorage.setItem(`agape_drvHistSearch_${userKey}`, historySearch);
  }, [activeNav, historyFilter, historySearch, userKey]);
  const [selectedTrips, setSelectedTrips] = useState([]);
  const [routePlanStops, setRoutePlanStops] = useState(null);
  const [aiOptimizing, setAiOptimizing] = useState(false);
  const [aiSequence, setAiSequence] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [guidedMode, setGuidedMode] = useState(false);
  const [guidedStepIndex, setGuidedStepIndex] = useState(0);
  const [guidedSteps, setGuidedSteps] = useState([]);
  const guidedLastAdvance = useRef(-1);
  const [aiRideShare, setAiRideShare] = useState([]);
  const [showOdometerPrompt, setShowOdometerPrompt] = useState(null);
  const [odometerValue, setOdometerValue] = useState('');
  const [lastOdometer, setLastOdometer] = useState(0);
  const [showArrivalConfirm, setShowArrivalConfirm] = useState(null);
  const [arrivalOdometer, setArrivalOdometer] = useState('');
  const [signatureConfirmed, setSignatureConfirmed] = useState(false);
  const [showSignatureConfirm, setShowSignatureConfirm] = useState(null);
  const [routeStopOdometerPrompt, setRouteStopOdometerPrompt] = useState(null);
  const [routeStopOdometerValue, setRouteStopOdometerValue] = useState('');
  const [routeStopSignaturePrompt, setRouteStopSignaturePrompt] = useState(null);
  const [routeStopSignatureConfirmed, setRouteStopSignatureConfirmed] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(null);
  const [completeOdometer, setCompleteOdometer] = useState('');
  const [completeError, setCompleteError] = useState('');
  const [departedTime, setDepartedTime] = useState('');
  const [arrivalDropoffTime, setArrivalDropoffTime] = useState('');
  const [showTripDetails, setShowTripDetails] = useState(null);
  const [historyExpandedId, setHistoryExpandedId] = useState(null);
  const [showToast, setShowToast] = useState(null);
  useEffect(() => {
    if (!showToast || showToast.action || showToast.type === 'error') return;
    const t = setTimeout(() => setShowToast(null), 1000);
    return () => clearTimeout(t);
  }, [showToast]);
  const [expandedTripId, setExpandedTripIdRaw] = useState(() => {
    try { const v = localStorage.getItem('expandedTripId'); return v && v !== 'null' ? v : null; } catch { return null; }
  });
  const setExpandedTripId = useCallback((val) => {
    setExpandedTripIdRaw(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      try { if (next) localStorage.setItem('expandedTripId', next); else localStorage.removeItem('expandedTripId'); } catch {}
      return next;
    });
  }, []);
  const [selectedLegsForAction, setSelectedLegsForAction] = useState(new Set());
  const [isGpsTracking, setIsGpsTracking] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [sequencerTripFilter, setSequencerTripFilter] = useState(null);
  const [routePlanSequencerStops, setRoutePlanSequencerStops] = useState(null);
  const [routePlanSequencerSequence, setRoutePlanSequencerSequence] = useState(null);
  const [routePlanSequencerOrigin, setRoutePlanSequencerOrigin] = useState(null);
  const [sequencerKey, setSequencerKey] = useState(0);
  const [driverPosition, setDriverPosition] = useState(null);
  const [analytics, setAnalytics] = useState({ tripsCompleted: 0, totalDistance: 0, timeSaved: 0, totalDriveTime: 0, efficiency: 0 });
  const [legsDetailPatient, setLegsDetailPatient] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [etas, setEtas] = useState({});
  const [backgroundLocation, setBackgroundLocation] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const [touchStart, setTouchStart] = useState(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [undoableAction, setUndoableAction] = useState(null);
  const undoTimeoutRef = useRef(null);
  const [passwordPrompt, setPasswordPrompt] = useState(null);
  const [passwordValue, setPasswordValue] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordVerifying, setPasswordVerifying] = useState(false);
  const [transferPrompt, setTransferPrompt] = useState(null);
  const [transferTargetDriverId, setTransferTargetDriverId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [showContactSelector, setShowContactSelector] = useState(null);
  const [restorePrompt, setRestorePrompt] = useState(null);
  const [cancelPrompt, setCancelPrompt] = useState(null);
  const [odometerInput, setOdometerInput] = useState('');
  const [editingOdometer, setEditingOdometer] = useState(false);
  const [showLegsModal, setShowLegsModal] = useState(null);
  const [editTripModal, setEditTripModal] = useState(null);
  const [skipConfirmTripId, setSkipConfirmTripId] = useState(null);
  const [routeTemplates, setRouteTemplates] = useState([]);
  const [assignedSequence, setAssignedSequence] = useState(null);
  const [showAssignedRouteDetails, setShowAssignedRouteDetails] = useState(false);
  const displayLoginId = useMemo(
    () => String(me?.email || currentUser || '').replace(/@auth\.agapecare\.local$/i, ''),
    [me?.email, currentUser]
  );
  const tripsScrollRef = useRef(null);
  const workflowSyncRef = useRef({});

  const advanceWorkflow = useCallback((trip, status, extraFields = {}, options = {}) => {
    if (!trip?.id || !status) return;
    const workflowUpdatedAt = new Date().toISOString();
    setWorkflowProgressData((prev) => {
      const previousProgress = prev[trip.id] || {};
      const currentTrip = applyWorkflowProgress(trip, previousProgress);
      const incomingTrip = { ...currentTrip, status, ...extraFields };
      const currentIndex = getWorkflowStepIndex(currentTrip);
      const incomingIndex = getWorkflowStepIndex(incomingTrip);

      if (!options.allowRegression && incomingIndex < currentIndex) {
        return prev;
      }

      const nextProgress = {
        ...previousProgress,
        tripId: trip.id,
        status,
        ...extraFields,
        workflowRegression: !!options.allowRegression,
        workflowUpdatedAt,
      };

      if (options.allowRegression) {
        Object.entries(WORKFLOW_FIELD_MIN_STEP).forEach(([field, minStep]) => {
          if (minStep > incomingIndex) delete nextProgress[field];
        });
      }

      return { ...prev, [trip.id]: nextProgress };
    });
    onUpdateTrip?.(trip.id, status, extraFields);
    saveTripWorkflowUpdate(trip.id, {
      status,
      ...extraFields,
      workflowUpdatedAt,
    }).catch((err) => {
      console.error('[DriverPage] Failed to persist workflow update:', err);
    });
  }, [onUpdateTrip, setWorkflowProgressData]);

  useEffect(() => {
    Object.entries(workflowProgress).forEach(([tripId, progress]) => {
      if (!progress?.status || progress.workflowRegression) return;
      const rawTrip = rawDriverScopedTrips.find((trip) => trip.id === tripId);
      if (!rawTrip) return;
      const mergedTrip = applyWorkflowProgress(rawTrip, progress);
      const rawIndex = getWorkflowStepIndex(rawTrip);
      const mergedIndex = getWorkflowStepIndex(mergedTrip);
      const shouldSync = mergedIndex > rawIndex || rawTrip.status !== mergedTrip.status;
      if (!shouldSync) return;
      const signature = JSON.stringify({ status: mergedTrip.status, ...getWorkflowExtraFields(progress) });
      if (workflowSyncRef.current[tripId] === signature) return;
      workflowSyncRef.current[tripId] = signature;
      onUpdateTrip?.(tripId, mergedTrip.status, getWorkflowExtraFields(progress));
      saveTripWorkflowUpdate(tripId, {
        status: mergedTrip.status,
        ...getWorkflowExtraFields(progress),
        workflowUpdatedAt: progress.workflowUpdatedAt || new Date().toISOString(),
      }).catch((err) => {
        console.error('[DriverPage] Failed to replay workflow progress:', err);
      });
    });
  }, [rawDriverScopedTrips, workflowProgress, onUpdateTrip]);

  useEffect(() => {
    if (!me?.id) return;
    const unsub = onSnapshot(doc(db, 'routeData', 'sequences'), (snap) => {
      if (snap.exists()) {
        const templates = snap.data().templates || [];
        setRouteTemplates(templates);
      } else {
        setRouteTemplates([]);
      }
    });
    return () => unsub();
  }, [me, trips]);

  // Re-compute assignedSequence whenever templates, me, or trips change
  useEffect(() => {
    setAssignedSequence(getDriverActiveRoutePlan(routeTemplates, me, driverScopedTrips));
  }, [routeTemplates, me, driverScopedTrips]);

  useEffect(() => {
    if (!assignedSequence) {
      setShowAssignedRouteDetails(false);
    }
  }, [assignedSequence?.id]);

  // Clear expandedTripId if the trip no longer exists
  useEffect(() => {
    if (expandedTripId && !trips.some(t => t.id === expandedTripId)) {
      setExpandedTripId(null);
    }
  }, [trips, expandedTripId, setExpandedTripId]);

  // Apply theme
  useEffect(() => {
    const theme = appSettings?.theme || 'light';
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.style.setProperty('--bg-primary', '#1a1a2e');
      root.style.setProperty('--text-primary', '#e2e8f0');
    } else {
      root.classList.remove('dark');
      root.style.setProperty('--bg-primary', '#F3F4F6');
      root.style.setProperty('--text-primary', '#0f172a');
    }
    localStorage.setItem('agape_theme', theme);
  }, [appSettings?.theme]);

  // Apply font scale
  useEffect(() => {
    const scale = appSettings?.fontScale || 'md';
    const root = document.documentElement;
    const sizes = { sm: '94%', md: '96%', lg: '100%' };
    root.style.fontSize = sizes[scale] || '96%';
    localStorage.setItem('agape_fontScale', scale);
  }, [appSettings?.fontScale]);

  const gpsWatchId = useRef(null);
  const meRef = useRef(me);
  const lastUpdateRef = useRef(0);
  const queueRef = useRef([]);
  const etasRef = useRef({});
  const positionRef = useRef(null);
  const addressCoordsCache = useRef({});
  const geofenceAlerted = useRef(new Set());
  meRef.current = me;
  positionRef.current = driverPosition;

  const geofenceProximityNotified = useRef(new Set());

  // Geocode addresses for active trips and cache results
  const preloadAddressCoords = useCallback(async (trip) => {
    const addressesToGeocode = [];
    if (trip.pickup && !addressCoordsCache.current[trip.pickup]) addressesToGeocode.push({ addr: trip.pickup, type: 'pickup' });
    if (trip.dropoff && !addressCoordsCache.current[trip.dropoff]) addressesToGeocode.push({ addr: trip.dropoff, type: 'dropoff' });
    for (const { addr, type } of addressesToGeocode) {
      try {
        const { geocodeAddress } = await import('../config/maps');
        const coords = await geocodeAddress(addr);
        if (coords?.lat && coords?.lng) {
          addressCoordsCache.current[addr] = { lat: coords.lat, lng: coords.lng, type };
        }
      } catch {}
    }
  }, []);

  // Preload address coords when entering navigation
  const preloadGeofence = useCallback((trip) => {
    if (!trip) return;
    preloadAddressCoords(trip);
  }, [preloadAddressCoords]);

  // Smart contact system: build contact list per trip with type detection
  const tripContacts = useMemo(() => {
    const map = {};
    driverScopedTrips.forEach(t => {
      map[t.id] = buildContactList(t, trips, phoneNumbers);
    });
    return map;
  }, [driverScopedTrips, trips, phoneNumbers]);

  const getPrimaryContactForTrip = (trip) => getPrimaryContact(trip, trips, phoneNumbers);

  const getContactsForTrip = (trip) => tripContacts[trip?.id] || [];

  // Count legs per patient (all trips = A legs + B legs)
  const patientLegs = useMemo(() => {
    const counts = {};
    driverScopedTrips.forEach(t => {
      const key = (t.patient || '').trim().toLowerCase();
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [driverScopedTrips]);

  // Count ACTIVE legs per patient (for no-show/cancel decision)
  const patientActiveLegs = useMemo(() => {
    const counts = {};
    driverScopedTrips.forEach(t => {
      if (isWorkflowTerminalTrip(t)) return;
      const key = (t.patient || '').trim().toLowerCase();
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [driverScopedTrips]);

  const updateAssignedRouteRecord = useCallback(async (updates, auditTitle, auditMessage) => {
    if (!assignedSequence?.id || routeTemplates.length === 0) return;
    const nextTemplates = routeTemplates.map((template) => (
      template.id === assignedSequence.id ? { ...template, ...updates } : template
    ));
    setAssignedSequence((prev) => (prev?.id === assignedSequence.id ? { ...prev, ...updates } : prev));
    await setDoc(doc(db, 'routeData', 'sequences'), { templates: nextTemplates }, { merge: true });
    if (auditTitle && auditMessage && onAddAuditLog) {
      onAddAuditLog(auditTitle, auditMessage, 'indigo');
    }
  }, [assignedSequence?.id, routeTemplates, currentUser, onAddAuditLog]);

  const startAssignedRoute = useCallback(async () => {
    if (!assignedSequence) return;
    const orderedTripIds = [...new Set((assignedSequence.sequence || []).map((step) => step.clientId))];
    const steps = (assignedSequence.sequence || []).map((step) => ({ tripId: step.clientId, type: step.type }));
    setAiSequence(orderedTripIds);
    setGuidedSteps(steps);
    setGuidedStepIndex(0);
    guidedLastAdvance.current = -1;
    setGuidedMode(true);
    setShowAssignedRouteDetails(true);
    await updateAssignedRouteRecord({
      assignmentStatus: ROUTE_ASSIGNMENT_STATUS.IN_PROGRESS,
      driverAcknowledgedAt: assignedSequence.driverAcknowledgedAt || new Date().toISOString(),
      startedAt: new Date().toISOString(),
    }, 'Route Started', `${currentUser} started route "${assignedSequence.name || 'Assigned Route'}".`);
  }, [assignedSequence, currentUser, updateAssignedRouteRecord]);

  const getUrgency = (trip) => {
    if (!trip || !trip.time || isWorkflowTerminalTrip(trip)) return 0;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    if (trip.date !== today) return 0;
    const tripMin = timeToMinutes(trip.time);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const diff = tripMin - nowMin;
    if (diff < 0) return 2;
    if (diff <= 30) return 1;
    return 0;
  };

  const notifiedTripsRef = useRef(new Set());

  // Notify urgent trips (once per trip)
  useEffect(() => {
    const urgent = orderedTrips.filter(t => getUrgency(t) > 0 && !notifiedTripsRef.current.has(t.id));
    urgent.forEach(t => {
      notifiedTripsRef.current.add(t.id);
      const level = getUrgency(t) === 2 ? 'Overdue' : 'Due Soon';
      playNotificationSound();
      showLocalNotification(`🚨 ${level}: ${t.patient}`, `${t.time} — ${t.pickup} → ${t.dropoff}`);
    });
  }, [trips]);

  const setUndoable = (trip, previousStatus, newStatus) => {
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setUndoableAction({ trip, previousStatus, newStatus });
    undoTimeoutRef.current = setTimeout(() => setUndoableAction(null), 10000);
  };

  const handleUndo = () => {
    if (!undoableAction) return;
    if (!window.confirm(`Are you sure you want to restore ${undoableAction.trip.patient} to "${undoableAction.previousStatus}"?`)) return;
    advanceWorkflow(undoableAction.trip, undoableAction.previousStatus, {}, { allowRegression: true });
    setUndoableAction(null);
    if (undoTimeoutRef.current) { clearTimeout(undoTimeoutRef.current); undoTimeoutRef.current = null; }
  };

  const revertTripStatus = (trip) => {
    const s = (trip.status || '').toUpperCase();
    if (s === 'IN TRANSIT' || s === 'NAVIGATING DROPOFF' || s === 'AT DROPOFF' || s === 'ARRIVED') {
      advanceWorkflow(trip, 'At Pickup', {}, { allowRegression: true });
    } else if (s === 'AT PICKUP') {
      advanceWorkflow(trip, 'In Progress', {}, { allowRegression: true });
    } else if (s === 'EN ROUTE' || s === 'NAVIGATING PICKUP' || s === 'IN PROGRESS') {
      advanceWorkflow(trip, 'Assigned', {}, { allowRegression: true });
    }
  };

  const restoreHistoryTrip = (trip) => {
    const patientKey = (trip.patient || '').trim().toLowerCase();
    const relatedLegs = driverScopedTrips.filter(t => (t.patient || '').trim().toLowerCase() === patientKey && isWorkflowTerminalTrip(t));
    if (relatedLegs.length > 1) {
      setRestorePrompt({ trip, legs: relatedLegs });
    } else {
      setPasswordPrompt({ type: 'restore', trip });
    }
  };

  // Online/offline detection — debounced to prevent rapid flickering on mobile
  useEffect(() => {
    let onlineTimer = null;
    let offlineTimer = null;
    const goOnline = () => {
      clearTimeout(offlineTimer);
      onlineTimer = setTimeout(() => { setIsOnline(true); syncOfflineQueue(); }, 1500);
    };
    const goOffline = () => {
      clearTimeout(onlineTimer);
      offlineTimer = setTimeout(() => setIsOnline(false), 1500);
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      clearTimeout(onlineTimer);
      clearTimeout(offlineTimer);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);


  const addToQueue = useCallback((action, data) => {
    queueRef.current = [...queueRef.current, { action, data, timestamp: Date.now() }];
    setOfflineQueue(queueRef.current);
    if (navigator.onLine) syncOfflineQueue();
  }, []);

  const syncOfflineQueue = useCallback(async () => {
    if (queueRef.current.length === 0 || !navigator.onLine) return;
    const queue = [...queueRef.current];
    queueRef.current = [];
    setOfflineQueue([]);
    for (const item of queue) {
      if (item.action === 'updateLocation' && meRef.current?.id) {
        try { onUpdateDriverLocation && onUpdateDriverLocation(meRef.current.id, item.data.lat, item.data.lng, item.data.telemetry || {}); } catch {}
      } else if (item.action === 'completeTrip' && meRef.current?.id) {
        try { onCompleteTrip && onCompleteTrip(item.data.tripId, meRef.current.id, item.data.odometer); } catch {}
      }
    }
  }, []);

  // Load last odometer from completed trips
  useEffect(() => {
    if (!me?.id) return;
    const completed = driverScopedTrips
      .filter(t => isWorkflowTerminalTrip(t) && t.dropoffOdometer)
      .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
    if (completed.length > 0) setLastOdometer(completed[0].dropoffOdometer);
  }, [driverScopedTrips, me?.id]);

  // GPS is mandatory — always active on mount. Also auto-clock-in on mount.
  useEffect(() => {
    if (navigator.geolocation) startGpsTracking();
    if (me?.id && !me?.clockedIn) {
      onDriverStatusUpdate(me.id, true);
    }
    return () => { if (gpsWatchId.current) navigator.geolocation.clearWatch(gpsWatchId.current); };
  }, [me?.id]);

  // Clean up undo timeout on unmount
  useEffect(() => {
    return () => { if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current); };
  }, []);

  // Analytics calculation
  useEffect(() => {
    if (me?.clockedIn) {
      const completed = driverScopedTrips.filter(t => normalizeWorkflowStatus(t.status) === 'completed');
      const allMine = driverScopedTrips;
      const totalDist = allMine.reduce((sum, t) => sum + (t.distance || 0), 0);
      const totalTime = completed.reduce((sum, t) => {
        if (t.startTime && t.completedAt) {
          return sum + (new Date(t.completedAt) - new Date(t.startTime)) / 60000;
        }
        return sum;
      }, 0);
      setAnalytics({
        tripsCompleted: completed.length,
        totalDistance: totalDist,
        timeSaved: completed.length * 5,
        totalDriveTime: totalTime,
        efficiency: completed.length > 0 ? Math.round((completed.length / (totalTime || 1)) * 60) : 0,
      });
    }
  }, [driverScopedTrips, me?.clockedIn]);

  const getTodayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

  const myTrips = driverScopedTrips
    .filter(t => tripMatchesTodayOrTomorrow(t.date))
    .sort((a, b) => {
      const today = getTodayStr();
      const aToday = a.date === today ? 0 : 1;
      const bToday = b.date === today ? 0 : 1;
      if (aToday !== bToday) return aToday - bToday;
      return timeToMinutes(a.time) - timeToMinutes(b.time);
    });

  const reroutedTrips = driverScopedTrips.filter(t => normalizeWorkflowStatus(t.status) === 'rerouted');
  const completedTrips = driverScopedTrips.filter(t => normalizeWorkflowStatus(t.status) === 'completed');
  const noShowTrips = driverScopedTrips.filter(t => normalizeWorkflowStatus(t.status) === 'no show');
  const cancelledTrips = driverScopedTrips.filter(t => normalizeWorkflowStatus(t.status) === 'cancelled');
  const allHistory = [...reroutedTrips, ...completedTrips, ...noShowTrips, ...cancelledTrips].sort((a,b) => { const da = a.completedAt || a.date || ''; const db = b.completedAt || b.date || ''; return db.localeCompare(da); });

  const activeTrips = myTrips.filter(t => !isWorkflowTerminalTrip(t));

  const orderedTrips = [...activeTrips].sort((a, b) => {
    // 1. If guided mode is active, the absolute top priority is the current step's trip
    if (guidedMode && guidedSteps && guidedSteps[guidedStepIndex]) {
      if (a.id === guidedSteps[guidedStepIndex].tripId && b.id !== guidedSteps[guidedStepIndex].tripId) return -1;
      if (b.id === guidedSteps[guidedStepIndex].tripId && a.id !== guidedSteps[guidedStepIndex].tripId) return 1;
    }

    // 2. Trips that are currently in progress should be pushed to the top
    const inProgressStatuses = [
      'In Mission',
      'En Route',
      'In Progress',
      'Navigating Pickup',
      'At Pickup',
      'In Transit',
      'Navigating Dropoff',
      'At Dropoff',
      'Arrived',
      'Arrived PU',
      'Arrived DO',
    ];
    const aInProgress = inProgressStatuses.includes(a.status);
    const bInProgress = inProgressStatuses.includes(b.status);
    if (aInProgress && !bInProgress) return -1;
    if (bInProgress && !aInProgress) return 1;

    // 3. Fall back to AI sequence if it exists
    if (aiSequence && aiSequence.length > 0) {
      const aiA = aiSequence.indexOf(a.id);
      const aiB = aiSequence.indexOf(b.id);
      if (aiA !== -1 || aiB !== -1) {
        if (aiA === -1) return 1;
        if (aiB === -1) return -1;
        return aiA - aiB;
      }
    }

    // 4. Will Call / no-time trips always go to the bottom
    const aWC = isWillCall(a);
    const bWC = isWillCall(b);
    if (aWC !== bWC) return aWC ? 1 : -1;

    // 5. Otherwise fall back to urgency and then time.
    const urgencyDiff = getUrgency(b) - getUrgency(a);
    if (urgencyDiff !== 0) return urgencyDiff;
    return timeToMinutes(a.time) - timeToMinutes(b.time);
  }).reduce((acc, trip) => {
    // Smart pairing: B leg (no time, IN/OUT) → match to its A leg by sequential booking ID + reversed addresses
    if (!isWillCall(trip) && isInOutTrip(trip) && !trip.time) {
      const patientKey = (trip.patient || '').trim().toLowerCase();
      const tripPickup = (trip.pickup || '').trim().toLowerCase();
      const tripBookingNum = parseInt(trip.bookingId, 10);
      let bestIdx = -1;
      let bestScore = 0;
      for (let i = acc.length - 1; i >= 0; i--) {
        const t = acc[i];
        if ((t.patient || '').trim().toLowerCase() !== patientKey) continue;
        if (!t.time || isInOutTrip(t)) continue;
        let score = 0;
        // Signal 1: Sequential booking ID (strongest) — B leg ID must be exactly A leg ID + 1
        const tBookingNum = parseInt(t.bookingId, 10);
        if (!isNaN(tripBookingNum) && !isNaN(tBookingNum) && (tripBookingNum - tBookingNum) === 1) {
          score += 10;
        }
        // Signal 2: Reversed addresses (confirms pair)
        if ((t.dropoff || '').trim().toLowerCase() === tripPickup) {
          score += 5;
        }
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0 && bestScore >= 5) {
        acc.splice(bestIdx + 1, 0, trip);
        return acc;
      }
    }
    acc.push(trip);
    return acc;
  }, []);

  const timedTrips = orderedTrips.filter(t => !isWillCall(t));
  const willCallTrips = orderedTrips.filter(t => isWillCall(t));
  const transferTargetDrivers = useMemo(() => (
    (allDrivers || drivers || [])
      .filter((driver) => driver?.id && driver.id !== me?.id)
      .filter((driver) => String(driver.status || '').toLowerCase() !== 'inactive')
  ), [allDrivers, drivers, me?.id]);
  const incomingTransferTrips = useMemo(() => (
    driverScopedTrips.filter((trip) => (
      trip.transferRequest?.status === 'pending'
      && (
        trip.transferRequest?.toDriverId === me?.id
        || normalizeEmail(trip.transferRequest?.toDriverEmail) === normalizeEmail(me?.email || currentUser)
      )
    ))
  ), [driverScopedTrips, me?.id, me?.email, currentUser]);
  const assignedRoutePlanStops = useMemo(() => {
    if (!assignedSequence?.sequence?.length) return [];
    const realTripIds = new Set((driverScopedTrips || []).map((trip) => trip.id));
    return (assignedSequence.sequence || [])
      .map((stop, index) => ({ ...stop, sequenceIndex: index + 1 }))
      .filter((stop) => (
        stop?.source === 'route-plan'
        || (stop?.address && stop?.clientId && !realTripIds.has(stop.clientId))
      ));
  }, [assignedSequence, driverScopedTrips]);
  const getRoutePlanStopPhone = useCallback((stop) => {
    if (!stop) return '';
    const directPhone = stop.phone || stop.patientPhone || stop.pickupPhone || stop.dropoffPhone;
    if (directPhone) return directPhone;
    const stopType = String(stop.type || '').toUpperCase() === 'DO' ? 'DO' : 'PU';
    const bookingId = String(stop.bookingId || '').trim().toLowerCase();
    const address = String(stop.address || '').trim().toLowerCase();
    const name = String(stop.name || '').trim().toLowerCase();
    const matchedTrip = (driverScopedTrips || []).find((trip) => {
      const tripBooking = String(trip.bookingId || trip.tripNumber || trip.id || '').trim().toLowerCase();
      const tripName = String(trip.patient || trip.patientName || '').trim().toLowerCase();
      const pickup = String(trip.pickup || '').trim().toLowerCase();
      const dropoff = String(trip.dropoff || '').trim().toLowerCase();
      return (bookingId && tripBooking === bookingId)
        || (name && tripName === name && ((stopType === 'PU' && pickup === address) || (stopType === 'DO' && dropoff === address)))
        || (address && (pickup === address || dropoff === address));
    });
    if (!matchedTrip) return '';
    return stopType === 'DO'
      ? (matchedTrip.dropoffPhone || matchedTrip.patientPhone || matchedTrip.patientMobile || matchedTrip.pickupPhone || '')
      : (matchedTrip.pickupPhone || matchedTrip.patientPhone || matchedTrip.patientMobile || matchedTrip.dropoffPhone || '');
  }, [driverScopedTrips]);
  const getRoutePlanStopKey = useCallback((stop) => (
    `${stop?.clientId || stop?.id || 'stop'}:${String(stop?.type || 'PU').toUpperCase()}:${stop?.stepNumber || stop?.sequenceIndex || 0}`
  ), []);
  const routePlanWorkflow = assignedSequence?.driverWorkflow || {};
  const getRoutePlanStopWorkflow = useCallback((stop) => (
    routePlanWorkflow[getRoutePlanStopKey(stop)] || {}
  ), [getRoutePlanStopKey, routePlanWorkflow]);
  const isRoutePlanStopCompleted = useCallback((stop) => {
    const workflow = getRoutePlanStopWorkflow(stop);
    return ['Completed', 'No Show', 'Cancelled', 'Rerouted'].includes(workflow.status) || !!workflow.completedAt;
  }, [getRoutePlanStopWorkflow]);
  const currentRoutePlanStopIndex = assignedRoutePlanStops.findIndex((stop) => !isRoutePlanStopCompleted(stop));
  const currentRoutePlanStop = currentRoutePlanStopIndex >= 0 ? assignedRoutePlanStops[currentRoutePlanStopIndex] : null;
  const hasGuidedRenderableTrips = guidedMode
    && Array.isArray(guidedSteps)
    && guidedSteps.some((step) => driverScopedTrips.some((trip) => trip.id === step.tripId));
  const hasRoutePlanGuidedStops = guidedMode && assignedRoutePlanStops.length > 0 && !hasGuidedRenderableTrips;
  const incomingTransferRoutes = useMemo(() => (
    (routeTemplates || [])
      .filter((route) => route.transferRequest?.status === 'pending')
      .filter((route) => (
        route.transferRequest?.toDriverId === me?.id
        || normalizeEmail(route.transferRequest?.toDriverEmail) === normalizeEmail(me?.email || currentUser)
      ))
  ), [routeTemplates, me?.id, me?.email, currentUser]);

  const isClockedIn = true;

  // Auto-re-optimize when trips or GPS changes
  useEffect(() => {
    if (selectedTrips.length >= 2 && driverPosition) {
      const timer = setTimeout(() => {
        runAiOptimization(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [trips, driverPosition?.lat, driverPosition?.lng]);

  // Detect ride-sharing opportunities — deduplicated, max 3
  useEffect(() => {
    if (activeTrips.length < 2) { setAiRideShare([]); return; }
    const seen = new Set();
    const nearby = [];
    for (let i = 0; i < activeTrips.length && nearby.length < 3; i++) {
      for (let j = i + 1; j < activeTrips.length && nearby.length < 3; j++) {
        const a = activeTrips[i];
        const b = activeTrips[j];
        if (a.patient === b.patient) continue;
        const key = [a.patient, b.patient].sort().join('|');
        if (seen.has(key)) continue;
        const sameArea = a.pickup?.toLowerCase().includes(b.pickup?.toLowerCase().slice(0, 10)) ||
                         b.pickup?.toLowerCase().includes(a.pickup?.toLowerCase().slice(0, 10)) ||
                         a.dropoff?.toLowerCase().includes(b.dropoff?.toLowerCase().slice(0, 10));
        if (sameArea) {
          seen.add(key);
          nearby.push({ tripA: a, tripB: b });
        }
      }
    }
    setAiRideShare(nearby);
  }, [activeTrips]);

  // Detect time conflicts — deduplicated summary, max 5
  useEffect(() => {
    const flagged = new Set();
    const detected = [];
    for (let i = 0; i < activeTrips.length; i++) {
      for (let j = i + 1; j < activeTrips.length; j++) {
        const a = activeTrips[i];
        const b = activeTrips[j];
        if (!a.time || !b.time || a.time === 'Will Call' || b.time === 'Will Call') continue;
        const tA = timeToMinutes(a.time);
        const tB = timeToMinutes(b.time);
        if (tA === 1440 || tB === 1440) continue;
        if (Math.abs(tA - tB) < 30) {
          const key = [a.patient, b.patient].sort().join('|');
          if (!flagged.has(key)) {
            flagged.add(key);
            detected.push({ aName: a.patient, bName: b.patient, timeA: a.time, timeB: b.time });
            if (detected.length >= 5) break;
          }
        }
      }
      if (detected.length >= 5) break;
    }
    setConflicts(detected);
  }, [activeTrips]);

  // Calculate ETAs using Google Maps Distance Matrix
  const calculateEta = useCallback(async (trip) => {
    if (!driverPosition || !trip?.pickup) return;
    try {
      const origin = `${driverPosition.lat},${driverPosition.lng}`;
      const dest = trip.pickup;
      const distMiles = await getDistanceMiles(
        { lat: driverPosition.lat, lng: driverPosition.lng },
        trip.pickupLat ? { lat: trip.pickupLat, lng: trip.pickupLng } : dest
      );
      if (distMiles !== null) {
        const avgSpeed = 30;
        const etaMinutes = (distMiles / avgSpeed) * 60;
        etasRef.current[trip.id] = etaMinutes;
        setEtas(prev => ({ ...prev, [trip.id]: etaMinutes }));
      }
    } catch {}
  }, [driverPosition]);

  // Batch update ETAs (limit to first 3 trips, 30s interval to avoid rate limits)
  useEffect(() => {
    if (!driverPosition || activeTrips.length === 0) return;
    const timer = setInterval(() => {
      activeTrips.slice(0, 3).forEach(t => calculateEta(t));
    }, 30000);
    activeTrips.slice(0, 3).forEach(t => calculateEta(t));
    return () => clearInterval(timer);
  }, [driverPosition, activeTrips.length]);

  // Geofence proximity detection — check every 15s if near pickup/dropoff
  useEffect(() => {
    if (!driverPosition || activeTrips.length === 0) return;
    const timer = setInterval(() => {
      const pos = driverPosition;
      if (!pos?.lat || !pos?.lng) return;
      activeTrips.forEach(trip => {
        const tripKey = trip.id;
        const alreadyNotified = geofenceAlerted.current.has(tripKey);
        const pickupCoords = trip.pickup ? addressCoordsCache.current[trip.pickup] : null;
        const dropoffCoords = trip.dropoff ? addressCoordsCache.current[trip.dropoff] : null;

        if (pickupCoords && !alreadyNotified && (trip.status === 'Navigating Pickup' || trip.status === 'In Progress')) {
          const dist = Math.sqrt(Math.pow(pos.lat - pickupCoords.lat, 2) + Math.pow(pos.lng - pickupCoords.lng, 2)) * 69;
          if (dist <= 0.1 && !geofenceProximityNotified.current.has(`${tripKey}_pu`)) {
            geofenceProximityNotified.current.add(`${tripKey}_pu`);
            setTimeout(() => geofenceProximityNotified.current.delete(`${tripKey}_pu`), 30000);
            setShowToast({ message: `Near pickup: ${trip.patient}. Tap to arrive.`, action: 'arrive-pickup', trip });
            setTimeout(() => setShowToast(null), 8000);
          }
        }

        if (dropoffCoords && !alreadyNotified && (trip.status === 'Navigating Dropoff' || trip.status === 'In Transit')) {
          const dist = Math.sqrt(Math.pow(pos.lat - dropoffCoords.lat, 2) + Math.pow(pos.lng - dropoffCoords.lng, 2)) * 69;
          if (dist <= 0.1 && !geofenceProximityNotified.current.has(`${tripKey}_do`)) {
            geofenceProximityNotified.current.add(`${tripKey}_do`);
            setTimeout(() => geofenceProximityNotified.current.delete(`${tripKey}_do`), 30000);
            setShowToast({ message: `Near dropoff: ${trip.patient}. Tap to arrive.`, action: 'arrive-dropoff', trip });
            setTimeout(() => setShowToast(null), 8000);
          }
        }
      });
    }, 15000);
    return () => clearInterval(timer);
  }, [driverPosition, activeTrips]);

  const startGpsTracking = () => {
    if (!navigator.geolocation || gpsWatchId.current) return;
    let lastUpdate = 0;
    let lastLat = 0;
    let lastLng = 0;
    const stationaryHeartbeatMs = 60000;
    // Request background location permission
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        if (result.state === 'granted') setBackgroundLocation(true);
      });
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const now = Date.now();
        if (now - lastUpdate < 8000) return;
        const dist = Math.sqrt(Math.pow(latitude - lastLat, 2) + Math.pow(longitude - lastLng, 2)) * 111320;
        if (dist < 15 && lastUpdate > 0 && now - lastUpdate < stationaryHeartbeatMs) return;
        lastUpdate = now;
        lastLat = latitude;
        lastLng = longitude;
        setDriverPosition({ lat: latitude, lng: longitude, accuracy });
        const driverId = meRef.current?.id;
        const nextTelemetry = {
          accuracy,
          speedMph: typeof pos.coords.speed === 'number' ? Math.round(pos.coords.speed * 2.23694) : null,
          heading: pos.coords.heading || null,
          actorRole: role || 'driver',
          source: 'driver-pwa',
          recordedAt: new Date(pos.timestamp || now).toISOString(),
        };
        if (driverId && navigator.onLine) {
          try {
            onUpdateDriverLocation && onUpdateDriverLocation(driverId, latitude, longitude, nextTelemetry);
          } catch {}
        } else if (driverId) {
          addToQueue('updateLocation', { lat: latitude, lng: longitude, telemetry: nextTelemetry });
        }
        setIsGpsTracking(true);
      },
      (err) => {
        console.warn('GPS error:', err.message);
        if (err.code === 1) {
          setBackgroundLocation(false);
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 8000 }
    );
    gpsWatchId.current = id;
  };

  const handleStatusToggle = () => {
    const newStatus = !me?.clockedIn;
    const driverId = me?.id || (() => {
      const normalizedEmail = String(currentUser || '').trim().toLowerCase();
      const seed = normalizedEmail.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || 'USER';
      return `DRV-${seed}`;
    })();
    onDriverStatusUpdate(driverId, newStatus);
  };

  const filteredHistory = allHistory.filter(t => {
    const matchFilter = historyFilter === 'all' ? true :
      historyFilter === 'completed' ? normalizeWorkflowStatus(t.status) === 'completed' :
      historyFilter === 'noshow' ? normalizeWorkflowStatus(t.status) === 'no show' :
      historyFilter === 'cancelled' ? normalizeWorkflowStatus(t.status) === 'cancelled' :
      normalizeWorkflowStatus(t.status) === 'rerouted';
    if (!matchFilter) return false;
    if (historyDate) {
      const tripDate = (t.completedAt || t.date || '').slice(0, 10);
      if (tripDate && tripDate !== historyDate) return false;
    }
    if (!historySearch) return true;
    const q = historySearch.toLowerCase();
    return (t.patient || '').toLowerCase().includes(q) ||
      (t.bookingId || '').toLowerCase().includes(q) ||
      (t.pickup || '').toLowerCase().includes(q) ||
      (t.dropoff || '').toLowerCase().includes(q);
  });

  const toggleTripSelect = (tripId) => {
    setSelectedTrips(prev =>
      prev.includes(tripId) ? prev.filter(id => id !== tripId) : [...prev, tripId]
    );
  }

  const runAiOptimization = async (silent = false) => {
    if (selectedTrips.length < 2 && !silent) {
      if (selectedTrips.length === 1) {
        setAiOptimizing(true);
        setAiSuggestions([`Analyzing selected trip...`, `Select 2+ trips for route optimization.`]);
        setAiOptimizing(false);
      }
      return;
    }
    const tripsToOptimize = selectedTrips.length >= 2
      ? activeTrips.filter(t => selectedTrips.includes(t.id))
      : activeTrips;
    if (tripsToOptimize.length < 2) return;
    if (!silent) setAiOptimizing(true);
    try {
      const loc = driverPosition ? `${driverPosition.lat},${driverPosition.lng}` : me?.currentZone || '';
      const result = await aiOptimizeRoute(tripsToOptimize, loc);
      if (result && Array.isArray(result)) {
        setAiSequence(result);
        if (!silent) {
          const orderedNames = result.map(id => tripsToOptimize.find(t => t.id === id)?.patient || id).join(' → ');
          setAiSuggestions([`AI-optimized sequence: ${orderedNames}`, `Estimated time savings based on proximity and schedule.`]);
        }
      }
    } catch {}
    if (!silent) setAiOptimizing(false);
  };

  const selectAllTrips = () => {
    const allIds = activeTrips.map(t => t.id);
    setSelectedTrips(prev => prev.length === allIds.length ? [] : allIds);
  };

  // Auto-advance guided mode when current trip reaches terminal status
  useEffect(() => {
    if (!guidedMode || !guidedSteps || guidedSteps.length === 0 || guidedStepIndex >= guidedSteps.length) return;
    const currentStep = guidedSteps[guidedStepIndex];
    const trip = driverScopedTrips.find(t => t.id === currentStep.tripId);
    if (!trip) return;

    let stepCompleted = false;
    if (currentStep.type === 'PU') {
      if (getWorkflowStepIndex(trip) >= 3 || isWorkflowTerminalTrip(trip)) {
        stepCompleted = true;
      }
    } else {
      if (isWorkflowTerminalTrip(trip)) {
        stepCompleted = true;
      }
    }

    if (stepCompleted) {
      if (guidedLastAdvance.current === guidedStepIndex) return;
      guidedLastAdvance.current = guidedStepIndex;
      const nextIndex = guidedStepIndex + 1;
      if (nextIndex >= guidedSteps.length) {
        if (assignedSequence?.id) {
          void updateAssignedRouteRecord({
            assignmentStatus: ROUTE_ASSIGNMENT_STATUS.COMPLETED,
            completedAt: new Date().toISOString(),
          }, 'Route Completed', `${currentUser} completed route "${assignedSequence.name || 'Assigned Route'}".`);
        }
        setGuidedMode(false);
        setGuidedSteps([]);
        setAiSequence(null);
        setAiSuggestions([]);
        setSelectedTrips([]);
        setGuidedStepIndex(0);
        guidedLastAdvance.current = -1;
      } else {
        const nextStep = guidedSteps[nextIndex];
        setGuidedStepIndex(nextIndex);
      }
    }
  }, [driverScopedTrips, guidedMode, guidedStepIndex, guidedSteps, assignedSequence?.id, assignedSequence?.name, currentUser, updateAssignedRouteRecord]);


  const suggestNavApp = (address) => {
    return navApp;
  };

  const openInNavApp = async (address, app) => {
    const origin = driverPosition ? `${driverPosition.lat},${driverPosition.lng}` : '';
    const preferredApp = app || navApp;
    if (isNativeShell()) {
      await showNavActionSheet(address, origin, preferredApp);
    } else {
      await openNavigation(address, preferredApp, origin);
    }
  };

  const buildRoutePlanWorkflow = useCallback((stop, updates = {}) => {
    const key = getRoutePlanStopKey(stop);
    const nowIso = new Date().toISOString();
    const existingWorkflow = assignedSequence?.driverWorkflow || {};
    return {
      key,
      workflow: {
        ...existingWorkflow,
        [key]: {
          ...(existingWorkflow[key] || {}),
          routeId: assignedSequence?.id || '',
          stopKey: key,
          stopName: stop?.name || `Stop ${stop?.sequenceIndex || ''}`.trim(),
          stopType: String(stop?.type || 'PU').toUpperCase() === 'DO' ? 'DO' : 'PU',
          address: stop?.address || '',
          bookingId: stop?.bookingId || '',
          phone: stop?.phone || stop?.patientPhone || stop?.pickupPhone || stop?.dropoffPhone || '',
          sequenceIndex: stop?.sequenceIndex || 0,
          ...updates,
          updatedAt: nowIso,
        },
      },
    };
  }, [assignedSequence?.driverWorkflow, assignedSequence?.id, getRoutePlanStopKey]);

  const saveRoutePlanStopWorkflow = useCallback(async (stop, updates = {}, auditTitle = null, auditMessage = null) => {
    if (!stop || !assignedSequence?.id) return null;
    const { workflow } = buildRoutePlanWorkflow(stop, updates);
    await updateAssignedRouteRecord({
      driverWorkflow: workflow,
      assignmentStatus: ROUTE_ASSIGNMENT_STATUS.IN_PROGRESS,
    }, auditTitle, auditMessage);
    return workflow;
  }, [assignedSequence?.id, buildRoutePlanWorkflow, updateAssignedRouteRecord]);

  const handleStartRoutePlanStop = useCallback((stop) => {
    if (!stop) return;
    impact('heavy');
    void saveRoutePlanStopWorkflow(stop, {
      status: 'Started',
      startedAt: new Date().toISOString(),
    }, 'Route Stop Started', `${currentUser} started stop ${stop.sequenceIndex}: ${stop.name || stop.address || 'Route stop'}.`);
  }, [currentUser, saveRoutePlanStopWorkflow]);

  const handleNavigateRoutePlanStop = useCallback((stop) => {
    if (!stop?.address) return;
    impact('heavy');
    void saveRoutePlanStopWorkflow(stop, {
      status: 'Navigating',
      navigatingAt: new Date().toISOString(),
    }, 'Route Stop Navigation', `${currentUser} started navigation to stop ${stop.sequenceIndex}.`);
    openInNavApp(stop.address, suggestNavApp(stop.address));
  }, [currentUser, openInNavApp, saveRoutePlanStopWorkflow, suggestNavApp]);

  const handleArriveRoutePlanStop = useCallback((stop) => {
    if (!stop) return;
    impact('heavy');
    setRouteStopOdometerValue(lastOdometer > 0 ? String(lastOdometer) : '');
    setRouteStopOdometerPrompt(stop);
  }, [lastOdometer]);

  const submitRouteStopOdometer = useCallback(() => {
    if (!routeStopOdometerPrompt || !routeStopOdometerValue) return;
    const odo = parseInt(routeStopOdometerValue, 10);
    if (Number.isNaN(odo) || odo <= 0) return;
    if (lastOdometer > 0 && odo < lastOdometer && !window.confirm(`Warning: ${odo.toLocaleString()} mi is less than the last recorded reading of ${lastOdometer.toLocaleString()} mi. Continue anyway?`)) return;
    const nowIso = new Date().toISOString();
    void saveRoutePlanStopWorkflow(routeStopOdometerPrompt, {
      status: 'Arrived',
      odometer: odo,
      arrivedAt: nowIso,
      arrivalTime: nowIso,
    }, 'Route Stop Arrived', `${currentUser} arrived at stop ${routeStopOdometerPrompt.sequenceIndex}.`);
    setLastOdometer(odo);
    setRouteStopOdometerPrompt(null);
    setRouteStopOdometerValue('');
  }, [currentUser, lastOdometer, routeStopOdometerPrompt, routeStopOdometerValue, saveRoutePlanStopWorkflow]);

  const handleRoutePlanStopSignature = useCallback((stop) => {
    if (!stop) return;
    impact('medium');
    setRouteStopSignatureConfirmed(false);
    setRouteStopSignaturePrompt(stop);
  }, []);

  const confirmRoutePlanStopSignature = useCallback(() => {
    if (!routeStopSignaturePrompt || !routeStopSignatureConfirmed) return;
    void saveRoutePlanStopWorkflow(routeStopSignaturePrompt, {
      status: 'Signed',
      paperSignatureConfirmed: true,
      signatureConfirmedAt: new Date().toISOString(),
    }, 'Route Stop Signed', `${currentUser} confirmed signature for stop ${routeStopSignaturePrompt.sequenceIndex}.`);
    setRouteStopSignaturePrompt(null);
    setRouteStopSignatureConfirmed(false);
  }, [currentUser, routeStopSignatureConfirmed, routeStopSignaturePrompt, saveRoutePlanStopWorkflow]);

  const completeRoutePlanStop = useCallback((stop) => {
    if (!stop || !assignedSequence?.id) return;
    const currentWorkflow = getRoutePlanStopWorkflow(stop);
    if (!currentWorkflow.arrivedAt) {
      handleArriveRoutePlanStop(stop);
      return;
    }
    if (!currentWorkflow.paperSignatureConfirmed) {
      handleRoutePlanStopSignature(stop);
      return;
    }
    impact('heavy');
    const completedAt = new Date().toISOString();
    const { workflow } = buildRoutePlanWorkflow(stop, {
      status: 'Completed',
      completedAt,
      completedBy: currentUser,
      completedVehicle: me?.vehicle || '',
    });
    const allStopsCompleted = assignedRoutePlanStops.every((candidate) => {
      const key = getRoutePlanStopKey(candidate);
      return key === getRoutePlanStopKey(stop) || workflow[key]?.completedAt || workflow[key]?.status === 'Completed';
    });
    void updateAssignedRouteRecord({
      driverWorkflow: workflow,
      assignmentStatus: allStopsCompleted ? ROUTE_ASSIGNMENT_STATUS.COMPLETED : ROUTE_ASSIGNMENT_STATUS.IN_PROGRESS,
      ...(allStopsCompleted ? { completedAt } : {}),
    }, allStopsCompleted ? 'Route Completed' : 'Route Stop Completed', allStopsCompleted
      ? `${currentUser} completed route "${assignedSequence.name || 'Assigned Route'}".`
      : `${currentUser} completed stop ${stop.sequenceIndex}: ${stop.name || stop.address || 'Route stop'}.`);
    if (allStopsCompleted) {
      setGuidedMode(false);
      setGuidedSteps([]);
      setGuidedStepIndex(0);
      guidedLastAdvance.current = -1;
    }
  }, [assignedRoutePlanStops, assignedSequence?.id, assignedSequence?.name, buildRoutePlanWorkflow, currentUser, getRoutePlanStopKey, getRoutePlanStopWorkflow, handleArriveRoutePlanStop, handleRoutePlanStopSignature, me?.vehicle, updateAssignedRouteRecord]);

  const markRoutePlanStopException = useCallback((stop, status, reason = '') => {
    if (!stop || !assignedSequence?.id) return;
    impact('heavy');
    const completedAt = new Date().toISOString();
    const { workflow } = buildRoutePlanWorkflow(stop, {
      status,
      exceptionStatus: status,
      exceptionReason: reason || undefined,
      cancellationReason: reason || undefined,
      exceptionAt: completedAt,
      completedAt,
      completedBy: currentUser,
      completedVehicle: me?.vehicle || '',
    });
    const allStopsTerminal = assignedRoutePlanStops.every((candidate) => {
      const key = getRoutePlanStopKey(candidate);
      const candidateWorkflow = workflow[key] || {};
      return ['Completed', 'No Show', 'Cancelled', 'Rerouted'].includes(candidateWorkflow.status) || !!candidateWorkflow.completedAt;
    });
    void updateAssignedRouteRecord({
      driverWorkflow: workflow,
      assignmentStatus: allStopsTerminal ? ROUTE_ASSIGNMENT_STATUS.COMPLETED : ROUTE_ASSIGNMENT_STATUS.IN_PROGRESS,
      ...(allStopsTerminal ? { completedAt } : {}),
    }, `Route Stop ${status}`, `${currentUser} marked stop ${stop.sequenceIndex}: ${stop.name || stop.address || 'Route stop'} as ${status}${reason ? ` (${reason})` : ''}.`);
    if (allStopsTerminal) {
      setGuidedMode(false);
      setGuidedSteps([]);
      setGuidedStepIndex(0);
      guidedLastAdvance.current = -1;
    }
  }, [assignedRoutePlanStops, assignedSequence?.id, buildRoutePlanWorkflow, currentUser, getRoutePlanStopKey, me?.vehicle, updateAssignedRouteRecord]);

  const undoRoutePlanStopProgress = useCallback((stop) => {
    if (!stop || !assignedSequence?.id) return;
    const key = getRoutePlanStopKey(stop);
    const existingWorkflow = assignedSequence?.driverWorkflow || {};
    const current = existingWorkflow[key] || {};
    if (!Object.keys(current).length) return;
    const nextStopWorkflow = { ...current };
    if (nextStopWorkflow.completedAt || nextStopWorkflow.status === 'Completed') {
      delete nextStopWorkflow.completedAt;
      delete nextStopWorkflow.completedBy;
      delete nextStopWorkflow.completedVehicle;
      nextStopWorkflow.status = nextStopWorkflow.paperSignatureConfirmed ? 'Signed' : nextStopWorkflow.arrivedAt ? 'Arrived' : nextStopWorkflow.navigatingAt ? 'Navigating' : 'Started';
    } else if (nextStopWorkflow.paperSignatureConfirmed || nextStopWorkflow.signatureConfirmedAt) {
      delete nextStopWorkflow.paperSignatureConfirmed;
      delete nextStopWorkflow.signatureConfirmedAt;
      nextStopWorkflow.status = nextStopWorkflow.arrivedAt ? 'Arrived' : nextStopWorkflow.navigatingAt ? 'Navigating' : 'Started';
    } else if (nextStopWorkflow.arrivedAt || nextStopWorkflow.odometer) {
      delete nextStopWorkflow.arrivedAt;
      delete nextStopWorkflow.arrivalTime;
      delete nextStopWorkflow.odometer;
      nextStopWorkflow.status = nextStopWorkflow.navigatingAt ? 'Navigating' : 'Started';
    } else if (nextStopWorkflow.navigatingAt) {
      delete nextStopWorkflow.navigatingAt;
      nextStopWorkflow.status = 'Started';
    } else if (nextStopWorkflow.startedAt || nextStopWorkflow.status === 'Started') {
      delete nextStopWorkflow.startedAt;
      delete nextStopWorkflow.status;
    }
    nextStopWorkflow.updatedAt = new Date().toISOString();
    const nextWorkflow = {
      ...existingWorkflow,
      [key]: nextStopWorkflow,
    };
    void updateAssignedRouteRecord({
      driverWorkflow: nextWorkflow,
      assignmentStatus: ROUTE_ASSIGNMENT_STATUS.IN_PROGRESS,
      completedAt: null,
    }, 'Route Stop Undo', `${currentUser} stepped back stop ${stop.sequenceIndex}: ${stop.name || stop.address || 'Route stop'}.`);
  }, [assignedSequence?.driverWorkflow, assignedSequence?.id, currentUser, getRoutePlanStopKey, updateAssignedRouteRecord]);

  const handleNavigateToPickup = (trip) => {
    impact('heavy');
    advanceWorkflow(trip, 'Navigating Pickup', {});
    preloadGeofence(trip);
    openInNavApp(trip.pickup, navApp);
  };

  const handleNavigateToDropoff = (trip) => {
    impact('heavy');
    preloadGeofence(trip);
    advanceWorkflow(trip, 'Navigating Dropoff', {});
    openInNavApp(trip.dropoff, navApp);
  };

  const handleStartTrip = (trip) => {
    openInNavApp(trip.pickup, suggestNavApp(trip.pickup));
  };

  const handleCall = async (phone, name) => {
    if (isNativeShell()) {
      await showCallActionSheet(phone, name);
    } else {
      await makeCall(phone, name);
    }
  };

  const handleSmartCall = (trip) => {
    const primary = getPrimaryContactForTrip(trip);
    if (!primary) return;
    handleCall(primary.phone, `${primary.label}: ${primary.name}`);
  };

  const handleSmartSMS = (trip) => {
    const primary = getPrimaryContactForTrip(trip);
    if (!primary) return;
    sendSMS(primary.phone, primary.name);
  };

  const openContactSelector = (trip) => {
    setShowContactSelector(trip);
  };

  const handleSMS = async (phone, name) => {
    await sendSMS(phone, name);
  }

  const openTransferPrompt = (type, item) => {
    setTransferPrompt({ type, item });
    setTransferTargetDriverId('');
    setTransferReason('');
  };

  const submitTransferRequest = async () => {
    if (!transferPrompt || !transferTargetDriverId) return;
    const targetDriver = transferTargetDrivers.find((driver) => driver.id === transferTargetDriverId);
    if (!targetDriver) return;
    const nowIso = new Date().toISOString();
    const request = {
      id: `transfer-${Date.now()}`,
      status: 'pending',
      type: transferPrompt.type,
      fromDriverId: me?.id || '',
      fromDriverEmail: me?.email || currentUser || '',
      fromDriverName: me?.name || currentUser || 'Driver',
      toDriverId: targetDriver.id,
      toDriverEmail: targetDriver.email || '',
      toDriverName: targetDriver.name || targetDriver.email || 'Driver',
      reason: transferReason || 'Emergency transfer request',
      requestedAt: nowIso,
      requestedBy: currentUser || '',
    };
    if (transferPrompt.type === 'trip') {
      const trip = transferPrompt.item;
      onUpdateTrip?.(trip.id, trip.status, {
        transferRequest: request,
        transferStatus: 'pending',
      });
      onAddAuditLog?.('Trip Transfer Requested', `${request.fromDriverName} requested transfer of ${trip.patient || trip.id} to ${request.toDriverName}.`, 'amber');
    } else if (transferPrompt.type === 'route' && assignedSequence?.id) {
      await updateAssignedRouteRecord({
        transferRequest: request,
        transferStatus: 'pending',
      }, 'Route Transfer Requested', `${request.fromDriverName} requested transfer of route "${assignedSequence.name || 'Assigned Route'}" to ${request.toDriverName}.`);
    }
    setTransferPrompt(null);
    setTransferTargetDriverId('');
    setTransferReason('');
    setShowToast({ type: 'success', message: `Transfer request sent to ${request.toDriverName}.` });
  };

  const applyTripTransferDecision = (trip, accepted) => {
    const req = trip?.transferRequest;
    if (!trip?.id || !req) return;
    const nowIso = new Date().toISOString();
    if (accepted) {
      onUpdateTrip?.(trip.id, 'Assigned', {
        driverId: me?.id || req.toDriverId || '',
        driverEmail: me?.email || req.toDriverEmail || '',
        driverName: me?.name || req.toDriverName || '',
        transferStatus: 'accepted',
        transferRequest: { ...req, status: 'accepted', decidedAt: nowIso, decidedBy: currentUser || '' },
      });
      onAddAuditLog?.('Trip Transfer Accepted', `${me?.name || currentUser} accepted transfer of ${trip.patient || trip.id}.`, 'emerald');
    } else {
      onUpdateTrip?.(trip.id, trip.status, {
        transferStatus: 'declined',
        transferRequest: { ...req, status: 'declined', decidedAt: nowIso, decidedBy: currentUser || '' },
      });
      onAddAuditLog?.('Trip Transfer Declined', `${me?.name || currentUser} declined transfer of ${trip.patient || trip.id}.`, 'rose');
    }
  };

  const applyRouteTransferDecision = async (route, accepted) => {
    const req = route?.transferRequest;
    if (!route?.id || !req) return;
    const nowIso = new Date().toISOString();
    const nextTemplates = routeTemplates.map((template) => {
      if (template.id !== route.id) return template;
      if (!accepted) {
        return {
          ...template,
          transferStatus: 'declined',
          transferRequest: { ...req, status: 'declined', decidedAt: nowIso, decidedBy: currentUser || '' },
        };
      }
      return {
        ...template,
        assignedDriver: me?.id || req.toDriverId || template.assignedDriver,
        transferStatus: 'accepted',
        transferRequest: { ...req, status: 'accepted', decidedAt: nowIso, decidedBy: currentUser || '' },
        assignedAt: nowIso,
        assignedBy: req.fromDriverEmail || req.fromDriverName || currentUser || '',
        assignedByRole: 'driver-transfer',
        assignmentStatus: ROUTE_ASSIGNMENT_STATUS.ASSIGNED,
        driverAcknowledgedAt: null,
      };
    });
    await setDoc(doc(db, 'routeData', 'sequences'), { templates: nextTemplates }, { merge: true });
    if (accepted && Array.isArray(route.validTripIds)) {
      route.validTripIds.forEach((tripId) => {
        const trip = trips.find((item) => item.id === tripId);
        if (trip) {
          onUpdateTrip?.(trip.id, 'Assigned', {
            driverId: me?.id || req.toDriverId || '',
            driverEmail: me?.email || req.toDriverEmail || '',
            driverName: me?.name || req.toDriverName || '',
          });
        }
      });
    }
    onAddAuditLog?.(accepted ? 'Route Transfer Accepted' : 'Route Transfer Declined', `${me?.name || currentUser} ${accepted ? 'accepted' : 'declined'} transfer of route "${route.name || 'Assigned Route'}".`, accepted ? 'emerald' : 'rose');
  };

  const handleArrivePickup = (trip) => {
    const autoOdo = lastOdometer > 0 ? String(lastOdometer) : '';
    setOdometerValue(autoOdo);
    setShowOdometerPrompt(trip);
  };

  const submitOdometer = () => {
    if (!showOdometerPrompt || !odometerValue) return;
    const odo = parseInt(odometerValue, 10);
    if (isNaN(odo)) return;
    if (lastOdometer > 0 && odo < lastOdometer && !window.confirm(`Warning: ${odo.toLocaleString()} mi is less than the last recorded reading of ${lastOdometer.toLocaleString()} mi. Continue anyway?`)) return;
    // Record pickup arrival + departure timestamps using canonical fields
    const nowIso = new Date().toISOString();
    advanceWorkflow(showOdometerPrompt, 'At Pickup', {
      pickupOdometer: odo,
      arrivalTime: nowIso,
      startTime: nowIso,
    });
    setLastOdometer(odo);
    setShowOdometerPrompt(null);
    setOdometerValue('');
  };

  const handleArriveDropoff = (trip) => {
    setUndoable(trip, trip.status, 'At Dropoff');
    // Record dropoff arrival in the dedicated field (was incorrectly overwriting pickup arrival)
    advanceWorkflow(trip, 'At Dropoff', {
      arrivalDropoffTime: new Date().toISOString(),
    });
  };

  const handleSkipNav = (trip) => {
    impact('medium');
    if (trip.status === 'In Progress') {
      handleArrivePickup(trip);
    } else if (trip.status === 'In Transit') {
      handleArriveDropoff(trip);
    }
  };

  const confirmArrival = () => {
    if (!showArrivalConfirm) return;
    const odo = parseInt(arrivalOdometer, 10) || lastOdometer;
    if (lastOdometer > 0 && odo < lastOdometer && !window.confirm(`Warning: ${odo.toLocaleString()} mi is less than the last recorded reading of ${lastOdometer.toLocaleString()} mi. Continue anyway?`)) return;
    setUndoable(showArrivalConfirm, showArrivalConfirm.status, 'At Pickup');
    const nowIso = new Date().toISOString();
    advanceWorkflow(showArrivalConfirm, 'At Pickup', {
      pickupOdometer: odo,
      arrivalTime: nowIso,
      startTime: nowIso,
    });
    setLastOdometer(odo);
    setShowArrivalConfirm(null);
    setArrivalOdometer('');
  };

  const confirmSignatureAndBegin = () => {
    if (!showSignatureConfirm || !signatureConfirmed) return;
    setUndoable(showSignatureConfirm, showSignatureConfirm.status, 'In Transit');
    advanceWorkflow(showSignatureConfirm, 'In Transit', {
      departedPickupTime: new Date().toISOString(),
      paperSignatureConfirmed: true,
    });
    setShowSignatureConfirm(null);
    setSignatureConfirmed(false);
  };

  const handleNoShow = (trip) => {
    const patientKey = (trip.patient || '').trim().toLowerCase();
    const activeLegs = driverScopedTrips.filter(t =>
      (t.patient || '').trim().toLowerCase() === patientKey &&
      !isWorkflowTerminalTrip(t)
    );
    if (activeLegs.length > 1) {
      setCancelPrompt({ type: 'noshow', trip, legs: activeLegs });
    } else {
      setPasswordPrompt({ type: 'noshow', trip, selectedLegIds: [trip.id] });
    }
  };

  const handleCancel = (trip) => {
    const patientKey = (trip.patient || '').trim().toLowerCase();
    const activeLegs = driverScopedTrips.filter(t =>
      (t.patient || '').trim().toLowerCase() === patientKey &&
      !isWorkflowTerminalTrip(t)
    );
    if (activeLegs.length > 1) {
      setCancelPrompt({ type: 'cancel', trip, legs: activeLegs });
    } else {
      setPasswordPrompt({ type: 'cancel', trip, selectedLegIds: [trip.id] });
    }
  };

  const handleReroute = (trip) => {
    const patientKey = (trip.patient || '').trim().toLowerCase();
    const activeLegs = driverScopedTrips.filter(t =>
      (t.patient || '').trim().toLowerCase() === patientKey &&
      !isWorkflowTerminalTrip(t)
    );
    if (activeLegs.length > 1) {
      setCancelPrompt({ type: 'reroute', trip, legs: activeLegs });
    } else {
      setPasswordPrompt({ type: 'reroute', trip, selectedLegIds: [trip.id] });
    }
  };

  const handleShowLegs = (task) => {
    const patientKey = (task.patient || task.patientName || '').trim().toLowerCase();
    const allLegs = driverScopedTrips
      .filter(t => (t.patient || '').trim().toLowerCase() === patientKey)
      .map(t => ({
        id: t.id,
        bookingId: t.bookingId,
        time: to12hr(t.time),
        patient: t.patient,
        status: t.status,
        pickup: t.pickup,
        dropoff: t.dropoff,
        pickupSite: t.pickupSite,
        dropoffSite: t.dropoffSite,
        distance: t.distance,
        wheelchair: t.wheelchair || t.mobility,
        pickupPhone: t.pickupPhone,
        dropoffPhone: t.dropoffPhone,
      }));
    setShowLegsModal(allLegs);
  };

  const handleEditTrip = (task) => {
    const original = trips.find(t => t.id === task.id);
    setEditTripModal(original || task);
  };

  const handleSaveEditedTrip = (editedTrip) => {
    setEditTripModal(null);
    const { _pickupTime, _pickupOdometer: _puOdo, _departPickupTime, _dropoffArrivalTime, _dropoffOdometer: _doOdo, _clientSigned, _markCompleted, ...cleanData } = editedTrip;
    if (_markCompleted) {
      cleanData.completedAt = new Date().toISOString();
      setPasswordPrompt({ type: 'edittripcomplete', trip: editedTrip, editedData: cleanData });
    } else {
      setPasswordPrompt({ type: 'edittrip', trip: editedTrip, editedData: cleanData });
    }
  };

  const verifyPasswordAndProceed = async () => {
    if (!passwordPrompt || !passwordValue) return;
    if (!auth.currentUser) { setPasswordError('Not authenticated. Please sign in again.'); return; }
    setPasswordVerifying(true);
    setPasswordError('');
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, passwordValue);
      await reauthenticateWithCredential(auth.currentUser, credential);
      const { type, trip, selectedLegIds, reason, assignedSequence: dismissSequence, editedData } = passwordPrompt;
      if (type === 'route_stop_exception') {
        markRoutePlanStopException(passwordPrompt.stop, passwordPrompt.status, reason);
      } else if (type === 'accept_transfer_trip') {
        applyTripTransferDecision(trip, true);
      } else if (type === 'decline_transfer_trip') {
        applyTripTransferDecision(trip, false);
      } else if (type === 'accept_transfer_route') {
        await applyRouteTransferDecision(passwordPrompt.route, true);
      } else if (type === 'decline_transfer_route') {
        await applyRouteTransferDecision(passwordPrompt.route, false);
      } else if (type === 'dismiss_route' && dismissSequence) {
        await updateAssignedRouteRecord({
          assignmentStatus: ROUTE_ASSIGNMENT_STATUS.DISMISSED,
          dismissedAt: new Date().toISOString(),
        }, 'Route Dismissed', `${currentUser} dismissed route "${dismissSequence.name || 'Assigned Route'}".`);
      } else if (type === 'edittrip') {
        if (editedData) {
          advanceWorkflow(trip, trip.status, editedData);
          if (onAddAuditLog) {
            onAddAuditLog('Trip Updated', `${currentUser} updated trip details for ${trip.patient}.`, 'blue');
          }
        }
      } else if (type === 'edittripcomplete') {
        if (editedData) {
          const odo = parseInt(editedData.dropoffOdometer, 10) || 0;
          advanceWorkflow(trip, 'Completed', { ...editedData, completedVehicle: me?.vehicle || '' });
          if (onAddAuditLog) {
            onAddAuditLog('Trip Completed via Edit', `${currentUser} completed trip for ${trip.patient} (odo: ${odo.toLocaleString()} mi).`, 'emerald');
          }
          setLastOdometer(odo);
          setAnalytics(prev => ({ ...prev, tripsCompleted: prev.tripsCompleted + 1 }));
          if (navigator.onLine) { saveOdometerReading(trip.id, odo).catch(() => {}); }
          else { addToQueue('completeTrip', { tripId: trip.id, odometer: odo }); }
          setExpandedTripId(null);
          setSelectedTrips(prev => prev.filter(id => id !== trip.id));
        }
      } else if (type === 'restore') {
        const legsToRestore = selectedLegIds && selectedLegIds.length > 0
          ? trips.filter(t => selectedLegIds.includes(t.id))
          : [trip];
        legsToRestore.forEach(leg => {
          const prevStatus = leg.status === 'Completed' ? 'Arrived' : 'Assigned';
          advanceWorkflow(leg, prevStatus, {}, { allowRegression: true });
        });
      } else {
        const newStatus = type === 'noshow' ? 'No Show' : type === 'reroute' ? 'Rerouted' : 'Cancelled';
        const legsToUpdate = selectedLegIds && selectedLegIds.length > 0
          ? trips.filter(t => selectedLegIds.includes(t.id))
          : [trip];
        legsToUpdate.forEach(leg => {
          setUndoable(leg, leg.status, newStatus);
          advanceWorkflow(leg, newStatus, {
            completedAt: new Date().toISOString(),
            cancellationReason: reason || undefined,
            cancelledBy: me?.email || '',
            cancelledAt: new Date().toISOString(),
          });
        });
        setExpandedTripId(null);
      }
      setPasswordPrompt(null);
      setPasswordValue('');
      setPasswordError('');
      setRestorePrompt(null);
      setSelectedLegsForAction(new Set());
    } catch {
      setPasswordError('Incorrect password. Try again.');
    }
    setPasswordVerifying(false);
  };

  const openCompleteModal = (trip) => {
    setShowCompleteModal(trip);
    const odometerSeed = trip.dropoffOdometer || (lastOdometer > 0 ? lastOdometer : trip.pickupOdometer) || '';
    setCompleteOdometer(odometerSeed ? String(odometerSeed) : '');
    setCompleteError('');
    const nowLocal = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const defaultTime = `${pad(nowLocal.getHours())}:${pad(nowLocal.getMinutes())}`;
    setDepartedTime(trip.departedPickupTime ? formatTimeInput(trip.departedPickupTime) : defaultTime);
    setArrivalDropoffTime(trip.arrivalDropoffTime ? formatTimeInput(trip.arrivalDropoffTime) : defaultTime);
  };

  const submitComplete = () => {
    if (!showCompleteModal) return;
    if (!completeOdometer) {
      setCompleteError('Enter the final odometer reading before completing this trip.');
      return;
    }
    const odo = parseInt(completeOdometer, 10);
    if (isNaN(odo) || odo <= 0) {
      setCompleteError('Use a valid odometer reading greater than zero.');
      return;
    }
    if (lastOdometer > 0 && odo < lastOdometer && !window.confirm(`Warning: ${odo.toLocaleString()} mi is less than the last recorded reading of ${lastOdometer.toLocaleString()} mi. Continue anyway?`)) return;
    if (showCompleteModal.pickupOdometer && odo < Number(showCompleteModal.pickupOdometer) && !window.confirm(`Warning: final odometer is less than pickup odometer (${Number(showCompleteModal.pickupOdometer).toLocaleString()} mi). Continue anyway?`)) return;
    setUndoable(showCompleteModal, showCompleteModal.status, 'Completed');
    const now = new Date().toISOString();
    const toIso = (timeStr) => {
      if (!timeStr) return now;
      const parts = timeStr.match(/(\d{1,2}):(\d{2})/);
      if (!parts) return now;
      const d = new Date();
      d.setHours(parseInt(parts[1], 10), parseInt(parts[2], 10), 0, 0);
      return d.toISOString();
    };
    advanceWorkflow(showCompleteModal, 'Completed', {
      dropoffOdometer: odo,
      completedAt: now,
      departedPickupTime: toIso(departedTime),
      arrivalDropoffTime: showCompleteModal.arrivalDropoffTime ? showCompleteModal.arrivalDropoffTime : toIso(arrivalDropoffTime),
      completedVehicle: me?.vehicle || '',
    });
    setLastOdometer(odo);
    setAnalytics(prev => ({ ...prev, tripsCompleted: prev.tripsCompleted + 1 }));
    setShowCompleteModal(null);
    setCompleteOdometer('');
    setCompleteError('');

    // Save odometer to Firestore directly
    if (navigator.onLine) {
      saveOdometerReading(showCompleteModal.id, odo).catch(() => {});
    } else {
      addToQueue('completeTrip', { tripId: showCompleteModal.id, odometer: odo });
    }

    // Reset trip selection and expanded state after completion
    setSelectedTrips(prev => prev.filter(id => id !== showCompleteModal.id));
    setExpandedTripId(null);
  };

  // Swipe-to-complete gesture handler
  const handleTouchStart = (e, trip) => {
    setTouchStart({ x: e.touches[0].clientX, trip });
  };

  const handleTouchEnd = (e) => {
    if (!touchStart) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    if (dx < -80 && touchStart.trip.status === 'Arrived') {
      openCompleteModal(touchStart.trip);
    }
    setTouchStart(null);
  };

  const exportDailyLog = () => {
    const rows = [['Patient', 'Booking ID', 'Time', 'Pickup', 'Dropoff', 'Status', 'Pickup Odo', 'Dropoff Odo', 'Distance', 'Completed At']];
    const today = new Date().toISOString().split('T')[0];
    const todayTrips = allHistory.filter(t => (t.date || '').startsWith(today) || (t.completedAt || '').startsWith(today));
    todayTrips.forEach(t => {
      rows.push([t.patient, t.bookingId || '', t.time, t.pickup, t.dropoff, t.status, t.pickupOdometer || '', t.dropoffOdometer || '', t.distance ? `${t.distance} mi` : '', t.completedAt ? new Date(t.completedAt).toLocaleString() : '']);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const navItems = [
    { id: 'trips', label: 'Trips', icon: Home },
    { id: 'tools', label: 'Tools', icon: Zap },
    { id: 'sequencer', label: 'Sequencer', icon: Route },
    { id: 'history', label: 'History', icon: Clock },
    { id: 'chat', label: 'Chat', icon: MessageCircle },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const navApp = appSettings.navigationApp || 'google';

  if (!me) {
    return (
      <div className="flex-1 bg-[#F3F4F6] flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-20 h-20 bg-white rounded-[2rem] shadow-lg flex items-center justify-center mx-auto mb-6">
            <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
          </div>
          <h2 className="text-lg font-black text-slate-900">Loading profile...</h2>
          <p className="text-slate-500 text-xs font-semibold mt-1">Connecting to your driver account</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#F3F4F6] text-slate-900" style={{ fontSize: '96%' }}>
      {activeNav === 'trips' && expandedTripId && (
        <div
          className="fixed inset-0 bg-slate-900/10 z-40 transition-opacity duration-300"
          onClick={() => setExpandedTripId(null)}
        />
      )}
      <div
        className="sticky top-0 z-30 border-b border-slate-200/70 bg-[#F3F4F6]/95 backdrop-blur-md"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="px-3 py-3 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
            <img src="/agape.png" alt="Agape Care" className="w-8 h-8 object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-[15px] font-extrabold text-slate-900 leading-none tracking-tight">Agape Care Driver</p>
              <span title={isOnline ? 'Realtime connected' : 'Offline / not realtime'} className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'} inline-block`} />
            </div>
            <p className="mt-1 text-[11px] font-medium text-slate-500 truncate">{me?.name || currentUser}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleCall(phoneNumbers?.dispatcher || '', 'Dispatcher')}
              disabled={!phoneNumbers?.dispatcher}
              title="Call Dispatcher"
              className="h-7 px-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 text-[10px] font-bold disabled:opacity-50"
            >
              <Phone size={11} />
              <span className="inline">DISP</span>
            </button>
            <button
              type="button"
              onClick={() => handleCall(phoneNumbers?.routing || '', 'Routing')}
              disabled={!phoneNumbers?.routing}
              title="Call Routing"
              className="h-7 px-2 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1 text-[10px] font-bold disabled:opacity-50"
            >
              <Phone size={11} />
              <span className="inline">ROUT</span>
            </button>
          </div>
        </div>
      </div>

      {/* ===== TRIPS PAGE ===== */}
      {activeNav === 'trips' && (
        <div ref={tripsScrollRef} className="flex-1 overflow-y-auto pb-28 px-3 space-y-2 bg-[#F3F4F6]" style={{ overflowAnchor: 'none', scrollBehavior: 'smooth', paddingTop: 'calc(env(safe-area-inset-top) + 72px)' }}>


          {/* Offline Banner */}
          {!isOnline && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 flex items-center gap-2">
              <WifiOff size={14} className="text-amber-600 shrink-0" />
              <p className="text-xs font-semibold text-amber-800">You're offline. Changes will sync when connection returns.</p>
            </div>
          )}

          {(incomingTransferTrips.length > 0 || incomingTransferRoutes.length > 0) && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 shadow-sm space-y-2">
              <div className="flex items-center gap-2">
                <Forward size={15} className="text-amber-700" />
                <h3 className="text-xs font-black uppercase tracking-wider text-amber-900">Incoming Transfer Request</h3>
              </div>
              {incomingTransferTrips.map((trip) => (
                <div key={`incoming-${trip.id}`} className="rounded-xl bg-white border border-amber-100 p-3">
                  <p className="text-sm font-black text-slate-900">{trip.patient || 'Trip'} · {to12hr(trip.time)}</p>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">From {trip.transferRequest?.fromDriverName || 'Driver'}: {trip.transferRequest?.reason || 'Emergency transfer'}</p>
                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={() => setPasswordPrompt({ type: 'accept_transfer_trip', trip })} className="flex-1 h-9 rounded-xl bg-emerald-600 text-white text-xs font-black">Accept</button>
                    <button type="button" onClick={() => setPasswordPrompt({ type: 'decline_transfer_trip', trip })} className="flex-1 h-9 rounded-xl bg-white border border-rose-200 text-rose-700 text-xs font-black">Decline</button>
                  </div>
                </div>
              ))}
              {incomingTransferRoutes.map((route) => (
                <div key={`incoming-route-${route.id}`} className="rounded-xl bg-white border border-amber-100 p-3">
                  <p className="text-sm font-black text-slate-900">{route.name || 'Route Plan'} · {(route.sequence || []).length} stops</p>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">From {route.transferRequest?.fromDriverName || 'Driver'}: {route.transferRequest?.reason || 'Emergency transfer'}</p>
                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={() => setPasswordPrompt({ type: 'accept_transfer_route', route, trip: {} })} className="flex-1 h-9 rounded-xl bg-emerald-600 text-white text-xs font-black">Accept</button>
                    <button type="button" onClick={() => setPasswordPrompt({ type: 'decline_transfer_route', route, trip: {} })} className="flex-1 h-9 rounded-xl bg-white border border-rose-200 text-rose-700 text-xs font-black">Decline</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Dispatcher Assigned Sequence Banner */}
          {assignedSequence && !guidedMode && (
            <div className="bg-gradient-to-r from-purple-50 to-violet-100 border-2 border-purple-300 rounded-xl p-3 shadow-md animate-slide-in-top">
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shrink-0 shadow-sm">
                      <Route size={18} className="text-white" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-purple-900">Assigned Route Plan</h4>
                      <p className="text-xs font-bold text-purple-700">
                        {(assignedSequence.assignedByRole === 'dispatcher' || assignedSequence.assignedByRole === 'admin')
                          ? `Dispatcher assigned a route plan (${assignedSequence.sequence.length} stops)`
                          : `Your saved route plan (${assignedSequence.sequence.length} stops)`}
                      </p>
                      {(() => {
                        const firstStop = assignedSequence.sequence?.[0];
                        const firstTrip = firstStop ? trips.find(trip => trip.id === firstStop.clientId) : null;
                        const firstTime = firstTrip?.time || firstStop?.time;
                        if (!firstTime) return null;
                        return (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <Clock size={11} className="text-purple-500" />
                            <span className="text-xs font-black text-purple-800">{to12hr(firstTime)}</span>
                            {firstStop?.type === 'PU' && <span className="text-[10px] font-bold text-purple-500">Pickup</span>}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-200 text-purple-800 border border-purple-300 shrink-0">
                    {assignedSequence.statusLabel || 'Assigned Today'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {assignedSequence.statusKey === ROUTE_ASSIGNMENT_STATUS.ASSIGNED && (
                    <button
                      onClick={async () => {
                        await updateAssignedRouteRecord({
                          assignmentStatus: ROUTE_ASSIGNMENT_STATUS.ACCEPTED,
                          driverAcknowledgedAt: new Date().toISOString(),
                        }, 'Route Accepted', `${currentUser} accepted route "${assignedSequence.name || 'Assigned Route'}".`);
                      }}
                      className="px-3 py-2 bg-white text-purple-700 text-[10px] font-bold rounded-lg border-2 border-purple-300 shadow-sm hover:bg-purple-50 active:scale-95 transition-all"
                    >
                      Accept
                    </button>
                  )}
                  <button
                    onClick={() => { void startAssignedRoute(); }}
                    className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs font-black rounded-lg shadow-md hover:from-blue-600 hover:to-purple-700 active:scale-95 transition-all"
                  >
                    {assignedSequence.statusKey === ROUTE_ASSIGNMENT_STATUS.ACCEPTED ? 'Start Route' : 'Start Guided'}
                  </button>
                  <button
                    onClick={() => setShowAssignedRouteDetails(prev => !prev)}
                    className="px-3 py-2 bg-white text-slate-700 text-[10px] font-bold rounded-lg border border-slate-200 shadow-sm"
                  >
                    {showAssignedRouteDetails ? 'Hide Details' : 'Open Details'}
                  </button>
                  <button
                    onClick={() => openTransferPrompt('route', assignedSequence)}
                    className="px-3 py-2 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-lg border border-amber-200 shadow-sm"
                  >
                    Transfer
                  </button>
                  <button
                    onClick={() => setPasswordPrompt({ type: 'dismiss_route', assignedSequence, trip: {} })}
                    className="px-3 py-2 bg-white text-rose-700 text-[10px] font-bold rounded-lg border border-rose-200 shadow-sm"
                  >
                    Dismiss
                  </button>
                </div>

                {showAssignedRouteDetails && (
                  <div className="bg-white/80 rounded-lg p-3 max-h-48 overflow-y-auto space-y-2 border border-purple-200">
                    {assignedSequence.sequence.map((s, idx) => {
                      const t = trips.find(trip => trip.id === s.clientId);
                      const stopName = t?.patient || s.name || `Stop ${idx + 1}`;
                      const stopTime = t?.time || s.time || '';
                      const stopAddress = t ? (s.type === 'PU' ? t.pickup : t.dropoff) : s.address;
                      return (
                        <div key={idx} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-100 shadow-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">{idx + 1}</span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs font-bold text-slate-800 truncate">{stopName}</span>
                                <span className="text-[10px] font-semibold text-slate-500 shrink-0">({s.type === 'PU' ? 'Pickup' : 'Dropoff'})</span>
                              </div>
                              {stopAddress && <p className="text-[10px] font-semibold text-slate-400 truncate">{stopAddress}</p>}
                            </div>
                          </div>
                          {stopTime && <span className="text-sm font-black text-purple-700 shrink-0 ml-2">{to12hr(stopTime)}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Guided Mode Progress Header */}
          {guidedMode && guidedSteps && guidedSteps.length > 0 && guidedStepIndex < guidedSteps.length && (() => {
            const currentStep = guidedSteps[guidedStepIndex];
            const currentTrip = driverScopedTrips.find(t => t.id === currentStep.tripId);
            const nextStep = guidedStepIndex + 1 < guidedSteps.length ? guidedSteps[guidedStepIndex + 1] : null;
            const nextTrip = nextStep ? driverScopedTrips.find(t => t.id === nextStep.tripId) : null;
            const headerRouteStop = hasRoutePlanGuidedStops ? currentRoutePlanStop : null;
            const headerRouteWorkflow = headerRouteStop ? getRoutePlanStopWorkflow(headerRouteStop) : null;
            const headerStepIndex = hasRoutePlanGuidedStops ? Math.max(currentRoutePlanStopIndex, 0) : guidedStepIndex;
            const headerStepTotal = hasRoutePlanGuidedStops ? assignedRoutePlanStops.length : guidedSteps.length;
            const pct = Math.round((headerStepIndex / Math.max(headerStepTotal, 1)) * 100);
            return (
              <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-xl p-3 shadow-md shadow-indigo-200/40 sticky top-0" style={{ zIndex: 10 }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-white/20 rounded-lg flex items-center justify-center text-xs font-black text-white">{headerStepIndex + 1}</span>
                    <span className="text-xs font-bold text-white/80 uppercase tracking-wider">of {headerStepTotal}</span>
                  </div>
                  <button onClick={() => { setGuidedMode(false); }} className="text-xs text-white/60 font-bold uppercase hover:text-white/90">Exit</button>
                </div>
                <div className="h-1 bg-white/20 rounded-full overflow-hidden mb-1.5">
                  <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-white truncate flex-1 min-w-0 flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] uppercase tracking-wider">{(headerRouteStop?.type || currentStep.type) === 'PU' ? 'Pickup' : 'Dropoff'}</span>
                    <span className="truncate">{headerRouteStop?.name || currentTrip?.patient || 'Route stop'}</span>
                    <span className="text-white/60 font-medium ml-1 text-xs shrink-0">· {headerRouteWorkflow?.status || (currentTrip ? (['Assigned','Unassigned'].includes(currentTrip.status) ? 'Not started' : currentTrip.status) : 'In route')}</span>
                  </p>
                  {hasRoutePlanGuidedStops && currentRoutePlanStopIndex + 1 < assignedRoutePlanStops.length ? (
                    <span className="text-[10px] text-white/50 font-bold ml-2 shrink-0 uppercase tracking-wider">
                      Next: {assignedRoutePlanStops[currentRoutePlanStopIndex + 1]?.type || 'PU'} {assignedRoutePlanStops[currentRoutePlanStopIndex + 1]?.name || 'Stop'}
                    </span>
                  ) : nextStep && nextTrip && (
                    <span className="text-[10px] text-white/50 font-bold ml-2 shrink-0 uppercase tracking-wider">
                      Next: {nextStep.type === 'PU' ? 'PU' : 'DO'} {nextTrip.patient}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Conflict Warning */}
          {conflicts.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-rose-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-rose-800">{conflicts.length} time conflict{conflicts.length > 1 ? 's' : ''}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {conflicts.map((c, i) => (
                      <span key={i} className="text-xs text-rose-700 bg-white/60 rounded-lg px-2 py-0.5">{c.aName} · {c.bName}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Ride Share Suggestions */}
          {aiRideShare.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              <div className="flex items-start gap-2">
                <Repeat size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-emerald-800">Ride-share possible</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {aiRideShare.map((r, i) => (
                      <span key={i} className="text-xs text-emerald-700 bg-white/60 rounded-lg px-2 py-0.5">{r.tripA.patient} + {r.tripB.patient}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Manifest Header */}
          <div className="flex items-center justify-end px-1 pt-1">
            <div className="flex items-center gap-1.5">
              {onAddTrip && (
                  <button
                    onClick={() => setShowAddTripModal && setShowAddTripModal(true)}
                    className="text-[9px] text-white font-bold flex items-center gap-1 active:scale-95 bg-gradient-to-r from-blue-600 to-indigo-600 px-2 py-0.5 rounded-lg shadow-sm"
                >
                  <span className="text-xs leading-none">+</span> Add Trip
                </button>
              )}
              {selectedTrips.length > 0 && (
                <>
                <button
                  onClick={() => {
                    const stops = orderedTrips
                      .filter(t => selectedTrips.includes(t.id))
                      .flatMap(t => [
                        {
                          address: t.pickup,
                          clientName: t.patient,
                          time: t.time,
                          stopType: 'PU',
                          tripId: t.id,
                          bookingId: t.bookingId || t.tripNumber || '',
                          serviceType: t.serviceType || t.type || t.req || '',
                          phone: t.pickupPhone || t.patientPhone || t.patientMobile || '',
                          source: 'driver-trip',
                        },
                        {
                          address: t.dropoff,
                          clientName: t.patient,
                          time: t.doTime || t.dropoffTime || t.time,
                          stopType: 'DO',
                          tripId: t.id,
                          bookingId: t.bookingId || t.tripNumber || '',
                          serviceType: t.serviceType || t.type || t.req || '',
                          phone: t.dropoffPhone || t.patientPhone || t.patientMobile || '',
                          source: 'driver-trip',
                        },
                      ])
                      .filter(s => s.address);
                    if (stops.length === 0) {
                      setShowToast({ type: 'error', message: 'Select trips with pickup or dropoff addresses first.' });
                      return;
                    }
                    setRoutePlanStops(stops);
                    setActiveNav('tools');
                    setShowToast({ type: 'success', message: `${stops.length} addresses added to Route Plan.` });
                  }}
                  className="text-[9px] text-white font-bold flex items-center gap-1 active:scale-95 bg-gradient-to-r from-emerald-600 to-teal-600 px-2 py-0.5 rounded-lg shadow-sm"
                >
                  <Route size={9} /> Add to Plan
                </button>
                <button
                  onClick={() => {
                    setSequencerTripFilter(selectedTrips);
                    setActiveNav('sequencer');
                  }}
                  className="text-[9px] text-white font-bold flex items-center gap-1 active:scale-95 bg-gradient-to-r from-indigo-600 to-purple-600 px-2 py-0.5 rounded-lg shadow-sm"
                >
                  <Route size={9} /> Sequencer
                </button>
                </>
              )}
              {activeTrips.length > 0 && (
                <button onClick={exportDailyLog} className="text-[9px] text-blue-600 font-bold flex items-center gap-1 active:scale-95 px-2 py-0.5">
                  <Download size={9} /> Export
                </button>
              )}
              <span className="text-[10px] text-slate-300 font-medium ml-0.5">{activeTrips.length} trip{activeTrips.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Trip Cards */}
          {orderedTrips.length === 0 && assignedRoutePlanStops.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm p-10 text-center mt-2">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-[2rem] flex items-center justify-center mx-auto mb-5 shadow-inner">
                <CheckCircle2 size={36} className="text-emerald-400" />
              </div>
              <h3 className="text-lg font-black text-slate-900">All Clear</h3>
              <p className="text-slate-500 text-xs font-semibold mt-1.5 max-w-[200px] mx-auto leading-relaxed">No trips assigned. Your manifest is up to date.</p>
            </div>
          ) : hasRoutePlanGuidedStops ? (
            <div className="space-y-2 pb-6 relative px-2 mt-2">
              <div className="absolute left-[33px] top-6 bottom-6 w-[2px] bg-slate-200 rounded-full" />
              {assignedRoutePlanStops.map((stop, index) => {
                const stopType = String(stop.type || '').toUpperCase() === 'DO' ? 'DO' : 'PU';
                const workflow = getRoutePlanStopWorkflow(stop);
                const isCompleted = isRoutePlanStopCompleted(stop);
                const isCurrent = currentRoutePlanStop && getRoutePlanStopKey(currentRoutePlanStop) === getRoutePlanStopKey(stop);
                const isUpcoming = !isCompleted && !isCurrent;
                const address = stop.address || '';
                const stopPhone = getRoutePlanStopPhone(stop);
                const stopTripId = stop.bookingId || stop.tripNumber || stop.clientId || stop.id || '';
                const typeColor = stopType === 'DO' ? 'orange' : 'blue';

                if (isCompleted) {
                  const doneLabel = workflow.status || 'Completed';
                  const doneClass = doneLabel === 'No Show' ? 'text-orange-700'
                    : doneLabel === 'Cancelled' ? 'text-rose-700'
                    : doneLabel === 'Rerouted' ? 'text-purple-700'
                    : 'text-emerald-700';
                  return (
                    <div key={`${getRoutePlanStopKey(stop)}-done`} className="relative pl-12 pr-2">
                      <div className="absolute left-[25px] top-1/2 -translate-y-1/2 w-[18px] h-[18px] rounded-full bg-emerald-500 border-2 border-[#f4f7fb] flex items-center justify-center z-10">
                        <Check size={10} className="text-white font-black" />
                      </div>
                      <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl px-3 py-2 opacity-80 flex items-center gap-2">
                        <span className={`text-xs font-black ${doneClass}`}>{doneLabel}</span>
                        <span className="text-sm font-semibold text-slate-600 truncate">{stop.name || `Stop ${index + 1}`}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); undoRoutePlanStopProgress(stop); }}
                          className="ml-auto h-7 px-2 rounded-lg border border-amber-200 bg-white text-[10px] font-black text-amber-700 flex items-center gap-1 hover:bg-amber-50 transition-all"
                        >
                          <RotateCcw size={11} /> Undo
                        </button>
                      </div>
                    </div>
                  );
                }

                if (isUpcoming) {
                  return (
                    <div key={`${getRoutePlanStopKey(stop)}-upcoming`} className="relative pl-12 pr-2 opacity-55">
                      <div className="absolute left-[25px] top-1/2 -translate-y-1/2 w-[18px] h-[18px] rounded-full bg-slate-200 border-2 border-[#f4f7fb] flex items-center justify-center z-10">
                        <span className="text-[9px] font-black text-slate-500">{index + 1}</span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-2xl px-3 py-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-1.5 h-4 rounded-full ${stopType === 'DO' ? 'bg-orange-400' : 'bg-blue-400'}`} />
                            <span className="text-sm font-bold text-slate-800 truncate">{stop.name || `Stop ${index + 1}`}</span>
                          </div>
                          <p className="text-[11px] font-semibold text-slate-400 truncate mt-0.5">{address || 'Address pending'}</p>
                        </div>
                        <span className={`text-xs font-black ${stopType === 'DO' ? 'text-orange-600' : 'text-blue-600'}`}>{stopType}</span>
                      </div>
                    </div>
                  );
                }

                const doneKeys = [
                  !!workflow.startedAt,
                  !!workflow.navigatingAt,
                  !!workflow.arrivedAt,
                  !!workflow.paperSignatureConfirmed,
                  !!workflow.completedAt,
                ];
                const canUndoRouteStop = doneKeys.some(Boolean);
                const activeStepIndex = doneKeys.findIndex((done) => !done);
                const displayStep = activeStepIndex === -1 ? doneKeys.length : activeStepIndex + 1;
                const routePct = Math.round((index / Math.max(assignedRoutePlanStops.length, 1)) * 100);
                const nextAction = (() => {
                  if (!workflow.startedAt) return { label: 'Start Stop', icon: <Play size={14} />, className: 'bg-blue-600 hover:bg-blue-700', onClick: () => handleStartRoutePlanStop(stop) };
                  if (!workflow.navigatingAt) return { label: `Navigate to ${stopType}`, icon: <Navigation size={14} />, className: 'bg-blue-600 hover:bg-blue-700', onClick: () => handleNavigateRoutePlanStop(stop) };
                  if (!workflow.arrivedAt) return { label: `Arrive at ${stopType}`, icon: <MapPin size={14} />, className: typeColor === 'orange' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700', onClick: () => handleArriveRoutePlanStop(stop) };
                  if (!workflow.paperSignatureConfirmed) return { label: 'Confirm Signature', icon: <CheckSquare size={14} />, className: 'bg-emerald-600 hover:bg-emerald-700', onClick: () => handleRoutePlanStopSignature(stop) };
                  return { label: 'Complete Stop', icon: <Check size={14} />, className: 'bg-slate-900 hover:bg-slate-800', onClick: () => completeRoutePlanStop(stop) };
                })();

                return (
                  <div key={`${getRoutePlanStopKey(stop)}-current`} className="relative pl-12 pr-2 my-4">
                    <div className="absolute left-[20px] top-4 w-7 h-7 rounded-full bg-[#121A66] border-4 border-[#f4f7fb] flex items-center justify-center z-10 shadow-md shadow-indigo-300/50">
                      <span className="text-xs font-black text-white">{index + 1}</span>
                    </div>
                    <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-200">
                      <div className="bg-[#121A66] px-4 py-3 text-white">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="px-2 py-0.5 rounded-lg bg-white/15 text-[10px] font-black tracking-wider uppercase">{stopType === 'DO' ? 'Dropoff' : 'Pickup'}</span>
                            <span className="text-sm font-black truncate">{stop.name || `Stop ${index + 1}`}</span>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="block text-[10px] font-black text-blue-100">#{stopTripId || `STOP ${index + 1}`}</span>
                            <span className="block text-[9px] font-bold text-white/50">STOP {index + 1}/{assignedRoutePlanStops.length}</span>
                          </div>
                        </div>
                        <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                          <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${routePct}%` }} />
                        </div>
                      </div>
                      <div className="p-4">
                        <p className={`text-[10px] font-black uppercase tracking-wider mb-1 ${stopType === 'DO' ? 'text-orange-600' : 'text-blue-600'}`}>
                          {stopType === 'DO' ? 'Dropoff Address' : 'Pickup Address'}
                        </p>
                        <p className="text-base font-black leading-tight text-slate-900">{address || 'Address pending'}</p>
                        {stopPhone && (
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleCall(stopPhone, stop.name || `Stop ${index + 1}`); }}
                              className="h-10 flex-1 rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700 text-xs font-black flex items-center justify-center gap-2 hover:bg-emerald-100 transition-all"
                              title="Call client"
                            >
                              <Phone size={14} /> Call
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleSMS(stopPhone, stop.name || `Stop ${index + 1}`); }}
                              className="h-10 flex-1 rounded-xl border border-blue-100 bg-blue-50 text-blue-700 text-xs font-black flex items-center justify-center gap-2 hover:bg-blue-100 transition-all"
                              title="SMS client"
                            >
                              <MessageCircle size={14} /> SMS
                            </button>
                          </div>
                        )}

                        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                          <div className="flex items-center gap-1 mb-3">
                            {doneKeys.map((done, stepIdx) => (
                              <div key={stepIdx} className={`h-1.5 flex-1 rounded-full transition-all ${done ? 'bg-emerald-400' : stepIdx === activeStepIndex ? 'bg-blue-500' : 'bg-slate-200'}`} />
                            ))}
                          </div>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Required Step</span>
                            <span className="text-[10px] font-black text-slate-500">Step {displayStep} of 5</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-500 mb-3">
                            <div className="rounded-xl bg-white px-2 py-1.5 border border-slate-100">Started: {workflow.startedAt ? new Date(workflow.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Pending'}</div>
                            <div className="rounded-xl bg-white px-2 py-1.5 border border-slate-100">Arrived: {workflow.arrivedAt ? new Date(workflow.arrivedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Pending'}</div>
                            <div className="rounded-xl bg-white px-2 py-1.5 border border-slate-100">Odometer: {workflow.odometer ? `${Number(workflow.odometer).toLocaleString()} mi` : 'Pending'}</div>
                            <div className="rounded-xl bg-white px-2 py-1.5 border border-slate-100">Signature: {workflow.paperSignatureConfirmed ? 'Confirmed' : 'Pending'}</div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); nextAction.onClick(); }}
                            className={`w-full h-12 rounded-xl text-white text-sm font-black flex items-center justify-center gap-2 transition-all shadow-sm ${nextAction.className}`}
                          >
                            {nextAction.icon} {nextAction.label}
                          </button>
                          {address && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleNavigateRoutePlanStop(stop); }}
                              className="mt-2 w-full h-10 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-black flex items-center justify-center gap-2 hover:bg-slate-50 transition-all"
                            >
                              <Navigation size={13} /> Open Navigation
                            </button>
                          )}
                          {canUndoRouteStop && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); undoRoutePlanStopProgress(stop); }}
                              className="mt-2 w-full h-10 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-xs font-black flex items-center justify-center gap-2 hover:bg-amber-100 transition-all"
                            >
                              <RotateCcw size={13} /> Undo Last Step
                            </button>
                          )}
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setPasswordPrompt({ type: 'route_stop_exception', stop, status: 'No Show', trip: { patient: stop.name || `Stop ${stop.sequenceIndex}` } }); }}
                              className="h-10 rounded-xl border border-orange-200 bg-white text-orange-700 text-[10px] font-black flex items-center justify-center gap-1.5 hover:bg-orange-50 transition-all"
                              title="No Show"
                            >
                              <AlertCircle size={13} /> No Show
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setPasswordPrompt({ type: 'route_stop_exception', stop, status: 'Cancelled', trip: { patient: stop.name || `Stop ${stop.sequenceIndex}` } }); }}
                              className="h-10 rounded-xl border border-rose-200 bg-white text-rose-700 text-[10px] font-black flex items-center justify-center gap-1.5 hover:bg-rose-50 transition-all"
                              title="Cancel stop"
                            >
                              <XCircle size={13} /> Cancel
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setPasswordPrompt({ type: 'route_stop_exception', stop, status: 'Rerouted', trip: { patient: stop.name || `Stop ${stop.sequenceIndex}` } }); }}
                              className="h-10 rounded-xl border border-purple-200 bg-white text-purple-700 text-[10px] font-black flex items-center justify-center gap-1.5 hover:bg-purple-50 transition-all"
                              title="Rerouted"
                            >
                              <RefreshCw size={13} /> Reroute
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : hasGuidedRenderableTrips ? (
            <div className="space-y-2 pb-6 relative px-2 mt-2">
              <div className="absolute left-[33px] top-6 bottom-6 w-[2px] bg-slate-200 rounded-full" />
              {guidedSteps.map((step, index) => {
                const trip = driverScopedTrips.find(t => t.id === step.tripId);
                if (!trip) return null;

                const isCompleted = index < guidedStepIndex;
                const isUpcoming = index > guidedStepIndex;
                
                if (isCompleted) {
                  return (
                    <div key={`${step.tripId}-${step.type}-${index}`} className="relative pl-12 pr-2">
                      <div className="absolute left-[25px] top-1/2 -translate-y-1/2 w-[18px] h-[18px] rounded-full bg-emerald-500 border-2 border-[#f4f7fb] flex items-center justify-center z-10">
                        <Check size={10} className="text-white font-black" />
                      </div>
                      <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl px-3 py-2 opacity-60 flex items-center gap-2">
                         <span className="text-xs font-bold text-emerald-700">{step.type === 'PU' ? 'Picked Up' : 'Dropped Off'}</span>
                         <span className="text-sm font-semibold text-slate-600 truncate">{trip.patient}</span>
                      </div>
                    </div>
                  );
                }

                if (isUpcoming) {
                  return (
                    <div key={`${step.tripId}-${step.type}-${index}`} className="relative pl-12 pr-2 opacity-50">
                      <div className="absolute left-[25px] top-1/2 -translate-y-1/2 w-[18px] h-[18px] rounded-full bg-slate-200 border-2 border-[#f4f7fb] flex items-center justify-center z-10">
                        <span className="text-[9px] font-black text-slate-500">{index + 1}</span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-2xl px-3 py-2 flex items-center justify-between">
                         <div className="flex items-center gap-2 min-w-0">
                           <div className={`w-1.5 h-4 rounded-full ${step.type === 'PU' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                           <span className="text-sm font-bold text-slate-800 truncate">{trip.patient}</span>
                         </div>
                         <span className={`text-xs font-bold ${step.type === 'PU' ? 'text-emerald-600' : 'text-rose-600'} opacity-70`}>{to12hr(trip.time)}</span>
                      </div>
                    </div>
                  );
                }

                // isCurrent
                const workflowSteps = getWorkflowSteps(trip);
                const currentStepIdx = getCurrentWorkflowStep(trip);
                const isDropoffPhase = workflowSteps[currentStepIdx]?.phase === 'dropoff';
                const activeBarColor = isDropoffPhase ? 'bg-orange-400' : 'bg-blue-400';
                const doneBarColor = 'bg-emerald-400';

                const borderColor = isDropoffPhase ? 'border-orange-200' : 'border-blue-200';
                const bgColor = isDropoffPhase ? 'bg-orange-50' : 'bg-blue-50';
                const labelColor = isDropoffPhase ? 'text-orange-700' : 'text-blue-700';
                const totalGuidedSteps = workflowSteps.length;

                const renderPrimaryBtn = (label, icon, gradient, onClick) => (
                  <div className={`rounded-xl border ${borderColor} ${bgColor} p-3`}>
                    <div className="flex items-center gap-0.5 mb-2">
                      {workflowSteps.map((ws, idx) => (
                        <div key={ws.key} className={`h-1 flex-1 rounded-full transition-all duration-500 ${idx < currentStepIdx ? doneBarColor : idx === currentStepIdx ? activeBarColor : 'bg-slate-200'}`} />
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} className={`flex-1 h-10 ${gradient} text-xs text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm`}>
                        {icon} {label}
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); impact('medium'); handleNoShow(trip); }} className="h-10 px-3 bg-white border border-orange-200 text-orange-700 rounded-xl hover:bg-orange-50 transition-all text-[10px] font-bold shrink-0 cursor-pointer">No Show</button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); impact('medium'); handleCancel(trip); }} className="h-10 px-3 bg-white border border-rose-200 text-rose-700 rounded-xl hover:bg-rose-50 transition-all text-[10px] font-bold shrink-0 cursor-pointer">Cancel</button>
                    </div>
                  </div>
                );

                return (
                  <div key={`${step.tripId}-${step.type}-${index}`} className="relative pl-12 pr-2 my-4">
                    <div className="absolute left-[20px] top-4 w-7 h-7 rounded-full bg-indigo-500 border-4 border-[#f4f7fb] flex items-center justify-center z-10 shadow-md shadow-indigo-300/50">
                      <span className="text-xs font-black text-white">{index + 1}</span>
                    </div>
                    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200">
                       <div className={`px-3 py-2 border-b flex items-center justify-between ${step.type === 'PU' ? 'bg-emerald-50/50 border-emerald-100' : 'bg-rose-50/50 border-rose-100'}`}>
                         <div className="flex items-center gap-2">
                           <span className={`px-2 py-0.5 rounded-md text-[10px] font-black tracking-wider uppercase text-white ${step.type === 'PU' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                             {step.type === 'PU' ? 'Pickup' : 'Dropoff'}
                           </span>
                           <span className="text-sm font-black text-slate-800">{trip.patient}</span>
                         </div>
                         <span className={`text-xs font-black ${step.type === 'PU' ? 'text-emerald-600' : 'text-rose-600'}`}>{to12hr(trip.time)}</span>
                       </div>

                       <div className="px-3 py-3">
                         <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${step.type === 'PU' ? 'text-emerald-500' : 'text-rose-500'}`}>
                           {step.type === 'PU' ? 'Pickup Address' : 'Dropoff Address'}
                         </p>
                          <p className={`text-base font-bold leading-tight ${step.type === 'PU' ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {step.type === 'PU' ? trip.pickup : trip.dropoff}
                          </p>

                          {(() => {
                            const pc = getPrimaryContactForTrip(trip);
                            if (!pc) return null;
                            const ps = getContactRoleIcon(pc.role);
                            return (
                              <div className="flex items-center gap-2 mt-2 mb-1">
                                <div className={`flex items-center gap-1.5 ${ps.color} text-xs font-bold`}>
                                  <Phone size={11} /> {pc.label}
                                </div>
                                <span className="text-sm font-bold text-slate-800">{formatPhoneDisplay(pc.phone)}</span>
                                <button type="button" onClick={() => navigator.clipboard.writeText(pc.phone)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Copy number">
                                  <Copy size={11} />
                                </button>
                              </div>
                            );
                          })()}
                          
                          <div className="flex items-center gap-2 mt-3 mb-4">
                            <button type="button" onClick={(e) => { e.stopPropagation(); openInNavApp(step.type === 'PU' ? trip.pickup : trip.dropoff, suggestNavApp(step.type === 'PU' ? trip.pickup : trip.dropoff)); }} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all"><Navigation size={12}/> Navigate</button>
                           <button type="button" onClick={(e) => { e.stopPropagation(); handleSmartCall(trip); }} className="w-10 h-8 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center transition-all"><Phone size={14}/></button>
                           <button type="button" onClick={(e) => { e.stopPropagation(); handleSmartSMS(trip); }} className="w-10 h-8 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center transition-all"><MessageCircle size={14}/></button>
                         </div>

                          {(() => {
                            if (step.type === 'PU') {
                              if (trip.status === 'Assigned' || trip.status === 'Unassigned') {
                                return renderPrimaryBtn('Start Trip', <Play size={14} />, 'bg-blue-600 hover:bg-blue-700', () => { impact('heavy'); advanceWorkflow(trip, 'In Progress', { startedAt: new Date().toISOString() }); });
                              }
                              if (trip.status === 'In Progress') {
                                return renderPrimaryBtn('Navigate to Pickup', <Navigation size={14} />, 'bg-blue-600 hover:bg-blue-700', () => handleNavigateToPickup(trip));
                              }
                              if (trip.status === 'Navigating Pickup') {
                                return renderPrimaryBtn('Arrive at Pickup', <MapPin size={14} />, 'bg-blue-600 hover:bg-blue-700', () => { impact('heavy'); handleArrivePickup(trip); });
                              }
                              if (trip.status === 'At Pickup') {
                                return renderPrimaryBtn('Begin Transport', <Play size={14} />, 'bg-emerald-600 hover:bg-emerald-700', () => { impact('heavy'); setSignatureConfirmed(false); setShowSignatureConfirm(trip); });
                              }
                            } else {
                              if (trip.status === 'In Transit') {
                                return renderPrimaryBtn('Navigate to Dropoff', <Navigation size={14} />, 'bg-orange-600 hover:bg-orange-700', () => handleNavigateToDropoff(trip));
                              }
                              if (trip.status === 'Navigating Dropoff') {
                                return renderPrimaryBtn('Arrive at Dropoff', <MapPin size={14} />, 'bg-orange-600 hover:bg-orange-700', () => { impact('heavy'); handleArriveDropoff(trip); });
                              }
                              if (trip.status === 'At Dropoff' || trip.status === 'Arrived') {
                                return renderPrimaryBtn('Complete Trip', <Check size={14} />, 'bg-red-600 hover:bg-red-700', () => { impact('heavy'); openCompleteModal(trip); });
                              }
                            }
                            return <div className="text-center text-xs text-slate-400 italic bg-slate-50 rounded-xl py-2">No action required for this step.</div>;
                          })()}
                       </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1 pb-2">
              {orderedTrips.map((trip, idx) => {
                const showWcHeader = isWillCall(trip) && (idx === 0 || !isWillCall(orderedTrips[idx - 1])) && willCallTrips.length > 0;
                const isSelected = selectedTrips.includes(trip.id);
                const isSequenced = assignedSequence?.sequence?.some(s => s.clientId === trip.id);
                const legsCount = patientLegs[(trip.patient || '').trim().toLowerCase()];
                const isTerminal = isWorkflowTerminalTrip(trip);

                // Compute leg number: A legs get sequential numbers, B legs reference their paired A leg
                let legLabel = null;
                let isPairedInOut = false;
                let pairType = null; // 'a-leg' or 'b-leg'
                if (legsCount > 1) {
                  if (isInOutTrip(trip) && !trip.time) {
                    // B leg — find its paired A leg by sequential booking ID + reversed addresses
                    const patientKey = (trip.patient || '').trim().toLowerCase();
                    const tripPickup = (trip.pickup || '').trim().toLowerCase();
                    const tripBookingNum = parseInt(trip.bookingId, 10);
                    let bestLegNum = 0;
                    let bestScore = 0;
                    let seenA = 0;
                    for (let i = 0; i < idx; i++) {
                      const t = orderedTrips[i];
                      if ((t.patient || '').trim().toLowerCase() === patientKey && !isWillCall(t) && !isInOutTrip(t)) {
                        seenA++;
                        let score = 0;
                        const tBookingNum = parseInt(t.bookingId, 10);
                        if (!isNaN(tripBookingNum) && !isNaN(tBookingNum) && (tripBookingNum - tBookingNum) === 1) score += 10;
                        if ((t.dropoff || '').trim().toLowerCase() === tripPickup) score += 5;
                        if (score > bestScore) {
                          bestScore = score;
                          bestLegNum = seenA;
                        }
                      }
                    }
                    legLabel = bestLegNum > 0 ? `Return → Leg ${bestLegNum}` : 'Return Leg';
                    isPairedInOut = true;
                    pairType = 'b-leg';
                  } else if (!isWillCall(trip)) {
                    // A leg — count which leg number this is for this patient
                    const patientKey = (trip.patient || '').trim().toLowerCase();
                    let legNum = 0;
                    for (let i = 0; i <= idx; i++) {
                      const t = orderedTrips[i];
                      if ((t.patient || '').trim().toLowerCase() === patientKey && !isWillCall(t) && !isInOutTrip(t)) {
                        legNum++;
                      }
                    }
                    legLabel = `Leg ${legNum}`;
                    // Check if next trip is a paired B leg
                    const nextTrip = orderedTrips[idx + 1];
                    if (nextTrip && isInOutTrip(nextTrip) && !nextTrip.time && (nextTrip.patient || '').trim().toLowerCase() === (trip.patient || '').trim().toLowerCase()) {
                      isPairedInOut = true;
                      pairType = 'a-leg';
                    }
                  }
                }

                const workflowSteps = getWorkflowSteps(trip);
                const currentStepIdx = getCurrentWorkflowStep(trip);
                const totalSteps = workflowSteps.length;
                const isDropoffPhase = workflowSteps[currentStepIdx]?.phase === 'dropoff';
                const activeBarColor = isDropoffPhase ? 'bg-orange-500' : 'bg-blue-500';
                const doneBarColor = 'bg-emerald-400';

                const getPrimaryAction = () => {
                  if (trip.status === 'Assigned' || trip.status === 'Unassigned') return { label: 'Start Trip', icon: <Play size={14} />, gradient: 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/25', phase: 'pickup', onClick: () => { impact('heavy'); advanceWorkflow(trip, 'In Progress', { startedAt: new Date().toISOString() }); } };
                  if (trip.status === 'In Progress') return { label: 'Navigate to Pickup', icon: <Navigation size={14} />, gradient: 'bg-teal-600 hover:bg-teal-700 shadow-teal-500/25', phase: 'pickup', onClick: () => handleNavigateToPickup(trip) };
                  if (trip.status === 'Navigating Pickup') return { label: 'Arrive at Pickup', icon: <MapPin size={14} />, gradient: 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/25', phase: 'pickup', onClick: () => { impact('heavy'); handleArrivePickup(trip); } };
                  if (trip.status === 'At Pickup') return { label: 'Begin Transport', icon: <Play size={14} />, gradient: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/25', phase: 'pickup', onClick: () => { impact('heavy'); setSignatureConfirmed(false); setShowSignatureConfirm(trip); } };
                  if (trip.status === 'In Transit') return { label: 'Navigate to Dropoff', icon: <Navigation size={14} />, gradient: 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/25', phase: 'dropoff', onClick: () => handleNavigateToDropoff(trip) };
                  if (trip.status === 'Navigating Dropoff') return { label: 'Arrive at Dropoff', icon: <MapPin size={14} />, gradient: 'bg-orange-600 hover:bg-orange-700 shadow-orange-500/25', phase: 'dropoff', onClick: () => { impact('heavy'); handleArriveDropoff(trip); } };
                  if (trip.status === 'At Dropoff' || trip.status === 'Arrived') return { label: 'Complete Trip', icon: <Check size={14} />, gradient: 'bg-red-600 hover:bg-red-700 shadow-red-500/25', phase: 'dropoff', onClick: () => { impact('heavy'); openCompleteModal(trip); } };
                  return null;
                };
                const primary = getPrimaryAction();
                const workflowPhase = primary?.phase;

                return (
                  <React.Fragment key={trip.id}>
                    {showWcHeader && (
                      <div className="flex items-center gap-2 px-1 pt-4 pb-2">
                        <div className="h-px flex-1 bg-slate-200" />
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Will Call / No Time</span>
                        <div className="h-px flex-1 bg-slate-200" />
                      </div>
                    )}
                    <TaskCard
                    task={{
                      id: trip.id,
                      time: to12hr(trip.time),
                      patient: trip.patient,
                      patientName: trip.patient,
                      status: trip.status,
                      bookingId: trip.bookingId,
                      notes: trip.notes,
                      legs: legsCount > 1 ? `${legsCount} LEGS` : '1 LEG',
                      legLabel,
                      isPairedInOut,
                      pairType,
                      isWillCallTrip: isWillCall(trip),
                      isInOut: isInOutTrip(trip),
                      patientPhone: trip.patientPhone,
                      patientMobile: trip.patientMobile,
                      pickupPhone: trip.pickupPhone,
                      dropoffPhone: trip.dropoffPhone,
                      guardianPhone: trip.guardianPhone,
                      escortPhone: trip.escortPhone,
                      emergencyContact: trip.emergencyContact,
                      details: {
                        distance: trip.distance ? `${trip.distance} mi` : null,
                        passengerType: '',
                        mobility: trip.wheelchair || trip.mobility,
                      },
                      tags: [
                        trip.date !== getTodayStr() ? 'Tomorrow' : null,
                        isSequenced ? 'Route Plan' : null,
                      ].filter(Boolean),
                      pickup: { address: trip.pickup, phone: trip.pickupPhone },
                      dropoff: { address: trip.dropoff, phone: trip.dropoffPhone, time: null },
                      workflowPhase,
                    }}
                    expandedId={expandedTripId}
                    onToggle={(id) => setExpandedTripId(prev => prev === id ? null : id)}
                    isSelected={isSelected}
                    onSelect={toggleTripSelect}
                    actions={{
                      onNavigatePickup: (t) => openInNavApp(t.pickup?.address || t.pickup, suggestNavApp(t.pickup?.address || t.pickup)),
                      onNavigateDropoff: (t) => openInNavApp(t.dropoff?.address || t.dropoff, suggestNavApp(t.dropoff?.address || t.dropoff)),
                      onCall: (t) => handleSmartCall(t),
                      onSms: (t) => handleSmartSMS(t),
                      onContacts: (t) => openContactSelector(t),
                      onRevert: revertTripStatus,
                      onNoShow: handleNoShow,
                      onCancel: handleCancel,
                      onReroute: handleReroute,
                      onShowLegs: handleShowLegs,
                      onEditTrip: handleEditTrip,
                      onTransfer: () => openTransferPrompt('trip', trip),
                      renderWorkflow: !isTerminal && primary ? () => {
                        const borderColor = isDropoffPhase ? 'border-orange-200' : 'border-blue-200';
                        const bgColor = isDropoffPhase ? 'bg-orange-50' : 'bg-blue-50';
                        const labelColor = isDropoffPhase ? 'text-orange-700' : 'text-blue-700';
                        return (
                          <div className={`rounded-xl border ${borderColor} ${bgColor} p-3 w-full`}>
                            <div className="flex items-center gap-0.5 mb-2">
                              {workflowSteps.map((step, idx) => (
                                <div key={step.key} className={`h-1 flex-1 rounded-full transition-all duration-500 ${idx < currentStepIdx ? doneBarColor : idx === currentStepIdx ? activeBarColor : 'bg-slate-200'}`} />
                              ))}
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <button type="button" onClick={(e) => { e.stopPropagation(); primary.onClick(); }} className={`flex-[4] h-12 ${primary.gradient} text-sm text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm`}>
                                {primary.icon} {primary.label}
                              </button>
                              {(trip.status === 'In Progress' || trip.status === 'In Transit') && (
                                skipConfirmTripId === trip.id ? (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setSkipConfirmTripId(null); handleSkipNav(trip); }} className="flex-1 h-12 bg-emerald-500 border-2 border-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all text-xs font-bold cursor-pointer flex items-center justify-center gap-1 shadow-sm">
                                    <MapPin size={14} /> {trip.status === 'In Progress' ? 'Arrived to pick up?' : 'Arrived to drop off?'}
                                  </button>
                                ) : (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); impact('medium'); setSkipConfirmTripId(trip.id); }} className="flex-1 h-12 bg-white border-2 border-slate-300 text-slate-600 rounded-xl hover:bg-slate-100 hover:border-slate-400 transition-all text-xs font-bold cursor-pointer flex items-center justify-center gap-1">
                                    <Forward size={14} /> Skip
                                  </button>
                                )
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={(e) => { e.stopPropagation(); impact('medium'); handleNoShow(trip); }} className="flex-1 h-10 bg-white border border-orange-200 text-orange-700 rounded-xl hover:bg-orange-50 transition-all text-xs font-bold cursor-pointer flex items-center justify-center gap-1">
                                <AlertCircle size={12} /> No Show
                              </button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); impact('medium'); handleCancel(trip); }} className="flex-1 h-10 bg-white border border-rose-200 text-rose-700 rounded-xl hover:bg-rose-50 transition-all text-xs font-bold cursor-pointer flex items-center justify-center gap-1">
                                <XCircle size={12} /> Cancel
                              </button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); impact('medium'); handleReroute(trip); }} className="flex-1 h-10 bg-white border border-purple-200 text-purple-700 rounded-xl hover:bg-purple-50 transition-all text-xs font-bold cursor-pointer flex items-center justify-center gap-1">
                                <RefreshCw size={12} /> Rerouted
                              </button>
                            </div>
                          </div>
                        );
                      } : null,
                    }}
                  />
                </React.Fragment>
              );
              })}
            </div>
          )}

        </div>
      )}

      {/* ===== ODOMETER PROMPT MODAL ===== */}
      {showOdometerPrompt && (
        <div className="fixed inset-0" style={{ zIndex: 120 }} onClick={() => setShowOdometerPrompt(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]" onClick={(e) => e.stopPropagation()}>
            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[85dvh] flex flex-col animate-slide-up">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="font-bold text-base text-slate-900">Arrived at Pickup</h2>
                  <p className="text-xs text-slate-500">{showOdometerPrompt.patient} — {to12hr(showOdometerPrompt.time)}</p>
                </div>
                <button type="button" onClick={() => setShowOdometerPrompt(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 cursor-pointer shrink-0">
                  <X size={16} className="text-slate-500" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {lastOdometer > 0 && (
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                    <p className="text-xs text-slate-400 font-bold uppercase">Current Odometer</p>
                    <p className="text-lg font-bold text-slate-800">{lastOdometer?.toLocaleString()} mi</p>
                  </div>
                )}
                <div>
                  <label className="text-micro font-bold uppercase tracking-wider text-slate-500">Enter Odometer Reading (mi)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={odometerValue}
                    onChange={(e) => setOdometerValue(e.target.value)}
                    placeholder="Enter full odometer reading"
                    className="w-full mt-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xl text-center focus:border-emerald-500 outline-none"
                  />
                  {lastOdometer > 0 && odometerValue && parseInt(odometerValue, 10) < lastOdometer && (
                    <p className="text-sm text-amber-700 font-semibold mt-3 text-center bg-amber-50 rounded-xl px-4 py-3 border border-amber-200">
                      {parseInt(odometerValue, 10).toLocaleString()} mi is less than last reading of {lastOdometer.toLocaleString()} mi. You can continue if you're sure.
                    </p>
                  )}
                </div>
              </div>
              <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 flex gap-3">
                <button type="button" onClick={() => setShowOdometerPrompt(null)} className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">Cancel</button>
                <button type="button" onClick={submitOdometer} disabled={!odometerValue} className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all disabled:opacity-40 cursor-pointer">Confirm Arrival</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== ROUTE STOP ODOMETER PROMPT ===== */}
      {routeStopOdometerPrompt && (
        <div className="fixed inset-0" style={{ zIndex: 120 }} onClick={() => setRouteStopOdometerPrompt(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]" onClick={(e) => e.stopPropagation()}>
            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[85dvh] flex flex-col animate-slide-up">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="font-bold text-base text-slate-900">Arrived at Stop</h2>
                  <p className="text-xs text-slate-500">{routeStopOdometerPrompt.name || `Stop ${routeStopOdometerPrompt.sequenceIndex}`}</p>
                </div>
                <button type="button" onClick={() => setRouteStopOdometerPrompt(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 cursor-pointer shrink-0">
                  <X size={16} className="text-slate-500" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {lastOdometer > 0 && (
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                    <p className="text-xs text-slate-400 font-bold uppercase">Current Odometer</p>
                    <p className="text-lg font-bold text-slate-800">{lastOdometer?.toLocaleString()} mi</p>
                  </div>
                )}
                <div>
                  <label className="text-micro font-bold uppercase tracking-wider text-slate-500">Enter Odometer at Arrival (mi)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={routeStopOdometerValue}
                    onChange={(e) => setRouteStopOdometerValue(e.target.value)}
                    placeholder="Enter odometer reading"
                    className="w-full mt-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xl text-center focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
              <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 flex gap-3">
                <button type="button" onClick={() => setRouteStopOdometerPrompt(null)} className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">Cancel</button>
                <button type="button" onClick={submitRouteStopOdometer} disabled={!routeStopOdometerValue} className="flex-1 py-3.5 bg-[#121A66] hover:bg-[#18227d] text-white rounded-xl font-bold transition-all disabled:opacity-40 cursor-pointer">Save Arrival</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== ROUTE STOP SIGNATURE PROMPT ===== */}
      {routeStopSignaturePrompt && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 120 }} onClick={() => { setRouteStopSignaturePrompt(null); setRouteStopSignatureConfirmed(false); }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="font-bold text-base text-slate-900">Confirm Signature</h2>
                <p className="text-xs text-slate-500">{routeStopSignaturePrompt.name || `Stop ${routeStopSignaturePrompt.sequenceIndex}`}</p>
              </div>
              <button type="button" onClick={() => { setRouteStopSignaturePrompt(null); setRouteStopSignatureConfirmed(false); }} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 cursor-pointer shrink-0">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                    <Check size={18} className="text-emerald-600" />
                  </div>
                  <p className="text-sm font-medium text-emerald-800">Client signature obtained</p>
                </div>
              </div>
              <button type="button" onClick={() => setRouteStopSignatureConfirmed(!routeStopSignatureConfirmed)} className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition cursor-pointer ${routeStopSignatureConfirmed ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition ${routeStopSignatureConfirmed ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                  {routeStopSignatureConfirmed && <Check size={14} className="text-white" />}
                </div>
                <span className="text-sm font-bold text-slate-800">I confirm the client has signed</span>
              </button>
            </div>
            <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 flex gap-3">
              <button type="button" onClick={() => { setRouteStopSignaturePrompt(null); setRouteStopSignatureConfirmed(false); }} className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">Back</button>
              <button type="button" onClick={confirmRoutePlanStopSignature} disabled={!routeStopSignatureConfirmed} className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all disabled:opacity-40 cursor-pointer">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== ARRIVAL CONFIRM MODAL ===== */}
      {showArrivalConfirm && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 120 }} onClick={() => setShowArrivalConfirm(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="font-bold text-base text-slate-900">Arrived at Pickup</h2>
                <p className="text-xs text-slate-500">{showArrivalConfirm.patient}</p>
              </div>
              <button type="button" onClick={() => setShowArrivalConfirm(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 cursor-pointer shrink-0">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="text-micro font-bold uppercase tracking-wider text-slate-500">Odometer at Arrival (mi)</label>
                <input type="number" inputMode="numeric" value={arrivalOdometer} onChange={e => setArrivalOdometer(e.target.value)}
                  className="w-full mt-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xl text-center focus:border-emerald-500 outline-none"
                />
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-slate-200">
                {showArrivalConfirm.bookingId && (
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-400 font-bold uppercase">Booking</span>
                    <span className="text-sm font-bold text-slate-800">{showArrivalConfirm.bookingId}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-xs text-slate-400 font-bold uppercase">Client</span>
                  <span className="text-sm font-bold text-slate-800">{showArrivalConfirm.patient}</span>
                </div>
                {showArrivalConfirm.pickupPhone && (() => {
                  const contact = getContactsForTrip(showArrivalConfirm).find(c => cleanPhone(c.phone) === cleanPhone(showArrivalConfirm.pickupPhone));
                  const label = contact ? contact.label : 'Contact';
                  return (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400 font-bold uppercase">{label}</span>
                      <button type="button" onClick={() => handleCall(showArrivalConfirm.pickupPhone, `${label}: ${showArrivalConfirm.patient}`)} className="text-sm font-bold text-blue-600 flex items-center gap-1 hover:underline cursor-pointer">
                        <Phone size={14} /> {formatPhoneDisplay(showArrivalConfirm.pickupPhone)}
                      </button>
                    </div>
                  );
                })()}
                {showArrivalConfirm.notes && (
                  <div className="pt-3 border-t border-slate-200">
                    <p className="text-xs text-slate-400 font-bold uppercase mb-1.5">Notes</p>
                    <p className="text-sm text-slate-700">{showArrivalConfirm.notes}</p>
                  </div>
                )}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="flex items-center gap-2">
                  <Info size={16} className="text-amber-600 shrink-0" />
                  <span className="text-sm font-semibold text-amber-800">Confirm arrival details before proceeding.</span>
                </div>
              </div>
            </div>
            <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 flex gap-3">
              <button type="button" onClick={() => setShowArrivalConfirm(null)} className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">Back</button>
              <button type="button" onClick={confirmArrival} className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all cursor-pointer">Confirm Arrival</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== SIGNATURE CONFIRM MODAL (Before Heading to Dropoff) ===== */}
      {showSignatureConfirm && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 120 }} onClick={() => { setShowSignatureConfirm(null); setSignatureConfirmed(false); }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="font-bold text-base text-slate-900">Begin Transport</h2>
                <p className="text-xs text-slate-500">{showSignatureConfirm.patient}</p>
              </div>
              <button type="button" onClick={() => { setShowSignatureConfirm(null); setSignatureConfirmed(false); }} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 cursor-pointer shrink-0">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                    <Info size={18} className="text-emerald-600" />
                  </div>
                  <p className="text-sm font-semibold text-emerald-800">Obtain client signature before heading to dropoff.</p>
                </div>
              </div>
              <button type="button" onClick={() => setSignatureConfirmed(!signatureConfirmed)} className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition cursor-pointer ${signatureConfirmed ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition ${signatureConfirmed ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                  {signatureConfirmed && <Check size={14} className="text-white" />}
                </div>
                <div className="text-left">
                  <span className="text-sm font-bold text-slate-800 block">Client Signature Required</span>
                  <span className="text-xs text-slate-500">Tap to confirm signature obtained</span>
                </div>
              </button>
            </div>
            <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 flex gap-3">
              <button type="button" onClick={() => { setShowSignatureConfirm(null); setSignatureConfirmed(false); }} className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">Back</button>
              <button type="button" onClick={confirmSignatureAndBegin} disabled={!signatureConfirmed} className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all disabled:opacity-40 cursor-pointer">Confirm & Begin</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== COMPLETE TRIP MODAL ===== */}
      {showCompleteModal && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 120 }} onClick={() => { setShowCompleteModal(null); setCompleteError(''); }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="font-bold text-base text-slate-900">Complete Trip</h2>
                <p className="text-xs text-slate-500">{showCompleteModal.patient} — {showCompleteModal.bookingId || ''}</p>
              </div>
              <button type="button" onClick={() => { setShowCompleteModal(null); setCompleteError(''); }} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 cursor-pointer shrink-0">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-slate-200">
                <div className="flex justify-between">
                  <span className="text-xs text-emerald-600 font-bold uppercase">Pickup Odometer</span>
                  <span className="text-sm font-bold text-emerald-700">{showCompleteModal.pickupOdometer?.toLocaleString() || '—'} mi</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-slate-400 font-bold uppercase">Started At</span>
                  <span className="text-sm font-bold text-slate-800">{showCompleteModal.startTime ? new Date(showCompleteModal.startTime).toLocaleTimeString() : '—'}</span>
                </div>
              </div>
              <div>
                <label className="text-micro font-bold uppercase tracking-wider text-slate-500">Departed Pickup Time</label>
                <input type="time" value={departedTime} onChange={(e) => setDepartedTime(e.target.value)}
                  className="w-full mt-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base text-center focus:border-emerald-500 outline-none" />
              </div>
              <div>
                <label className="text-micro font-bold uppercase tracking-wider text-slate-500">Arrival Dropoff Time</label>
                <input type="time" value={arrivalDropoffTime} onChange={(e) => setArrivalDropoffTime(e.target.value)}
                  className="w-full mt-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base text-center focus:border-emerald-500 outline-none" />
              </div>
              <div>
                <label className="text-micro font-bold uppercase tracking-wider text-rose-600">Final Odometer (mi)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={completeOdometer}
                  onChange={(e) => { setCompleteOdometer(e.target.value); setCompleteError(''); }}
                  placeholder="Enter final odometer"
                  className="w-full mt-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xl text-center focus:border-emerald-500 outline-none"
                  autoFocus
                />
                {!completeOdometer && (
                  <p className="mt-2 text-center text-xs font-semibold text-slate-500">
                    Enter a final odometer reading to enable completion.
                  </p>
                )}
              </div>
              {completeError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                  <p className="text-center text-sm font-bold text-rose-700">{completeError}</p>
                </div>
              )}
              {showCompleteModal.pickupOdometer && completeOdometer && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
                  <p className="text-xs text-blue-600 font-bold uppercase mb-1">Total Distance</p>
                  <p className="text-lg font-black text-blue-700">{(parseInt(completeOdometer) - (showCompleteModal.pickupOdometer || 0)).toLocaleString()} mi</p>
                </div>
              )}
            </div>
            <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 flex gap-3">
              <button type="button" onClick={() => { setShowCompleteModal(null); setCompleteError(''); }} className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">Cancel</button>
              <button type="button" onClick={submitComplete} disabled={!completeOdometer || Number(completeOdometer) <= 0} className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all disabled:opacity-40 cursor-pointer">Complete Trip</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== FULL-SCREEN TRIP DETAILS ===== */}
      {showTripDetails && (() => {
        const sev = resolveStatus(showTripDetails);
        const stepIdx = (() => {
          const s = String(showTripDetails.status || '').toLowerCase();
          if (s === 'completed' || s === 'cancelled' || s === 'no show' || s === 'rerouted') return 4;
          if (s === 'at dropoff' || s === 'arrived' || showTripDetails.arrivalDropoffTime) return 3;
          if (s === 'navigating dropoff' || s === 'in transit') return 2;
          if (s === 'en route' || s === 'navigating pickup' || showTripDetails.departedPickupTime || showTripDetails.paperSignatureConfirmed) return 1;
          return 0;
        })();
        const steps = ['Scheduled', 'En Route', 'At Pickup', 'In Transit', 'Complete'];
        return (
        <div className="fixed inset-0 bg-white flex flex-col animate-slide-up" style={{ zIndex: 130 }}>
          <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center gap-3 shrink-0">
            <button type="button" onClick={() => setShowTripDetails(null)} className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center active:scale-90 cursor-pointer shrink-0">
              <ArrowLeft size={20} className="text-slate-700" />
            </button>
            <div className="flex-1 text-center">
              <h2 className="font-bold text-sm text-slate-900 leading-tight">{showTripDetails.patient}</h2>
              <p className="text-xs text-slate-400">{showTripDetails.bookingId || '—'}</p>
            </div>
            <div className="w-10 shrink-0" />
          </div>
          {/* Severity Bar */}
          {sev && <div className={`h-1 shrink-0 ${sev.bg}`} />}
          {/* Progress Stepper */}
          <div className="px-4 py-3 bg-white border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-1">
              {steps.map((step, i) => (
                <React.Fragment key={step}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${i <= stepIdx ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                    {i < stepIdx ? <Check size={12} /> : i + 1}
                  </div>
                  {i < steps.length - 1 && <div className={`flex-1 h-0.5 ${i < stepIdx ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
                </React.Fragment>
              ))}
            </div>
            <div className="flex justify-between mt-1.5">
              {steps.map((step, i) => (
                <span key={step} className={`text-[9px] font-bold ${i <= stepIdx ? 'text-emerald-600' : 'text-slate-400'}`}>{step}</span>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-5 text-white">
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-4xl font-black tracking-tight">{to12hr(showTripDetails.time)}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${showTripDetails.status === 'Completed' ? 'bg-emerald-400/30 text-emerald-100' : showTripDetails.status === 'In Transit' ? 'bg-blue-400/30' : 'bg-white/20'}`}>{showTripDetails.status}</span>
              </div>
              <div className="h-px bg-white/20 my-3" />
              <div className="space-y-2.5">
                <div className="flex items-start gap-3">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-emerald-300" />
                  <div>
                    <p className="text-xs text-white/60 uppercase font-bold">Pickup</p>
                    <p className="text-sm font-semibold">{showTripDetails.pickup}</p>
                    {showTripDetails.pickupPhone && (() => {
                      const contactType = getContactsForTrip(showTripDetails).find(c => cleanPhone(c.phone) === cleanPhone(showTripDetails.pickupPhone));
                      const label = contactType ? contactType.label : 'Pickup';
                      return <button type="button" onClick={() => handleCall(showTripDetails.pickupPhone, `${label}: ${showTripDetails.patient}`)} className="text-sm text-blue-200 font-bold flex items-center gap-1 mt-0.5 cursor-pointer"><Phone size={10} /> {label} · {formatPhoneDisplay(showTripDetails.pickupPhone)}</button>;
                    })()}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-rose-300" />
                  <div>
                    <p className="text-xs text-white/60 uppercase font-bold">Dropoff</p>
                    <p className="text-sm font-semibold">{showTripDetails.dropoff}</p>
                    {showTripDetails.dropoffPhone && (() => {
                      const contactType = getContactsForTrip(showTripDetails).find(c => cleanPhone(c.phone) === cleanPhone(showTripDetails.dropoffPhone));
                      const label = contactType ? contactType.label : 'Dropoff';
                      return <button type="button" onClick={() => handleCall(showTripDetails.dropoffPhone, `${label}: ${showTripDetails.patient}`)} className="text-sm text-blue-200 font-bold flex items-center gap-1 mt-0.5 cursor-pointer"><Phone size={10} /> {label} · {formatPhoneDisplay(showTripDetails.dropoffPhone)}</button>;
                    })()}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button type="button" onClick={() => openInNavApp(showTripDetails.pickup, suggestNavApp(showTripDetails.pickup))} className="flex-1 h-9 bg-blue-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"><Navigation size={12} /> Pickup</button>
                <button type="button" onClick={() => openInNavApp(showTripDetails.dropoff, suggestNavApp(showTripDetails.dropoff))} className="flex-1 h-9 bg-rose-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"><Navigation size={12} /> Dropoff</button>
                <button type="button" onClick={() => openContactSelector(showTripDetails)} className="flex-1 h-9 bg-emerald-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"><PhoneForwarded size={12} /> Contacts</button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm p-4 space-y-3">
              <h3 className="text-micro font-bold uppercase tracking-wider text-slate-500">Trip Information</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm">
                  <p className="text-micro font-bold uppercase tracking-wider text-slate-500">Booking ID</p>
                  <p className="text-sm font-bold text-slate-800">{showTripDetails.bookingId || '—'}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm">
                  <p className="text-micro font-bold uppercase tracking-wider text-slate-500">Service Type</p>
                  <p className="text-sm font-bold text-slate-800">{showTripDetails.type || '—'}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm">
                  <p className="text-micro font-bold uppercase tracking-wider text-slate-500">Distance</p>
                  <p className="text-sm font-bold text-slate-800">{showTripDetails.distance ? `${showTripDetails.distance} mi` : '—'}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm">
                  <p className="text-micro font-bold uppercase tracking-wider text-slate-500">Driver</p>
                  <p className="text-sm font-bold text-slate-800">{showTripDetails.driverId || '—'}</p>
                </div>
              </div>
            </div>

            {/* Smart Contacts Section */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm p-4 space-y-3">
              <h3 className="text-micro font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2"><PhoneForwarded size={14} /> Contacts</h3>
              {(() => {
                const contacts = getContactsForTrip(showTripDetails);
                const warning = getContactWarning(showTripDetails, trips);
                return (
                  <>
                    {warning.show && (
                      <div className={`rounded-xl px-3 py-2 flex items-center gap-2 ${warning.severity === 'error' ? 'bg-rose-50 border border-rose-200' : warning.severity === 'warning' ? 'bg-amber-50 border border-amber-200' : 'bg-blue-50 border border-blue-200'}`}>
                        <AlertTriangle size={12} className={`shrink-0 ${warning.severity === 'error' ? 'text-rose-600' : warning.severity === 'warning' ? 'text-amber-600' : 'text-blue-600'}`} />
                        <p className={`text-xs font-medium ${warning.severity === 'error' ? 'text-rose-700' : warning.severity === 'warning' ? 'text-amber-700' : 'text-blue-700'}`}>{warning.message}</p>
                      </div>
                    )}
                    {/* Primary Contact Quick Action */}
                    {contacts.length > 0 && (
                      <button type="button"
                        onClick={() => { const p = getPrimaryContactForTrip(showTripDetails); if (p) handleCall(p.phone, `${p.label}: ${p.name}`); }}
                        className="w-full h-10 bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 cursor-pointer shadow-sm">
                        <Phone size={14} /> Call {contacts.find(c => c.isPrimary)?.label || 'Primary Contact'} — {formatPhoneDisplay(contacts.find(c => c.isPrimary)?.phone || contacts[0]?.phone)}
                      </button>
                    )}
                    <div className="space-y-2">
                      {contacts.map((contact, idx) => {
                        const roleStyle = getContactRoleIcon(contact.role);
                        const roleActions = getContactRoleActions(contact.role);
                        const Icon = roleStyle.icon;
                        const iconMap = { User, Shield, PhoneForwarded, AlertTriangle, Building, MapPin, Headphones, Route };
                        const IconComponent = iconMap[Icon] || User;
                        return (
                          <div key={idx} className={`flex items-center justify-between p-3 rounded-xl border ${roleStyle.border} ${roleStyle.bg}`}>
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${roleStyle.bg}`}>
                                <IconComponent size={14} className={roleStyle.color} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-bold text-slate-900 truncate">{contact.name}</p>
                                  {contact.isPrimary && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">PRIMARY</span>}
                                </div>
                                <p className="text-xs text-slate-500">{contact.label} · {formatPhoneDisplay(contact.phone)}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              <button type="button" onClick={() => handleCall(contact.phone, `${contact.label}: ${contact.name}`)} className="w-8 h-8 rounded-lg bg-white text-emerald-600 flex items-center justify-center active:scale-90 shadow-sm cursor-pointer" title={roleActions.callLabel}><Phone size={14} /></button>
                              {roleActions.smsLabel && (
                                <button type="button" onClick={() => handleSMS(contact.phone, contact.name)} className="w-8 h-8 rounded-lg bg-white text-blue-600 flex items-center justify-center active:scale-90 shadow-sm cursor-pointer" title={roleActions.smsLabel}><MessageCircle size={14} /></button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
              {showTripDetails.notes && (
                <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                  <p className="text-xs text-amber-600 uppercase font-bold mb-1">Notes</p>
                  <p className="text-xs text-amber-800">{showTripDetails.notes}</p>
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm p-4 space-y-3">
              <h3 className="text-micro font-bold uppercase tracking-wider text-slate-500">Timeline & Odometer</h3>
              <div className="space-y-2.5">
                {showTripDetails.startTime && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Started</span>
                    <span className="text-xs font-bold text-slate-800">{new Date(showTripDetails.startTime).toLocaleString()}</span>
                  </div>
                )}
                {showTripDetails.arrivalTime && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Arrived</span>
                    <span className="text-xs font-bold text-slate-800">{new Date(showTripDetails.arrivalTime).toLocaleString()}</span>
                  </div>
                )}
                {showTripDetails.completedAt && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Completed</span>
                    <span className="text-xs font-bold text-slate-800">{new Date(showTripDetails.completedAt).toLocaleString()}</span>
                  </div>
                )}
                {showTripDetails.pickupOdometer && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-emerald-600">Pickup Odometer</span>
                    <span className="text-xs font-bold text-emerald-700">{showTripDetails.pickupOdometer?.toLocaleString()} mi</span>
                  </div>
                )}
                {showTripDetails.arrivalOdometer && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-emerald-600">Arrival Odometer</span>
                    <span className="text-xs font-bold text-emerald-700">{showTripDetails.arrivalOdometer?.toLocaleString()} mi</span>
                  </div>
                )}
                {showTripDetails.dropoffOdometer && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-rose-600">Dropoff Odometer</span>
                    <span className="text-xs font-bold text-rose-700">{showTripDetails.dropoffOdometer?.toLocaleString()} mi</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm p-4 space-y-3">
              <h3 className="text-micro font-bold uppercase tracking-wider text-slate-500">Actions</h3>
              <div className="flex gap-2">
                <button type="button" onClick={() => openInNavApp(showTripDetails.pickup, 'google')} className="flex-1 h-10 bg-slate-100 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"><Map size={12} /> Google Maps</button>
                <button type="button" onClick={() => openInNavApp(showTripDetails.pickup, 'waze')} className="flex-1 h-10 bg-slate-100 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"><Navigation size={12} /> Waze</button>
                <button type="button" onClick={() => openInNavApp(showTripDetails.pickup, 'apple')} className="flex-1 h-10 bg-slate-100 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"><Map size={12} /> Apple</button>
              </div>
            </div>
          </div>
        </div>
      );
      })()}

      {/* ===== TOOLS PAGE ===== */}
      {isClockedIn && activeNav === 'tools' && (
        <DriverToolsPage
          trips={trips}
          activeTrips={activeTrips}
          aiSequence={aiSequence}
          aiSuggestions={aiSuggestions}
          aiRideShare={aiRideShare}
          conflicts={conflicts}
          aiOptimizing={aiOptimizing}
          guidedMode={guidedMode}
          guidedStepIndex={guidedStepIndex}
          guidedSteps={guidedSteps}
          driverPosition={driverPosition}
          appSettings={appSettings}
          currentUser={currentUser}
          role={role}
          onSetGuidedMode={setGuidedMode}
          onSetGuidedStepIndex={setGuidedStepIndex}
          onSetAiSequence={setAiSequence}
          onSetAiSuggestions={setAiSuggestions}
          onRunAiOptimization={runAiOptimization}
          onSelectAllTrips={selectAllTrips}
          selectedTrips={selectedTrips}
          onSetSelectedTrips={setSelectedTrips}
          etas={etas}
          onOpenInNav={(addr) => { impact('medium'); openInNavApp(addr, suggestNavApp(addr)); }}
          onOpenSequencer={() => setActiveNav('sequencer')}
          requestAuthAction={requestAuthAction}
          routePlanStops={routePlanStops}
          onSetRoutePlanStops={setRoutePlanStops}
          onSendToSequencer={(stopData, origin) => {
            if (!Array.isArray(stopData) || stopData.length === 0) {
              if (stopData?.clients?.length) {
                setSequencerTripFilter(null);
                setRoutePlanSequencerStops(stopData.clients);
                setRoutePlanSequencerSequence(stopData.sequence || null);
                setRoutePlanSequencerOrigin(origin || null);
                setSequencerKey(k => k + 1);
                setActiveNav('sequencer');
                setShowToast({ type: 'success', message: `${stopData.clients.length} route stop${stopData.clients.length !== 1 ? 's' : ''} loaded in Route Sequencer.` });
                return;
              }
              setSequencerTripFilter(null);
              setRoutePlanSequencerStops(null);
              setRoutePlanSequencerSequence(null);
              setRoutePlanSequencerOrigin(null);
              setSequencerKey(k => k + 1);
              setActiveNav('sequencer');
              return;
            }
            const stamp = Date.now();
            const items = stopData
              .filter(s => s?.address)
              .map((s, index) => {
                const stopType = s.stopType === 'DO' ? 'DO' : 'PU';
                const id = `route-plan-${stamp}-${index}`;
                return {
                  id,
                  name: s.clientName || `Stop ${String.fromCharCode(65 + index)}`,
                  address: s.address,
                  pu: stopType === 'PU' ? s.address : '',
                  do: stopType === 'DO' ? s.address : '',
                  time: s.time || '',
                  serviceType: s.serviceType || '',
                  bookingId: s.bookingId || '',
                  phone: s.phone || s.patientPhone || s.pickupPhone || s.dropoffPhone || '',
                  routePlanTripId: s.tripId || null,
                };
              });
            const sequence = items.map((item, index) => ({
              clientId: item.id,
              type: item.do ? 'DO' : 'PU',
              leg: 'A',
              stepNumber: index + 1,
            }));
            setSequencerTripFilter(null);
            setRoutePlanSequencerStops(items);
            setRoutePlanSequencerSequence(sequence);
            setRoutePlanSequencerOrigin(origin || null);
            setSequencerKey(k => k + 1);
            setActiveNav('sequencer');
            setShowToast({ type: 'success', message: `${items.length} route stop${items.length !== 1 ? 's' : ''} loaded in Route Sequencer.` });
          }}
        />
      )}

      {/* ===== HISTORY PAGE ===== */}
      {isClockedIn && activeNav === 'history' && (
        <div className="flex-1 overflow-y-auto pb-28 px-3 pt-2">
          <div className="px-1 pt-2 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">History</h2>
                <p className="text-slate-500 text-xs font-semibold mt-0.5">Review past trips and activity</p>
              </div>
              {allHistory.length > 0 && (
                <button onClick={exportDailyLog} className="px-3 h-8 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all flex items-center gap-1.5 text-xs">
                  <Download size={12} /> Export
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Search patient, booking ID..." value={historySearch} onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-blue-400" />
              {historySearch && <button onClick={() => setHistorySearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"><X size={12} /></button>}
            </div>
            <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-xl shrink-0">
              <button onClick={() => { const d = new Date(historyDate + 'T12:00:00'); d.setDate(d.getDate() - 1); setHistoryDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); }}
                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-l-xl hover:bg-slate-50 transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <input type="date" value={historyDate} max={todayStr()}
                onChange={(e) => setHistoryDate(e.target.value)}
                className="w-0 h-8 opacity-0 absolute pointer-events-none"
                id="historyDatePick" />
              <label htmlFor="historyDatePick"
                className="px-2 h-8 flex items-center justify-center text-[11px] font-bold text-slate-700 cursor-pointer hover:bg-slate-50 transition whitespace-nowrap select-none">
                {historyDate ? new Date(historyDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'All'}
              </label>
              <button onClick={() => {
                const d = new Date(historyDate + 'T12:00:00'); d.setDate(d.getDate() + 1);
                const tomorrow = todayStr();
                const next = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                if (next <= tomorrow) setHistoryDate(next);
              }}
                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-r-xl hover:bg-slate-50 transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
            {historyDate !== todayStr() && (
              <button onClick={() => setHistoryDate(todayStr())}
                className="px-2.5 h-8 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-bold hover:bg-blue-100 transition shrink-0">
                Today
              </button>
            )}
          </div>

          <div className="flex gap-1.5 mb-5 overflow-x-auto no-scrollbar px-1">
            {[
              { id: 'all', label: 'All' },
              { id: 'completed', label: 'Completed' },
              { id: 'noshow', label: 'No Show' },
              { id: 'cancelled', label: 'Cancelled' },
              { id: 'rerouted', label: 'Rerouted' },
            ].map(f => (
              <button key={f.id} onClick={() => setHistoryFilter(f.id)}
                className={`px-4 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${historyFilter === f.id ? f.id === 'rerouted' ? 'bg-purple-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold'}`}>
                {f.label} ({f.id === 'all' ? allHistory.length : f.id === 'rerouted' ? reroutedTrips.length : f.id === 'completed' ? completedTrips.length : f.id === 'noshow' ? noShowTrips.length : cancelledTrips.length})
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredHistory.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm p-12 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-slate-50 to-slate-100 rounded-[2rem] flex items-center justify-center mx-auto mb-4 shadow-inner">
                  <Clock size={28} className="text-slate-300" />
                </div>
                <h3 className="text-base font-black text-slate-900">{historySearch ? 'No matching trips' : 'No history'}</h3>
                <p className="text-slate-500 text-xs font-semibold mt-1">{historySearch ? 'Try a different search term.' : 'Your completed trips will appear here.'}</p>
              </div>
            ) : (
              filteredHistory.map(trip => {
                const styles = {
                  'Completed': { bg: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', border: 'border-l-emerald-400' },
                  'No Show': { bg: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', border: 'border-l-amber-400' },
                  'Cancelled': { bg: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500', border: 'border-l-rose-400' },
                  'Rerouted': { bg: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500', border: 'border-l-purple-400' },
                };
                const s = styles[trip.status] || styles['Completed'];
                const isExpanded = historyExpandedId === trip.id;
                return (
                  <div key={trip.id} className={`bg-white rounded-2xl overflow-hidden transition-all duration-300 border border-slate-200/60 ${isExpanded ? 'shadow-md border-blue-200' : 'shadow-sm hover:border-slate-300'}`}>
                    <div onClick={() => setHistoryExpandedId(prev => prev === trip.id ? null : trip.id)} className="p-3 cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className={`w-2 h-2 rounded-full ${s.dot} shrink-0`} />
                          <span className="text-sm font-bold text-slate-900 truncate">{trip.patient}</span>
                          <span className="text-[11px] font-mono text-blue-600 font-semibold shrink-0">#{trip.bookingId || trip.id}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-bold text-emerald-600">{to24hr(trip.time)}</span>
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${s.bg}`}>{trip.status}</span>
                          {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                    <div className="border-t border-slate-100 p-4">
                      <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th colSpan="2" className="px-4 py-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-white shadow-sm border border-slate-200 flex items-center justify-center">
                                      <User size={14} className="text-slate-600" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-slate-900">{trip.patient}</p>
                                      <p className="text-[10px] font-mono text-blue-600 font-semibold">#{trip.bookingId || trip.id}</p>
                                    </div>
                                  </div>
                                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${s.bg}`}>{trip.status}</span>
                                </div>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="text-xs">
                            <tr className="border-b border-slate-100">
                              <td className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50/50 w-2/5">Trip ID</td>
                              <td className="px-4 py-2.5 font-mono font-bold text-blue-600 text-[11px]">{trip.bookingId || trip.id || '—'}</td>
                            </tr>
                            <tr className="border-b border-slate-100">
                              <td className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50/50 w-2/5">Pickup Time</td>
                              <td className="px-4 py-2.5 font-bold text-emerald-600">{trip.time ? to24hr(trip.time) : '—'}</td>
                            </tr>
                            <tr className="border-b border-slate-100">
                              <td className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50/50 w-2/5">Dropoff Time</td>
                              <td className="px-4 py-2.5 font-bold text-rose-600">{trip.arrivalDropoffTime ? formatIsoTo24hr(trip.arrivalDropoffTime) : (trip.completedAt ? formatIsoTo24hr(trip.completedAt) : '—')}</td>
                            </tr>
                            <tr className="border-b border-slate-100">
                              <td className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50/50">Pickup Odometer</td>
                              <td className="px-4 py-2.5 font-bold text-slate-800">{trip.pickupOdometer ? `${Number(trip.pickupOdometer).toLocaleString()} mi` : '—'}</td>
                            </tr>
                            <tr className="border-b border-slate-100">
                              <td className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50/50">Dropoff Odometer</td>
                              <td className="px-4 py-2.5 font-bold text-slate-800">{trip.dropoffOdometer ? `${Number(trip.dropoffOdometer).toLocaleString()} mi` : '—'}</td>
                            </tr>
                            {(trip.pickupOdometer && trip.dropoffOdometer) && (
                            <tr className="border-b border-slate-100">
                              <td className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50/50">Distance Driven</td>
                              <td className="px-4 py-2.5 font-bold text-blue-600">{Math.max(0, Number(trip.dropoffOdometer) - Number(trip.pickupOdometer)).toLocaleString()} mi</td>
                            </tr>
                            )}
                            {trip.distance && (
                            <tr className="border-b border-slate-100">
                              <td className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50/50">Distance</td>
                              <td className="px-4 py-2.5 font-bold text-slate-800">{trip.distance} mi</td>
                            </tr>
                            )}
                            <tr className="border-b border-slate-100">
                              <td className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50/50 align-top">Pickup Address</td>
                              <td className="px-4 py-2.5 font-semibold text-emerald-700 leading-relaxed break-words">{trip.pickup || '—'}</td>
                            </tr>
                            <tr className="border-b border-slate-100">
                              <td className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50/50 align-top">Dropoff Address</td>
                              <td className="px-4 py-2.5 font-semibold text-rose-700 leading-relaxed break-words">{trip.dropoff || '—'}</td>
                            </tr>
                            {trip.status === 'Rerouted' && trip.cancellationReason && (
                            <tr className="border-b border-slate-100">
                              <td className="px-4 py-2.5 font-bold text-purple-500 uppercase tracking-wider text-[10px] bg-slate-50/50 align-top">Reroute Reason</td>
                              <td className="px-4 py-2.5">
                                <p className="font-semibold text-slate-700">{trip.cancellationReason}</p>
                                {trip.cancelledBy && <p className="text-[10px] text-slate-400 mt-0.5">by {trip.cancelledBy}</p>}
                              </td>
                            </tr>
                            )}
                            {trip.completedAt && (
                            <tr>
                              <td colSpan="2" className="px-4 py-2 bg-slate-50/50 text-[10px] text-slate-400 text-center">Completed {new Date(trip.completedAt).toLocaleString()}</td>
                            </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button type="button" onClick={() => setShowTripDetails(trip)} className="flex-1 h-10 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs"><FileText size={12} /> Details</button>
                        <button type="button" onClick={() => restoreHistoryTrip(trip)} className="flex-1 h-10 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs"><RotateCcw size={12} /> Restore</button>
                      </div>
                    </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ===== CHAT PAGE ===== */}
      {activeNav === 'chat' && (
        <div className="flex-1 flex flex-col bg-white" style={{ paddingBottom: 'calc(88px + env(safe-area-inset-bottom, 0px))' }}>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ChatPage currentUser={currentUser} role={role} drivers={allDrivers || drivers} dispatchers={dispatchers} trips={trips} />
          </div>
        </div>
      )}

      {/* ===== SETTINGS PAGE ===== */}
      {activeNav === 'settings' && (
        <div className="flex-1 overflow-y-auto pb-28 px-3 pt-2">
          <div className="px-1 pt-2 pb-3">
            <h2 className="text-xl font-black text-slate-900">Settings</h2>
            <p className="text-slate-500 text-xs font-semibold mt-0.5">Account and app preferences</p>
          </div>
          <div className="space-y-4 px-1">
            {/* Profile Card */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600/90 to-indigo-700/90 shadow-lg shadow-blue-600/10">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.1),transparent_60%)]" />
              <div className="relative px-5 py-5">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl font-black text-white shadow-inner border border-white/10">
                    {String(me?.name || '?').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold text-white truncate">{me?.name}</h2>
                    <p className="text-sm text-white/70 truncate">{displayLoginId}</p>
                    <p className="text-xs text-white/50 mt-0.5">{me?.vehicle || 'No vehicle'} • {me?.currentZone || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <span className="px-4 h-9 rounded-xl font-bold text-xs uppercase tracking-wider bg-emerald-600 text-white border border-emerald-600 flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse" /> Online
                  </span>
                  <div className="flex items-center gap-1.5 px-3 h-9 bg-white/10 backdrop-blur-md rounded-xl border border-white/10">
                    <Gauge size={12} className="text-white/70" />
                    <span className="text-xs font-medium text-white">{me?.odometer?.toLocaleString() || 0} mi</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Connection Status */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isOnline ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                    {isOnline ? <Wifi size={18} /> : <WifiOff size={18} />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{isOnline ? 'Connected' : 'Offline'}</p>
                    <p className="text-slate-500 text-xs font-semibold">Location sharing active</p>
                  </div>
                </div>
                <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'} ${isOnline ? 'animate-pulse' : ''}`} />
              </div>
            </div>

            {/* Analytics */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
              <button onClick={() => setShowAnalytics(!showAnalytics)} className="w-full p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <BarChart3 size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Today's Analytics</p>
                    <p className="text-slate-500 text-xs font-semibold">{analytics.tripsCompleted} trips completed</p>
                  </div>
                </div>
                <ChevronDown size={16} className={`text-slate-300 transition-transform ${showAnalytics ? 'rotate-180' : ''}`} />
              </button>
              {showAnalytics && (
                <div className="px-4 pb-4 pt-0">
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[
                      { label: 'Trips Done', value: analytics.tripsCompleted, icon: Truck, color: 'text-blue-600', bg: 'bg-blue-50' },
                      { label: 'Distance', value: `${analytics.totalDistance} mi`, icon: MapPin, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                      { label: 'Drive Time', value: formatDuration(analytics.totalDriveTime), icon: Clock, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                      { label: 'Efficiency', value: `${analytics.efficiency}/hr`, icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50' },
                    ].map(stat => {
                      const Icon = stat.icon;
                      return (
                        <div key={stat.label} className={`${stat.bg} rounded-xl p-3 text-center`}>
                          <Icon size={16} className={`mx-auto mb-1 ${stat.color}`} />
                          <p className="text-sm font-black text-slate-900">{stat.value}</p>
                          <p className="text-micro font-bold uppercase tracking-wider text-slate-500">{stat.label}</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm">
                    <p className="text-micro font-bold uppercase tracking-wider text-slate-500 mb-2">Time Distribution</p>
                    <div className="space-y-1.5">
                      <div>
                        <div className="flex justify-between text-xs text-slate-500 mb-0.5">
                          <span>Driving</span>
                          <span>{analytics.totalDriveTime > 0 ? `${Math.round((analytics.totalDriveTime / (analytics.totalDriveTime || 1)) * 100)}%` : '0%'}</span>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, analytics.totalDriveTime > 0 ? 70 : 0)}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-slate-500 mb-0.5">
                          <span>Idle/Waiting</span>
                          <span>30%</span>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: '30%' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Odometer */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-micro font-bold uppercase tracking-wider text-slate-500">Odometer</p>
                  {editingOdometer ? (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="number"
                        value={odometerInput}
                        onChange={(e) => setOdometerInput(e.target.value)}
                        className="flex-1 text-2xl font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          const val = parseInt(odometerInput);
                          if (!isNaN(val) && val >= 0) {
                            onUpdateAppSettings?.({ odometer: val }, true);
                          }
                          setEditingOdometer(false);
                        }}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingOdometer(false)}
                        className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-200 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setOdometerInput(String(me?.odometer || 0)); setEditingOdometer(true); }}
                      className="text-2xl font-bold text-slate-900 mt-1 hover:text-blue-600 transition text-left"
                    >
                      {me?.odometer?.toLocaleString() || 0} <span className="text-sm font-medium text-slate-400">mi</span>
                      <span className="text-xs text-blue-500 ml-2 font-medium">Edit</span>
                    </button>
                  )}
                  <p className="text-slate-500 text-xs font-semibold mt-1">Next service at {me?.nextOilChange?.toLocaleString() || '5,000'} mi</p>
                </div>
                <Gauge size={32} className="text-slate-200" />
              </div>
            </div>

            {/* Vehicle Info */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm p-4">
              <p className="text-micro font-bold uppercase tracking-wider text-slate-500 mb-3">Vehicle Info</p>
              <div className="space-y-2.5 text-sm">
                {[
                  ['Vehicle', me?.vehicle || 'N/A'],
                  ['Zone', me?.currentZone || 'N/A'],
                  ['Status', isClockedIn ? 'Online' : 'Offline'],
                  ['GPS', 'Active'],
                  ['Background Tracking', backgroundLocation ? 'Enabled' : 'Not Available'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-slate-500 text-xs font-semibold">{label}</span>
                    <span className={`font-semibold text-xs ${value === 'Online' || value === 'Active' || value === 'Enabled' ? 'text-emerald-600' : value === 'Offline' || value === 'Inactive' || value === 'Not Available' ? 'text-slate-400' : 'text-slate-800'}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation App */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3 text-slate-800 font-semibold"><Route size={16} /> Preferred Navigation App</div>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { value: 'google', label: 'Google Maps' },
                  { value: 'waze', label: 'Waze' },
                  { value: 'apple', label: 'Apple Maps' },
                ].map((option) => {
                  const active = appSettings?.navigationApp === option.value;
                  return (
                    <button key={option.value}
                      onClick={() => onUpdateAppSettings?.({ navigationApp: option.value })}
                      className={`p-3 rounded-xl border text-left transition ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 hover:border-slate-300 text-slate-700'}`}
                    >
                      <div className="flex items-center gap-2 font-bold text-sm"><Navigation size={15} /> {option.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Appearance */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3 text-slate-800 font-semibold"><Sun size={16} /> Theme</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'light', label: 'Light', icon: Sun },
                  { value: 'dark', label: 'Dark', icon: Moon },
                ].map((option) => {
                  const Icon = option.icon;
                  const active = (appSettings?.theme || 'light') === option.value;
                  return (
                    <button key={option.value}
                      onClick={() => onUpdateAppSettings?.({ theme: option.value })}
                      className={`p-3 rounded-2xl border-2 text-left transition active:scale-95 ${active ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-200 hover:border-slate-300 text-slate-700'}`}
                    >
                      <div className="flex items-center gap-2 font-bold text-sm"><Icon size={15} /> {option.label}</div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3">
                <div className="flex items-center gap-2 mb-2 text-slate-800 font-semibold"><span className="text-sm">A</span> Font Size</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'sm', label: 'Small' },
                    { value: 'md', label: 'Standard' },
                    { value: 'lg', label: 'Large' },
                  ].map((option) => {
                    const active = (appSettings?.fontScale || 'md') === option.value;
                    return (
                      <button key={option.value}
                        onClick={() => onUpdateAppSettings?.({ fontScale: option.value })}
                        className={`p-3 rounded-2xl border-2 font-bold text-sm transition active:scale-95 ${active ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-200 hover:border-slate-300 text-slate-700'}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Notifications & GPS */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3 text-slate-800 font-semibold">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
                  Preferences
                </div>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">Notifications</p>
                          <p className="text-[10px] text-slate-500">Message and trip alerts</p>
                        </div>
                      </div>
                      <span className="px-3 h-7 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> Always On
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                          <MapPin size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">GPS Sharing</p>
                          <p className="text-[10px] text-slate-500">Share location in real time</p>
                        </div>
                      </div>
                      <span className="px-3 h-7 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> Always On
                      </span>
                    </div>
                </div>
              </div>
            </div>

            {/* Sign Out */}
            <button onClick={() => onLogout?.()} className="w-full flex items-center justify-between px-4 py-3.5 bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm hover:bg-rose-50/50 transition-all">
              <div className="flex items-center gap-3">
                <LogOut size={17} className="text-rose-400" />
                <span className="font-medium text-sm text-rose-600">Sign Out</span>
              </div>
              <ChevronRight size={15} className="text-slate-300" />
            </button>
          </div>
        </div>
      )}

      {/* ===== CANCEL / NO-SHOW LEG SELECTION MODAL ===== */}
      {cancelPrompt && !passwordPrompt && (() => {
        const allSelected = selectedLegsForAction.size === cancelPrompt.legs.length;
        const toggleLeg = (id) => {
          setSelectedLegsForAction(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          });
        };
        const toggleAll = () => {
          setSelectedLegsForAction(prev => prev.size === cancelPrompt.legs.length ? new Set() : new Set(cancelPrompt.legs.map(l => l.id)));
        };
        const actionLabel = cancelPrompt.type === 'noshow' ? 'No Show' : cancelPrompt.type === 'reroute' ? 'Reroute' : 'Cancel';
        const actionColor = cancelPrompt.type === 'noshow' ? 'bg-orange-600 hover:bg-orange-700' : cancelPrompt.type === 'reroute' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-rose-600 hover:bg-rose-700';
        const checkColor = cancelPrompt.type === 'noshow' ? 'bg-orange-500 border-orange-500' : cancelPrompt.type === 'reroute' ? 'bg-purple-500 border-purple-500' : 'bg-rose-500 border-rose-500';
        const activeColor = cancelPrompt.type === 'noshow' ? 'border-orange-200 bg-orange-50' : cancelPrompt.type === 'reroute' ? 'border-purple-200 bg-purple-50' : 'border-rose-200 bg-rose-50';
        return (
          <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 140 }} onClick={() => { setCancelPrompt(null); setSelectedLegsForAction(new Set()); }}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="font-bold text-base text-slate-900">{actionLabel} Trip Legs</h2>
                  <p className="text-xs text-slate-500">{cancelPrompt.trip.patient} — {cancelPrompt.legs.length} leg{cancelPrompt.legs.length !== 1 ? 's' : ''}</p>
                </div>
                <button type="button" onClick={() => { setCancelPrompt(null); setSelectedLegsForAction(new Set()); }} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 cursor-pointer shrink-0">
                  <X size={16} className="text-slate-500" />
                </button>
              </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <button type="button" onClick={toggleAll} className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition active:scale-95 cursor-pointer ${allSelected ? activeColor : 'border-slate-200 hover:bg-slate-50 bg-white'}`}>
                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition ${allSelected ? checkColor : 'border-slate-300'}`}>
                  {allSelected && <Check size={14} className="text-white" />}
                </div>
                <span className="text-sm font-bold text-slate-900">Select All ({cancelPrompt.legs.length})</span>
              </button>
              {cancelPrompt.legs.map((leg, idx) => {
                const isSelected = selectedLegsForAction.has(leg.id);
                return (
                  <button type="button" key={leg.id} onClick={() => toggleLeg(leg.id)}
                    className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition active:scale-95 cursor-pointer ${isSelected ? activeColor : 'border-slate-200 hover:bg-slate-50 bg-white'}`}>
                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition ${isSelected ? checkColor : 'border-slate-300'}`}>
                      {isSelected && <Check size={14} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${cancelPrompt.type === 'noshow' ? 'bg-amber-100 text-amber-600' : cancelPrompt.type === 'reroute' ? 'bg-purple-100 text-purple-600' : 'bg-rose-100 text-rose-600'}`}>L{idx + 1}</span>
                        <span className="text-sm font-bold text-slate-900 truncate">{leg.patient}</span>
                        {leg.bookingId && <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-md text-[9px] font-bold shrink-0">{leg.bookingId}</span>}
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${leg.status === 'Completed' ? 'bg-emerald-50 text-emerald-600' : leg.status === 'Cancelled' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>{leg.status}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-micro text-slate-500 mt-0.5">
                        <span className="truncate">{leg.pickup}</span>
                        <span className="shrink-0">→</span>
                        <span className="truncate">{leg.dropoff}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  if (selectedLegsForAction.size === 0) return;
                  setCancelPrompt(null);
                  setPasswordPrompt({ type: cancelPrompt.type, trip: cancelPrompt.trip, selectedLegIds: [...selectedLegsForAction], reason: '' });
                  setSelectedLegsForAction(new Set());
                }}
                disabled={selectedLegsForAction.size === 0}
                className={`w-full py-3.5 text-white rounded-xl font-bold text-sm transition disabled:opacity-40 cursor-pointer ${actionColor}`}>
                {selectedLegsForAction.size === 0 ? 'Select at least one leg' : `${actionLabel} ${selectedLegsForAction.size} Leg${selectedLegsForAction.size > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ===== RESTORE LEG SELECTION MODAL ===== */}
      {restorePrompt && !passwordPrompt && (() => {
        const allSelected = selectedLegsForAction.size === restorePrompt.legs.length;
        const toggleLeg = (id) => {
          setSelectedLegsForAction(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          });
        };
        const toggleAll = () => {
          setSelectedLegsForAction(prev => prev.size === restorePrompt.legs.length ? new Set() : new Set(restorePrompt.legs.map(l => l.id)));
        };
        return (
          <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 140 }} onClick={() => { setRestorePrompt(null); setSelectedLegsForAction(new Set()); }}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="font-bold text-base text-slate-900">Restore Trip Legs</h2>
                  <p className="text-xs text-slate-500">{restorePrompt.trip.patient} — {restorePrompt.legs.length} leg{restorePrompt.legs.length !== 1 ? 's' : ''}</p>
                </div>
                <button type="button" onClick={() => { setRestorePrompt(null); setSelectedLegsForAction(new Set()); }} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 cursor-pointer shrink-0">
                  <X size={16} className="text-slate-500" />
                </button>
              </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <button type="button" onClick={toggleAll} className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition active:scale-95 cursor-pointer ${allSelected ? 'border-blue-200 bg-blue-50' : 'border-slate-200 hover:bg-slate-50 bg-white'}`}>
                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition ${allSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                  {allSelected && <Check size={14} className="text-white" />}
                </div>
                <span className="text-sm font-bold text-slate-900">Select All ({restorePrompt.legs.length})</span>
              </button>
              {restorePrompt.legs.map((leg, idx) => {
                const isSelected = selectedLegsForAction.has(leg.id);
                return (
                  <button type="button" key={leg.id} onClick={() => toggleLeg(leg.id)}
                    className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition active:scale-95 cursor-pointer ${isSelected ? 'border-blue-200 bg-blue-50' : 'border-slate-200 hover:bg-slate-50 bg-white'}`}>
                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                      {isSelected && <Check size={14} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-black">L{idx + 1}</span>
                        <span className="text-sm font-bold text-slate-900 truncate">{leg.patient}</span>
                        {leg.bookingId && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md text-[9px] font-bold shrink-0">{leg.bookingId}</span>}
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${leg.status === 'Completed' ? 'bg-emerald-50 text-emerald-600' : leg.status === 'Cancelled' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>{leg.status}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-micro text-slate-500 mt-0.5">
                        <span className="truncate">{leg.pickup}</span>
                        <span className="shrink-0">→</span>
                        <span className="truncate">{leg.dropoff}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  if (selectedLegsForAction.size === 0) return;
                  setRestorePrompt(null);
                  setPasswordPrompt({ type: 'restore', trip: restorePrompt.trip, selectedLegIds: [...selectedLegsForAction] });
                }}
                disabled={selectedLegsForAction.size === 0}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition disabled:opacity-40 cursor-pointer">
                {selectedLegsForAction.size === 0 ? 'Select at least one leg' : `Restore ${selectedLegsForAction.size} Leg${selectedLegsForAction.size > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ===== EMERGENCY TRANSFER MODAL ===== */}
      {transferPrompt && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 175 }} onClick={() => setTransferPrompt(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="font-bold text-base text-slate-900">Emergency Transfer</h2>
                <p className="text-xs text-slate-500">Send {transferPrompt.type === 'route' ? 'route plan' : 'trip'} to another driver</p>
              </div>
              <button type="button" onClick={() => setTransferPrompt(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 cursor-pointer shrink-0">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="text-micro font-bold uppercase tracking-wider text-slate-500 mb-2 block">Send To Driver</label>
                <select value={transferTargetDriverId} onChange={(e) => setTransferTargetDriverId(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm focus:border-amber-500 outline-none">
                  <option value="">Select driver</option>
                  {transferTargetDrivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>{driver.name || driver.email || driver.id}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-micro font-bold uppercase tracking-wider text-slate-500 mb-2 block">Reason</label>
                <select value={transferReason} onChange={(e) => setTransferReason(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm focus:border-amber-500 outline-none">
                  <option value="">Select reason</option>
                  <option value="Traffic delay">Traffic delay</option>
                  <option value="Vehicle issue">Vehicle issue</option>
                  <option value="Emergency">Emergency</option>
                  <option value="Running late">Running late</option>
                  <option value="Other driver closer">Other driver closer</option>
                </select>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                    <AlertTriangle size={18} className="text-amber-600" />
                  </div>
                  <p className="text-sm font-semibold text-amber-800">The receiving driver must accept with password before ownership changes.</p>
                </div>
              </div>
            </div>
            <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 flex gap-3">
              <button type="button" onClick={() => setTransferPrompt(null)} className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">Cancel</button>
              <button type="button" onClick={submitTransferRequest} disabled={!transferTargetDriverId} className="flex-1 py-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-sm disabled:opacity-40 transition-all cursor-pointer">Send Transfer</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== PASSWORD CONFIRM MODAL ===== */}
      {passwordPrompt && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 180 }} onClick={() => { setPasswordPrompt(null); setPasswordValue(''); setPasswordError(''); }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="font-bold text-base text-slate-900">
                  Confirm {passwordPrompt.type === 'route_stop_exception' ? passwordPrompt.status : passwordPrompt.type === 'noshow' ? 'No Show' : passwordPrompt.type === 'reroute' ? 'Reroute' : passwordPrompt.type === 'restore' ? 'Restore' : passwordPrompt.type === 'edittrip' || passwordPrompt.type === 'edittripcomplete' ? 'Edit' : passwordPrompt.type === 'accept_transfer_trip' || passwordPrompt.type === 'accept_transfer_route' ? 'Accept Transfer' : passwordPrompt.type === 'decline_transfer_trip' || passwordPrompt.type === 'decline_transfer_route' ? 'Decline Transfer' : 'Cancel'}
                </h2>
                <p className="text-xs text-slate-500">Step 2 of 2</p>
              </div>
              <button type="button" onClick={() => { setPasswordPrompt(null); setPasswordValue(''); setPasswordError(''); }} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 cursor-pointer shrink-0">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <div className="px-4 pt-3 shrink-0">
              <div className="flex items-center gap-1">
                <div className="h-1.5 flex-1 rounded-full bg-emerald-400" />
                <div className={`h-1.5 flex-1 rounded-full ${passwordPrompt.type === 'restore' || passwordPrompt.type === 'edittrip' || passwordPrompt.type === 'edittripcomplete' || String(passwordPrompt.type || '').includes('transfer') ? 'bg-blue-400' : 'bg-rose-400'}`} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <p className="text-sm font-medium text-slate-700">
                  {passwordPrompt.type === 'restore' ? 'Enter your password to restore selected trips' : passwordPrompt.type === 'edittrip' || passwordPrompt.type === 'edittripcomplete' ? 'Enter your password to save your trip changes' : String(passwordPrompt.type || '').includes('transfer') ? 'Enter your password to confirm this transfer decision.' : passwordPrompt.type === 'route_stop_exception' ? `Enter your password to mark ${passwordPrompt.trip?.patient || 'this route stop'} as ${passwordPrompt.status}.` : `Enter your password to mark ${passwordPrompt.selectedLegIds && passwordPrompt.selectedLegIds.length > 1 ? `${passwordPrompt.selectedLegIds.length} legs` : passwordPrompt.trip.patient} as ${passwordPrompt.type === 'noshow' ? 'No Show' : passwordPrompt.type === 'reroute' ? 'Rerouted' : 'Cancelled'}`}
                </p>
                {passwordPrompt.selectedLegIds && passwordPrompt.selectedLegIds.length > 1 && (
                  <p className="text-xs text-rose-500 font-semibold mt-2">{passwordPrompt.selectedLegIds.length} leg{passwordPrompt.selectedLegIds.length !== 1 ? 's' : ''} will be affected</p>
                )}
              </div>
              {passwordPrompt.type !== 'restore' && passwordPrompt.type !== 'edittrip' && passwordPrompt.type !== 'edittripcomplete' && !String(passwordPrompt.type || '').includes('transfer') && (
                <div>
                  <label className="text-micro font-bold uppercase tracking-wider text-slate-500 mb-2 block">Reason</label>
                  <select value={passwordPrompt.reason || ''} onChange={(e) => setPasswordPrompt(prev => ({ ...prev, reason: e.target.value }))}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-medium text-sm focus:border-rose-500 outline-none">
                    <option value="">Select reason (optional)</option>
                    <option value="Client Cancelled">Client Cancelled</option>
                    <option value="Facility Cancelled">Facility Cancelled</option>
                    <option value="No Answer">No Answer</option>
                    <option value="No Show">No Show</option>
                    <option value="Transportation Issue">Transportation Issue</option>
                    <option value="Weather">Weather</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              )}
              <div>
                <label className="text-micro font-bold uppercase tracking-wider text-slate-500 mb-2 block">Password</label>
                <input
                  type="password"
                  value={passwordValue}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && verifyPasswordAndProceed()}
                  placeholder="Enter password"
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base text-center focus:border-rose-500 outline-none"
                  autoFocus
                />
                {passwordError && <p className="text-sm text-rose-600 font-semibold mt-2 text-center">{passwordError}</p>}
              </div>
            </div>
            <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 flex gap-3">
              <button type="button" onClick={() => { setPasswordPrompt(null); setPasswordValue(''); setPasswordError(''); }} className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">
                Back
              </button>
              <button type="button" onClick={verifyPasswordAndProceed} disabled={!passwordValue || passwordVerifying} className={`flex-1 py-3.5 text-white rounded-xl font-bold text-sm disabled:opacity-40 transition-all cursor-pointer ${passwordPrompt.type === 'restore' || String(passwordPrompt.type || '').includes('transfer') ? 'bg-blue-600 hover:bg-blue-700' : passwordPrompt.type === 'reroute' ? 'bg-purple-600 hover:bg-purple-700' : passwordPrompt.type === 'edittrip' || passwordPrompt.type === 'edittripcomplete' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                {passwordVerifying ? 'Verifying...' : passwordPrompt.type === 'route_stop_exception' ? `Confirm ${passwordPrompt.status}` : passwordPrompt.type === 'noshow' ? 'Confirm No Show' : passwordPrompt.type === 'reroute' ? 'Confirm Reroute' : passwordPrompt.type === 'restore' ? 'Confirm Restore' : passwordPrompt.type === 'edittrip' || passwordPrompt.type === 'edittripcomplete' ? 'Confirm & Save Changes' : passwordPrompt.type === 'accept_transfer_trip' || passwordPrompt.type === 'accept_transfer_route' ? 'Accept Transfer' : passwordPrompt.type === 'decline_transfer_trip' || passwordPrompt.type === 'decline_transfer_route' ? 'Decline Transfer' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== EDIT TRIP MODAL (Driver Mode) ===== */}
      {editTripModal && (
        <EditTripModal
          trip={editTripModal}
          onClose={() => setEditTripModal(null)}
          onSave={handleSaveEditedTrip}
          driverMode
        />
      )}

      {/* ===== SMART CONTACT SELECTOR ===== */}
      {showContactSelector && (() => {
        const contacts = getContactsForTrip(showContactSelector);
        const warning = getContactWarning(showContactSelector, trips);
        const iconMap = { User, Shield, PhoneForwarded, AlertTriangle, Building, MapPin, Headphones, Route };
        return (
          <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 170 }} onClick={() => setShowContactSelector(null)}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="font-bold text-base text-slate-900">Contacts</h2>
                  <p className="text-xs text-slate-500">{showContactSelector.patient} · {to12hr(showContactSelector.time)}</p>
                </div>
                <button type="button" onClick={() => setShowContactSelector(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 cursor-pointer shrink-0">
                  <X size={16} className="text-slate-500" />
                </button>
              </div>

              {/* Warning */}
              {warning.show && (
                <div className={`mx-4 mt-3 rounded-2xl px-4 py-3 flex items-center gap-3 ${warning.severity === 'error' ? 'bg-rose-50 border border-rose-200' : warning.severity === 'warning' ? 'bg-amber-50 border border-amber-200' : 'bg-blue-50 border border-blue-200'}`}>
                  <AlertTriangle size={16} className={`shrink-0 ${warning.severity === 'error' ? 'text-rose-600' : warning.severity === 'warning' ? 'text-amber-600' : 'text-blue-600'}`} />
                  <p className={`text-sm font-medium ${warning.severity === 'error' ? 'text-rose-700' : warning.severity === 'warning' ? 'text-amber-700' : 'text-blue-700'}`}>{warning.message}</p>
                </div>
              )}

              {/* Primary Quick Call */}
              {contacts.length > 0 && (() => {
                const primary = contacts.find(c => c.isPrimary) || contacts[0];
                const ps = getContactRoleIcon(primary.role);
                const IconComp = iconMap[ps.icon] || User;
                return (
                  <div className="px-4 pt-3">
                    <button
                      type="button"
                      onClick={() => { handleCall(primary.phone, `${primary.label}: ${primary.name}`); setShowContactSelector(null); }}
                      className={`w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 active:scale-95 cursor-pointer shadow-sm ${ps.bg} ${ps.color} border ${ps.border}`}>
                      <IconComp size={18} /> Call {primary.label} — {formatPhoneDisplay(primary.phone)}
                    </button>
                  </div>
                );
              })()}

              {/* Contact List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {contacts.map((contact, idx) => {
                  const roleStyle = getContactRoleIcon(contact.role);
                  const actions = getContactRoleActions(contact.role);
                  const Icon = iconMap[roleStyle.icon] || User;
                  return (
                    <div key={idx} className={`bg-white rounded-2xl border-2 shadow-sm ${contact.isPrimary ? 'ring-2 ' + roleStyle.ring : 'border-slate-200'} p-4`}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${roleStyle.bg}`}>
                          <Icon size={20} className={roleStyle.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900 truncate">{contact.name}</span>
                            {contact.isPrimary && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-lg">PRIMARY</span>}
                          </div>
                          <p className="text-xs text-slate-500">{contact.label} · {formatPhoneDisplay(contact.phone)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { handleCall(contact.phone, `${contact.label}: ${contact.name}`); setShowContactSelector(null); }}
                          className="flex-1 h-10 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer">
                          <Phone size={14} /> {actions.callLabel}
                        </button>
                        {actions.smsLabel && (
                          <button
                            type="button"
                            onClick={() => { handleSMS(contact.phone, contact.name); setShowContactSelector(null); }}
                            className="flex-1 h-10 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer">
                            <MessageCircle size={14} /> {actions.smsLabel}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick Actions Footer */}
              <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3">
                <button
                  type="button"
                  onClick={() => { handleSmartCall(showContactSelector); setShowContactSelector(null); }}
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 cursor-pointer">
                  <Phone size={16} /> Quick Call Primary Contact
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== BOTTOM NAVIGATION ===== */}
      <nav className="bottom-nav">
        <div className="flex items-stretch justify-around px-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActiveTab = activeNav === item.id;
              return (
                <button key={item.id} onClick={() => setActiveNav(item.id)}
                  className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 transition-all duration-200 relative flex-1 min-h-[52px] ${
                    isActiveTab ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'
                  }`}>
                  <div className="relative">
                    <Icon size={22} strokeWidth={isActiveTab ? 2.5 : 1.5}
                      className={`transition-all duration-200 ${isActiveTab ? 'text-blue-600' : 'text-slate-400'}`}
                    />
                    {item.id === 'chat' && chatUnreadCount > 0 && (
                      <span className="absolute -top-1 -right-2 bg-rose-500 text-white text-[9px] font-bold min-w-[14px] h-4 px-1 rounded-full flex items-center justify-center leading-none shadow-sm">{chatUnreadCount > 99 ? '99+' : chatUnreadCount}</span>
                    )}
                  </div>
                  <span className={`text-[10px] tracking-wide transition-all leading-none ${isActiveTab ? 'text-blue-600 font-bold' : 'text-slate-400 font-medium'}`}>{item.label}</span>
                </button>
              );
            })}
          </div>
      </nav>

      {/* Offline Queue Indicator */}
      {offlineQueue.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-amber-600 text-white px-4 py-2 rounded-2xl shadow-lg text-xs font-bold flex items-center gap-2" style={{ zIndex: 100 }}>
          <WifiOff size={12} />
          {offlineQueue.length} pending sync
        </div>
      )}

      {/* ===== ROUTE SEQUENCER PAGE ===== */}
      {activeNav === 'sequencer' && (
        <div className="flex-1 overflow-hidden bg-[#F3F4F6] flex flex-col">
          <div className="flex-1 overflow-hidden">
            <Suspense fallback={<LazyFallback />}>
              <ErrorBoundary>
                <RouteSequencerApp key={sequencerKey}
                  trips={sequencerTripFilter ? trips.filter(t => sequencerTripFilter.includes(t.id)) : trips}
                  drivers={drivers}
                  currentUser={currentUser}
                  role={role}
                  me={me}
                  advanceWorkflow={advanceWorkflow}
                  initialStops={routePlanSequencerStops}
                  initialSequence={routePlanSequencerSequence}
                  initialOrigin={routePlanSequencerOrigin}
                  onRouteSaved={({ route, saveMode, validTripIds }) => {
                    if (!onAddAuditLog) return;
                    onAddAuditLog(
                      saveMode === 'recurring' ? 'Route Created' : 'Route Saved',
                      saveMode === 'recurring'
                        ? `${currentUser} saved recurring route "${route.name}" with ${route.sequence?.length || 0} stops.`
                        : `${currentUser} saved today's route "${route.name}" with ${validTripIds.length} synced trips.`,
                      saveMode === 'recurring' ? 'indigo' : 'amber'
                    );
                  }}
                  onApplyRoute={({ route, tripIds }) => {
                    (tripIds || []).forEach((tripId) => {
                      const trip = trips.find(t => t.id === tripId);
                      if (trip) advanceWorkflow(trip, 'Assigned', { driverId: me?.id || '', driverEmail: me?.email || '', driverName: me?.name || '' });
                    });
                    if (onAddAuditLog) {
                      onAddAuditLog('Route Applied', `${currentUser} applied route "${route.name}" to ${tripIds?.length || 0} trips.`, 'emerald');
                    }
                    setActiveNav('trips');
                    setRoutePlanSequencerStops(null);
                    setRoutePlanSequencerSequence(null);
                  }}
                />
              </ErrorBoundary>
            </Suspense>
          </div>
        </div>
      )}

      {/* Legs Detail Modal */}
      {legsDetailPatient && (() => {
        const patientName = legsDetailPatient;
        const legs = orderedTrips.filter(t => (t.patient || '').trim().toLowerCase() === patientName.trim().toLowerCase());
        return (
          <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 130 }} onClick={() => setLegsDetailPatient(null)}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="bg-white w-full max-w-lg rounded-3xl p-5 relative shadow-2xl max-h-[85vh] overflow-y-auto pointer-events-auto" style={{ zIndex: 10 }} onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-900">{patientName}</h3>
                <button type="button" onClick={() => setLegsDetailPatient(null)} className="p-1.5 bg-slate-100 rounded-xl text-slate-500 hover:bg-slate-200 cursor-pointer"><X size={16} /></button>
              </div>
              <p className="text-slate-500 text-xs font-semibold mb-4">{legs.length} leg{legs.length !== 1 ? 's' : ''}</p>
              <div className="space-y-2">
                {legs.map((leg, idx) => (
                  <div key={leg.id} className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-micro font-bold uppercase tracking-wider text-slate-500">Leg {idx + 1}</span>
                      <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${leg.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : leg.status === 'In Transit' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>{leg.status}</span>
                    </div>
                    <p className="text-slate-500 text-xs font-semibold mb-1">Booking: {leg.bookingId || '—'}</p>
                    <div className="space-y-1.5">
                      <div className="flex items-start gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-600">Pickup</p>
                          <p className="text-sm text-slate-500 truncate">{leg.pickup}</p>
                          <p className="text-xs text-slate-400">{leg.time ? to12hr(leg.time) : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-3 h-3 rounded-full bg-rose-500 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-600">Dropoff</p>
                          <p className="text-sm text-slate-500 truncate">{leg.dropoff}</p>
                        </div>
                      </div>
                    </div>
                    {leg.notes && <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">{leg.notes}</p>}
                    {leg.pickupPhone && (() => {
                      const contact = getContactsForTrip(leg).find(c => cleanPhone(c.phone) === cleanPhone(leg.pickupPhone));
                      const label = contact ? contact.label : 'Contact';
                      return (
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="text-micro font-bold uppercase tracking-wider text-slate-500">{label}</span>
                          <button type="button" onClick={() => handleCall(leg.pickupPhone, `${label}: ${leg.patient}`)} className="text-xs text-blue-600 font-bold flex items-center gap-1 hover:underline cursor-pointer">
                            <Phone size={10} /> {formatPhoneDisplay(leg.pickupPhone)}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== LEGS DETAILS MODAL ===== */}
      {showLegsModal && (() => {
        const statusColor = (s) => {
          if (s === 'Completed' || s === 'Arrived') return 'bg-emerald-100 text-emerald-700';
          if (s === 'Cancelled' || s === 'No Show') return 'bg-rose-100 text-rose-700';
          if (s === 'In Transit') return 'bg-blue-100 text-blue-700';
          return 'bg-slate-100 text-slate-700';
        };
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" style={{ zIndex: 140 }} onClick={() => setShowLegsModal(null)}>
            <div className="bg-white rounded-3xl w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between rounded-t-3xl z-10">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{showLegsModal[0]?.patient || 'Trip Legs'}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{showLegsModal.length} leg{showLegsModal.length !== 1 ? 's' : ''} today</p>
                </div>
                <button type="button" onClick={() => setShowLegsModal(null)} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-all cursor-pointer shrink-0">
                  <X size={16} />
                </button>
              </div>
              <div className="p-4 space-y-2">
                {showLegsModal.map((leg) => (
                  <div key={leg.id} className="border border-slate-100 rounded-xl p-3 hover:border-slate-200 transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-400 font-mono">#{leg.bookingId || leg.id}</span>
                        {leg.wheelchair && leg.wheelchair !== 'WLK' && (
                          <span className="text-[9px] font-bold bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded">{leg.wheelchair}</span>
                        )}
                      </div>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${statusColor(leg.status)}`}>{leg.status}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-start gap-2 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-1 bg-blue-500"></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-900 font-semibold leading-tight">{leg.pickupSite || 'Pickup'}</p>
                          <p className="text-slate-500 truncate leading-tight">{leg.pickup}</p>
                          {leg.pickupPhone && <p className="text-slate-400 text-[9px] font-mono mt-0.5">{leg.pickupPhone}</p>}
                        </div>
                      </div>
                      <div className="flex items-start gap-2 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-1 bg-emerald-500"></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-900 font-semibold leading-tight">{leg.dropoffSite || 'Dropoff'}</p>
                          <p className="text-slate-500 truncate leading-tight">{leg.dropoff}</p>
                          {leg.dropoffPhone && <p className="text-slate-400 text-[9px] font-mono mt-0.5">{leg.dropoffPhone}</p>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-[9px] text-slate-400">
                      {leg.time && <span>{leg.time}</span>}
                      {leg.distance && <><span>•</span><span>{leg.distance} mi</span></>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== GEOFENCE TOAST ===== */}
      {showToast && (
        <div className="fixed bottom-6 left-4 right-4 z-50 animate-slide-up">
          <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
              <MapPin size={20} className="text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">{showToast.message}</p>
            </div>
            {showToast.action === 'arrive-pickup' && (
              <button type="button" onClick={() => { setShowToast(null); handleArrivePickup(showToast.trip); }} className="px-4 py-2 bg-blue-500 rounded-xl text-xs font-bold hover:bg-blue-400 transition-all shrink-0 cursor-pointer">
                Arrive
              </button>
            )}
            {showToast.action === 'arrive-dropoff' && (
              <button type="button" onClick={() => { setShowToast(null); handleArriveDropoff(showToast.trip); }} className="px-4 py-2 bg-orange-500 rounded-xl text-xs font-bold hover:bg-orange-400 transition-all shrink-0 cursor-pointer">
                Arrive
              </button>
            )}
            <button type="button" onClick={() => setShowToast(null)} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 cursor-pointer">
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverPage;
