import React, { useState, lazy, Suspense, useEffect, useRef } from 'react';
import {
  LayoutDashboard, FileText, Users, MapPin, Settings, BarChart2,
  Archive, MessageCircle, Zap, ChevronLeft, ChevronRight, Bell,
  Phone, Building2, MessageSquare, Trash2, RefreshCcw, Clock,
  CheckCircle2, AlertCircle, BrainCircuit, Upload, Wand2, Search,
  Timer, Repeat, AlertTriangle, X, Plus, LogOut, Truck, Activity,
  Command, ChevronDown, Maximize2, Minimize2, PanelLeftClose, PanelRight,
  TrendingUp, TrendingDown, Navigation, Wifi, WifiOff, Sun, Moon,
  MoreHorizontal, Filter, Download, Eye, EyeOff, Star, Hash, AtSign
} from 'lucide-react';
import { auth, signOut } from '../config/firebase';
import TripsPage from './TripsPage';
import ChatPage from './ChatPage';
import ArchivesPage from './ArchivesPage';
import DriversVehiclesPage from './DriversVehiclesPage';
import SettingsPage from './SettingsPage';
import UsersPage from './UsersPage';
import OperationsCommandCenter from './OperationsCommandCenter';

const LiveMapPage = lazy(() => import('./LiveMapPage'));
const DispatchAssistant = lazy(() => import('./DispatchAssistant'));
const FileUploadTrips = lazy(() => import('./FileUploadTrips'));
const ReportsPage = lazy(() => import('./ReportsPage'));

const LazyFallback = () => (
  <div className="flex items-center justify-center h-full">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      <p className="text-xs text-slate-500 font-medium">Loading module...</p>
    </div>
  </div>
);

const timeToMinutes = (t) => {
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
};

const isTripLate = (tripTime) => {
  if (!tripTime || tripTime === 'Will Call') return false;
  const now = new Date();
  const timeVal = timeToMinutes(tripTime);
  const scheduled = new Date();
  scheduled.setHours(Math.floor(timeVal / 60), timeVal % 60, 0, 0);
  return now > scheduled;
};

const cleanPhone = (p) => (p || '').replace(/[^0-9]/g, '');

const FACILITY_KEYWORDS = ['hospital','center','clinic','academy','school','treatment','health','dental','pharmacy','office','suite','care','medical','therapy','rehab','wellness','surgery','diagnostic','lab','institute', 'skills', 'senior', 'living', 'manor', 'village'];

