import React, { useMemo, useState, useEffect, lazy, Suspense, Component } from 'react';
import {
  Home, Map, MessageCircle, ChevronLeft, User, Menu, Truck, BarChart2, Zap,
  Shield, Bell, Settings as SettingsIcon, Users, FileText, Clock, Archive,
  Activity, CreditCard, MapPin, X, ChevronRight
} from 'lucide-react';
import { tripCalendarDateKey, localCalendarYmd } from '../utils/tripDate';

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

const DriverPage = lazy(() => import('./DriverPage'));
const AdminPage = lazy(() => import('./AdminPage'));
const ReportsPage = lazy(() => import('./ReportsPage'));
const LiveMapPage = lazy(() => import('./LiveMapPage'));
const MobileDispatchView = lazy(() => import('./MobileDispatchView'));
const MobileMenuPage = lazy(() => import('./MobileMenuPage'));
const ArchivesPage = lazy(() => import('./ArchivesPage'));
const SettingsPage = lazy(() => import('./SettingsPage'));
const DriversVehiclesPage = lazy(() => import('./DriversVehiclesPage'));
const DriverToolsPage = lazy(() => import('./DriverToolsPage'));
const PayrollReportPage = lazy(() => import('./PayrollReportPage'));
const TimeTrackingAdmin = lazy(() => import('./TimeTrackingAdmin'));
import { getDriverLiveStatus } from '../constants/statuses';
const ChatPage = lazy(() => import('./chat').then(m => ({ default: m.ChatPage })));
const FileUploadTrips = lazy(() => import('./FileUploadTrips'));
const RoutePlannerPage = lazy(() => import('./RoutePlannerPage'));

