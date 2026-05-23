import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { tripMatchesTodayOrTomorrow } from '../utils/tripDate';
import { auth, db, doc, onSnapshot, getDoc, setDoc, signOut, EmailAuthProvider, reauthenticateWithCredential, saveOdometerReading } from '../config/firebase';
import { optimizeRoute as aiOptimizeRoute } from '../config/ai';
import { getDistanceMiles } from '../config/maps';
import LiveRouteMap from './LiveRouteMap';
import { showLocalNotification } from '../config/notifications';
import ChatPage from './ChatPage';
import DriverToolsPage from './DriverToolsPage';
import {
  Truck, MapPin, Phone, MessageCircle, CheckCircle2, XCircle,
  AlertCircle, Navigation, Gauge, Clock, User, ChevronRight, Play, Check,
  ChevronUp, ChevronDown, Edit2, ListChecks, Sparkles, Target, RotateCcw, Lock,
  Home, History, MessageSquare, Settings, LogOut, ChevronLeft, Calendar,
  Wifi, WifiOff, Filter, ArrowRight, Send, Smile, Bell, Circle, Search,
  Star, Activity, Repeat, Zap, X, Route, PhoneCall, Radio, CircleDot,
  CheckSquare, Square, BrainCircuit, Map, BarChart3, Sun, Moon,
  Download, Trash2, FileText, AlertTriangle, Info,
  Timer, Copy, PhoneForwarded, Shield, Headphones
} from 'lucide-react';
import { openNavigation, showNavActionSheet, makeCall, sendSMS, showCallActionSheet } from '../utils/nativeActions';
import { impact } from '../utils/haptics';
import { isNativeShell } from '../utils/platform';
import { buildContactList, getPrimaryContact, getContactWarning, formatPhoneDisplay, cleanPhone } from '../utils/smartContacts';

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

const timeToMinutes = (t) => {
  if (!t || t === 'Will Call' || t === 'WC') return 1440;
  const m = String(t).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return 1440;
  let h = parseInt(m[1], 10);
  let min = parseInt(m[2] || '0', 10);
  const p = m[3];
  if (p) {
    if (p.toUpperCase() === 'PM' && h < 12) h += 12;
    if (p.toUpperCase() === 'AM' && h === 12) h = 0;
  }
  return h * 60 + min;
};

const formatDuration = (minutes) => {
  if (!minutes || minutes < 0) return '--';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
};

