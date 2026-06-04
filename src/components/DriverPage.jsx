import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { tripMatchesTodayOrTomorrow, timeToMinutes, isTripLate } from '../utils/tripDate';
import { auth, db, doc, onSnapshot, setDoc, EmailAuthProvider, reauthenticateWithCredential, saveOdometerReading } from '../config/firebase';
import { optimizeRoute as aiOptimizeRoute } from '../config/ai';
import { getDistanceMiles } from '../config/maps';
import LiveRouteMap from './LiveRouteMap';
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
  Wifi, WifiOff, ArrowRight, Search,
  Repeat, Zap, X, Route,
  CheckSquare, Square, Map, BarChart3, Sun, Moon,
  Download, Trash2, FileText, AlertTriangle, Info,
  Copy, PhoneForwarded, Shield, Headphones, Building, Edit2
} from 'lucide-react';
import { openNavigation, showNavActionSheet, makeCall, sendSMS, showCallActionSheet } from '../utils/nativeActions';
import { impact } from '../utils/haptics';
import { isNativeShell } from '../utils/platform';
import { buildContactList, getPrimaryContact, getContactWarning, formatPhoneDisplay, cleanPhone, getContactRoleIcon, getContactRoleActions } from '../utils/smartContacts';

const RouteSequencerApp = lazy(() => import('./RouteSequencer'));
const LazyFallback = () => <div className="flex items-center justify-center p-12"><div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" /></div>;

