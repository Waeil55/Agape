import React, { useState, useEffect, useMemo, lazy, Suspense, Component } from 'react';
import {
  Map, ChevronLeft, Menu, BarChart2, Zap, Shield, X, MessageCircle, Home, Search
} from 'lucide-react';
import { localCalendarYmd } from '../utils/tripDate';
import { useChat } from '../hooks/useChat';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err) { console.error('[MobileUI] Error:', err); }
  render() {
    return this.state.hasError
      ? <div className="flex flex-col items-center justify-center h-32 gap-2 px-4 text-center">
          <div className="text-red-400 text-sm font-semibold">Something went wrong</div>
          <button onClick={() => this.setState({ hasError: false })} className="text-xs text-blue-600 font-semibold">Try again</button>
        </div>
      : this.props.children;
  }
}

const AdminPage = lazy(() => import('./AdminPage'));
const ReportsPage = lazy(() => import('./ReportsPage'));
const LiveMapPage = lazy(() => import('./LiveMapPage'));
const ChatPage = lazy(() => import('./chat/ChatPage').then(m => ({ default: m.ChatPage })));
const DriverPage = lazy(() => import('./DriverPage'));
const TripsPage = lazy(() => import('./TripsPage'));

const MobileMenuPage = lazy(() => import('./MobileMenuPage'));
const SettingsPage = lazy(() => import('./SettingsPage'));
const DriversVehiclesPage = lazy(() => import('./DriversVehiclesPage'));
const DriverToolsPage = lazy(() => import('./DriverToolsPage'));
const PayrollReportPage = lazy(() => import('./PayrollReportPage'));
const TimeTrackingAdmin = lazy(() => import('./TimeTrackingAdmin'));

const FileUploadTrips = lazy(() => import('./FileUploadTrips'));
const RoutePlannerPage = lazy(() => import('./RoutePlannerPage'));
const GlobalEntitySearch = lazy(() => import('./GlobalEntitySearch'));

const MobileFallback = () => (
  <div className="flex items-center justify-center h-32">
    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

export const MOBILE_PRIMARY_NAV = Object.freeze([
  { id: 'trips', label: 'Trips', icon: Home },
  { id: 'map', label: 'Map', icon: Map },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'reports', label: 'Reports', icon: BarChart2 },
  { id: 'menu', label: 'More', icon: Menu },
]);

const NAV_BOTTOM_CLEARANCE = 'calc(76px + env(safe-area-inset-bottom, 0px))';

const scheduleIdleWork = (callback) => {
  if (typeof window === 'undefined') return () => {};
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(callback, { timeout: 1200 });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(callback, 32);
  return () => window.clearTimeout(id);
};

const readStoredToolsDriverId = () => {
  try { return window.localStorage.getItem('agape_toolsDriverId') || ''; } catch { return ''; }
};

const writeStoredToolsDriverId = (driverId) => {
  try {
    if (driverId) window.localStorage.setItem('agape_toolsDriverId', driverId);
    else window.localStorage.removeItem('agape_toolsDriverId');
  } catch {}
};

export const SubViewWrapper = ({ title, onBack, children, fullHeight = false, renderTopBar }) => (
  <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50">
    {renderTopBar(title, true, onBack)}
    <div
      className={`flex-1 ${fullHeight ? 'relative overflow-hidden' : 'overflow-y-auto overscroll-contain px-4 py-4 pb-24'}`}
      style={{ paddingBottom: fullHeight ? undefined : NAV_BOTTOM_CLEARANCE }}
    >
      {children}
    </div>
  </div>
);

