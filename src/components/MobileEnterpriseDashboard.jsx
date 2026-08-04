import React, { useState, useEffect, lazy, Suspense, Component } from 'react';
import {
  Map, ChevronLeft, Menu, BarChart2, Zap, Shield, X, MessageCircle, Home
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

const MobileMenuPage = lazy(() => import('./MobileMenuPage'));
const ArchivesPage = lazy(() => import('./ArchivesPage'));
const SettingsPage = lazy(() => import('./SettingsPage'));
const DriversVehiclesPage = lazy(() => import('./DriversVehiclesPage'));
const DriverToolsPage = lazy(() => import('./DriverToolsPage'));
const PayrollReportPage = lazy(() => import('./PayrollReportPage'));
const TimeTrackingAdmin = lazy(() => import('./TimeTrackingAdmin'));

const FileUploadTrips = lazy(() => import('./FileUploadTrips'));
const RoutePlannerPage = lazy(() => import('./RoutePlannerPage'));
const WellTransSyncPage = lazy(() => import('../features/welltrans-sync/components/WellTransSyncPage'));

const MobileFallback = () => (
  <div className="flex items-center justify-center h-32">
    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

const MobileEnterpriseDashboard = (props) => {
  const { unreadCount } = useChat({ alerts: true });
  const { trips = [], drivers = [], currentUser, role } = props;
  const [currentView, setCurrentView] = useState('map');
  const [subView, setSubView] = useState(null);
  const [isChatThreadOpen, setIsChatThreadOpen] = useState(false);
  const [tripDetails, setTripDetails] = useState(null);
  const [tripWorkflowActive, setTripWorkflowActive] = useState(false);
  const [bulkAssignModal, setBulkAssignModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [toolsDriverId, setToolsDriverId] = useState(() => localStorage.getItem('agape_toolsDriverId') || '');
  const [tripsDriverId, setTripsDriverId] = useState(() => localStorage.getItem('agape_tripsDriverId') || '');
  const driverWorkDrivers = props.driverWorkDrivers?.length ? props.driverWorkDrivers : drivers;
  const driverWorkTrips = props.driverWorkTrips?.length ? props.driverWorkTrips : trips;

  const handleNavClick = (view) => {
    setCurrentView(view);
    setSubView(null);
  };

  const VALID_VIEWS = ['trips', 'map', 'reports', 'tools', 'menu', 'chat'];
  useEffect(() => {
    if (!VALID_VIEWS.includes(currentView)) setCurrentView('map');
  }, [currentView]);

  useEffect(() => {
    if (toolsDriverId) localStorage.setItem('agape_toolsDriverId', toolsDriverId);
  }, [toolsDriverId]);

  useEffect(() => {
    if (!tripsDriverId && driverWorkDrivers.length) setTripsDriverId(driverWorkDrivers[0].id);
    else if (tripsDriverId && !driverWorkDrivers.some(driver => driver.id === tripsDriverId)) setTripsDriverId(driverWorkDrivers[0]?.id || '');
  }, [driverWorkDrivers, tripsDriverId]);

  useEffect(() => {
    if (tripsDriverId) localStorage.setItem('agape_tripsDriverId', tripsDriverId);
  }, [tripsDriverId]);



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
          <ErrorBoundary><Suspense fallback={<MobileFallback />}><PayrollReportPage drivers={drivers} trips={trips} driverTelemetry={props.driverTelemetry || []} timeTrackingDeclarations={props.timeTrackingDeclarations || []} /></Suspense></ErrorBoundary>
        </SubViewWrapper>
      );
    }

    if (subView === 'activity') {
      return (
        <SubViewWrapper title="Activity Log">
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
            <ErrorBoundary><Suspense fallback={<MobileFallback />}><ReportsPage {...props} /></Suspense></ErrorBoundary>
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
        <SubViewWrapper title="WellTrans Sync" fullHeight>
          <ErrorBoundary><Suspense fallback={<MobileFallback />}><WellTransSyncPage trips={trips} drivers={drivers} vehicles={props.vehicles || []} role={role} onUpdateTrip={props.updateTrip || props.onUpdateDriverTrip} /></Suspense></ErrorBoundary>
        </SubViewWrapper>
      );
    }

    if (currentView === 'trips') {
      const selectedDriver = driverWorkDrivers.find(driver => driver.id === tripsDriverId) || driverWorkDrivers[0];
      const selectedTrips = selectedDriver ? driverWorkTrips.filter(trip => (
        trip.driverId === selectedDriver.id || trip.driverName === selectedDriver.name ||
        String(trip.driverEmail || '').trim().toLowerCase() === String(selectedDriver.email || '').trim().toLowerCase()
      )) : [];
      return (
        <div className="flex min-h-0 flex-1 flex-col bg-[var(--bg-app)]">
          <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">Driver trips</p><p className="truncate text-sm font-extrabold text-slate-950">{role === 'admin' ? 'Admin' : 'Dispatcher'} workflow view</p></div>
              <select value={selectedDriver?.id || ''} onChange={event => setTripsDriverId(event.target.value)} className="max-w-[55%] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-500">
                {driverWorkDrivers.map(driver => <option key={driver.id || driver.email} value={driver.id}>{driver.name || driver.email || driver.id}</option>)}
              </select>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {selectedDriver ? <ErrorBoundary><Suspense fallback={<MobileFallback />}><DriverPage
              currentUser={selectedDriver.email || selectedDriver.id || currentUser}
              role={role} isEmbedded={true} onEmbeddedClose={() => handleNavClick('map')}
              drivers={[selectedDriver]} allDrivers={props.allDrivers || drivers}
              trips={selectedTrips} dispatchers={props.dispatchers || []} phoneNumbers={props.phoneNumbers || {}}
              driverTelemetry={props.driverTelemetry || []}
              timeTrackingDeclarations={props.timeTrackingDeclarations || []}
              onUpdateTrip={props.onUpdateDriverTrip || props.updateTrip} onCompleteTrip={props.onCompleteTrip}
              onDriverStatusUpdate={props.onDriverStatusUpdate} onUpdateClockEvents={props.onUpdateClockEvents}
              onUpdateHourlyRate={props.onUpdateHourlyRate} onUpdateDriverLocation={props.handleUpdateDriverLocation || props.updateDriverLocation}
              onAddAuditLog={props.addAuditLog} requestAuthAction={props.requestAuthAction}
              appSettings={props.appSettings} onUpdateAppSettings={props.updateAppSettings}
              onOpenSettings={() => setSubView('settings')} onLogout={props.onLogout}
              onAddTrip={props.addTrip} showAddTripModal={props.showAddTripModal} setShowAddTripModal={props.setShowAddTripModal}
            /></Suspense></ErrorBoundary> : <div className="flex h-full flex-col items-center justify-center px-8 text-center"><Home size={34} className="text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No accessible drivers</p><p className="mt-1 text-xs text-slate-500">Driver access must be assigned before trips can be opened.</p></div>}
          </div>
        </div>
      );
    }

    return null;
  };

  // Show the bottom nav everywhere EXCEPT:
  // 1. When a trip detail overlay is open (full-screen DriverPage)
  // 2. When a chat thread is open inside chat view (thread takes full screen)
  const showNav = !tripDetails && !isChatThreadOpen;



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
        <nav className="bottom-nav">
          <div className="flex h-full items-center justify-around gap-1">

            <button onClick={() => handleNavClick('trips')} className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 touch-manipulation transition-all duration-200 min-h-[56px] ${currentView === 'trips' && !subView ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}>
              <Home size={24} strokeWidth={currentView === 'trips' && !subView ? 1.8 : 1.3} />
              <span className={`max-w-full truncate text-[11px] font-normal leading-none mt-1 ${currentView === 'trips' && !subView ? 'text-blue-600' : 'text-slate-400'}`}>Trips</span>
            </button>


            {/* Map */}
            <button
              onClick={() => handleNavClick('map')}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 touch-manipulation transition-all duration-200 min-h-[56px] ${currentView === 'map' && !subView ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
            >
              <Map size={24} strokeWidth={currentView === 'map' && !subView ? 1.8 : 1.3} />
              <span className={`max-w-full truncate text-[11px] font-normal leading-none mt-1 ${currentView === 'map' && !subView ? 'text-blue-600' : 'text-slate-400'}`}>Map</span>
            </button>

            {/* Chat */}
            <button
              onClick={() => handleNavClick('chat')}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 touch-manipulation transition-all duration-200 min-h-[56px] ${currentView === 'chat' && !subView ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
            >
              <MessageCircle size={24} strokeWidth={currentView === 'chat' && !subView ? 1.8 : 1.3} />
              {unreadCount > 0 && <span className="absolute top-0 right-[22%] min-w-[17px] h-[17px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-black leading-[17px]">{unreadCount > 99 ? '99+' : unreadCount}</span>}
              <span className={`max-w-full truncate text-[11px] font-normal leading-none mt-1 ${currentView === 'chat' && !subView ? 'text-blue-600' : 'text-slate-400'}`}>Chat</span>
            </button>

            {/* Reports */}
            <button
              onClick={() => handleNavClick('reports')}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 touch-manipulation transition-all duration-200 min-h-[56px] ${currentView === 'reports' && !subView ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
            >
              <BarChart2 size={24} strokeWidth={currentView === 'reports' && !subView ? 1.8 : 1.3} />
              <span className={`max-w-full truncate text-[11px] font-normal leading-none mt-1 ${currentView === 'reports' && !subView ? 'text-blue-600' : 'text-slate-400'}`}>Reports</span>
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