const isWillCall = (trip) => {
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
  const driverScopedTrips = useMemo(
    () => (Array.isArray(trips) ? trips.filter(tripBelongsToCurrentDriver) : []),
    [trips, tripBelongsToCurrentDriver]
  );
  const userKey = (currentUser || 'anon').replace(/[^a-zA-Z0-9]/g, '_');
  const [activeNav, setActiveNav] = useState(() => {
    const savedNav = localStorage.getItem(`agape_drvNav_${userKey}`) || 'trips';
    return ['trips', 'tools', 'history', 'chat', 'settings'].includes(savedNav) ? savedNav : 'trips';
  });
  const [historyFilter, setHistoryFilter] = useState(() => localStorage.getItem(`agape_drvHistFilter_${userKey}`) || 'all');
  const [historySearch, setHistorySearch] = useState(() => localStorage.getItem(`agape_drvHistSearch_${userKey}`) || '');

  useEffect(() => {
    localStorage.setItem(`agape_drvNav_${userKey}`, activeNav);
    localStorage.setItem(`agape_drvHistFilter_${userKey}`, historyFilter);
    localStorage.setItem(`agape_drvHistSearch_${userKey}`, historySearch);
  }, [activeNav, historyFilter, historySearch, userKey]);
  const [selectedTrips, setSelectedTrips] = useState([]);
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
  const [showCompleteModal, setShowCompleteModal] = useState(null);
  const [completeOdometer, setCompleteOdometer] = useState('');
  const [completeError, setCompleteError] = useState('');
  const [departedTime, setDepartedTime] = useState('');
  const [arrivalDropoffTime, setArrivalDropoffTime] = useState('');
  const [showTripDetails, setShowTripDetails] = useState(null);
  const [historyExpandedId, setHistoryExpandedId] = useState(null);
  const [showToast, setShowToast] = useState(null);
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
  const [showSequencerModal, setShowSequencerModal] = useState(false);
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
  const [showContactSelector, setShowContactSelector] = useState(null);
  const [restorePrompt, setRestorePrompt] = useState(null);
  const [cancelPrompt, setCancelPrompt] = useState(null);
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
  const workflowScrollLockRef = useRef({ tripId: null, locked: false });

  const scrollTripsToTop = useCallback((behavior = 'smooth') => {
    const node = tripsScrollRef.current;
    if (node && typeof node.scrollTo === 'function') {
      node.scrollTo({ top: 0, behavior });
      return;
    }
    window.scrollTo({ top: 0, behavior });
  }, []);

  const engageWorkflowScrollLock = useCallback((tripId, behavior = 'smooth') => {
    workflowScrollLockRef.current = { tripId, locked: true };
    requestAnimationFrame(() => {
      scrollTripsToTop(behavior);
      setTimeout(() => scrollTripsToTop('auto'), behavior === 'smooth' ? 380 : 0);
    });
  }, [scrollTripsToTop]);

  const releaseWorkflowScrollLock = useCallback(() => {
    workflowScrollLockRef.current = { tripId: null, locked: false };
  }, []);

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
  }, [me?.id]);

  // Re-compute assignedSequence whenever templates, me, or trips change
  useEffect(() => {
    setAssignedSequence(getDriverActiveRoutePlan(routeTemplates, me, trips));
  }, [routeTemplates, me, trips]);

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

  // Count legs per patient for today
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
      if (['Completed','Cancelled','No Show'].includes(t.status)) return;
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
    if (steps[0]?.tripId) engageWorkflowScrollLock(steps[0].tripId);
    await updateAssignedRouteRecord({
      assignmentStatus: ROUTE_ASSIGNMENT_STATUS.IN_PROGRESS,
      driverAcknowledgedAt: assignedSequence.driverAcknowledgedAt || new Date().toISOString(),
      startedAt: new Date().toISOString(),
    }, 'Route Started', `${currentUser} started route "${assignedSequence.name || 'Assigned Route'}".`);
  }, [assignedSequence, currentUser, updateAssignedRouteRecord, engageWorkflowScrollLock]);

  const getUrgency = (trip) => {
    if (!trip || !trip.time || ['Completed','Cancelled','No Show'].includes(trip.status)) return 0;
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
    onUpdateTrip(undoableAction.trip.id, undoableAction.previousStatus, {});
    setUndoableAction(null);
    if (undoTimeoutRef.current) { clearTimeout(undoTimeoutRef.current); undoTimeoutRef.current = null; }
  };

  const revertTripStatus = (trip) => {
    const prevStatus = trip.status === 'Navigating Dropoff' ? 'In Transit' : trip.status === 'At Dropoff' ? 'In Transit' : trip.status === 'In Transit' ? 'At Pickup' : trip.status === 'At Pickup' ? 'In Progress' : trip.status === 'Navigating Pickup' ? 'In Progress' : trip.status === 'In Progress' ? 'Assigned' : trip.status === 'Arrived' ? 'In Transit' : null;
    if (!prevStatus) return;
    if (prevStatus === 'Assigned' || prevStatus === 'Unassigned') {
      releaseWorkflowScrollLock();
    } else {
      engageWorkflowScrollLock(trip.id, 'auto');
    }
    onUpdateTrip(trip.id, prevStatus, {});
  };

  const restoreHistoryTrip = (trip) => {
    const patientKey = (trip.patient || '').trim().toLowerCase();
    const relatedLegs = driverScopedTrips.filter(t => (t.patient || '').trim().toLowerCase() === patientKey && ['Completed','Cancelled','No Show'].includes(t.status));
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
      .filter(t => t.status === 'Completed' && t.dropoffOdometer)
      .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
    if (completed.length > 0) setLastOdometer(completed[0].dropoffOdometer);
  }, [driverScopedTrips, me?.id]);

  // GPS is mandatory — always active on mount
  useEffect(() => {
    if (navigator.geolocation) startGpsTracking();
    return () => { if (gpsWatchId.current) navigator.geolocation.clearWatch(gpsWatchId.current); };
  }, [me?.id]);

  // Clean up undo timeout on unmount
  useEffect(() => {
    return () => { if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current); };
  }, []);

  // Analytics calculation
  useEffect(() => {
    if (me?.clockedIn) {
      const completed = driverScopedTrips.filter(t => t.status === 'Completed');
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

  const getWorkflowSteps = (trip) => {
    const s = trip.status || '';
    return [
      { key: 'start', label: 'Start Trip', phase: 'pickup', done: ['In Progress','Navigating Pickup','At Pickup','In Transit','Navigating Dropoff','At Dropoff','Arrived','Completed'].includes(s) },
      { key: 'nav-pickup', label: 'Navigate to Pickup', phase: 'pickup', done: ['Navigating Pickup','At Pickup','In Transit','Navigating Dropoff','At Dropoff','Arrived','Completed'].includes(s) },
      { key: 'arrive-pickup', label: 'Arrive at Pickup', phase: 'pickup', done: ['At Pickup','In Transit','Navigating Dropoff','At Dropoff','Arrived','Completed'].includes(s) },
      { key: 'begin-transport', label: 'Begin Transport', phase: 'pickup', done: ['In Transit','Navigating Dropoff','At Dropoff','Arrived','Completed'].includes(s) },
      { key: 'nav-dropoff', label: 'Navigate to Dropoff', phase: 'dropoff', done: ['Navigating Dropoff','At Dropoff','Arrived','Completed'].includes(s) },
      { key: 'arrive-dropoff', label: 'Arrive at Dropoff', phase: 'dropoff', done: ['At Dropoff','Arrived','Completed'].includes(s) },
      { key: 'complete', label: 'Complete Trip', phase: 'dropoff', done: ['Completed'].includes(s) },
    ];
  };
  const getCurrentWorkflowStep = (trip) => getWorkflowSteps(trip).findIndex(s => !s.done);

  const getTodayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

  const myTrips = useMemo(() => driverScopedTrips
    .filter(t => tripMatchesTodayOrTomorrow(t.date))
    .sort((a, b) => {
      const today = getTodayStr();
      const aToday = a.date === today ? 0 : 1;
      const bToday = b.date === today ? 0 : 1;
      if (aToday !== bToday) return aToday - bToday;
      return timeToMinutes(a.time) - timeToMinutes(b.time);
    }),
    [driverScopedTrips]
  );

  const { reroutedTrips, completedTrips, noShowTrips, cancelledTrips, allHistory } = useMemo(() => {
    const rerouted = driverScopedTrips.filter(t => t.status === 'Rerouted');
    const completed = driverScopedTrips.filter(t => t.status === 'Completed');
    const noShow = driverScopedTrips.filter(t => t.status === 'No Show');
    const cancelled = driverScopedTrips.filter(t => t.status === 'Cancelled');
    return {
      reroutedTrips: rerouted,
      completedTrips: completed,
      noShowTrips: noShow,
      cancelledTrips: cancelled,
      allHistory: [...rerouted, ...completed, ...noShow, ...cancelled].sort((a, b) => {
        const da = a.completedAt || a.date || '';
        const db = b.completedAt || b.date || '';
        return db.localeCompare(da);
      })
    };
  }, [driverScopedTrips]);

  const activeTrips = useMemo(() => myTrips.filter(t => !['Completed', 'Cancelled', 'No Show'].includes(t.status)), [myTrips]);

  const orderedTrips = useMemo(() => [...activeTrips].sort((a, b) => {
    if (guidedMode && guidedSteps && guidedSteps[guidedStepIndex]) {
      if (a.id === guidedSteps[guidedStepIndex].tripId && b.id !== guidedSteps[guidedStepIndex].tripId) return -1;
      if (b.id === guidedSteps[guidedStepIndex].tripId && a.id !== guidedSteps[guidedStepIndex].tripId) return 1;
    }
    const inProgressStatuses = [
      'In Mission', 'En Route', 'In Progress', 'Navigating Pickup', 'At Pickup',
      'In Transit', 'Navigating Dropoff', 'At Dropoff', 'Arrived', 'Arrived PU', 'Arrived DO',
    ];
    const aInProgress = inProgressStatuses.includes(a.status);
    const bInProgress = inProgressStatuses.includes(b.status);
    if (aInProgress && !bInProgress) return -1;
    if (bInProgress && !aInProgress) return 1;
    if (aiSequence && aiSequence.length > 0) {
      const aiA = aiSequence.indexOf(a.id);
      const aiB = aiSequence.indexOf(b.id);
      if (aiA !== -1 || aiB !== -1) {
        if (aiA === -1) return 1;
        if (aiB === -1) return -1;
        return aiA - aiB;
      }
    }
    const aWC = isWillCall(a);
    const bWC = isWillCall(b);
    if (aWC !== bWC) return aWC ? 1 : -1;
    const urgencyDiff = getUrgency(b) - getUrgency(a);
    if (urgencyDiff !== 0) return urgencyDiff;
    return timeToMinutes(a.time) - timeToMinutes(b.time);
  }), [activeTrips, guidedMode, guidedSteps, guidedStepIndex, aiSequence]);

  const timedTrips = useMemo(() => orderedTrips.filter(t => !isWillCall(t)), [orderedTrips]);
  const willCallTrips = useMemo(() => orderedTrips.filter(t => isWillCall(t)), [orderedTrips]);

  useEffect(() => {
    const { tripId, locked } = workflowScrollLockRef.current;
    if (!locked || !tripId) return;
    const stillActive = orderedTrips.some((trip) => trip.id === tripId);
    if (!stillActive) {
      releaseWorkflowScrollLock();
      return;
    }
    requestAnimationFrame(() => scrollTripsToTop('auto'));
  }, [orderedTrips, guidedMode, guidedStepIndex, releaseWorkflowScrollLock, scrollTripsToTop]);

  const isClockedIn = me?.clockedIn || false;

  // Auto-re-optimize when trips or GPS changes
  useEffect(() => {
    if (selectedTrips.length >= 2 && positionRef.current) {
      const timer = setTimeout(() => {
        runAiOptimization(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [selectedTrips.length, activeTrips.length]);

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
    const pos = positionRef.current;
    if (!pos?.lat || !pos?.lng || !trip?.pickup) return;
    try {
      const origin = `${pos.lat},${pos.lng}`;
      const dest = trip.pickup;
      const distMiles = await getDistanceMiles(
        { lat: pos.lat, lng: pos.lng },
        trip.pickupLat ? { lat: trip.pickupLat, lng: trip.pickupLng } : dest
      );
      if (distMiles !== null) {
        const avgSpeed = 30;
        const etaMinutes = (distMiles / avgSpeed) * 60;
        etasRef.current[trip.id] = etaMinutes;
        setEtas(prev => ({ ...prev, [trip.id]: etaMinutes }));
      }
    } catch {}
  }, []);

  // Batch update ETAs (limit to first 3 trips, 30s interval to avoid rate limits)
  useEffect(() => {
    if (activeTrips.length === 0) return;
    const timer = setInterval(() => {
      activeTrips.slice(0, 3).forEach(t => calculateEta(t));
    }, 30000);
    activeTrips.slice(0, 3).forEach(t => calculateEta(t));
    return () => clearInterval(timer);
  }, [activeTrips]);

  // Geofence proximity detection — check every 15s if near pickup/dropoff
  useEffect(() => {
    if (activeTrips.length === 0) return;
    const timer = setInterval(() => {
      const pos = positionRef.current;
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
  }, [activeTrips]);

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

  const filteredHistory = useMemo(() => allHistory.filter(t => {
    const matchFilter = historyFilter === 'all' ? true :
      historyFilter === 'completed' ? t.status === 'Completed' :
      historyFilter === 'noshow' ? t.status === 'No Show' :
      historyFilter === 'cancelled' ? t.status === 'Cancelled' :
      t.status === 'Rerouted';
    if (!matchFilter) return false;
    if (!historySearch) return true;
    const q = historySearch.toLowerCase();
    return (t.patient || '').toLowerCase().includes(q) ||
      (t.bookingId || '').toLowerCase().includes(q) ||
      (t.pickup || '').toLowerCase().includes(q) ||
      (t.dropoff || '').toLowerCase().includes(q);
  }), [allHistory, historyFilter, historySearch]);

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

  // Auto-run AI on mount to pre-sort trips
  useEffect(() => {
    if (activeTrips.length >= 2 && !aiSequence) {
      const allIds = activeTrips.map(t => t.id);
      setSelectedTrips(allIds);
      setTimeout(() => runAiOptimization(true), 1000);
    }
  }, [activeTrips.length]);

  // Auto-advance guided mode when current trip reaches terminal status
  useEffect(() => {
    if (!guidedMode || !guidedSteps || guidedSteps.length === 0 || guidedStepIndex >= guidedSteps.length) return;
    const currentStep = guidedSteps[guidedStepIndex];
    const trip = trips.find(t => t.id === currentStep.tripId);
    if (!trip) return;

    let stepCompleted = false;
    if (currentStep.type === 'PU') {
      if (['In Transit', 'Navigating Dropoff', 'At Dropoff', 'Completed', 'Cancelled', 'No Show'].includes(trip.status)) {
        stepCompleted = true;
      }
    } else {
      if (['Completed', 'Cancelled', 'No Show'].includes(trip.status)) {
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
        releaseWorkflowScrollLock();
        setGuidedMode(false);
        setGuidedSteps([]);
        setAiSequence(null);
        setAiSuggestions([]);
        setSelectedTrips([]);
        setGuidedStepIndex(0);
        guidedLastAdvance.current = -1;
      } else {
        const nextStep = guidedSteps[nextIndex];
        if (nextStep?.tripId) engageWorkflowScrollLock(nextStep.tripId, 'auto');
        setGuidedStepIndex(nextIndex);
      }
    }
  }, [trips, guidedMode, guidedStepIndex, guidedSteps, assignedSequence?.id, assignedSequence?.name, currentUser, updateAssignedRouteRecord, engageWorkflowScrollLock, releaseWorkflowScrollLock]);


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

  const handleNavigateToPickup = (trip) => {
    impact('heavy');
    engageWorkflowScrollLock(trip.id);
    onUpdateTrip(trip.id, 'Navigating Pickup', {});
    preloadGeofence(trip);
    openInNavApp(trip.pickup, navApp);
  };

  const handleNavigateToDropoff = (trip) => {
    impact('heavy');
    preloadGeofence(trip);
    engageWorkflowScrollLock(trip.id);
    onUpdateTrip(trip.id, 'Navigating Dropoff', {});
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
    engageWorkflowScrollLock(showOdometerPrompt.id);
    onUpdateTrip(showOdometerPrompt.id, 'At Pickup', {
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
    engageWorkflowScrollLock(trip.id);
    onUpdateTrip(trip.id, 'At Dropoff', {
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
    engageWorkflowScrollLock(showArrivalConfirm.id);
    onUpdateTrip(showArrivalConfirm.id, 'At Pickup', {
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
    engageWorkflowScrollLock(showSignatureConfirm.id);
    onUpdateTrip(showSignatureConfirm.id, 'In Transit', {
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
      !['Completed', 'Cancelled', 'No Show'].includes(t.status)
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
      !['Completed', 'Cancelled', 'No Show'].includes(t.status)
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
      !['Completed', 'Cancelled', 'No Show'].includes(t.status)
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
      if (type === 'dismiss_route' && dismissSequence) {
        await updateAssignedRouteRecord({
          assignmentStatus: ROUTE_ASSIGNMENT_STATUS.DISMISSED,
          dismissedAt: new Date().toISOString(),
        }, 'Route Dismissed', `${currentUser} dismissed route "${dismissSequence.name || 'Assigned Route'}".`);
      } else if (type === 'edittrip') {
        if (editedData) {
          onUpdateTrip(trip.id, trip.status, editedData);
          if (onAddAuditLog) {
            onAddAuditLog('Trip Updated', `${currentUser} updated trip details for ${trip.patient}.`, 'blue');
          }
        }
      } else if (type === 'edittripcomplete') {
        if (editedData) {
          const odo = parseInt(editedData.dropoffOdometer, 10) || 0;
          onUpdateTrip(trip.id, 'Completed', { ...editedData, completedVehicle: me?.vehicle || '' });
          if (onAddAuditLog) {
            onAddAuditLog('Trip Completed via Edit', `${currentUser} completed trip for ${trip.patient} (odo: ${odo.toLocaleString()} mi).`, 'emerald');
          }
          setLastOdometer(odo);
          setAnalytics(prev => ({ ...prev, tripsCompleted: prev.tripsCompleted + 1 }));
          if (navigator.onLine) {
            if (role !== 'driver') saveOdometerReading(trip.id, odo).catch(() => {});
          }
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
          onUpdateTrip(leg.id, prevStatus, {});
        });
      } else {
        const newStatus = type === 'noshow' ? 'No Show' : type === 'reroute' ? 'Rerouted' : 'Cancelled';
        const legsToUpdate = selectedLegIds && selectedLegIds.length > 0
          ? trips.filter(t => selectedLegIds.includes(t.id))
          : [trip];
        legsToUpdate.forEach(leg => {
          setUndoable(leg, leg.status, newStatus);
          onUpdateTrip(leg.id, newStatus, {
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
    onUpdateTrip(showCompleteModal.id, 'Completed', {
      dropoffOdometer: odo,
      completedAt: now,
      departedPickupTime: toIso(departedTime),
      arrivalDropoffTime: showCompleteModal.arrivalDropoffTime ? showCompleteModal.arrivalDropoffTime : toIso(arrivalDropoffTime),
      completedVehicle: me?.vehicle || '',
    });
    releaseWorkflowScrollLock();
    setLastOdometer(odo);
    setAnalytics(prev => ({ ...prev, tripsCompleted: prev.tripsCompleted + 1 }));
    setShowCompleteModal(null);
    setCompleteOdometer('');
    setCompleteError('');

    // Save odometer to Firestore directly
    if (navigator.onLine) {
      if (role !== 'driver') saveOdometerReading(showCompleteModal.id, odo).catch(() => {});
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
        <div ref={tripsScrollRef} className="flex-1 overflow-y-auto pb-28 px-3 pt-2 space-y-2 bg-[#F3F4F6]" style={{ overflowAnchor: 'none', scrollBehavior: 'smooth' }}>


          {/* Offline Banner */}
          {!isOnline && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 flex items-center gap-2">
              <WifiOff size={14} className="text-amber-600 shrink-0" />
              <p className="text-xs font-semibold text-amber-800">You're offline. Changes will sync when connection returns.</p>
            </div>
          )}
          {!isClockedIn && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 flex items-center gap-2">
              <WifiOff size={14} className="text-amber-600 shrink-0" />
              <p className="text-xs font-medium text-amber-700">GPS sharing is off. Clock in to enable live trip updates.</p>
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
                        if (!firstTrip?.time) return null;
                        return (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <Clock size={11} className="text-purple-500" />
                            <span className="text-xs font-black text-purple-800">{to12hr(firstTrip.time)}</span>
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
                      if (!t) return null;
                      return (
                        <div key={idx} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-100 shadow-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">{idx + 1}</span>
                            <span className="text-xs font-bold text-slate-800 truncate">{t.patient}</span>
                            <span className="text-[10px] font-semibold text-slate-500 shrink-0">({s.type === 'PU' ? 'Pickup' : 'Dropoff'})</span>
                          </div>
                          <span className="text-sm font-black text-purple-700 shrink-0 ml-2">{to12hr(t.time)}</span>
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
            const currentTrip = trips.find(t => t.id === currentStep.tripId);
            const nextStep = guidedStepIndex + 1 < guidedSteps.length ? guidedSteps[guidedStepIndex + 1] : null;
            const nextTrip = nextStep ? trips.find(t => t.id === nextStep.tripId) : null;
            const pct = Math.round((guidedStepIndex / guidedSteps.length) * 100);
            return (
              <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-xl p-3 shadow-md shadow-indigo-200/40 sticky top-0" style={{ zIndex: 10 }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-white/20 rounded-lg flex items-center justify-center text-xs font-black text-white">{guidedStepIndex + 1}</span>
                    <span className="text-xs font-bold text-white/80 uppercase tracking-wider">of {guidedSteps.length}</span>
                  </div>
                  <button onClick={() => { setGuidedMode(false); }} className="text-xs text-white/60 font-bold uppercase hover:text-white/90">Exit</button>
                </div>
                <div className="h-1 bg-white/20 rounded-full overflow-hidden mb-1.5">
                  <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-white truncate flex-1 min-w-0 flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] uppercase tracking-wider">{currentStep.type === 'PU' ? 'Pickup' : 'Dropoff'}</span>
                    <span className="truncate">{currentTrip?.patient || 'Loading...'}</span>
                    <span className="text-white/60 font-medium ml-1 text-xs shrink-0">· {currentTrip ? (['Assigned','Unassigned'].includes(currentTrip.status) ? 'Not started' : currentTrip.status) : ''}</span>
                  </p>
                  {nextStep && nextTrip && (
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
          <div className="flex items-center justify-between px-1 pt-1">
            <div>
              <h3 className="text-micro font-bold uppercase tracking-wider text-slate-500">Today & Tomorrow</h3>
              <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Live trip manifest</p>
            </div>
            <div className="flex items-center gap-2">
              {onAddTrip && (
                  <button
                    onClick={() => setShowAddTripModal && setShowAddTripModal(true)}
                    className="text-[10px] text-white font-bold flex items-center gap-1 active:scale-95 bg-gradient-to-r from-blue-600 to-indigo-600 px-2.5 py-1 rounded-lg shadow-sm"
                >
                  <span className="text-sm leading-none">+</span> Add Trip
                </button>
              )}
              {activeTrips.length > 0 && (
                <button onClick={exportDailyLog} className="text-xs text-blue-600 font-bold flex items-center gap-1 active:scale-95">
                  <Download size={10} /> Export
                </button>
              )}
              <span className="text-xs text-slate-300 font-medium">{activeTrips.length} trip{activeTrips.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Trip Cards */}
          {orderedTrips.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm p-10 text-center mt-2">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-[2rem] flex items-center justify-center mx-auto mb-5 shadow-inner">
                <CheckCircle2 size={36} className="text-emerald-400" />
              </div>
              <h3 className="text-lg font-black text-slate-900">All Clear</h3>
              <p className="text-slate-500 text-xs font-semibold mt-1.5 max-w-[200px] mx-auto leading-relaxed">No trips assigned. Your manifest is up to date.</p>
            </div>
          ) : guidedMode && guidedSteps && guidedSteps.length > 0 ? (
            <div className="space-y-2 pb-6 relative px-2 mt-2">
              <div className="absolute left-[33px] top-6 bottom-6 w-[2px] bg-slate-200 rounded-full" />
              {guidedSteps.map((step, index) => {
                const trip = trips.find(t => t.id === step.tripId);
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
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${labelColor}`}>
                        {isDropoffPhase ? 'Dropoff Phase' : 'Pickup Phase'}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500">
                        Step {Math.min(currentStepIdx + 1, totalGuidedSteps)} of {totalGuidedSteps}
                      </span>
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
                                return renderPrimaryBtn('Start Trip', <Play size={14} />, 'bg-blue-600 hover:bg-blue-700', () => { impact('heavy'); engageWorkflowScrollLock(trip.id); onUpdateTrip(trip.id, 'In Progress', { startedAt: new Date().toISOString() }); });
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
                const isTerminal = ['Completed', 'Cancelled', 'No Show'].includes(trip.status);
                const s = trip.status || '';

                const workflowSteps = [
                  { key: 'start', label: 'Start Trip', phase: 'pickup', done: ['In Progress','Navigating Pickup','At Pickup','In Transit','Navigating Dropoff','At Dropoff','Arrived','Completed'].includes(s) },
                  { key: 'nav-pickup', label: 'Navigate to Pickup', phase: 'pickup', done: ['Navigating Pickup','At Pickup','In Transit','Navigating Dropoff','At Dropoff','Arrived','Completed'].includes(s) },
                  { key: 'arrive-pickup', label: 'Arrive at Pickup', phase: 'pickup', done: ['At Pickup','In Transit','Navigating Dropoff','At Dropoff','Arrived','Completed'].includes(s) },
                  { key: 'begin-transport', label: 'Begin Transport', phase: 'pickup', done: ['In Transit','Navigating Dropoff','At Dropoff','Arrived','Completed'].includes(s) },
                  { key: 'nav-dropoff', label: 'Navigate to Dropoff', phase: 'dropoff', done: ['Navigating Dropoff','At Dropoff','Arrived','Completed'].includes(s) },
                  { key: 'arrive-dropoff', label: 'Arrive at Dropoff', phase: 'dropoff', done: ['At Dropoff','Arrived','Completed'].includes(s) },
                  { key: 'complete', label: 'Complete Trip', phase: 'dropoff', done: ['Completed'].includes(s) },
                ];
                const currentStepIdx = workflowSteps.findIndex(s => !s.done);
                const totalSteps = workflowSteps.length;
                const isDropoffPhase = workflowSteps[currentStepIdx]?.phase === 'dropoff';
                const activeBarColor = isDropoffPhase ? 'bg-orange-500' : 'bg-blue-500';
                const doneBarColor = 'bg-emerald-400';

                const getPrimaryAction = () => {
                  if (trip.status === 'Assigned' || trip.status === 'Unassigned') return { label: 'Start Trip', icon: <Play size={14} />, gradient: 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/25', phase: 'pickup', onClick: () => { impact('heavy'); engageWorkflowScrollLock(trip.id); onUpdateTrip(trip.id, 'In Progress', { startedAt: new Date().toISOString() }); } };
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
                            <div className="flex items-center justify-between mb-2">
                              <span className={`text-xs font-bold uppercase tracking-wider ${labelColor}`}>
                                {isDropoffPhase ? 'Dropoff Phase' : 'Pickup Phase'}
                              </span>
                              <span className="text-xs font-bold text-slate-500">
                                Step {Math.min(currentStepIdx + 1, totalSteps)} of {totalSteps}
                              </span>
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6" style={{ zIndex: 120 }}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl relative border border-white/20 pointer-events-auto" style={{ zIndex: 10 }}>
            <div className="flex items-start justify-between mb-6">
              <div className="text-center flex-1">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-600 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-200/50">
                  <MapPin size={28} className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">Arrived at Pickup</h3>
                <p className="text-sm text-slate-500 mt-1 font-medium">{showOdometerPrompt.patient} — {to12hr(showOdometerPrompt.time)}</p>
                {lastOdometer > 0 && (
                  <p className="text-sm text-slate-400 mt-2">Current odometer: <strong className="text-slate-700">{lastOdometer?.toLocaleString()} mi</strong></p>
                )}
              </div>
              <button type="button" onClick={() => setShowOdometerPrompt(null)} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center active:scale-90 ml-2 shrink-0 cursor-pointer"><X size={16} className="text-slate-500" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-micro font-bold uppercase tracking-wider text-slate-500">Current Odometer (mi)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={odometerValue}
                  onChange={(e) => setOdometerValue(e.target.value)}
                  placeholder='Enter full odometer reading'
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xl text-center focus:border-blue-500 outline-none"
                  autoFocus
                />
                {lastOdometer > 0 && odometerValue && parseInt(odometerValue, 10) < lastOdometer && (
                  <p className="text-sm text-amber-700 font-semibold mt-2 text-center bg-amber-50 rounded-xl px-4 py-3 border border-amber-200">
                    {parseInt(odometerValue, 10).toLocaleString()} mi is less than last reading of {lastOdometer.toLocaleString()} mi. You can continue if you're sure.
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowOdometerPrompt(null)} className="flex-1 py-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">Cancel</button>
                <button type="button" onClick={submitOdometer} disabled={!odometerValue} className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all disabled:opacity-40 cursor-pointer">Confirm Arrival</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== ARRIVAL CONFIRM MODAL ===== */}
      {showArrivalConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 120 }}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl relative border border-white/20 pointer-events-auto" style={{ zIndex: 10 }}>
            <div className="flex items-start justify-between mb-5">
              <div className="text-center flex-1">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-600 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-600/20">
                  <MapPin size={28} className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">Arrived at Pickup</h3>
                <p className="text-sm text-slate-500 mt-1 font-medium">{showArrivalConfirm.patient}</p>
              </div>
              <button type="button" onClick={() => setShowArrivalConfirm(null)} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center active:scale-90 ml-2 shrink-0 cursor-pointer"><X size={16} className="text-slate-500" /></button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-5 mb-4 space-y-3">
              <div>
                <label className="text-micro font-bold uppercase tracking-wider text-slate-500">Odometer at Arrival (mi)</label>
                <input type="number" inputMode="numeric" value={arrivalOdometer} onChange={e => setArrivalOdometer(e.target.value)}
                  className="w-full mt-1.5 p-3 bg-white border border-slate-200 rounded-xl font-bold text-base text-center focus:border-blue-500 outline-none"
                />
              </div>
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
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-3">
                  <Info size={16} className="shrink-0" />
                  <span className="font-medium">Confirm arrival details before proceeding.</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setShowArrivalConfirm(null)} className="flex-1 py-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">Back</button>
              <button type="button" onClick={confirmArrival} className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all cursor-pointer">Confirm Arrival</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== SIGNATURE CONFIRM MODAL (Before Heading to Dropoff) ===== */}
      {showSignatureConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 120 }}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl relative border border-white/20 pointer-events-auto" style={{ zIndex: 10 }}>
            <div className="flex items-start justify-between mb-5">
              <div className="text-center flex-1">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-600 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-600/20">
                  <Check size={28} className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">Begin Transport</h3>
                <p className="text-sm text-slate-500 mt-1 font-medium">{showSignatureConfirm.patient}</p>
              </div>
              <button type="button" onClick={() => { setShowSignatureConfirm(null); setSignatureConfirmed(false); }} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center active:scale-90 ml-2 shrink-0 cursor-pointer"><X size={16} className="text-slate-500" /></button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-5 mb-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3">
                <Info size={16} className="shrink-0" />
                <span className="font-medium">Obtain client signature before heading to dropoff.</span>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1.5">Signature Required</p>
                <button type="button" onClick={() => setSignatureConfirmed(!signatureConfirmed)} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition cursor-pointer ${signatureConfirmed ? 'border-green-200 bg-green-50' : 'border-blue-100 bg-white'}`}>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${signatureConfirmed ? 'bg-green-500 border-green-500' : 'border-slate-300'}`}>
                    {signatureConfirmed && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-sm text-slate-600 font-medium">Client signature obtained</span>
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => { setShowSignatureConfirm(null); setSignatureConfirmed(false); }} className="flex-1 py-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">Back</button>
              <button type="button" onClick={confirmSignatureAndBegin} disabled={!signatureConfirmed} className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all disabled:opacity-40 cursor-pointer">Confirm & Begin</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== COMPLETE TRIP MODAL ===== */}
      {showCompleteModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 120 }}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl relative border border-white/20 pointer-events-auto" style={{ zIndex: 10 }}>
            <div className="text-center mb-5">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-600 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-600/20">
                <Check size={28} className="text-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Complete Trip</h3>
              <p className="text-sm text-slate-500 mt-1 font-medium">{showCompleteModal.patient} — {showCompleteModal.bookingId || ''}</p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-5 mb-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-xs text-emerald-600 font-bold uppercase">Pickup Odometer</span>
                <span className="text-sm font-bold text-emerald-700">{showCompleteModal.pickupOdometer?.toLocaleString() || '—'} mi</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-slate-400 font-bold uppercase">Started At</span>
                <span className="text-sm font-bold text-slate-800">{showCompleteModal.startTime ? new Date(showCompleteModal.startTime).toLocaleTimeString() : '—'}</span>
              </div>
              <div>
                <label className="text-micro font-bold uppercase tracking-wider text-slate-500">Departed Pickup Time</label>
                <input type="time" value={departedTime} onChange={(e) => setDepartedTime(e.target.value)}
                  className="w-full p-3.5 bg-white border border-slate-200 rounded-xl font-bold text-base text-center focus:border-blue-500 outline-none mt-1.5" />
              </div>
              <div>
                <label className="text-micro font-bold uppercase tracking-wider text-slate-500">Arrival Dropoff Time</label>
                <input type="time" value={arrivalDropoffTime} onChange={(e) => setArrivalDropoffTime(e.target.value)}
                  className="w-full p-3.5 bg-white border border-slate-200 rounded-xl font-bold text-base text-center focus:border-blue-500 outline-none mt-1.5" />
              </div>
              <div>
                <label className="text-micro font-bold uppercase tracking-wider text-rose-600">Final Odometer (mi)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={completeOdometer}
                  onChange={(e) => { setCompleteOdometer(e.target.value); setCompleteError(''); }}
                  placeholder="Enter final odometer"
                  className="w-full p-3.5 bg-white border border-slate-200 rounded-xl font-bold text-base text-center focus:border-blue-500 outline-none mt-1.5"
                  autoFocus
                />
                {!completeOdometer && (
                  <p className="mt-2 text-center text-[11px] font-semibold text-slate-500">
                    Enter a final odometer reading to enable completion.
                  </p>
                )}
              </div>
              {completeError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-700">
                  {completeError}
                </p>
              )}
              {showCompleteModal.pickupOdometer && completeOdometer && (
                <div className="text-center text-sm text-blue-600 font-bold">
                  Distance: {(parseInt(completeOdometer) - (showCompleteModal.pickupOdometer || 0)).toLocaleString()} mi
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => { setShowCompleteModal(null); setCompleteError(''); }} className="flex-1 py-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">Cancel</button>
              <button type="button" onClick={submitComplete} disabled={!completeOdometer || Number(completeOdometer) <= 0} className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all disabled:opacity-40 cursor-pointer">Complete Trip</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== FULL-SCREEN TRIP DETAILS ===== */}
      {showTripDetails && (
        <div className="fixed inset-0 bg-white flex flex-col animate-slide-up" style={{ zIndex: 130 }}>
          <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex-1">
              <h2 className="font-bold text-sm text-slate-900 leading-tight">{showTripDetails.patient}</h2>
              <p className="text-xs text-slate-400">{showTripDetails.bookingId || '—'}</p>
            </div>
            <button type="button" onClick={() => setShowTripDetails(null)} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center active:scale-90 cursor-pointer"><X size={18} /></button>
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
      )}

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
          onOpenSequencer={() => setShowSequencerModal(true)}
          requestAuthAction={requestAuthAction}
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

          <div className="relative mb-3 px-1">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search by patient, booking ID, address..." value={historySearch} onChange={(e) => setHistorySearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl font-medium text-xs outline-none focus:border-blue-400" />
            {historySearch && <button onClick={() => setHistorySearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X size={14} /></button>}
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
                          <span className="text-sm font-bold text-emerald-600">{to12hr(trip.time)}</span>
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${s.bg}`}>{trip.status}</span>
                          {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                    <div className="border-t border-slate-100">
                      <div className="p-3 space-y-3">
                        {trip.pickup && (
                        <div className="flex items-center gap-2">
                          <ArrowRight size={10} className="text-emerald-500 shrink-0" />
                          <span className="text-xs text-emerald-600 font-medium break-words">{trip.pickup}</span>
                        </div>
                        )}
                        {trip.dropoff && (
                        <div className="flex items-center gap-2">
                          <ArrowRight size={10} className="text-rose-500 shrink-0" />
                          <span className="text-xs text-rose-600 font-medium break-words">{trip.dropoff}</span>
                        </div>
                        )}
                        {(trip.pickupOdometer || trip.dropoffOdometer) && (
                        <div className="flex items-center gap-3 text-xs font-semibold flex-wrap">
                          {trip.pickupOdometer && <span className="text-emerald-600">Start: {Number(trip.pickupOdometer).toLocaleString()} mi</span>}
                          {trip.dropoffOdometer && <span className="text-rose-600">End: {Number(trip.dropoffOdometer).toLocaleString()} mi</span>}
                          {trip.pickupOdometer && trip.dropoffOdometer && (
                            <span className="text-blue-500">+{Math.max(0, Number(trip.dropoffOdometer) - Number(trip.pickupOdometer)).toLocaleString()} mi</span>
                          )}
                        </div>
                        )}
                        {trip.distance && (
                        <p className="text-xs text-slate-500 font-semibold">Distance: {trip.distance} mi</p>
                        )}
                        {trip.status === 'Rerouted' && trip.cancellationReason && (
                        <div className="bg-purple-50 rounded-xl px-3 py-2 border border-purple-200">
                          <p className="text-[10px] uppercase tracking-wider text-purple-500 font-bold">Reroute Reason</p>
                          <p className="text-xs text-slate-700 mt-0.5">{trip.cancellationReason}</p>
                          {trip.cancelledBy && <p className="text-[10px] text-slate-400 mt-0.5">by {trip.cancelledBy}</p>}
                        </div>
                        )}
                        {trip.completedAt && (
                        <p className="text-[10px] text-slate-400">{new Date(trip.completedAt).toLocaleString()}</p>
                        )}
                      </div>
                      <div className="px-3 pb-3 flex gap-2">
                        <button type="button" onClick={() => setShowTripDetails(trip)} className="flex-1 h-9 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs"><FileText size={12} /> Details</button>
                        <button type="button" onClick={() => restoreHistoryTrip(trip)} className="flex-1 h-9 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs"><RotateCcw size={12} /> Restore</button>
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
        <div className="flex-1 flex flex-col bg-white">
          <ChatPage currentUser={currentUser} role={role} drivers={allDrivers || drivers} dispatchers={dispatchers} />
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
                  <button onClick={handleStatusToggle} className={`px-4 h-9 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border ${isClockedIn ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-600' : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'}`}>
                    {isClockedIn ? 'Go Offline' : 'Go Online'}
                  </button>
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
                <div>
                  <p className="text-micro font-bold uppercase tracking-wider text-slate-500">Odometer</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{me?.odometer?.toLocaleString() || 0} <span className="text-sm font-medium text-slate-400">mi</span></p>
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
                  { value: 'system', label: 'Auto', icon: Settings },
                ].map((option) => {
                  const Icon = option.icon;
                  const active = appSettings?.theme === option.value;
                  return (
                    <button key={option.value}
                      onClick={() => onUpdateAppSettings?.({ theme: option.value })}
                      className={`p-3 rounded-xl border text-left transition ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 hover:border-slate-300 text-slate-700'}`}
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
                    { value: 'xs', label: 'Dense' },
                    { value: 'sm', label: 'Compact' },
                    { value: 'md', label: 'Standard' },
                    { value: 'lg', label: 'Large' },
                    { value: 'xl', label: 'XL' },
                    { value: 'xxl', label: 'Huge' },
                    { value: 'driver', label: 'Driver' },
                  ].map((option) => {
                    const active = appSettings?.fontScale === option.value;
                    return (
                      <button key={option.value}
                        onClick={() => onUpdateAppSettings?.({ fontScale: option.value })}
                        className={`p-3 rounded-xl border font-bold text-sm transition ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 hover:border-slate-300 text-slate-700'}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
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
        const gradientFrom = cancelPrompt.type === 'noshow' ? 'from-orange-500 to-amber-600' : cancelPrompt.type === 'reroute' ? 'from-purple-600 to-purple-500' : 'from-rose-600 to-rose-500';
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-6" style={{ zIndex: 140 }} onClick={() => { setCancelPrompt(null); setSelectedLegsForAction(new Set()); }}>
            <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl relative overflow-hidden pointer-events-auto" style={{ zIndex: 10 }} onClick={e => e.stopPropagation()}>
              <div className={`px-5 py-4 bg-gradient-to-r ${gradientFrom} text-white flex items-center justify-between`}>
                <div>
                  <h3 className="text-base font-bold">{actionLabel} Trip Legs</h3>
                  <p className="text-xs text-white/70 mt-0.5">{cancelPrompt.trip.patient} — {cancelPrompt.legs.length} leg{cancelPrompt.legs.length !== 1 ? 's' : ''}</p>
                </div>
                <button type="button" onClick={() => { setCancelPrompt(null); setSelectedLegsForAction(new Set()); }} className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center active:scale-90 cursor-pointer"><X size={16} /></button>
              </div>
              <div className="p-4 space-y-2 max-h-56 overflow-y-auto">
                <button type="button" onClick={toggleAll} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition active:scale-95 cursor-pointer ${allSelected ? 'border-rose-200 bg-rose-50' : 'border-slate-100 hover:bg-slate-50'}`}>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${allSelected ? 'bg-rose-500 border-rose-500' : 'border-slate-300'}`}>
                    {allSelected && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-sm font-bold text-slate-900">Select All ({cancelPrompt.legs.length})</span>
                </button>
                {cancelPrompt.legs.map((leg, idx) => {
                  const isSelected = selectedLegsForAction.has(leg.id);
                  return (
                    <button type="button" key={leg.id} onClick={() => toggleLeg(leg.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition active:scale-95 cursor-pointer ${isSelected ? 'border-rose-200 bg-rose-50' : 'border-slate-100 hover:bg-slate-50'}`}>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${isSelected ? 'bg-rose-500 border-rose-500' : 'border-slate-300'}`}>
                        {isSelected && <Check size={12} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black ${cancelPrompt.type === 'noshow' ? 'bg-amber-100 text-amber-600' : cancelPrompt.type === 'reroute' ? 'bg-purple-100 text-purple-600' : 'bg-rose-100 text-rose-600'}`}>L{idx + 1}</span>
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
              <div className="px-4 pb-4">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedLegsForAction.size === 0) return;
                    setCancelPrompt(null);
                    setPasswordPrompt({ type: cancelPrompt.type, trip: cancelPrompt.trip, selectedLegIds: [...selectedLegsForAction], reason: '' });
                    setSelectedLegsForAction(new Set());
                  }}
                  disabled={selectedLegsForAction.size === 0}
                  className={`w-full py-3 text-white rounded-xl font-bold text-sm transition disabled:opacity-40 cursor-pointer ${cancelPrompt.type === 'noshow' ? 'bg-orange-600 hover:bg-orange-700' : cancelPrompt.type === 'reroute' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
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
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-6" style={{ zIndex: 140 }} onClick={() => { setRestorePrompt(null); setSelectedLegsForAction(new Set()); }}>
            <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl relative overflow-hidden pointer-events-auto" style={{ zIndex: 10 }} onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold">Restore Trip Legs</h3>
                  <p className="text-xs text-white/70 mt-0.5">{restorePrompt.trip.patient} — {restorePrompt.legs.length} leg{restorePrompt.legs.length !== 1 ? 's' : ''}</p>
                </div>
                <button type="button" onClick={() => { setRestorePrompt(null); setSelectedLegsForAction(new Set()); }} className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center active:scale-90 cursor-pointer"><X size={16} /></button>
              </div>
              <div className="p-4 space-y-2 max-h-56 overflow-y-auto">
                <button type="button" onClick={toggleAll} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition active:scale-95 cursor-pointer ${allSelected ? 'border-blue-200 bg-blue-50' : 'border-slate-100 hover:bg-slate-50'}`}>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${allSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                    {allSelected && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-sm font-bold text-slate-900">Select All ({restorePrompt.legs.length})</span>
                </button>
                {restorePrompt.legs.map((leg, idx) => {
                  const isSelected = selectedLegsForAction.has(leg.id);
                  return (
                    <button type="button" key={leg.id} onClick={() => toggleLeg(leg.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition active:scale-95 cursor-pointer ${isSelected ? 'border-blue-200 bg-blue-50' : 'border-slate-100 hover:bg-slate-50'}`}>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                        {isSelected && <Check size={12} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center text-[9px] font-black">L{idx + 1}</span>
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
              <div className="px-4 pb-4">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedLegsForAction.size === 0) return;
                    setRestorePrompt(null);
                    setPasswordPrompt({ type: 'restore', trip: restorePrompt.trip, selectedLegIds: [...selectedLegsForAction] });
                  }}
                  disabled={selectedLegsForAction.size === 0}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition disabled:opacity-40 cursor-pointer">
                  {selectedLegsForAction.size === 0 ? 'Select at least one leg' : `Restore ${selectedLegsForAction.size} Leg${selectedLegsForAction.size > 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== PASSWORD CONFIRM MODAL ===== */}
      {passwordPrompt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-6" style={{ zIndex: 180 }} onClick={(e) => { e.stopPropagation(); }}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl relative pointer-events-auto" style={{ zIndex: 10 }} onClick={(e) => e.stopPropagation()}>
            {/* Header with step indicator */}
            <div className="flex items-center gap-0.5 mb-4">
              <div className="h-1 flex-1 rounded-full bg-emerald-400" />
              <div className={`h-1 flex-1 rounded-full ${passwordPrompt.type === 'restore' || passwordPrompt.type === 'edittrip' || passwordPrompt.type === 'edittripcomplete' ? 'bg-blue-400' : 'bg-rose-400'}`} />
            </div>
            <p className="text-micro font-bold uppercase tracking-wider text-slate-500 mb-4 text-center">Step 2 of 2</p>
            <div className="flex items-start justify-between mb-5">
              <div className="text-center flex-1">
                <div className={`w-14 h-14 bg-gradient-to-br rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg ${passwordPrompt.type === 'restore' || passwordPrompt.type === 'edittrip' || passwordPrompt.type === 'edittripcomplete' ? 'from-blue-600 to-blue-500' : 'from-rose-600 to-rose-500'}`}>
                  <Lock size={24} className="text-white" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Confirm {passwordPrompt.type === 'noshow' ? 'No Show' : passwordPrompt.type === 'reroute' ? 'Reroute' : passwordPrompt.type === 'restore' ? 'Restore' : passwordPrompt.type === 'edittrip' || passwordPrompt.type === 'edittripcomplete' ? 'Edit' : 'Cancel'}</h3>
                <p className="text-xs text-slate-500 mt-1">{passwordPrompt.type === 'restore' ? 'Enter your password to restore selected trips' : passwordPrompt.type === 'edittrip' || passwordPrompt.type === 'edittripcomplete' ? 'Enter your password to save your trip changes' : `Enter your password to mark ${passwordPrompt.selectedLegIds && passwordPrompt.selectedLegIds.length > 1 ? `${passwordPrompt.selectedLegIds.length} legs` : passwordPrompt.trip.patient} as ${passwordPrompt.type === 'noshow' ? 'No Show' : passwordPrompt.type === 'reroute' ? 'Rerouted' : 'Cancelled'}`}</p>
                {passwordPrompt.selectedLegIds && passwordPrompt.selectedLegIds.length > 1 && (
                  <p className="text-xs text-rose-500 font-semibold mt-1">{passwordPrompt.selectedLegIds.length} leg{passwordPrompt.selectedLegIds.length !== 1 ? 's' : ''} will be affected</p>
                )}
              </div>
              <button type="button" onClick={() => { setPasswordPrompt(null); setPasswordValue(''); setPasswordError(''); }} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center active:scale-90 ml-2 shrink-0 cursor-pointer"><X size={16} className="text-slate-500" /></button>
            </div>
            <div className="space-y-4">
              {passwordPrompt.type !== 'restore' && passwordPrompt.type !== 'edittrip' && passwordPrompt.type !== 'edittripcomplete' && (
                <div>
                  <label className="text-micro font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Reason</label>
                  <select value={passwordPrompt.reason || ''} onChange={(e) => setPasswordPrompt(prev => ({ ...prev, reason: e.target.value }))}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-sm focus:border-rose-500 outline-none">
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
                <label className="text-micro font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Password</label>
                <input
                  type="password"
                  value={passwordValue}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && verifyPasswordAndProceed()}
                  placeholder="Enter password"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-center focus:border-rose-500 outline-none"
                  autoFocus
                />
                {passwordError && <p className="text-xs text-rose-600 font-semibold mt-1 text-center">{passwordError}</p>}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setPasswordPrompt(null); setPasswordValue(''); setPasswordError(''); }} className="flex-1 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition-all cursor-pointer">
                  Back
                </button>
                <button type="button" onClick={verifyPasswordAndProceed} disabled={!passwordValue || passwordVerifying} className={`flex-1 py-3 text-white rounded-xl font-bold text-sm disabled:opacity-40 transition-all cursor-pointer ${passwordPrompt.type === 'restore' ? 'bg-blue-600 hover:bg-blue-700' : passwordPrompt.type === 'reroute' ? 'bg-purple-600 hover:bg-purple-700' : passwordPrompt.type === 'edittrip' || passwordPrompt.type === 'edittripcomplete' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                  {passwordVerifying ? 'Verifying...' : passwordPrompt.type === 'noshow' ? 'Confirm No Show' : passwordPrompt.type === 'reroute' ? 'Confirm Reroute' : passwordPrompt.type === 'restore' ? 'Confirm Restore' : passwordPrompt.type === 'edittrip' || passwordPrompt.type === 'edittripcomplete' ? 'Confirm & Save Changes' : 'Confirm Cancel'}
                </button>
              </div>
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
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end justify-center" style={{ zIndex: 170 }} onClick={() => setShowContactSelector(null)}>
            <div className="bg-white w-full max-w-md rounded-t-3xl shadow-2xl relative overflow-hidden animate-slide-up pointer-events-auto" style={{ zIndex: 10 }} onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="px-5 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold">Contact for Trip</h3>
                    <p className="text-xs text-white/70 mt-0.5">{showContactSelector.patient} · {to12hr(showContactSelector.time)}</p>
                  </div>
                  <button type="button" onClick={() => setShowContactSelector(null)} className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center active:scale-90 cursor-pointer"><X size={16} /></button>
                </div>
              </div>

              {/* Warning */}
              {warning.show && (
                <div className={`mx-4 mt-3 rounded-xl px-3 py-2 flex items-center gap-2 ${warning.severity === 'error' ? 'bg-rose-50 border border-rose-200' : warning.severity === 'warning' ? 'bg-amber-50 border border-amber-200' : 'bg-blue-50 border border-blue-200'}`}>
                  <AlertTriangle size={12} className={`shrink-0 ${warning.severity === 'error' ? 'text-rose-600' : warning.severity === 'warning' ? 'text-amber-600' : 'text-blue-600'}`} />
                  <p className={`text-xs font-medium ${warning.severity === 'error' ? 'text-rose-700' : warning.severity === 'warning' ? 'text-amber-700' : 'text-blue-700'}`}>{warning.message}</p>
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
              <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
                {contacts.map((contact, idx) => {
                  const roleStyle = getContactRoleIcon(contact.role);
                  const actions = getContactRoleActions(contact.role);
                  const Icon = iconMap[roleStyle.icon] || User;
                  return (
                    <div key={idx} className={`bg-white rounded-xl border-2 shadow-sm ${contact.isPrimary ? 'ring-2 ' + roleStyle.ring : 'border-slate-200'} p-3`}>
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${roleStyle.bg}`}>
                          <Icon size={18} className={roleStyle.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900 truncate">{contact.name}</span>
                            {contact.isPrimary && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">PRIMARY</span>}
                          </div>
                          <p className="text-xs text-slate-500">{contact.label} · {formatPhoneDisplay(contact.phone)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-13">
                        <button
                          type="button"
                          onClick={() => { handleCall(contact.phone, `${contact.label}: ${contact.name}`); setShowContactSelector(null); }}
                          className="flex-1 h-8 bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer">
                          <Phone size={12} /> {actions.callLabel}
                        </button>
                        {actions.smsLabel && (
                          <button
                            type="button"
                            onClick={() => { handleSMS(contact.phone, contact.name); setShowContactSelector(null); }}
                            className="flex-1 h-8 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer">
                            <MessageCircle size={12} /> {actions.smsLabel}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick Actions Footer */}
              <div className="px-4 pb-4 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { handleSmartCall(showContactSelector); setShowContactSelector(null); }}
                  className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 cursor-pointer">
                  <Phone size={14} /> Quick Call Primary Contact
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

      {/* ===== ROUTE SEQUENCER MODAL ===== */}
      {showSequencerModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowSequencerModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="bg-white w-full max-w-7xl h-[92vh] rounded-3xl shadow-2xl relative z-10 border border-slate-200 animate-in fade-in zoom-in-95 duration-200 flex flex-col overflow-hidden pointer-events-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between flex-shrink-0">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Route size={16} className="text-indigo-700" /> Route Sequencer
              </h2>
              <button onClick={() => setShowSequencerModal(false)} className="p-1.5 rounded-xl hover:bg-slate-50 transition-colors"><X size={16} className="text-slate-500" /></button>
            </div>
            <div className="flex-1 overflow-hidden">
              <Suspense fallback={<LazyFallback />}>
                <RouteSequencerApp
                  trips={trips}
                  drivers={drivers}
                  currentUser={currentUser}
                  role={role}
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
                      if (trip) onUpdateTrip(trip.id, 'Assigned', { driverId: me?.id || '', driverEmail: me?.email || '', driverName: me?.name || '' });
                    });
                    if (onAddAuditLog) {
                      onAddAuditLog('Route Applied', `${currentUser} applied route "${route.name}" to ${tripIds?.length || 0} trips.`, 'emerald');
                    }
                    setShowSequencerModal(false);
                  }}
                />
              </Suspense>
            </div>
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