export const MobileBottomNavigation = React.memo(({ currentView, subView, onNavigate }) => {
  const { unreadCount } = useChat({ alerts: true });
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      <div className="relative flex h-full items-center justify-around gap-1 px-2">
        {MOBILE_PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === 'menu'
            ? currentView === 'menu' || Boolean(subView)
            : currentView === item.id && !subView;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400'}`}
            >
              <span className="relative inline-flex">
                <Icon size={23} strokeWidth={isActive ? 2 : 1.55} aria-hidden="true" />
                {item.id === 'chat' && unreadCount > 0 && (
                  <span className="absolute -right-3 -top-2 min-w-[18px] rounded-full bg-blue-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </span>
              <span className="mt-1 max-w-full truncate text-[10px] font-semibold leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});
MobileBottomNavigation.displayName = 'MobileBottomNavigation';

const MobileEnterpriseDashboard = (props) => {
  const { trips = [], drivers = [], currentUser, role } = props;
  const [currentView, setCurrentView] = useState('trips');
  const [subView, setSubView] = useState(null);
  const [isChatThreadOpen, setIsChatThreadOpen] = useState(false);
  const [tripDetails, setTripDetails] = useState(null);
  const [tripWorkflowActive, setTripWorkflowActive] = useState(false);
  const [reportsSection, setReportsSection] = useState(() => {
    try { return window.localStorage.getItem('agape_reportsSection') || 'trips'; } catch { return 'trips'; }
  });
  const [bulkAssignModal, setBulkAssignModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [toolsDriverId, setToolsDriverId] = useState('');
  const [toolSelectedTrips, setToolSelectedTrips] = useState([]);
  const [toolAiSequence, setToolAiSequence] = useState(null);
  const [toolAiSuggestions, setToolAiSuggestions] = useState([]);
  const [toolAiOptimizing, setToolAiOptimizing] = useState(false);
  const [toolGuidedMode, setToolGuidedMode] = useState(false);
  const [toolGuidedStepIndex, setToolGuidedStepIndex] = useState(0);
  const [toolRoutePlanStops, setToolRoutePlanStops] = useState(null);
  const driverWorkDrivers = props.driverWorkDrivers?.length ? props.driverWorkDrivers : drivers;
  const driverWorkTrips = props.driverWorkTrips?.length ? props.driverWorkTrips : trips;

  const handleNavClick = (view) => {
    setCurrentView(view);
    setSubView(null);
    if (view === 'reports') setReportsSection('trips');
  };

  const VALID_VIEWS = ['trips', 'map', 'reports', 'tools', 'menu', 'chat'];
  useEffect(() => {
    if (!VALID_VIEWS.includes(currentView)) setCurrentView('map');
  }, [currentView]);

  useEffect(() => scheduleIdleWork(() => {
    setToolsDriverId(readStoredToolsDriverId());
  }), []);

  useEffect(() => scheduleIdleWork(() => {
    writeStoredToolsDriverId(toolsDriverId);
  }), [toolsDriverId]);

  useEffect(() => {
    setToolSelectedTrips([]);
    setToolAiSequence(null);
    setToolAiSuggestions([]);
    setToolGuidedMode(false);
    setToolGuidedStepIndex(0);
    setToolRoutePlanStops(null);
  }, [toolsDriverId]);

  const toolsDriver = useMemo(
    () => (toolsDriverId ? driverWorkDrivers.find((driver) => driver.id === toolsDriverId) || null : null),
    [driverWorkDrivers, toolsDriverId],
  );
  const toolsTrips = useMemo(() => {
    if (!toolsDriver) return [];
    const driverEmail = String(toolsDriver.email || '').trim().toLowerCase();
    return driverWorkTrips.filter((trip) => (
      trip.driverId === toolsDriver.id
      || trip.driverName === toolsDriver.name
      || (driverEmail && String(trip.driverEmail || '').trim().toLowerCase() === driverEmail)
    ));
  }, [driverWorkTrips, toolsDriver]);
  const toolsActiveTrips = useMemo(
    () => toolsTrips.filter((trip) => !['Completed', 'Canceled', 'Cancelled', 'Archived'].includes(trip.status)),
    [toolsTrips],
  );
  const toolSelectedTripIdSet = useMemo(() => new Set(toolSelectedTrips), [toolSelectedTrips]);

  useEffect(() => {
    const activeIds = toolsActiveTrips.map((trip) => trip.id);
    const activeIdSet = new Set(activeIds);
    setToolSelectedTrips((current) => {
      const stillActive = current.filter((id) => activeIdSet.has(id));
      return stillActive.length ? stillActive : activeIds;
    });
  }, [toolsActiveTrips]);
  const selectAllToolTrips = () => setToolSelectedTrips((current) => (
    current.length === toolsActiveTrips.length ? [] : toolsActiveTrips.map((trip) => trip.id)
  ));
  const optimizeToolTrips = () => {
    const candidates = toolsActiveTrips.filter((trip) => toolSelectedTripIdSet.has(trip.id));
    if (!candidates.length) return;
    setToolAiOptimizing(true);
    const ordered = [...candidates].sort((a, b) => String(a.time || a.pickupTime || '').localeCompare(String(b.time || b.pickupTime || '')));
    setToolAiSequence(ordered.map((trip) => trip.id));
    setToolAiSuggestions([{ type: 'route', message: `${ordered.length} trips ordered by scheduled pickup time.` }]);
    setToolAiOptimizing(false);
  };



  const getProfileTitle = () => {
    return role === 'admin' ? 'Agape Care Admin' : 'Agape Care Dispatch';
  };

  // Top bar with back navigation
  const renderTopBar = (title, showBack = false, onBack = null) => (
        <div className="driver-page-header shrink-0 z-30 border-b border-slate-200 bg-[var(--bg-app)]">
      <div className="px-3 py-3 flex items-center gap-3">
        {showBack && (
          <button
            type="button"
            onClick={onBack || (() => setSubView(null))}
            aria-label="Back"
            className="min-w-11 min-h-11 flex items-center justify-center -ml-1.5 text-slate-500 hover:text-slate-800 rounded-full bg-slate-200/50 touch-manipulation transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
          <img src="/agape.png" alt="Agape Care" className="w-8 h-8 object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-[15px] font-extrabold text-slate-900 leading-none tracking-tight truncate">{getProfileTitle()}</p>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <p className="text-xs font-medium text-slate-500 truncate">{title}</p>
          </div>
        </div>
        <button type="button" onClick={() => setGlobalSearchOpen(true)} aria-label="Search all operational records" className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-blue-700 shadow-sm">
          <Search size={19} />
        </button>
        {/* Role badge */}
        <div className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide ${
          role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
        }`}>
          <Shield size={10} />
          {role === 'admin' ? 'Admin' : 'Dispatch'}
        </div>
      </div>
    </div>
  );



  // Common layout wrapper for subviews — always shows bottom nav below
  // paddingBottom ensures scroll content clears the fixed bottom nav pill
  const renderContent = () => {
    // ── Sub-views (from Menu) ─────────────────────────────────────────────────
    if (subView === 'route_planner') {
      return (
        <SubViewWrapper title="AI Route Planner" fullHeight renderTopBar={renderTopBar}>
          <ErrorBoundary>
            <Suspense fallback={<MobileFallback />}>
              <RoutePlannerPage
                trips={trips}
                drivers={drivers}
                role={role}
                currentUser={currentUser}
              />
            </Suspense>
          </ErrorBoundary>
        </SubViewWrapper>
      );
    }

    if (subView === 'reports') {
      return (
        <SubViewWrapper title="Reports & Export" renderTopBar={renderTopBar}>
          <ErrorBoundary><Suspense fallback={<MobileFallback />}><ReportsPage {...props} initialSection={reportsSection} onSectionChange={setReportsSection} /></Suspense></ErrorBoundary>
        </SubViewWrapper>
      );
    }

    if (subView === 'admin') {
      return (
        <SubViewWrapper title="User Management" renderTopBar={renderTopBar}>
          <ErrorBoundary><Suspense fallback={<MobileFallback />}><AdminPage {...props} /></Suspense></ErrorBoundary>
        </SubViewWrapper>
      );
    }

    if (subView === 'archives') {
      return (
        <SubViewWrapper title="Reports & Records" renderTopBar={renderTopBar}>
          <ErrorBoundary><Suspense fallback={<MobileFallback />}><ReportsPage {...props} initialSection="archive" onSectionChange={setReportsSection} /></Suspense></ErrorBoundary>
        </SubViewWrapper>
      );
    }

    if (subView === 'settings') {
      return (
        <SubViewWrapper title="App Settings" renderTopBar={renderTopBar}>
          <ErrorBoundary>
            <Suspense fallback={<MobileFallback />}>
              <SettingsPage
                {...props}
                onResetSystem={() => {
                  props.setTrips?.([]);
                  props.setTrashedTrips?.([]);
                  props.setDrivers?.([]);
                  props.setLogs?.([{ t: 'System Reset', d: 'Administrator wiped all operational data.', c: 'rose', type: 'system' }]);
                  props.addAuditLog?.('System Reset', 'Master data wipe performed by Admin.', 'rose');
                }}
              />
            </Suspense>
          </ErrorBoundary>
        </SubViewWrapper>
      );
    }

    if (subView === 'fleet') {
      return (
        <SubViewWrapper title="Fleet Management" renderTopBar={renderTopBar}>
          <ErrorBoundary><Suspense fallback={<MobileFallback />}><DriversVehiclesPage {...props} /></Suspense></ErrorBoundary>
        </SubViewWrapper>
      );
    }

    if (subView === 'map') {
      return (
        <SubViewWrapper title="Live Map" fullHeight renderTopBar={renderTopBar}>
          <ErrorBoundary><Suspense fallback={<MobileFallback />}><LiveMapPage trips={trips} drivers={drivers} /></Suspense></ErrorBoundary>
        </SubViewWrapper>
      );
    }

    if (subView === 'payroll') {
      return (
        <SubViewWrapper title="Payroll" renderTopBar={renderTopBar}>
          <ErrorBoundary><Suspense fallback={<MobileFallback />}><PayrollReportPage drivers={drivers} trips={trips} driverTelemetry={props.driverTelemetry || []} timeTrackingDeclarations={props.timeTrackingDeclarations || []} /></Suspense></ErrorBoundary>
        </SubViewWrapper>
      );
    }

    if (subView === 'activity') {
      return (
        <SubViewWrapper title="Activity Log" renderTopBar={renderTopBar}>
          <ErrorBoundary><Suspense fallback={<MobileFallback />}><TimeTrackingAdmin drivers={drivers} trips={trips} driverTelemetry={props.driverTelemetry || []} timeTrackingDeclarations={props.timeTrackingDeclarations || []} role={role} /></Suspense></ErrorBoundary>
        </SubViewWrapper>
      );
    }

    // ── Main Navigation Views ─────────────────────────────────────────────────



    if (currentView === 'reports') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50 min-h-0">
          {renderTopBar('Reports & Export')}
          <div className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom,0px))' }}>
            <ErrorBoundary><Suspense fallback={<MobileFallback />}><ReportsPage {...props} initialSection={reportsSection} onSectionChange={setReportsSection} /></Suspense></ErrorBoundary>
          </div>
        </div>
      );
    }



    if (currentView === 'map') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col relative bg-slate-50 min-h-0">
          {renderTopBar('Live Fleet Tracking')}
          <div className="flex-1 relative overflow-hidden" style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom,0px))' }}>
            <ErrorBoundary><Suspense fallback={<MobileFallback />}><LiveMapPage {...props} /></Suspense></ErrorBoundary>
          </div>
        </div>
      );
    }

    if (currentView === 'menu') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50 min-h-0">
          {renderTopBar('Settings & More')}
          <div className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom,0px))' }}>
            <ErrorBoundary>
              <Suspense fallback={<MobileFallback />}>
                <MobileMenuPage
                  {...props}
                  setSubView={(view) => {
                    if (view === 'tools') handleNavClick('tools');
                    else setSubView(view);
                  }}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      );
    }

    if (currentView === 'tools') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50 min-h-0">
          {renderTopBar('Route Tools')}
          <div className="shrink-0 bg-white border-b border-slate-200 px-3 py-2.5">
            <label className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 shrink-0">Plan for</span>
              <select
                value={toolsDriverId}
                onChange={e => setToolsDriverId(e.target.value)}
                className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-colors"
              >
                <option value="">Select a driver…</option>
                {driverWorkDrivers.map(d => (
                  <option key={d.id || d.email} value={d.id}>
                    {d.name || d.email || d.id} {d.vehicle ? `— ${d.vehicle}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom,0px))' }}>
            {toolsDriver ? (
              <ErrorBoundary>
                <Suspense fallback={<MobileFallback />}>
                  <DriverToolsPage
                    trips={toolsTrips}
                    activeTrips={toolsActiveTrips}
                    aiSequence={toolAiSequence}
                    aiSuggestions={toolAiSuggestions}
                    aiRideShare={[]}
                    conflicts={[]}
                    aiOptimizing={toolAiOptimizing}
                    guidedMode={toolGuidedMode}
                    guidedStepIndex={toolGuidedStepIndex}
                    guidedSteps={toolAiSequence || []}
                    driverPosition={null}
                    appSettings={props.appSettings}
                    currentUser={toolsDriver.email || toolsDriver.id || currentUser}
                    role={role}
                    onSetGuidedMode={setToolGuidedMode}
                    onSetGuidedStepIndex={setToolGuidedStepIndex}
                    onSetAiSequence={setToolAiSequence}
                    onSetAiSuggestions={setToolAiSuggestions}
                    onRunAiOptimization={optimizeToolTrips}
                    onSelectAllTrips={selectAllToolTrips}
                    selectedTrips={toolSelectedTrips}
                    onSetSelectedTrips={setToolSelectedTrips}
                    etas={{}}
                    onOpenInNav={props.onOpenInNav}
                    onOpenSequencer={() => setSubView('route_planner')}
                    requestAuthAction={props.requestAuthAction}
                    routePlanStops={toolRoutePlanStops}
                    onSetRoutePlanStops={setToolRoutePlanStops}
                    onSendToSequencer={(stops) => { setToolRoutePlanStops(stops); setSubView('route_planner'); }}
                  />
                </Suspense>
              </ErrorBoundary>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
                  <Zap size={28} className="opacity-30" />
                </div>
                <p className="text-sm font-semibold text-slate-500">Select a driver above</p>
                <p className="text-xs text-slate-400 mt-1 text-center max-w-[220px]">
                  Choose a driver to plan routes, optimize trips, and navigate
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (currentView === 'chat') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-white min-h-0 relative">
          <ErrorBoundary>
            <Suspense fallback={<MobileFallback />}>
              <ChatPage onThreadActive={setIsChatThreadOpen} />
            </Suspense>
          </ErrorBoundary>
        </div>
      );
    }

    if (subView === 'welltrans') {
      return (
        <SubViewWrapper title="Reports & Records" fullHeight renderTopBar={renderTopBar}>
          <ErrorBoundary><Suspense fallback={<MobileFallback />}><ReportsPage {...props} initialSection="portal" onSectionChange={setReportsSection} /></Suspense></ErrorBoundary>
        </SubViewWrapper>
      );
    }

    if (currentView === 'trips') {
      const selectedTasks = props.selectedTasks || [];
      const toggleTaskSelection = (tripId) => props.setSelectedTasks?.(current => (
        current.includes(tripId) ? current.filter(id => id !== tripId) : [...current, tripId]
      ));
      return (
        <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
          {renderTopBar('Dispatch Manifest')}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2" style={{ paddingBottom: 'calc(84px + env(safe-area-inset-bottom,0px))' }}>
            <ErrorBoundary><Suspense fallback={<MobileFallback />}><TripsPage
              trips={driverWorkTrips}
              role={role}
              currentUser={currentUser}
              drivers={driverWorkDrivers}
              selectedTasks={selectedTasks}
              toggleTaskSelection={toggleTaskSelection}
              onCreateLegMission={props.createLegMission}
              onBulkAssignTrips={props.bulkAssignTrips}
              onAssignTrip={props.assignTripToDriver}
              onUnassignTrip={(tripId) => props.assignTripToDriver?.(tripId, '')}
              onDriveTrip={(trip) => { setTripWorkflowActive(true); setTripDetails(trip); }}
              onAddTrip={props.addTrip}
              onUpdateTrip={props.updateTrip || props.onUpdateDriverTrip}
              onDeleteTrip={props.requestDeleteTrip}
            /></Suspense></ErrorBoundary>
          </div>
        </div>
      );
    }

    return null;
  };

  // Show the bottom nav everywhere EXCEPT:
  // 1. When a trip detail overlay is open (full-screen DriverPage)
  // 2. When a chat thread is open inside chat view (thread takes full screen)
  const showNav = !tripDetails && !isChatThreadOpen && subView !== 'admin';



  return (
    <div className="mobile-enterprise-dashboard-wrapper w-full h-full bg-white flex flex-col relative overflow-hidden">

      {/* ── Trip Detail Overlay: opens full DriverPage for any trip ── */}
      {tripDetails && (() => {
        const trip = tripDetails;
        // Find driver for this trip — use their email so DriverPage loads their profile
        const driverObj = drivers.find(d =>
          d.id === trip.driverId ||
          (trip.driverName && d.name === trip.driverName) ||
          (trip.driverEmail && (d.email || '').toLowerCase() === trip.driverEmail.toLowerCase())
        );
        // Use driver email so DriverPage finds the trip; role stays admin/dispatcher for full feature access
        const driverEmail = driverObj?.email || trip.driverEmail || currentUser;
        return (
          <div className="fixed inset-0 z-[200] flex flex-col bg-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
            {/* Back bar — styled like a top navigation bar */}
            <div className="shrink-0 flex items-center gap-2.5 px-3 py-2.5 bg-white border-b border-slate-200 shadow-sm">
              <button
                onClick={() => setTripDetails(null)}
                className="flex items-center gap-1.5 min-w-[44px] min-h-[44px] text-blue-600 active:text-blue-800 transition-colors touch-manipulation"
                aria-label="Back to dispatch board"
              >
                <ChevronLeft size={20} strokeWidth={2} />
                <span className="text-sm font-semibold">Back</span>
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate leading-tight">{trip.patient || 'Trip Details'}</p>
                <p className="text-[10px] text-slate-400 font-semibold">{trip.bookingId ? `#${trip.bookingId}` : trip.id} · {trip.status || 'Open'}</p>
              </div>
              <div className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide ${
                role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {role === 'admin' ? 'Admin' : 'Dispatch'}
              </div>
            </div>
            {/* Full DriverPage embedded — role='admin'/'dispatcher' unlocks all admin controls inside DriverPage */}
            <div className="min-h-0 flex-1 overflow-hidden">
              <ErrorBoundary>
                <Suspense fallback={<MobileFallback />}>
                  <DriverPage
                    {...props}
                    currentUser={driverEmail}
                    role={role}
                    drivers={drivers}
                    allDrivers={props.allDrivers || drivers}
                    trips={trips}
                    isEmbedded={true}
                    defaultTripId={tripWorkflowActive ? trip.id : null}
                    initialShowDetailsId={!tripWorkflowActive ? trip.id : null}
                    onUpdateTrip={props.updateTrip || props.onUpdateDriverTrip}
                    onCompleteTrip={props.onCompleteTrip}
                    onDriverStatusUpdate={props.onDriverStatusUpdate}
                    onUpdateClockEvents={props.onUpdateClockEvents}
                    onUpdateHourlyRate={props.onUpdateHourlyRate}
                    onLogout={() => { setTripDetails(null); setTripWorkflowActive(false); }}
                    onEmbeddedClose={() => { setTripDetails(null); setTripWorkflowActive(false); }}
                    onOpenSettings={() => { setTripDetails(null); setTripWorkflowActive(false); setSubView('settings'); }}
                    appSettings={props.appSettings}
                    phoneNumbers={props.phoneNumbers || {}}
                    onUpdateDriverLocation={props.handleUpdateDriverLocation || props.updateDriverLocation}
                    onUpdateAppSettings={props.updateAppSettings}
                    onAddAuditLog={props.addAuditLog}
                    requestAuthAction={props.requestAuthAction}
                    assignTripToDriver={props.assignTripToDriver}
                    requestDeleteTrip={props.requestDeleteTrip}
                    bulkAssignTrips={props.bulkAssignTrips}
                    dispatchers={props.dispatchers || []}
                    driverAssignments={props.driverAssignments || []}
                    assignmentUnreadCount={props.assignmentUnreadCount || 0}

                    onAcknowledgeAssignment={props.onAcknowledgeAssignment || (() => {})}
                    onAcceptAssignment={props.onAcceptAssignment || (() => {})}
                    onAddTrip={props.addTrip}
                    showAddTripModal={props.showAddTripModal}
                    setShowAddTripModal={props.setShowAddTripModal}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          </div>
        );
      })()}

      {/* ── Main Content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {renderContent()}
      </div>

      {/* ── Spacer so content isn't hidden behind the fixed bottom nav ── */}
      {showNav && (
        <div className="shrink-0" style={{ height: 'calc(56px + 8px + env(safe-area-inset-bottom, 0px))' }} aria-hidden="true" />
      )}

      {/* ── BOTTOM NAVIGATION ────────────────────────────────────────── */}
      {showNav && (
        <MobileBottomNavigation currentView={currentView} subView={subView} onNavigate={handleNavClick} />
      )}

      {globalSearchOpen && (
        <div className="fixed inset-0 z-[270] flex flex-col bg-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <Suspense fallback={<MobileFallback />}>
            <GlobalEntitySearch
              autoFocus
              trips={trips}
              trashedTrips={props.trashedTrips || []}
              drivers={drivers}
              vehicles={props.vehicles || []}
              onClose={() => setGlobalSearchOpen(false)}
              onSelect={(result) => {
                setGlobalSearchOpen(false);
                if (result.type === 'trip') {
                  setCurrentView('trips');
                  setSubView(null);
                  setTripDetails(result.record);
                  setTripWorkflowActive(false);
                } else if (result.type === 'archive') {
                  setReportsSection('archive');
                  setCurrentView('reports');
                  setSubView(null);
                } else {
                  setCurrentView('menu');
                  setSubView('admin');
                }
              }}
            />
          </Suspense>
        </div>
      )}

      {showUploadModal && (
        <div className="fixed inset-0 z-[250] bg-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">Upload & OCR Trips</h3>
            <button onClick={() => setShowUploadModal(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <ErrorBoundary>
              <Suspense fallback={<MobileFallback />}>
                <FileUploadTrips
                  {...props}
                  onClose={() => setShowUploadModal(false)}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      )}

      {bulkAssignModal && (
        <div className="fixed inset-0 z-[250] bg-black/60 flex items-center justify-center p-6" onClick={() => setBulkAssignModal(false)}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-sm font-bold text-slate-900">Bulk Assign Active Trips</h3>
              <button onClick={() => setBulkAssignModal(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Assign all currently unassigned trips for today to a single driver.
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {driverWorkDrivers.map(d => (
                <button
                  key={d.id}
                  onClick={() => {
                    if (props.bulkAssignTrips) props.bulkAssignTrips(d.id);
                    setBulkAssignModal(false);
                    if (props.addToast) props.addToast('Bulk Assignment', `All unassigned trips assigned to ${d.name || d.email}.`, 'success');
                  }}
                  className="w-full text-left px-4 py-2.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl text-xs font-semibold text-slate-800 transition"
                >
                  {d.name || d.email} {d.vehicle ? `(${d.vehicle})` : ''}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default React.memo(MobileEnterpriseDashboard);
