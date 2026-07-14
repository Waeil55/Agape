import React, { useMemo, useState, useEffect, lazy, Suspense, Component } from 'react';
import {
  Home, Map, MessageCircle, ChevronLeft, User, Menu, Truck, BarChart2, Zap
} from 'lucide-react';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err) { console.error('[MobileUI] Error:', err); }
  render() { return this.state.hasError ? <div className="flex items-center justify-center h-32 text-xs text-red-500 font-semibold">Something went wrong. Tap menu to navigate.</div> : this.props.children; }
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

const MobileFallback = () => <div className="flex items-center justify-center h-32"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

const MobileEnterpriseDashboard = (props) => {
  const { trips = [], drivers = [], currentUser, role, onLogout, chatUnreadCount = 0 } = props;
  const [currentView, setCurrentView] = useState('trips');
  const [subView, setSubView] = useState(null); // admin, reports, settings, archives
  const [dispatchWorkspaceMode, setDispatchWorkspaceMode] = useState('board');
  const [isChatThreadOpen, setIsChatThreadOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [toolsDriverId, setToolsDriverId] = useState(() => localStorage.getItem('agape_toolsDriverId') || '');
  const driverWorkDrivers = props.driverWorkDrivers?.length ? props.driverWorkDrivers : drivers;
  const driverWorkTrips = props.driverWorkTrips?.length ? props.driverWorkTrips : trips;
  const [driverWorkDriverId, setDriverWorkDriverId] = useState(() => localStorage.getItem('agape_mobileDriverWorkDriverId') || 'all');
  const todayKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

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

  const renderTopBar = (title, showBack = false) => (
    <div className="driver-page-header shrink-0 z-30 border-b border-slate-200/70 bg-[var(--bg-app)]/95 backdrop-blur-md">
      <div className="px-3 py-3 flex items-center gap-3">
        {showBack && (
          <button onClick={() => setSubView(null)} className="min-w-[36px] min-h-[36px] flex items-center justify-center -ml-1.5 text-slate-500 hover:text-slate-800 rounded-full bg-slate-200/50 touch-manipulation transition-all">
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
      </div>
    </div>
  );

  const renderDispatchWorkspaceControls = () => {
    const selectedDriver = activeDriverWorkDriver;
    const scopedTripCount = activeDriverWorkTrips.filter((trip) => trip.date === todayKey || !trip.date).length;
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
                onClick={() => setDispatchWorkspaceMode(mode.id)}
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
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
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
                drivers={[activeDriverWorkDriver]}
                trips={activeDriverWorkTrips}
                allDrivers={props.allDrivers || drivers}
                onUpdateTrip={props.onUpdateDriverTrip || props.updateTrip}
                onCompleteTrip={props.onCompleteTrip}
                onDriverStatusUpdate={props.onDriverStatusUpdate}
                onAddAuditLog={props.addAuditLog}
                onLogout={onLogout}
                requestAuthAction={props.requestAuthAction}
                appSettings={props.appSettings}
                onUpdateAppSettings={props.updateAppSettings}
                onUpdateDriverLocation={props.handleUpdateDriverLocation}
                onOpenSettings={() => setSubView('settings')}
                onAddTrip={props.addTrip}
                showAddTripModal={props.showAddTripModal}
                setShowAddTripModal={props.setShowAddTripModal}
                isEmbedded
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    // Handle Sub-views (from Menu)
    if (subView === 'reports') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
          {renderTopBar('Reports & Export', true)}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-24">
            <ErrorBoundary><Suspense fallback={<MobileFallback />}><ReportsPage {...props} /></Suspense></ErrorBoundary>
          </div>
        </div>
      );
    }

    if (subView === 'admin') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
          {renderTopBar('User Management', true)}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-24">
            <ErrorBoundary><Suspense fallback={<MobileFallback />}><AdminPage {...props} /></Suspense></ErrorBoundary>
          </div>
        </div>
      );
    }

    if (subView === 'archives') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
          {renderTopBar('Archives', true)}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-24">
            <ErrorBoundary><Suspense fallback={<MobileFallback />}><ArchivesPage {...props} /></Suspense></ErrorBoundary>
          </div>
        </div>
      );
    }

    if (subView === 'settings') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
          {renderTopBar('Settings', true)}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-24">
            <ErrorBoundary><Suspense fallback={<MobileFallback />}><SettingsPage {...props} onResetSystem={() => { props.setTrips?.([]); props.setTrashedTrips?.([]); props.setDrivers?.([]); props.setLogs?.([{ t: 'System Reset', d: 'Administrator wiped all operational data.', c: 'rose', type: 'system' }]); props.addAuditLog?.('System Reset', 'Master data wipe performed by Admin.', 'rose'); }} /></Suspense></ErrorBoundary>
          </div>
        </div>
      );
    }

    if (subView === 'fleet') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
          {renderTopBar('Fleet Management', true)}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-24">
            <ErrorBoundary><Suspense fallback={<MobileFallback />}><DriversVehiclesPage {...props} /></Suspense></ErrorBoundary>
          </div>
        </div>
      );
    }

    if (subView === 'map') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
          {renderTopBar('Live Map', true)}
          <div className="flex-1 overflow-hidden">
            <ErrorBoundary><Suspense fallback={<MobileFallback />}><LiveMapPage trips={trips} drivers={drivers} /></Suspense></ErrorBoundary>
          </div>
        </div>
      );
    }

    if (subView === 'payroll') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
          {renderTopBar('Payroll', true)}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-24">
            <ErrorBoundary><Suspense fallback={<MobileFallback />}><PayrollReportPage drivers={drivers} trips={trips} /></Suspense></ErrorBoundary>
          </div>
        </div>
      );
    }

    if (subView === 'activity') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
          {renderTopBar('Activity Log', true)}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-24">
            <ErrorBoundary><Suspense fallback={<MobileFallback />}><TimeTrackingAdmin drivers={drivers} trips={trips} role={role} /></Suspense></ErrorBoundary>
          </div>
        </div>
      );
    }

    // Main Navigation Views
    if (currentView === 'trips') {
      const scopedDrivers = driverWorkDriverId === 'all'
        ? drivers
        : [activeDriverWorkDriver].filter(Boolean);

      return (
        <div className="flex-1 overflow-hidden flex flex-col relative bg-slate-50">
          {dispatchWorkspaceMode === 'operate' ? (
            <div className="absolute inset-0 flex min-h-0 flex-col">
              {renderTopBar(role === 'admin' ? 'Operations workspace' : 'Dispatch workspace')}
              <div className="mobile-dispatch-header shrink-0 border-b border-slate-200 bg-white px-3 pb-3 sm:px-4">
                {renderDispatchWorkspaceControls()}
              </div>
              {renderDriverWorkPanel()}
            </div>
          ) : (
            <div className="absolute inset-0 flex min-h-0 flex-col">
              {renderTopBar(role === 'admin' ? 'Operations workspace' : 'Dispatch workspace')}
              <ErrorBoundary>
                <Suspense fallback={<MobileFallback />}>
                  <MobileDispatchView
                    {...props}
                    trips={activeDriverWorkTrips}
                    drivers={scopedDrivers}
                    activeTab={dispatchWorkspaceMode === 'drivers' ? 'drivers' : 'trips'}
                    expandedId={expandedId}
                    setExpandedId={setExpandedId}
                    workspaceControls={renderDispatchWorkspaceControls()}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}
        </div>
      );
    }

    if (currentView === 'reports') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
          {renderTopBar('Reports & Export')}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <ErrorBoundary><Suspense fallback={<MobileFallback />}><ReportsPage {...props} /></Suspense></ErrorBoundary>
          </div>
        </div>
      );
    }

    if (currentView === 'chat') {
      return (
        <div className="mobile-chat-wrapper flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 overflow-hidden">
            <ErrorBoundary><Suspense fallback={<MobileFallback />}><ChatPage onBack={() => setCurrentView('trips')} onThreadActiveChange={setIsChatThreadOpen} /></Suspense></ErrorBoundary>
          </div>
        </div>
      );
    }

    if (currentView === 'map') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col relative bg-slate-50">
          {renderTopBar('Live Fleet Tracking')}
          <div className="flex-1 relative">
            <ErrorBoundary><Suspense fallback={<MobileFallback />}><LiveMapPage {...props} /></Suspense></ErrorBoundary>
          </div>
        </div>
      );
    }

    if (currentView === 'menu') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
          {renderTopBar('Settings & More')}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <ErrorBoundary><Suspense fallback={<MobileFallback />}><MobileMenuPage {...props} setSubView={setSubView} /></Suspense></ErrorBoundary>
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
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
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
          <div className="flex-1 overflow-y-auto overscroll-contain">
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
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4"><Zap size={28} className="opacity-30"/></div>
                <p className="text-sm font-semibold text-slate-500">Select a driver above</p>
                <p className="text-xs text-slate-400 mt-1 text-center max-w-[220px]">Choose a driver to plan routes, optimize trips, and navigate</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div
      className="mobile-enterprise-dashboard-wrapper w-full h-full bg-white flex flex-col relative overflow-hidden"
    >
      {/* Dynamic Content */}
      {renderContent()}

      {/* Spacer to prevent content from being hidden behind bottom nav */}
      <div className="shrink-0 h-[calc(56px+8px+env(safe-area-inset-bottom,0px))]" aria-hidden="true" />

      {/* BOTTOM NAVIGATION */}
      {!subView && !(currentView === 'chat' && isChatThreadOpen) && (
        <nav className="bottom-nav">
        <div className="flex h-full items-center justify-around gap-1">
                <button
                  onClick={() => { handleNavClick('trips'); setExpandedId(null); }}
                  className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 touch-manipulation transition-all duration-200 min-h-[56px] ${currentView === 'trips' && !subView ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
                >
                  {expandedTripInfo?.showStackedName ? (
                    <>
                      <User size={22} strokeWidth={2} className="text-blue-600" />
                      <div className="flex flex-col items-center leading-tight mt-0.5">
                        <span className="text-[10px] font-semibold text-blue-600">{expandedTripInfo.firstName}</span>
                        {expandedTripInfo.lastName && <span className="text-[10px] font-semibold text-blue-600">{expandedTripInfo.lastName}</span>}
                      </div>
                    </>
                  ) : (
                    <>
                      <Home size={24} strokeWidth={currentView === 'trips' && !subView ? 2.2 : 1.6} />
                      <span className={`max-w-full truncate text-[11px] font-medium leading-none mt-1 ${currentView === 'trips' && !subView ? 'text-blue-600' : 'text-slate-400'}`}>Trips</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => handleNavClick('map')}
                  className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 touch-manipulation transition-all duration-200 min-h-[56px] ${currentView === 'map' && !subView ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
                >
                  <Map size={24} strokeWidth={currentView === 'map' && !subView ? 2.2 : 1.6} />
                  <span className={`max-w-full truncate text-[11px] font-medium leading-none mt-1 ${currentView === 'map' && !subView ? 'text-blue-600' : 'text-slate-400'}`}>Map</span>
                </button>

                <button
                  onClick={() => handleNavClick('reports')}
                  className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 touch-manipulation transition-all duration-200 min-h-[56px] ${currentView === 'reports' && !subView ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
                >
                  <BarChart2 size={24} strokeWidth={currentView === 'reports' && !subView ? 2.2 : 1.6} />
                  <span className={`max-w-full truncate text-[11px] font-medium leading-none mt-1 ${currentView === 'reports' && !subView ? 'text-blue-600' : 'text-slate-400'}`}>Reports</span>
                </button>

                <button
                  onClick={() => handleNavClick('chat')}
                  className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 touch-manipulation transition-all duration-200 min-h-[56px] ${currentView === 'chat' && !subView ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
                >
                  <span className="relative inline-flex">
                    <MessageCircle size={24} strokeWidth={currentView === 'chat' && !subView ? 2.2 : 1.6} />
                    {chatUnreadCount > 0 && (
                      <span key={chatUnreadCount} className="messenger-nav-badge absolute -right-2.5 -top-1.5 badge-messenger badge-pop badge-pulse">
                        {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                      </span>
                    )}
                  </span>
                  <span className={`max-w-full truncate text-[11px] font-medium leading-none mt-1 ${currentView === 'chat' && !subView ? 'text-blue-600' : 'text-slate-400'}`}>Chat</span>
                </button>

                <button
                  onClick={() => handleNavClick('tools')}
                  className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 touch-manipulation transition-all duration-200 min-h-[56px] ${currentView === 'tools' && !subView ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
                >
                  <Zap size={24} strokeWidth={currentView === 'tools' && !subView ? 2.2 : 1.6} />
                  <span className={`max-w-full truncate text-[11px] font-medium leading-none mt-1 ${currentView === 'tools' && !subView ? 'text-blue-600' : 'text-slate-400'}`}>Tools</span>
                </button>

                <button
                  onClick={() => handleNavClick('menu')}
                  className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 touch-manipulation transition-all duration-200 min-h-[56px] ${currentView === 'menu' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
                >
                  <Menu size={24} strokeWidth={currentView === 'menu' ? 2.2 : 1.6} />
                  <span className={`max-w-full truncate text-[11px] font-medium leading-none mt-1 ${currentView === 'menu' ? 'text-blue-600' : 'text-slate-400'}`}>More</span>
                </button>
        </div>
      </nav>
      )}

    </div>
  );
};

export default MobileEnterpriseDashboard;
