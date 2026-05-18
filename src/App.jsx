import React, { useState, useEffect, useRef, useCallback, lazy, Suspense, memo } from 'react';
import {
  Truck, Users, MapPin, Phone, Clock, Search, ShieldCheck,
  ArrowRight, CheckCircle2, Trash2, Map as MapIcon, LogOut,
  Settings, Repeat, BrainCircuit, Zap, BarChart3,
  MessageCircle, MessageSquare, Target, Upload, AlertCircle, Building2,
  Activity, Wand2, Wrench, Lock, Briefcase,
  ArchiveRestore, RefreshCcw, FileText, BarChart2, Archive, X, Plus, ChevronLeft
} from 'lucide-react';
import { auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, getDocs, addDoc, serverTimestamp } from './config/firebase';
import TripsPage from './components/TripsPage';
import ChatPage from './components/ChatPage';
import ArchivesPage from './components/ArchivesPage';
import DriversVehiclesPage from './components/DriversVehiclesPage';
import SettingsPage from './components/SettingsPage';
import DriverPage from './components/DriverPage';
import UsersPage from './components/UsersPage';
import { requestNotificationPermission, showLocalNotification, onForegroundMessage } from './config/notifications';
import { playMessageSound, initAudioContext } from './utils/notificationSound';

const cleanPhone = (p) => (p || '').replace(/[^0-9]/g, '');
import { suggestBatchAssignment, suggestOptimalDriver } from './config/ai';
import { tripMatchesCalendarDay, tripMatchesTodayOrTomorrow } from './utils/tripDate';

// Lazy-loaded heavy components
const LiveMapPage = lazy(() => import('./components/LiveMapPage'));
const DispatchAssistant = lazy(() => import('./components/DispatchAssistant'));
const FileUploadTrips = lazy(() => import('./components/FileUploadTrips'));
const ReportsPage = lazy(() => import('./components/ReportsPage'));

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

const PERMISSIONS = {
  admin: {
    canDeleteTrip: true,
    canAssignTrip: true,
    canManageUsers: true,
    canViewReports: true,
    canEditFleet: true,
    canViewLiveMap: true,
    canOptimizeFleet: true,
    canResetSystem: true
  },
  dispatcher: {
    canDeleteTrip: true,
    canAssignTrip: true,
    canManageUsers: false,
    canViewReports: false,
    canEditFleet: false,
    canViewLiveMap: true,
    canOptimizeFleet: true,
    canResetSystem: false
  },
  driver: {
    canDeleteTrip: false,
    canAssignTrip: false,
    canManageUsers: false,
    canViewReports: false,
    canEditFleet: false,
    canViewLiveMap: false,
    canOptimizeFleet: false,
    canResetSystem: false
  },
  billing: {
    canDeleteTrip: false,
    canAssignTrip: false,
    canManageUsers: false,
    canViewReports: true,
    canEditFleet: false,
    canViewLiveMap: false,
    canOptimizeFleet: false,
    canResetSystem: false
  },
  qa_auditor: {
    canDeleteTrip: false,
    canAssignTrip: false,
    canManageUsers: false,
    canViewReports: true,
    canEditFleet: false,
    canViewLiveMap: true,
    canOptimizeFleet: false,
    canResetSystem: false
  },
  fleet_manager: {
    canDeleteTrip: false,
    canAssignTrip: true,
    canManageUsers: false,
    canViewReports: true,
    canEditFleet: true,
    canViewLiveMap: true,
    canOptimizeFleet: true,
    canResetSystem: false
  },
  supervisor: {
    canDeleteTrip: false,
    canAssignTrip: false,
    canManageUsers: false,
    canViewReports: true,
    canEditFleet: false,
    canViewLiveMap: true,
    canOptimizeFleet: false,
    canResetSystem: false
  }
};

const hasPermission = (role, action) => {
  return PERMISSIONS[role]?.[action] || false;
};

const todayStr = new Date().toISOString().split('T')[0];

