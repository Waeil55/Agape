import React, { useState, useMemo, useCallback, startTransition, Suspense, lazy, Component } from 'react';
import { Search, X, AlertCircle } from 'lucide-react';
import { resolveClientPhoneForTrip } from '../utils/clientPhoneResolution';
import { openNavigation, makeCall } from '../utils/nativeActions';
import { 
  MobileLayout, 
  NAV_BOTTOM_CLEARANCE, 
  TripDetailView,
  HeaderProvider
} from './shared';
import SettingsPage from './SettingsPage';
import AddTripModal from './AddTripModal';

const ReportsPage = lazy(() => import('./ReportsPage').then(m => ({ default: m.ReportsPage })));
const MobileReportsPage = lazy(() => import('./MobileReportsPage').then(m => ({ default: m.MobileReportsPage })));
const MobileAdminPage = lazy(() => import('./MobileAdminPage').then(m => ({ default: m.MobileAdminPage })));
const MobileMenuPage = lazy(() => import('./MobileMenuPage').then(m => ({ default: m.MobileMenuPage })));
const LiveMapPage = lazy(() => import('./LiveMapPage').then(m => ({ default: m.LiveMapPage })));
const DriversVehiclesPage = lazy(() => import('./DriversVehiclesPage').then(m => ({ default: m.DriversVehiclesPage })));
const RoutePlannerPage = lazy(() => import('./RoutePlannerPage').then(m => ({ default: m.RoutePlannerPage })));
const EnterpriseRoutePlanner = lazy(() => import('./EnterpriseRoutePlanner').then(m => ({ default: m.EnterpriseRoutePlanner })));
const PayrollReportPage = lazy(() => import('./PayrollReportPage').then(m => ({ default: m.PayrollReportPage })));
const TimeTrackingAdmin = lazy(() => import('./TimeTrackingAdmin').then(m => ({ default: m.TimeTrackingAdmin })));
const ChatPage = lazy(() => import('./chat/ChatPage').then(m => ({ default: m.ChatPage })));
const FileUploadTrips = lazy(() => import('./FileUploadTrips').then(m => ({ default: m.FileUploadTrips })));
const TripsPage = lazy(() => import('./TripsPage').then(m => ({ default: m.TripsPage })));

const MobileFallback = () => (
  <div className="flex items-center justify-center p-12" role="status" aria-label="Loading">
    <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
  </div>
);

const SubViewFallback = () => (
  <div className="flex-1 flex items-center justify-center" role="status" aria-label="Loading">
    <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
  </div>
);