const EnterpriseDashboard = ({
  role, currentUser, trips, setTrips, drivers, setDrivers, dispatchers, setDispatchers, vehicles, setVehicles,
  trashedTrips, restoreTrip, logs, setLogs, phoneNumbers, setPhoneNumbers, appSettings, updateAppSettings,
  selectedTasks, setSelectedTasks, searchQuery, setSearchQuery,
  smartAssignTrip, setSmartAssignTrip, manualAssignTrip, setManualAssignTrip,
  smartAssignResult, setSmartAssignResult, aiAnalyzing, setAiAnalyzing,
  showOptimizeModal, setShowOptimizeModal, showUploadModal, setShowUploadModal,
  uploadAssignDriver, setUploadAssignDriver, bulkAssignModal, setBulkAssignModal,
  showDispatcherArchive, setShowDispatcherArchive,
  addToast, addAuditLog, persistState, hasPermission, requestAuthAction,
  triggerSmartAssign, triggerFleetOptimization, assignTripToDriver,
  bulkAssignTrips, createSharedRide, createLegMission, requestDeleteTrip, updateTrip,
  chatUnreadCount, makeCall, sendSMS, handleUpdateDriverLocation
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activePanel, setActivePanel] = useState('operations');
  const [operationsTab, setOperationsTab] = useState('manifest');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authActionPayload, setAuthActionPayload] = useState(null);
  const [authPassword, setAuthPassword] = useState('');
  const [reAuthError, setReAuthError] = useState('');
  const [tripDetails, setTripDetails] = useState(null);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showNotifications, setShowNotifications] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState('alerts');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Live clock
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Online/offline listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
        setShowNotifications(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];

  const sidebarItems = [
    { id: 'operations', label: 'Operations', icon: LayoutDashboard, roles: ['admin', 'dispatcher'] },
    { id: 'liveMap', label: 'Live Map', icon: MapPin, roles: ['admin', 'dispatcher', 'fleet_manager', 'qa_auditor', 'supervisor'] },
    { id: 'chat', label: 'Chat', icon: MessageCircle, roles: ['admin', 'dispatcher'] },
    { id: 'reports', label: 'Reports', icon: BarChart2, roles: ['admin', 'billing', 'qa_auditor', 'fleet_manager', 'supervisor'] },
    { id: 'archives', label: 'Archives', icon: Archive, roles: ['admin', 'dispatcher'] },
    { id: 'admin', label: 'Admin', icon: Settings, roles: ['admin'] },
    { id: 'settings', label: 'Settings', icon: Settings, roles: ['admin', 'dispatcher'] },
  ].filter(item => item.roles.includes(role));

  const todayTrips = trips.filter(t => t.date === todayStr || !t.date);
  const activeTrips = todayTrips.filter(t => !['Completed', 'Cancelled', 'No Show'].includes(t.status));
  const unassignedTrips = activeTrips.filter(t => t.status === 'Unassigned');
  const assignedTrips = activeTrips.filter(t => t.status === 'Assigned');
  const inProgressTrips = activeTrips.filter(t => ['In Mission', 'En Route', 'At Pickup', 'At Dropoff'].includes(t.status));
  const completedToday = todayTrips.filter(t => t.status === 'Completed').length;
  const availableDrivers = drivers.filter(d => d.status === 'Available').length;
  const lateTrips = activeTrips.filter(t => isTripLate(t.time));

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
        t.patient.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.bookingId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.pickup || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.dropoff || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sortedScheduled;

  // Command palette commands
  const commands = [
    { id: 'ops', label: 'Go to Operations', icon: LayoutDashboard, action: () => setActivePanel('operations') },
    { id: 'map', label: 'Go to Live Map', icon: MapPin, action: () => setActivePanel('liveMap') },
    { id: 'chat', label: 'Go to Chat', icon: MessageCircle, action: () => setActivePanel('chat') },
    { id: 'reports', label: 'Go to Reports', icon: BarChart2, action: () => setActivePanel('reports') },
    { id: 'archives', label: 'Go to Archives', icon: Archive, action: () => setActivePanel('archives') },
    { id: 'admin', label: 'Go to Admin', icon: Settings, action: () => setActivePanel('admin') },
    { id: 'settings', label: 'Go to Settings', icon: Settings, action: () => setActivePanel('settings') },
    { id: 'optimize', label: 'Run Fleet Optimization', icon: Wand2, action: () => setShowOptimizeModal(true) },
    { id: 'upload', label: 'Upload Trips', icon: Upload, action: () => setShowUploadModal(true) },
    { id: 'toggle-sidebar', label: 'Toggle Sidebar', icon: PanelLeftClose, action: () => setSidebarCollapsed(!sidebarCollapsed) },
    { id: 'toggle-right', label: 'Toggle Right Panel', icon: PanelRight, action: () => setShowRightPanel(!showRightPanel) },
  ].filter(cmd => {
    if (cmd.id === 'admin' && role !== 'admin') return false;
    return true;
  });

  const filteredCommands = commandQuery
    ? commands.filter(c => c.label.toLowerCase().includes(commandQuery.toLowerCase()))
    : commands;

  const submitAuthAction = async (e) => {
    e.preventDefault();
    setReAuthError('');
    const user = auth.currentUser;
    if (!user || !user.email) {
      setReAuthError('Authentication error. Please log in again.');
      return;
    }
    try {
      const { EmailAuthProvider, reauthenticateWithCredential } = await import('../config/firebase');
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

  // ==================== SIDEBAR ====================
  const renderSidebar = () => (
    <aside className={`${sidebarCollapsed ? 'w-[52px]' : 'w-[220px]'} bg-[#0a0e1a] text-slate-400 flex flex-col transition-all duration-200 shrink-0 border-r border-white/5 relative z-20`}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 py-3 border-b border-white/5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
          <Truck size={16} className="text-white" />
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-white tracking-tight">Agape Care</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Fleet OS</p>
          </div>
        )}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="ml-auto p-1.5 rounded-md hover:bg-white/5 transition shrink-0"
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto px-2">
        <div className="mb-1">
          {!sidebarCollapsed && <p className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold px-2 py-1.5">Navigation</p>}
          {sidebarItems.map(item => {
            const Icon = item.icon;
            const isActive = activePanel === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePanel(item.id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-sm rounded-lg transition-all mb-0.5 group relative ${
                  isActive
                    ? 'bg-blue-600/15 text-blue-400 font-medium'
                    : 'hover:bg-white/5 hover:text-slate-200'
                }`}
                title={sidebarCollapsed ? item.label : undefined}
              >
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-500 rounded-r" />}
                <Icon size={16} className="shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                {item.id === 'chat' && chatUnreadCount > 0 && !sidebarCollapsed && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center font-bold">
                    {chatUnreadCount > 9 ? '9+' : chatUnreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Bottom section */}
      <div className="border-t border-white/5 p-2">
        <button
          onClick={() => signOut(auth).catch(() => window.location.reload())}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 text-sm hover:bg-white/5 rounded-lg transition text-slate-500 hover:text-rose-400"
          title={sidebarCollapsed ? 'Sign Out' : undefined}
        >
          <LogOut size={16} className="shrink-0" />
          {!sidebarCollapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );

  // ==================== TOP BAR ====================
  const renderTopBar = () => (
    <header className="bg-[#0d1117]/80 backdrop-blur-xl border-b border-white/5 px-4 py-2 flex items-center gap-3 shrink-0 h-[48px]">
      {/* Left: Breadcrumb + Panel title */}
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold text-white capitalize">{activePanel === 'liveMap' ? 'Live Map' : activePanel}</h1>
        {activePanel === 'operations' && (
          <div className="flex items-center gap-1 ml-2">
            {['manifest', 'willcall', 'fleet'].map(tab => (
              <button
                key={tab}
                onClick={() => setOperationsTab(tab)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                  operationsTab === tab
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }`}
              >
                {tab === 'manifest' ? 'Manifest' : tab === 'willcall' ? 'Will Call' : 'Fleet'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Center: Search */}
      <div className="flex-1 max-w-md mx-auto">
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-slate-500 hover:bg-white/8 hover:border-white/15 transition"
        >
          <Search size={13} />
          <span>Search trips, drivers, commands...</span>
          <kbd className="ml-auto text-[10px] bg-white/10 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
        </button>
      </div>

      {/* Right: Live metrics + actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Connection status */}
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${isOnline ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
          {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
          <span className="hidden lg:inline">{isOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* Live metrics pills */}
        <div className="hidden xl:flex items-center gap-1.5">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 text-blue-400 rounded-md text-xs font-medium">
            <FileText size={12} />
            <span>{activeTrips.length} active</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-md text-xs font-medium">
            <Users size={12} />
            <span>{availableDrivers} ready</span>
          </div>
          {unassignedTrips.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-rose-500/10 text-rose-400 rounded-md text-xs font-medium">
              <AlertCircle size={12} />
              <span>{unassignedTrips.length} unassigned</span>
            </div>
          )}
          {lateTrips.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 text-amber-400 rounded-md text-xs font-medium">
              <Clock size={12} />
              <span>{lateTrips.length} late</span>
            </div>
          )}
        </div>

        {/* Clock */}
        <div className="hidden md:flex items-center gap-1.5 px-2 py-1 text-slate-400 text-xs font-mono">
          <Clock size={12} />
          <span>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-1.5 rounded-md hover:bg-white/5 text-slate-400 hover:text-slate-200 transition relative"
          >
            <Bell size={16} />
            {chatUnreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>
          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-[#161b22] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
                <p className="text-xs font-semibold text-white">Notifications</p>
                <button onClick={() => setShowNotifications(false)} className="p-1 hover:bg-white/5 rounded"><X size={12} className="text-slate-500" /></button>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {logs.slice(0, 5).map((log, i) => (
                  <div key={i} className="px-3 py-2 border-b border-white/5 hover:bg-white/5">
                    <p className="text-xs font-medium text-slate-300">{log.t}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate">{log.d}</p>
                  </div>
                ))}
                {logs.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-slate-600">No notifications</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Toggle right panel */}
        <button
          onClick={() => setShowRightPanel(!showRightPanel)}
          className={`p-1.5 rounded-md transition ${showRightPanel ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-white/5 text-slate-400'}`}
        >
          <PanelRight size={16} />
        </button>

        {/* User avatar */}
        <div className="flex items-center gap-2 pl-2 border-l border-white/10 ml-1">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
            {(currentUser || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="hidden lg:block">
            <p className="text-xs font-medium text-white truncate max-w-[120px]">{currentUser?.split('@')[0]}</p>
            <p className="text-[10px] text-slate-500 capitalize">{role}</p>
          </div>
        </div>
      </div>
    </header>
  );

  // ==================== RIGHT PANEL ====================
  const renderRightPanel = () => (
    <div className="w-[280px] bg-[#0d1117] border-l border-white/5 flex flex-col shrink-0 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-white/5">
        {[
          { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
          { id: 'details', label: 'Details', icon: Eye },
          { id: 'ai', label: 'AI', icon: BrainCircuit },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setRightPanelTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition ${
              rightPanelTab === tab.id
                ? 'text-blue-400 border-b border-blue-500 bg-blue-500/5'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <tab.icon size={12} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {rightPanelTab === 'alerts' && (
          <div className="p-2">
            {logs.slice(0, 20).map((log, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5 mb-1.5 hover:bg-white/[0.04] transition">
                <div className="flex items-start gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                    log.c === 'rose' ? 'bg-rose-500' :
                    log.c === 'amber' ? 'bg-amber-500' :
                    log.c === 'emerald' ? 'bg-emerald-500' :
                    log.c === 'blue' ? 'bg-blue-500' :
                    'bg-slate-500'
                  }`} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-300">{log.t}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{log.d}</p>
                    {log.timestamp && <p className="text-[10px] text-slate-600 mt-1">{log.timestamp}</p>}
                  </div>
                </div>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-slate-600">
                <Bell size={20} className="mb-2 opacity-50" />
                <p className="text-xs">No alerts</p>
              </div>
            )}
          </div>
        )}

        {rightPanelTab === 'details' && (
          <div className="p-2">
            {tripDetails ? (
              <div className="space-y-2">
                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Patient</p>
                  <p className="text-sm font-bold text-white">{tripDetails.patient}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{tripDetails.bookingId || 'No booking ID'}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Status</p>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    tripDetails.status === 'Unassigned' ? 'bg-rose-500/15 text-rose-400' :
                    tripDetails.status === 'Assigned' ? 'bg-blue-500/15 text-blue-400' :
                    tripDetails.status === 'Completed' ? 'bg-emerald-500/15 text-emerald-400' :
                    'bg-slate-500/15 text-slate-400'
                  }`}>{tripDetails.status}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Time</p>
                  <p className="text-sm font-bold text-white">{tripDetails.time || '—'}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Route</p>
                  <div className="space-y-1.5">
                    <div className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                      <p className="text-xs text-slate-300">{tripDetails.pickup || '—'}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                      <p className="text-xs text-slate-300">{tripDetails.dropoff || '—'}</p>
                    </div>
                  </div>
                </div>
                {tripDetails.driverName && (
                  <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Driver</p>
                    <p className="text-sm font-medium text-white">{tripDetails.driverName}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-slate-600">
                <Eye size={20} className="mb-2 opacity-50" />
                <p className="text-xs">Select a trip to view details</p>
              </div>
            )}
          </div>
        )}

        {rightPanelTab === 'ai' && (
          <div className="p-2">
            <div className="p-3 rounded-lg bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 mb-2">
              <div className="flex items-center gap-2 mb-2">
                <BrainCircuit size={14} className="text-indigo-400" />
                <p className="text-xs font-semibold text-indigo-300">AI Dispatch Assistant</p>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {unassignedTrips.length > 0
                  ? `${unassignedTrips.length} trip${unassignedTrips.length > 1 ? 's' : ''} waiting for assignment. Run optimization to auto-assign.`
                  : 'All trips are assigned. System running optimally.'}
              </p>
              {unassignedTrips.length > 0 && (
                <button
                  onClick={() => setShowOptimizeModal(true)}
                  className="mt-2 w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-medium transition flex items-center justify-center gap-1.5"
                >
                  <Wand2 size={12} /> Run Optimization
                </button>
              )}
            </div>

            {/* Quick stats */}
            <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Fleet Insights</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Completion rate</span>
                  <span className="text-emerald-400 font-medium">{todayTrips.length > 0 ? Math.round((completedToday / todayTrips.length) * 100) : 0}%</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">On-time rate</span>
                  <span className="text-blue-400 font-medium">{activeTrips.length > 0 ? Math.round(((activeTrips.length - lateTrips.length) / activeTrips.length) * 100) : 100}%</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Driver utilization</span>
                  <span className="text-amber-400 font-medium">{drivers.length > 0 ? Math.round(((drivers.length - availableDrivers) / drivers.length) * 100) : 0}%</span>
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
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="w-full max-w-lg bg-[#161b22] border border-white/10 rounded-xl shadow-2xl overflow-hidden relative z-10" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 px-3 py-3 border-b border-white/5">
            <Search size={16} className="text-slate-500" />
            <input
              type="text"
              placeholder="Type a command or search..."
              value={commandQuery}
              onChange={e => setCommandQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none"
              autoFocus
            />
            <kbd className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded font-mono text-slate-500">ESC</kbd>
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5">
            {filteredCommands.map(cmd => (
              <button
                key={cmd.id}
                onClick={() => { cmd.action(); setCommandPaletteOpen(false); setCommandQuery(''); }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/5 text-left transition"
              >
                <cmd.icon size={14} className="text-slate-400" />
                <span className="text-sm text-slate-300">{cmd.label}</span>
              </button>
            ))}
            {filteredCommands.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-slate-600">No commands found</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ==================== OPERATIONS PAGE ====================
  const renderOperationsPage = () => (
    <OperationsCommandCenter
      role={role}
      currentUser={currentUser}
      trips={trips}
      drivers={drivers}
      dispatchers={dispatchers}
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
      showOptimizeModal={showOptimizeModal}
      setShowOptimizeModal={setShowOptimizeModal}
      showUploadModal={showUploadModal}
      setShowUploadModal={setShowUploadModal}
      uploadAssignDriver={uploadAssignDriver}
      setUploadAssignDriver={setUploadAssignDriver}
      bulkAssignModal={bulkAssignModal}
      setBulkAssignModal={setBulkAssignModal}
      addToast={addToast}
      addAuditLog={addAuditLog}
      persistState={persistState}
      hasPermission={hasPermission}
      requestAuthAction={requestAuthAction}
      triggerSmartAssign={triggerSmartAssign}
      triggerFleetOptimization={triggerFleetOptimization}
      assignTripToDriver={assignTripToDriver}
      bulkAssignTrips={bulkAssignTrips}
      requestDeleteTrip={requestDeleteTrip}
      updateTrip={updateTrip}
      makeCall={makeCall}
      sendSMS={sendSMS}
      setTripDetails={setTripDetails}
    />
  );

  // ==================== PANEL RENDERER ====================
  const renderPanelContent = () => {
    switch (activePanel) {
      case 'operations': return renderOperationsPage();
      case 'liveMap': return (
        <Suspense fallback={<LazyFallback />}>
          <LiveMapPage drivers={drivers} onUpdateDriverLocation={handleUpdateDriverLocation} />
        </Suspense>
      );
      case 'chat': return <ChatPage currentUser={currentUser} role={role} />;
      case 'reports': return (
        <Suspense fallback={<LazyFallback />}>
          <ReportsPage trips={trips} drivers={drivers} onUpdateTrip={updateTrip} role={role} />
        </Suspense>
      );
      case 'archives': return <ArchivesPage trashedTrips={trashedTrips} restoreTrip={restoreTrip} />;
      case 'admin': return (
        <div className="flex h-full overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2"><Users size={14} /> User Management</h3>
              <UsersPage drivers={drivers} setDrivers={setDrivers} dispatchers={dispatchers} setDispatchers={setDispatchers} addAuditLog={addAuditLog} currentUser={currentUser} role={role} requestAuthAction={requestAuthAction} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2"><Truck size={14} /> Fleet Management</h3>
              <DriversVehiclesPage role={role} drivers={drivers} setDrivers={setDrivers} dispatchers={dispatchers} addAuditLog={addAuditLog} currentUser={currentUser} trips={trips} requestAuthAction={requestAuthAction} vehicles={vehicles} setVehicles={setVehicles} onAssignTrip={(tripId, driverId) => { const driver = drivers.find(d => d.id === driverId); setTrips(prev => prev.map(t => t.id === tripId ? { ...t, status: 'Assigned', driverId, driverEmail: driver?.email || null, driverName: driver?.name || null } : t)); const trip = trips.find(t => t.id === tripId); addAuditLog('Assignment', `${currentUser} (${role}) assigned ${trip?.patient || 'Trip '+tripId} to ${driver?.name || 'Unknown'}`, 'emerald'); }} onUploadForDriver={(driverId) => { setUploadAssignDriver(driverId); setShowUploadModal(true); }} />
            </div>
          </div>
        </div>
      );
      case 'settings': return (
        <SettingsPage currentUser={currentUser} role={role} onLogout={() => window.location.reload()} onResetSystem={() => { setTrips([]); setTrashedTrips([]); setDrivers([]); setLogs([{ t: 'System Reset', d: 'Administrator wiped all operational data.', c: 'rose', type: 'system' }]); addAuditLog('System Reset', 'Master data wipe performed by Admin.', 'rose'); }} trashedTrips={trashedTrips} appSettings={appSettings} onUpdateAppSettings={updateAppSettings} phoneNumbers={phoneNumbers} onUpdatePhoneNumbers={(updates) => { setPhoneNumbers(prev => ({ ...prev, ...updates })); setTimeout(persistState, 0); }} requestAuthAction={requestAuthAction} hasPermission={hasPermission} driverProfile={null} />
      );
      default: return renderOperationsPage();
    }
  };

  // ==================== MAIN LAYOUT ====================
  return (
    <div className="flex h-screen bg-[#0a0e1a] text-slate-300 overflow-hidden font-sans">
      {/* Sidebar */}
      {renderSidebar()}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        {renderTopBar()}

        {/* Content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main content */}
          <div className="flex-1 overflow-hidden bg-[#0a0e1a]">
            {renderPanelContent()}
          </div>

          {/* Right panel */}
          {showRightPanel && renderRightPanel()}
        </div>
      </div>

      {/* Command Palette */}
      {renderCommandPalette()}

      {/* ==================== MODALS ==================== */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowUploadModal(false)} />
          <div className="bg-[#161b22] w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl p-6 shadow-2xl relative z-10 border border-white/10">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-bold text-white">Upload Trips</h2>
              <button onClick={() => setShowUploadModal(false)} className="p-1.5 rounded-lg hover:bg-white/5"><X size={18} className="text-slate-400" /></button>
            </div>
            <Suspense fallback={<LazyFallback />}>
              <FileUploadTrips
                drivers={drivers}
                preSelectDriver={uploadAssignDriver}
                onTripsCreated={(newTrips) => {
                  setTrips(prev => {
                    const combined = [...prev, ...newTrips];
                    const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
                    persistState({ trips: unique });
                    return unique;
                  });
                  setShowUploadModal(false);
                  setUploadAssignDriver('');
                  addAuditLog('Trips Uploaded', `${currentUser} (${role}) imported ${newTrips.length} trips via file upload.`, 'blue');
                  addToast('Trips Uploaded', `${newTrips.length} trips added successfully.`, 'success');
                }}
              />
            </Suspense>
          </div>
        </div>
      )}

      {bulkAssignModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setBulkAssignModal(false)} />
          <div className="bg-[#161b22] w-full max-w-md max-h-[80vh] overflow-y-auto rounded-xl p-6 shadow-2xl relative z-10 border border-white/10">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-bold text-white">Assign {selectedTasks.length} Trips</h2>
              <button onClick={() => setBulkAssignModal(false)} className="p-1.5 rounded-lg hover:bg-white/5"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="space-y-1.5">
              {drivers.map(d => (
                <button
                  key={d.id}
                  onClick={() => { bulkAssignTrips(d.id); setBulkAssignModal(false); }}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-white/10 hover:bg-white/5 text-sm transition"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">{d.name.charAt(0)}</div>
                    <div className="text-left">
                      <p className="font-medium text-white">{d.name}</p>
                      <p className="text-xs text-slate-500">{d.vehicle} • {d.status}</p>
                    </div>
                  </div>
                  <span className="text-blue-400 text-xs font-medium">Assign →</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {manualAssignTrip && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setManualAssignTrip(null)} />
          <div className="bg-[#161b22] w-full max-w-md max-h-[80vh] overflow-y-auto rounded-xl p-6 shadow-2xl relative z-10 border border-white/10">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-bold text-white">Assign: {manualAssignTrip.patient}</h2>
              <button onClick={() => setManualAssignTrip(null)} className="p-1.5 rounded-lg hover:bg-white/5"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="space-y-1.5">
              {drivers.filter(d => d.status === 'Available').map(d => (
                <button
                  key={d.id}
                  onClick={() => { assignTripToDriver(manualAssignTrip.id, d.id); setManualAssignTrip(null); }}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15 text-sm transition"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">{d.name.charAt(0)}</div>
                    <div className="text-left">
                      <p className="font-medium text-white">{d.name}</p>
                      <p className="text-xs text-slate-500">{d.vehicle} • Available</p>
                    </div>
                  </div>
                  <span className="text-emerald-400 text-xs font-medium">Assign →</span>
                </button>
              ))}
              {drivers.filter(d => d.status !== 'Available').map(d => (
                <button
                  key={d.id}
                  onClick={() => { assignTripToDriver(manualAssignTrip.id, d.id); setManualAssignTrip(null); }}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-white/10 hover:bg-white/5 text-sm opacity-60 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-slate-500/20 text-slate-400 flex items-center justify-center font-bold text-xs">{d.name.charAt(0)}</div>
                    <div className="text-left">
                      <p className="font-medium text-white">{d.name}</p>
                      <p className="text-xs text-slate-500">{d.status} • {d.vehicle}</p>
                    </div>
                  </div>
                  <span className="text-slate-500 text-xs font-medium">Assign →</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {smartAssignTrip && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setSmartAssignTrip(null); setSmartAssignResult(null); }} />
          <div className="bg-[#161b22] w-full max-w-lg rounded-xl p-6 shadow-2xl relative z-10 border border-white/10">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <BrainCircuit size={18} className="text-indigo-400" /> AI Assignment
              </h2>
              <button onClick={() => { setSmartAssignTrip(null); setSmartAssignResult(null); }} className="p-1.5 rounded-lg hover:bg-white/5"><X size={18} className="text-slate-400" /></button>
            </div>
            {aiAnalyzing ? (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="w-10 h-10 border-3 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-3" />
                <p className="text-sm font-medium text-slate-400">Analyzing routes...</p>
              </div>
            ) : smartAssignResult?.driverId ? (
              (() => {
                const d = drivers.find(drv => drv.id === smartAssignResult.driverId);
                if (!d) return null;
                return (
                  <div className="p-3 rounded-lg border border-white/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">{d.name.charAt(0)}</div>
                        <div>
                          <p className="font-medium text-white">{d.name}</p>
                          <p className="text-xs text-slate-500">{d.vehicle} • {smartAssignResult.score}% match</p>
                        </div>
                      </div>
                      <button
                        onClick={() => assignTripToDriver(smartAssignTrip.id, d.id)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition"
                      >
                        Assign
                      </button>
                    </div>
                    {smartAssignResult.reason && (
                      <p className="mt-3 text-xs text-slate-400">{smartAssignResult.reason}</p>
                    )}
                  </div>
                );
              })()
            ) : (
              <p className="text-sm text-slate-500 text-center py-4">{smartAssignResult?.reason || 'No suitable driver found'}</p>
            )}
          </div>
        </div>
      )}

      {showOptimizeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !aiAnalyzing && setShowOptimizeModal(false)} />
          <div className="bg-[#161b22] w-full max-w-md rounded-xl p-6 shadow-2xl relative z-10 border border-white/10">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Wand2 size={18} className="text-indigo-400" /> Fleet Optimization
              </h2>
              {!aiAnalyzing && <button onClick={() => setShowOptimizeModal(false)} className="p-1.5 rounded-lg hover:bg-white/5"><X size={18} className="text-slate-400" /></button>}
            </div>
            {aiAnalyzing ? (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="w-10 h-10 border-3 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-3" />
                <p className="text-sm font-medium text-slate-400">Optimizing fleet...</p>
              </div>
            ) : (
              <button
                onClick={() => { triggerFleetOptimization(); setTimeout(() => setShowOptimizeModal(false), 3000); }}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition flex items-center justify-center gap-2"
              >
                <Zap size={16} /> Run Optimization
              </button>
            )}
          </div>
        </div>
      )}

      {/* Trip Details Modal */}
      {tripDetails && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={() => setTripDetails(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="bg-[#161b22] w-full max-w-lg rounded-xl shadow-2xl relative z-10 border border-white/10 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-[#161b22] border-b border-white/5 px-5 py-3 flex items-center justify-between z-10">
              <h3 className="text-sm font-bold text-white">Trip Details</h3>
              <button onClick={() => setTripDetails(null)} className="p-1.5 rounded-lg hover:bg-white/5 transition"><X size={16} className="text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-base font-bold text-white">{tripDetails.patient}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{tripDetails.bookingId || 'No booking ID'}</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                  tripDetails.status === 'Unassigned' ? 'bg-rose-500/15 text-rose-400' :
                  tripDetails.status === 'Assigned' ? 'bg-blue-500/15 text-blue-400' :
                  tripDetails.status === 'Completed' ? 'bg-emerald-500/15 text-emerald-400' :
                  'bg-slate-500/15 text-slate-400'
                }`}>{tripDetails.status}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/[0.02] rounded-lg p-2.5 border border-white/5">
                  <p className="text-[10px] text-slate-500 font-medium uppercase">Time</p>
                  <p className="text-sm font-bold text-white mt-0.5">{tripDetails.time || '—'}</p>
                </div>
                <div className="bg-white/[0.02] rounded-lg p-2.5 border border-white/5">
                  <p className="text-[10px] text-slate-500 font-medium uppercase">Date</p>
                  <p className="text-sm font-bold text-white mt-0.5">{tripDetails.date || '—'}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[8px] font-black text-white">P</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Pickup</p>
                    <p className="text-xs font-medium text-slate-300 mt-0.5">{tripDetails.pickup || '—'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[8px] font-black text-white">D</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Dropoff</p>
                    <p className="text-xs font-medium text-slate-300 mt-0.5">{tripDetails.dropoff || '—'}</p>
                  </div>
                </div>
              </div>

              {(tripDetails.driverName || tripDetails.driverId) && (
                <div className="bg-white/[0.02] rounded-lg p-2.5 border border-white/5">
                  <p className="text-[10px] text-slate-500 font-medium uppercase">Driver</p>
                  <p className="text-sm font-bold text-white mt-0.5">{tripDetails.driverName || drivers.find(d => d.id === tripDetails.driverId)?.name || '—'}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{drivers.find(d => d.id === tripDetails.driverId)?.vehicle || ''}</p>
                </div>
              )}

              {tripDetails.notes && (
                <div className="bg-amber-500/10 rounded-lg p-2.5 border border-amber-500/20">
                  <p className="text-[10px] text-amber-400 font-medium uppercase">Notes</p>
                  <p className="text-xs text-amber-300 mt-0.5">{tripDetails.notes}</p>
                </div>
              )}

              <div className="pt-2 border-t border-white/5">
                <p className="text-[10px] text-slate-600 font-mono">Trip ID: {tripDetails.id}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="bg-[#161b22] w-full max-w-sm rounded-xl p-6 shadow-2xl relative z-10 border border-white/10">
            <h3 className="text-base font-bold text-white mb-4">Authenticate</h3>
            <form onSubmit={submitAuthAction}>
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 mb-3"
                autoFocus
              />
              {reAuthError && <p className="text-xs text-rose-400 mb-3">{reAuthError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAuthModal(false)} className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm font-medium transition">Cancel</button>
                <button type="submit" className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition">Confirm</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnterpriseDashboard;