const DriverPage = ({ currentUser, role, drivers, trips, activeMission, onUpdateMission, onUpdateTrip, onDriverStatusUpdate, onCompleteTrip, onOpenSettings, appSettings = {}, phoneNumbers = {}, onUpdateDriverLocation, onUpdateAppSettings }) => {
  const me = drivers.find(d => (d.email || '').toLowerCase() === (currentUser || '').toLowerCase());
  const [activeNav, setActiveNav] = useState('trips');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [chatUnread, setChatUnread] = useState(0);
  const [selectedTrips, setSelectedTrips] = useState([]);
  const [aiOptimizing, setAiOptimizing] = useState(false);
  const [aiSequence, setAiSequence] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [guidedMode, setGuidedMode] = useState(false);
  const [guidedStepIndex, setGuidedStepIndex] = useState(0);
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
  const [departedTime, setDepartedTime] = useState('');
  const [arrivalDropoffTime, setArrivalDropoffTime] = useState('');
  const [showTripDetails, setShowTripDetails] = useState(null);
  const [legActionPrompt, setLegActionPrompt] = useState(null);
  const [selectedLegsForAction, setSelectedLegsForAction] = useState(new Set());
  const [isGpsTracking, setIsGpsTracking] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState([]);
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
  const gpsWatchId = useRef(null);
  const meRef = useRef(me);
  const lastUpdateRef = useRef(0);
  const queueRef = useRef([]);
  const etasRef = useRef({});
  const positionRef = useRef(null);
  meRef.current = me;
  positionRef.current = driverPosition;

  // Smart contact system: build contact list per trip with type detection
  const tripContacts = useMemo(() => {
    const map = {};
    trips.forEach(t => {
      map[t.id] = buildContactList(t, trips, phoneNumbers);
    });
    return map;
  }, [trips, phoneNumbers]);

  const getPrimaryContactForTrip = (trip) => getPrimaryContact(trip, trips, phoneNumbers);

  const getContactsForTrip = (trip) => tripContacts[trip?.id] || [];

  // Count legs per patient for today
  const patientLegs = useMemo(() => {
    const counts = {};
    trips.forEach(t => {
      const isAssignedToMe = (t.driverId === me?.id || ((t.driverEmail || '').toLowerCase() === (me?.email || '').toLowerCase()));
      if (!isAssignedToMe) return;
      const key = (t.patient || '').trim().toLowerCase();
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [trips, me?.id, me?.email]);

  // Count ACTIVE legs per patient (for no-show/cancel decision)
  const patientActiveLegs = useMemo(() => {
    const counts = {};
    trips.forEach(t => {
      const isAssignedToMe = (t.driverId === me?.id || ((t.driverEmail || '').toLowerCase() === (me?.email || '').toLowerCase()));
      if (!isAssignedToMe) return;
      if (['Completed','Cancelled','No Show'].includes(t.status)) return;
      const key = (t.patient || '').trim().toLowerCase();
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [trips, me?.id, me?.email]);

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
    onUpdateTrip(trip.id, prevStatus, {});
  };

  const restoreHistoryTrip = (trip) => {
    const patientKey = (trip.patient || '').trim().toLowerCase();
    const relatedLegs = trips.filter(t => (t.patient || '').trim().toLowerCase() === patientKey && (t.driverId === me?.id || (t.driverEmail || '').toLowerCase() === (me?.email || '').toLowerCase()) && ['Completed','Cancelled','No Show'].includes(t.status));
    if (relatedLegs.length > 1) {
      setRestorePrompt({ trip, legs: relatedLegs });
    } else {
      setPasswordPrompt({ type: 'restore', trip });
    }
  };

  // Online/offline detection
  useEffect(() => {
    const goOnline = () => { setIsOnline(true); syncOfflineQueue(); };
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
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
        try { onUpdateDriverLocation && onUpdateDriverLocation(meRef.current.id, item.data.lat, item.data.lng); } catch {}
      } else if (item.action === 'completeTrip' && meRef.current?.id) {
        try { onCompleteTrip && onCompleteTrip(item.data.tripId, meRef.current.id, item.data.odometer); } catch {}
      }
    }
  }, []);

  // Real-time unread count for chat
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'chatData/conversations'), snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      const total = Object.entries(data.conversations || {})
        .filter(([, c]) => c.participants?.includes(currentUser))
        .reduce((sum, [, c]) => sum + ((c.unread || {})[currentUser] || 0), 0);
      setChatUnread(total);
    });
    return () => unsub();
  }, [currentUser]);

  // Load last odometer from completed trips
  useEffect(() => {
    if (!me?.id) return;
    const completed = trips
      .filter(t => (t.driverId === me.id || (t.driverEmail || '').toLowerCase() === (me.email || '').toLowerCase()) && t.status === 'Completed' && t.dropoffOdometer)
      .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
    if (completed.length > 0) setLastOdometer(completed[0].dropoffOdometer);
  }, [trips, me?.id, me?.email]);

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
      const myTripsFilter = t => (t.driverId === me.id || (t.driverEmail || '').toLowerCase() === (me.email || '').toLowerCase());
      const completed = trips.filter(t => myTripsFilter(t) && t.status === 'Completed');
      const allMine = trips.filter(t => myTripsFilter(t));
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
  }, [trips, me?.id, me?.email]);

  const getTodayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

  const myTrips = trips
    .filter(t => {
      const isAssignedToMe = (t.driverId === me?.id || ((t.driverEmail || '').toLowerCase() === (me?.email || '').toLowerCase()));
      const inWindow = tripMatchesTodayOrTomorrow(t.date);
      const isActiveStatus = !['Completed', 'Cancelled', 'No Show'].includes(t.status);
      return (isAssignedToMe && inWindow) || (isAssignedToMe && isActiveStatus);
    })
    .sort((a, b) => {
      const today = getTodayStr();
      const aToday = a.date === today ? 0 : 1;
      const bToday = b.date === today ? 0 : 1;
      if (aToday !== bToday) return aToday - bToday;
      return timeToMinutes(a.time) - timeToMinutes(b.time);
    });

  const completedTrips = trips.filter(t => (t.driverId === me?.id || (t.driverEmail||'').toLowerCase() === (me?.email||'').toLowerCase()) && t.status === 'Completed');
  const noShowTrips = trips.filter(t => (t.driverId === me?.id || (t.driverEmail||'').toLowerCase() === (me?.email||'').toLowerCase()) && t.status === 'No Show');
  const cancelledTrips = trips.filter(t => (t.driverId === me?.id || (t.driverEmail||'').toLowerCase() === (me?.email||'').toLowerCase()) && t.status === 'Cancelled');
  const allHistory = [...completedTrips, ...noShowTrips, ...cancelledTrips].sort((a,b) => { const da = a.completedAt || a.date || ''; const db = b.completedAt || b.date || ''; return db.localeCompare(da); });

  const activeTrips = myTrips.filter(t => !['Completed', 'Cancelled', 'No Show'].includes(t.status));

  const orderedTrips = aiSequence && aiSequence.length > 0
    ? [...activeTrips].sort((a, b) => aiSequence.indexOf(a.id) - aiSequence.indexOf(b.id))
    : activeTrips;

  const isClockedIn = me?.clockedIn || false;

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

  const startGpsTracking = () => {
    if (!navigator.geolocation || gpsWatchId.current) return;
    let lastUpdate = 0;
    let lastLat = 0;
    let lastLng = 0;
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
        if (dist < 15 && lastUpdate > 0) return;
        lastUpdate = now;
        lastLat = latitude;
        lastLng = longitude;
        setDriverPosition({ lat: latitude, lng: longitude, accuracy });
        const driverId = meRef.current?.id;
        if (driverId && navigator.onLine) {
          try {
            onUpdateDriverLocation && onUpdateDriverLocation(driverId, latitude, longitude);
          } catch {}
        } else if (driverId) {
          addToQueue('updateLocation', { lat: latitude, lng: longitude });
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
    onDriverStatusUpdate(me?.id, newStatus);
  };

  const filteredHistory = allHistory.filter(t => {
    const matchFilter = historyFilter === 'all' ? true :
      historyFilter === 'completed' ? t.status === 'Completed' :
      historyFilter === 'noshow' ? t.status === 'No Show' :
      t.status === 'Cancelled';
    if (!matchFilter) return false;
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
    if (selectedTrips.length < 2 && !silent) return;
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
    if (!guidedMode || !aiSequence || aiSequence.length === 0 || guidedStepIndex >= aiSequence.length) return;
    const currentId = aiSequence[guidedStepIndex];
    const currentTrip = trips.find(t => t.id === currentId);
    if (!currentTrip) return;
    if (['Completed', 'Cancelled', 'No Show'].includes(currentTrip.status)) {
      if (guidedLastAdvance.current === guidedStepIndex) return;
      guidedLastAdvance.current = guidedStepIndex;
      const nextIndex = guidedStepIndex + 1;
      if (nextIndex >= aiSequence.length) {
        setGuidedMode(false);
        setAiSequence(null);
        setAiSuggestions([]);
        setSelectedTrips([]);
        showLocalNotification('✅ Smart Route Complete', 'All trips in the route have been handled.');
      } else {
        setGuidedStepIndex(nextIndex);
      }
    }
  }, [trips, guidedMode, guidedStepIndex, aiSequence]);


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
    onUpdateTrip(trip.id, 'Navigating Pickup', {});
    openInNavApp(trip.pickup, navApp);
  };

  const handleNavigateToDropoff = (trip) => {
    impact('heavy');
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
    onUpdateTrip(showOdometerPrompt.id, 'At Pickup', {
      pickupOdometer: odo,
      startTime: new Date().toISOString(),
      departureTime: new Date().toISOString(),
    });
    setLastOdometer(odo);
    setShowOdometerPrompt(null);
    setOdometerValue('');
  };

  const handleArriveDropoff = (trip) => {
    setUndoable(trip, trip.status, 'At Dropoff');
    onUpdateTrip(trip.id, 'At Dropoff', {
      arrivalTime: new Date().toISOString(),
    });
  };

  const confirmArrival = () => {
    if (!showArrivalConfirm) return;
    const odo = parseInt(arrivalOdometer, 10) || lastOdometer;
    if (lastOdometer > 0 && odo < lastOdometer && !window.confirm(`Warning: ${odo.toLocaleString()} mi is less than the last recorded reading of ${lastOdometer.toLocaleString()} mi. Continue anyway?`)) return;
    setUndoable(showArrivalConfirm, showArrivalConfirm.status, 'At Pickup');
    onUpdateTrip(showArrivalConfirm.id, 'At Pickup', {
      pickupOdometer: odo,
      startTime: new Date().toISOString(),
      departureTime: new Date().toISOString(),
    });
    setLastOdometer(odo);
    setShowArrivalConfirm(null);
    setArrivalOdometer('');
  };

  const confirmSignatureAndBegin = () => {
    if (!showSignatureConfirm || !signatureConfirmed) return;
    setUndoable(showSignatureConfirm, showSignatureConfirm.status, 'In Transit');
    onUpdateTrip(showSignatureConfirm.id, 'In Transit', {
      pickupDepartedAt: new Date().toISOString(),
      paperSignatureConfirmed: true,
    });
    setShowSignatureConfirm(null);
    setSignatureConfirmed(false);
  };

  const handleNoShow = (trip) => {
    const patientKey = (trip.patient || '').trim().toLowerCase();
    const activeLegsCount = patientActiveLegs[patientKey] || 1;
    if (activeLegsCount > 1) {
      setLegActionPrompt({ type: 'noshow', trip, legsCount: activeLegsCount });
    } else {
      setPasswordPrompt({ type: 'noshow', trip });
    }
  };

  const handleCancel = (trip) => {
    const patientKey = (trip.patient || '').trim().toLowerCase();
    const activeLegsCount = patientActiveLegs[patientKey] || 1;
    if (activeLegsCount > 1) {
      setLegActionPrompt({ type: 'cancel', trip, legsCount: activeLegsCount });
    } else {
      setPasswordPrompt({ type: 'cancel', trip });
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
      const { type, trip, selectedLegIds, reason } = passwordPrompt;
      if (type === 'restore') {
        const legsToRestore = selectedLegIds && selectedLegIds.length > 0
          ? trips.filter(t => selectedLegIds.includes(t.id))
          : [trip];
        legsToRestore.forEach(leg => {
          const prevStatus = leg.status === 'Completed' ? 'Arrived' : 'Assigned';
          onUpdateTrip(leg.id, prevStatus, {});
        });
      } else {
        const newStatus = type === 'noshow' ? 'No Show' : 'Cancelled';
        const legsToProcess = selectedLegIds && selectedLegIds.length > 0
          ? trips.filter(t => selectedLegIds.includes(t.id))
          : [trip];
        legsToProcess.forEach(leg => {
          setUndoable(leg, leg.status, newStatus);
          onUpdateTrip(leg.id, newStatus, {
            completedAt: new Date().toISOString(),
            cancellationReason: reason || undefined,
            cancelledBy: me?.email || '',
            cancelledAt: new Date().toISOString(),
          });
        });
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
    setCompleteOdometer(String(lastOdometer || ''));
    const nowLocal = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const defaultTime = `${pad(nowLocal.getHours())}:${pad(nowLocal.getMinutes())}`;
    setDepartedTime(trip.departedPickupTime ? formatTimeInput(trip.departedPickupTime) : defaultTime);
    setArrivalDropoffTime(trip.arrivalDropoffTime ? formatTimeInput(trip.arrivalDropoffTime) : defaultTime);
  };

  const submitComplete = () => {
    if (!showCompleteModal || !completeOdometer) return;
    const odo = parseInt(completeOdometer, 10);
    if (isNaN(odo) || odo <= 0) return;
    if (lastOdometer > 0 && odo < lastOdometer && !window.confirm(`Warning: ${odo.toLocaleString()} mi is less than the last recorded reading of ${lastOdometer.toLocaleString()} mi. Continue anyway?`)) return;
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
      arrivalDropoffTime: toIso(arrivalDropoffTime),
      completedVehicle: me?.vehicle || '',
    });
    setLastOdometer(odo);
    setAnalytics(prev => ({ ...prev, tripsCompleted: prev.tripsCompleted + 1 }));
    setShowCompleteModal(null);
    setCompleteOdometer('');

    // Save odometer to Firestore directly
    if (navigator.onLine) {
      saveOdometerReading(showCompleteModal.id, odo).catch(() => {});
    } else {
      addToQueue('completeTrip', { tripId: showCompleteModal.id, odometer: odo });
    }

    // Reset trip selection after completion
    setSelectedTrips(prev => prev.filter(id => id !== showCompleteModal.id));
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
      <div className="flex-1 bg-slate-50 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-20 h-20 bg-white rounded-[2rem] shadow-lg flex items-center justify-center mx-auto mb-6">
            <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Loading profile...</h2>
          <p className="text-sm text-slate-400 mt-1">Connecting to your driver account</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#f5f5f7]">
      {/* Go Online Gate - driver must be clocked in to see trips */}
      {!isClockedIn && activeNav !== 'settings' && activeNav !== 'chat' && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-200">
              <Wifi size={32} className="text-white" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 mb-2">Go Online to Start Working</h2>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">You need to be online to view trips and start your shifts. Tap the button below to go online.</p>
            <button
              onClick={handleStatusToggle}
              className="px-8 h-12 bg-emerald-500 text-white rounded-2xl font-bold text-base active:scale-95 transition-all shadow-lg shadow-emerald-200 flex items-center gap-2 mx-auto">
              <Wifi size={18} /> Go Online
            </button>
            <div className="mt-6 flex items-center justify-center">
              <button onClick={() => setActiveNav('settings')} className="text-xs text-slate-400 hover:text-blue-600 font-semibold flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-blue-50 transition">
                <Settings size={12} /> Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== TRIPS PAGE ===== */}
      {isClockedIn && activeNav === 'trips' && (
        <div className="flex-1 overflow-y-auto pb-28 px-3 pt-2 space-y-2">
          {/* Offline Banner */}
          {!isOnline && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 flex items-center gap-2">
              <WifiOff size={14} className="text-amber-600 shrink-0" />
              <p className="text-xs font-semibold text-amber-800">You're offline. Changes will sync when connection returns.</p>
            </div>
          )}

          {/* Background Location Warning */}
          {!backgroundLocation && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 flex items-center gap-2">
              <Info size={14} className="text-blue-600 shrink-0" />
              <p className="text-xs font-semibold text-blue-800">Enable 'Always Allow' location for background tracking.</p>
            </div>
          )}

          {/* Stats Glass Card */}
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-600/90 to-indigo-700/90 shadow-sm">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.1),transparent_60%)]" />
            <div className="relative flex items-center gap-2 px-2.5 py-2">
              {[
                { label: 'Total', value: myTrips.length },
                { label: 'Done', value: completedTrips.length },
                { label: 'Active', value: Math.max(0, activeTrips.length) },
                { label: 'GPS', value: isGpsTracking ? 'ON' : 'OFF', color: isGpsTracking ? 'bg-emerald-400/20 text-emerald-300' : 'bg-rose-400/20 text-rose-300' },
              ].map(stat => (
                <div key={stat.label} className="flex-1 bg-white/10 rounded-lg px-2 py-1 border border-white/10 text-center">
                  <p className="text-xs font-black text-white leading-none">{stat.value}</p>
                  <p className="text-xs text-white/50 uppercase font-bold tracking-wider leading-tight mt-0.5">{stat.label}</p>
                </div>
              ))}
              <div className="flex-shrink-0 border-l border-white/10 pl-2 flex items-center gap-1">
                {isOnline ? <Wifi size={10} className="text-emerald-300" /> : <WifiOff size={10} className="text-amber-300" />}
                <p className="text-xs text-white/60 uppercase font-bold whitespace-nowrap">{getTodayStr().slice(5)}</p>
              </div>
            </div>
          </div>

          {/* Guided Mode Progress Header */}
          {guidedMode && aiSequence && aiSequence.length > 0 && guidedStepIndex < aiSequence.length && (() => {
            const currentTripId = aiSequence[guidedStepIndex];
            const currentTrip = trips.find(t => t.id === currentTripId);
            const nextTripId = guidedStepIndex + 1 < aiSequence.length ? aiSequence[guidedStepIndex + 1] : null;
            const nextTrip = nextTripId ? trips.find(t => t.id === nextTripId) : null;
            const pct = Math.round((guidedStepIndex / aiSequence.length) * 100);
            return (
              <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-xl p-3 shadow-md shadow-indigo-200/40 sticky top-0" style={{ zIndex: 10 }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-white/20 rounded-lg flex items-center justify-center text-xs font-black text-white">{guidedStepIndex + 1}</span>
                    <span className="text-xs font-bold text-white/80 uppercase tracking-wider">of {aiSequence.length}</span>
                  </div>
                  <button onClick={() => { setGuidedMode(false); }} className="text-xs text-white/60 font-bold uppercase hover:text-white/90">Exit</button>
                </div>
                <div className="h-1 bg-white/20 rounded-full overflow-hidden mb-1.5">
                  <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-white truncate flex-1 min-w-0">
                    {currentTrip?.patient || 'Loading...'}
                    <span className="text-white/60 font-medium ml-1 text-xs">· {currentTrip ? (['Assigned','Unassigned'].includes(currentTrip.status) ? 'Not started' : currentTrip.status) : ''}</span>
                  </p>
                  {nextTrip && (
                    <span className="text-xs text-white/50 font-medium ml-2 shrink-0">Next: {nextTrip.patient}</span>
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
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-[0.12em]">Today & Tomorrow</h3>
            <div className="flex items-center gap-2">
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
            <div className="bg-white/80 backdrop-blur-md rounded-3xl border border-slate-100/50 p-10 text-center shadow-sm mt-2">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-[2rem] flex items-center justify-center mx-auto mb-5 shadow-inner">
                <CheckCircle2 size={36} className="text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">All Clear</h3>
              <p className="text-sm text-slate-400 mt-1.5 max-w-[200px] mx-auto leading-relaxed">No trips assigned. Your manifest is up to date.</p>
            </div>
          ) : (
            <div className="space-y-2.5 pb-2">
              {orderedTrips.map((trip) => {
                const isActive = !['Assigned', 'Unassigned'].includes(trip.status);
                const isSelected = selectedTrips.includes(trip.id);
                const eta = etas[trip.id];
                const hasConflict = conflicts.some(c => c.tripA === trip.id || c.tripB === trip.id);
                const rideShareTrip = aiRideShare.find(r => r.tripA === trip.id || r.tripB === trip.id);
                const urgency = getUrgency(trip);
                const urgencyBorder = urgency === 2 ? 'border-l-4 border-l-rose-500 shadow-lg shadow-rose-200/50' : urgency === 1 ? 'border-l-4 border-l-amber-500 shadow-md shadow-amber-200/40' : '';
                const isGuidedCurrent = guidedMode && aiSequence && aiSequence[guidedStepIndex] === trip.id;
                const legsCount = patientLegs[(trip.patient || '').trim().toLowerCase()];
                const today = getTodayStr();
                const isTomorrow = trip.date !== today;

                return (
                  <div key={trip.id}
                    onTouchStart={(e) => handleTouchStart(e, trip)}
                    onTouchEnd={handleTouchEnd}
                    className={`card overflow-hidden rounded-2xl active:scale-[0.985] transition-all duration-200 ${
                      isActive ? 'border-2 border-blue-200' : 'border border-slate-100'
                    } ${isSelected ? 'ring-2 ring-blue-400' : ''} ${hasConflict ? 'ring-2 ring-rose-300' : ''} ${urgencyBorder} ${isGuidedCurrent ? 'ring-2 ring-indigo-400 shadow-lg shadow-indigo-200/40' : ''} transition-all`}>
                    {/* Compact unified layout */}
                    <div className={`px-3 pt-2.5 pb-1.5 ${isActive ? 'bg-blue-50/50' : ''}`}>
                      {/* Row 1: Checkbox + Time + Actions */}
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => toggleTripSelect(trip.id)} className="shrink-0 text-slate-400 hover:text-blue-600 active:scale-90 transition-all duration-150 cursor-pointer">
                          {isSelected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                        </button>
                        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                          <span className="text-xl font-black text-blue-600 tracking-tight leading-none">{to12hr(trip.time)}</span>
                          {isTomorrow && <span className="badge badge-warning shrink-0 text-[9px] px-1.5 py-0.5">Tomorrow</span>}
                          {urgency === 2 && <span className="badge badge-danger animate-pulse shrink-0 text-[9px] px-1.5 py-0.5">Overdue</span>}
                          {urgency === 1 && <span className="badge badge-warning shrink-0 text-[9px] px-1.5 py-0.5">Soon</span>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => handleSmartCall(trip)} className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 active:scale-85 transition-all duration-150 cursor-pointer"><Phone size={13} /></button>
                          <button type="button" onClick={() => handleSmartSMS(trip)} className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 active:scale-85 transition-all duration-150 cursor-pointer"><MessageCircle size={13} /></button>
                          <button type="button" onClick={() => openContactSelector(trip)} className="w-7 h-7 rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-100 flex items-center justify-center active:scale-85 transition-all duration-150 cursor-pointer" title="All contacts"><PhoneForwarded size={13} /></button>
                          <button type="button" onClick={() => setShowTripDetails(showTripDetails?.id === trip.id ? null : trip)} className="w-7 h-7 rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-100 flex items-center justify-center active:scale-85 transition-all duration-150 cursor-pointer">
                            {showTripDetails?.id === trip.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                        </div>
                      </div>

                      {/* Row 2: Patient + Booking ID + Status + Contact Type */}
                      <div className="flex items-center gap-1.5 mt-0.5 ml-[22px] flex-wrap">
                        <h3 className="text-base font-extrabold text-slate-900 leading-tight break-words">{trip.patient}</h3>
                        {trip.bookingId && <span className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-lg shrink-0">{trip.bookingId}</span>}
                        {isActive && <span className="badge shrink-0 badge-info text-[8px] px-1.5 py-0.5 leading-none">{trip.status}</span>}
                        {legsCount > 1 && <button type="button" onClick={() => setLegsDetailPatient(trip.patient)} className="badge badge-info shrink-0 text-[8px] px-1.5 py-0.5 cursor-pointer hover:opacity-80 leading-none">{legsCount} leg{legsCount !== 1 ? 's' : ''}</button>}
                        {(() => {
                          const primary = getPrimaryContactForTrip(trip);
                          if (!primary) return null;
                          const contactColors = {
                            patient: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                            facility: 'bg-amber-50 text-amber-700 border-amber-200',
                            escort: 'bg-purple-50 text-purple-700 border-purple-200',
                            dispatcher: 'bg-blue-50 text-blue-700 border-blue-200',
                            routing: 'bg-indigo-50 text-indigo-700 border-indigo-200',
                          };
                          return <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${contactColors[primary.role] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>{primary.label}</span>;
                        })()}
                        {hasConflict && <AlertTriangle size={11} className="text-rose-500 shrink-0" />}
                        {rideShareTrip && <Repeat size={11} className="text-emerald-500 shrink-0" />}
                      </div>
                    </div>

                    {/* Route Section */}
                    <div className="px-3 pb-2">
                      <div className="relative pl-5">
                        <div className="absolute left-[8px] top-0.5 bottom-0.5 w-0.5 bg-slate-200 rounded-full" />
                        {/* Pickup */}
                        <div className="flex items-start gap-2">
                          <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-emerald-100 shrink-0 mt-1 flex items-center justify-center">
                            <span className="text-[5px] font-black text-white leading-none">P</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider leading-none">Pickup</p>
                            <p className="text-[13px] font-medium text-slate-700 leading-snug break-words">{trip.pickup}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <button type="button" onClick={() => openInNavApp(trip.pickup, suggestNavApp(trip.pickup))} className="text-[10px] text-blue-600 font-semibold flex items-center gap-1 px-2 py-0.5 bg-blue-50/60 rounded-full active:scale-90 transition-all duration-150 cursor-pointer"><Navigation size={9} /> Nav</button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(trip.pickup).catch(() => {}); }} className="text-slate-400 hover:text-blue-600 p-0.5 hover:bg-blue-50 rounded active:scale-90 transition-all duration-150 cursor-pointer" title="Copy"><Copy size={10} /></button>
                            </div>
                          </div>
                        </div>
                        {/* Dropoff */}
                        <div className="flex items-start gap-2 mt-1.5">
                          <div className="w-3.5 h-3.5 rounded-full bg-rose-500 border-2 border-rose-100 shrink-0 mt-1 flex items-center justify-center">
                            <span className="text-[5px] font-black text-white leading-none">D</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider leading-none">Dropoff</p>
                            <p className="text-[13px] font-medium text-slate-700 leading-snug break-words">{trip.dropoff}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <button type="button" onClick={() => openInNavApp(trip.dropoff, suggestNavApp(trip.dropoff))} className="text-[10px] text-rose-600 font-semibold flex items-center gap-1 px-2 py-0.5 bg-rose-50/60 rounded-full active:scale-90 transition-all duration-150 cursor-pointer"><Navigation size={9} /> Nav</button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(trip.dropoff).catch(() => {}); }} className="text-slate-400 hover:text-rose-600 p-0.5 hover:bg-rose-50 rounded active:scale-90 transition-all duration-150 cursor-pointer" title="Copy"><Copy size={10} /></button>
                            </div>
                          </div>
                        </div>
                      </div>
                      {trip.notes && (
                        <div className="mt-1.5 bg-amber-50/80 rounded-lg px-2 py-1.5 border border-amber-100/50">
                          <p className="text-[11px] text-amber-800 font-medium leading-relaxed">{trip.notes}</p>
                        </div>
                      )}
                      {trip.distance && (
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400 font-medium ml-1">
                          <MapPin size={10} />
                          <span>{trip.distance} mi</span>
                        </div>
                      )}
                    </div>

                    {/* Smart Step-by-Step Workflow */}
                    <div className="px-3 pb-2.5">
                      {(() => {
                        const workflowSteps = [
                          { key: 'start', label: 'Start Trip', done: !['Assigned','Unassigned'].includes(trip.status), phase: 'pickup' },
                          { key: 'nav-pickup', label: 'Navigate to Pickup', done: !['In Progress'].includes(trip.status), phase: 'pickup' },
                          { key: 'arrive-pickup', label: 'Arrive at Pickup', done: !['Navigating Pickup'].includes(trip.status), phase: 'pickup' },
                          { key: 'begin-transport', label: 'Begin Transport', done: !['At Pickup'].includes(trip.status), phase: 'pickup' },
                          { key: 'nav-dropoff', label: 'Navigate to Dropoff', done: !['In Transit'].includes(trip.status), phase: 'dropoff' },
                          { key: 'arrive-dropoff', label: 'Arrive at Dropoff', done: !['Navigating Dropoff'].includes(trip.status), phase: 'dropoff' },
                          { key: 'complete', label: 'Complete Trip', done: ['Completed','Cancelled','No Show','At Dropoff','Arrived'].includes(trip.status), phase: 'dropoff' },
                        ];
                        const currentStepIdx = workflowSteps.findIndex(s => !s.done);
                        const totalSteps = workflowSteps.length;
                        const isDropoffPhase = workflowSteps[currentStepIdx]?.phase === 'dropoff';
                        const activeBarColor = isDropoffPhase ? 'bg-orange-400' : 'bg-blue-400';
                        const doneBarColor = 'bg-emerald-400';

                        const renderPrimaryBtn = (label, icon, gradient, shadow, onClick) => (
                          <div>
                            {/* Progress bar */}
                            <div className="flex items-center gap-0.5 mb-1.5">
                              {workflowSteps.map((step, idx) => (
                                <div key={step.key} className={`h-1 flex-1 rounded-full transition-all duration-500 ${idx < currentStepIdx ? doneBarColor : idx === currentStepIdx ? activeBarColor : 'bg-slate-200'}`} />
                              ))}
                            </div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 text-center">Step {Math.min(currentStepIdx + 1, totalSteps)} of {totalSteps}</p>
                            <div className="flex items-center gap-1.5">
                              <button type="button" onClick={onClick} className={`flex-1 h-9 ${gradient} text-white ${shadow} rounded-xl text-xs font-bold active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer`}>
                                {icon} {label}
                              </button>
                              <button type="button" onClick={() => { impact('medium'); handleNoShow(trip); }} className="h-9 px-3 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 rounded-xl text-[10px] font-bold active:scale-95 transition-all duration-150 shrink-0 cursor-pointer">No Show</button>
                              <button type="button" onClick={() => { impact('medium'); handleCancel(trip); }} className="h-9 px-3 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-xl text-[10px] font-bold active:scale-95 transition-all duration-150 shrink-0 cursor-pointer">Cancelled</button>
                              {currentStepIdx > 0 && (
                                <button type="button" onClick={() => revertTripStatus(trip)} className="h-9 px-2 text-slate-300 hover:text-blue-500 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 transition-all duration-150 shrink-0 cursor-pointer"><RotateCcw size={12} /></button>
                              )}
                            </div>
                          </div>
                        );

                        // STEP 1: Start Trip (blue - pickup phase)
                        if (trip.status === 'Assigned' || trip.status === 'Unassigned') {
                          return renderPrimaryBtn(
                            'Start Trip',
                            <Play size={13} />,
                            'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600',
                            'shadow-md shadow-blue-200/40',
                            () => { impact('heavy'); onUpdateTrip(trip.id, 'In Progress', { startedAt: new Date().toISOString() }); }
                          );
                        }

                        // STEP 2: Navigate to Pickup (blue)
                        if (trip.status === 'In Progress') {
                          return renderPrimaryBtn(
                            'Navigate to Pickup',
                            <Navigation size={13} />,
                            'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600',
                            'shadow-md shadow-blue-200/40',
                            () => handleNavigateToPickup(trip)
                          );
                        }

                        // STEP 3: Arrive at Pickup (blue-green)
                        if (trip.status === 'Navigating Pickup') {
                          return renderPrimaryBtn(
                            'Arrive at Pickup',
                            <MapPin size={13} />,
                            'bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600',
                            'shadow-md shadow-blue-200/40',
                            () => { impact('heavy'); handleArrivePickup(trip); }
                          );
                        }

                        // STEP 4: Begin Transport (green) - requires signature
                        if (trip.status === 'At Pickup') {
                          return renderPrimaryBtn(
                            'Begin Transport',
                            <Play size={13} />,
                            'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600',
                            'shadow-md shadow-green-200/40',
                            () => { impact('heavy'); setSignatureConfirmed(false); setShowSignatureConfirm(trip); }
                          );
                        }

                        // STEP 5: Navigate to Dropoff (orange)
                        if (trip.status === 'In Transit') {
                          return renderPrimaryBtn(
                            'Navigate to Dropoff',
                            <Navigation size={13} />,
                            'bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600',
                            'shadow-md shadow-orange-200/40',
                            () => handleNavigateToDropoff(trip)
                          );
                        }

                        // STEP 6: Arrive at Dropoff (orange-red)
                        if (trip.status === 'Navigating Dropoff') {
                          return renderPrimaryBtn(
                            'Arrive at Dropoff',
                            <MapPin size={13} />,
                            'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600',
                            'shadow-md shadow-orange-200/40',
                            () => { impact('heavy'); handleArriveDropoff(trip); }
                          );
                        }

                        // STEP 7: Complete Trip (red)
                        if (trip.status === 'At Dropoff' || trip.status === 'Arrived') {
                          return renderPrimaryBtn(
                            'Complete Trip',
                            <Check size={13} />,
                            'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600',
                            'shadow-md shadow-red-200/40',
                            () => { impact('heavy'); openCompleteModal(trip); }
                          );
                        }

                        return null;
                      })()}
                    </div>
                  </div>
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
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Current Odometer (mi)</label>
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
                <button type="button" onClick={() => setShowOdometerPrompt(null)} className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-bold text-base active:scale-95 transition-all cursor-pointer">Cancel</button>
                <button type="button" onClick={submitOdometer} disabled={!odometerValue} className="flex-1 py-3.5 bg-emerald-600 text-white rounded-2xl font-bold text-base disabled:opacity-40 active:scale-95 shadow-sm transition-all cursor-pointer">Confirm Arrival</button>
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
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Odometer at Arrival (mi)</label>
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
              <button type="button" onClick={() => setShowArrivalConfirm(null)} className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-bold text-base active:scale-95 transition-all cursor-pointer">Back</button>
              <button type="button" onClick={confirmArrival} className="flex-1 py-3.5 bg-emerald-600 text-white rounded-2xl font-bold text-base active:scale-95 shadow-sm transition-all cursor-pointer">Confirm Arrival</button>
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
              <button type="button" onClick={() => { setShowSignatureConfirm(null); setSignatureConfirmed(false); }} className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-bold text-base active:scale-95 transition-all cursor-pointer">Back</button>
              <button type="button" onClick={confirmSignatureAndBegin} disabled={!signatureConfirmed} className="flex-1 py-3.5 bg-emerald-600 text-white rounded-2xl font-bold text-base active:scale-95 shadow-sm disabled:opacity-40 transition-all cursor-pointer">Confirm & Begin</button>
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
                <span className="text-xs text-slate-400 font-bold uppercase">Pickup Odometer</span>
                <span className="text-sm font-bold text-slate-800">{showCompleteModal.pickupOdometer?.toLocaleString() || '—'} mi</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-slate-400 font-bold uppercase">Started At</span>
                <span className="text-sm font-bold text-slate-800">{showCompleteModal.startTime ? new Date(showCompleteModal.startTime).toLocaleTimeString() : '—'}</span>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">Departed Pickup Time</label>
                <input type="time" value={departedTime} onChange={(e) => setDepartedTime(e.target.value)}
                  className="w-full p-3.5 bg-white border border-slate-200 rounded-xl font-bold text-base text-center focus:border-blue-500 outline-none mt-1.5" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">Arrival Dropoff Time</label>
                <input type="time" value={arrivalDropoffTime} onChange={(e) => setArrivalDropoffTime(e.target.value)}
                  className="w-full p-3.5 bg-white border border-slate-200 rounded-xl font-bold text-base text-center focus:border-blue-500 outline-none mt-1.5" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Final Odometer (mi)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={completeOdometer}
                  onChange={(e) => setCompleteOdometer(e.target.value)}
                  placeholder="Enter final odometer"
                  className="w-full p-3.5 bg-white border border-slate-200 rounded-xl font-bold text-base text-center focus:border-blue-500 outline-none mt-1.5"
                  autoFocus
                />
              </div>
              {showCompleteModal.pickupOdometer && completeOdometer && (
                <div className="text-center text-sm text-blue-600 font-bold">
                  Distance: {(parseInt(completeOdometer) - (showCompleteModal.pickupOdometer || 0)).toLocaleString()} mi
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setShowCompleteModal(null)} className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-bold text-base active:scale-95 transition-all cursor-pointer">Cancel</button>
              <button type="button" onClick={submitComplete} disabled={!completeOdometer} className="flex-1 py-3.5 bg-emerald-600 text-white rounded-2xl font-bold text-base disabled:opacity-40 active:scale-95 shadow-sm transition-all cursor-pointer">Complete Trip</button>
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

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Trip Information</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 uppercase font-bold">Booking ID</p>
                  <p className="text-sm font-bold text-slate-800">{showTripDetails.bookingId || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 uppercase font-bold">Service Type</p>
                  <p className="text-sm font-bold text-slate-800">{showTripDetails.type || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 uppercase font-bold">Distance</p>
                  <p className="text-sm font-bold text-slate-800">{showTripDetails.distance ? `${showTripDetails.distance} mi` : '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 uppercase font-bold">Driver</p>
                  <p className="text-sm font-bold text-slate-800">{showTripDetails.driverId || '—'}</p>
                </div>
              </div>
            </div>

            {/* Smart Contacts Section */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><PhoneForwarded size={14} /> Contacts</h3>
              {(() => {
                const contacts = getContactsForTrip(showTripDetails);
                const warning = getContactWarning(showTripDetails, trips);
                const roleIcons = {
                  patient: { icon: User, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                  facility: { icon: Shield, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
                  escort: { icon: PhoneForwarded, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
                  dispatcher: { icon: Headphones, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
                  routing: { icon: Route, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
                };
                return (
                  <>
                    {warning.show && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2">
                        <AlertTriangle size={12} className="text-amber-600 shrink-0" />
                        <p className="text-xs font-medium text-amber-700">{warning.message}</p>
                      </div>
                    )}
                    <div className="space-y-2">
                      {contacts.map((contact, idx) => {
                        const roleStyle = roleIcons[contact.role] || roleIcons.patient;
                        const Icon = roleStyle.icon;
                        return (
                          <div key={idx} className={`flex items-center justify-between p-3 rounded-xl border ${roleStyle.border} ${roleStyle.bg}`}>
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${roleStyle.bg}`}>
                                <Icon size={14} className={roleStyle.color} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-slate-900 truncate">{contact.name}</p>
                                <p className="text-xs text-slate-500">{contact.label}{contact.isPrimary ? ' · Primary' : ''}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              <button type="button" onClick={() => handleCall(contact.phone, `${contact.label}: ${contact.name}`)} className="w-8 h-8 rounded-lg bg-white text-emerald-600 flex items-center justify-center active:scale-90 shadow-sm cursor-pointer"><Phone size={14} /></button>
                              {contact.role !== 'dispatcher' && contact.role !== 'routing' && (
                                <button type="button" onClick={() => handleSMS(contact.phone, contact.name)} className="w-8 h-8 rounded-lg bg-white text-blue-600 flex items-center justify-center active:scale-90 shadow-sm cursor-pointer"><MessageCircle size={14} /></button>
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

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Timeline & Odometer</h3>
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
                    <span className="text-xs text-slate-500">Pickup Odometer</span>
                    <span className="text-xs font-bold text-slate-800">{showTripDetails.pickupOdometer?.toLocaleString()} mi</span>
                  </div>
                )}
                {showTripDetails.arrivalOdometer && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Arrival Odometer</span>
                    <span className="text-xs font-bold text-slate-800">{showTripDetails.arrivalOdometer?.toLocaleString()} mi</span>
                  </div>
                )}
                {showTripDetails.dropoffOdometer && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Dropoff Odometer</span>
                    <span className="text-xs font-bold text-slate-800">{showTripDetails.dropoffOdometer?.toLocaleString()} mi</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Actions</h3>
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
          driverPosition={driverPosition}
          appSettings={appSettings}
          currentUser={currentUser}
          role={role}
          onSetGuidedMode={setGuidedMode}
          onSetGuidedStepIndex={setGuidedStepIndex}
          onSetAiSequence={setAiSequence}
          onSetAiSuggestions={setAiSuggestions}
          onRunAiOptimization={runAiOptimization}
          selectedTrips={selectedTrips}
          onSetSelectedTrips={setSelectedTrips}
          etas={etas}
          onOpenInNav={(addr) => { impact('medium'); openInNavApp(addr, suggestNavApp(addr)); }}
        />
      )}

      {/* ===== HISTORY PAGE ===== */}
      {isClockedIn && activeNav === 'history' && (
        <div className="flex-1 overflow-y-auto pb-28 px-3 pt-2">
          <div className="px-1 pt-2 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">History</h2>
                <p className="text-xs text-slate-400 mt-0.5">Review past trips and activity</p>
              </div>
              {allHistory.length > 0 && (
                <button onClick={exportDailyLog} className="px-3 h-8 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 shadow-sm">
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
            ].map(f => (
              <button key={f.id} onClick={() => setHistoryFilter(f.id)}
                className={`px-4 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 whitespace-nowrap ${historyFilter === f.id ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-100 shadow-sm hover:bg-slate-50'}`}>
                {f.label} ({f.id === 'all' ? allHistory.length : f.id === 'completed' ? completedTrips.length : f.id === 'noshow' ? noShowTrips.length : cancelledTrips.length})
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredHistory.length === 0 ? (
              <div className="bg-white/80 backdrop-blur-md rounded-3xl border border-slate-100/50 p-12 text-center shadow-sm">
                <div className="w-16 h-16 bg-gradient-to-br from-slate-50 to-slate-100 rounded-[2rem] flex items-center justify-center mx-auto mb-4 shadow-inner">
                  <Clock size={28} className="text-slate-300" />
                </div>
                <h3 className="text-base font-bold text-slate-700">{historySearch ? 'No matching trips' : 'No history'}</h3>
                <p className="text-sm text-slate-400 mt-1">{historySearch ? 'Try a different search term.' : 'Your completed trips will appear here.'}</p>
              </div>
            ) : (
              filteredHistory.map(trip => {
                const styles = {
                  'Completed': { bg: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
                  'No Show': { bg: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
                  'Cancelled': { bg: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
                };
                const s = styles[trip.status] || styles['Completed'];
                return (
                  <div key={trip.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden active:scale-[0.99] transition-all cursor-pointer">
                    <div onClick={() => setShowTripDetails(trip)} className="p-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className={`w-2 h-2 rounded-full ${s.dot}`} />
                            <h4 className="font-bold text-sm text-slate-900 leading-tight break-words">{trip.patient}</h4>
                            {trip.bookingId && <span className="text-xs text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded shrink-0">{trip.bookingId}</span>}
                          </div>
                          <p className="text-sm font-bold text-blue-600 mt-1">{to12hr(trip.time)}</p>
                          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500">
                            <ArrowRight size={10} className="text-emerald-500 shrink-0" />
                            <span className="break-words">{trip.pickup}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                            <ArrowRight size={10} className="text-rose-500 shrink-0" />
                            <span className="break-words">{trip.dropoff}</span>
                          </div>
                          {(trip.pickupOdometer || trip.dropoffOdometer) && (
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                              {trip.pickupOdometer && <span>Start: {trip.pickupOdometer?.toLocaleString()} mi</span>}
                              {trip.dropoffOdometer && <span>End: {trip.dropoffOdometer?.toLocaleString()} mi</span>}
                              {trip.pickupOdometer && trip.dropoffOdometer && (
                                <span className="text-blue-500">+{(trip.dropoffOdometer - trip.pickupOdometer)?.toLocaleString()} mi</span>
                              )}
                            </div>
                          )}
                          {trip.distance && (
                            <p className="text-xs text-slate-400 mt-0.5">Distance: {trip.distance} mi</p>
                          )}
                          {trip.completedAt && (
                            <p className="text-xs text-slate-400 mt-1">{new Date(trip.completedAt).toLocaleString()}</p>
                          )}
                        </div>
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider shrink-0 ${s.bg}`}>
                          {trip.status}
                        </span>
                      </div>
                    </div>
                    <div className="px-2 pb-2 flex gap-2">
                      <button type="button" onClick={() => setShowTripDetails(trip)} className="flex-1 h-9 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"><FileText size={12} /> Details</button>
                      <button type="button" onClick={() => restoreHistoryTrip(trip)} className={`flex-1 h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer ${trip.status === 'No Show' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}><RotateCcw size={12} /> Restore</button>
                    </div>
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
          <ChatPage currentUser={currentUser} role={role} />
        </div>
      )}

      {/* ===== SETTINGS PAGE ===== */}
      {activeNav === 'settings' && (
        <div className="flex-1 overflow-y-auto pb-28 px-3 pt-2">
          <div className="px-1 pt-2 pb-3">
            <h2 className="text-xl font-bold text-slate-900">Settings</h2>
            <p className="text-xs text-slate-400 mt-0.5">Account and app preferences</p>
          </div>
          <div className="space-y-4 px-1">
            {/* Profile Card */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600/90 to-indigo-700/90 shadow-lg shadow-blue-600/10">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.1),transparent_60%)]" />
              <div className="relative px-5 py-5">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl font-black text-white shadow-inner border border-white/10">
                    {me?.name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold text-white truncate">{me?.name}</h2>
                    <p className="text-sm text-white/70 truncate">{me?.email}</p>
                    <p className="text-xs text-white/50 mt-0.5">{me?.vehicle || 'No vehicle'} • {me?.currentZone || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <button onClick={handleStatusToggle} className={`px-4 h-9 rounded-xl font-bold text-xs uppercase tracking-wider transition-all active:scale-95 shadow-sm border ${isClockedIn ? 'bg-rose-500 text-white border-rose-500' : 'bg-emerald-500 text-white border-emerald-500'}`}>
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
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isOnline ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                    {isOnline ? <Wifi size={18} /> : <WifiOff size={18} />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{isOnline ? 'Connected' : 'Offline'}</p>
                    <p className="text-xs text-slate-400">Location sharing active</p>
                  </div>
                </div>
                <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'} ${isOnline ? 'animate-pulse' : ''}`} />
              </div>
            </div>

            {/* Analytics */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button onClick={() => setShowAnalytics(!showAnalytics)} className="w-full p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <BarChart3 size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Today's Analytics</p>
                    <p className="text-xs text-slate-400">{analytics.tripsCompleted} trips completed</p>
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
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">Time Distribution</p>
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
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.12em]">Odometer</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{me?.odometer?.toLocaleString() || 0} <span className="text-sm font-medium text-slate-400">mi</span></p>
                  <p className="text-xs text-slate-400 mt-1">Next service at {me?.nextOilChange?.toLocaleString() || '5,000'} mi</p>
                </div>
                <Gauge size={32} className="text-slate-200" />
              </div>
            </div>

            {/* Vehicle Info */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.12em] mb-3">Vehicle Info</p>
              <div className="space-y-2.5 text-sm">
                {[
                  ['Vehicle', me?.vehicle || 'N/A'],
                  ['Zone', me?.currentZone || 'N/A'],
                  ['Status', isClockedIn ? 'Online' : 'Offline'],
                  ['GPS', 'Active'],
                  ['Background Tracking', backgroundLocation ? 'Enabled' : 'Not Available'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-slate-400 text-xs">{label}</span>
                    <span className={`font-semibold text-xs ${value === 'Online' || value === 'Active' || value === 'Enabled' ? 'text-emerald-600' : value === 'Offline' || value === 'Inactive' || value === 'Not Available' ? 'text-slate-400' : 'text-slate-800'}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation App */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
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
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3 text-slate-800 font-semibold"><Sun size={16} /> Theme</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'light', label: 'Light', icon: Sun },
                  { value: 'dark', label: 'Dark', icon: Moon },
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
                    { value: 'sm', label: 'Compact' },
                    { value: 'md', label: 'Standard' },
                    { value: 'lg', label: 'Large' },
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
            <button onClick={() => signOut(auth)} className="w-full flex items-center justify-between px-4 py-3.5 bg-white rounded-2xl border border-slate-100 shadow-sm hover:bg-rose-50/50 transition">
              <div className="flex items-center gap-3">
                <LogOut size={17} className="text-rose-400" />
                <span className="font-medium text-sm text-rose-600">Sign Out</span>
              </div>
              <ChevronRight size={15} className="text-slate-300" />
            </button>
          </div>
        </div>
      )}

      {/* ===== LEG SELECTION MODAL ===== */}
      {legActionPrompt && !passwordPrompt && (() => {
        const patientKey = (legActionPrompt.trip.patient || '').trim().toLowerCase();
        const allLegs = trips.filter(t => (t.patient || '').trim().toLowerCase() === patientKey && (t.driverId === me?.id || (t.driverEmail || '').toLowerCase() === (me?.email || '').toLowerCase()));
        const activeLegs = allLegs.filter(l => !['Completed','Cancelled','No Show'].includes(l.status));
        const actionLabel = legActionPrompt.type === 'noshow' ? 'No Show' : 'Cancelled';
        const allSelected = selectedLegsForAction.size === activeLegs.length;
        const toggleLeg = (id) => {
          setSelectedLegsForAction(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          });
        };
        const toggleAll = () => {
          setSelectedLegsForAction(prev => prev.size === activeLegs.length ? new Set() : new Set(activeLegs.map(l => l.id)));
        };
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-6" style={{ zIndex: 150 }} onClick={() => { setLegActionPrompt(null); setSelectedLegsForAction(new Set()); }}>
            <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl relative overflow-hidden pointer-events-auto" style={{ zIndex: 10 }} onClick={e => e.stopPropagation()}>
              {/* Header with step indicator */}
              <div className="px-5 py-4 bg-gradient-to-r from-rose-600 to-rose-500 text-white">
                <div className="flex items-center gap-0.5 mb-3">
                  <div className="h-1 flex-1 rounded-full bg-white/90" />
                  <div className="h-1 flex-1 rounded-full bg-white/30" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-white/60">Step 1 of 2</p>
                    <h3 className="text-base font-bold">Select Legs to {actionLabel}</h3>
                    <p className="text-xs text-white/70 mt-0.5">{legActionPrompt.trip.patient} — {activeLegs.length} active</p>
                  </div>
                  <button type="button" onClick={() => { setLegActionPrompt(null); setSelectedLegsForAction(new Set()); }} className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center active:scale-90 cursor-pointer"><X size={16} /></button>
                </div>
              </div>
              <div className="p-4 space-y-2 max-h-56 overflow-y-auto">
                {/* Select All toggle */}
                <button type="button" onClick={toggleAll} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition active:scale-95 cursor-pointer ${allSelected ? 'border-rose-200 bg-rose-50' : 'border-slate-100 hover:bg-slate-50'}`}>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${allSelected ? 'bg-rose-500 border-rose-500' : 'border-slate-300'}`}>
                    {allSelected && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-sm font-bold text-slate-900">Select All ({activeLegs.length})</span>
                </button>
                {allLegs.map((leg, idx) => {
                  const isTerminal = ['Completed','Cancelled','No Show'].includes(leg.status);
                  const isSelected = selectedLegsForAction.has(leg.id);
                  return (
                    <button
                      type="button"
                      key={leg.id}
                      onClick={() => { if (!isTerminal) toggleLeg(leg.id); }}
                      disabled={isTerminal}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition ${isTerminal ? 'opacity-40 cursor-not-allowed border-slate-100 bg-slate-50' : `active:scale-95 cursor-pointer ${isSelected ? 'border-rose-200 bg-rose-50' : 'border-slate-100 hover:bg-slate-50'}`}`}>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${isTerminal ? 'border-slate-200 bg-slate-100' : isSelected ? 'bg-rose-500 border-rose-500' : 'border-slate-300'}`}>
                        {isTerminal ? <Check size={10} className="text-slate-400" /> : isSelected && <Check size={12} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center text-[9px] font-black">L{idx + 1}</span>
                          <span className="text-sm font-bold text-slate-900 truncate">{leg.patient}</span>
                          {leg.bookingId && <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded shrink-0">{leg.bookingId}</span>}
                          {isTerminal && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${leg.status === 'Completed' ? 'bg-emerald-50 text-emerald-600' : leg.status === 'Cancelled' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>{leg.status}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
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
                    setLegActionPrompt(null);
                    setPasswordPrompt({ type: legActionPrompt.type, trip: legActionPrompt.trip, selectedLegIds: [...selectedLegsForAction] });
                  }}
                  disabled={selectedLegsForAction.size === 0}
                  className="w-full py-3 bg-rose-600 text-white rounded-xl font-bold text-sm active:scale-95 transition disabled:opacity-40 cursor-pointer">
                  {selectedLegsForAction.size === 0 ? 'Select at least one leg' : `Continue with ${selectedLegsForAction.size} Leg${selectedLegsForAction.size > 1 ? 's' : ''}`}
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
                          {leg.bookingId && <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded shrink-0">{leg.bookingId}</span>}
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${leg.status === 'Completed' ? 'bg-emerald-50 text-emerald-600' : leg.status === 'Cancelled' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>{leg.status}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
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
                  className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm active:scale-95 transition disabled:opacity-40 cursor-pointer">
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
              <div className={`h-1 flex-1 rounded-full ${passwordPrompt.type === 'restore' ? 'bg-blue-400' : 'bg-rose-400'}`} />
            </div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-4 text-center">Step 2 of 2</p>
            <div className="flex items-start justify-between mb-5">
              <div className="text-center flex-1">
                <div className={`w-14 h-14 bg-gradient-to-br rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg ${passwordPrompt.type === 'restore' ? 'from-blue-600 to-blue-500' : 'from-rose-600 to-rose-500'}`}>
                  <Lock size={24} className="text-white" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Confirm {passwordPrompt.type === 'noshow' ? 'No Show' : passwordPrompt.type === 'restore' ? 'Restore' : 'Cancelled'}</h3>
                <p className="text-xs text-slate-500 mt-1">{passwordPrompt.type === 'restore' ? 'Enter your password to restore selected trips' : `Enter your password to mark ${passwordPrompt.trip.patient} as ${passwordPrompt.type === 'noshow' ? 'No Show' : 'Cancelled'}`}</p>
                {passwordPrompt.selectedLegIds && passwordPrompt.selectedLegIds.length > 1 && (
                  <p className="text-xs text-rose-500 font-semibold mt-1">{passwordPrompt.selectedLegIds.length} leg{passwordPrompt.selectedLegIds.length !== 1 ? 's' : ''} will be affected</p>
                )}
              </div>
              <button type="button" onClick={() => { setPasswordPrompt(null); setPasswordValue(''); setPasswordError(''); }} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center active:scale-90 ml-2 shrink-0 cursor-pointer"><X size={16} className="text-slate-500" /></button>
            </div>
            <div className="space-y-4">
              {passwordPrompt.type !== 'restore' && (
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Reason</label>
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
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Password</label>
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
                <button type="button" onClick={() => { setPasswordPrompt(null); setPasswordValue(''); setPasswordError(''); }} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm active:scale-95 cursor-pointer">
                  Back
                </button>
                <button type="button" onClick={verifyPasswordAndProceed} disabled={!passwordValue || passwordVerifying} className={`flex-1 py-3 text-white rounded-xl font-bold text-sm disabled:opacity-40 active:scale-95 shadow-sm cursor-pointer ${passwordPrompt.type === 'restore' ? 'bg-blue-600' : 'bg-rose-600'}`}>
                  {passwordVerifying ? 'Verifying...' : passwordPrompt.type === 'noshow' ? 'Confirm No Show' : passwordPrompt.type === 'restore' ? 'Confirm Restore' : 'Confirm Cancelled'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== SMART CONTACT SELECTOR ===== */}
      {showContactSelector && (() => {
        const contacts = getContactsForTrip(showContactSelector);
        const warning = getContactWarning(showContactSelector, trips);
        const roleIcons = {
          patient: { icon: User, color: 'text-emerald-600', bg: 'bg-emerald-50', ring: 'ring-emerald-200' },
          facility: { icon: Shield, color: 'text-amber-600', bg: 'bg-amber-50', ring: 'ring-amber-200' },
          escort: { icon: PhoneForwarded, color: 'text-purple-600', bg: 'bg-purple-50', ring: 'ring-purple-200' },
          dispatcher: { icon: Headphones, color: 'text-blue-600', bg: 'bg-blue-50', ring: 'ring-blue-200' },
          routing: { icon: Route, color: 'text-indigo-600', bg: 'bg-indigo-50', ring: 'ring-indigo-200' },
        };
        const roleActions = {
          patient: { callLabel: 'Call Patient', smsLabel: 'Message Patient' },
          facility: { callLabel: 'Call Facility', smsLabel: 'Message Facility' },
          escort: { callLabel: 'Call Escort', smsLabel: 'Message Escort' },
          dispatcher: { callLabel: 'Call Dispatch', smsLabel: null },
          routing: { callLabel: 'Call Routing', smsLabel: null },
        };
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
                <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2">
                  <AlertTriangle size={12} className="text-amber-600 shrink-0" />
                  <p className="text-xs font-medium text-amber-700">{warning.message}</p>
                </div>
              )}

              {/* Contact List */}
              <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
                {contacts.map((contact, idx) => {
                  const roleStyle = roleIcons[contact.role] || roleIcons.patient;
                  const actions = roleActions[contact.role] || roleActions.patient;
                  const Icon = roleStyle.icon;
                  return (
                    <div key={idx} className={`rounded-xl border-2 ${contact.isPrimary ? `${roleStyle.ring} bg-white` : 'border-slate-100 bg-slate-50'} p-3`}>
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
                  className="w-full h-10 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 shadow-sm cursor-pointer">
                  <Phone size={14} /> Quick Call Primary Contact
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== BOTTOM NAVIGATION ===== */}
      <nav className="fixed bottom-0 left-0 right-0 flex justify-center pointer-events-none" style={{ zIndex: 50, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="mx-3 mb-3 w-full max-w-md bg-white/75 backdrop-blur-2xl rounded-2xl shadow-[0_4px_40px_rgba(0,0,0,0.08),0_1px_4px_rgba(0,0,0,0.04)] border border-white/60 px-1.5 py-1 pointer-events-auto">
          <div className="flex items-center justify-around">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActiveTab = activeNav === item.id;
              return (
                <button key={item.id} onClick={() => setActiveNav(item.id)}
                  className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-all duration-300 relative min-w-[52px] group ${
                    isActiveTab ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'
                  }`}>
                  <div className={`relative flex items-center justify-center transition-all duration-300 ${
                    isActiveTab
                      ? 'w-9 h-7 rounded-lg bg-blue-600/10 scale-100'
                      : 'w-7 h-7 rounded-lg scale-100 group-hover:scale-105'
                  }`}>
                    <Icon size={isActiveTab ? 17 : 15} strokeWidth={isActiveTab ? 2.5 : 1.5}
                      className={`transition-all duration-300 ${isActiveTab ? 'text-blue-600 drop-shadow-[0_0_6px_rgba(37,99,235,0.3)]' : 'text-slate-400'}`}
                    />
                    {item.id === 'chat' && chatUnread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[8px] font-bold min-w-[13px] h-3.5 px-1 rounded-full flex items-center justify-center leading-none shadow-sm border border-white/80">{chatUnread > 99 ? '99+' : chatUnread}</span>
                    )}
                  </div>
                  <span className={`text-[10px] font-semibold tracking-wide transition-all leading-none ${isActiveTab ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Offline Queue Indicator */}
      {offlineQueue.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-amber-600 text-white px-4 py-2 rounded-2xl shadow-lg text-xs font-bold flex items-center gap-2" style={{ zIndex: 100 }}>
          <WifiOff size={12} />
          {offlineQueue.length} pending sync
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
              <p className="text-xs text-slate-500 font-medium mb-4">{legs.length} leg{legs.length !== 1 ? 's' : ''}</p>
              <div className="space-y-2">
                {legs.map((leg, idx) => (
                  <div key={leg.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-400 uppercase">Leg {idx + 1}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${leg.status === 'Completed' ? 'bg-emerald-50 text-emerald-600' : leg.status === 'In Transit' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>{leg.status}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-400 mb-1">Booking: {leg.bookingId || '—'}</p>
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
                          <span className="text-xs font-bold text-slate-400 uppercase">{label}</span>
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
    </div>
  );
};

export default DriverPage;