class ErrorBoundary extends Component {
  state = { error: null, errorInfo: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error('MobileEnterpriseDashboard ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={32} className="text-rose-600" />
            </div>
            <p className="text-lg font-semibold text-slate-900 mb-2">Something went wrong</p>
            <p className="text-sm text-slate-500 mb-4">{this.state.error.message}</p>
            <button onClick={() => this.setState({ error: null })} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold">Try Again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ErrorBoundary.displayName = 'ErrorBoundary';

const SUB_VIEW_TITLES = {
  route_planner: 'AI Route Planner',
  reports: 'Reports & Export',
  admin: 'User Management',
  archives: 'Reports & Records',
  settings: 'App Settings',
  fleet: 'Fleet Management',
  map: 'Live Map',
  payroll: 'Payroll',
  activity: 'Activity Log',
  welltrans: 'Reports & Records',
};

const getSubViewTitle = (subView) => SUB_VIEW_TITLES[subView] || 'Details';

const MobileEnterpriseDashboard = (props) => {
  const { 
    trips = [], drivers = [], currentUser, role, 
    onUpdateTrip, onUpdateDriverTrip,
    requestAuthAction,
    hasPermission,
    driverTelemetry = [], timeTrackingDeclarations = [],
    dispatchers = [],
  } = props;

  const [currentView, setCurrentView] = useState('trips');
  const [subView, setSubView] = useState(null);
  const [isChatThreadOpen, setIsChatThreadOpen] = useState(false);
  const [tripDetails, setTripDetails] = useState(null);
  const [tripWorkflowActive, setTripWorkflowActive] = useState(false);
  const [reportsSection, setReportsSection] = useState(() => {
    try { return localStorage.getItem('agape_reportsSection') || 'trips'; } catch { return 'trips'; }
  });
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [bulkAssignModal, setBulkAssignModal] = useState(false);
  const [showAddTripModal, setShowAddTripModal] = useState(false);

  const driverWorkDrivers = Array.isArray(props.driverWorkDrivers) ? props.driverWorkDrivers : drivers;
  const driverWorkTrips = Array.isArray(props.driverWorkTrips) ? props.driverWorkTrips : trips;

  const currentTripDetails = useMemo(() => {
    if (!tripDetails?.id) return null;
    return driverWorkTrips.find((trip) => String(trip.id) === String(tripDetails.id)) || tripDetails;
  }, [driverWorkTrips, tripDetails]);

  const closeTripDetails = useCallback(() => {
    setTripDetails(null);
    setTripWorkflowActive(false);
  }, []);

  const handleNavClick = useCallback((view) => {
    closeTripDetails();
    startTransition(() => {
      setCurrentView(view);
      setSubView(null);
      if (view === 'reports') setReportsSection('trips');
    });
  }, [closeTripDetails]);

  const preloadMobileView = useCallback((view) => {
    switch (view) {
      case 'map': void import('./LiveMapPage'); break;
      case 'reports': void import('./MobileReportsPage'); break;
      case 'tools': void import('./EnterpriseRoutePlanner'); break;
      case 'menu': void import('./MobileMenuPage'); break;
    }
  }, []);

  const renderContent = () => {
    if (subView) {
      const title = getSubViewTitle(subView);
      const rightActions = [
        { id: 'search', icon: Search, onClick: () => setGlobalSearchOpen(true), ariaLabel: 'Search', variant: 'secondary' },
      ];

      const content = (
        <>
          {subView === 'route_planner' && (
            <ErrorBoundary>
              <Suspense fallback={<SubViewFallback />}>
                <RoutePlannerPage trips={trips} drivers={drivers} role={role} currentUser={currentUser} />
              </Suspense>
            </ErrorBoundary>
          )}
          {subView === 'reports' && (
            <ErrorBoundary>
              <Suspense fallback={<SubViewFallback />}>
                <ReportsPage {...props} initialSection={reportsSection} onSectionChange={setReportsSection} />
              </Suspense>
            </ErrorBoundary>
          )}
          {subView === 'admin' && (
            <ErrorBoundary>
              <Suspense fallback={<SubViewFallback />}>
                <MobileAdminPage {...props} onShowUploadModal={setShowUploadModal} />
              </Suspense>
            </ErrorBoundary>
          )}
          {subView === 'archives' && (
            <ErrorBoundary>
              <Suspense fallback={<SubViewFallback />}>
                <ReportsPage {...props} initialSection="archive" onSectionChange={setReportsSection} onDriveTrip={(trip) => { setTripWorkflowActive(true); setTripDetails(trip); }} />
              </Suspense>
            </ErrorBoundary>
          )}
          {subView === 'settings' && (
            <ErrorBoundary>
              <Suspense fallback={<SubViewFallback />}>
                <SettingsPage {...props} onResetSystem={() => { props.setTrips?.([]); props.setTrashedTrips?.([]); props.setDrivers?.([]); props.addAuditLog?.('System Reset', 'Master data wipe performed by Admin.', 'rose'); }} />
              </Suspense>
            </ErrorBoundary>
          )}
          {subView === 'fleet' && (
            <ErrorBoundary>
              <Suspense fallback={<SubViewFallback />}>
                <DriversVehiclesPage {...props} />
              </Suspense>
            </ErrorBoundary>
          )}
          {subView === 'map' && (
            <ErrorBoundary>
              <Suspense fallback={<SubViewFallback />}>
                <LiveMapPage trips={trips} drivers={drivers} />
              </Suspense>
            </ErrorBoundary>
          )}
          {subView === 'payroll' && (
            <ErrorBoundary>
              <Suspense fallback={<SubViewFallback />}>
                <PayrollReportPage drivers={drivers} trips={trips} driverTelemetry={driverTelemetry} timeTrackingDeclarations={timeTrackingDeclarations} />
              </Suspense>
            </ErrorBoundary>
          )}
          {subView === 'activity' && (
            <ErrorBoundary>
              <Suspense fallback={<SubViewFallback />}>
                <TimeTrackingAdmin drivers={drivers} trips={trips} driverTelemetry={driverTelemetry} timeTrackingDeclarations={timeTrackingDeclarations} role={role} />
              </Suspense>
            </ErrorBoundary>
          )}
          {subView === 'welltrans' && (
            <ErrorBoundary>
              <Suspense fallback={<SubViewFallback />}>
                <ReportsPage {...props} initialSection="portal" onSectionChange={setReportsSection} />
              </Suspense>
            </ErrorBoundary>
          )}
        </>
      );

      return (
        <MobileLayout
          currentView={currentView}
          subView={subView}
          role={role}
          onNavigate={handleNavClick}
          onPreload={preloadMobileView}
          headerConfig={{ title, rightActions }}
          showBottomNav={true}
        >
          {content}
        </MobileLayout>
      );
    }

    if (currentView === 'reports') {
      return (
        <MobileLayout
          currentView={currentView}
          subView={subView}
          role={role}
          onNavigate={handleNavClick}
          onPreload={preloadMobileView}
          headerConfig={{ title: 'Reports & Export' }}
        >
          <div className="flex-1 overflow-y-auto p-4">
            <ErrorBoundary>
              <Suspense fallback={<MobileFallback />}>
                <MobileReportsPage
                  trips={driverWorkTrips}
                  drivers={driverWorkDrivers}
                  onUpdateTrip={onUpdateTrip || onUpdateDriverTrip}
                  setShowUploadModal={setShowUploadModal}
                  readOnly={false}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </MobileLayout>
      );
    }

    if (currentView === 'map') {
      return (
        <MobileLayout
          currentView={currentView}
          subView={subView}
          role={role}
          onNavigate={handleNavClick}
          onPreload={preloadMobileView}
          headerConfig={{ title: 'Live Fleet Tracking' }}
        >
          <div className="flex-1 relative" style={{ paddingBottom: NAV_BOTTOM_CLEARANCE }}>
            <ErrorBoundary>
              <Suspense fallback={<MobileFallback />}>
                <LiveMapPage {...props} />
              </Suspense>
            </ErrorBoundary>
          </div>
        </MobileLayout>
      );
    }

    if (currentView === 'menu') {
      return (
        <MobileLayout
          currentView={currentView}
          subView={subView}
          role={role}
          onNavigate={handleNavClick}
          onPreload={preloadMobileView}
          headerConfig={{ title: 'Settings & More' }}
        >
          <div className="flex-1 overflow-y-auto" style={{ paddingBottom: NAV_BOTTOM_CLEARANCE }}>
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
        </MobileLayout>
      );
    }

    if (currentView === 'tools') {
      return (
        <MobileLayout
          currentView={currentView}
          subView={subView}
          role={role}
          onNavigate={handleNavClick}
          onPreload={preloadMobileView}
          headerConfig={{ title: 'Route Planner & Tools', showBack: true, onBack: () => handleNavClick('trips') }}
        >
          <div className="flex-1 overflow-y-auto" style={{ paddingBottom: NAV_BOTTOM_CLEARANCE }}>
            <ErrorBoundary>
              <Suspense fallback={<MobileFallback />}>
                <EnterpriseRoutePlanner
                  trips={driverWorkTrips}
                  drivers={driverWorkDrivers}
                  appSettings={props.appSettings}
                  onOpenInNav={props.onOpenInNav}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </MobileLayout>
      );
    }

    if (currentView === 'chat') {
      return (
        <MobileLayout
          currentView={currentView}
          subView={subView}
          role={role}
          onNavigate={handleNavClick}
          onPreload={preloadMobileView}
          headerConfig={{ title: 'Messages' }}
          showBottomNav={!isChatThreadOpen}
        >
          <div className="flex-1 overflow-hidden">
            <ErrorBoundary>
              <Suspense fallback={<MobileFallback />}>
                <ChatPage
                  onBack={() => setIsChatThreadOpen(false)}
                  onThreadActive={setIsChatThreadOpen}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </MobileLayout>
      );
    }

    if (currentView === 'trips') {
      const selectedTasks = props.selectedTasks || [];
      const toggleTaskSelection = (tripId) => props.setSelectedTasks?.(current => (
        current.includes(tripId) ? current.filter(id => id !== tripId) : [...current, tripId]
      ));

      return (
        <MobileLayout
          currentView={currentView}
          subView={subView}
          role={role}
          onNavigate={handleNavClick}
          onPreload={preloadMobileView}
          headerConfig={{ title: 'Dispatch Manifest' }}
        >
          <div className="flex-1 overflow-y-auto p-2" style={{ paddingBottom: NAV_BOTTOM_CLEARANCE }}>
            <ErrorBoundary>
              <Suspense fallback={<MobileFallback />}>
                <TripsPage
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
                  onUpdateTrip={onUpdateTrip || onUpdateDriverTrip}
                  onDeleteTrip={props.requestDeleteTrip}
                  onShowUploadModal={setShowUploadModal}
                  requestAuthAction={requestAuthAction}
                  hasPermission={hasPermission}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </MobileLayout>
      );
    }

    return null;
  };

  return (
    <HeaderProvider>
      {renderContent()}
      
      {currentTripDetails && (
        <Suspense fallback={<MobileFallback />}>
          <TripDetailView
            tripId={currentTripDetails.id}
            role={role}
            currentUser={currentUser}
            drivers={driverWorkDrivers}
            onClose={closeTripDetails}
            onEdit={(trip) => { /* handle edit */ }}
            onDrive={(trip) => { setTripWorkflowActive(true); }}
            onAssign={(trip) => { /* handle assign */ }}
            onMessage={(trip) => { /* handle message */ }}
            onNavigate={(trip, loc) => openNavigation(loc === 'pickup' ? trip.pickup : trip.dropoff)}
            onCall={(trip) => makeCall(resolveClientPhoneForTrip(trip, []), trip.patient)}
            onArchive={(trip) => { /* handle archive */ }}
            onReroute={(trip) => { /* handle reroute */ }}
            onNoShow={(trip) => { /* handle no show */ }}
            onCancel={(trip) => { /* handle cancel */ }}
            onAudit={(trip) => { /* handle audit */ }}
            onUpdateTrip={onUpdateTrip || onUpdateDriverTrip}
            isWorkflowMode={tripWorkflowActive}
            readOnly={false}
          />
        </Suspense>
      )}

      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">Upload Trips</h3>
            <button onClick={() => setShowUploadModal(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <ErrorBoundary>
              <Suspense fallback={<MobileFallback />}>
                <FileUploadTrips
                  {...props}
                  allowedDrivers={props.uploadDrivers}
                  lockedDriverId={props.uploadLockedDriverId || ''}
                  onClose={() => setShowUploadModal(false)}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      )}

      {bulkAssignModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => setBulkAssignModal(false)}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Bulk Assign</h3>
              <button onClick={() => setBulkAssignModal(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"><X size={16} /></button>
            </div>
          </div>
        </div>
      )}

      {showAddTripModal && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">Add Trip</h3>
            <button onClick={() => setShowAddTripModal(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <ErrorBoundary>
              <Suspense fallback={<MobileFallback />}>
                <AddTripModal
                  onClose={() => setShowAddTripModal(false)}
                  onAddTrip={props.addTrip}
                  role={role}
                  currentUser={currentUser}
                  drivers={role === 'driver' ? (props.currentUserDriverProfile ? [props.currentUserDriverProfile] : []) : role === 'dispatcher' ? driverWorkDrivers : drivers}
                  dispatchers={dispatchers}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      )}

      {globalSearchOpen && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">Search</h3>
            <button onClick={() => setGlobalSearchOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            Search implementation
          </div>
        </div>
      )}
    </HeaderProvider>
  );
};

export default React.memo(MobileEnterpriseDashboard);