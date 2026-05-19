import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { tripMatchesTodayOrTomorrow } from '../utils/tripDate';
import { auth, db, doc, onSnapshot, getDoc, setDoc, signOut, EmailAuthProvider, reauthenticateWithCredential, saveOdometerReading } from '../config/firebase';
import { optimizeRoute as aiOptimizeRoute } from '../config/ai';
import { getDistanceMiles } from '../config/maps';
import LiveRouteMap from './LiveRouteMap';
import { showLocalNotification } from '../config/notifications';
import ChatPage from './ChatPage';
import {
  Truck, MapPin, Phone, MessageCircle, CheckCircle2, XCircle,
  AlertCircle, Navigation, Gauge, Clock, User, ChevronRight, Play, Check,
  ChevronUp, ChevronDown, Edit2, ListChecks, Sparkles, Target, RotateCcw, Lock,
  Home, History, MessageSquare, Settings, LogOut, ChevronLeft, Calendar,
  Wifi, WifiOff, Filter, ArrowRight, Send, Smile, Bell, Circle, Search,
  Star, Activity, Repeat, Zap, X, Route, PhoneCall, Radio, CircleDot,
  CheckSquare, Square, BrainCircuit, Map, BarChart3, Sun, Moon,
  Download, Trash2, FileText, AlertTriangle, Info, GripVertical,
  Timer, Copy
} from 'lucide-react';
import { openNavigation, showNavActionSheet, makeCall, sendSMS, showCallActionSheet } from '../utils/nativeActions';
import { impact } from '../utils/haptics';
import { isNativeShell } from '../utils/platform';

