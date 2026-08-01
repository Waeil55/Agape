import React, { useState, lazy, Suspense, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  LayoutDashboard, Users, MapPin, Settings, BarChart2,
  Archive, MessageCircle, Bell,
  CheckCircle2, BrainCircuit, Upload, Wand2, Search,
  AlertTriangle, X, Truck, Zap, Clock,
  PanelRight,
  Eye, Hash, Route, Activity,
  CalendarDays, ClipboardList, ShieldCheck, Receipt, Siren, CarFront, Plus,
  RefreshCw,
} from 'lucide-react';
import { auth, EmailAuthProvider, reauthenticateWithCredential } from '../config/firebase';
import { openMapLink } from '../utils/nativeActions';
import { timeToMinutes, isTripLate, tripCalendarDateKey, localCalendarYmd } from '../utils/tripDate';
import { getDriverLiveStatus } from '../constants/statuses';
import { useChat } from '../hooks/useChat';
const ArchivesPage = lazy(() => import('./ArchivesPage'));
const DriversVehiclesPage = lazy(() => import('./DriversVehiclesPage'));
const SettingsPage = lazy(() => import('./SettingsPage'));
const UsersPage = lazy(() => import('./UsersPage'));
const OperationsCommandCenter = lazy(() => import('./OperationsCommandCenter'));
const MobileDispatchView = lazy(() => import('./MobileDispatchView'));
const AdminPage = lazy(() => import('./AdminPage'));
const DriverPage = lazy(() => import('./DriverPage'));
const RoutePlannerPage = lazy(() => import('./RoutePlannerPage'));
const ChatPage = lazy(() => import('./chat/ChatPage').then(m => ({ default: m.ChatPage })));

const RouteSequencerApp = lazy(() => import('./RouteSequencer'));
const LiveMapPage = lazy(() => import('./LiveMapPage'));
const DispatchAssistant = lazy(() => import('./DispatchAssistant'));
const FileUploadTrips = lazy(() => import('./FileUploadTrips'));
const ReportsPage = lazy(() => import('./ReportsPage'));
const WellTransSyncPage = lazy(() => import('../features/welltrans-sync/components/WellTransSyncPage'));

const LazyFallback = () => (
  <div className="flex items-center justify-center h-full">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      <p className="text-xs text-slate-500 font-medium">Loading module...</p>
    </div>
  </div>
);

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err) { console.error('[DesktopDashboard ErrorBoundary]', err); }
  render() {
    if (this.state.hasError) return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-3">
          <AlertTriangle size={20} className="text-red-400" />
        </div>
        <p className="text-sm font-semibold text-slate-700">Something went wrong</p>
        <p className="text-xs text-slate-500 mt-1">Try navigating to a different section.</p>
      </div>
    );
    return this.props.children;
  }
}

const FACILITY_KEYWORDS = ['hospital','center','clinic','academy','school','treatment','health','dental','pharmacy','office','suite','care','medical','therapy','rehab','wellness','surgery','diagnostic','lab','institute', 'skills', 'senior', 'living', 'manor', 'village'];
const isFacility = (name) => { const l = (name||'').toLowerCase().trim(); return l ? FACILITY_KEYWORDS.some(kw => l.includes(kw)) : false; };
const cleanPhoneLocal = (p) => (p || '').replace(/[^0-9]/g, '');
const getClientPhoneGlobal = (trip) => {
  if (trip.patientPhone) return trip.patientPhone;
  const pu = trip.pickupPhone || '', doPh = trip.dropoffPhone || '';
  if (!pu && !doPh) return '';
  const hp = cleanPhoneLocal(trip.hospitalPhone);
  const puClean = cleanPhoneLocal(pu);
  const doClean = cleanPhoneLocal(doPh);
  if (hp && puClean && puClean === hp && doPh && doClean !== hp) return doPh;
  if (hp && doClean && doClean === hp && pu && puClean !== hp) return pu;
  const puFac = isFacility(trip.pickupSiteName||'') || isFacility(trip.pickup||'');
  const doFac = isFacility(trip.dropoffSiteName||'') || isFacility(trip.dropoff||'');
  if (puFac && !doFac) return doPh;
  if (doFac && !puFac) return pu;
  return pu || doPh;
};
const SYNTHETIC_REFERENCE_PATTERNS = [/^BK-\d+-\d+$/i, /^TRP-\d+$/i, /^TRIP-\d{10,}-\d+$/i];

const isSyntheticReference = (value) => {
  const cleanValue = String(value || '').trim();
  if (!cleanValue) return false;
  return SYNTHETIC_REFERENCE_PATTERNS.some((pattern) => pattern.test(cleanValue));
};

const getBookingReference = (trip) => {
  const bookingId = String(trip?.bookingId || '').trim();
  return bookingId && !isSyntheticReference(bookingId) ? bookingId : '';
};

const getClientIdentifier = (trip) => {
  const found = [
    trip?.clientId,
    trip?.memberId,
    trip?.patientId,
    trip?.passengerId,
    trip?.customerId,
    trip?.medicaidId,
    trip?.riderId,
  ].find((value) => String(value || '').trim());
  return String(found || '').trim();
};

const formatPhoneDisplay = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 ${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return '';
};

const openAddressInMaps = (address = '') => {
  if (!address) return;
  const query = encodeURIComponent(address);
  const googleWeb = `https://www.google.com/maps/search/?api=1&query=${query}`;
  const googleIntent = `intent://maps.google.com/maps/search/?api=1&query=${query}#Intent;scheme=https;package=com.google.android.apps.maps;S.browser_fallback_url=${encodeURIComponent(googleWeb)};end;`;
  openMapLink(googleIntent, googleWeb);
};

const findTripLocations = (trip, trips, trashedTrips, logs) => {
  const id = trip?.id || '';
  const bk = trip?.bookingId || '';
  const matchKey = (val) => val === id || val === bk || (bk && val?.includes?.(bk));
  const locations = [];
  if (trips?.some(t => matchKey(t.id) || matchKey(t.bookingId))) locations.push({ panel: 'operations', label: 'Dispatch Board', icon: 'Zap' });
  if (trashedTrips?.some(t => matchKey(t.id) || matchKey(t.bookingId))) locations.push({ panel: 'archives', label: 'Archives', icon: 'Archive' });
  if (logs?.some(l => matchKey(l.meta?.id) || matchKey(l.meta?.bookingId) || String(l.d || '').includes(id) || String(l.d || '').includes(bk))) locations.push({ panel: 'reports', label: 'Activity Logs', icon: 'BarChart2' });
  if (Array.isArray(trip?.routeAssignments) && trip.routeAssignments.length > 0) locations.push({ panel: 'operations', label: 'Route Plans', icon: 'Route' });
  return locations;
};