const MobileFallback = () => (
  <div className="flex items-center justify-center h-32">
    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

const MobileEnterpriseDashboard = (props) => {
  const { trips = [], drivers = [], currentUser, role, onLogout, chatUnreadCount = 0 } = props;
  const [currentView, setCurrentView] = useState('trips');
  const [subView, setSubView] = useState(null);
  const [dispatchWorkspaceMode, setDispatchWorkspaceMode] = useState('board');
  const [isChatThreadOpen, setIsChatThreadOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [tripDetails, setTripDetails] = useState(null);
  const [tripWorkflowActive, setTripWorkflowActive] = useState(false);
  const [bulkAssignModal, setBulkAssignModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [toolsDriverId, setToolsDriverId] = useState(() => localStorage.getItem('agape_toolsDriverId') || '');
  const driverWorkDrivers = props.driverWorkDrivers?.length ? props.driverWorkDrivers : drivers;
  const driverWorkTrips = props.driverWorkTrips?.length ? props.driverWorkTrips : trips;
  const [driverWorkDriverId, setDriverWorkDriverId] = useState(() => localStorage.getItem('agape_mobileDriverWorkDriverId') || 'all');

  const todayKey = useMemo(() => localCalendarYmd(), []);

  const expandedTripInfo = useMemo(() => {
    if (!expandedId) return null;
    const trip = trips.find(t => t.id === expandedId);
    if (!trip) return null;
    const patientName = trip.patient || '';
    const nameParts = patientName.trim().split(/\s+/).filter(Boolean);
    return {
      trip,
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      showStackedName: currentView === 'trips',
    };
  }, [expandedId, trips, currentView]);

  const activeDriverWorkDriver = useMemo(() => {
    if (driverWorkDriverId === 'all') return null;
    if (!driverWorkDrivers?.length) return null;
    return driverWorkDrivers.find((driver) => driver.id === driverWorkDriverId) || driverWorkDrivers[0];
  }, [driverWorkDriverId, driverWorkDrivers]);

  useEffect(() => {
    if (driverWorkDriverId === 'all') return;
    if (activeDriverWorkDriver?.id && activeDriverWorkDriver.id !== driverWorkDriverId) {
      setDriverWorkDriverId(activeDriverWorkDriver.id);
    }
  }, [activeDriverWorkDriver?.id, driverWorkDriverId]);

  useEffect(() => {
    if (driverWorkDriverId) localStorage.setItem('agape_mobileDriverWorkDriverId', driverWorkDriverId);
  }, [driverWorkDriverId]);

  useEffect(() => {
    if (dispatchWorkspaceMode === 'operate' && driverWorkDriverId === 'all' && driverWorkDrivers[0]?.id) {
      setDriverWorkDriverId(driverWorkDrivers[0].id);
    }
  }, [dispatchWorkspaceMode, driverWorkDriverId, driverWorkDrivers]);

  const activeDriverWorkTrips = useMemo(() => {
    if (driverWorkDriverId === 'all') return driverWorkTrips || [];
    if (!activeDriverWorkDriver) return [];
    const driverEmail = String(activeDriverWorkDriver.email || '').trim().toLowerCase();
    return (driverWorkTrips || []).filter((trip) => (
      trip.driverId === activeDriverWorkDriver.id ||
      trip.driverName === activeDriverWorkDriver.name ||
      String(trip.driverEmail || '').trim().toLowerCase() === driverEmail ||
      drivers.find((driver) => driver.id === trip.driverId)?.email === activeDriverWorkDriver.email
    ));
  }, [activeDriverWorkDriver, driverWorkDriverId, driverWorkTrips, drivers]);

  const handleNavClick = (view) => {
    setCurrentView(view);
    setSubView(null);
    setExpandedId(null);
  };

  const VALID_VIEWS = ['trips', 'map', 'reports', 'chat', 'tools', 'menu'];
  useEffect(() => {
    if (!VALID_VIEWS.includes(currentView)) setCurrentView('trips');
  }, [currentView]);

  useEffect(() => {
    if (toolsDriverId) localStorage.setItem('agape_toolsDriverId', toolsDriverId);
  }, [toolsDriverId]);

  useEffect(() => {
    const openChat = () => {
      setCurrentView('chat');
      setSubView(null);
    };
    if (sessionStorage.getItem('agape_open_chat_channel')) openChat();
    window.addEventListener('agape:open-chat', openChat);
    return () => window.removeEventListener('agape:open-chat', openChat);
  }, []);

  const getProfileTitle = () => {
    return role === 'admin' ? 'Agape Care Admin' : 'Agape Care Dispatch';
  };

  // Top bar with back navigation
  const renderTopBar = (title, showBack = false, onBack = null) => (
    <div className="driver-page-header shrink-0 z-30 border-b border-slate-200/70 bg-[var(--bg-app)]/95 backdrop-blur-md">
      <div className="px-3 py-3 flex items-center gap-3">
        {showBack && (
          <button
            onClick={onBack || (() => setSubView(null))}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center -ml-1.5 text-slate-500 hover:text-slate-800 rounded-full bg-slate-200/50 touch-manipulation transition-all"
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

  const renderDispatchWorkspaceControls = () => {
    const selectedDriver = activeDriverWorkDriver;
    const scopedTripCount = activeDriverWorkTrips.filter((trip) => tripCalendarDateKey(trip.date) === todayKey || !trip.date).length;
    const workspaceModes = [
      { id: 'board', label: 'Board', count: scopedTripCount },
      { id: 'drivers', label: 'Drivers', count: driverWorkDriverId === 'all' ? driverWorkDrivers.length : (selectedDriver ? 1 : 0) },
      { id: 'operate', label: 'Drive As', count: selectedDriver ? scopedTripCount : 0 },
    ];

    return (
      <div className="mobile-ops-workspace">
        <div className="mobile-ops-modebar" role="tablist" aria-label="Mobile operations workspace">
          {workspaceModes.map((mode) => {
            const active = dispatchWorkspaceMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => {
                  setDispatchWorkspaceMode(mode.id);
                  if (mode.id === 'board' || mode.id === 'drivers') {
                    setDriverWorkDriverId('all');
                  } else if (mode.id === 'operate') {
                    if (driverWorkDriverId === 'all' && driverWorkDrivers[0]?.id) {
                      setDriverWorkDriverId(driverWorkDrivers[0].id);
                    }
                  }
                }}
                className={`mobile-ops-mode ${active ? 'is-active' : ''}`}
              >
                <span>{mode.label}</span>
                <strong>{mode.count}</strong>
              </button>
            );
          })}
        </div>

        {driverWorkDrivers.length > 0 && (
          <label className="mobile-ops-driver-filter">
            <span>{dispatchWorkspaceMode === 'operate' ? 'Operating driver' : 'Driver scope'}</span>
            <select
              value={dispatchWorkspaceMode === 'operate' && driverWorkDriverId === 'all' ? (driverWorkDrivers[0]?.id || '') : driverWorkDriverId}
              onChange={(event) => setDriverWorkDriverId(event.target.value)}
            >
              {dispatchWorkspaceMode !== 'operate' && <option value="all">All drivers</option>}
              {driverWorkDrivers.map((driver) => (
                <option key={driver.id || driver.email || driver.name} value={driver.id}>
                  {driver.name || driver.email || driver.id} {driver.vehicle ? `- ${driver.vehicle}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    );
  };

  const renderDriverWorkPanel = () => {
    if (!activeDriverWorkDriver) {
      return (
        <div className="mobile-driver-work-empty">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <Truck size={26} />
          </div>
          <p className="text-sm font-semibold text-slate-700">Select a driver to operate</p>
          <p className="mt-1 text-xs font-semibold text-slate-400">Admins and dispatchers can view all work in Board mode, then choose one driver here.</p>
        </div>
      );
    }

    const liveStatus = getDriverLiveStatus(activeDriverWorkDriver);
    return (
      <div className="mobile-driver-work-panel">
        <div className="mobile-driver-work-header">
          <div className="min-w-0">
            <p>{role === 'admin' ? 'Admin Driver Work' : 'Dispatcher Driver Work'}</p>
            <h2>Operate as {activeDriverWorkDriver.name || activeDriverWorkDriver.email || 'driver'}</h2>
          </div>
          <span className={liveStatus.color}>{liveStatus.label}</span>
        </div>
        <div className="min-h-0 flex-1">
          <ErrorBoundary>
            <Suspense fallback={<MobileFallback />}>
              <DriverPage
                {...props}
                currentUser={activeDriverWorkDriver.email || activeDriverWorkDriver.id || currentUser}
                role="driver"
                drivers={drivers}
                allDrivers={props.allDrivers || drivers}
                trips={activeDriverWorkTrips}
                onUpdateTrip={props.onUpdateDriverTrip || props.updateTrip}
                onCompleteTrip={props.onCompleteTrip}
                onDriverStatusUpdate={props.onDriverStatusUpdate}
                onUpdateClockEvents={props.onUpdateClockEvents}
                onUpdateHourlyRate={props.onUpdateHourlyRate}
                onAddAuditLog={props.addAuditLog}
                onLogout={onLogout}
                requestAuthAction={props.requestAuthAction}
                appSettings={props.appSettings}
                phoneNumbers={props.phoneNumbers || {}}
                onUpdateDriverLocation={props.handleUpdateDriverLocation || props.updateDriverLocation}
                onUpdateAppSettings={props.updateAppSettings}
                onOpenSettings={() => setSubView('settings')}
                onAddTrip={props.addTrip}
                showAddTripModal={props.showAddTripModal}
                setShowAddTripModal={props.setShowAddTripModal}
                dispatchers={props.dispatchers || []}
                driverAssignments={props.driverAssignments || []}
                assignmentUnreadCount={props.assignmentUnreadCount || 0}
                chatUnreadCount={chatUnreadCount}
                onAcknowledgeAssignment={props.onAcknowledgeAssignment || (() => {})}
                onAcceptAssignment={props.onAcceptAssignment || (() => {})}
                isEmbedded
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    );
  };

  // Common layout wrapper for subviews — always shows bottom nav below
  // paddingBottom ensures scroll content clears the fixed bottom nav pill
  const NAV_BOTTOM_CLEARANCE = 'calc(76px + env(safe-area-inset-bottom, 0px))';
  const SubViewWrapper = ({ title, onBack, children, fullHeight = false }) => (
    <div className="flex-1 overflow-hidden flex flex-col bg-slate-50 min-h-0">
      {renderTopBar(title, true, onBack)}
      <div
        className={`flex-1 ${fullHeight ? 'overflow-hidden relative' : 'overflow-y-auto overscroll-contain px-4 py-4'}`}
        style={{ paddingBottom: fullHeight ? undefined : NAV_BOTTOM_CLEARANCE }}
      >
        {children}
      </div>
    </div>
  );

  const renderContent = () => {
    // ── Sub-views (from Menu) ─────────────────────────────────────────────────
    if (subView === 'route_planner') {
      return (
        <SubViewWrapper title="AI Route Planner" fullHeight>
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
        <SubViewWrapper title="Reports & Export">
          <ErrorBoundary><Suspense fallback={<MobileFallback />}><ReportsPage {...props} /></Suspense></ErrorBoundary>
        </SubViewWrapper>
      );
    }

    if (subView === 'admin') {
      return (
        <SubViewWrapper title="User Management">
          <ErrorBoundary><Suspense fallback={<MobileFallback />}><AdminPage {...props} /></Suspense></ErrorBoundary>
        </SubViewWrapper>
      );
    }

    if (subView === 'archives') {
      return (
        <SubViewWrapper title="Archives">
          <ErrorBoundary><Suspense fallback={<MobileFallback />}><ArchivesPage {...props} /></Suspense></ErrorBoundary>
        </SubViewWrapper>
      );
    }

    if (subView === 'settings') {
      return (
        <SubViewWrapper title="App Settings">
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
        <SubViewWrapper title="Fleet Management">
          <ErrorBoundary><Suspense fallback={<MobileFallback />}><DriversVehiclesPage {...props} /></Suspense></ErrorBoundary>
        </SubViewWrapper>
      );
    }

    if (subView === 'map') {
      return (
        <SubViewWrapper title="Live Map" fullHeight>
          <ErrorBoundary><Suspense fallback={<MobileFallback />}><LiveMapPage trips={trips} drivers={drivers} /></Suspense></ErrorBoundary>
        </SubViewWrapper>
      );
    }

    if (subView === 'payroll') {
      return (
        <SubViewWrapper title="Payroll">
          <ErrorBoundary><Suspense fallback={<MobileFallback />}><PayrollReportPage drivers={drivers} trips={trips} /></Suspense></ErrorBoundary>
        </SubViewWrapper>
      );
    }

    if (subView === 'activity') {
      return (
        <SubViewWrapper title="Activity Log">
          <ErrorBoundary><Suspense fallback={<MobileFallback />}><TimeTrackingAdmin drivers={drivers} trips={trips} role={role} /></Suspense></ErrorBoundary>
        </SubViewWrapper>
      );
    }

    // ── Main Navigation Views ─────────────────────────────────────────────────
    if (currentView === 'trips') {
      if (driverWorkDriverId === 'all') {
        return (
          <div className="flex-1 overflow-hidden flex flex-col bg-slate-50 min-h-0">
            {dispatchWorkspaceMode === 'board' ? (
              <ErrorBoundary>
                <Suspense fallback={<MobileFallback />}>
                  <MobileDispatchView
                    {...props}
                    trips={trips}
                    drivers={drivers}
                    onOpenTripDetails={(trip) => {
                      setTripDetails(trip);
                      setTripWorkflowActive(false);
                    }}
                    onOpenTripWorkflow={(trip) => {
                      setTripDetails(trip);
                      setTripWorkflowActive(true);
                    }}
                    assignTripToDriver={props.assignTripToDriver || props.updateTrip}
                    updateTrip={props.updateTrip}
                    currentUser={currentUser}
                    role={role}
                    workspaceControls={renderDispatchWorkspaceControls()}
                    setShowAddTripModal={props.setShowAddTripModal}
                    setShowUploadModal={setShowUploadModal}
                    setBulkAssignModal={setBulkAssignModal}
                    onOpenSequencer={() => setSubView('route_planner')}
                    onOpenLiveMap={() => handleNavClick('map')}
                    addToast={(title, message, type) => {
                      if (props.addToast) props.addToast(title, message, type);
                    }}
                  />
                </Suspense>
              </ErrorBoundary>
            ) : (
              <>
                {renderTopBar('Select Driver Portfolio')}
                {renderDispatchWorkspaceControls()}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-24">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 mb-4 shadow-sm">
                    <p className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-1">Operate As Driver</p>
                    <p className="text-xs font-semibold text-blue-950 leading-relaxed">
                      Select any active driver below to view, track, and manage their trips exactly as they see them on their mobile workflow page.
                    </p>
                  </div>

                  {driverWorkDrivers.map((driver) => {
                    const driverTrips = driverWorkTrips.filter(t => 
                      t.driverId === driver.id || 
                      (driver.name && t.driverName === driver.name) ||
                      (t.driverEmail && (d => (d.email || '').toLowerCase() === t.driverEmail.toLowerCase())(driver))
                    );
                    
                    return (
                      <button
                        key={driver.id}
                        onClick={() => {
                          setDriverWorkDriverId(driver.id);
                          setDispatchWorkspaceMode('operate');
                        }}
                        className="w-full text-left bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center font-bold text-blue-700 text-sm uppercase shrink-0">
                            {(driver.name || driver.email || 'D')[0]}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-slate-900 truncate">{driver.name || driver.email}</h4>
                            <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                              {driver.vehicle ? `Vehicle: ${driver.vehicle}` : 'No vehicle assigned'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide shrink-0 border border-slate-200">
                            {driverTrips.length} {driverTrips.length === 1 ? 'trip' : 'trips'}
                          </span>
                          <ChevronRight size={16} className="text-slate-400 shrink-0" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      }

      return null;
    }


    if (currentView === 'reports') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50 min-h-0">
          {renderTopBar('Reports & Export')}
          <div className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom,0px))' }}>
            <ErrorBoundary><Suspense fallback={<MobileFallback />}><ReportsPage {...props} /></Suspense></ErrorBoundary>
          </div>
        </div>
      );
    }

    if (currentView === 'chat') {
      return (
        <div className="mobile-chat-wrapper flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 overflow-hidden">
            <ErrorBoundary>
              <Suspense fallback={<MobileFallback />}>
                <ChatPage onBack={() => setCurrentView('trips')} onThreadActiveChange={setIsChatThreadOpen} />
              </Suspense>
            </ErrorBoundary>
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
                <MobileMenuPage {...props} setSubView={setSubView} />
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      );
    }

    if (currentView === 'tools') {
      const toolsDriver = toolsDriverId ? driverWorkDrivers.find(d => d.id === toolsDriverId) : null;
      const toolsTrips = toolsDriver
        ? driverWorkTrips.filter(t => (
            t.driverId === toolsDriver.id ||
            t.driverName === toolsDriver.name ||
            String(t.driverEmail || '').trim().toLowerCase() === String(toolsDriver.email || '').trim().toLowerCase()
          ))
        : [];
      const toolsActiveTrips = toolsTrips.filter(t => !['Completed', 'Canceled', 'Archived'].includes(t.status));

      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50 min-h-0">
          {renderTopBar('Route Tools')}
          <div className="shrink-0 bg-white border-b border-slate-200 px-3 py-2.5">
            <label className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 shrink-0">Plan for</span>
              <select
                value={toolsDriverId}
                onChange={e => setToolsDriverId(e.target.value)}
                className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all"
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
                    aiSequence={[]}
                    aiSuggestions={[]}
                    aiRideShare={[]}
                    conflicts={[]}
                    aiOptimizing={false}
                    guidedMode={false}
                    guidedStepIndex={0}
                    guidedSteps={[]}
                    driverPosition={null}
                    appSettings={props.appSettings}
                    currentUser={toolsDriver.email || toolsDriver.id || currentUser}
                    role={role}
                    onSetGuidedMode={() => {}}
                    onSetGuidedStepIndex={() => {}}
                    onSetAiSequence={() => {}}
                    onSetAiSuggestions={() => {}}
                    onRunAiOptimization={() => {}}
                    onSelectAllTrips={() => {}}
                    selectedTrips={[]}
                    onSetSelectedTrips={() => {}}
                    etas={{}}
                    onOpenInNav={props.onOpenInNav}
                    onOpenSequencer={() => {}}
                    requestAuthAction={props.requestAuthAction}
                    routePlanStops={null}
                    onSetRoutePlanStops={() => {}}
                    onSendToSequencer={() => {}}
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

    return null;
  };

  // Show the bottom nav everywhere EXCEPT:
  // 1. When a trip detail overlay is open (full-screen DriverPage)
  // 2. When a chat thread is open inside chat view (thread takes full screen)
  const showNav = !tripDetails && !(currentView === 'chat' && isChatThreadOpen);

  if (currentView === 'trips' && driverWorkDriverId !== 'all') {
    const activeDriver = activeDriverWorkDriver;
    const driverEmail = activeDriver?.email || currentUser;

    return (
      <ErrorBoundary>
        <Suspense fallback={<MobileFallback />}>
          <DriverPage
            {...props}
            currentUser={driverEmail}
            role={role}
            drivers={drivers}
            allDrivers={props.allDrivers || drivers}
            trips={trips}
            isEmbedded={false}
            defaultTripId={null}
            onUpdateTrip={props.updateTrip || props.onUpdateDriverTrip}
            onCompleteTrip={props.onCompleteTrip}
            onDriverStatusUpdate={props.onDriverStatusUpdate}
            onUpdateClockEvents={props.onUpdateClockEvents}
            onUpdateHourlyRate={props.onUpdateHourlyRate}
            onLogout={onLogout}
            onOpenSettings={() => setSubView('settings')}
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
            chatUnreadCount={chatUnreadCount}
            onAcknowledgeAssignment={props.onAcknowledgeAssignment || (() => {})}
            onAcceptAssignment={props.onAcceptAssignment || (() => {})}
            onAddTrip={props.addTrip}
            showAddTripModal={props.showAddTripModal}
            setShowAddTripModal={props.setShowAddTripModal}
            onEmbeddedClose={() => {
              setDriverWorkDriverId('all');
              setDispatchWorkspaceMode('board');
            }}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

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
                    chatUnreadCount={chatUnreadCount}
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
        <nav className="bottom-nav">
          <div className="flex h-full items-center justify-around gap-1">
            {/* Trips */}
            <button
              onClick={() => { handleNavClick('trips'); setExpandedId(null); }}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 touch-manipulation transition-all duration-200 min-h-[56px] ${currentView === 'trips' && !subView ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
            >
              {expandedTripInfo?.showStackedName ? (
                <>
                  <User size={22} strokeWidth={1.6} className="text-blue-600" />
                  <div className="flex flex-col items-center leading-tight mt-0.5">
                    <span className="text-[10px] font-normal text-blue-600">{expandedTripInfo.firstName}</span>
                    {expandedTripInfo.lastName && <span className="text-[10px] font-normal text-blue-600">{expandedTripInfo.lastName}</span>}
                  </div>
                </>
              ) : (
                <>
                  <Home size={24} strokeWidth={currentView === 'trips' && !subView ? 1.8 : 1.3} />
                  <span className={`max-w-full truncate text-[11px] font-normal leading-none mt-1 ${currentView === 'trips' && !subView ? 'text-blue-600' : 'text-slate-400'}`}>Trips</span>
                </>
              )}
            </button>

            {/* Map */}
            <button
              onClick={() => handleNavClick('map')}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 touch-manipulation transition-all duration-200 min-h-[56px] ${currentView === 'map' && !subView ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
            >
              <Map size={24} strokeWidth={currentView === 'map' && !subView ? 1.8 : 1.3} />
              <span className={`max-w-full truncate text-[11px] font-normal leading-none mt-1 ${currentView === 'map' && !subView ? 'text-blue-600' : 'text-slate-400'}`}>Map</span>
            </button>

            {/* Reports */}
            <button
              onClick={() => handleNavClick('reports')}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 touch-manipulation transition-all duration-200 min-h-[56px] ${currentView === 'reports' && !subView ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
            >
              <BarChart2 size={24} strokeWidth={currentView === 'reports' && !subView ? 1.8 : 1.3} />
              <span className={`max-w-full truncate text-[11px] font-normal leading-none mt-1 ${currentView === 'reports' && !subView ? 'text-blue-600' : 'text-slate-400'}`}>Reports</span>
            </button>

            {/* Chat */}
            <button
              onClick={() => handleNavClick('chat')}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 touch-manipulation transition-all duration-200 min-h-[56px] ${currentView === 'chat' && !subView ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
            >
              <span className="relative inline-flex">
                <MessageCircle size={24} strokeWidth={currentView === 'chat' && !subView ? 1.8 : 1.3} />
                {chatUnreadCount > 0 && (
                  <span key={chatUnreadCount} className="messenger-nav-badge absolute -right-2.5 -top-1.5 badge-messenger badge-pop badge-pulse">
                    {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                  </span>
                )}
              </span>
              <span className={`max-w-full truncate text-[11px] font-normal leading-none mt-1 ${currentView === 'chat' && !subView ? 'text-blue-600' : 'text-slate-400'}`}>Chat</span>
            </button>

            {/* Tools */}
            <button
              onClick={() => handleNavClick('tools')}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 touch-manipulation transition-all duration-200 min-h-[56px] ${currentView === 'tools' && !subView ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
            >
              <Zap size={24} strokeWidth={currentView === 'tools' && !subView ? 1.8 : 1.3} />
              <span className={`max-w-full truncate text-[11px] font-normal leading-none mt-1 ${currentView === 'tools' && !subView ? 'text-blue-600' : 'text-slate-400'}`}>Tools</span>
            </button>

            {/* More / Menu */}
            <button
              onClick={() => handleNavClick('menu')}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 touch-manipulation transition-all duration-200 min-h-[56px] ${(currentView === 'menu' || subView) ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
            >
              <Menu size={24} strokeWidth={(currentView === 'menu' || subView) ? 1.8 : 1.3} />
              <span className={`max-w-full truncate text-[11px] font-normal leading-none mt-1 ${(currentView === 'menu' || subView) ? 'text-blue-600' : 'text-slate-400'}`}>More</span>
            </button>
          </div>
        </nav>
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

export default MobileEnterpriseDashboard;
