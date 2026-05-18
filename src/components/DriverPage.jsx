import React, { useState, useEffect, useRef, useCallback } from 'react';
import { tripMatchesTodayOrTomorrow } from '../utils/tripDate';
import { auth, db, updateDriverLocation, saveOdometerReading, doc, onSnapshot, getDoc, setDoc, signOut, EmailAuthProvider, reauthenticateWithCredential } from '../config/firebase';
import { optimizeRoute as aiOptimizeRoute } from '../config/ai';
import { geocodeAddress, getDistanceMiles, buildStaticMapUrl, hasGoogleMapsConfigured, haversineMiles } from '../config/maps';
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
  Timer
} from 'lucide-react';

const cleanPhone = (p) => (p || '').replace(/[^0-9]/g, '');
const FACILITY_KEYS = ['hospital','center','clinic','academy','school','treatment','health','dental','pharmacy','office','suite','care','medical','therapy','rehab','wellness','surgery','diagnostic','lab','institute'];

const clientPhone = (trip) => {
  if (!trip) return '';
  const pickupFac = FACILITY_KEYS.some(k => (trip.pickup || '').toLowerCase().includes(k));
  const dropFac = FACILITY_KEYS.some(k => (trip.dropoff || '').toLowerCase().includes(k));
  if (pickupFac && !dropFac) return trip.dropoffPhone || trip.pickupPhone || '';
  if (!pickupFac && dropFac) return trip.pickupPhone || trip.dropoffPhone || '';
  return trip.pickupPhone || trip.dropoffPhone || '';
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

const timeToMinutes = (t) => {
  if (!t || t === 'Will Call' || t === 'WC') return 1440;
  const m = String(t).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return 1440;
  let h = parseInt(m[1], 10);
  let min = parseInt(m[2] || '0', 10);
  const p = m[3];
  if (p && p.toUpperCase() === 'PM' && h < 12) h += 12;
  if (p && p.toUpperCase() === 'AM' && h === 12) h = 0;
  if (!p && h < 6) h += 12;
  return h * 60 + min;
};

const formatDuration = (minutes) => {
  if (!minutes || minutes < 0) return '--';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
};

const DriverPage = ({ currentUser, role, drivers, trips, activeMission, onUpdateMission, onUpdateTrip, onDriverStatusUpdate, onCompleteTrip, onOpenSettings, appSettings = {}, phoneNumbers = {}, onUpdateDriverLocation }) => {
  const me = drivers.find(d => (d.email || '').toLowerCase() === (currentUser || '').toLowerCase());
  const [activeNav, setActiveNav] = useState('trips');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [chatUnread, setChatUnread] = useState(0);
  const [selectedTrips, setSelectedTrips] = useState([]);
  const [aiOptimizing, setAiOptimizing] = useState(false);
  const [aiSequence, setAiSequence] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState([]);
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
  const [showTripDetails, setShowTripDetails] = useState(null);
  const [isGpsTracking, setIsGpsTracking] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [driverPosition, setDriverPosition] = useState(null);
  const [analytics, setAnalytics] = useState({ tripsCompleted: 0, totalDistance: 0, timeSaved: 0, totalDriveTime: 0, efficiency: 0 });
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
        try { await updateDriverLocation(item.data); } catch {}
      } else if (item.action === 'completeTrip' && meRef.current?.id) {
        try { await saveOdometerReading(item.data.tripId, item.data.odometer); } catch {}
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

  const myTrips = trips
    .filter(t => {
      const isAssignedToMe = (t.driverId === me?.id || ((t.driverEmail || '').toLowerCase() === (me?.email || '').toLowerCase()));
      const inWindow = tripMatchesTodayOrTomorrow(t.date);
      const isActiveStatus = !['Completed', 'Cancelled', 'No Show'].includes(t.status);
      return (isAssignedToMe && inWindow) || (isAssignedToMe && isActiveStatus);
    })
    .sort((a, b) => {
      const tm = (t) => { if (!t || !t.time) return 1440; const m = String(t.time).match(/(\d{1,2}):(\d{2})/); if (!m) return 1440; let h = parseInt(m[1],10); let mn = parseInt(m[2],10); const p = String(t.time).match(/(AM|PM)/i); if (p) { if (p[1].toUpperCase()==='PM'&&h!==12) h+=12; if (p[1].toUpperCase()==='AM'&&h===12) h=0; } return h*60+mn; };
      return tm(a.time) - tm(b.time);
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

  // Detect ride-sharing opportunities
  useEffect(() => {
    if (activeTrips.length < 2) { setAiRideShare([]); return; }
    const nearby = [];
    for (let i = 0; i < activeTrips.length; i++) {
      for (let j = i + 1; j < activeTrips.length; j++) {
        const a = activeTrips[i];
        const b = activeTrips[j];
        const sameArea = a.pickup?.toLowerCase().includes(b.pickup?.toLowerCase().slice(0, 10)) ||
                         b.pickup?.toLowerCase().includes(a.pickup?.toLowerCase().slice(0, 10)) ||
                         a.dropoff?.toLowerCase().includes(b.dropoff?.toLowerCase().slice(0, 10));
        if (sameArea) {
          nearby.push({ tripA: a.id, tripB: b.id, patients: [a.patient, b.patient] });
        }
      }
    }
    setAiRideShare(nearby);
  }, [activeTrips]);

  // Detect time conflicts
  useEffect(() => {
    const detected = [];
    for (let i = 0; i < activeTrips.length; i++) {
      for (let j = i + 1; j < activeTrips.length; j++) {
        const a = activeTrips[i];
        const b = activeTrips[j];
        if (a.time === 'Will Call' || b.time === 'Will Call') continue;
        const tA = timeToMinutes(a.time);
        const tB = timeToMinutes(b.time);
        if (Math.abs(tA - tB) < 30) {
          detected.push({ tripA: a.id, tripB: b.id, aName: a.patient, bName: b.patient, timeA: a.time, timeB: b.time });
        }
      }
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
            updateDriverLocation({ lat: latitude, lng: longitude }).catch(() => {});
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
    const tripsToOptimize = silent && selectedTrips.length >= 2
      ? activeTrips.filter(t => selectedTrips.includes(t.id))
      : selectedTrips.length >= 2
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

  const swapTripAddresses = (trip) => {
    onUpdateTrip(trip.id, trip.status || 'Assigned', {
      pickup: trip.dropoff,
      dropoff: trip.pickup,
      pickupPhone: trip.dropoffPhone || '',
      dropoffPhone: trip.pickupPhone || '',
    });
  };

  const suggestNavApp = (address) => {
    const lower = (address || '').toLowerCase();
    if (lower.includes('hospital') || lower.includes('medical center') || lower.includes('clinic')) return 'waze';
    if (lower.includes('ave') || lower.includes('st') || lower.includes('street') || lower.includes('drive')) return 'apple';
    return navApp;
  };

  const openInNavApp = (address, app) => {
    const encoded = encodeURIComponent(address);
    const origin = driverPosition ? `${driverPosition.lat},${driverPosition.lng}` : '';
    const urls = {
      google: `https://www.google.com/maps/dir/?api=1${origin ? `&origin=${origin}` : ''}&destination=${encoded}`,
      waze: `https://www.waze.com/ul?q=${encoded}&navigate=yes`,
      apple: `https://maps.apple.com/?daddr=${encoded}`,
    };
    const a = document.createElement('a');
    a.href = urls[app] || urls.google;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
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
  };

  const submitComplete = () => {
    if (!showCompleteModal || !completeOdometer) return;
    const odo = parseInt(completeOdometer, 10);
    if (isNaN(odo) || odo <= 0) return;
    if (lastOdometer > 0 && odo < lastOdometer && !window.confirm(`Warning: ${odo.toLocaleString()} mi is less than the last recorded reading of ${lastOdometer.toLocaleString()} mi. Continue anyway?`)) return;
    setUndoable(showCompleteModal, showCompleteModal.status, 'Completed');
    onUpdateTrip(showCompleteModal.id, 'Completed', {
      dropoffOdometer: odo,
      completedAt: new Date().toISOString(),
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

  const getTodayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

  // Build static map with markers for current view
  const getMapUrl = () => {
    const markers = [];
    if (driverPosition) markers.push({ lat: driverPosition.lat, lng: driverPosition.lng, color: 'red', label: 'M' });
    orderedTrips.slice(0, 5).forEach((t, i) => {
      if (t.pickupLat) markers.push({ lat: t.pickupLat, lng: t.pickupLng, color: 'green', label: `${i + 1}` });
      if (t.dropoffLat) markers.push({ lat: t.dropoffLat, lng: t.dropoffLng, color: 'blue', label: `${i + 1}D` });
    });
    return buildStaticMapUrl(markers);
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
  }

  return (
    <div className="flex-1 flex flex-col bg-[#f5f5f7]">
      {/* ===== TRIPS PAGE ===== */}
      {activeNav === 'trips' && (
        <div className="flex-1 overflow-y-auto pb-28 px-3 pt-3 space-y-3">
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
              ].map(stat => (
                <div key={stat.label} className="flex-1 bg-white/10 rounded-lg px-2 py-1 border border-white/10 text-center">
                  <p className="text-xs font-black text-white leading-none">{stat.value}</p>
                  <p className="text-[7px] text-white/50 uppercase font-bold tracking-wider leading-tight mt-0.5">{stat.label}</p>
                </div>
              ))}
              <div className="flex-shrink-0 border-l border-white/10 pl-2 flex items-center gap-1">
                {isOnline ? <Wifi size={10} className="text-emerald-300" /> : <WifiOff size={10} className="text-amber-300" />}
                <p className="text-[8px] text-white/60 uppercase font-bold whitespace-nowrap">{getTodayStr().slice(5)}</p>
              </div>
            </div>
          </div>

          {/* Conflict Warning */}
          {conflicts.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-rose-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-[11px] font-bold text-rose-800">Time Conflicts Detected</p>
                  {conflicts.map((c, i) => (
                    <p key={i} className="text-[10px] text-rose-700 mt-0.5">{c.aName} ({c.timeA}) overlaps with {c.bName} ({c.timeB})</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Ride Share Suggestions */}
          {aiRideShare.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <div className="flex items-start gap-2">
                <Repeat size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-[11px] font-bold text-emerald-800">Ride Sharing Opportunity</p>
                  {aiRideShare.map((r, i) => {
                    const aTrip = trips.find(t => t.id === r.tripA);
                    const bTrip = trips.find(t => t.id === r.tripB);
                    return (
                      <div key={i} className="mt-1.5 bg-white/70 rounded-xl p-2 border border-emerald-100">
                        <p className="text-[10px] text-emerald-700 font-semibold">{r.patients.join(' & ')} — nearby locations</p>
                        <p className="text-[9px] text-emerald-600 mt-0.5">Pick up {aTrip?.patient} first, then {bTrip?.patient} — same area</p>
                        <div className="flex gap-1.5 mt-1.5">
                          <button onClick={() => openInNavApp(aTrip?.pickup, suggestNavApp(aTrip?.pickup))} className="flex-1 h-6 bg-emerald-600 text-white rounded-lg text-[8px] font-bold flex items-center justify-center gap-1 active:scale-95"><Navigation size={8} /> {aTrip?.patient}</button>
                          <button onClick={() => openInNavApp(bTrip?.pickup, suggestNavApp(bTrip?.pickup))} className="flex-1 h-6 bg-emerald-600 text-white rounded-lg text-[8px] font-bold flex items-center justify-center gap-1 active:scale-95"><Navigation size={8} /> {bTrip?.patient}</button>
                        </div>
                      </div>
                    );
                  })}
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
                    className="px-3 h-8 bg-indigo-600 text-white rounded-xl text-[10px] font-bold flex items-center gap-1.5 active:scale-95 transition">
                    <BrainCircuit size={12} /> {aiOptimizing ? 'Analyzing...' : 'AI Optimize'}
                  </button>
                )}
                <button onClick={() => setSelectedTrips([])} className="px-3 h-8 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-bold active:scale-95 transition">Clear</button>
              </div>
            </div>
          )}

          {/* AI Suggestions Banner */}
          {aiSuggestions.length > 0 && (
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl p-3">
              <div className="flex items-start gap-2">
                <BrainCircuit size={14} className="text-indigo-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  {aiSuggestions.map((s, i) => (
                    <p key={i} className="text-[11px] font-medium text-indigo-800 leading-relaxed">{s}</p>
                  ))}
                </div>
                <button onClick={() => setAiSuggestions([])} className="text-indigo-400"><X size={14} /></button>
              </div>
            </div>
          )}

          {/* Route Overview Map */}
          {getMapUrl() && (
            <div className="rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
              <img src={getMapUrl()} alt="Route map" className="w-full h-32 object-cover" />
            </div>
          )}

          {/* Manifest Header */}
          <div className="flex items-center justify-between px-1 pt-1">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.12em]">Today & Tomorrow</h3>
            <div className="flex items-center gap-2">
              {activeTrips.length > 0 && (
                <button onClick={exportDailyLog} className="text-[10px] text-blue-600 font-bold flex items-center gap-1 active:scale-95">
                  <Download size={10} /> Export
                </button>
              )}
              <span className="text-[10px] text-slate-300 font-medium">{activeTrips.length} trip{activeTrips.length !== 1 ? 's' : ''}</span>
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
            <div className="space-y-3 pb-2">
              {orderedTrips.map((trip) => {
                const isActive = !['Assigned', 'Unassigned'].includes(trip.status);
                const isSelected = selectedTrips.includes(trip.id);
                const aiRank = aiSequence ? aiSequence.indexOf(trip.id) + 1 : null;
                const isExpanded = expandedTrip === trip.id;
                const eta = etas[trip.id];
                const hasConflict = conflicts.some(c => c.tripA === trip.id || c.tripB === trip.id);
                const rideShareTrip = aiRideShare.find(r => r.tripA === trip.id || r.tripB === trip.id);

                return (
                  <div key={trip.id}
                    onTouchStart={(e) => handleTouchStart(e, trip)}
                    onTouchEnd={handleTouchEnd}
                    className={`bg-white rounded-3xl shadow-sm border transition-all overflow-hidden ${isActive ? 'border-blue-200 shadow-md shadow-blue-600/5' : 'border-slate-100'} ${isSelected ? 'ring-2 ring-blue-400' : ''} ${hasConflict ? 'ring-2 ring-rose-300' : ''} active:scale-[0.99] transition-transform`}>
                    {/* Card Header */}
                    <div className="px-4 pt-4 pb-1">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                          <button onClick={() => toggleTripSelect(trip.id)} className="shrink-0 text-slate-400 hover:text-blue-600">
                            {isSelected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-base text-slate-900 truncate">{trip.patient}</h3>
                              {trip.bookingId && <span className="text-[8px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded-md shrink-0">{trip.bookingId}</span>}
                              {aiRank && <span className="text-[8px] bg-indigo-100 text-indigo-700 font-bold px-1.5 py-0.5 rounded-md shrink-0">#{aiRank}</span>}
                              {hasConflict && <AlertTriangle size={12} className="text-rose-500 shrink-0" />}
                              {rideShareTrip && <Repeat size={12} className="text-emerald-500 shrink-0" />}
                            </div>
                            <div className="flex items-baseline gap-2 mt-1">
                              <span className="text-[28px] font-black text-blue-600 tracking-tight leading-none">{to12hr(trip.time)}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider ${isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{trip.status}</span>
                            </div>
                            {eta !== undefined && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <Timer size={10} className="text-slate-400" />
                                <span className="text-[9px] text-slate-400 font-medium">ETA: {formatDuration(eta)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <a href={`tel:${cleanPhone(clientPhone(trip))}`} className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 active:scale-90 transition-all"><Phone size={15} /></a>
                          <a href={`sms:${cleanPhone(clientPhone(trip))}`} className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 active:scale-90 transition-all"><MessageCircle size={15} /></a>
                          <button onClick={() => setExpandedTrip(isExpanded ? null : trip.id)} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isExpanded ? 'bg-blue-100 text-blue-600' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                            <ChevronDown size={15} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Pickup / Dropoff Route */}
                    <div className="px-4 py-2">
                      <div className="relative pl-6">
                        <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-gradient-to-b from-emerald-400 via-blue-200 to-rose-400 rounded-full" />
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-[18px] h-[18px] rounded-full bg-emerald-500 border-[3px] border-emerald-100 shrink-0 mt-0.5 shadow-sm" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-700 leading-tight">{trip.pickup}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {trip.pickupPhone && <p className="text-[9px] text-slate-400">{trip.pickupPhone}</p>}
                              <button onClick={() => openInNavApp(trip.pickup, suggestNavApp(trip.pickup))} className="text-[9px] text-blue-600 font-bold flex items-center gap-0.5 hover:underline" title={`Open in ${suggestNavApp(trip.pickup)}`}><Navigation size={9} /> Nav</button>
                              <div className="flex gap-0.5">
                                {['google','waze','apple'].filter(a => a !== suggestNavApp(trip.pickup)).slice(0,2).map(app => (
                                  <button key={app} onClick={() => openInNavApp(trip.pickup, app)} className="text-[8px] text-slate-400 hover:text-blue-600 underline px-0.5" title={app}>{app[0].toUpperCase()}</button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-center -my-0.5 relative z-10">
                          <button onClick={() => swapTripAddresses(trip)} className="w-5 h-5 bg-white rounded-full border border-slate-200 shadow-sm flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-300 active:scale-90 transition-all" title="Swap pickup/dropoff">
                            <Repeat size={10} />
                          </button>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="w-[18px] h-[18px] rounded-full bg-rose-500 border-[3px] border-rose-100 shrink-0 mt-0.5 shadow-sm" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-700 leading-tight">{trip.dropoff}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {trip.dropoffPhone && <p className="text-[9px] text-slate-400">{trip.dropoffPhone}</p>}
                              <button onClick={() => openInNavApp(trip.dropoff, suggestNavApp(trip.dropoff))} className="text-[9px] text-rose-600 font-bold flex items-center gap-0.5 hover:text-rose-700 hover:underline" title={`Open in ${suggestNavApp(trip.dropoff)}`}><Navigation size={9} /> Nav</button>
                              <div className="flex gap-0.5">
                                {['google','waze','apple'].filter(a => a !== suggestNavApp(trip.dropoff)).slice(0,2).map(app => (
                                  <button key={app} onClick={() => openInNavApp(trip.dropoff, app)} className="text-[8px] text-slate-400 hover:text-rose-600 underline px-0.5" title={app}>{app[0].toUpperCase()}</button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      {trip.notes && (
                        <div className="mt-2 bg-amber-50/80 rounded-xl px-3 py-2 border border-amber-100/50">
                          <p className="text-[10px] text-amber-700 font-medium leading-relaxed">{trip.notes}</p>
                        </div>
                      )}
                      {trip.distance && (
                        <div className="mt-2 flex items-center gap-1 text-[9px] text-slate-400">
                          <MapPin size={9} />
                          <span>{trip.distance} mi estimated</span>
                        </div>
                      )}
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="px-4 pb-2 border-t border-slate-50 pt-3 space-y-2 animate-in slide-in-from-top-2 duration-200">
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="bg-slate-50 rounded-xl p-2.5">
                            <p className="text-[9px] text-slate-400 uppercase font-bold">Booking ID</p>
                            <p className="font-semibold text-slate-800">{trip.bookingId || '—'}</p>
                          </div>
                          <div className="bg-slate-50 rounded-xl p-2.5">
                            <p className="text-[9px] text-slate-400 uppercase font-bold">Service Type</p>
                            <p className="font-semibold text-slate-800">{trip.type || '—'}</p>
                          </div>
                          <div className="bg-slate-50 rounded-xl p-2.5">
                            <p className="text-[9px] text-slate-400 uppercase font-bold">Patient Phone</p>
                            <p className="font-semibold text-slate-800">{trip.pickupPhone || '—'}</p>
                          </div>
                          <div className="bg-slate-50 rounded-xl p-2.5">
                            <p className="text-[9px] text-slate-400 uppercase font-bold">Hospital Phone</p>
                            <p className="font-semibold text-slate-800">{trip.dropoffPhone || '—'}</p>
                          </div>
                        </div>
                        {trip.pickupOdometer && (
                          <div className="bg-slate-50 rounded-xl p-2.5 flex items-center gap-2">
                            <Gauge size={12} className="text-slate-400" />
                            <span className="text-[11px] text-slate-600">Pickup Odometer: <strong className="text-slate-800">{trip.pickupOdometer?.toLocaleString()} mi</strong></span>
                          </div>
                        )}
                        {trip.startTime && (
                          <div className="bg-slate-50 rounded-xl p-2.5 flex items-center gap-2">
                            <Clock size={12} className="text-slate-400" />
                            <span className="text-[11px] text-slate-600">Started: <strong className="text-slate-800">{new Date(trip.startTime).toLocaleTimeString()}</strong></span>
                          </div>
                        )}
                        {eta !== undefined && (
                          <div className="bg-slate-50 rounded-xl p-2.5 flex items-center gap-2">
                            <Timer size={12} className="text-slate-400" />
                            <span className="text-[11px] text-slate-600">ETA: <strong className="text-slate-800">{formatDuration(eta)}</strong></span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="px-4 pb-4 flex gap-2 flex-wrap">
                      {trip.status === 'Assigned' || trip.status === 'Unassigned' ? (
                        <>
                          <button onClick={() => handleStartTrip(trip)} className="flex-1 h-11 bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-2xl font-bold text-xs shadow-sm shadow-blue-600/20 active:scale-[0.97] transition-all hover:shadow-md hover:shadow-blue-600/30 flex items-center justify-center gap-2">
                            <Play size={13} /> Start Trip
                          </button>
                          <button onClick={() => setShowTripDetails(trip)} className="h-11 w-11 bg-slate-100 text-slate-600 rounded-2xl font-bold text-[10px] active:scale-95 transition-all hover:bg-slate-200 flex items-center justify-center" title="Full details"><FileText size={15} /></button>
                          <button onClick={() => handleNoShow(trip)} className="h-11 px-4 bg-amber-50 text-amber-700 rounded-2xl font-bold text-[10px] uppercase tracking-wider active:scale-95 transition-all hover:bg-amber-100 border border-amber-100/50">No Show</button>
                          <button onClick={() => handleCancel(trip)} className="h-11 px-4 bg-rose-50 text-rose-700 rounded-2xl font-bold text-[10px] uppercase tracking-wider active:scale-95 transition-all hover:bg-rose-100 border border-rose-100/50">Cancel</button>
                        </>
                      ) : trip.status === 'In Transit' ? (
                        <>
                          <button onClick={() => openInNavApp(trip.pickup, suggestNavApp(trip.pickup))} className="flex-1 h-11 bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-2xl font-bold text-xs shadow-sm shadow-blue-600/20 active:scale-[0.97] transition-all hover:shadow-md hover:shadow-blue-600/30 flex items-center justify-center gap-2">
                            <Navigation size={13} /> Pickup
                          </button>
                          <button onClick={() => handleArrive(trip)} className="h-11 bg-gradient-to-br from-emerald-600 to-emerald-700 text-white rounded-2xl font-bold text-xs shadow-sm shadow-emerald-600/20 active:scale-[0.97] transition-all hover:shadow-md hover:shadow-emerald-600/30 flex items-center justify-center gap-2 px-4">
                            <MapPin size={13} /> Arrived
                          </button>
                          <button onClick={() => revertTripStatus(trip)} className="h-11 w-11 bg-slate-100 text-slate-500 rounded-2xl font-bold text-[10px] active:scale-95 transition-all hover:bg-slate-200 flex items-center justify-center" title="Back to Assigned">
                            <RotateCcw size={14} />
                          </button>
                          <button onClick={() => setShowTripDetails(trip)} className="h-11 w-11 bg-slate-100 text-slate-600 rounded-2xl font-bold text-[10px] active:scale-95 transition-all hover:bg-slate-200 flex items-center justify-center" title="Full details"><FileText size={15} /></button>
                          <button onClick={() => handleNoShow(trip)} className="h-11 px-4 bg-amber-50 text-amber-700 rounded-2xl font-bold text-[10px] uppercase tracking-wider active:scale-95 transition-all hover:bg-amber-100 border border-amber-100/50">No Show</button>
                          <button onClick={() => handleCancel(trip)} className="h-11 px-4 bg-rose-50 text-rose-700 rounded-2xl font-bold text-[10px] uppercase tracking-wider active:scale-95 transition-all hover:bg-rose-100 border border-rose-100/50">Cancel</button>
                        </>
                      ) : trip.status === 'Arrived' ? (
                        <>
                          <button onClick={() => openInNavApp(trip.dropoff, suggestNavApp(trip.dropoff))} className="flex-1 h-11 bg-gradient-to-br from-rose-600 to-rose-700 text-white rounded-2xl font-bold text-xs shadow-sm shadow-rose-600/20 active:scale-[0.97] transition-all hover:shadow-md hover:shadow-rose-600/30 flex items-center justify-center gap-2">
                            <Navigation size={13} /> Dropoff
                          </button>
                          <button onClick={() => openCompleteModal(trip)} className="h-11 bg-gradient-to-br from-emerald-600 to-emerald-700 text-white rounded-2xl font-bold text-xs shadow-sm shadow-emerald-600/20 active:scale-[0.97] transition-all hover:shadow-md hover:shadow-emerald-600/30 flex items-center justify-center gap-2 px-4">
                            <Check size={13} /> Complete
                          </button>
                          <button onClick={() => revertTripStatus(trip)} className="h-11 w-11 bg-slate-100 text-slate-500 rounded-2xl font-bold text-[10px] active:scale-95 transition-all hover:bg-slate-200 flex items-center justify-center" title="Back to In Transit">
                            <RotateCcw size={14} />
                          </button>
                          <button onClick={() => setShowTripDetails(trip)} className="h-11 w-11 bg-slate-100 text-slate-600 rounded-2xl font-bold text-[10px] active:scale-95 transition-all hover:bg-slate-200 flex items-center justify-center" title="Full details"><FileText size={15} /></button>
                          <button onClick={() => handleNoShow(trip)} className="h-11 px-4 bg-amber-50 text-amber-700 rounded-2xl font-bold text-[10px] uppercase tracking-wider active:scale-95 transition-all hover:bg-amber-100 border border-amber-100/50">No Show</button>
                          <button onClick={() => handleCancel(trip)} className="h-11 px-4 bg-rose-50 text-rose-700 rounded-2xl font-bold text-[10px] uppercase tracking-wider active:scale-95 transition-all hover:bg-rose-100 border border-rose-100/50">Cancel</button>
                        </>
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
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl relative z-10">
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Gauge size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Odometer Reading</h3>
              <p className="text-xs text-slate-500 mt-1">{showOdometerPrompt.patient} — {to12hr(showOdometerPrompt.time)}</p>
              {lastOdometer > 0 && (
                <p className="text-[10px] text-slate-400 mt-1">Last reading: <strong>{lastOdometer?.toLocaleString()} mi</strong></p>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Current Odometer (mi)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={odometerValue}
                  onChange={(e) => setOdometerValue(e.target.value)}
                  placeholder='Enter full odometer reading'
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-lg text-center focus:border-blue-500 outline-none"
                  autoFocus
                />
                {lastOdometer > 0 && odometerValue && parseInt(odometerValue, 10) < lastOdometer && (
                  <p className="text-[10px] text-amber-700 font-semibold mt-2 text-center bg-amber-50 rounded-xl px-3 py-2 border border-amber-200">
                    ⚠️ {parseInt(odometerValue, 10).toLocaleString()} mi is less than last reading of {lastOdometer.toLocaleString()} mi. You can continue if you're sure.
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowOdometerPrompt(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm active:scale-95">Cancel</button>
                <button onClick={submitOdometer} disabled={!odometerValue} className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm disabled:opacity-40 active:scale-95 shadow-sm">Start Trip</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== ARRIVAL CONFIRM MODAL ===== */}
      {showArrivalConfirm && (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl relative z-10">
            <div className="text-center mb-5">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-600 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <MapPin size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Arrived at Location</h3>
              <p className="text-xs text-slate-500 mt-1">{showArrivalConfirm.patient}</p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 mb-4 space-y-2">
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Odometer at Arrival (mi)</label>
                <input type="number" inputMode="numeric" value={arrivalOdometer} onChange={e => setArrivalOdometer(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm text-center focus:border-blue-500 outline-none"
                />
              </div>
              {showArrivalConfirm.bookingId && (
                <div className="flex justify-between">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Booking</span>
                  <span className="text-xs font-bold text-slate-800">{showArrivalConfirm.bookingId}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Client</span>
                <span className="text-xs font-bold text-slate-800">{showArrivalConfirm.patient}</span>
              </div>
              {showArrivalConfirm.pickupPhone && (
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Phone</span>
                  <a href={`tel:${cleanPhone(showArrivalConfirm.pickupPhone)}`} className="text-xs font-bold text-blue-600 flex items-center gap-1">
                    <Phone size={10} /> {showArrivalConfirm.pickupPhone}
                  </a>
                </div>
              )}
              {showArrivalConfirm.notes && (
                <div className="pt-2 border-t border-slate-200">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Notes</p>
                  <p className="text-xs text-slate-700">{showArrivalConfirm.notes}</p>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-[10px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  <Info size={12} className="shrink-0" />
                  <span>Obtain paper signature from client before proceeding.</span>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <p className="text-[9px] font-bold text-blue-700 uppercase tracking-wider mb-1">Dispatcher Confirmation</p>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={signatureConfirmed} onChange={e => setSignatureConfirmed(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                      <span className="text-[9px] text-slate-600">Paper signature obtained from client</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowArrivalConfirm(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm active:scale-95">Back</button>
              <button onClick={confirmArrival} disabled={!signatureConfirmed} className="flex-1 py-3 bg-emerald-600 text-white rounded-2xl font-bold text-sm active:scale-95 shadow-sm disabled:opacity-40">
                {showArrivalConfirm.status === 'In Transit' ? 'Confirm Arrival' : 'Confirm Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== COMPLETE TRIP MODAL ===== */}
      {showCompleteModal && (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl relative z-10">
            <div className="text-center mb-5">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-600 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Check size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Complete Trip</h3>
              <p className="text-xs text-slate-500 mt-1">{showCompleteModal.patient} — {showCompleteModal.bookingId || ''}</p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 mb-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Pickup Odometer</span>
                <span className="text-xs font-bold text-slate-800">{showCompleteModal.pickupOdometer?.toLocaleString() || '—'} mi</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Started At</span>
                <span className="text-xs font-bold text-slate-800">{showCompleteModal.startTime ? new Date(showCompleteModal.startTime).toLocaleTimeString() : '—'}</span>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Final Odometer (mi)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={completeOdometer}
                  onChange={(e) => setCompleteOdometer(e.target.value)}
                  placeholder="Enter final odometer"
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-center focus:border-blue-500 outline-none mt-1"
                  autoFocus
                />
              </div>
              {showCompleteModal.pickupOdometer && completeOdometer && (
                <div className="text-center text-[11px] text-blue-600 font-bold">
                  Distance: {(parseInt(completeOdometer) - (showCompleteModal.pickupOdometer || 0)).toLocaleString()} mi
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowCompleteModal(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm active:scale-95">Cancel</button>
              <button onClick={submitComplete} disabled={!completeOdometer} className="flex-1 py-3 bg-emerald-600 text-white rounded-2xl font-bold text-sm disabled:opacity-40 active:scale-95 shadow-sm">Complete Trip</button>
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
              <h2 className="font-bold text-sm text-slate-900 truncate">{showTripDetails.patient}</h2>
              <p className="text-[10px] text-slate-400">{showTripDetails.bookingId || '—'}</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-5 text-white">
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-4xl font-black tracking-tight">{to12hr(showTripDetails.time)}</span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${showTripDetails.status === 'Completed' ? 'bg-emerald-400/30 text-emerald-100' : showTripDetails.status === 'In Transit' ? 'bg-blue-400/30' : 'bg-white/20'}`}>{showTripDetails.status}</span>
              </div>
              <div className="h-px bg-white/20 my-3" />
              <div className="space-y-2.5">
                <div className="flex items-start gap-3">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-emerald-300" />
                  <div>
                    <p className="text-[10px] text-white/60 uppercase font-bold">Pickup</p>
                    <p className="text-sm font-semibold">{showTripDetails.pickup}</p>
                    {showTripDetails.pickupPhone && <a href={`tel:${cleanPhone(showTripDetails.pickupPhone)}`} className="text-[11px] text-blue-200 font-bold flex items-center gap-1 mt-0.5"><Phone size={10} /> {showTripDetails.pickupPhone}</a>}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-rose-300" />
                  <div>
                    <p className="text-[10px] text-white/60 uppercase font-bold">Dropoff</p>
                    <p className="text-sm font-semibold">{showTripDetails.dropoff}</p>
                    {showTripDetails.dropoffPhone && <a href={`tel:${cleanPhone(showTripDetails.dropoffPhone)}`} className="text-[11px] text-blue-200 font-bold flex items-center gap-1 mt-0.5"><Phone size={10} /> {showTripDetails.dropoffPhone}</a>}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => openInNavApp(showTripDetails.pickup, suggestNavApp(showTripDetails.pickup))} className="flex-1 h-9 bg-blue-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95"><Navigation size={12} /> Pickup</button>
                <button onClick={() => openInNavApp(showTripDetails.dropoff, suggestNavApp(showTripDetails.dropoff))} className="flex-1 h-9 bg-rose-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95"><Navigation size={12} /> Dropoff</button>
                <a href={`tel:${cleanPhone(clientPhone(showTripDetails))}`} className="flex-1 h-9 bg-emerald-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95"><Phone size={12} /> Call</a>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Trip Information</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[9px] text-slate-400 uppercase font-bold">Booking ID</p>
                  <p className="text-sm font-bold text-slate-800">{showTripDetails.bookingId || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[9px] text-slate-400 uppercase font-bold">Service Type</p>
                  <p className="text-sm font-bold text-slate-800">{showTripDetails.type || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[9px] text-slate-400 uppercase font-bold">Patient Phone</p>
                  <p className="text-sm font-bold text-slate-800">{showTripDetails.pickupPhone || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[9px] text-slate-400 uppercase font-bold">Dropoff Phone</p>
                  <p className="text-sm font-bold text-slate-800">{showTripDetails.dropoffPhone || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[9px] text-slate-400 uppercase font-bold">Distance</p>
                  <p className="text-sm font-bold text-slate-800">{showTripDetails.distance ? `${showTripDetails.distance} mi` : '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[9px] text-slate-400 uppercase font-bold">Driver</p>
                  <p className="text-sm font-bold text-slate-800">{showTripDetails.driverId || '—'}</p>
                </div>
              </div>
              {showTripDetails.notes && (
                <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                  <p className="text-[9px] text-amber-600 uppercase font-bold mb-1">Notes</p>
                  <p className="text-xs text-amber-800">{showTripDetails.notes}</p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Timeline & Odometer</h3>
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
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Actions</h3>
              <div className="flex gap-2">
                <button onClick={() => openInNavApp(showTripDetails.pickup, 'google')} className="flex-1 h-10 bg-slate-100 rounded-xl text-[10px] font-bold text-slate-700 flex items-center justify-center gap-1.5 active:scale-95"><Map size={12} /> Google Maps</button>
                <button onClick={() => openInNavApp(showTripDetails.pickup, 'waze')} className="flex-1 h-10 bg-slate-100 rounded-xl text-[10px] font-bold text-slate-700 flex items-center justify-center gap-1.5 active:scale-95"><Navigation size={12} /> Waze</button>
                <button onClick={() => openInNavApp(showTripDetails.pickup, 'apple')} className="flex-1 h-10 bg-slate-100 rounded-xl text-[10px] font-bold text-slate-700 flex items-center justify-center gap-1.5 active:scale-95"><Map size={12} /> Apple</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== HISTORY PAGE ===== */}
      {activeNav === 'history' && (
        <div className="flex-1 overflow-y-auto pb-28 px-3 pt-3">
          <div className="px-1 pt-2 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">History</h2>
                <p className="text-xs text-slate-400 mt-0.5">Review past trips and activity</p>
              </div>
              {allHistory.length > 0 && (
                <button onClick={exportDailyLog} className="px-3 h-8 bg-blue-600 text-white rounded-xl text-[10px] font-bold flex items-center gap-1.5 active:scale-95 shadow-sm">
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

          <div className="space-y-2.5 px-1">
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
                    <div onClick={() => setShowTripDetails(trip)} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${s.dot}`} />
                            <h4 className="font-bold text-sm text-slate-900 truncate">{trip.patient}</h4>
                            {trip.bookingId && <span className="text-[8px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded">{trip.bookingId}</span>}
                          </div>
                          <p className="text-sm font-bold text-blue-600 mt-1">{to12hr(trip.time)}</p>
                          <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-500">
                            <ArrowRight size={10} className="text-emerald-500 shrink-0" />
                            <span className="truncate">{trip.pickup}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                            <ArrowRight size={10} className="text-rose-500 shrink-0" />
                            <span className="truncate">{trip.dropoff}</span>
                          </div>
                          {(trip.pickupOdometer || trip.dropoffOdometer) && (
                            <div className="flex items-center gap-3 mt-1.5 text-[9px] text-slate-400">
                              {trip.pickupOdometer && <span>Start: {trip.pickupOdometer?.toLocaleString()} mi</span>}
                              {trip.dropoffOdometer && <span>End: {trip.dropoffOdometer?.toLocaleString()} mi</span>}
                              {trip.pickupOdometer && trip.dropoffOdometer && (
                                <span className="text-blue-500">+{(trip.dropoffOdometer - trip.pickupOdometer)?.toLocaleString()} mi</span>
                              )}
                            </div>
                          )}
                          {trip.distance && (
                            <p className="text-[9px] text-slate-400 mt-0.5">Distance: {trip.distance} mi</p>
                          )}
                          {trip.completedAt && (
                            <p className="text-[9px] text-slate-400 mt-1">{new Date(trip.completedAt).toLocaleString()}</p>
                          )}
                        </div>
                        <span className={`px-2.5 py-1 rounded-lg text-[8px] font-bold uppercase tracking-wider shrink-0 ${s.bg}`}>
                          {trip.status}
                        </span>
                      </div>
                    </div>
                    <div className="px-4 pb-3 flex gap-2">
                      <button onClick={() => setShowTripDetails(trip)} className="h-9 px-4 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-bold flex items-center gap-1.5 active:scale-95"><FileText size={12} /> Details</button>
                      <button onClick={() => restoreHistoryTrip(trip)} className="h-9 px-4 bg-blue-100 text-blue-700 rounded-xl text-[10px] font-bold flex items-center gap-1.5 active:scale-95"><RotateCcw size={12} /> Restore</button>
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
        <div className="flex-1 overflow-y-auto pb-28 px-3 pt-3 space-y-3">
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
                  <p className="text-[10px] text-slate-400">Location sharing active</p>
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
                  <p className="text-[10px] text-slate-400">{analytics.tripsCompleted} trips completed</p>
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
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Time Distribution</p>
                  <div className="space-y-1.5">
                    <div>
                      <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
                        <span>Driving</span>
                        <span>{analytics.totalDriveTime > 0 ? `${Math.round((analytics.totalDriveTime / (analytics.totalDriveTime || 1)) * 100)}%` : '0%'}</span>
                      </div>
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, analytics.totalDriveTime > 0 ? 70 : 0)}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
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
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em]">Odometer</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{me?.odometer?.toLocaleString() || 0} <span className="text-sm font-medium text-slate-400">mi</span></p>
                <p className="text-[10px] text-slate-400 mt-1">Next service at {me?.nextOilChange?.toLocaleString() || '5,000'} mi</p>
              </div>
              <Gauge size={32} className="text-slate-200" />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em] mb-3">Vehicle Info</p>
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
            <button onClick={() => onOpenSettings?.()} className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50/50 transition border-b border-slate-100/50">
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
        <div className="flex-1 overflow-y-auto pb-28 px-3 pt-3">
          <div className="px-1 pt-2 pb-4">
            <h2 className="text-xl font-bold text-slate-900">Settings</h2>
            <p className="text-xs text-slate-400 mt-0.5">Account and app preferences</p>
          </div>
          <div className="space-y-2.5 px-1">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button onClick={() => onOpenSettings?.()} className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50/50 transition border-b border-slate-100/50">
                <div className="flex items-center gap-3">
                  <Settings size={17} className="text-slate-400" />
                  <span className="font-medium text-sm text-slate-800">App Settings</span>
                </div>
                <ChevronRight size={15} className="text-slate-300" />
              </button>
              <button className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50/50 transition border-b border-slate-100/50">
                <div className="flex items-center gap-3">
                  <Bell size={17} className="text-slate-400" />
                  <span className="font-medium text-sm text-slate-800">Notifications</span>
                </div>
                <ChevronRight size={15} className="text-slate-300" />
              </button>
              <button className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50/50 transition border-b border-slate-100/50">
                <div className="flex items-center gap-3">
                  <Phone size={17} className="text-slate-400" />
                  <span className="font-medium text-sm text-slate-800">Contact Support</span>
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
        </div>
      )}

      {/* ===== UNDO TOAST ===== */}
      {undoableAction && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[140] bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 backdrop-blur-sm text-xs font-semibold animate-slide-up">
          <RotateCcw size={14} className="text-amber-300 shrink-0" />
          <span>{undoableAction.trip.patient} marked as <strong>{undoableAction.newStatus}</strong></span>
          <button onClick={handleUndo} className="ml-2 px-3 h-7 bg-white/20 hover:bg-white/30 rounded-xl text-[11px] font-bold text-white active:scale-95 transition-all">Undo</button>
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
                      <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[7px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center leading-none shadow-sm border border-white">{chatUnread > 99 ? '99+' : chatUnread}</span>
                    )}
                  </div>
                  <span className={`text-[7px] font-bold uppercase tracking-wider transition-all leading-none ${isActiveTab ? 'text-blue-600' : 'text-slate-400'}`}>{item.label}</span>
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
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[90] bg-slate-800/80 text-white px-4 py-2 rounded-2xl shadow-lg text-[10px] font-medium flex items-center gap-2 backdrop-blur-sm">
          <GripVertical size={12} />
          Swipe left on Arrived trips to complete
        </div>
      )}
    </div>
  );
};

export default DriverPage;
