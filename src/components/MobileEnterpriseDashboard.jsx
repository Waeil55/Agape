import React, { useMemo, useState, useEffect } from 'react';
import {
  Home, Map, MessageCircle, ChevronLeft, User, Menu, Truck, BarChart2
} from 'lucide-react';
import DriverPage from './DriverPage';
import AdminPage from './AdminPage';
import ReportsPage from './ReportsPage';
import LiveMapPage from './LiveMapPage';
import MobileDispatchView from './MobileDispatchView';
import MobileMenuPage from './MobileMenuPage';
import ArchivesPage from './ArchivesPage';
import SettingsPage from './SettingsPage';
import DriversVehiclesPage from './DriversVehiclesPage';
import { getDriverLiveStatus } from '../constants/statuses';

const MobileEnterpriseDashboard = (props) => {
  const { trips, drivers, dispatchers, currentUser, role, onLogout } = props;
  const [currentView, setCurrentView] = useState('trips');
  const [subView, setSubView] = useState(null); // admin, reports, settings, archives
  const [expandedId, setExpandedId] = useState(null);
  const driverWorkDrivers = props.driverWorkDrivers?.length ? props.driverWorkDrivers : drivers;
  const driverWorkTrips = props.driverWorkTrips?.length ? props.driverWorkTrips : trips;
  const [driverWorkDriverId, setDriverWorkDriverId] = useState(() => localStorage.getItem('agape_mobileDriverWorkDriverId') || '');

  const activeDriverWorkDriver = useMemo(() => {
    if (!driverWorkDrivers?.length) return null;
    return driverWorkDrivers.find((driver) => driver.id === driverWorkDriverId) || driverWorkDrivers[0];
  }, [driverWorkDriverId, driverWorkDrivers]);

  useEffect(() => {
    if (activeDriverWorkDriver?.id && activeDriverWorkDriver.id !== driverWorkDriverId) {
      setDriverWorkDriverId(activeDriverWorkDriver.id);
    }
  }, [activeDriverWorkDriver?.id, driverWorkDriverId]);

  useEffect(() => {
    if (driverWorkDriverId) localStorage.setItem('agape_mobileDriverWorkDriverId', driverWorkDriverId);
  }, [driverWorkDriverId]);

  const activeDriverWorkTrips = useMemo(() => {
    if (!activeDriverWorkDriver) return [];
    const driverEmail = String(activeDriverWorkDriver.email || '').trim().toLowerCase();
    return (driverWorkTrips || []).filter((trip) => (
      trip.driverId === activeDriverWorkDriver.id ||
      trip.driverName === activeDriverWorkDriver.name ||
      String(trip.driverEmail || '').trim().toLowerCase() === driverEmail ||
      drivers.find((driver) => driver.id === trip.driverId)?.email === activeDriverWorkDriver.email
    ));
  }, [activeDriverWorkDriver, driverWorkTrips, drivers]);

  const handleNavClick = (view) => {
    setCurrentView(view);
    setSubView(null);
  };

  const getProfileAbbr = () => {
    return role === 'admin' ? 'AD' : 'DS';
  };

  const getProfileTitle = () => {
    return role === 'admin' ? 'Agape Care Admin' : 'Agape Care Dispatch';
  };

  const renderTopBar = (title, showBack = false) => (
    <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-gray-100 shrink-0 sticky top-0 z-50">
      <div className="flex items-center gap-3">
        {showBack && (
          <button onClick={() => setSubView(null)} className="p-1.5 -ml-1.5 mr-1 text-gray-400 hover:text-gray-600 rounded-full bg-gray-50">
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 font-semibold border border-blue-100 shrink-0">
          <span className="text-xs">{getProfileAbbr()}</span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-sm text-gray-900">{title}</h1>
          </div>
          <p className="text-[10px] text-gray-500 font-medium truncate max-w-[220px]">{currentUser}</p>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    // Handle Sub-views (from Menu)
    if (subView === 'reports') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
          {renderTopBar('Reports & Export', true)}
          <div className="flex-1 overflow-y-auto">
             <ReportsPage {...props} />
          </div>
        </div>
      );
    }

    if (subView === 'admin') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
          {renderTopBar('User Management', true)}
          <div className="flex-1 overflow-y-auto">
             <AdminPage {...props} />
          </div>
        </div>
      );
    }

    if (subView === 'archives') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
          {renderTopBar('Archives', true)}
          <div className="flex-1 overflow-hidden">
            <ArchivesPage {...props} />
          </div>
        </div>
      );
    }

    if (subView === 'settings') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
          {renderTopBar('Settings', true)}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <SettingsPage {...props} />
          </div>
        </div>
      );
    }

    if (subView === 'fleet') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
          {renderTopBar('Fleet Management', true)}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <DriversVehiclesPage {...props} />
          </div>
        </div>
      );
    }

    if (subView === 'map') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
          {renderTopBar('Live Map', true)}
          <div className="flex-1 overflow-hidden">
            <LiveMapPage trips={trips} drivers={drivers} />
          </div>
        </div>
      );
    }

    // Main Navigation Views
    if (currentView === 'trips' || currentView === 'fleet') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col relative bg-gray-50">
          <div className="absolute inset-0">
            <MobileDispatchView {...props} activeTab={currentView === 'trips' ? 'trips' : 'drivers'} expandedId={expandedId} setExpandedId={setExpandedId} />
          </div>
        </div>
      );
    }

    if (currentView === 'reports') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
          {renderTopBar('Reports & Export')}
          <div className="flex-1 overflow-y-auto">
            <ReportsPage {...props} />
          </div>
        </div>
      );
    }

    if (currentView === 'drive') {
      if (!activeDriverWorkDriver) {
        return (
          <div className="flex-1 bg-gray-50 flex items-center justify-center p-8 text-center">
            <div>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Truck size={26} />
              </div>
              <p className="text-sm font-semibold text-slate-700">No driver profile available</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">Assign drivers to this account to operate driver workflows.</p>
            </div>
          </div>
        );
      }

      const liveStatus = getDriverLiveStatus(activeDriverWorkDriver);
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
          <div className="shrink-0 border-b border-gray-200 bg-white px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#2b4c7e]">{role === 'admin' ? 'Admin Driver Work' : 'Dispatcher Driver Work'}</p>
                <p className="mt-0.5 truncate text-sm font-bold text-gray-900">Operate as driver</p>
              </div>
              <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold ${liveStatus.color}`}>{liveStatus.label}</span>
            </div>
            <select
              value={activeDriverWorkDriver.id}
              onChange={(event) => setDriverWorkDriverId(event.target.value)}
              className="mt-3 h-11 w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-800 outline-none focus:border-[#2b4c7e] focus:ring-2 focus:ring-[#2b4c7e]/15"
            >
              {driverWorkDrivers.map((driver) => (
                <option key={driver.id || driver.email || driver.name} value={driver.id}>
                  {driver.name || driver.email || driver.id} - {driver.vehicle || 'No vehicle'}
                </option>
              ))}
            </select>
          </div>
          <div className="min-h-0 flex-1">
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
          </div>
        </div>
      );
    }

    if (currentView === 'map') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col relative bg-gray-50">
          <div className="absolute inset-0">
            <LiveMapPage {...props} />
          </div>
        </div>
      );
    }

    if (currentView === 'chat') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50 items-center justify-center text-slate-400 text-sm">
          Chat coming soon
        </div>
      );
    }

    if (currentView === 'menu') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
          <MobileMenuPage {...props} setSubView={setSubView} />
        </div>
      );
    }

    return null;
  };

  return (
    <div className="w-full h-[100dvh] bg-white flex flex-col relative overflow-hidden pb-[100px]">
      {/* Dynamic Content */}
      {renderContent()}

      {/* BOTTOM NAVIGATION */}
      <nav className="bottom-nav">
        <div className="flex h-full items-center justify-around gap-1">
          {(() => {
            const expandedTrip = expandedId ? trips.find(t => t.id === expandedId) : null;
            const patientName = expandedTrip?.patient || '';
            const nameParts = patientName.trim().split(/\s+/).filter(Boolean);
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';
            const showStackedName = expandedTrip && currentView === 'trips';

            return (
              <>
                <button
                  onClick={() => { handleNavClick('trips'); setExpandedId(null); }}
                  className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 transition-all duration-200 min-h-[56px] ${currentView === 'trips' && !subView ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
                >
                  {showStackedName ? (
                    <>
                      <User size={22} strokeWidth={2} className="text-blue-600" />
                      <div className="flex flex-col items-center leading-tight mt-0.5">
                        <span className="text-[10px] font-bold text-blue-600">{firstName}</span>
                        {lastName && <span className="text-[10px] font-bold text-blue-600">{lastName}</span>}
                      </div>
                    </>
                  ) : (
                    <>
                      <Home size={24} strokeWidth={currentView === 'trips' && !subView ? 2.2 : 1.6} />
                      <span className={`max-w-full truncate text-[11px] font-medium leading-none mt-1 ${currentView === 'trips' && !subView ? 'text-blue-600' : 'text-slate-400'}`}>Trips</span>
                    </>
                  )}
                </button>

                {driverWorkDrivers.length > 0 ? (
                <button
                  onClick={() => handleNavClick('drive')}
                  className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 transition-all duration-200 min-h-[56px] ${currentView === 'drive' && !subView ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
                >
                  <User size={24} strokeWidth={currentView === 'drive' && !subView ? 2.2 : 1.6} />
                  <span className={`max-w-full truncate text-[11px] font-medium leading-none mt-1 ${currentView === 'drive' && !subView ? 'text-blue-600' : 'text-slate-400'}`}>Drive</span>
                </button>
                ) : (
                <button
                  onClick={() => handleNavClick('map')}
                  className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 transition-all duration-200 min-h-[56px] ${currentView === 'map' && !subView ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
                >
                  <Map size={24} strokeWidth={currentView === 'map' && !subView ? 2.2 : 1.6} />
                  <span className={`max-w-full truncate text-[11px] font-medium leading-none mt-1 ${currentView === 'map' && !subView ? 'text-blue-600' : 'text-slate-400'}`}>Map</span>
                </button>
                )}

                <button
                  onClick={() => handleNavClick('reports')}
                  className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 transition-all duration-200 min-h-[56px] ${currentView === 'reports' && !subView ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
                >
                  <BarChart2 size={24} strokeWidth={currentView === 'reports' && !subView ? 2.2 : 1.6} />
                  <span className={`max-w-full truncate text-[11px] font-medium leading-none mt-1 ${currentView === 'reports' && !subView ? 'text-blue-600' : 'text-slate-400'}`}>Reports</span>
                </button>

                <button
                  onClick={() => handleNavClick('chat')}
                  className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 transition-all duration-200 min-h-[56px] ${currentView === 'chat' && !subView ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
                >
                  <MessageCircle size={24} strokeWidth={currentView === 'chat' && !subView ? 2.2 : 1.6} />
                  <span className={`max-w-full truncate text-[11px] font-medium leading-none mt-1 ${currentView === 'chat' && !subView ? 'text-blue-600' : 'text-slate-400'}`}>Chat</span>
                </button>

                <button
                  onClick={() => handleNavClick('menu')}
                  className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 py-1.5 transition-all duration-200 min-h-[56px] ${currentView === 'menu' || subView ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}
                >
                  <Menu size={24} strokeWidth={currentView === 'menu' || subView ? 2.2 : 1.6} />
                  <span className={`max-w-full truncate text-[11px] font-medium leading-none mt-1 ${currentView === 'menu' || subView ? 'text-blue-600' : 'text-slate-400'}`}>More</span>
                </button>
              </>
            );
          })()}
        </div>
      </nav>
    </div>
  );
};

export default MobileEnterpriseDashboard;