const DesktopEnterpriseDashboard = ({
  role, currentUser, trips = [], setTrips, drivers = [], setDrivers, upsertDriverProfile, assignVehicleToDriver, dispatchers = [], setDispatchers, vehicles = [], setVehicles,
  trashedTrips = [], setTrashedTrips, restoreTrip, deleteTrashedTrip, logs = [], setLogs, phoneNumbers, setPhoneNumbers, appSettings, updateAppSettings,
  selectedTasks = [], setSelectedTasks, searchQuery, setSearchQuery,
  smartAssignTrip, setSmartAssignTrip, manualAssignTrip, setManualAssignTrip,
  smartAssignResult, setSmartAssignResult, aiAnalyzing, setAiAnalyzing,
  showOptimizeModal, setShowOptimizeModal, showUploadModal, setShowUploadModal,
  uploadAssignDriver, setUploadAssignDriver, bulkAssignModal, setBulkAssignModal,
  showDispatcherArchive, setShowDispatcherArchive,
  addToast, addAuditLog, persistState, hasPermission, requestAuthAction,
  triggerSmartAssign, triggerFleetOptimization, assignTripToDriver,
  bulkAssignTrips, createSharedRide, createLegMission, requestDeleteTrip, requestBulkDelete, updateTrip, updateTrashedTrip,
  makeCall, sendSMS, handleUpdateDriverLocation, addTrip, showAddTripModal, setShowAddTripModal,
  driverTelemetry = [],
  onDispatcherStatusUpdate, driverWorkDrivers = [], driverWorkTrips = [], allDrivers = [],
  onUpdateMission, onUpdateDriverTrip, onDriverStatusUpdate, onCompleteTrip, onLogout
}) => {
  const { unreadCount } = useChat({ alerts: true });
  const displayLoginId = String(currentUser || '').replace(/@auth\.agapecare\.local$/i, '');
  const VALID_PANELS = ['operations', 'liveMap', 'archives', 'reports', 'admin', 'settings', 'drive', 'routePlanner', 'dispatch', 'chat'];
  const [activePanel, setActivePanel] = useState(() => {
    const saved = localStorage.getItem('agape_activePanel');
    return saved && VALID_PANELS.includes(saved) ? saved : 'operations';
  });
  const [operationsTab, setOperationsTab] = useState(() => localStorage.getItem('agape_operationsTab') || 'manifest');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authActionPayload, setAuthActionPayload] = useState(null);
  const [authPassword, setAuthPassword] = useState('');
  const [reAuthError, setReAuthError] = useState('');
  const optimizeTimerRef = useRef(null);
  const [tripDetails, setTripDetails] = useState(null);
  const [showTripLocations, setShowTripLocations] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [rightPanelTab, setRightPanelTab] = useState(() => {
    const t = localStorage.getItem('agape_rightPanelTab');
    return t === 'alerts' || t === 'details' || t === 'ai' ? t : 'alerts';
  });
  const [showSequencerModal, setShowSequencerModal] = useState(false);
  const [routePlannerSequencerStops, setRoutePlannerSequencerStops] = useState(null);
  const [routePlannerSequencerSequence, setRoutePlannerSequencerSequence] = useState(null);
  const [routePlannerSequencerKey, setRoutePlannerSequencerKey] = useState(0);
  const [driverWorkDriverId, setDriverWorkDriverId] = useState(() => localStorage.getItem('agape_driverWorkDriverId') || '');
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  // Persist navigation state to localStorage (survives refresh)
  useEffect(() => { localStorage.setItem('agape_activePanel', activePanel); }, [activePanel]);
  useEffect(() => { localStorage.setItem('agape_operationsTab', operationsTab); }, [operationsTab]);
  useEffect(() => { if (rightPanelTab) localStorage.setItem('agape_rightPanelTab', rightPanelTab); else localStorage.removeItem('agape_rightPanelTab'); }, [rightPanelTab]);
  useEffect(() => {
    if (driverWorkDriverId) localStorage.setItem('agape_driverWorkDriverId', driverWorkDriverId);
    else localStorage.removeItem('agape_driverWorkDriverId');
  }, [driverWorkDriverId]);
  useEffect(() => {
    if (showRightPanel && (rightPanelTab === null || rightPanelTab === undefined)) {
      setRightPanelTab('alerts');
    }
  }, [showRightPanel, rightPanelTab]);
  useEffect(() => {
    if (tripDetails && showRightPanel) {
      setRightPanelTab('details');
    }
  }, [tripDetails, showRightPanel]);
  useEffect(() => {
    if (activePanel === 'drive' && driverWorkDrivers.length === 0) {
      setActivePanel('operations');
    }
  }, [activePanel, driverWorkDrivers.length]);

  const activeDriverWorkDriver = useMemo(() => {
    if (driverWorkDrivers.length === 0) return null;
    return driverWorkDrivers.find((driver) => driver.id === driverWorkDriverId) || driverWorkDrivers[0];
  }, [driverWorkDriverId, driverWorkDrivers]);

  useEffect(() => {
    if (!activeDriverWorkDriver?.id) return;
    if (driverWorkDriverId !== activeDriverWorkDriver.id) {
      setDriverWorkDriverId(activeDriverWorkDriver.id);
    }
  }, [activeDriverWorkDriver?.id, driverWorkDriverId]);

  const activeDriverWorkTrips = useMemo(() => {
    if (!activeDriverWorkDriver) return [];
    const driverEmail = String(activeDriverWorkDriver.email || '').trim().toLowerCase();
    return driverWorkTrips.filter((trip) => {
      const tripDriverEmail = String(
        trip.driverEmail ||
        allDrivers.find((driver) => driver.id === trip.driverId)?.email ||
        ''
      ).trim().toLowerCase();
      return trip.driverId === activeDriverWorkDriver.id ||
        (driverEmail && tripDriverEmail === driverEmail) ||
        (activeDriverWorkDriver.name && trip.driverName === activeDriverWorkDriver.name);
    });
  }, [activeDriverWorkDriver, allDrivers, driverWorkTrips]);

  // Mobile breakpoint listener (< 768px = mobile dispatch view)
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSmartNavigate = useCallback((query) => {
    setActivePanel('operations');
    setOperationsTab('manifest');
    setSearchQuery(query);
    if (addToast) {
      addToast('Smart Navigation', `Searching operations for "${query}"`, 'success');
    }
  }, [addToast, setSearchQuery]);

  const openRightPanel = useCallback((preferredTab = null) => {
    setRightPanelTab(preferredTab || (tripDetails ? 'details' : 'alerts'));
    setShowRightPanel(true);
  }, [tripDetails]);

  const toggleRightPanel = useCallback(() => {
    if (showRightPanel) {
      setShowRightPanel(false);
      return;
    }
    openRightPanel();
  }, [openRightPanel, showRightPanel]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const todayStr = localCalendarYmd();



  const sidebarItems = [
    { id: 'operations', label: 'Dispatch', icon: LayoutDashboard, roles: ['admin', 'dispatcher'] },
    { id: 'drive', label: 'Drive', icon: Truck, roles: ['admin', 'dispatcher'] },
    { id: 'liveMap', label: 'Map', icon: MapPin, roles: ['admin', 'dispatcher', 'fleet_manager', 'qa_auditor', 'supervisor'] },
    { id: 'archives', label: 'Archives', icon: Archive, roles: ['admin', 'dispatcher', 'fleet_manager', 'qa_auditor', 'supervisor'] },
    { id: 'reports', label: 'Reports', icon: BarChart2, roles: ['admin', 'dispatcher', 'billing', 'qa_auditor', 'fleet_manager', 'supervisor'] },
    { id: 'admin', label: role === 'admin' ? 'Admin' : 'Fleet', icon: Users, roles: ['admin', 'dispatcher'] },
    { id: 'welltrans', label: 'WellTrans Sync', icon: RefreshCw, roles: ['admin'] },
    { id: 'settings', label: 'Settings', icon: Settings, roles: ['admin', 'dispatcher'] },
  ].filter(item => item.roles.includes(role))
    .filter(item => item.id !== 'drive' || driverWorkDrivers.length > 0);

  const todayTrips = trips.filter(t => tripCalendarDateKey(t.date) === todayStr);
  const activeTrips = todayTrips.filter(t => !['Completed', 'Cancelled', 'No Show'].includes(t.status));
  const unassignedTrips = activeTrips.filter(t => t.status === 'Unassigned');
  const assignedTrips = activeTrips.filter(t => t.status === 'Assigned');
  const inProgressTrips = activeTrips.filter(t => ['In Mission', 'En Route', 'At Pickup', 'At Dropoff', 'Assigned', 'In Progress', 'Navigating Pickup', 'Navigating Dropoff', 'In Transit', 'Arrived'].includes(t.status));
  const completedToday = todayTrips.filter(t => t.status === 'Completed').length;
  const availableDrivers = drivers.filter(d => d.status === 'Available').length;
  const lateTrips = activeTrips.filter(t => isTripLate(t.time || ''));
  const dispatcherOnlineCount = dispatchers.filter((dispatcher) => dispatcher.clockedIn).length;
  const activeDriverCount = drivers.filter((driver) => driver.status && !['Offline', 'Unavailable'].includes(driver.status)).length;
  const aiAlertCount = lateTrips.length + unassignedTrips.length;

  const sortedScheduled = [...activeTrips]
    .filter(t => t.time !== 'Will Call')
    .sort((a, b) => {
      if (a.status === 'Unassigned' && b.status !== 'Unassigned') return 1;
      if (a.status !== 'Unassigned' && b.status === 'Unassigned') return -1;
      return timeToMinutes(a.time) - timeToMinutes(b.time);
    });

  const willCallTrips = activeTrips.filter(t => t.time === 'Will Call');

  const searchedTrips = searchQuery
    ? sortedScheduled.filter(t =>
        (t.patient || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.bookingId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.pickup || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.dropoff || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sortedScheduled;

  const workspaceMeta = {
    operations: {
      eyebrow: '',
      title: 'Dispatch Board',
      description: 'Manage trips, drivers, routes, and live dispatch from one place.',
    },
    drive: {
      eyebrow: '',
      title: 'Driver Workstation',
      description: 'Mission execution, guided trips, navigation, and mobile-first operational controls.',
    },
    liveMap: {
      eyebrow: '',
      title: 'Live Map Intelligence',
      description: 'Realtime fleet movement, dwell time, driver status, next destinations, and geographic risk visibility.',
    },
    routePlanner: {
      eyebrow: '',
      title: 'Tools',
      description: 'Route planning, multi-stop optimization, drag-and-drop planning, and live navigation.',
    },
    reports: {
      eyebrow: '',
      title: 'Enterprise Reports',
      description: 'Trip performance, utilization, compliance, and daily financial-operational visibility.',
    },
    archives: {
      eyebrow: '',
      title: 'Archives & Recovery',
      description: 'Recovered trips, historical records, and audit-backed operational history.',
    },
    admin: {
      eyebrow: '',
      title: 'People, Fleet, and Access Control',
      description: 'Manage dispatchers, drivers, vehicles, permissions, and cross-functional operational structure.',
    },
    settings: {
      eyebrow: '',
      title: 'Platform Settings',
      description: 'Communication channels, workflow preferences, security controls, and application behavior.',
    },
  };

  const activeWorkspaceMeta = workspaceMeta[activePanel] || workspaceMeta.operations;

  const openOperationsWorkspace = useCallback((tab = 'manifest') => {
    setActivePanel('operations');
    setOperationsTab(tab);
  }, []);

  const topNavItems = useMemo(() => {
    const items = [
      { id: 'dispatch', label: 'Dispatch', icon: Zap, active: activePanel === 'operations', action: () => openOperationsWorkspace('manifest') },
      { id: 'schedule', label: 'Tools', icon: Route, active: activePanel === 'routePlanner' || showSequencerModal, action: () => setActivePanel('routePlanner') },
      ...(driverWorkDrivers.length > 0 ? [{ id: 'drive', label: 'Drive', icon: Truck, active: activePanel === 'drive', action: () => setActivePanel('drive') }] : []),
      ...((role === 'admin' || role === 'dispatcher') ? [{ id: 'admin', label: role === 'admin' ? 'Admin' : 'Fleet', icon: Users, active: activePanel === 'admin', action: () => setActivePanel('admin') }] : []),
      ...(role === 'admin' ? [{ id: 'welltrans', label: 'WellTrans', icon: RefreshCw, active: activePanel === 'welltrans', action: () => setActivePanel('welltrans') }] : []),
      { id: 'reports', label: 'Reports', icon: BarChart2, active: activePanel === 'reports', action: () => setActivePanel('reports') },
      { id: 'map', label: 'Map', icon: MapPin, active: activePanel === 'liveMap', action: () => setActivePanel('liveMap') },
      { id: 'chat', label: unreadCount ? `Chat (${unreadCount > 99 ? '99+' : unreadCount})` : 'Chat', icon: MessageCircle, active: activePanel === 'chat', action: () => setActivePanel('chat'), badge: unreadCount },
      { id: 'settings', label: 'Settings', icon: Settings, active: activePanel === 'settings', action: () => setActivePanel('settings') },
    ];
    return items;
  }, [activePanel, driverWorkDrivers.length, openOperationsWorkspace, role, setActivePanel, showSequencerModal, unreadCount]);

  const topActionItems = useMemo(() => {
    switch (activePanel) {
      case 'operations':
        return [];
      case 'reports':
        return [
          { id: 'upload', label: 'Upload', icon: Upload, action: () => setShowUploadModal(true) },
          { id: 'dispatch', label: 'Dispatch', icon: Zap, action: () => openOperationsWorkspace('manifest') },
        ];
      case 'liveMap':
        return [
          { id: 'dispatch', label: 'Dispatch', icon: Zap, action: () => openOperationsWorkspace('manifest') },
          { id: 'routes', label: 'Tools', icon: Route, action: () => setActivePanel('routePlanner') },
        ];
      case 'archives':
        return [
          { id: 'reports', label: 'Reports', icon: BarChart2, action: () => setActivePanel('reports') },
        ];
      case 'admin':
        return [
          { id: 'upload', label: 'Upload', icon: Upload, action: () => setShowUploadModal(true) },
          { id: 'reports', label: 'Reports', icon: BarChart2, action: () => setActivePanel('reports') },
        ];
      case 'settings':
        return [
          { id: 'dispatch', label: 'Dispatch', icon: Zap, action: () => openOperationsWorkspace('manifest') },
        ];
      default:
        return [];
    }
  }, [activePanel, openOperationsWorkspace, setShowUploadModal, setShowSequencerModal, setActivePanel]);

  // Command palette commands
  const commands = useMemo(() => [
    { id: 'ops', label: 'Go to Operations', icon: LayoutDashboard, action: () => setActivePanel('operations') },
    { id: 'map', label: 'Go to Live Map', icon: MapPin, action: () => setActivePanel('liveMap') },
    { id: 'sequencer', label: 'Open Tools', icon: Route, action: () => setActivePanel('routePlanner') },
    { id: 'routes', label: 'Go to Route Plan', icon: Route, action: () => setActivePanel('routePlanner') },
    { id: 'reports', label: 'Go to Reports', icon: BarChart2, action: () => setActivePanel('reports') },
    { id: 'archives', label: 'Go to Archives', icon: Archive, action: () => setActivePanel('archives') },
    { id: 'admin', label: 'Go to Admin', icon: Users, action: () => setActivePanel('admin') },
    { id: 'settings', label: 'Go to Settings', icon: Settings, action: () => setActivePanel('settings') },
    { id: 'optimize', label: 'Run Fleet Optimization', icon: Wand2, action: () => setShowOptimizeModal(true) },
    { id: 'upload', label: 'Upload Trips', icon: Upload, action: () => setShowUploadModal(true) },
    { id: 'toggle-right', label: 'Toggle Right Panel', icon: PanelRight, action: toggleRightPanel },
  ].filter(cmd => {
    if (cmd.id === 'admin' && role !== 'admin') return false;
    return true;
  }), [role, toggleRightPanel]);

  const filteredCommands = useMemo(() => commandQuery
    ? commands.filter(c => c.label.toLowerCase().includes(commandQuery.toLowerCase()))
    : commands, [commands, commandQuery]);

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
    } catch (err) { console.error('[AuthAction]', err); setReAuthError('Invalid password. Action denied.'); }
  };

  const renderEnterpriseTopBar = () => (
    <header className="sticky top-0 z-30 hidden h-20 items-center gap-4 border-b border-slate-200/40 bg-white px-6 backdrop-blur-[12px] md:flex shadow-sm">
      <div className="flex min-w-[200px] items-center gap-3 shrink-0">
        <div className="flex h-11 w-11 items-center justify-center rounded-[1.2rem] border border-slate-200 bg-white shadow-sm p-2">
          <img src="/agape.png" alt="Agape Care" className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-black text-slate-900 leading-none">Agape Care</p>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 mt-1">Enterprise Fleet OS</p>
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-x-auto no-scrollbar flex justify-center">
        <div className="flex min-w-max items-center gap-0.5 rounded-full bg-[#e8eff6] p-1 border border-slate-200/20">
          {topNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.action}
                aria-label={item.label}
                className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                  item.active
                    ? 'bg-slate-900 text-white shadow-md shadow-slate-900/10'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
                title={item.label}
              >
                <span className="relative inline-flex">
                  <Icon size={13} />
                  {item.badge > 0 && <span className="absolute -right-2 -top-2 min-w-[16px] h-[16px] px-1 rounded-full bg-blue-600 text-white text-[9px] font-black leading-[16px] text-center">{item.badge > 99 ? '99+' : item.badge}</span>}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-3">

        {activePanel === 'operations' && (
          <div className="flex items-center gap-2">
            {selectedTasks.length > 0 && (
              <button
                onClick={() => setBulkAssignModal(true)}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-bold transition flex items-center gap-1 shadow-sm animate-in fade-in slide-in-from-top-1"
              >
                <Users size={16} /> Assign {selectedTasks.length}
              </button>
            )}
            <button
              onClick={toggleRightPanel}
              title={showRightPanel ? 'Close command panel' : 'Open command panel'}
              className={`p-2 rounded-full transition flex items-center justify-center text-xs font-bold shadow-sm border ${
                showRightPanel
                  ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-200/40 text-slate-600'
              }`}
            >
              <PanelRight size={14} />
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            if (showRightPanel && rightPanelTab === 'alerts') {
              setShowRightPanel(false);
            } else {
              setActivePanel('operations');
              openRightPanel('alerts');
            }
          }}
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-700 shadow-sm"
          title="Notifications"
        >
          <Bell size={16} />
          {aiAlertCount > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-rose-500" />}
        </button>

        <button
          onClick={() => setActivePanel('settings')}
          title={displayLoginId}
          className="flex h-10 min-w-[108px] items-center gap-2 rounded-full border border-slate-200 bg-white px-2 text-left shadow-sm transition hover:bg-slate-50"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold uppercase text-white shadow-sm shrink-0">
            {(currentUser || 'U')[0]}
          </div>
          <div className="min-w-0 pr-1.5">
            <p className="truncate text-xs font-semibold text-slate-900 leading-none">{displayLoginId || 'Account'}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mt-1">{role}</p>
          </div>
        </button>
      </div>
    </header>
  );

  // ==================== MOBILE TOP BAR (shown on mobile where bottom nav is present) ====================
  const renderMobileTopBar = () => (
    <header className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 text-white px-3 flex md:hidden items-center gap-2 shrink-0 h-[60px] z-20 relative shadow-md" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm shadow-inner">
        <img src="/agape.png" alt="Agape Care" className="w-7 h-7 object-contain brightness-0 invert" />
      </div>
      <div>
        <h1 className="text-[13px] font-semibold tracking-tight leading-none text-white drop-shadow-sm">Agape Care</h1>
        <p className="text-xs font-medium text-blue-200 capitalize drop-shadow-sm">{activeWorkspaceMeta.title}</p>
      </div>
      <div className="flex-1" />
      {activePanel === 'operations' && (
        <button
          onClick={toggleRightPanel}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold shadow-sm transition-colors ${
            showRightPanel ? 'bg-white text-blue-600' : 'bg-white/10 text-white hover:bg-white/20'
          }`}
        >
          <PanelRight size={16} /> Panel
        </button>
      )}
      {/* User avatar -> settings */}
      <button
        onClick={() => setActivePanel('settings')}
        className="w-9 h-9 rounded-full bg-white/20 border border-white/20 shadow-sm flex items-center justify-center text-white text-xs font-bold hover:bg-white/30 transition uppercase"
      >
        {(currentUser || 'U')[0]}
      </button>
    </header>
  );

  // ==================== BOTTOM NAVIGATION (Mobile only for dispatcher/admin) ====================
  const renderBottomNav = () => (
    <nav className="bottom-nav md:hidden">
      <div className="flex h-full items-center justify-around gap-1">
        {sidebarItems.map(item => {
          const Icon = item.icon;
          const isActive = activePanel === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActivePanel(item.id)}
              className={`flex-1 flex flex-col items-center justify-center rounded-full px-1 py-1.5 transition-all relative touch-manipulation min-h-[56px] ${
                isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <Icon size={22} strokeWidth={isActive ? 2 : 1.5} className="relative" />
              </div>
              <span className={`text-[10px] font-medium leading-none mt-1 truncate max-w-full px-0.5 ${
                isActive ? 'text-blue-600' : 'text-slate-400'
              }`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );



  // ==================== RIGHT PANEL ====================
  const renderRightPanel = () => (
    <div className="w-[320px] lg:w-[340px] min-w-[280px] bg-white border-l border-slate-200 flex flex-col shrink-0 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-slate-100">
        {[
          { id: 'fleet', label: 'Fleet', icon: Activity },
          { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
          { id: 'details', label: 'Details', icon: Eye },
          { id: 'ai', label: 'AI', icon: BrainCircuit },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setRightPanelTab(tab.id)}
            className={`relative flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-medium transition-all duration-200 ${
              rightPanelTab === tab.id
                ? 'text-blue-700'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
            {rightPanelTab === tab.id && (
              <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-blue-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {rightPanelTab === 'fleet' && (() => {
          const totalTrips = todayTrips.length;
          const completed = todayTrips.filter(t => t.status === 'Completed').length;
          const inProgress = todayTrips.filter(t => ['In Progress', 'In Transit', 'At Pickup', 'At Dropoff', 'Navigating Pickup', 'Navigating Dropoff'].includes(t.status)).length;
          const unassigned = todayTrips.filter(t => !t.driverId || t.status === 'Unassigned').length;
          const late = todayTrips.filter(t => {
            if (!t.time || t.time === 'Will Call' || ['Completed', 'Cancelled', 'No Show'].includes(t.status)) return false;
            const now = new Date();
            const mins = t.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
            if (!mins) return false;
            let h = parseInt(mins[1]), m = parseInt(mins[2]);
            if (mins[3]?.toUpperCase() === 'PM' && h < 12) h += 12;
            if (mins[3]?.toUpperCase() === 'AM' && h === 12) h = 0;
            return now > new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
          }).length;
          const availableDrivers = drivers.filter(d => d.status !== 'Unavailable').length;
          const busyDrivers = drivers.filter(d => {
            return todayTrips.some(t => t.driverId === d.id && ['In Progress', 'In Transit', 'At Pickup', 'At Dropoff'].includes(t.status));
          }).length;

          return (
            <div className="space-y-3">
              {/* KPI Cards */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Total', value: totalTrips, color: 'text-slate-900', bg: 'bg-slate-50' },
                  { label: 'Active', value: inProgress, color: 'text-blue-600', bg: 'bg-blue-50' },
                  { label: 'Late', value: late, color: 'text-rose-600', bg: 'bg-rose-50' },
                  { label: 'Done', value: completed, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                ].map(kpi => (
                  <div key={kpi.label} className={`rounded-xl ${kpi.bg} p-3 border border-slate-100`}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{kpi.label}</p>
                    <p className={`text-xl font-black ${kpi.color} mt-0.5`}>{kpi.value}</p>
                  </div>
                ))}
              </div>

              {/* Driver Fleet */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Drivers</span>
                  <span className="text-[10px] text-slate-500">{availableDrivers} available</span>
                </div>
                <div className="divide-y divide-slate-100 max-h-[240px] overflow-y-auto">
                  {drivers.slice(0, 12).map(driver => {
                    const driverTrip = todayTrips.find(t => t.driverId === driver.id && ['In Progress', 'In Transit', 'At Pickup', 'At Dropoff'].includes(t.status));
                    const driverCompleted = todayTrips.filter(t => t.driverId === driver.id && t.status === 'Completed').length;
                    const isBusy = Boolean(driverTrip);
                    return (
                      <div key={driver.id} className="px-3 py-2 flex items-center gap-2.5 hover:bg-slate-50 transition-colors">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${isBusy ? 'bg-blue-500' : 'bg-emerald-400'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-900 truncate">{driver.name}</p>
                          <p className="text-[10px] text-slate-500 truncate">{isBusy ? driverTrip.patient || 'On trip' : driver.vehicle || 'Available'}</p>
                        </div>
                        {driverCompleted > 0 && (
                          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{driverCompleted} done</span>
                        )}
                      </div>
                    );
                  })}
                  {drivers.length > 12 && (
                    <div className="px-3 py-2 text-center text-[10px] text-slate-400">+{drivers.length - 12} more</div>
                  )}
                </div>
              </div>

              {/* Unassigned Alerts */}
              {unassigned > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                    <p className="text-xs font-semibold text-amber-800">{unassigned} unassigned trip{unassigned !== 1 ? 's' : ''}</p>
                  </div>
                  <p className="text-[10px] text-amber-700 mt-1">Needs dispatcher attention</p>
                </div>
              )}

              {/* Late Alerts */}
              {late > 0 && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-rose-600 shrink-0" />
                    <p className="text-xs font-semibold text-rose-800">{late} late trip{late !== 1 ? 's' : ''}</p>
                  </div>
                  <p className="text-[10px] text-rose-700 mt-1">Past scheduled time</p>
                </div>
              )}
            </div>
          );
        })()}
        {rightPanelTab === 'alerts' && (
          <div className="space-y-3">
            {logs.slice(0, 20).map((log, i) => (
              <div key={log.timestamp || log.id || `log-${i}`} className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-sm mb-1.5 hover:shadow-md transition-all duration-200 group">
                <div className="flex items-start gap-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ring-1 ring-slate-200 ${
                    log.c === 'rose' ? 'bg-rose-500 ring-rose-500/20' :
                    log.c === 'amber' ? 'bg-amber-500 ring-amber-500/20' :
                    log.c === 'emerald' ? 'bg-emerald-500 ring-emerald-500/20' :
                    log.c === 'blue' ? 'bg-blue-500 ring-blue-500/20' :
                    'bg-slate-500 ring-slate-500/20'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700">{log.t}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{log.d}</p>
                    {log.timestamp && <p className="text-xs text-slate-600 mt-1">{log.timestamp}</p>}
                  </div>
                </div>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-slate-600">
                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                  <Bell size={18} className="opacity-40" />
                </div>
                <p className="text-xs font-medium">No alerts</p>
                <p className="text-xs text-slate-600 mt-1">All clear — no issues detected</p>
              </div>
            )}
          </div>
        )}

        {rightPanelTab === 'details' && (
          <div className="p-2">
            {tripDetails ? (
              <div className="space-y-2">
                <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Patient</p>
                  <p className="text-sm font-semibold text-slate-900">{tripDetails.patient}</p>
                  {getBookingReference(tripDetails) && <p className="text-xs text-slate-500 mt-0.5">Booking ID: {getBookingReference(tripDetails)}</p>}
                  {getClientIdentifier(tripDetails) && <p className="text-xs text-slate-500 mt-0.5">Client ID: {getClientIdentifier(tripDetails)}</p>}
                  {(tripDetails.type || tripDetails.serviceType) && <p className="text-xs text-slate-500 mt-0.5">Service: {tripDetails.type || tripDetails.serviceType}</p>}
                  {formatPhoneDisplay(getClientPhoneGlobal(tripDetails)) && <p className="text-xs text-emerald-700 mt-1">Client phone: {formatPhoneDisplay(getClientPhoneGlobal(tripDetails))}</p>}
                  {formatPhoneDisplay(tripDetails.pickupPhone) && formatPhoneDisplay(tripDetails.pickupPhone) !== formatPhoneDisplay(getClientPhoneGlobal(tripDetails)) && <p className="text-xs text-emerald-700">Pickup phone: {formatPhoneDisplay(tripDetails.pickupPhone)}</p>}
                  {formatPhoneDisplay(tripDetails.hospitalPhone || tripDetails.dropoffPhone) && formatPhoneDisplay(tripDetails.hospitalPhone || tripDetails.dropoffPhone) !== formatPhoneDisplay(getClientPhoneGlobal(tripDetails)) && <p className="text-xs text-rose-700 mt-1">Hospital phone: {formatPhoneDisplay(tripDetails.hospitalPhone || tripDetails.dropoffPhone)}</p>}
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Status</p>
                  <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold ${
                    tripDetails.status === 'Unassigned' ? 'bg-rose-100 text-rose-700' :
                    tripDetails.status === 'Assigned' ? 'bg-blue-100 text-blue-700' :
                    tripDetails.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-slate-100 text-slate-700'
                  }`}>{tripDetails.status}</span>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Time</p>
                  <p className="text-sm font-semibold text-slate-900">{tripDetails.time || '—'}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Route</p>
                  <div className="space-y-1.5">
                    <div className="flex items-start gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0 ring-1 ring-emerald-500/20" />
                      <div>
                        <p className="text-xs text-slate-700">{tripDetails.pickup || '—'}</p>
                        {tripDetails.pickupSiteName && <p className="text-xs text-emerald-700 mt-0.5">{tripDetails.pickupSiteName}</p>}
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0 ring-1 ring-rose-500/20" />
                      <div>
                        <p className="text-xs text-slate-700">{tripDetails.dropoff || '—'}</p>
                        {tripDetails.dropoffSiteName && <p className="text-xs text-rose-700 mt-0.5">{tripDetails.dropoffSiteName}</p>}
                      </div>
                    </div>
                  </div>
                </div>
                {tripDetails.routeAssignments?.length > 0 && (
                  <div className="bg-white rounded-xl border border-indigo-100 p-2.5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-indigo-500 mb-1">Route Plans</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tripDetails.routeAssignments.map((route, index) => (
                        <span key={`${route.templateId || route.routeName}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 border border-indigo-100">
                          {route.routeName}{route.time ? ` @ ${route.time}` : ''}{route.statusLabel ? ` • ${route.statusLabel}` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {(tripDetails.driverName || tripDetails.driverId) && (
                  <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Driver</p>
                    <p className="text-sm font-medium text-slate-900">{drivers.find(d => d.id === tripDetails.driverId)?.name || tripDetails.driverName || '—'}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{drivers.find(d => d.id === tripDetails.driverId)?.vehicle || ''}</p>
                  </div>
                )}
                {tripDetails.notes && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Notes</p>
                    <p className="text-xs text-amber-800 mt-0.5">{tripDetails.notes}</p>
                  </div>
                )}
                <button
                  onClick={() => setShowTripLocations(prev => !prev)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                >
                  <Search size={16} /> Find This Trip
                </button>
                {showTripLocations && (() => {
                  const locs = findTripLocations(tripDetails, trips, trashedTrips, logs);
                  return locs.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Found in</p>
                      {locs.map((loc, i) => (
                        <button
                          key={i}
                          onClick={() => { setActivePanel(loc.panel); setTripDetails(null); setShowRightPanel(false); setShowTripLocations(false); }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 transition-colors text-left"
                        >
                          {loc.icon === 'Zap' && <Zap size={16} className="text-indigo-600" />}
                          {loc.icon === 'Archive' && <Archive size={16} className="text-indigo-600" />}
                          {loc.icon === 'BarChart2' && <BarChart2 size={16} className="text-indigo-600" />}
                          {loc.icon === 'Route' && <Route size={16} className="text-indigo-600" />}
                          <span className="text-xs font-semibold text-indigo-700">{loc.label}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 text-center py-1.5">No other references found.</p>
                  );
                })()}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <Eye size={15} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-900">Select a Trip</p>
                      <p className="text-xs text-slate-600">Click any trip card to load the full client details here.</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Live Summary</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Today</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{todayTrips.length}</p>
                    </div>
                    <div className="rounded-lg bg-rose-50 px-2.5 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">Unassigned</p>
                      <p className="mt-1 text-sm font-semibold text-rose-700">{unassignedTrips.length}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 px-2.5 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Late</p>
                      <p className="mt-1 text-sm font-semibold text-amber-700">{lateTrips.length}</p>
                    </div>
                    <div className="rounded-lg bg-blue-50 px-2.5 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Will Call</p>
                      <p className="mt-1 text-sm font-semibold text-blue-700">{willCallTrips.length}</p>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRightPanelTab('ai')}
                  className="w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  Open AI Dispatch Guidance
                </button>
              </div>
            )}
          </div>
        )}

        {rightPanelTab === 'ai' && (
          <div className="p-2">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl mb-2">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-md bg-indigo-100 flex items-center justify-center">
                  <BrainCircuit size={13} className="text-indigo-700" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-indigo-700">AI Dispatch</p>
                  <p className="text-xs text-indigo-500/60">Powered by smart routing</p>
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {unassignedTrips.length > 0
                  ? `${unassignedTrips.length} trip${unassignedTrips.length > 1 ? 's' : ''} waiting for assignment. Run optimization to auto-assign.`
                  : 'All trips are assigned. System running optimally.'}
              </p>
              {unassignedTrips.length > 0 && (
                <button
                  onClick={() => setShowOptimizeModal(true)}
                  className="mt-2.5 w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all duration-200 flex items-center justify-center gap-1.5"
                >
                  <Wand2 size={16} /> Run Optimization
                </button>
              )}
            </div>

            {/* Quick stats */}
            <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2.5">Fleet Insights</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Completion</span>
                  <span className="text-emerald-700 font-medium tabular-nums">{todayTrips.length > 0 ? Math.round((completedToday / todayTrips.length) * 100) : 0}%</span>
                </div>
                <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${todayTrips.length > 0 ? Math.round((completedToday / todayTrips.length) * 100) : 0}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">On-time rate</span>
                  <span className="text-blue-700 font-medium tabular-nums">{activeTrips.length > 0 ? Math.round(((activeTrips.length - lateTrips.length) / activeTrips.length) * 100) : 100}%</span>
                </div>
                <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${activeTrips.length > 0 ? Math.round(((activeTrips.length - lateTrips.length) / activeTrips.length) * 100) : 100}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Utilization</span>
                  <span className="text-amber-700 font-medium tabular-nums">{drivers.length > 0 ? Math.round(((drivers.length - availableDrivers) / drivers.length) * 100) : 0}%</span>
                </div>
                <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${drivers.length > 0 ? Math.round(((drivers.length - availableDrivers) / drivers.length) * 100) : 0}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ==================== COMMAND PALETTE ====================
  const renderCommandPalette = () => {
    if (!commandPaletteOpen) return null;
    return (
      <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[20vh]" onClick={() => setCommandPaletteOpen(false)}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
        <div role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-lg bg-white backdrop-blur-xl border border-slate-200 rounded-3xl shadow-sm overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
            <Search size={16} className="text-slate-500" />
            <input
              type="text"
              placeholder="Type a command or search..."
              value={commandQuery}
              onChange={e => setCommandQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-slate-900 placeholder-slate-400 outline-none"
              autoFocus
            />
            <div className="flex items-center gap-1.5">
              <kbd className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-500">⌘K</kbd>
              <kbd className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-500">ESC</kbd>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5">
            {filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.id}
                onClick={() => { cmd.action(); setCommandPaletteOpen(false); setCommandQuery(''); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-left transition-all duration-150 group"
              >
                <div className="w-7 h-7 rounded-md bg-slate-50 flex items-center justify-center group-hover:bg-slate-100 transition-colors">
                  <cmd.icon size={13} className="text-slate-600" />
                </div>
                <span className="text-sm text-slate-700 flex-1">{cmd.label}</span>
                <span className="text-xs text-slate-600 font-mono">⌘{idx + 1}</span>
              </button>
            ))}
            {filteredCommands.length === 0 && (
              <div className="px-4 py-6 text-center">
                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-2">
                  <Search size={14} className="text-slate-600" />
                </div>
                <p className="text-xs text-slate-600">No commands found</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ==================== OPERATIONS PAGE ====================
  const renderOperationsPage = () => {
    // On mobile screens (< 768px): show the premium mobile dispatch view
    if (isMobile) {
      return (
        <ErrorBoundary><Suspense fallback={<LazyFallback />}>
        <MobileDispatchView
          role={role}
          currentUser={currentUser}
          trips={trips}
          drivers={drivers}
          dispatchers={dispatchers}
          assignTripToDriver={assignTripToDriver}
          bulkAssignTrips={bulkAssignTrips}
          setBulkAssignModal={setBulkAssignModal}
          requestDeleteTrip={requestDeleteTrip}
          updateTrip={updateTrip}
          makeCall={makeCall}
          sendSMS={sendSMS}
          setTripDetails={setTripDetails}
          setShowAddTripModal={setShowAddTripModal}
          setShowUploadModal={setShowUploadModal}
          onOpenSequencer={() => setShowSequencerModal(true)}
          onOpenLiveMap={() => setActivePanel('liveMap')}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          addToast={addToast}
          phoneNumbers={phoneNumbers}
          onDispatcherStatusUpdate={onDispatcherStatusUpdate}
        />
        </Suspense></ErrorBoundary>
      );
    }
    // On desktop: unchanged OperationsCommandCenter
    return (
      <ErrorBoundary><Suspense fallback={<LazyFallback />}>
      <OperationsCommandCenter
        role={role}
        currentUser={currentUser}
        trips={trips}
        drivers={drivers}
        dispatchers={dispatchers}
        logs={logs}
        selectedTasks={selectedTasks}
        setSelectedTasks={setSelectedTasks}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        operationsTab={operationsTab}
        setOperationsTab={setOperationsTab}
        smartAssignTrip={smartAssignTrip}
        setSmartAssignTrip={setSmartAssignTrip}
        manualAssignTrip={manualAssignTrip}
        setManualAssignTrip={setManualAssignTrip}
        smartAssignResult={smartAssignResult}
        setSmartAssignResult={setSmartAssignResult}
        aiAnalyzing={aiAnalyzing}
        setAiAnalyzing={setAiAnalyzing}
        addToast={addToast}
        addAuditLog={addAuditLog}
        persistState={persistState}
        hasPermission={hasPermission}
        requestAuthAction={requestAuthAction}
        triggerSmartAssign={triggerSmartAssign}
        triggerFleetOptimization={triggerFleetOptimization}
        assignTripToDriver={assignTripToDriver}
        bulkAssignTrips={bulkAssignTrips}
        setBulkAssignModal={setBulkAssignModal}
        requestDeleteTrip={requestDeleteTrip}
        requestBulkDelete={requestBulkDelete}
        updateTrip={updateTrip}
        makeCall={makeCall}
        sendSMS={sendSMS}
        setTripDetails={setTripDetails}
        setShowAddTripModal={setShowAddTripModal}
        setShowUploadModal={setShowUploadModal}
        onOpenSequencer={() => setShowSequencerModal(true)}
        onOpenLiveMap={() => setActivePanel('liveMap')}
        showRightPanel={showRightPanel}
        onTogglePanel={toggleRightPanel}
        phoneNumbers={phoneNumbers}
      />
      </Suspense></ErrorBoundary>
    );
  };


  // ==================== PANEL RENDERER ====================
  const renderPanelContent = () => {
    switch (activePanel) {
      case 'operations': return renderOperationsPage();
      case 'liveMap': return (
        <ErrorBoundary><Suspense fallback={<LazyFallback />}>
          <LiveMapPage role={role} currentUser={currentUser} drivers={drivers} trips={trips} driverTelemetry={driverTelemetry} onUpdateDriverLocation={handleUpdateDriverLocation} assignTripToDriver={assignTripToDriver} triggerSmartAssign={triggerSmartAssign} setManualAssignTrip={setManualAssignTrip} makeCall={makeCall} sendSMS={sendSMS} />
        </Suspense></ErrorBoundary>
      );
      case 'dispatch': return (
        <ErrorBoundary><Suspense fallback={<LazyFallback />}>
          <DispatchAssistant drivers={drivers} trips={trips} onAssignTrip={assignTripToDriver} addAuditLog={addAuditLog} currentUser={currentUser} />
        </Suspense></ErrorBoundary>
      );
      case 'routePlanner': return (
        <ErrorBoundary><Suspense fallback={<LazyFallback />}>
        <RoutePlannerPage
          trips={trips}
          drivers={drivers}
          role={role}
          currentUser={currentUser}
          onSendToSequencer={({ clients, sequence }) => {
            setRoutePlannerSequencerStops(clients || null);
            setRoutePlannerSequencerSequence(sequence || null);
            setRoutePlannerSequencerKey(k => k + 1);
            setShowSequencerModal(true);
          }}
        />
        </Suspense></ErrorBoundary>
      );
      case 'reports': return (
        <ErrorBoundary><Suspense fallback={<LazyFallback />}>
          <ReportsPage trips={trips} drivers={drivers} vehicles={vehicles} driverTelemetry={driverTelemetry} onUpdateTrip={updateTrip} role={role} setShowUploadModal={setShowUploadModal} requestBulkDelete={requestBulkDelete} />
        </Suspense></ErrorBoundary>
      );

      case 'archives': return <ErrorBoundary><Suspense fallback={<LazyFallback />}><ArchivesPage trashedTrips={trashedTrips} restoreTrip={restoreTrip} drivers={drivers} role={role} updateTrashedTrip={updateTrashedTrip} /></Suspense></ErrorBoundary>;
      case 'admin': return (
        <ErrorBoundary><Suspense fallback={<LazyFallback />}>
        <AdminPage
          role={role} currentUser={currentUser}
          drivers={drivers} setDrivers={setDrivers} upsertDriverProfile={upsertDriverProfile} assignVehicleToDriver={assignVehicleToDriver}
          dispatchers={dispatchers} setDispatchers={setDispatchers}
          vehicles={vehicles} setVehicles={setVehicles}
          addAuditLog={addAuditLog}
          logs={logs}
          trips={trips}
          assignTripToDriver={assignTripToDriver}
          requestAuthAction={requestAuthAction}
          onViewTrip={(ref) => {
            const trip = trips.find(t => t.id === ref || t.bookingId === ref);
            if (trip) setTripDetails(trip);
          }}
        />
        </Suspense></ErrorBoundary>
      );
      case 'welltrans': return role === 'admin' ? (
        <ErrorBoundary><Suspense fallback={<LazyFallback />}>
          <WellTransSyncPage trips={trips} drivers={drivers} role={role} onUpdateTrip={updateTrip} />
        </Suspense></ErrorBoundary>
      ) : renderOperationsPage();
      case 'settings': return (
        <ErrorBoundary><Suspense fallback={<LazyFallback />}>
        <SettingsPage currentUser={currentUser} role={role} onLogout={onLogout} onResetSystem={() => { setTrips([]); setTrashedTrips([]); setDrivers([]); setLogs([{ t: 'System Reset', d: 'Administrator wiped all operational data.', c: 'rose', type: 'system' }]); addAuditLog('System Reset', 'Master data wipe performed by Admin.', 'rose'); }} trashedTrips={trashedTrips} restoreTrip={restoreTrip} deleteTrashedTrip={deleteTrashedTrip} updateTrashedTrip={updateTrashedTrip} appSettings={appSettings} onUpdateAppSettings={updateAppSettings} phoneNumbers={phoneNumbers} onUpdatePhoneNumbers={(updates) => { setPhoneNumbers(prev => ({ ...prev, ...updates })); setTimeout(persistState, 0); }} requestAuthAction={requestAuthAction} hasPermission={hasPermission} driverProfile={null} trips={trips} drivers={drivers} dispatchers={dispatchers} vehicles={vehicles} logs={logs} persistState={persistState} initialSection={activePanel === 'archives' ? 'archives' : undefined} />
        </Suspense></ErrorBoundary>
      );
      case 'drive': return driverWorkDrivers.length > 0 && activeDriverWorkDriver ? (
        <div className="flex h-full min-h-0 flex-col bg-[var(--bg-app)]">
          <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">Driver Workstation</p>
                <p className="truncate text-sm font-semibold text-slate-900">
                  {role === 'admin' ? 'Admin' : 'Dispatcher'} operating driver workflow
                </p>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <select
                  value={activeDriverWorkDriver.id}
                  onChange={(event) => setDriverWorkDriverId(event.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 sm:min-w-[240px]"
                >
                  {driverWorkDrivers.map((driver) => (
                    <option key={driver.id || driver.email || driver.name} value={driver.id}>
                      {driver.name || driver.email || driver.id} - {driver.vehicle || 'No vehicle'}
                    </option>
                  ))}
                </select>
                <span className={`hidden rounded-lg px-2 py-1 text-xs font-semibold sm:inline-flex ${getDriverLiveStatus(activeDriverWorkDriver).color}`}>
                  {getDriverLiveStatus(activeDriverWorkDriver).label}
                </span>
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <DriverPage
              currentUser={activeDriverWorkDriver.email || activeDriverWorkDriver.id || currentUser}
              role="driver"
              drivers={[activeDriverWorkDriver]}
              trips={activeDriverWorkTrips}
              allDrivers={allDrivers}
              dispatchers={dispatchers}
              phoneNumbers={phoneNumbers}
              onUpdateTrip={onUpdateDriverTrip}
              onCompleteTrip={onCompleteTrip}
              onDriverStatusUpdate={onDriverStatusUpdate}
              onAddAuditLog={addAuditLog}
              onLogout={onLogout}
              requestAuthAction={requestAuthAction}
              appSettings={appSettings}
              onUpdateAppSettings={updateAppSettings}
              onUpdateDriverLocation={handleUpdateDriverLocation}
              onOpenSettings={() => setActivePanel('settings')}
              onAddTrip={addTrip}
              showAddTripModal={showAddTripModal}
              setShowAddTripModal={setShowAddTripModal}
            />
          </div>
        </div>
      ) : renderOperationsPage();
      case 'chat': return (
        <ErrorBoundary><Suspense fallback={<LazyFallback />}>
          <ChatPage />
        </Suspense></ErrorBoundary>
      );
      default: return renderOperationsPage();
    }
  };

  // ==================== MAIN LAYOUT ====================
  return (
    <div className="h-full w-full overflow-hidden bg-[var(--bg-app)] font-sans text-slate-900">
      <div className="flex h-full min-w-0 flex-col">
        {/* Top Header - Desktop only */}
        {renderEnterpriseTopBar()}

        {/* Mobile top bar */}
        {renderMobileTopBar()}

        {/* Panel content wrapper */}
        <div className="flex-1 flex min-h-0 relative">
            <div className={`flex-1 min-h-0 ${['reports', 'admin', 'drive', 'chat', 'welltrans'].includes(activePanel) ? 'flex flex-col' : 'overflow-y-auto'} bg-[var(--bg-app)] ${['operations', 'reports', 'admin', 'drive', 'liveMap', 'chat', 'welltrans'].includes(activePanel) ? '' : 'p-3 sm:p-4 lg:p-6'}`}>
            {activePanel === 'operations' ? (
              renderPanelContent()
            ) : activePanel === 'reports' ? (
              <ErrorBoundary><Suspense fallback={<LazyFallback />}>
                <ReportsPage trips={trips} drivers={drivers} vehicles={vehicles} driverTelemetry={driverTelemetry} onUpdateTrip={updateTrip} role={role} setShowUploadModal={setShowUploadModal} requestBulkDelete={requestBulkDelete} />
              </Suspense></ErrorBoundary>
            ) : (
              <div className={
                activePanel === 'drive' || activePanel === 'admin' || activePanel === 'welltrans'
                  ? 'md:rounded-[2rem] md:border border-slate-200/50 bg-white md:shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden'
                  : 'md:rounded-[2rem] md:border border-slate-200/50 bg-white md:shadow-sm overflow-hidden'
              }>
                {renderPanelContent()}
              </div>
            )}
          </div>

          {/* Desktop right panel */}
          <div className="hidden md:flex flex-shrink-0 border-l border-slate-200/50 bg-white">
            {showRightPanel && renderRightPanel()}
          </div>
        </div>
      </div>

      {/* Right panel as mobile drawer */}
      <div className="block md:hidden">
        {showRightPanel && (
          <div className="fixed inset-0 z-[100] flex">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowRightPanel(false)} />
            <div className="relative w-full bg-white flex flex-col h-full shadow-2xl z-10 animate-in slide-in-from-right duration-300">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
                <span className="text-sm font-semibold text-slate-900">Command Panel</span>
                <button onClick={() => setShowRightPanel(false)} className="p-2 rounded-xl hover:bg-slate-100 active:bg-slate-200 transition-colors">
                  <X size={18} className="text-slate-600" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                {renderRightPanel()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation — mobile only */}
      {renderBottomNav()}

      {/* Command Palette */}
      {renderCommandPalette()}

      {/* ==================== MODALS ==================== */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowUploadModal(false)} />
          <div className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-sm relative z-10 border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between z-10">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Upload size={16} className="text-blue-700" /> Upload Trips
              </h2>
              <button onClick={() => setShowUploadModal(false)} className="p-1.5 rounded-xl hover:bg-slate-50 transition-colors"><X size={16} className="text-slate-600" /></button>
            </div>
            <div className="p-6">
              <ErrorBoundary><Suspense fallback={<LazyFallback />}>
                <FileUploadTrips
                  uploadContext={activePanel}
                  drivers={drivers}
                  preSelectDriver={uploadAssignDriver}
                   onTripsCreated={async (newTrips) => {
                    try {
                    setTrips(prev => {
                      const makeKey = (t) => {
                        const bk = t?.bookingId;
                        if (bk && !/^(BK-\d+-\d+|TRP-\d+|TRIP-\d{10,}-\d+)$/i.test(bk)) return `bk::${bk}`;
                        const parts = [
                          (t?.patient || '').trim().toLowerCase(),
                          (t?.date || '').trim(),
                          (t?.time || '').trim(),
                          (t?.pickup || '').trim().toLowerCase().replace(/\s+/g, ' '),
                          (t?.dropoff || '').trim().toLowerCase().replace(/\s+/g, ' '),
                        ];
                        return `cmp::${parts.join('|')}`;
                      };
                      const existingKeys = new Map();
                      prev.forEach((et, idx) => { existingKeys.set(makeKey(et), idx); });
                      
                      const updatedTrips = [...prev];
                      newTrips.forEach(nt => {
                        const key = makeKey(nt);
                        if (existingKeys.has(key)) {
                          const idx = existingKeys.get(key);
                          const existingTrip = updatedTrips[idx];
                          const mergedTrip = { ...existingTrip };
                          Object.keys(nt).forEach(k => {
                            // Only overwrite if the new value is meaningful, or if it's explicitly overriding
                            if (nt[k] !== '' && nt[k] !== null && nt[k] !== undefined) {
                              mergedTrip[k] = nt[k];
                            }
                          });
                          // Ensure we keep the original Firestore ID
                          mergedTrip.id = existingTrip.id;
                          updatedTrips[idx] = mergedTrip;
                        } else {
                          updatedTrips.push(nt);
                          existingKeys.set(key, updatedTrips.length - 1);
                        }
                      });
                      return updatedTrips;
                    });
                    setShowUploadModal(false);
                    addToast('Trips Imported', `${newTrips.length} trip(s) imported successfully.`, 'success');
                    } catch (err) { console.error('[onTripsCreated]', err); addToast('Import Failed', err.message || 'Unexpected error.', 'danger'); }
                  }}
                />
              </Suspense></ErrorBoundary>
            </div>
          </div>
        </div>
      )}

      {bulkAssignModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setBulkAssignModal(false)} />
          <div className="bg-white w-full max-w-md max-h-[80vh] overflow-y-auto rounded-3xl shadow-sm relative z-10 border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between z-10">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Users size={16} className="text-emerald-700" /> Assign {selectedTasks.length} Trips
              </h2>
              <button onClick={() => setBulkAssignModal(false)} className="p-1.5 rounded-xl hover:bg-slate-50 transition-colors"><X size={16} className="text-slate-600" /></button>
            </div>
            <div className="p-4 space-y-1.5">
              {drivers.map(d => (
                <button
                  key={d.id}
                  onClick={() => { bulkAssignTrips(d.id); setBulkAssignModal(false); }}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-sm transition-all duration-200 group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs ring-1 ring-blue-200">{String(d?.name || '?').charAt(0)}</div>
                    <div className="text-left">
                      <p className="font-medium text-slate-900">{d.name}</p>
                       <p className="text-xs text-slate-500">{d.vehicle} • <span className={`px-1 py-0.5 rounded text-xs font-semibold ${getDriverLiveStatus(d).color}`}>{getDriverLiveStatus(d).label}</span></p>
                    </div>
                  </div>
                  <span className="text-blue-700 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Assign →</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {manualAssignTrip && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setManualAssignTrip(null)} />
          <div className="bg-white w-full max-w-md max-h-[80vh] overflow-y-auto rounded-3xl shadow-sm relative z-10 border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between z-10">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Users size={16} className="text-emerald-700" /> Assign: {manualAssignTrip.patient}
              </h2>
              <button onClick={() => setManualAssignTrip(null)} className="p-1.5 rounded-xl hover:bg-slate-50 transition-colors"><X size={16} className="text-slate-600" /></button>
            </div>
            <div className="p-4 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 px-1">Available Drivers</p>
              {drivers.filter(d => d.status === 'Available').map(d => (
                <button
                  key={d.id}
                  onClick={() => { assignTripToDriver(manualAssignTrip.id, d.id); setManualAssignTrip(null); }}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-sm transition-all duration-200 group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs ring-1 ring-emerald-200">{String(d?.name || '?').charAt(0)}</div>
                    <div className="text-left">
                      <p className="font-medium text-slate-900">{d.name}</p>
                      <p className="text-xs text-slate-500">{d.vehicle} • Available</p>
                    </div>
                  </div>
                  <span className="text-emerald-700 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Assign →</span>
                </button>
              ))}
              {drivers.filter(d => d.status !== 'Available').length > 0 && (
                <>
                  <div className="border-t border-slate-200 my-2" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 px-1">Other Drivers</p>
                </>
              )}
              {drivers.filter(d => d.status !== 'Available').map(d => (
                <button
                  key={d.id}
                  onClick={() => { assignTripToDriver(manualAssignTrip.id, d.id); setManualAssignTrip(null); }}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-sm opacity-70 hover:opacity-100 transition-all duration-200 group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs ring-1 ring-slate-200">{String(d?.name || '?').charAt(0)}</div>
                    <div className="text-left">
                      <p className="font-medium text-slate-900">{d.name}</p>
                       <p className="text-xs text-slate-500"><span className={`px-1 py-0.5 rounded text-xs font-semibold ${getDriverLiveStatus(d).color}`}>{getDriverLiveStatus(d).label}</span> • {d.vehicle}</p>
                    </div>
                  </div>
                  <span className="text-slate-500 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Assign →</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {smartAssignTrip && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setSmartAssignTrip(null); setSmartAssignResult(null); }} />
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-sm relative z-10 border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between z-10">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <BrainCircuit size={16} className="text-indigo-700" /> AI Assignment
              </h2>
              <button onClick={() => { setSmartAssignTrip(null); setSmartAssignResult(null); }} className="p-1.5 rounded-xl hover:bg-slate-50 transition-colors"><X size={16} className="text-slate-600" /></button>
            </div>
            <div className="p-5">
              {aiAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="w-10 h-10 border-[3px] border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-3" />
                  <p className="text-sm font-medium text-slate-600">Analyzing routes...</p>
                </div>
              ) : smartAssignResult?.driverId ? (
                (() => {
                  const d = drivers.find(drv => drv.id === smartAssignResult.driverId);
                  if (!d) return null;
                  return (
                    <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold ring-1 ring-indigo-200">{String(d?.name || '?').charAt(0)}</div>
                          <div>
                            <p className="font-medium text-slate-900">{d.name}</p>
                            <p className="text-xs text-slate-500">{d.vehicle}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-indigo-700 tabular-nums">{smartAssignResult.score}%</div>
                          <p className="text-xs text-slate-500">match</p>
                        </div>
                      </div>
                      {smartAssignResult.reason && (
                        <div className="mt-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                          <p className="text-xs text-slate-600 leading-relaxed">{smartAssignResult.reason}</p>
                        </div>
                      )}
                      <button
                        onClick={() => assignTripToDriver(smartAssignTrip.id, d.id)}
                        className="mt-3 w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all duration-200 flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 size={14} /> Confirm Assignment
                      </button>
                    </div>
                  );
                })()
              ) : (
                <div className="py-6 text-center">
                  <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-3">
                    <BrainCircuit size={18} className="text-slate-600" />
                  </div>
                  <p className="text-sm text-slate-500">{smartAssignResult?.reason || 'No suitable driver found'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showOptimizeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !aiAnalyzing && setShowOptimizeModal(false)} />
          <div className="bg-white w-full max-w-md rounded-3xl shadow-sm relative z-10 border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between z-10">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Wand2 size={16} className="text-indigo-700" /> Fleet Optimization
              </h2>
              {!aiAnalyzing && <button onClick={() => setShowOptimizeModal(false)} className="p-1.5 rounded-xl hover:bg-slate-50 transition-colors"><X size={16} className="text-slate-600" /></button>}
            </div>
            <div className="p-5">
              {aiAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="w-10 h-10 border-[3px] border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-3" />
                  <p className="text-sm font-medium text-slate-600">Optimizing fleet...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <p className="text-xs text-slate-600">Optimize driver routes and assignments for maximum efficiency.</p>
                  </div>
                  <button
                    onClick={() => { try { triggerFleetOptimization().then(() => setShowOptimizeModal(false)); } catch (e) { console.error('[FleetOpt]', e); } }}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    <Zap size={16} /> Run Optimization
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Trip Details Modal */}
      {tripDetails && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={() => setTripDetails(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-sm relative z-10 border border-slate-200 max-h-[85vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white backdrop-blur-md border-b border-slate-100 px-5 py-3.5 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <h3 className="text-sm font-semibold text-slate-900">Trip Details</h3>
              </div>
              <button onClick={() => setTripDetails(null)} className="p-1.5 rounded-xl hover:bg-slate-50 transition-colors"><X size={16} className="text-slate-600" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-base font-semibold text-slate-900">{tripDetails.patient}</p>
                  {getBookingReference(tripDetails) && <p className="text-xs text-slate-500 mt-0.5">Booking ID: {getBookingReference(tripDetails)}</p>}
                  {getClientIdentifier(tripDetails) && <p className="text-xs text-slate-500 mt-0.5">Client ID: {getClientIdentifier(tripDetails)}</p>}
                  {(tripDetails.type || tripDetails.serviceType) && <p className="text-xs text-slate-500 mt-0.5">Service: {tripDetails.type || tripDetails.serviceType}</p>}
                </div>
                <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                  tripDetails.status === 'Unassigned' ? 'bg-rose-100 text-rose-700' :
                  tripDetails.status === 'Assigned' ? 'bg-blue-100 text-blue-700' :
                  tripDetails.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                  'bg-slate-100 text-slate-700'
                }`}>{tripDetails.status}</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Time</p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">{tripDetails.time || '—'}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Date</p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">{tripDetails.date || '—'}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 mt-0.5 shadow-sm shadow-emerald-500/20">
                    <span className="text-xs font-semibold text-white">P</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pickup</p>
                    <p className="text-xs font-medium text-slate-700 mt-0.5">{tripDetails.pickup || '—'}</p>
                    {tripDetails.pickupSiteName && <p className="text-xs text-emerald-700 mt-1">{tripDetails.pickupSiteName}</p>}
                    {formatPhoneDisplay(getClientPhoneGlobal(tripDetails)) && <p className="text-xs text-emerald-700 mt-1">Client phone: {formatPhoneDisplay(getClientPhoneGlobal(tripDetails))}</p>}
                    {formatPhoneDisplay(tripDetails.pickupPhone) && formatPhoneDisplay(tripDetails.pickupPhone) !== formatPhoneDisplay(getClientPhoneGlobal(tripDetails)) && <p className="text-xs text-emerald-700">Pickup phone: {formatPhoneDisplay(tripDetails.pickupPhone)}</p>}
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center shrink-0 mt-0.5 shadow-sm shadow-rose-500/20">
                    <span className="text-xs font-semibold text-white">D</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dropoff</p>
                    <p className="text-xs font-medium text-slate-700 mt-0.5">{tripDetails.dropoff || '—'}</p>
                    {tripDetails.dropoffSiteName && <p className="text-xs text-rose-700 mt-1">{tripDetails.dropoffSiteName}</p>}
                    {formatPhoneDisplay(tripDetails.hospitalPhone || tripDetails.dropoffPhone) && formatPhoneDisplay(tripDetails.hospitalPhone || tripDetails.dropoffPhone) !== formatPhoneDisplay(getClientPhoneGlobal(tripDetails)) && <p className="text-xs text-rose-700 mt-1">Hospital phone: {formatPhoneDisplay(tripDetails.hospitalPhone || tripDetails.dropoffPhone)}</p>}
                  </div>
                </div>
              </div>

              {tripDetails.routeAssignments?.length > 0 && (
                <div className="bg-white rounded-xl border border-indigo-100 p-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-indigo-500">Route Plans</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tripDetails.routeAssignments.map((route, index) => (
                        <span key={`${route.templateId || route.routeName}-${index}`} className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                          {route.routeName}{route.time ? ` @ ${route.time}` : ''}{route.statusLabel ? ` • ${route.statusLabel}` : ''}
                        </span>
                    ))}
                  </div>
                </div>
              )}

              {(tripDetails.driverName || tripDetails.driverId) && (
                <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Driver</p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">{drivers.find(d => d.id === tripDetails.driverId)?.name || tripDetails.driverName || '—'}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{drivers.find(d => d.id === tripDetails.driverId)?.vehicle || ''}</p>
                </div>
              )}

              {tripDetails.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Notes</p>
                  <p className="text-xs text-amber-700 mt-0.5">{tripDetails.notes}</p>
                </div>
              )}

              <button
                onClick={() => setShowTripLocations(prev => !prev)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-colors"
              >
                <Search size={13} /> {showTripLocations ? 'Hide' : 'Find This Trip'}
              </button>

              {showTripLocations && (() => {
                const locs = findTripLocations(tripDetails, trips, trashedTrips, logs);
                return locs.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Found in</p>
                    {locs.map((loc, i) => (
                      <button
                        key={i}
                        onClick={() => { setActivePanel(loc.panel); setTripDetails(null); setShowTripLocations(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 transition-colors text-left"
                      >
                        {loc.icon === 'Zap' && <Zap size={14} className="text-indigo-600" />}
                        {loc.icon === 'Archive' && <Archive size={14} className="text-indigo-600" />}
                        {loc.icon === 'BarChart2' && <BarChart2 size={14} className="text-indigo-600" />}
                        {loc.icon === 'Route' && <Route size={14} className="text-indigo-600" />}
                        <span className="text-xs font-semibold text-indigo-700">{loc.label}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 text-center py-2">No other references found.</p>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div role="dialog" aria-modal="true" aria-label="Re-authenticate" className="bg-white w-full max-w-sm rounded-3xl shadow-sm relative z-10 border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Hash size={16} className="text-blue-700" /> Authenticate
              </h3>
            </div>
            <form onSubmit={submitAuthAction} className="p-5">
              <div className="space-y-1 mb-2">
                <p className="text-xs text-slate-500">Enter your password to confirm this action.</p>
              </div>
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 mb-3 transition-all"
                autoFocus
              />
              {reAuthError && <p className="text-xs text-rose-700 mb-3">{reAuthError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAuthModal(false)} className="flex-1 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition-all duration-200">Cancel</button>
                <button type="submit" className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all duration-200">Confirm</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Route Plan Modal */}
      {showSequencerModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowSequencerModal(false); setRoutePlannerSequencerStops(null); setRoutePlannerSequencerSequence(null); }} />
          <div className="bg-white w-full max-w-7xl h-[92vh] rounded-3xl shadow-2xl relative z-10 border border-slate-200 animate-in fade-in zoom-in-95 duration-200 flex flex-col overflow-hidden">
            <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between flex-shrink-0">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Route size={16} className="text-indigo-700" /> Route Plan
              </h2>
              <button onClick={() => { setShowSequencerModal(false); setRoutePlannerSequencerStops(null); setRoutePlannerSequencerSequence(null); }} className="p-1.5 rounded-xl hover:bg-slate-50 transition-colors"><X size={16} className="text-slate-600" /></button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ErrorBoundary><Suspense fallback={<LazyFallback />}>
                <RouteSequencerApp
                  key={routePlannerSequencerKey}
                  trips={trips} 
                  drivers={drivers}
                  currentUser={currentUser} 
                  role={role}
                  initialStops={routePlannerSequencerStops}
                  initialSequence={routePlannerSequencerSequence}
                  onRouteSaved={({ route, saveMode, driverId, validTripIds }) => {
                    try {
                    if (saveMode === 'recurring') {
                      addAuditLog('Route Created', `${currentUser} saved recurring route "${route.name}" with ${route.sequence?.length || 0} stops.`, 'indigo');
                      return;
                    }
                    const driver = drivers.find((item) => item.id === driverId);
                    addAuditLog(
                      driver ? 'Route Assigned' : 'Route Saved',
                      driver
                        ? `${currentUser} assigned today's route "${route.name}" to ${driver.name} (${validTripIds.length} synced trips).`
                        : `${currentUser} saved today's route "${route.name}" without assigning a driver.`,
                      driver ? 'amber' : 'slate'
                    );
                    } catch (err) { console.error('[onRouteSaved]', err); addToast?.('Error', 'Failed to save route.', 'danger'); }
                  }}
                  onApplyRoute={({ route, driverId, tripIds, driver }) => {
                    try {
                    const routeTripIds = new Set(tripIds || []);
                    if (!driverId || routeTripIds.size === 0) return;
                    setTrips(prev => prev.map(t => {
                      if (routeTripIds.has(t.id)) {
                        return { ...t, status: 'Assigned', driverId, driverEmail: driver?.email || null, driverName: driver?.name || null };
                      }
                      return t;
                    }));
                    addAuditLog('Route Applied', `${currentUser} synced ${routeTripIds.size} trip assignments from route "${route.name}".`, 'emerald');
                    } catch (err) { console.error('[onApplyRoute]', err); addToast?.('Error', 'Failed to apply route.', 'danger'); }
                  }}
                />
              </Suspense></ErrorBoundary>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DesktopEnterpriseDashboard;