function timeToMinutes(t) {
  if (!t) return 1440;
  const cleanTime = String(t).toUpperCase().trim();
  if (cleanTime === 'WILL CALL' || cleanTime === 'WC') return 1440;
  const m = cleanTime.match(/(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?/);
  if (!m) return 1440;
  let h = parseInt(m[1], 10);
  let min = parseInt(m[2] || '0', 10);
  const p = m[3];
  if (p === 'PM' && h < 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

function isTripLate(tripTime) {
  if (!tripTime || tripTime === 'Will Call') return false;
  const now = new Date();
  const timeVal = timeToMinutes(tripTime);
  const scheduled = new Date();
  scheduled.setHours(Math.floor(timeVal / 60), timeVal % 60, 0, 0);
  return now > scheduled;
}

const DEFAULT_DATA = {
  trips: [],
  drivers: [],
  dispatchers: [],
  vehicles: [],
  logs: [
    { t: 'System Initialized', d: 'Agape Care Cloud OS is now online.', c: 'emerald', type: 'system' }
  ],
  trashedTrips: [],
  phoneNumbers: { routing: '8669823983', dispatcher: '3177777707' }
};

const DEFAULT_APP_SETTINGS = {
  theme: 'light',
  fontScale: 'md',
  readability: 'normal',
  navigationApp: 'google',
};

// Returns null for system-generated booking ID patterns (avoids duplicates in Firestore),
// keeps the original value for custom/user-entered booking IDs.
function extractCustomBookingId(value) {
  const cleanValue = String(value || '').trim();
  if (!cleanValue) return null;
  if (/^BK-\d+-\d+$/i.test(cleanValue)) return null;
  if (/^TRP-\d+$/i.test(cleanValue)) return null;
  if (/^TRIP-\d{10,}-\d+$/i.test(cleanValue)) return null;
  return cleanValue;
}

function normalizeTrip(trip) {
  if (!trip) return trip;
  return {
    ...trip,
    bookingId: extractCustomBookingId(trip.bookingId),
  };
}

const DATA_DOC = 'appData/agape';

async function loadAppData() {
  try {
    const snap = await getDoc(doc(db, DATA_DOC));
    if (snap.exists()) return snap.data();
  } catch {}
  return null;
}

function sanitizeForFirestore(obj) {
  return JSON.parse(JSON.stringify(obj, (key, value) => value === undefined ? null : value));
}

async function saveAppData(data, retries = 3) {
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  // Keep all trips for now to prevent any accidental data loss. 
  // We'll implement a manual archive process instead of auto-pruning unassigned trips.
  const prunedTrips = (data.trips || []).map(normalizeTrip);

  const sanitized = sanitizeForFirestore({
    drivers: data.drivers || [],
    dispatchers: data.dispatchers || [],
    trips: prunedTrips,
    trashedTrips: data.trashedTrips || [],
    vehicles: data.vehicles || [],
    phoneNumbers: data.phoneNumbers || {}
  });

  let lastErr = null;
  for (let i = 0; i < retries; i++) {
    try {
      const ref = doc(db, DATA_DOC);
      await setDoc(ref, sanitized, { merge: true });
      return;
    } catch (err) {
      lastErr = err;
      console.error("Save attempt failed:", err);
      if (i < retries - 1) await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
}

async function logToCloud(log) {
  try {
    const logRef = collection(db, 'logs');
    await addDoc(logRef, { ...log, timestamp: serverTimestamp() });
  } catch (err) {
    console.error("Log to cloud failed:", err);
  }
}

const App = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const dataLoadedRef = useRef(false);
  const prevChatConvsRef = useRef(null);
  
  // Online/offline listener
  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
  // State variables (declare before refs to avoid temporal dead zone)
  const [logs, setLogs] = useState(DEFAULT_DATA.logs);
  const [dispatchers, setDispatchers] = useState(DEFAULT_DATA.dispatchers);
  const [drivers, setDrivers] = useState(DEFAULT_DATA.drivers);
  const [trips, setTrips] = useState(DEFAULT_DATA.trips);
  const [trashedTrips, setTrashedTrips] = useState([]);
  const [phoneNumbers, setPhoneNumbers] = useState(DEFAULT_DATA.phoneNumbers);
  const [vehicles, setVehicles] = useState(DEFAULT_DATA.vehicles);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  // Refs for latest state — always up to date, no closure issues
  const sTrips = useRef(trips);
  const sDrivers = useRef(drivers);
  const sLogs = useRef(logs);
  const sTrashed = useRef(trashedTrips);
  const sDisp = useRef(dispatchers);
  const sPhone = useRef(phoneNumbers);
  const sVehicles = useRef(vehicles);
  sTrips.current = trips;
  sDrivers.current = drivers;
  sLogs.current = logs;
  sTrashed.current = trashedTrips;
  sDisp.current = dispatchers;
  sPhone.current = phoneNumbers;
  sVehicles.current = vehicles;

  const fromSnapshot = useRef(false);

  const persistState = useCallback((overrides = {}) => {
    // CRITICAL GUARDS: Don't save if we are still loading, or if we just got a cloud update.
    // dataLoaded via ref — useCallback([]) would otherwise freeze dataLoaded as false forever.
    if (!dataLoadedRef.current) return;
    if (fromSnapshot.current) return;

    const data = {
      trips: overrides.trips || sTrips.current,
      trashedTrips: overrides.trashedTrips || sTrashed.current,
      drivers: overrides.drivers || sDrivers.current,
      logs: overrides.logs || sLogs.current,
      dispatchers: overrides.dispatchers || sDisp.current,
      phoneNumbers: overrides.phoneNumbers || sPhone.current,
      vehicles: overrides.vehicles || sVehicles.current,
    };
    // Also save to local storage for instant recovery on refresh before Firestore syncs
    localStorage.setItem('agape_cached_data', JSON.stringify(data));
    saveAppData(data).catch(err => {
      console.error("Persistence failed:", err);
    });
  }, []);
  const [role, setRole] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const roleRef = useRef(null);
  const currentUserRef = useRef(null);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('agape_activeTab') || 'dashboard');
  const [toasts, setToasts] = useState([]);
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
  const [appSettings, setAppSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('agape_app_settings') || '{}');
      return { ...DEFAULT_APP_SETTINGS, ...saved };
    } catch {
      return DEFAULT_APP_SETTINGS;
    }
  });

  const addToast = (title, message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };

  const updateAppSettings = useCallback((updates, isProfileUpdate = false) => {
    if (isProfileUpdate && role === 'driver' && updates.odometer !== undefined) {
      setDrivers(prev => {
        const updated = prev.map(d => d.email === currentUser ? { ...d, odometer: updates.odometer } : d);
        persistState({ drivers: updated });
        return updated;
      });
      addToast('Profile Updated', 'Your vehicle odometer has been synchronized.', 'success');
    } else {
      setAppSettings((prev) => ({ ...prev, ...updates }));
    }
  }, [role, currentUser, persistState]);

  const handleUpdatePhoneNumbers = useCallback((updates) => {
    setPhoneNumbers(prev => ({ ...prev, ...updates }));
    setTimeout(persistState, 0);
  }, [persistState]);

  const requestAuthAction = (label, callback) => {
    setReAuthError('');
    setAuthPassword('');
    setAuthActionPayload({ label, callback });
    setShowAuthModal(true);
  };

  // eslint-disable-next-line no-unused-vars
  const [activeManifest, setActiveManifest] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginStep, setLoginStep] = useState('role_selection');
  const [pendingRole, setPendingRole] = useState(null);
  const [loginError, setLoginError] = useState('');

  useEffect(() => { dataLoadedRef.current = dataLoaded; }, [dataLoaded]);
  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  // Save activeTab to localStorage on change (survives refresh)
  useEffect(() => { if (activeTab) localStorage.setItem('agape_activeTab', activeTab); }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('agape_app_settings', JSON.stringify(appSettings));
    const theme = appSettings.theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : appSettings.theme || 'light';
    document.documentElement.dataset.theme = theme;
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
  }, [appSettings]);

  useEffect(() => {
    let unsubData = null;
    let unsubFcm = null;
    let dataLoaded = false;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Load user role — ensure doc exists for Firestore security rules
        const [userDoc, dataSnap] = await Promise.all([
          getDoc(doc(db, 'users', user.uid)).catch(() => null),
          getDoc(doc(db, DATA_DOC)),
        ]);
        if (!userDoc?.exists()) {
          await signOut(auth).catch(() => {});
          roleRef.current = null;
          currentUserRef.current = null;
          setRole(null);
          setCurrentUser(null);
          setIsAuthenticated(false);
          setActiveTab('dashboard');
          setLoginError('Account not found in Agape system. Please contact your administrator.');
          setIsLoading(false);
          return;
        }

        const userRole = String(userDoc.data()?.role || '').toLowerCase();
        const userEmail = user.email;
        // Capture in local variables for onSnapshot closure (useEffect has [])
        const capturedRole = userRole;
        const capturedEmail = userEmail;
        roleRef.current = userRole;
        currentUserRef.current = userEmail || '';
        setRole(userRole);
        setCurrentUser(userEmail);
        setIsAuthenticated(true);
        const savedTab = localStorage.getItem('agape_activeTab');
        const driverTabs = ['driverHome', 'chat', 'completed', 'cancelled', 'noshow', 'settings'];
        const validTab = capturedRole === 'driver'
          ? (driverTabs.includes(savedTab) ? savedTab : 'driverHome')
          : (savedTab && savedTab !== 'login' ? savedTab : 'dashboard');
        setActiveTab(validTab);

        // Request notification permission (non-drivers)
        if (userRole !== 'driver') {
          requestNotificationPermission().then(token => {
            if (token) { setNotificationsEnabled(true); }
          });
        }
        
        // Listen for foreground push messages
        unsubFcm = onForegroundMessage((payload) => {
          const title = payload.notification?.title || payload.data?.title || 'Agape Care';
          const body = payload.notification?.body || payload.data?.body || '';
          const type = payload.data?.type === 'chat' || title.toLowerCase().includes('message') ? 'message' : 'notification';
          if (title && body) showLocalNotification(title, body, type);
        });

        // Initialize data from Firestore
        if (dataSnap.exists()) {
          const d = dataSnap.data();
          setTrips((d.trips || DEFAULT_DATA.trips).map(normalizeTrip));
          setTrashedTrips(d.trashedTrips || []);
          setDrivers(d.drivers || DEFAULT_DATA.drivers);
          setLogs(d.logs || DEFAULT_DATA.logs);
          setDispatchers(d.dispatchers || DEFAULT_DATA.dispatchers);
          setPhoneNumbers(d.phoneNumbers || DEFAULT_DATA.phoneNumbers);
          setVehicles(d.vehicles || DEFAULT_DATA.vehicles);
        }
        setDataLoaded(true);
        setIsLoading(false);

        // Real-time listener for cross-tab / multi-user sync
        unsubData = onSnapshot(doc(db, DATA_DOC), {
          next: async (snap) => {
            if (snap.exists()) {
              fromSnapshot.current = true;
              const d = snap.data();
              setTrips((d.trips || []).map(normalizeTrip));
              setTrashedTrips(d.trashedTrips || []);
              setLogs(d.logs || []);
              setDispatchers(d.dispatchers || []);
              setPhoneNumbers(d.phoneNumbers || DEFAULT_DATA.phoneNumbers);
              setVehicles(d.vehicles || DEFAULT_DATA.vehicles);
              
              try {
                // ONLY admins/dispatchers can sync the driver list from the users collection
                // ONLY admins/dispatchers can sync the driver/dispatcher lists from the users collection
                const r = roleRef.current;
                if (r === 'admin' || r === 'dispatcher') {
                  const usersSnap = await getDocs(collection(db, 'users'));
                  const allUsers = usersSnap.docs.map(u => ({ id: u.id, ...u.data() }));
                  
                  // SYNC DRIVERS
                  const activeDriverUsers = allUsers
                    .filter(u => u.role && u.role.toLowerCase() === 'driver')
                    .map(u => ({ email: u.email, id: u.id, name: (u.email || '').split('@')[0], phone: u.phone || '' }));
                  
                  const currentDrivers = d.drivers || [];
                  const legacyNames = ['Alex Johnson', 'Sarah Miller', 'Michael Chen'];
                  let cleanedDrivers = currentDrivers.filter(p => !legacyNames.includes(p.name) && activeDriverUsers.find(au => au.email === p.email));
                  
                  let driversChanged = false;
                  activeDriverUsers.forEach(au => {
                    const existing = cleanedDrivers.find(d => d.email === au.email);
                    if (!existing) {
                      cleanedDrivers.push({
                        id: `DRV-${au.id.slice(0, 4)}`,
                        name: au.name, email: au.email, phone: au.phone || '',
                        status: 'Available', vehicle: 'Pending Assignment', dist: '--',
                        currentZone: 'TBD', odometer: 0, nextOilChange: 5000,
                        assignedTo: '', schedule: [], clockedIn: false
                      });
                      driversChanged = true;
                    } else if (au.phone && existing.phone !== au.phone) {
                      existing.phone = au.phone;
                      driversChanged = true;
                    }
                  });

                  // SYNC DISPATCHERS
                  const activeDispatcherUsers = allUsers
                    .filter(u => u.role && u.role.toLowerCase() === 'dispatcher')
                    .map(u => ({ email: u.email, id: u.id, name: (u.email || '').split('@')[0] }));
                  
                  let cleanedDispatchers = (d.dispatchers || []).filter(p => activeDispatcherUsers.find(au => au.email === p.email));
                  let dispatchersChanged = false;
                  
                  activeDispatcherUsers.forEach(au => {
                    const existing = cleanedDispatchers.find(ds => ds.email === au.email);
                    if (!existing) {
                      cleanedDispatchers.push({ id: `DSP-${String(cleanedDispatchers.length + 1).padStart(2, '0')}`, name: au.name, email: au.email });
                      dispatchersChanged = true;
                    }
                  });

                  if (driversChanged || dispatchersChanged || cleanedDrivers.length !== currentDrivers.length || cleanedDispatchers.length !== (d.dispatchers || []).length) {
                    setDrivers(cleanedDrivers);
                    setDispatchers(cleanedDispatchers);
                    updateDoc(doc(db, DATA_DOC), { drivers: cleanedDrivers, dispatchers: cleanedDispatchers }).catch(() => {});
                  } else {
                    setDrivers(cleanedDrivers);
                    setDispatchers(cleanedDispatchers);
                  }
                } else {
                  // Self-sync: ensure the current driver exists in the drivers array
                  let currentDrivers = d.drivers || [];
                  const cu = currentUserRef.current || '';
                  const normalizedCurrentEmail = cu.trim().toLowerCase();
                  const exists = currentDrivers.some(drv => (drv.email || '').trim().toLowerCase() === normalizedCurrentEmail);
                  if (!exists && r === 'driver') {
                    const driverUsers = await getDocs(collection(db, 'users'));
                    const myUserDoc = driverUsers.docs.find(u => (u.data().email || '').trim().toLowerCase() === normalizedCurrentEmail);
                    if (myUserDoc) {
                      const uid = myUserDoc.id;
                      const newDriver = {
                        id: `DRV-${uid.slice(0, 4)}`,
                        name: cu.split('@')[0] || 'Driver', email: cu, phone: '',
                        status: 'Available', vehicle: 'Pending Assignment', dist: '--',
                        currentZone: 'TBD', odometer: 0, nextOilChange: 5000,
                        assignedTo: '', schedule: [], clockedIn: false
                      };
                      currentDrivers = [...currentDrivers, newDriver];
                      updateDoc(doc(db, DATA_DOC), { drivers: currentDrivers }).catch(() => {});
                    }
                  }
                  setDrivers(currentDrivers);
                  setDispatchers(d.dispatchers || []);
                }
              } catch (err) {
                console.error("User list sync failed:", err);
              } finally {
                setTimeout(() => { fromSnapshot.current = false; }, 500);
              }
            }
          },
          error: (err) => { console.error("Snapshot error:", err); },
        });
      } else {
        roleRef.current = null;
        currentUserRef.current = null;
        dataLoaded = true;
        setIsLoading(false);
      }
    });
    return () => {
      unsub();
      if (unsubData) unsubData();
      if (typeof unsubFcm === 'function') unsubFcm();
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated && dataLoaded && !fromSnapshot.current) {
      persistState();
    }
  }, [trips, trashedTrips, drivers, logs, dispatchers, vehicles, phoneNumbers, dataLoaded, isAuthenticated, persistState]);

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
    if (!isAuthenticated || !currentUser || !role) return;
    let firstSnapshot = true;
    const unsub = onSnapshot(doc(db, 'chatData/conversations'), snap => {
      if (!snap.exists()) { setChatUnreadCount(0); return; }
      const curr = snap.data().conversations || {};
      // Calculate unread count for nav badge
      let totalUnread = 0;
      for (const c of Object.values(curr)) {
        if (c?.lastMessage?.sender && c.lastMessage.sender !== currentUser &&
            !(c.lastMessage?.readBy || []).includes(currentUser)) {
          totalUnread++;
        }
      }
      setChatUnreadCount(totalUnread);
      if (firstSnapshot) { firstSnapshot = false; prevChatConvsRef.current = curr; return; }
      const prev = prevChatConvsRef.current || {};
      for (const [id, c] of Object.entries(curr)) {
        const prevLast = prev[id]?.lastMessage;
        const currLast = c?.lastMessage;
        if (currLast && currLast.sender && currLast.sender !== currentUser &&
            (!prevLast || prevLast.text !== currLast.text || prevLast.timestamp !== currLast.timestamp)) {
          if (activeTab !== 'chat') {
            playMessageSound();
            showLocalNotification(
              `New message from ${currLast.sender.split('@')[0]}`,
              currLast.text,
              'message'
            );
          }
          break;
        }
      }
      prevChatConvsRef.current = curr;
    });
    return () => { unsub(); };
  }, [isAuthenticated, currentUser, role, activeTab]);

  const addAuditLog = (title, desc, color) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setLogs(prev => [{ t: title, d: desc, c: color, type: 'audit', timestamp: timeStr }, ...prev].slice(0, 100));
    setTimeout(persistState, 0);
  };


  const handleCreateAccount = async () => {
    if (!email || !password) { setLoginError('Enter email and password first.'); return; }
    if (password.length < 6) { setLoginError('Password must be at least 6 characters.'); return; }
    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', userCred.user.uid), { role: pendingRole || 'admin', email });
      await setDoc(doc(db, DATA_DOC), {
        trips: DEFAULT_DATA.trips,
        trashedTrips: [],
        drivers: DEFAULT_DATA.drivers,
        logs: DEFAULT_DATA.logs,
        dispatchers: DEFAULT_DATA.dispatchers,
      });
      setRole(pendingRole || 'admin');
      setCurrentUser(email);
      setIsAuthenticated(true);
      setActiveTab('dashboard');
      setLoginError('');
      requestNotificationPermission().then(token => { if (token) { setNotificationsEnabled(true); } });
    } catch (err) {
      setLoginError(err.message.replace('Firebase: ', ''));
    }
  };

  const executeLogin = async (selectedRole, userEmail) => {
    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      
      // SECURITY: Fetch the actual role from Firestore instead of trusting the user's selection
      const userSnap = await getDoc(doc(db, 'users', userCred.user.uid));
      if (!userSnap.exists()) {
        await signOut(auth);
        setLoginError("Account not found in Agape system. Please contact your administrator.");
        return;
      }
      
      const dbRole = String(userSnap.data().role || '').toLowerCase();
      const requestedRole = String(selectedRole || '').toLowerCase();
      if (dbRole !== requestedRole) {
        await signOut(auth);
        setLoginError(`Access Denied: Your account is registered as ${dbRole}, not ${selectedRole}.`);
        return;
      }
      
      setRole(dbRole);
      setCurrentUser(userCred.user.email || userEmail);
      setIsAuthenticated(true);
      setActiveTab(dbRole === 'driver' ? 'driverHome' : 'dashboard');
      setLoginError('');
      requestNotificationPermission().then(token => { if (token) { setNotificationsEnabled(true); } });
      if (requestedRole === 'dispatcher') {
        addAuditLog('Dispatcher Logged In', `Dispatcher ${userEmail} accessed the system.`, 'blue');
      }
    } catch (err) {
      setLoginError(err.message.replace('Firebase: ', ''));
    }
  };

  const handleLogout = async () => {
    if (role === 'dispatcher') addAuditLog('Dispatcher Logged Out', `Dispatcher ${currentUser} left the system.`, 'slate');
    await signOut(auth);
    roleRef.current = null;
    currentUserRef.current = null;
    setIsAuthenticated(false);
    setRole(null);
    setCurrentUser(null);
    setActiveManifest(null);
    setIsInspected(false);
    setLoginStep('role_selection');
    setEmail('');
    setPassword('');
    setLoginError('');
  };

  const toggleTaskSelection = (id) => {
    setSelectedTasks(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const createSharedRide = () => {
    const selectedTrips = trips.filter(t => selectedTasks.includes(t.id));
    if (selectedTrips.length < 2) return;
    const sharedGroupId = `SR-${Date.now().toString().slice(-6)}`;
    setTrips(prev => prev.map(t => selectedTasks.includes(t.id) ? { ...t, sharedRideGroup: sharedGroupId, status: t.status === 'Unassigned' ? 'Unassigned' : t.status } : t));
    addAuditLog('Shared Ride Created', `${currentUser} grouped ${selectedTrips.length} trips as shared ride ${sharedGroupId}.`, 'blue');
    setSelectedTasks([]);
    setBulkAssignModal(false);
    setTimeout(persistState, 0);
  };

  const createLegMission = (driverId) => {
    const selectedTrips = trips.filter(t => selectedTasks.includes(t.id));
    if (selectedTrips.length === 0) return;
    const driver = drivers.find(d => d.id === driverId);
    
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
    const updatedTrips = trips.map(t => selectedTasks.includes(t.id) ? {
      ...t,
      status: 'In Mission',
      driverId,
      driverEmail: driver?.email || null,
      driverName: driver?.name || null,
    } : t);
    setTrips(updatedTrips);
    
    // Save mission to driver document or a separate missions collection (using a special field for now)
    if (driver) {
      const updatedDrivers = drivers.map(d => d.id === driverId ? { ...d, activeMission: { id: `M-${Date.now()}`, legs, currentLegIndex: 0 } } : d);
      setDrivers(updatedDrivers);
      addAuditLog('Mission Created', `Created ${legs.length}-leg mission for ${driver.name} with ${selectedTrips.length} patients.`, 'indigo');
    }
    
    setSelectedTasks([]);
    setShowAssign(false);
    setTimeout(persistState, 0);
  };

  const assignTripToDriver = (tripId, driverId) => {
    const driver = drivers.find(d => d.id === driverId);
    const tripToAssign = trips.find(t => t.id === tripId);
    const updatedTrips = trips.map(t => t.id === tripId ? {
      ...t,
      status: 'Assigned',
      driverId,
      driverEmail: driver?.email || null,
      driverName: driver?.name || null,
    } : t);
    setTrips(updatedTrips);
    setSmartAssignTrip(null);
    setSmartAssignResult(null);
    if (role === 'dispatcher') {
      addAuditLog('AI Route Action', `${currentUser} assigned ${tripToAssign.patient}'s trip to ${driver.name} via AI Suggestion.`, 'emerald');
    } else {
      setTimeout(persistState, 0);
    }
    if (notificationsEnabled && tripToAssign) {
      showLocalNotification(
        '🚗 New Trip Assigned',
        `${tripToAssign.patient} — ${tripToAssign.pickup} → ${tripToAssign.dropoff}`
      );
    }
    // Specific alert for the driver if they are online
    if (driver && driver.email) {
      // In a real app, this would be a cloud function sending a push notification.
      // For this demo, we'll assume the driver is listening to the Firestore snapshot.
    }
  };

  const bulkAssignTrips = (driverId) => {
    if (selectedTasks.length === 0) return;
    const driver = drivers.find(d => d.id === driverId);
    setTrips(prev => prev.map(t => selectedTasks.includes(t.id) ? {
      ...t,
      status: 'Assigned',
      driverId,
      driverEmail: driver?.email || null,
      driverName: driver?.name || null,
    } : t));
    addAuditLog('Bulk Assignment', `${currentUser} assigned ${selectedTasks.length} trips to ${driver?.name || 'Unknown'}`, 'emerald');
    setSelectedTasks([]);
    setBulkAssignModal(false);
  };

  const triggerSmartAssign = async (trip) => {
    setSmartAssignTrip(trip);
    setSmartAssignResult(null);
    setAiAnalyzing(true);
    const result = await suggestOptimalDriver(trip, drivers, trips);
    setSmartAssignResult(result);
    setAiAnalyzing(false);
  };

  const triggerFleetOptimization = async () => {
    setAiAnalyzing(true);
    try {
      const unassigned = trips.filter(t => t.status === 'Unassigned');
      const available = drivers.filter(d => d.status === 'Available' || d.status === 'On Trip');
      if (unassigned.length > 0 && available.length > 0) {
        const assignments = await suggestBatchAssignment(unassigned, available);
        if (assignments && Object.keys(assignments).length > 0) {
          setTrips(prev => prev.map(t => {
            const assignedDriverId = assignments[t.id];
            if (!assignedDriverId) return t;
            const assignedDriver = available.find(driver => driver.id === assignedDriverId);
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
    if (window.confirm('Move this trip to Archive?')) {
      executeDeleteTrip(tripId);
    }
  };

  const updateTrip = (updatedTrip) => {
    setTrips(prev => prev.map(t => t.id === updatedTrip.id ? updatedTrip : t));
    addAuditLog('Trip Updated', `${currentUser} modified trip ${updatedTrip.id} (${updatedTrip.patient})`, 'blue');
  };

  const resetSystemData = () => {
    if (role !== 'admin') return;
    setTrips([]);
    setTrashedTrips([]);
    setDrivers([]);
    setLogs([{ t: 'System Reset', d: 'Administrator wiped all operational data.', c: 'rose', type: 'system' }]);
    addAuditLog('System Reset', 'Master data wipe performed by Admin.', 'rose');
  };

  const executeDeleteTrip = (tripId) => {
    const tripToDelete = trips.find(t => t.id === tripId);
    if (tripToDelete) {
      setTrashedTrips([tripToDelete, ...trashedTrips]);
      setTrips(trips.filter(t => t.id !== tripId));
      setSelectedTasks(selectedTasks.filter(id => id !== tripId));
      if (role === 'dispatcher') {
        addAuditLog('Trip Deleted', `${currentUser} deleted trip ${tripId} (${tripToDelete.patient}). Sent to Archive.`, 'rose');
      } else {
        setTimeout(persistState, 0);
      }
    }
  };

  const restoreTrip = (tripId) => {
    const tripToRestore = trashedTrips.find(t => t.id === tripId);
    if (tripToRestore) {
      const newTrips = [...trips, tripToRestore];
      const newTrashed = trashedTrips.filter(t => t.id !== tripId);
      setTrips(newTrips);
      setTrashedTrips(newTrashed);
      addAuditLog('Trip Restored', `${currentUser || 'Admin'} restored trip ${tripId} (${tripToRestore.patient}) from Archive.`, 'emerald');
      persistState({ trips: newTrips, trashedTrips: newTrashed });
    }
  };

  const handleDriverStatusUpdate = (driverId, clockedIn) => {
    setDrivers(prevDrivers => {
      const updated = prevDrivers.map(d => d.id === driverId ? {
        ...d,
        clockedIn,
        lastUpdate: new Date().toISOString(),
        status: clockedIn ? 'Available' : 'Offline',
      } : d);
      persistState({ drivers: updated });
      return updated;
    });
    addAuditLog(
      clockedIn ? 'Driver Clocked In' : 'Driver Clocked Out',
      `${drivers.find(d => d.id === driverId)?.name || driverId} ${clockedIn ? 'clocked in' : 'clocked out'}.`,
      clockedIn ? 'emerald' : 'blue'
    );
  };

  const handleCompleteTrip = (tripId, driverId, odometer) => {
    const trip = sTrips.current.find(t => t.id === tripId);
    if (!trip?.pickupOdometer || !trip?.arrivalTime || !trip?.departedPickupTime || !trip?.arrivalDropoffTime || (!trip?.paperSignatureConfirmed && !trip?.unableToSign)) {
      addAuditLog('Trip Completion Blocked', `${currentUser || 'Driver'} attempted to complete ${trip?.patient || tripId} before all required steps were finished.`, 'rose');
      return;
    }
    setTrips(prev => prev.map(t => t.id === tripId ? { ...t, status: 'Completed', dropoffOdometer: odometer, completedAt: new Date().toISOString() } : t));
    setDrivers(prev => prev.map(d => d.id === driverId ? { ...d, odometer } : d));
    const driver = drivers.find(d => d.id === driverId);
    addAuditLog('Trip Completed', `${driver?.name || 'Driver'} completed trip ${tripId} (${trip?.patient}). Odometer: ${odometer?.toLocaleString()} mi.`, 'emerald');
    // Maintenance check
    if (driver) {
      const dueIn = (driver.nextOilChange || 50000) - odometer;
      if (dueIn <= 200) {
        addAuditLog('⚠️ Maintenance Alert', `${driver.name}'s vehicle needs oil change at ${driver.nextOilChange?.toLocaleString()} mi (current: ${odometer?.toLocaleString()} mi).`, 'amber');
      }
    }
    if (notificationsEnabled) {
      showLocalNotification('✅ Trip Completed', `${trip?.patient || 'Trip'} marked as completed. Odometer: ${odometer?.toLocaleString()} mi.`);
    }
  };

  const handleUpdateDriverLocation = useCallback((driverId, latitude, longitude) => {
    setDrivers(prev => {
      const updated = prev.map(d => d.id === driverId ? {
        ...d,
        latitude,
        longitude,
        lastLocationUpdate: new Date().toISOString(),
      } : d);
      persistState({ drivers: updated });
      return updated;
    });
  }, [persistState]);

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
      setPendingRole(roleKey);
      setLoginStep('credentials');
    };

    const submitLogin = async (e) => {
      e.preventDefault();
      setLoginError('');
      let identifiedUser = null;
      if (pendingRole === 'dispatcher') {
        const foundDispatcher = dispatchers.find(d => d.email === email);
        identifiedUser = foundDispatcher ? foundDispatcher.name : email;
      }
      await executeLogin(pendingRole, identifiedUser || email);
    };

    return (
      <div className="flex-1 bg-slate-50 flex flex-col justify-center items-center p-4 relative overflow-hidden font-outfit" style={{paddingTop: 'var(--sat)', paddingBottom: 'var(--sab)'}}>
        {/* Subtle Background Orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-400/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-400/10 blur-[120px] rounded-full animate-pulse delay-700" />
        
        <div className="w-full max-w-lg bg-white/80 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(15,23,42,0.1)] p-8 sm:p-12 border border-white relative z-10">
          <div className="flex flex-col items-center mb-10 text-center">
            <div className="w-28 h-28 mb-6 relative">
              <div className="absolute inset-0 bg-blue-600 blur-2xl opacity-10 animate-pulse" />
              <img src="/agape.png" alt="Agape Care" className="w-full h-full object-contain relative z-10" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mb-3 leading-tight">Agape<span className="text-blue-600">Care</span></h1>
            <div className="flex items-center gap-2 px-4 py-1.5 bg-blue-50 rounded-full border border-blue-100">
              <ShieldCheck size={16} className="text-blue-600" />
              <p className="text-xs font-black text-blue-800 uppercase tracking-[0.2em]">Enterprise Fleet OS</p>
            </div>
          </div>

          {loginStep === 'role_selection' ? (
            <div className="space-y-5">
              <h2 className="text-center text-base font-bold text-slate-500 mb-8 tracking-wide">Secure Access Portal</h2>
              <div className="grid grid-cols-1 gap-4">
                {[
                  { key: 'admin', Icon: ShieldCheck, label: 'Administrator', sub: 'Master Control & Intelligence', color: 'indigo' },
                  { key: 'dispatcher', Icon: Briefcase, label: 'Dispatcher', sub: 'Fleet Logistics & Command', color: 'blue' },
                  { key: 'driver', Icon: Truck, label: 'Driver Console', sub: 'Field Operations & Service', color: 'emerald' }
                ].map(r => {
                  const Icon = r.Icon;
                  const colorMap = {
                    indigo: 'bg-indigo-600 shadow-indigo-600/20',
                    blue: 'bg-blue-600 shadow-blue-600/20',
                    emerald: 'bg-emerald-600 shadow-emerald-600/20'
                  };
                  return (
                    <button key={r.key} onClick={() => handleRoleSelect(r.key)} 
                      className="flex items-center gap-5 p-6 bg-white border border-slate-100 rounded-2xl hover:bg-slate-50 hover:border-blue-200 active:scale-[0.98] transition-all duration-300 group text-left shadow-sm">
                      <div className={`${colorMap[r.color]} p-4 rounded-xl text-white shadow-lg shrink-0 transition-transform group-hover:scale-110 flex items-center justify-center w-14 h-14`}>
                        <Icon size={24} strokeWidth={2.5} />
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
            <form onSubmit={submitLogin} className="space-y-6">
              <div className="flex items-center gap-4 mb-8 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <button type="button" onClick={() => setLoginStep('role_selection')} className="p-3 bg-white rounded-xl text-slate-400 hover:text-slate-900 shadow-sm active:scale-95 transition-all"><ArrowRight className="rotate-180" size={20} /></button>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Authenticating as</p>
                  <p className="text-base font-black text-slate-900 capitalize">{pendingRole}</p>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Enterprise Email</label>
                <div className="relative">
                  <input type="email" required placeholder="name@agapecare.com" value={email} onChange={(e) => setEmail(e.target.value)} 
                    className="w-full p-4 bg-slate-50 rounded-2xl font-semibold border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white transition-all outline-none text-base" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Secure Password</label>
                <div className="relative">
                  <input type="password" required placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} 
                    className="w-full p-4 bg-slate-50 rounded-2xl font-semibold border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white transition-all outline-none text-base" />
                </div>
              </div>

              {loginError && <p className="text-rose-600 text-sm font-semibold text-center mt-2 bg-rose-50 p-3 rounded-lg border border-rose-100">{loginError}</p>}
              
              <button type="submit" className="w-full py-5 mt-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold text-lg shadow-xl shadow-blue-500/25 active:scale-[0.98] hover:shadow-blue-500/40 transition-all duration-300">Authorize Access</button>
              
              <div className="pt-4 flex items-center justify-between text-sm font-bold">
                <button type="button" onClick={handleCreateAccount} className="text-slate-400 hover:text-slate-900 transition">New Deployment?</button>
                <span className="text-slate-200">|</span>
                <button type="button" className="text-slate-400 hover:text-slate-900 transition">Secure Reset</button>
              </div>
            </form>
          )}
        </div>
        
        <div className="mt-12 flex flex-col items-center gap-4 relative z-10">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em] text-center opacity-60">
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
        <div className="bg-white/90 backdrop-blur-xl w-full max-w-sm rounded-[2rem] p-8 shadow-2xl relative z-10 border border-white/50">
          <div className="w-16 h-16 bg-gradient-to-tr from-rose-600 to-rose-400 text-white rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-rose-500/30">
            <Lock size={32} />
          </div>
          <h3 className="text-xl font-black text-center text-slate-900 mb-2">Security Verification</h3>
          <p className="text-xs text-center text-slate-500 font-medium mb-2">Re-enter your password to authorize: <span className="font-bold text-slate-800">{authActionPayload?.label || 'Action'}</span></p>
          {reAuthError && <p className="text-xs text-center text-rose-600 font-semibold mb-4">{reAuthError}</p>}
          <form onSubmit={submitAuthAction}>
            <input type="password" required placeholder="Enter your password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className="w-full p-4 bg-slate-100/50 rounded-[1rem] font-semibold border border-slate-200/50 focus:border-rose-500 focus:bg-white mb-4" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowAuthModal(false)} className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-[1rem] font-bold active:scale-95 transition-all">Cancel</button>
              <button type="submit" className="flex-1 py-3.5 bg-rose-600 text-white rounded-[1rem] font-bold active:scale-95 transition-all shadow-md shadow-rose-500/20">Authorize</button>
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
            <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Truck size={24} className="text-emerald-600" /> Bulk Assignment
            </h3>
            <button onClick={() => setBulkAssignModal(false)} className="p-2 bg-slate-100 rounded-[1rem] text-slate-600 active:scale-95 transition-all"><X size={20} /></button>
          </div>
          
          <div className="bg-emerald-50 rounded-2xl p-4 mb-6 border border-emerald-100">
            <p className="text-sm font-bold text-emerald-900">Assigning {selectedTasks.length} Trips</p>
            <p className="text-sm font-medium text-emerald-700 mt-0.5">Select a driver below to assign all selected tasks.</p>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Available Fleet</h4>
            <div className="grid grid-cols-1 gap-2">
              {drivers.map(d => (
                <button key={d.id} onClick={() => bulkAssignTrips(d.id)} className="w-full flex items-center justify-between p-4 bg-white/50 border border-slate-200 rounded-2xl hover:bg-white hover:border-blue-300 hover:shadow-md transition-all group text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                      <User size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{d.name}</p>
                      <p className="text-xs font-medium text-slate-500">{d.vehicle || 'No Vehicle'} &bull; {d.status}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={d.status === 'Available' ? 'success' : 'warning'}>{d.status}</Badge>
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
                <h3 className="text-xl sm:text-2xl font-black text-slate-900">AI Chain-Route</h3>
                <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-widest">Target: {smartAssignTrip.patient}</p>
              </div>
            </div>
            <button onClick={() => { setSmartAssignTrip(null); setSmartAssignResult(null); }} className="p-2.5 bg-slate-100 rounded-[1rem] text-slate-600 active:scale-95 transition-all"><X size={20} /></button>
          </div>
          <div className="bg-slate-50/80 rounded-2xl p-4 mb-6 border border-slate-200/50">
            <div className="grid grid-cols-2 gap-4 text-xs font-bold text-slate-600">
              <div><span className="text-slate-400 block mb-1">Time</span>{smartAssignTrip.time}</div>
              <div><span className="text-slate-400 block mb-1">Type</span>{smartAssignTrip.type}</div>
              <div className="col-span-2"><span className="text-slate-400 block mb-1">Route</span>{smartAssignTrip.pickup} <ArrowRight size={12} className="inline text-slate-300 mx-1" /> {smartAssignTrip.dropoff.split(' ')[0]}</div>
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
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Target size={14} /> AI Assignment Result</h4>
              {smartAssignResult && smartAssignResult.driverId ? (
                (() => {
                  const d = drivers.find(drv => drv.id === smartAssignResult.driverId);
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
                          <div className="w-12 h-12 rounded-[1rem] bg-slate-200/50 text-slate-700 flex items-center justify-center font-black">{d.name.split(' ').map(n => n[0]).join('')}</div>
                          <div>
                            <h4 className="text-lg font-black text-slate-900">{d.name}</h4>
                            <p className="text-sm font-bold text-slate-500">{d.vehicle} &bull; {d.dist}</p>
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
    const availableDrivers = drivers.filter(d => d.status === 'Available');
    const otherDrivers = drivers.filter(d => d.status !== 'Available');
    
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
                <h3 className="text-xl font-black text-slate-900">Manual Assignment</h3>
                <p className="text-xs font-bold text-slate-500 mt-0.5 uppercase tracking-widest">Assign: {manualAssignTrip.patient}</p>
              </div>
            </div>
            <button onClick={() => setManualAssignTrip(null)} className="p-2.5 bg-slate-100 rounded-[1rem] text-slate-600 active:scale-95 transition-all"><X size={20} /></button>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-6 scrollbar-thin">
            {availableDrivers.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5"><CheckCircle2 size={12} /> Available Fleet</h4>
                <div className="grid grid-cols-1 gap-2">
                  {availableDrivers.map(d => (
                    <button key={d.id} onClick={() => { assignTripToDriver(manualAssignTrip.id, d.id); setManualAssignTrip(null); }}
                      className="flex items-center justify-between p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl hover:bg-emerald-50 active:scale-[0.98] transition-all group">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">{d.name.charAt(0)}</div>
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
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Clock size={12} /> Other Drivers ({otherDrivers.length})</h4>
                <div className="grid grid-cols-1 gap-2">
                  {otherDrivers.map(d => (
                    <button key={d.id} onClick={() => { assignTripToDriver(manualAssignTrip.id, d.id); setManualAssignTrip(null); }}
                      className="flex items-center justify-between p-4 bg-slate-50/50 border border-slate-100 rounded-2xl hover:bg-slate-50 active:scale-[0.98] transition-all group opacity-80 hover:opacity-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold">{d.name.charAt(0)}</div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-slate-900">{d.name}</p>
                          <p className="text-xs font-medium text-slate-500">{d.status} • {d.vehicle}</p>
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
              <h3 className="text-2xl font-black text-slate-900">Fleet AI Optimizer</h3>
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
              <button onClick={() => { triggerFleetOptimization(); setTimeout(() => setShowOptimizeModal(false), 3000); }} className="w-full py-4 bg-indigo-600 text-white rounded-[1rem] font-bold text-lg active:scale-95 transition-all flex items-center justify-center gap-3 shadow-md shadow-indigo-500/30">
                <Zap size={20} /> Launch Optimization
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDispatcherCommandCenter = () => {
    const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const today = getTodayStr();
    const dateFiltered = trips.filter(t => tripMatchesCalendarDay(t.date, today));
    const searchedTrips = dateFiltered.filter(t => t.patient.toLowerCase().includes(searchQuery.toLowerCase()));
    
    // SORTING LOGIC: Closest time first, Unassigned at bottom
    const sortedScheduled = searchedTrips
      .filter(t => t.time !== 'Will Call')
      .sort((a, b) => {
        if (a.status === 'Unassigned' && b.status !== 'Unassigned') return 1;
        if (a.status !== 'Unassigned' && b.status === 'Unassigned') return -1;
        return timeToMinutes(a.time) - timeToMinutes(b.time);
      });
      
    const willCallTrips = searchedTrips.filter(t => t.time === 'Will Call');

    return (
      <div className="space-y-6 md:space-y-8 w-full max-w-full overflow-hidden pb-32">
        {renderSmartAssignModal()}
        {renderBulkAssignModal()}
        {renderManualAssignModal()}
        {renderOptimizeAllModal()}
        {renderSecurityAuthModal()}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
          <div className="lg:col-span-8 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/80 backdrop-blur-xl p-3 md:p-4 rounded-[1.5rem] md:rounded-[2rem] border border-white shadow-[0_8px_30px_-12px_rgba(0,0,0,0.1)]">
              <div className="relative flex-1 w-full md:w-auto flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="text" placeholder="Search Agape Care manifests..." className="w-full pl-12 pr-4 py-3 bg-slate-100/50 border border-slate-200/50 rounded-[1rem] focus:bg-white focus:border-blue-500 font-semibold text-sm transition-all" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                <div className="bg-slate-100/50 p-1 rounded-[1.2rem] flex shrink-0">
                  <button onClick={() => setShowDispatcherArchive(false)} className={`px-4 py-2 rounded-[0.8rem] text-sm font-bold transition-all ${!showDispatcherArchive ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>Live</button>
                  <button onClick={() => setShowDispatcherArchive(true)} className={`px-4 py-2 rounded-[0.8rem] text-sm font-bold transition-all flex items-center gap-1 ${showDispatcherArchive ? 'bg-white shadow-sm text-rose-600' : 'text-slate-500'}`}>
                    <ArchiveRestore size={12} /> ({trashedTrips.length})
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <button onClick={() => setShowOptimizeModal(true)} className="flex-1 md:flex-none bg-indigo-600 text-white px-5 py-3 rounded-[1rem] font-bold text-xs active:scale-95 shadow-sm shadow-indigo-500/20 flex items-center justify-center gap-2 transition-all">
                  <Wand2 size={16} /> Optimize
                </button>
                <button onClick={() => setShowUploadModal(true)} className="flex-1 md:flex-none bg-slate-900 text-white px-5 py-3 rounded-[1rem] font-bold text-xs active:scale-95 shadow-sm flex items-center justify-center gap-2 transition-all">
                  <Upload size={16} /> Upload
                </button>
              </div>
            </div>

            {showDispatcherArchive ? (
              <div className="bg-rose-50/50 rounded-[1.5rem] border border-rose-100/50 shadow-sm overflow-hidden w-full">
                <div className="p-4 border-b border-rose-100/50 flex justify-between items-center bg-rose-100/30">
                  <h3 className="text-sm font-black flex items-center gap-2 text-rose-900">
                    <Trash2 size={16} className="text-rose-600" /> Deleted Trips Archive
                  </h3>
                </div>
                <div className="divide-y divide-rose-100/50">
                  {trashedTrips.length === 0 ? (
                    <div className="p-8 text-center text-rose-400 font-bold text-sm">The archive is currently empty.</div>
                  ) : (
                    trashedTrips.map(t => (
                      <div key={t.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/50">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="min-w-0">
                            <p className="font-black text-rose-900 text-sm truncate line-through">{t.patient}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <Badge variant="danger">Deleted</Badge>
                              <span className="text-xs font-bold text-rose-400 uppercase tracking-widest">{t.bookingId || '—'} &bull; {t.time}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <button onClick={() => restoreTrip(t.id)} className="bg-emerald-100 text-emerald-800 px-3 py-2 rounded-[0.8rem] text-sm font-bold active:scale-95 flex items-center gap-1.5 transition-all">
                            <RefreshCcw size={14} /> Restore
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <>
                {willCallTrips.length > 0 && (
                  <div className="bg-white/80 backdrop-blur-xl rounded-[1.5rem] md:rounded-[2.5rem] border border-amber-200/50 shadow-sm overflow-hidden w-full">
                    <div className="p-4 md:p-6 border-b border-amber-100 flex justify-between items-center bg-amber-50/50">
                      <div className="flex items-center gap-4">
                        <input 
                          type="checkbox" 
                          checked={willCallTrips.length > 0 && willCallTrips.every(t => selectedTasks.includes(t.id))}
                          onChange={(e) => {
                            const ids = willCallTrips.map(t => t.id);
                            if (e.target.checked) {
                              setSelectedTasks(prev => [...new Set([...prev, ...ids])]);
                            } else {
                              setSelectedTasks(prev => prev.filter(id => !ids.includes(id)));
                            }
                          }}
                          className="w-5 h-5 rounded-[0.4rem] border-amber-300 text-amber-600 cursor-pointer"
                        />
                        <h3 className="text-base md:text-lg font-black text-amber-900 flex items-center gap-2">
                          <Phone size={18} className="text-amber-600" /> Will Call Queue
                        </h3>
                      </div>
                      <Badge variant="warning">{willCallTrips.length} Pending</Badge>
                    </div>
                    <div className="divide-y divide-slate-100/50">
                      {willCallTrips.map(t => (
                        <div key={t.id} className={`p-4 md:px-6 md:py-4 flex flex-col transition-colors ${selectedTasks.includes(t.id) ? 'bg-amber-50/50' : 'hover:bg-slate-50/50'}`}>
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-4 min-w-0">
                              <input type="checkbox" checked={selectedTasks.includes(t.id)} onChange={() => toggleTaskSelection(t.id)} className="w-5 h-5 rounded-[0.4rem] border-slate-300 text-amber-600 shrink-0" />
                              <div className="min-w-0">
                                <p className="font-bold text-amber-900 text-sm md:text-base truncate">{t.patient}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant={t.status === 'Assigned' ? 'success' : 'warning'}>{t.status === 'Assigned' ? 'Assigned' : 'Awaiting Call'}</Badge>
                                  <span className="text-xs font-medium text-amber-700/70">{t.bookingId || '—'} &bull; {t.type}</span>
                                  {isTripLate(t.time) && t.status !== 'Completed' && <Badge variant="danger">Late</Badge>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between md:justify-end gap-2 md:gap-4 shrink-0">
                            {t.status === 'Unassigned' ? (
                                <div className="flex gap-2 w-full md:w-auto">
                                  <button onClick={() => triggerSmartAssign(t)} className="flex-1 md:flex-none bg-indigo-600 text-white px-3 py-2.5 rounded-[1rem] text-xs sm:text-xs font-bold active:scale-95 flex items-center justify-center gap-1.5 transition-all shadow-md shadow-indigo-500/10"><BrainCircuit size={14} /> AI</button>
                                  <button onClick={() => setManualAssignTrip(t)} className="flex-1 md:flex-none bg-blue-600 text-white px-3 py-2.5 rounded-[1rem] text-xs sm:text-xs font-bold active:scale-95 flex items-center justify-center gap-1.5 transition-all shadow-md shadow-blue-500/10"><Users size={14} /> Assign</button>
                                </div>
                              ) : (
                                <div className="bg-emerald-50 text-emerald-800 px-3 py-2 rounded-[1rem] border border-emerald-100 text-xs sm:text-xs font-bold flex items-center gap-1.5"><CheckCircle2 size={12} /> {drivers.find(d => d.id === t.driverId)?.name}</div>
                              )}
                              <button onClick={() => requestDeleteTrip(t.id)} className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-[1rem] active:scale-95 transition-all" title="Delete Trip"><Trash2 size={18} /></button>
                            </div>
                          </div>
                          {t.status === 'Assigned' && (
                            <div className="mt-2 pl-9">
                               <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                 <div className="h-full bg-blue-500 w-1/3 animate-pulse" />
                               </div>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100 pl-9">
                            {t.pickupPhone && (
                              <>
                                <a href={`tel:${t.pickupPhone.replace(/[^0-9]/g, '')}`} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-bold active:bg-emerald-200 transition-colors"><Phone size={12} /> {t.pickupPhone} <span className="text-xs font-medium opacity-70">Client</span></a>
                                <a href={`sms:${t.pickupPhone.replace(/[^0-9]/g, '')}`} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-bold active:bg-blue-200 transition-colors"><MessageSquare size={12} /> SMS Client</a>
                              </>
                            )}
                            {t.dropoffPhone && (
                              <>
                                <a href={`tel:${t.dropoffPhone.replace(/[^0-9]/g, '')}`} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold active:bg-slate-200 transition-colors"><Building2 size={12} /> {t.dropoffPhone} <span className="text-xs font-medium opacity-70">Hospital</span></a>
                                <a href={`sms:${t.dropoffPhone.replace(/[^0-9]/g, '')}`} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold active:bg-slate-200 transition-colors"><MessageSquare size={12} /> SMS Hosp</a>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-white/80 backdrop-blur-xl rounded-[1.5rem] md:rounded-[2.5rem] border border-white shadow-[0_8px_30px_-12px_rgba(0,0,0,0.1)] overflow-hidden w-full">
                  <div className="p-5 md:p-6 border-b border-slate-100/50 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <input 
                        type="checkbox" 
                        checked={sortedScheduled.length > 0 && sortedScheduled.every(t => selectedTasks.includes(t.id))}
                        onChange={(e) => {
                          const ids = sortedScheduled.map(t => t.id);
                          if (e.target.checked) {
                            setSelectedTasks(prev => [...new Set([...prev, ...ids])]);
                          } else {
                            setSelectedTasks(prev => prev.filter(id => !ids.includes(id)));
                          }
                        }}
                        className="w-5 h-5 rounded-[0.4rem] border-slate-300 text-blue-600 cursor-pointer"
                      />
                      <h3 className="text-base md:text-lg font-black flex items-center gap-2">
                        <Clock size={18} className="text-blue-600" /> Scheduled Board
                      </h3>
                    </div>
                    <div className="flex gap-2">
                      {selectedTasks.length > 0 && (
                        <button onClick={() => setBulkAssignModal(true)} className="bg-emerald-600 text-white px-4 py-2.5 rounded-[1rem] text-xs font-bold active:scale-95 flex items-center gap-2 transition-all"><Users size={14} /> Assign {selectedTasks.length} Trips</button>
                      )}
                      {selectedTasks.length > 1 && (
                        <button onClick={createSharedRide} className="bg-blue-600 text-white px-4 py-2.5 rounded-[1rem] text-xs font-bold active:scale-95 flex items-center gap-2 transition-all"><Repeat size={14} /> Group Trips</button>
                      )}
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100/50">
                    {sortedScheduled.map(t => (
                      <div key={t.id} className={`p-4 md:px-8 md:py-6 flex flex-col transition-colors ${selectedTasks.includes(t.id) ? 'bg-blue-50/50' : 'hover:bg-slate-50/50'}`}>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-center gap-4 min-w-0">
                            <input type="checkbox" checked={selectedTasks.includes(t.id)} onChange={() => toggleTaskSelection(t.id)} className="w-5 h-5 rounded-[0.4rem] border-slate-300 text-blue-600 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 text-sm md:text-base truncate">{t.patient}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant={t.status === 'Unassigned' ? 'danger' : 'success'}>{t.status}</Badge>
                                <span className="text-xs font-medium text-slate-500">{t.time}</span>
                                {isTripLate(t.time) && t.status !== 'Completed' && <Badge variant="danger">Late</Badge>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between md:justify-end gap-2 md:gap-4 shrink-0">
                            {t.status === 'Unassigned' ? (
                                <div className="flex gap-2 w-full md:w-auto">
                                  <button onClick={() => triggerSmartAssign(t)} className="flex-1 md:flex-none bg-indigo-600 text-white px-3 py-2.5 rounded-[1rem] text-xs sm:text-xs font-bold active:scale-95 flex items-center justify-center gap-1.5 transition-all shadow-md shadow-indigo-500/10"><BrainCircuit size={14} /> AI</button>
                                  <button onClick={() => setManualAssignTrip(t)} className="flex-1 md:flex-none bg-blue-600 text-white px-3 py-2.5 rounded-[1rem] text-xs sm:text-xs font-bold active:scale-95 flex items-center justify-center gap-1.5 transition-all shadow-md shadow-blue-500/10"><Users size={14} /> Assign</button>
                                </div>
                              ) : (
                                <div className="bg-emerald-50 text-emerald-800 px-3 py-2 rounded-[1rem] border border-emerald-100 text-xs sm:text-xs font-bold flex items-center gap-1.5"><CheckCircle2 size={12} /> {drivers.find(d => d.id === t.driverId)?.name || 'Assigned'}</div>
                              )}
                            <button onClick={() => requestDeleteTrip(t.id)} className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-[1rem] active:scale-95 transition-all" title="Delete Trip"><Trash2 size={18} /></button>
                          </div>
                        </div>
                        {t.status === 'Assigned' && (
                          <div className="mt-2 pl-9">
                             <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                               <div className="h-full bg-blue-500 w-1/3 animate-pulse" />
                             </div>
                          </div>
                        )}
                        <div className="mt-3 pl-9 text-sm font-medium text-slate-500 flex flex-col gap-1">
                          <p className="flex items-center gap-2 truncate"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span> {t.pickup}</p>
                          <p className="flex items-center gap-2 truncate"><span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span> {t.dropoff}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2 pl-9">
                          {t.pickupPhone && (
                            <>
                              <a href={`tel:${t.pickupPhone.replace(/[^0-9]/g, '')}`} className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold active:bg-emerald-200 transition-colors"><Phone size={11} /> Client</a>
                              <a href={`sms:${t.pickupPhone.replace(/[^0-9]/g, '')}`} className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold active:bg-blue-200 transition-colors"><MessageSquare size={11} /> SMS</a>
                            </>
                          )}
                          {t.dropoffPhone && (
                            <>
                              <a href={`tel:${t.dropoffPhone.replace(/[^0-9]/g, '')}`} className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold active:bg-slate-200 transition-colors"><Building2 size={11} /> Hospital</a>
                              <a href={`sms:${t.dropoffPhone.replace(/[^0-9]/g, '')}`} className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold active:bg-slate-200 transition-colors"><MessageSquare size={11} /> SMS</a>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="lg:col-span-4 space-y-4 sm:space-y-6">
            <div className="bg-white/80 backdrop-blur-xl rounded-[1.5rem] p-4 sm:p-6 border border-white shadow-[0_8px_30px_-12px_rgba(0,0,0,0.1)]">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <h3 className="text-[11px] sm:text-xs font-black text-slate-900">Live Fleet</h3>
                <div className="flex items-center gap-3">
                  {role === 'admin' && <button className="p-1.5 sm:p-2 bg-slate-100 hover:bg-slate-200 rounded-lg sm:rounded-[1rem] text-slate-600 active:scale-95 transition-all" title="Add Driver/Vehicle"><Plus size={14} /></button>}
                  <span className="relative flex h-2 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2.5 bg-emerald-500"></span>
                  </span>
                </div>
              </div>
              <div className="space-y-2 sm:space-y-3">
                {drivers.map(d => {
                  const isMaintenanceDue = d.nextOilChange - d.odometer < 200;
                  return (
                    <div key={d.id} className={`p-3 sm:p-4 rounded-xl sm:rounded-[1.5rem] active:scale-[0.98] transition-all cursor-pointer ${isMaintenanceDue ? 'bg-rose-50 border border-rose-100' : 'bg-slate-50 border border-slate-100/50'}`}>
                      <div className="flex items-center justify-between mb-2 sm:mb-3">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                          <div className="w-8 sm:w-10 h-8 sm:h-10 rounded-lg sm:rounded-[1rem] bg-blue-100 text-blue-600 flex items-center justify-center font-bold shrink-0 text-[11px] sm:text-xs">{d.name.charAt(0)}</div>
                          <div className="min-w-0">
                            <p className="font-bold text-[11px] sm:text-xs truncate text-slate-900">{d.name}</p>
                            <p className="text-xs sm:text-xs font-medium text-slate-500 flex items-center gap-1 truncate"><MapPin size={8} className="text-blue-500 shrink-0" /> {d.currentZone}</p>
                          </div>
                        </div>
                        <div className={`w-2 h-2.5 rounded-full ${d.status === 'Available' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                      </div>
                      <div className="flex items-center justify-between text-xs sm:text-xs font-bold text-slate-500">
                        <div className="flex items-center gap-2">
                          <span>{d.vehicle}</span>
                          {d.phone && (
                            <div className="flex gap-1 ml-1">
                              <a href={`tel:${d.phone}`} className="p-1 bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100"><Phone size={8} /></a>
                              <a href={`sms:${d.phone}`} className="p-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"><MessageSquare size={8} /></a>
                            </div>
                          )}
                        </div>
                        <span>{d.dist}</span>
                        {isMaintenanceDue && <span className="text-rose-600"><Wrench size={10} className="inline mr-1" />Service Due</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-[1.5rem] p-4 sm:p-6 border border-white shadow-[0_8px_30px_-12px_rgba(0,0,0,0.1)]">
              <h3 className="text-[11px] sm:text-xs font-black text-slate-900 mb-3 sm:mb-4 flex items-center gap-2"><Activity size={16} className="text-indigo-600" /> System Pulse</h3>
              <div className="space-y-1 sm:space-y-2 max-h-48 sm:max-h-60 overflow-y-auto">
                {logs.slice(0, 5).map((log, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-1.5 sm:p-2 rounded-lg hover:bg-slate-50">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${log.c === 'amber' ? 'bg-amber-500' : log.c === 'blue' ? 'bg-blue-500' : log.c === 'rose' ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
                    <div className="min-w-0">
                      <p className="text-sm sm:text-xs font-bold text-slate-900 truncate">{log.t}</p>
                      <p className={`text-xs sm:text-xs ${getLogTextColor(log.c)} truncate`}>{log.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Offline Banner */}
      <div className={`offline-banner${isOffline ? ' visible' : ''}`}>
        You are offline — changes will sync when connection returns
      </div>
      <div className="flex-1 bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      {/* HEADER */}
      <header className="bg-white shadow-sm border-b border-slate-200" style={{paddingTop: 'var(--sat)'}}>
        <div className="max-w-full px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <img src="/agape.png" alt="Agape Care" className="w-10 sm:w-12 h-10 sm:h-12 rounded-xl shrink-0 shadow-sm" />
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-extrabold text-slate-900 truncate leading-tight tracking-tight">Agape Care</h1>
              <p className="hidden sm:block text-sm text-slate-500 font-medium">Fleet Management System</p>
            </div>
          </div>
          {isAuthenticated && (
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {role === 'driver' && (() => {
                const myDriver = drivers.find(d => (d.email || '').toLowerCase() === (currentUser || '').toLowerCase());
                const isOnline = myDriver?.clockedIn || false;
                return (
                  <button onClick={() => handleDriverStatusUpdate(myDriver?.id, !isOnline)}
                    className={`h-10 px-4 rounded-xl font-bold text-sm uppercase tracking-wider transition-all active:scale-95 border-2 ${isOnline ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm shadow-emerald-200' : 'bg-white text-slate-600 border-slate-300'}`}>
                    {isOnline ? 'Online' : 'Offline'}
                  </button>
                );
              })()}
              {role === 'driver' && phoneNumbers?.routing && (
                <a href={`tel:${cleanPhone(phoneNumbers.routing)}`} className="h-10 px-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition text-sm font-bold flex items-center gap-1.5 shadow-sm" title="Call Routing">
                  <Phone size={16} /><span className="hidden sm:inline">Routing</span>
                </a>
              )}
              {role === 'driver' && phoneNumbers?.dispatcher && (
                <a href={`tel:${cleanPhone(phoneNumbers.dispatcher)}`} className="h-10 px-3 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition text-sm font-bold flex items-center gap-1.5 shadow-sm" title="Call Dispatch">
                  <Phone size={16} /><span className="hidden sm:inline">Dispatch</span>
                </a>
              )}
              <span className="hidden sm:inline-flex items-center px-4 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-sm font-bold capitalize border border-blue-100">{role}</span>
              <button onClick={handleLogout} className="h-10 px-3 hover:bg-slate-100 rounded-xl text-slate-600 hover:text-slate-900 transition font-semibold text-sm flex items-center gap-1.5">
                <LogOut size={18} /> <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* LOADING SCREEN */}
      {isLoading ? (
        <div className="flex-1 bg-slate-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-6">
            <div className="w-20 h-20 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin shadow-lg shadow-blue-100"></div>
            <div className="text-center">
              <p className="text-lg font-bold text-slate-700">Loading Agape Care</p>
              <p className="text-sm font-medium text-slate-400 mt-1">Preparing your workspace...</p>
            </div>
          </div>
        </div>
      ) : !isAuthenticated ? (
        renderLoginScreen()
      ) : (
        <>
          {/* NAVIGATION TABS */}
          <div className="nav-blur sticky top-0 z-40 overflow-x-auto">
            <div className="max-w-full px-3 sm:px-6 flex gap-1 sm:gap-2 whitespace-nowrap">
              {(() => {
                const allTabs = [
                  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
                  { id: 'trips', label: 'Trips', icon: FileText },
                  { id: 'dispatch', label: 'Dispatch', icon: Zap },
                  { id: 'map', label: 'Live Map', icon: MapIcon },
                  { id: 'chat', label: 'Chat', icon: MessageCircle },
                  { id: 'drivers', label: 'Drivers & Vehicles', icon: Truck },
                  { id: 'reports', label: 'Reports', icon: BarChart2 },
                  { id: 'archives', label: 'Archives', icon: Archive },
                  ...(role === 'admin' ? [{ id: 'users', label: 'Users', icon: Users }] : []),
                  { id: 'settings', label: 'Settings', icon: Settings },
                ];
                
                if (role === 'driver') {
                  return []; // Driver uses its own bottom nav inside DriverPage
                }
                
                if (role === 'dispatcher') {
                  // Dispatchers see: Dashboard, Trips, Chat, Archives, Settings
                  // STRICTLY NO: Users, Reports, Live Map, Drivers & Vehicles
                  return allTabs.filter(t => ['dashboard', 'trips', 'chat', 'archives', 'settings'].includes(t.id));
                }
                
                return allTabs;
              })().map(tab => {
                const Icon = tab.icon;
                const isChat = tab.id === 'chat';
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      if (role === 'dispatcher') setSearchQuery('');
                    }}
                    className={`py-2 sm:py-3 px-2.5 sm:px-3 border-b-2 font-bold flex items-center justify-center gap-1.5 sm:gap-2 transition text-[11px] sm:text-xs ${
                      activeTab === tab.id
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-500 hover:text-blue-600'
                    }`}
                  >
                    {isChat ? (
                      <span className="relative inline-flex">
                        <Icon size={16} className="sm:w-[18px] sm:h-[18px]" />
                        {chatUnreadCount > 0 && (
                          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 leading-none shadow-sm">
                            {chatUnreadCount > 9 ? '9+' : chatUnreadCount}
                          </span>
                        )}
                      </span>
                    ) : (
                      <Icon size={16} className="sm:w-[18px] sm:h-[18px]" />
                    )}
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* TAB CONTENT */}
          <div className="max-w-full px-4 sm:px-8 py-6 sm:py-10 flex flex-col flex-1">
            {role === 'driver' ? (() => {
              const normalizedCurrentUserEmail = (currentUser || '').trim().toLowerCase();
              const myDriver = drivers.find(d => ((d.email || '').trim().toLowerCase()) === normalizedCurrentUserEmail);
              const driverId = myDriver?.id;
              const isTripForCurrentDriver = (trip) => {
                const resolvedDriverEmail = (
                  trip.driverEmail || drivers.find(d => d.id === trip.driverId)?.email || ''
                ).trim().toLowerCase();
                return trip.driverId === driverId || resolvedDriverEmail === normalizedCurrentUserEmail;
              };
              const myTrips = trips.filter(t => isTripForCurrentDriver(t) && tripMatchesTodayOrTomorrow(t.date));
              const myDrivers = myDriver ? [myDriver] : [];
              return <DriverPage currentUser={currentUser} role={role} drivers={myDrivers} trips={myTrips}
                appSettings={appSettings}
                activeMission={myDriver?.activeMission}
                phoneNumbers={phoneNumbers}
                onOpenSettings={() => setActiveTab('settings')}
                onUpdateAppSettings={updateAppSettings}
                onUpdateMission={(updatedMission) => {
                  setDrivers(prev => prev.map(d => d.id === driverId ? { ...d, activeMission: updatedMission } : d));
                  setTimeout(persistState, 0);
                }}
                onUpdateDriverLocation={handleUpdateDriverLocation}
                onUpdateTrip={(tripId, status, extraData = {}) => {
                  setTrips(prev => prev.map(t => t.id === tripId ? { ...t, status, ...extraData } : t));
                  const trip = sTrips.current.find(t => t.id === tripId);
                  addAuditLog('Driver Update', `${currentUser} (Driver) updated trip ${tripId} (${trip?.patient || 'Unknown'}) to ${status}`, 'blue');
                }}
                onDriverStatusUpdate={handleDriverStatusUpdate}
                onCompleteTrip={(tripId, driverId, odometer) => {
                  handleCompleteTrip(tripId, driverId, odometer);
                  const trip = sTrips.current.find(t => t.id === tripId);
                  addAuditLog('Trip Completed', `${currentUser} (Driver) completed trip ${tripId} (${trip?.patient || 'Unknown'}). Odo: ${odometer}`, 'emerald');
                }}
              />;
            })() : role === 'dispatcher' && activeTab === 'dashboard' ? (
              renderDispatcherCommandCenter()
            ) : activeTab === 'dashboard' ? (
              <div className="space-y-6">
                {(role === 'admin') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <button
                      onClick={() => setShowUploadModal(true)}
                      className="p-4 sm:p-6 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl hover:shadow-lg transition text-left"
                    >
                      <Upload size={24} className="mb-2 sm:mb-3" />
                      <h3 className="text-base sm:text-lg font-bold mb-1">Upload Trips</h3>
                      <p className="text-[11px] sm:text-xs opacity-90">Import from CSV/Excel</p>
                    </button>
                    <button
                      onClick={() => setActiveTab('trips')}
                      className="p-4 sm:p-6 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-xl hover:shadow-lg transition text-left"
                    >
                      <Zap size={24} className="mb-2 sm:mb-3" />
                      <h3 className="text-base sm:text-lg font-bold mb-1">Create Trip</h3>
                      <p className="text-[11px] sm:text-xs opacity-90">Manually create a new trip</p>
                    </button>
                  </div>
                )}

                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5">
                    <div className="card p-5 sm:p-6 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                        <FileText size={48} className="text-blue-600" />
                      </div>
                      <h3 className="text-micro">Active Manifest</h3>
                      <p className="text-3xl font-black text-slate-900 mt-2 tracking-tight">{trips.length}</p>
                      <div className="mt-2 flex items-center gap-1 text-xs font-bold text-emerald-500">
                        <Zap size={12} /> +12% from yesterday
                      </div>
                    </div>
                    <div className="card p-5 sm:p-6 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Truck size={48} className="text-emerald-600" />
                      </div>
                      <h3 className="text-micro">Fleet Ready</h3>
                      <p className="text-3xl font-black text-slate-900 mt-2 tracking-tight">{drivers.filter(d => d.status === 'Available').length}/{drivers.length}</p>
                      <div className="mt-2 flex items-center gap-1 text-xs font-bold text-blue-500">
                        <Activity size={12} /> Operational
                      </div>
                    </div>
                    <div className="card p-5 sm:p-6 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Target size={48} className="text-rose-600" />
                      </div>
                      <h3 className="text-micro">Completion Rate</h3>
                      <p className="text-3xl font-black text-slate-900 mt-2 tracking-tight">
                        {trips.length > 0 ? Math.round((trips.filter(t => t.status === 'Completed').length / trips.length) * 100) : 0}%
                      </p>
                      <div className="mt-2 flex items-center gap-1 text-xs font-bold text-rose-500">
                        <ArrowRight size={12} /> Target: 98%
                      </div>
                    </div>
                    <div className="card p-5 sm:p-6 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                        <ShieldCheck size={48} className="text-indigo-600" />
                      </div>
                      <h3 className="text-micro">Security Status</h3>
                      <p className="text-3xl font-black text-slate-900 mt-2 tracking-tight">v4.2</p>
                      <div className="mt-2 flex items-center gap-1 text-xs font-bold text-indigo-500">
                        <Lock size={12} /> HIPAA Encrypted
                      </div>
                    </div>
                  </div>

                  <div className="card overflow-hidden">
                    <div className="p-5 sm:p-6 border-b border-slate-100">
                      <h2 className="text-heading text-slate-900">Fleet Overview</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-100">
                          <tr>
                            <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-sm font-bold text-slate-600">Driver</th>
                            <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-sm font-bold text-slate-600 hidden sm:table-cell">Vehicle</th>
                            <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-sm font-bold text-slate-600">Status</th>
                            <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-sm font-bold text-slate-600 hidden md:table-cell">Location</th>
                            <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-sm font-bold text-slate-600 hidden md:table-cell">Odometer</th>
                            <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-sm font-bold text-slate-600">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {drivers.map((driver) => (
                            <tr key={driver.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                              <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-bold text-slate-900">{driver.name}</td>
                              <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm text-slate-600 hidden sm:table-cell">{driver.vehicle}</td>
                              <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm">
                                <Badge variant={driver.status === 'Available' ? 'success' : 'warning'}>{driver.status}</Badge>
                              </td>
                              <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm text-slate-600 hidden md:table-cell">{driver.currentZone}</td>
                              <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm text-slate-600 hidden md:table-cell">{driver.odometer} mi</td>
                              <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm">
                                <div className="flex items-center gap-2">
                                  <button onClick={() => { setActiveTab('drivers'); }} className="text-blue-600 hover:text-blue-800 font-bold text-sm">View</button>
                                  {driver.phone && (
                                    <>
                                      <a href={`tel:${driver.phone}`} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition"><Phone size={16} /></a>
                                      <a href={`sms:${driver.phone}`} className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition"><MessageSquare size={16} /></a>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                <div className="card p-5 sm:p-6">
                  <h2 className="text-heading text-slate-900 mb-4">System Logs</h2>
                  <div className="space-y-2">
                    {logs.map((log, idx) => (
                      <div key={idx} className="flex gap-3 items-start p-3 bg-slate-50 rounded-xl border border-slate-100/50">
                        <AlertCircle className="shrink-0 mt-0.5" size={20} style={{ color: log.c === 'amber' ? '#b45309' : log.c === 'blue' ? '#2563eb' : log.c === 'rose' ? '#e11d48' : '#059669' }} />
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 text-sm truncate">{log.t}</p>
                          <p className={`text-sm ${getLogTextColor(log.c)} truncate`}>{log.d}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            ) : activeTab === 'trips' ? (
              <TripsPage trips={trips} role={role} drivers={drivers}
                selectedTasks={selectedTasks}
                toggleTaskSelection={toggleTaskSelection}
                onCreateLegMission={createLegMission}
                onBulkAssignTrips={bulkAssignTrips}
                onAssignTrip={(tripId, driverId) => {
                  const driver = drivers.find(d => d.id === driverId);
                  setTrips(prev => prev.map(t => t.id === tripId ? {
                    ...t,
                    status: 'Assigned',
                    driverId,
                    driverEmail: driver?.email || null,
                    driverName: driver?.name || null,
                  } : t));
                  const trip = trips.find(t => t.id === tripId);
                  addAuditLog('Assignment Action', `${currentUser} (${role}) assigned ${trip?.patient || 'Trip '+tripId} to ${driver?.name || 'Unknown'}`, 'emerald');
                  addToast('Trip Assigned', `${trip?.patient}'s trip was assigned to ${driver?.name || 'driver'}.`, 'success');
                }}
                onUnassignTrip={(tripId) => {
                  setTrips(prev => prev.map(t => t.id === tripId ? {
                    ...t,
                    status: 'Unassigned',
                    driverId: null,
                    driverEmail: null,
                    driverName: null,
                  } : t));
                  const trip = trips.find(t => t.id === tripId);
                  addAuditLog('Unassignment', `${currentUser} (${role}) unassigned trip for ${trip?.patient || 'Unknown'}`, 'amber');
                }}
                onAddTrip={(newTrip) => {
                  const id = `TRP-${Date.now().toString().slice(-6)}`;
                  const driverId = newTrip.driverId || null;
                  const driver = drivers.find(d => d.id === driverId);
                  setTrips(prev => [...prev, { ...newTrip, id, bookingId: extractCustomBookingId(newTrip.bookingId), status: driverId ? 'Assigned' : 'Unassigned', driverId, driverEmail: driver?.email || null, driverName: driver?.name || null }]);
                  addAuditLog('Trip Created', `${currentUser} manually added trip for ${newTrip.patient}${driver ? ` assigned to ${driver.name}` : ''}`, 'emerald');
                }}
                onUpdateTrip={updateTrip}
                onDeleteTrip={requestDeleteTrip}
              />
            ) : activeTab === 'dispatch' ? (
              <Suspense fallback={<LazyFallback />}>
                <DispatchAssistant drivers={drivers} trips={trips}
                  onAssignTrip={(tripId, driverId) => {
                    const driver = drivers.find(d => d.id === driverId);
                    setTrips(prev => prev.map(t => t.id === tripId ? {
                      ...t,
                      status: 'Assigned',
                      driverId,
                      driverEmail: driver?.email || null,
                      driverName: driver?.name || null,
                    } : t));
                    const trip = trips.find(t => t.id === tripId);
                    addAuditLog('AI Dispatch', `${currentUser} (${role}) confirmed AI suggestion for ${trip?.patient || 'Trip '+tripId} to ${driver?.name || 'Unknown'}`, 'indigo');
                  }}
                  addAuditLog={addAuditLog}
                  currentUser={currentUser}
                />
              </Suspense>
            ) : activeTab === 'chat' ? (
              <ChatPage currentUser={currentUser} role={role} />
            ) : activeTab === 'drivers' ? (
              <DriversVehiclesPage role={role} drivers={drivers} setDrivers={setDrivers} dispatchers={dispatchers} addAuditLog={addAuditLog} currentUser={currentUser} trips={trips} requestAuthAction={requestAuthAction} vehicles={vehicles} setVehicles={setVehicles}
                onAssignTrip={(tripId, driverId) => {
                  const driver = drivers.find(d => d.id === driverId);
                  setTrips(prev => prev.map(t => t.id === tripId ? {
                    ...t,
                    status: 'Assigned',
                    driverId,
                    driverEmail: driver?.email || null,
                    driverName: driver?.name || null,
                  } : t));
                  const trip = trips.find(t => t.id === tripId);
                  addAuditLog('Assignment', `${currentUser} (${role}) assigned ${trip?.patient || 'Trip '+tripId} to ${driver?.name || 'Unknown'}`, 'emerald');
                }}
                onUploadForDriver={(driverId) => { setUploadAssignDriver(driverId); setShowUploadModal(true); }}
              />
            ) : activeTab === 'reports' ? (
              <Suspense fallback={<LazyFallback />}>
              <ReportsPage trips={trips} drivers={drivers} onUpdateTrip={updateTrip} role={role} />
              </Suspense>
            ) : activeTab === 'archives' ? (
              <ArchivesPage
                trashedTrips={role === 'driver' ? trashedTrips.filter(t => t.driverId === drivers.find(d => d.email === currentUser)?.id) : trashedTrips}
                restoreTrip={role === 'driver' ? null : restoreTrip}
              />
            ) : activeTab === 'map' ? (
              <Suspense fallback={<LazyFallback />}>
              <LiveMapPage drivers={drivers} onUpdateDriverLocation={handleUpdateDriverLocation} />
              </Suspense>
            ) : activeTab === 'users' ? (
              <UsersPage drivers={drivers} setDrivers={setDrivers} dispatchers={dispatchers} setDispatchers={setDispatchers} addAuditLog={addAuditLog} currentUser={currentUser} role={role} requestAuthAction={requestAuthAction} />
            ) : activeTab === 'settings' ? (
              <SettingsPage currentUser={currentUser} role={role} onLogout={handleLogout} onResetSystem={resetSystemData} trashedTrips={trashedTrips} appSettings={appSettings} onUpdateAppSettings={updateAppSettings} phoneNumbers={phoneNumbers} onUpdatePhoneNumbers={handleUpdatePhoneNumbers} requestAuthAction={requestAuthAction} hasPermission={hasPermission} driverProfile={role === 'driver' ? drivers.find(d => (d.email || '').toLowerCase() === (currentUser || '').toLowerCase()) : null} />
            ) : null}
          </div>

          {showUploadModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-12">
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setShowUploadModal(false)} />
              <div className="bg-white/90 backdrop-blur-xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto rounded-xl sm:rounded-[2.5rem] p-4 sm:p-10 shadow-2xl relative z-10 border border-white/50 mx-0 sm:mx-4">
                <div className="flex justify-end mb-2">
                  <button onClick={() => setShowUploadModal(false)} className="p-2 bg-slate-100 rounded-lg sm:rounded-[1rem] text-slate-600 active:scale-95 transition-all"><X size={18} /></button>
                </div>
                <Suspense fallback={<LazyFallback />}>
                <FileUploadTrips drivers={drivers} preSelectDriver={uploadAssignDriver} onTripsCreated={(newTrips) => { 
                  const d = new Date();
                  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

                  setTrips(prev => {
                    const combined = [...prev, ...newTrips];
                    const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
                    persistState({ trips: unique });
                    return unique;
                  }); 
                setShowUploadModal(false); 
                setUploadAssignDriver(''); 
                addAuditLog('Trips Uploaded', `${currentUser} (${role}) imported ${newTrips.length} trips via file upload.`, 'blue'); 

                const hasOtherDates = newTrips.some(t => t.date && t.date !== today);
                if (hasOtherDates) {
                  addToast('Trips Uploaded', `${newTrips.length} trips added. Use the Date Filter in the Trips tab to see future manifests.`, 'warning');
                } else {
                  addToast('Trips Uploaded', `${newTrips.length} trips added successfully.`, 'success');
                }
              }} />
                </Suspense>
              </div>
            </div>
          )}
          {renderBulkAssignModal()}
          {renderSmartAssignModal()}
          {renderSecurityAuthModal()}

          {/* Toast Notifications */}
          <div className="fixed bottom-24 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
            {toasts.map(toast => (
              <div key={toast.id} className="pointer-events-auto bg-white/90 backdrop-blur-xl border border-slate-200 rounded-2xl p-4 shadow-2xl flex gap-3 items-start animate-in max-w-sm">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                  {toast.type === 'success' ? <CheckCircle2 size={22} /> : <Zap size={22} />}
                </div>
                <div>
                  <h4 className="font-extrabold text-base text-slate-900">{toast.title}</h4>
                  <p className="text-sm font-medium text-slate-500 mt-0.5">{toast.message}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
    </>
  );
};

export default App;