const cleanPhone = (p) => (p || '').replace(/[^0-9]/g, '');
const FACILITY_KEYS = ['hospital','center','clinic','academy','school','treatment','health','dental','pharmacy','office','suite','care','medical','therapy','rehab','wellness','surgery','diagnostic','lab','institute'];

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
  const [expandedTrip, setExpandedTrip] = useState(null);
  const [showArrivalConfirm, setShowArrivalConfirm] = useState(null);
  const [arrivalOdometer, setArrivalOdometer] = useState('');
  const [signatureConfirmed, setSignatureConfirmed] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(null);
  const [completeOdometer, setCompleteOdometer] = useState('');
  const [departedTime, setDepartedTime] = useState('');
  const [arrivalDropoffTime, setArrivalDropoffTime] = useState('');
  const [showTripDetails, setShowTripDetails] = useState(null);
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
  const gpsWatchId = useRef(null);
  const meRef = useRef(me);
  const lastUpdateRef = useRef(0);
  const queueRef = useRef([]);
  const etasRef = useRef({});
  const positionRef = useRef(null);
  meRef.current = me;
  positionRef.current = driverPosition;

  // Build consistent phone per patient across all trips
  const patientPhoneMap = useMemo(() => {
    const map = {};
    const byName = {};
    trips.forEach(t => {
      const key = (t.patient || '').trim().toLowerCase();
      if (!key) return;
      if (!byName[key]) byName[key] = [];
      byName[key].push(t);
    });
    Object.entries(byName).forEach(([name, pts]) => {
      const phones = pts.map(t => t.pickupPhone).filter(Boolean);
      const unique = [...new Set(phones)];
      const counts = unique.map(p => ({ phone: p, count: phones.filter(x => x === p).length }));
      counts.sort((a, b) => b.count - a.count);
      map[name] = counts[0]?.phone || pts[0]?.pickupPhone || pts[0]?.dropoffPhone || '';
    });
    return map;
  }, [trips]);

  const getClientPhone = (trip) => {
    if (!trip) return '';
    const key = (trip.patient || '').trim().toLowerCase();
    return trip.pickupPhone || patientPhoneMap[key] || trip.dropoffPhone || '';
  };

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

  // Notify urgent trips
  useEffect(() => {
    const urgent = orderedTrips.filter(t => getUrgency(t) > 0);
    urgent.forEach(t => {
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
    const prevStatus = trip.status === 'Arrived' ? 'In Transit' : trip.status === 'In Transit' ? 'Assigned' : null;
    if (!prevStatus) return;
    onUpdateTrip(trip.id, prevStatus, {});
  };

  const restoreHistoryTrip = (trip) => {
    if (!window.confirm(`Restore ${trip.patient} from "${trip.status}" to "${trip.status === 'Completed' ? 'Arrived' : 'Assigned'}"?`)) return;
    const prevStatus = trip.status === 'Completed' ? 'Arrived' : 'Assigned';
    onUpdateTrip(trip.id, prevStatus, {});
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

  // Batch update all ETAs
  useEffect(() => {
    if (!driverPosition || activeTrips.length === 0) return;
    const timer = setInterval(() => {
      activeTrips.forEach(t => calculateEta(t));
    }, 15000);
    activeTrips.forEach(t => calculateEta(t));
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
  };

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
    const lower = (address || '').toLowerCase();
    if (lower.includes('hospital') || lower.includes('medical center') || lower.includes('clinic')) return 'waze';
    if (lower.includes('ave') || lower.includes('st') || lower.includes('street') || lower.includes('drive')) return 'apple';
    return navApp;
  };

  const openInNavApp = async (address, app) => {
    const origin = driverPosition ? `${driverPosition.lat},${driverPosition.lng}` : '';
    if (isNativeShell()) {
      await showNavActionSheet(address, origin, app || navApp);
    } else {
      await openNavigation(address, app || navApp, origin);
    }
  };

  const handleCall = async (phone, name) => {
    if (isNativeShell()) {
      await showCallActionSheet(phone, name);
    } else {
      await makeCall(phone, name);
    }
  };

  const handleSMS = async (phone, name) => {
    await sendSMS(phone, name);
  };

  const handleStartTrip = (trip) => {
    setShowOdometerPrompt(trip);
    setOdometerValue(lastOdometer ? String(lastOdometer) : '');
  };

  const submitOdometer = () => {
    if (!showOdometerPrompt || !odometerValue) return;
    const odo = parseInt(odometerValue, 10);
    if (isNaN(odo)) return;
    if (lastOdometer > 0 && odo < lastOdometer && !window.confirm(`Warning: ${odo.toLocaleString()} mi is less than the last recorded reading of ${lastOdometer.toLocaleString()} mi. Continue anyway?`)) return;
    onUpdateTrip(showOdometerPrompt.id, 'In Transit', {
      pickupOdometer: odo,
      startTime: new Date().toISOString(),
      departureTime: new Date().toISOString(),
    });
    setLastOdometer(odo);
    setShowOdometerPrompt(null);
    setOdometerValue('');
  };

  const handleArrive = (trip) => {
    setShowArrivalConfirm(trip);
    setArrivalOdometer(odometerValue || '');
  };

  const confirmArrival = () => {
    if (!showArrivalConfirm) return;
    const odo = parseInt(arrivalOdometer, 10) || lastOdometer;
    if (lastOdometer > 0 && odo < lastOdometer && !window.confirm(`Warning: ${odo.toLocaleString()} mi is less than the last recorded reading of ${lastOdometer.toLocaleString()} mi. Continue anyway?`)) return;
    const arrivalNewStatus = showArrivalConfirm.status === 'In Transit' ? 'Arrived' : 'Completed';
    setUndoable(showArrivalConfirm, showArrivalConfirm.status, arrivalNewStatus);
    onUpdateTrip(showArrivalConfirm.id, arrivalNewStatus, {
      arrivalTime: new Date().toISOString(),
      arrivalOdometer: odo,
      paperSignatureConfirmed: signatureConfirmed,
    });
    setShowArrivalConfirm(null);
    setArrivalOdometer('');
    setSignatureConfirmed(false);
  };

  const handleNoShow = (trip) => {
    setPasswordPrompt({ type: 'noshow', trip });
  };

  const handleCancel = (trip) => {
    setPasswordPrompt({ type: 'cancel', trip });
  };

  const verifyPasswordAndProceed = async () => {
    if (!passwordPrompt || !passwordValue) return;
    setPasswordVerifying(true);
    setPasswordError('');
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, passwordValue);
      await reauthenticateWithCredential(auth.currentUser, credential);
      const { type, trip } = passwordPrompt;
      const newStatus = type === 'noshow' ? 'No Show' : 'Cancelled';
      setUndoable(trip, trip.status, newStatus);
      onUpdateTrip(trip.id, newStatus, { completedAt: new Date().toISOString() });
      setPasswordPrompt(null);
      setPasswordValue('');
      setPasswordError('');
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
    { id: 'history', label: 'History', icon: Clock },
    { id: 'chat', label: 'Chat', icon: MessageCircle },
    { id: 'profile', label: 'Profile', icon: User },
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
  };

  return (
    <div className="flex-1 flex flex-col bg-[#f5f5f7]">
      {/* ===== TRIPS PAGE ===== */}
      {activeNav === 'trips' && (
        <div className="flex-1 overflow-y-auto pb-28 px-1 pt-2 space-y-3">
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
              <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-xl p-3 shadow-md shadow-indigo-200/40 sticky top-0 z-10">
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

          {/* Multi-Select Controls */}
          {selectedTrips.length > 0 && (
            <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-3 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-blue-700">{selectedTrips.length} selected</span>
              <div className="flex gap-2">
                {selectedTrips.length >= 2 && (
                  <button onClick={() => runAiOptimization()} disabled={aiOptimizing}
                    className="px-3 h-8 bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition">
                    <BrainCircuit size={12} /> {aiOptimizing ? 'Analyzing...' : 'AI Optimize'}
                  </button>
                )}
                <button onClick={() => setSelectedTrips([])} className="px-3 h-8 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold active:scale-95 transition">Clear</button>
              </div>
            </div>
          )}

          {/* Smart Route Panel */}
          {aiSequence && aiSequence.length >= 2 && !guidedMode && (
            <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-2xl p-[1.5px] shadow-lg shadow-indigo-200/50">
              <div className="bg-white rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <BrainCircuit size={16} className="text-indigo-600" />
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Smart Route</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  {aiSequence.map((id, i) => {
                    const t = trips.find(t => t.id === id);
                    return (
                      <React.Fragment key={id}>
                        {i > 0 && <ChevronRight size={11} className="text-slate-300 shrink-0" />}
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${t && !['Assigned','Unassigned'].includes(t.status) ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                          {t?.patient || id}
                        </span>
                      </React.Fragment>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setGuidedMode(true); setGuidedStepIndex(0); guidedLastAdvance.current = -1; setAiSuggestions([]); }}
                    className="flex-1 h-10 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 shadow-sm">
                    <Play size={13} /> Start Smart Route
                  </button>
                  <button onClick={() => { setAiSequence(null); setAiSuggestions([]); }}
                    className="h-10 px-3 bg-slate-100 text-slate-500 rounded-xl text-xs font-bold active:scale-95">Dismiss</button>
                </div>
              </div>
            </div>
          )}

          {/* AI Suggestions (fallback for text-only) */}
          {aiSuggestions.length > 0 && (!aiSequence || aiSequence.length < 2) && (
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl p-3">
              <div className="flex items-start gap-2">
                <BrainCircuit size={14} className="text-indigo-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  {aiSuggestions.map((s, i) => (
                    <p key={i} className="text-sm font-medium text-indigo-800 leading-relaxed">{s}</p>
                  ))}
                </div>
                <button onClick={() => setAiSuggestions([])} className="text-indigo-400"><X size={14} /></button>
              </div>
            </div>
          )}

          {/* Live Route Map */}
          <LiveRouteMap
            driverPosition={driverPosition}
            trips={activeTrips}
            aiSequence={aiSequence}
            activeTripId={aiSequence?.[guidedStepIndex] || null}
            theme={appSettings?.theme || 'light'}
            onOpenInNav={(addr) => { impact('medium'); openInNavApp(addr, suggestNavApp(addr)); }}
            currentUser={currentUser}
            role={role}
          />

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
                const aiRank = aiSequence ? aiSequence.indexOf(trip.id) + 1 : null;
                const isExpanded = expandedTrip === trip.id;
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
                    className={`card overflow-hidden rounded-2xl ${isActive ? 'border-2 border-blue-200' : 'border border-slate-100'} ${isSelected ? 'ring-2 ring-blue-400' : ''} ${hasConflict ? 'ring-2 ring-rose-300' : ''} ${urgencyBorder} ${isGuidedCurrent ? 'ring-2 ring-indigo-400 shadow-lg shadow-indigo-200/40' : ''} transition-all`}>
                    {/* Top Bar: Time + Status + Actions */}
                    <div className={`px-2.5 pt-2.5 pb-2 ${isActive ? 'bg-blue-50/50' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <button onClick={() => toggleTripSelect(trip.id)} className="shrink-0 text-slate-400 hover:text-blue-600 mt-0.5">
                            {isSelected ? <CheckSquare size={20} className="text-blue-600" /> : <Square size={20} />}
                          </button>
                          <div className="min-w-0 flex-1">
                            {/* Time row */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-3xl font-black text-blue-600 tracking-tight leading-none">{to12hr(trip.time)}</span>
                              {isTomorrow && <span className="badge badge-warning shrink-0">Tomorrow</span>}
                              {urgency === 2 && <span className="badge badge-danger animate-pulse shrink-0">Overdue</span>}
                              {urgency === 1 && <span className="badge badge-warning shrink-0">Soon</span>}
                            </div>
                            {/* Patient name */}
                            <h3 className="text-lg font-extrabold text-slate-900 leading-tight mt-1 break-words">{trip.patient}</h3>
                            {/* Badges row */}
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              <span className={`badge shrink-0 ${isActive ? 'badge-info' : 'bg-slate-100 text-slate-500'}`}>{trip.status}</span>
                              {trip.bookingId && <span className="badge badge-info shrink-0 text-xs">{trip.bookingId}</span>}
                              {legsCount > 1 && <button onClick={() => setLegsDetailPatient(trip.patient)} className="badge badge-info shrink-0 cursor-pointer hover:opacity-80">{legsCount} legs</button>}
                              {aiRank && <span className="badge badge-info shrink-0">#{aiRank}</span>}
                              {hasConflict && <AlertTriangle size={14} className="text-rose-500 shrink-0" />}
                              {rideShareTrip && <Repeat size={14} className="text-emerald-500 shrink-0" />}
                              {eta !== undefined && (
                                <span className="flex items-center gap-1 text-xs text-slate-500 font-semibold shrink-0">
                                  <Timer size={12} /> {formatDuration(eta)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {/* Quick actions */}
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <button onClick={() => handleCall(getClientPhone(trip), trip.patient)} className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 active:scale-90 transition-all"><Phone size={16} /></button>
                          <button onClick={() => handleSMS(getClientPhone(trip), trip.patient)} className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 active:scale-90 transition-all"><MessageCircle size={16} /></button>
                          <button onClick={() => setExpandedTrip(isExpanded ? null : trip.id)} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isExpanded ? 'bg-blue-100 text-blue-600' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                            <ChevronDown size={16} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Route Section */}
                    <div className="px-2.5 py-2">
                      <div className="relative pl-7">
                        <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-200 rounded-full" />
                        {/* Pickup */}
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-5 h-5 rounded-full bg-emerald-500 border-2 border-emerald-100 shrink-0 mt-0.5 flex items-center justify-center shadow-sm">
                            <span className="text-[8px] font-black text-white leading-none">P</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pickup</p>
                            <p className="text-sm font-bold text-slate-800 leading-snug mt-0.5 break-words">{trip.pickup}</p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <button onClick={() => openInNavApp(trip.pickup, suggestNavApp(trip.pickup))} className="text-xs text-blue-600 font-bold flex items-center gap-1 px-2 py-1 bg-blue-50 rounded-lg active:scale-95"><Navigation size={12} /> Nav</button>
                              <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(trip.pickup).catch(() => {}); }} className="text-xs text-slate-400 hover:text-blue-600 px-2 py-1 hover:bg-blue-50 rounded-lg" title="Copy"><Copy size={12} /></button>
                            </div>
                          </div>
                        </div>
                        {/* Dropoff */}
                        <div className="flex items-start gap-3">
                          <div className="w-5 h-5 rounded-full bg-rose-500 border-2 border-rose-100 shrink-0 mt-0.5 flex items-center justify-center shadow-sm">
                            <span className="text-[8px] font-black text-white leading-none">D</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dropoff</p>
                            <p className="text-sm font-bold text-slate-800 leading-snug mt-0.5 break-words">{trip.dropoff}</p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <button onClick={() => openInNavApp(trip.dropoff, suggestNavApp(trip.dropoff))} className="text-xs text-rose-600 font-bold flex items-center gap-1 px-2 py-1 bg-rose-50 rounded-lg active:scale-95"><Navigation size={12} /> Nav</button>
                              <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(trip.dropoff).catch(() => {}); }} className="text-xs text-slate-400 hover:text-rose-600 px-2 py-1 hover:bg-rose-50 rounded-lg" title="Copy"><Copy size={12} /></button>
                            </div>
                          </div>
                        </div>
                      </div>
                      {trip.notes && (
                        <div className="mt-2.5 bg-amber-50/80 rounded-xl px-3 py-2 border border-amber-100/50">
                          <p className="text-xs text-amber-800 font-medium leading-relaxed">{trip.notes}</p>
                        </div>
                      )}
                      {trip.distance && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400 font-medium ml-1">
                          <MapPin size={12} />
                          <span>{trip.distance} mi estimated</span>
                        </div>
                      )}
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-slate-50 pt-3 space-y-3 animate-in">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-slate-50 rounded-xl p-3">
                            <p className="text-xs text-slate-400 uppercase font-bold">Booking ID</p>
                            <p className="text-sm font-bold text-slate-800 mt-0.5">{trip.bookingId || '—'}</p>
                          </div>
                          <div className="bg-slate-50 rounded-xl p-3">
                            <p className="text-xs text-slate-400 uppercase font-bold">Service Type</p>
                            <p className="text-sm font-bold text-slate-800 mt-0.5">{trip.type || '—'}</p>
                          </div>
                          <div className="bg-slate-50 rounded-xl p-3">
                            <p className="text-xs text-slate-400 uppercase font-bold">Patient Phone</p>
                            <p className="text-sm font-bold text-slate-800 mt-0.5">{trip.pickupPhone || '—'}</p>
                          </div>
                          <div className="bg-slate-50 rounded-xl p-3">
                            <p className="text-xs text-slate-400 uppercase font-bold">Hospital Phone</p>
                            <p className="text-sm font-bold text-slate-800 mt-0.5">{trip.dropoffPhone || '—'}</p>
                          </div>
                        </div>
                        {trip.pickupOdometer && (
                          <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-2">
                            <Gauge size={14} className="text-slate-400" />
                            <span className="text-sm text-slate-600">Pickup Odometer: <strong className="text-slate-800">{trip.pickupOdometer?.toLocaleString()} mi</strong></span>
                          </div>
                        )}
                        {trip.startTime && (
                          <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-2">
                            <Clock size={14} className="text-slate-400" />
                            <span className="text-sm text-slate-600">Started: <strong className="text-slate-800">{new Date(trip.startTime).toLocaleTimeString()}</strong></span>
                          </div>
                        )}
                        {eta !== undefined && (
                          <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-2">
                            <Timer size={14} className="text-slate-400" />
                            <span className="text-sm text-slate-600">ETA: <strong className="text-slate-800">{formatDuration(eta)}</strong></span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="px-2 pb-2">
                      {trip.status === 'Assigned' || trip.status === 'Unassigned' ? (
                        <div className="grid grid-cols-4 gap-2">
                          <button onClick={() => { impact('heavy'); handleStartTrip(trip); }} className="btn btn-primary text-sm col-span-2">
                            <Play size={16} /> Start Trip
                          </button>
                          <button onClick={() => { impact('medium'); handleNoShow(trip); }} className="btn bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 text-xs">No Show</button>
                          <button onClick={() => { impact('medium'); handleCancel(trip); }} className="btn bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 text-xs">Cancel</button>
                        </div>
                      ) : trip.status === 'In Transit' ? (
                        <div className="grid grid-cols-4 gap-2">
                          <button onClick={() => { impact('heavy'); openInNavApp(trip.pickup, suggestNavApp(trip.pickup)); }} className="btn btn-primary text-sm col-span-2">
                            <Navigation size={16} /> Pickup
                          </button>
                          <button onClick={() => { impact('heavy'); handleArrive(trip); }} className="btn bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 text-sm">
                            <MapPin size={16} /> Arrived
                          </button>
                          <button onClick={() => { impact('medium'); handleNoShow(trip); }} className="btn bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 text-xs">No Show</button>
                          <button onClick={() => { impact('medium'); handleCancel(trip); }} className="btn bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 text-xs col-span-2">Cancel</button>
                          <button onClick={() => { impact('light'); revertTripStatus(trip); }} className="btn btn-ghost w-12 p-0" title="Back to Assigned">
                            <RotateCcw size={16} />
                          </button>
                          <button onClick={() => { impact('light'); setShowTripDetails(trip); }} className="btn btn-ghost w-12 p-0" title="Full details"><FileText size={18} /></button>
                        </div>
                      ) : trip.status === 'Arrived' ? (
                        <div className="grid grid-cols-4 gap-2">
                          <button onClick={() => { impact('heavy'); openInNavApp(trip.dropoff, suggestNavApp(trip.dropoff)); }} className="btn bg-rose-600 text-white shadow-sm hover:bg-rose-700 text-sm col-span-2">
                            <Navigation size={16} /> Dropoff
                          </button>
                          <button onClick={() => { impact('heavy'); openCompleteModal(trip); }} className="btn bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 text-sm">
                            <Check size={16} /> Complete
                          </button>
                          <button onClick={() => { impact('medium'); handleNoShow(trip); }} className="btn bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 text-xs">No Show</button>
                          <button onClick={() => { impact('medium'); handleCancel(trip); }} className="btn bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 text-xs col-span-2">Cancel</button>
                          <button onClick={() => { impact('light'); revertTripStatus(trip); }} className="btn btn-ghost w-12 p-0" title="Back to In Transit">
                            <RotateCcw size={16} />
                          </button>
                          <button onClick={() => { impact('light'); setShowTripDetails(trip); }} className="btn btn-ghost w-12 p-0" title="Full details"><FileText size={18} /></button>
                        </div>
                      ) : null}
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
        <div className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl relative z-10 border border-white/20">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-600/20">
                <Gauge size={28} className="text-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Odometer Reading</h3>
              <p className="text-sm text-slate-500 mt-1 font-medium">{showOdometerPrompt.patient} — {to12hr(showOdometerPrompt.time)}</p>
              {lastOdometer > 0 && (
                <p className="text-sm text-slate-400 mt-2">Last reading: <strong className="text-slate-700">{lastOdometer?.toLocaleString()} mi</strong></p>
              )}
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
                <button onClick={() => setShowOdometerPrompt(null)} className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-bold text-base active:scale-95 transition-all">Cancel</button>
                <button onClick={submitOdometer} disabled={!odometerValue} className="flex-1 py-3.5 bg-blue-600 text-white rounded-2xl font-bold text-base disabled:opacity-40 active:scale-95 shadow-sm transition-all">Start Trip</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== ARRIVAL CONFIRM MODAL ===== */}
      {showArrivalConfirm && (
        <div className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl relative z-10 border border-white/20">
            <div className="text-center mb-5">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-600 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-600/20">
                <MapPin size={28} className="text-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Arrived at Location</h3>
              <p className="text-sm text-slate-500 mt-1 font-medium">{showArrivalConfirm.patient}</p>
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
              {showArrivalConfirm.pickupPhone && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400 font-bold uppercase">Phone</span>
                  <button onClick={() => handleCall(showArrivalConfirm.pickupPhone, showArrivalConfirm.patient)} className="text-sm font-bold text-blue-600 flex items-center gap-1 hover:underline">
                    <Phone size={14} /> {showArrivalConfirm.pickupPhone}
                  </button>
                </div>
              )}
              {showArrivalConfirm.notes && (
                <div className="pt-3 border-t border-slate-200">
                  <p className="text-xs text-slate-400 font-bold uppercase mb-1.5">Notes</p>
                  <p className="text-sm text-slate-700">{showArrivalConfirm.notes}</p>
                </div>
              )}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-3">
                  <Info size={16} className="shrink-0" />
                  <span className="font-medium">Obtain paper signature from client before proceeding.</span>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                  <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1.5">Dispatcher Confirmation</p>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={signatureConfirmed} onChange={e => setSignatureConfirmed(e.target.checked)} className="w-4 h-4 rounded" />
                      <span className="text-sm text-slate-600 font-medium">Paper signature obtained from client</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowArrivalConfirm(null)} className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-bold text-base active:scale-95 transition-all">Back</button>
              <button onClick={confirmArrival} disabled={!signatureConfirmed} className="flex-1 py-3.5 bg-emerald-600 text-white rounded-2xl font-bold text-base active:scale-95 shadow-sm disabled:opacity-40 transition-all">
                {showArrivalConfirm.status === 'In Transit' ? 'Confirm Arrival' : 'Confirm Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== COMPLETE TRIP MODAL ===== */}
      {showCompleteModal && (
        <div className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl relative z-10 border border-white/20">
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
              <button onClick={() => setShowCompleteModal(null)} className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-bold text-base active:scale-95 transition-all">Cancel</button>
              <button onClick={submitComplete} disabled={!completeOdometer} className="flex-1 py-3.5 bg-emerald-600 text-white rounded-2xl font-bold text-base disabled:opacity-40 active:scale-95 shadow-sm transition-all">Complete Trip</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== FULL-SCREEN TRIP DETAILS ===== */}
      {showTripDetails && (
        <div className="fixed inset-0 z-[130] bg-white flex flex-col animate-slide-up">
          <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center gap-3 shrink-0">
            <button onClick={() => setShowTripDetails(null)} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center active:scale-90"><ChevronLeft size={18} /></button>
            <div className="flex-1">
              <h2 className="font-bold text-sm text-slate-900 leading-tight">{showTripDetails.patient}</h2>
              <p className="text-xs text-slate-400">{showTripDetails.bookingId || '—'}</p>
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
                    {showTripDetails.pickupPhone && <button onClick={() => handleCall(showTripDetails.pickupPhone, showTripDetails.patient)} className="text-sm text-blue-200 font-bold flex items-center gap-1 mt-0.5"><Phone size={10} /> {showTripDetails.pickupPhone}</button>}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-rose-300" />
                  <div>
                    <p className="text-xs text-white/60 uppercase font-bold">Dropoff</p>
                    <p className="text-sm font-semibold">{showTripDetails.dropoff}</p>
                    {showTripDetails.dropoffPhone && <button onClick={() => handleCall(showTripDetails.dropoffPhone, showTripDetails.patient)} className="text-sm text-blue-200 font-bold flex items-center gap-1 mt-0.5"><Phone size={10} /> {showTripDetails.dropoffPhone}</button>}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => openInNavApp(showTripDetails.pickup, suggestNavApp(showTripDetails.pickup))} className="flex-1 h-9 bg-blue-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95"><Navigation size={12} /> Pickup</button>
                <button onClick={() => openInNavApp(showTripDetails.dropoff, suggestNavApp(showTripDetails.dropoff))} className="flex-1 h-9 bg-rose-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95"><Navigation size={12} /> Dropoff</button>
                <button onClick={() => handleCall(getClientPhone(showTripDetails), showTripDetails.patient)} className="flex-1 h-9 bg-emerald-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95"><Phone size={12} /> Call</button>
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
                  <p className="text-xs text-slate-400 uppercase font-bold">Patient Phone</p>
                  <p className="text-sm font-bold text-slate-800">{showTripDetails.pickupPhone || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 uppercase font-bold">Dropoff Phone</p>
                  <p className="text-sm font-bold text-slate-800">{showTripDetails.dropoffPhone || '—'}</p>
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
                <button onClick={() => openInNavApp(showTripDetails.pickup, 'google')} className="flex-1 h-10 bg-slate-100 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 active:scale-95"><Map size={12} /> Google Maps</button>
                <button onClick={() => openInNavApp(showTripDetails.pickup, 'waze')} className="flex-1 h-10 bg-slate-100 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 active:scale-95"><Navigation size={12} /> Waze</button>
                <button onClick={() => openInNavApp(showTripDetails.pickup, 'apple')} className="flex-1 h-10 bg-slate-100 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 active:scale-95"><Map size={12} /> Apple</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== HISTORY PAGE ===== */}
      {activeNav === 'history' && (
        <div className="flex-1 overflow-y-auto pb-28 px-1 pt-2">
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
                    <div onClick={() => setShowTripDetails(trip)} className="p-3">
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
                    <div className="px-2.5 pb-2.5 flex gap-2">
                      <button onClick={() => setShowTripDetails(trip)} className="flex-1 h-9 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95"><FileText size={12} /> Details</button>
                      <button onClick={() => restoreHistoryTrip(trip)} className="flex-1 h-9 bg-blue-100 text-blue-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95"><RotateCcw size={12} /> Restore</button>
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

      {/* ===== PROFILE PAGE ===== */}
      {activeNav === 'profile' && (
        <div className="flex-1 overflow-y-auto pb-28 px-1 pt-2 space-y-3">
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

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <button onClick={() => setActiveNav('settings')} className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50/50 transition border-b border-slate-100/50">
              <div className="flex items-center gap-3">
                <Settings size={17} className="text-slate-400" />
                <span className="font-medium text-sm text-slate-800">Settings</span>
              </div>
              <ChevronRight size={15} className="text-slate-300" />
            </button>
            <button onClick={() => signOut(auth)} className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-rose-50/50 transition">
              <div className="flex items-center gap-3">
                <LogOut size={17} className="text-rose-400" />
                <span className="font-medium text-sm text-rose-600">Sign Out</span>
              </div>
              <ChevronRight size={15} className="text-slate-300" />
            </button>
          </div>
        </div>
      )}

      {/* ===== SETTINGS PAGE ===== */}
      {activeNav === 'settings' && (
        <div className="flex-1 overflow-y-auto pb-28 px-1 pt-2">
          <div className="px-1 pt-2 pb-3">
            <h2 className="text-xl font-bold text-slate-900">Settings</h2>
            <p className="text-xs text-slate-400 mt-0.5">Account and app preferences</p>
          </div>
          <div className="space-y-4 px-1">
            {/* Profile Card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg">{me?.name?.charAt(0) || 'D'}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-slate-900 truncate">{me?.name || 'Driver'}</p>
                  <p className="text-sm text-slate-500 truncate">{me?.vehicle || 'No vehicle'} &bull; {me?.status}</p>
                </div>
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

      {/* ===== UNDO TOAST ===== */}
      {undoableAction && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[140] bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 backdrop-blur-sm text-xs font-semibold animate-slide-up">
          <RotateCcw size={14} className="text-amber-300 shrink-0" />
          <span>{undoableAction.trip.patient} marked as <strong>{undoableAction.newStatus}</strong></span>
          <button onClick={handleUndo} className="ml-2 px-3 h-7 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-bold text-white active:scale-95 transition-all">Undo</button>
        </div>
      )}

      {/* ===== PASSWORD CONFIRM MODAL ===== */}
      {passwordPrompt && (
        <div className="fixed inset-0 z-[150] bg-black/40 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl relative z-10">
            <div className="text-center mb-5">
              <div className="w-14 h-14 bg-gradient-to-br from-rose-600 to-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Lock size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Confirm {passwordPrompt.type === 'noshow' ? 'No Show' : 'Cancel'}</h3>
              <p className="text-xs text-slate-500 mt-1">Enter your password to mark {passwordPrompt.trip.patient} as {passwordPrompt.type === 'noshow' ? 'No Show' : 'Cancelled'}</p>
            </div>
            <div className="space-y-4">
              <div>
                <input
                  type="password"
                  value={passwordValue}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && verifyPasswordAndProceed()}
                  placeholder="Your password"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-center focus:border-rose-500 outline-none"
                  autoFocus
                />
                {passwordError && <p className="text-xs text-rose-600 font-semibold mt-1 text-center">{passwordError}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setPasswordPrompt(null); setPasswordValue(''); setPasswordError(''); }} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm active:scale-95">Cancel</button>
                <button onClick={verifyPasswordAndProceed} disabled={!passwordValue || passwordVerifying} className="flex-1 py-3 bg-rose-600 text-white rounded-2xl font-bold text-sm disabled:opacity-40 active:scale-95 shadow-sm">
                  {passwordVerifying ? 'Verifying...' : passwordPrompt.type === 'noshow' ? 'Mark No Show' : 'Cancel Trip'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== BOTTOM NAVIGATION ===== */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-center" style={{paddingBottom: 'env(safe-area-inset-bottom, 0px)'}}>
        <div className="mx-3 mb-2 w-full max-w-md bg-white/50 backdrop-blur-3xl rounded-3xl shadow-[0_-2px_30px_rgba(0,0,0,0.06)] border border-white/40 px-2 py-0.5">
          <div className="flex items-center justify-around">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActiveTab = activeNav === item.id;
              return (
                <button key={item.id} onClick={() => setActiveNav(item.id)}
                  className={`flex flex-col items-center gap-0 py-1 px-2 rounded-2xl transition-all relative min-w-[48px] ${isActiveTab ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all relative ${isActiveTab ? 'bg-blue-50' : ''}`}>
                    <Icon size={17} strokeWidth={isActiveTab ? 2.5 : 1.5} className="transition-all" />
                    {item.id === 'chat' && chatUnread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-xs font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center leading-none shadow-sm border border-white">{chatUnread > 99 ? '99+' : chatUnread}</span>
                    )}
                  </div>
                  <span className={`text-xs font-bold uppercase tracking-wider transition-all leading-none ${isActiveTab ? 'text-blue-600' : 'text-slate-400'}`}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Offline Queue Indicator */}
      {offlineQueue.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-amber-600 text-white px-4 py-2 rounded-2xl shadow-lg text-xs font-bold flex items-center gap-2">
          <WifiOff size={12} />
          {offlineQueue.length} pending sync
        </div>
      )}

      {/* Swipe hint toast */}
      {activeNav === 'trips' && orderedTrips.some(t => t.status === 'Arrived') && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[90] bg-slate-800/80 text-white px-4 py-2 rounded-2xl shadow-lg text-xs font-medium flex items-center gap-2 backdrop-blur-sm">
          <GripVertical size={12} />
          Swipe left on Arrived trips to complete
        </div>
      )}

      {/* Legs Detail Modal */}
      {legsDetailPatient && (() => {
        const patientName = legsDetailPatient;
        const legs = orderedTrips.filter(t => (t.patient || '').trim().toLowerCase() === patientName.trim().toLowerCase());
        return (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4" onClick={() => setLegsDetailPatient(null)}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="bg-white w-full max-w-lg rounded-3xl p-5 relative z-10 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-900">{patientName}</h3>
                <button onClick={() => setLegsDetailPatient(null)} className="p-1.5 bg-slate-100 rounded-xl text-slate-500 hover:bg-slate-200"><X size={16} /></button>
              </div>
              <p className="text-xs text-slate-500 font-medium mb-4">{legs.length} legs</p>
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
                    {leg.pickupPhone && <p className="mt-1.5 text-xs text-slate-400">Phone: {leg.pickupPhone}</p>}
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
