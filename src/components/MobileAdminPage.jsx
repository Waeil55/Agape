import React, { useDeferredValue, useMemo, useState, useRef, useEffect } from 'react';
import { Activity, BellRing, Briefcase, CheckCircle2, CircleDot, Clock3, KeyRound, LayoutDashboard, Mail, Phone, RadioTower, Search, ShieldCheck, TrendingUp, Truck, Users, Wrench, ServerCog, Upload } from 'lucide-react';
import { getDriverLiveStatus } from '../constants/statuses';
import { auth, sendPasswordResetEmail } from '../config/firebase';
import { recordMatchesSearch } from '../utils/search';
import {
  AdminShell, AdminCard, AdminCardHead, AdminBadge, AdminButton,
  AdminIconButton, AdminAvatar, AdminSearch, AdminEmpty,
} from './admin/AdminKit';
import DriversVehiclesPage from './DriversVehiclesPage';
import { buildDriverIndex, findDriverInIndex } from '../utils/driverIndex';
import { localCalendarYmd, tripMatchesServiceDate } from '../utils/tripDate';
import SystemControlCenter from './admin/SystemControlCenter';

const MOBILE_ADMIN_LIST_PAGE_SIZE = 40;

const ACTIVE_TRIP_STATUSES = new Set([
  'Assigned', 'In Progress', 'In Mission', 'En Route', 'Navigating Pickup',
  'At Pickup', 'In Transit', 'Navigating Dropoff', 'At Dropoff', 'Arrived',
]);

const TERMINAL_TRIP_STATUSES = new Set(['Completed', 'Cancelled', 'No Show', 'Rerouted']);

const liveTone = (label) => {
  const l = String(label || '').toLowerCase();
  if (l.includes('offline')) return 'offline';
  if (l.includes('trip') || l.includes('busy')) return 'busy';
  return 'online';
};

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const tripLabel = (trip) => (
  trip?.patient || trip?.memberName || trip?.clientName || trip?.bookingId || trip?.id || 'Assigned trip'
);

const tripMeta = (trip) => (
  [
    trip?.time || trip?.pickupTime || trip?.appointmentTime || trip?.date,
    trip?.driverName || trip?.driver || trip?.driverEmail || 'Unassigned',
  ].filter(Boolean).join(' - ')
);

const MobileMetric = ({ icon: Icon, label, value, hint, tone = 'brand' }) => (
  <div className={`flex items-center gap-2.5 flex-1 min-w-0 rounded-xl border px-2.5 py-2.5 shadow-sm ${
    tone === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
    : tone === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-700'
    : tone === 'danger' ? 'bg-rose-50 border-rose-200 text-rose-700'
    : tone === 'info' ? 'bg-blue-50 border-blue-200 text-blue-700'
    : 'bg-white border-slate-200 text-slate-700'
  }`}>
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
      tone === 'success' ? 'bg-emerald-100'
      : tone === 'warning' ? 'bg-amber-100'
      : tone === 'danger' ? 'bg-rose-100'
      : tone === 'info' ? 'bg-blue-100'
      : 'bg-slate-100'
    }`}>
      {Icon && <Icon size={17} />}
    </div>
    <div className="min-w-0">
      <p className="text-base font-black tabular-nums">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      {hint && <p className="text-[9px] font-semibold opacity-60">{hint}</p>}
    </div>
  </div>
);

const MobileCommandSignals = ({ openTrips, activeTrips, unassignedTrips, offlineDrivers }) => (
  <AdminCard pad={false} className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
    <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-100">
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Command signals</p>
        <h3 className="text-sm font-bold text-slate-900">Operational health</h3>
      </div>
      <AdminBadge tone={unassignedTrips.length || offlineDrivers ? 'warning' : 'online'} dot>
        {unassignedTrips.length || offlineDrivers ? 'Watch' : 'Stable'}
      </AdminBadge>
    </div>
    <div className="grid grid-cols-4 gap-2 px-3.5 py-3">
      <div className="flex flex-col items-center gap-0.5 text-center"><TrendingUp size={16} className="text-slate-500" /><strong className="text-lg font-black tabular-nums text-slate-900">{openTrips.length}</strong><span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Open</span></div>
      <div className="flex flex-col items-center gap-0.5 text-center"><RadioTower size={16} className="text-blue-500" /><strong className="text-lg font-black tabular-nums text-slate-900">{activeTrips.length}</strong><span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Live</span></div>
      <div className="flex flex-col items-center gap-0.5 text-center"><BellRing size={16} className="text-amber-500" /><strong className="text-lg font-black tabular-nums text-slate-900">{unassignedTrips.length}</strong><span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Dispatch</span></div>
      <div className="flex flex-col items-center gap-0.5 text-center"><CircleDot size={16} className="text-rose-500" /><strong className="text-lg font-black tabular-nums text-slate-900">{offlineDrivers}</strong><span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Offline</span></div>
    </div>
  </AdminCard>
);

const MobilePriorityStack = ({ trips = [] }) => (
  <AdminCard pad={false} className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
    <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-100">
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Priority stack</p>
        <h3 className="text-sm font-bold text-slate-900">Trips to watch</h3>
      </div>
      <AdminBadge tone={trips.length ? 'danger' : 'success'}>{trips.length ? trips.length : 'Clear'}</AdminBadge>
    </div>
    <div className="divide-y divide-slate-100">
      {trips.slice(0, 4).map((trip, index) => (
        <div key={trip.id || trip.bookingId || index} className="flex items-center gap-3 px-3.5 py-2.5">
          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[11px] font-bold text-slate-600 shrink-0">{index + 1}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <strong className="text-xs font-bold text-slate-900 truncate">{tripLabel(trip)}</strong>
              <AdminBadge tone={!trip.driverId || trip.status === 'Unassigned' ? 'danger' : 'warning'}>{trip.status || 'Open'}</AdminBadge>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">{tripMeta(trip)}</span>
          </div>
        </div>
      ))}
      {trips.length === 0 && (
        <div className="flex items-center gap-2 px-3.5 py-4 text-emerald-600">
          <CheckCircle2 size={20} />
          <span className="text-xs font-semibold">No urgent dispatch items</span>
        </div>
      )}
    </div>
  </AdminCard>
);

const MobileDriverCard = ({ driver, activeTrip }) => {
  const live = getDriverLiveStatus(driver);
  return (
    <AdminCard pad={false} className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <AdminAvatar name={driver.name} brand size={46} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-bold text-slate-900 truncate">{driver.name || 'Unnamed driver'}</h3>
            <AdminBadge tone={liveTone(live.label)} dot>{live.label}</AdminBadge>
          </div>
          <p className="text-[11px] text-slate-500 font-medium truncate">{driver.vehicle || 'No vehicle assigned'}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 px-3.5 py-2 border-t border-slate-100">
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Phone</span>
          <strong className="text-xs font-bold text-slate-900 block">{driver.phone || '--'}</strong>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Zone</span>
          <strong className="text-xs font-bold text-slate-900 block">{driver.currentZone || '--'}</strong>
        </div>
      </div>
      {activeTrip && (
        <div className="flex items-center justify-between px-3.5 py-2 bg-blue-50 border-t border-blue-100">
          <div>
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">{activeTrip.status || 'Active'}</span>
            <strong className="text-xs font-bold text-blue-900 block">{tripLabel(activeTrip)}</strong>
          </div>
          <Clock3 size={16} className="text-blue-500" />
        </div>
      )}
    </AdminCard>
  );
};

const MobilePersonCard = ({ user, role, live, pwResetMsg, onRoleChange, onResetPassword }) => (
  <AdminCard pad={false} className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
    <div className="flex items-center gap-3 px-3.5 py-3">
      <AdminAvatar name={user.name} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-bold text-slate-900 truncate">{user.name || 'Unnamed user'}</h3>
          {user._role === 'driver' ? (
            <AdminBadge tone={liveTone(live?.label)} dot>{live?.label || 'Driver'}</AdminBadge>
          ) : (
            <AdminBadge tone="info" dot>Dispatcher</AdminBadge>
          )}
        </div>
        <p className="text-[11px] text-slate-500 font-medium truncate">{user.email || 'No email'}</p>
      </div>
    </div>
    <div className="flex flex-col gap-1 px-3.5 py-2 border-t border-slate-100">
      <span className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium"><Mail size={14} /> {user.email || 'No email'}</span>
      <span className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium"><Phone size={14} /> {user.phone || 'No phone'}</span>
    </div>
    <div className="flex items-center gap-2 px-3.5 py-2.5 border-t border-slate-100">
      <select
        value={user._role}
        onChange={(event) => onRoleChange(user, event.target.value)}
        className="min-h-9 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 focus:border-blue-500 outline-none"
      >
        {role === 'admin' && <option value="admin">Admin</option>}
        <option value="dispatcher">Dispatcher</option>
        <option value="driver">Driver</option>
      </select>
      <div className="flex items-center gap-2">
        {pwResetMsg[user.email] && <span className="text-[10px] font-semibold text-emerald-600">{pwResetMsg[user.email]}</span>}
        {user.email && (
          <AdminIconButton onClick={() => onResetPassword(user.email)} title="Send password reset">
            <KeyRound size={15} />
          </AdminIconButton>
        )}
      </div>
    </div>
  </AdminCard>
);

const MobileActivityItem = ({ log }) => (
  <div className="flex items-start gap-3 px-3.5 py-2.5">
    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
      log.c === 'rose' ? 'bg-rose-500' : log.c === 'amber' ? 'bg-amber-500' : log.c === 'emerald' ? 'bg-emerald-500' : 'bg-slate-400'
    }`} />
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between">
        <strong className="text-xs font-bold text-slate-900">{log.t || 'Activity'}</strong>
        <span className="text-[10px] text-slate-500 font-semibold">{formatTime(log.time)}</span>
      </div>
      <p className="text-[11px] text-slate-500 font-medium">{log.meta?.summary || log.d || 'System update'}</p>
    </div>
  </div>
);

const MobileAdminPage = ({
  drivers = [],
  dispatchers = [],
  trips = [],
  logs = [],
  setDrivers,
  setDispatchers,
  currentUser,
  role,
  requestAuthAction,
  addAuditLog,
  vehicles = [],
  setVehicles,
  upsertDriverProfile,
  assignVehicleToDriver,
  onAssignTrip,
  onUploadForDriver,
  onShowUploadModal,
  appSettings = {},
  onUpdateAppSettings,
  updateAppSettings,
  isLoading = false,
  readOnly = false,
}) => {
  const [pwResetMsg, setPwResetMsg] = useState({});
  const [activeTab, setActiveTab] = useState('overview');
  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleLimit, setPeopleLimit] = useState(MOBILE_ADMIN_LIST_PAGE_SIZE);
  const deferredPeopleQuery = useDeferredValue(peopleQuery);
  const driverIndex = useMemo(() => buildDriverIndex(drivers), [drivers]);
  const serviceDate = localCalendarYmd();
  const serviceTrips = useMemo(
    () => trips.filter((trip) => tripMatchesServiceDate(trip, serviceDate)),
    [trips, serviceDate],
  );

  const allUsers = useMemo(() => (
    [
      ...dispatchers.map(d => ({ ...d, _role: 'dispatcher', _source: 'dispatchers' })),
      ...drivers.map(d => ({ ...d, _role: 'driver', _source: 'drivers' })),
    ].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  ), [dispatchers, drivers]);

  const openTrips = useMemo(() => serviceTrips.filter(t => !TERMINAL_TRIP_STATUSES.has(t.status)), [serviceTrips]);
  const activeTrips = useMemo(() => serviceTrips.filter(t => ACTIVE_TRIP_STATUSES.has(t.status)), [serviceTrips]);
  const unassignedTrips = useMemo(() => openTrips.filter(t => !t.driverId || t.status === 'Unassigned'), [openTrips]);
  const attentionTrips = useMemo(() => {
    const ranked = [...openTrips].sort((a, b) => {
      const aNeedsDriver = (!a.driverId || a.status === 'Unassigned') ? 0 : 1;
      const bNeedsDriver = (!b.driverId || b.status === 'Unassigned') ? 0 : 1;
      return aNeedsDriver - bNeedsDriver;
    });
    return ranked.slice(0, 6);
  }, [openTrips]);

  const activeTripsByDriver = useMemo(() => {
    const map = new Map();
    serviceTrips.forEach((trip) => {
      if (!ACTIVE_TRIP_STATUSES.has(trip.status)) return;
      const driver = findDriverInIndex(driverIndex, trip);
      if (driver && !map.has(driver.id)) map.set(driver.id, trip);
    });
    return map;
  }, [driverIndex, serviceTrips]);

  const driverStatusCounts = useMemo(() => {
    let online = 0;
    let busy = 0;
    let offline = 0;
    drivers.forEach((driver) => {
      const tone = liveTone(getDriverLiveStatus(driver).label);
      if (tone === 'offline') offline += 1;
      else if (tone === 'busy') busy += 1;
      else online += 1;
    });
    return { online, busy, offline };
  }, [drivers]);

  const sortedDrivers = useMemo(() => (
    [...drivers]
      .filter(driver => driver.name)
      .sort((a, b) => {
        const aBusy = activeTripsByDriver.has(a.id) ? 0 : 1;
        const bBusy = activeTripsByDriver.has(b.id) ? 0 : 1;
        return aBusy - bBusy || String(a.name || '').localeCompare(String(b.name || ''));
      })
  ), [drivers, activeTripsByDriver]);

  const filteredUsers = useMemo(() => {
    const q = deferredPeopleQuery.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter(user => recordMatchesSearch(user, q, [
      'name', 'email', 'phone', 'vehicle', '_role',
    ]));
  }, [allUsers, deferredPeopleQuery]);
  const visibleUsers = useMemo(() => filteredUsers.slice(0, peopleLimit), [filteredUsers, peopleLimit]);

  useEffect(() => setPeopleLimit(MOBILE_ADMIN_LIST_PAGE_SIZE), [deferredPeopleQuery]);

  const timeoutRefs = useRef([]);
  useEffect(() => () => timeoutRefs.current.forEach(clearTimeout), []);

  const handlePasswordReset = async (email) => {
    if (!email) return;
    try {
      await sendPasswordResetEmail(auth, email);
      setPwResetMsg(prev => ({ ...prev, [email]: 'Email sent' }));
      timeoutRefs.current.push(setTimeout(() => setPwResetMsg(prev => { const next = { ...prev }; delete next[email]; return next; }), 3000));
    } catch (err) {
      setPwResetMsg(prev => ({ ...prev, [email]: err.message || 'Failed' }));
      timeoutRefs.current.push(setTimeout(() => setPwResetMsg(prev => { const next = { ...prev }; delete next[email]; return next; }), 3000));
    }
  };

  const handleRoleChange = (user, newRole) => {
    if (!user || !newRole || user._role === newRole) return;
    if (user._source === 'dispatchers') {
      setDispatchers(prev => prev.filter(d => d.id !== user.id));
      if (newRole === 'driver') {
        setDrivers(prev => [...prev, { id: user.id, name: user.name, email: user.email, status: 'Available', vehicle: '', phone: user.phone || '', schedule: [] }]);
      }
    } else if (user._source === 'drivers') {
      setDrivers(prev => prev.filter(d => d.id !== user.id));
      if (newRole === 'dispatcher') {
        setDispatchers(prev => [...prev, { id: user.id, name: user.name, email: user.email || `${String(user.name || 'dispatcher').replace(/\s+/g, '.').toLowerCase()}@auth.agapecare.local`, clockedIn: false, phone: user.phone || '' }]);
      }
    }
    addAuditLog?.('Role Changed', `${currentUser} changed ${user.name} from ${user._role} to ${newRole}`, 'amber');
  };

  const guardedRoleChange = (user, newRole) => {
    if (newRole === user._role) return;
    if (requestAuthAction) requestAuthAction(`Change role for ${user.name}`, () => handleRoleChange(user, newRole));
    else handleRoleChange(user, newRole);
  };

  const sections = [
    { id: 'overview', title: 'Command', label: 'Home', icon: LayoutDashboard, subtitle: `${openTrips.length} open trips` },
    { id: 'drivers', title: 'Fleet Board', label: 'Drivers', icon: Truck, subtitle: `${drivers.length} drivers`, badge: activeTrips.length || undefined },
    { id: 'fleet', title: 'Maintenance', label: 'Service', icon: Wrench, subtitle: `${vehicles.length} vehicles` },
    { id: 'people', title: 'People', label: 'People', icon: Users, subtitle: `${allUsers.length} profiles` },
    { id: 'activity', title: 'Activity', label: 'Activity', icon: Activity, subtitle: `${logs.length} events` },
    ...(role === 'admin' ? [{ id: 'system', title: 'System Control', label: 'System', icon: ServerCog, subtitle: 'Health, access, compliance' }] : []),
  ];

  const activeSection = sections.find(section => section.id === activeTab) || sections[0];
  const nav = [{ label: 'Mobile Admin', items: sections.map(({ ...section }) => ({ ...section, label: section.title })) }];
  const mobileNav = sections.map(section => ({ id: section.id, label: section.label, icon: section.icon }));

  return (
    <AdminShell
      nav={nav}
      active={activeTab}
      onNavigate={setActiveTab}
      mobileNav={mobileNav}
      mobileActive={activeTab}
      onMobileNavigate={setActiveTab}
      title={activeSection.title}
      subtitle={activeSection.subtitle}
      eyebrow=""
      hideBrand
      navInline
      actions={
        <div className="flex items-center gap-2">
          {onShowUploadModal && (
            <button
              type="button"
              onClick={() => onShowUploadModal(true)}
              className="min-h-9 w-9 rounded-lg bg-blue-500 text-white flex items-center justify-center active:scale-95 transition-transform shadow-sm"
              title="Upload CSV or scan trips"
            >
              <Upload size={15} />
            </button>
          )}
          <AdminBadge tone={unassignedTrips.length ? 'danger' : 'online'} dot>
            {unassignedTrips.length ? `${unassignedTrips.length} open` : 'Live'}
          </AdminBadge>
        </div>
      }
    >
      <div className="bg-slate-50 pb-24">
        {isLoading && <AdminEmpty title="Loading workspace" description="Refreshing today’s operational data…" />}
        {readOnly && <div role="status" className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">Read-only mode: operational changes are temporarily disabled.</div>}
        {activeTab === 'overview' && (
          <>
            <div className="flex items-start gap-3 px-4 py-4 bg-white border-b border-slate-200">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 text-blue-600"><ShieldCheck size={22} /></div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Agape command</p>
                <p className="text-xs font-semibold text-slate-700">Live team, trips, drivers, and access signals in one clean mobile workspace.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 px-3 py-3">
              <MobileMetric icon={Truck} value={drivers.length} label="Drivers" hint={`${driverStatusCounts.online} online`} />
              <MobileMetric icon={RadioTower} value={driverStatusCounts.busy} label="Busy" hint={`${activeTrips.length} trips`} tone="warning" />
              <MobileMetric icon={CircleDot} value={unassignedTrips.length} label="Open" hint="Need dispatch" tone={unassignedTrips.length ? 'danger' : 'success'} />
              <MobileMetric icon={Briefcase} value={dispatchers.length} label="Dispatchers" hint="Access desk" tone="info" />
            </div>

            <div className="px-3 pb-3">
              <MobileCommandSignals
                openTrips={openTrips}
                activeTrips={activeTrips}
                unassignedTrips={unassignedTrips}
                offlineDrivers={driverStatusCounts.offline}
              />
            </div>

            <div className="px-3 pb-3">
              <MobilePriorityStack trips={attentionTrips} />
            </div>

            <AdminCard pad={false} className="mx-3 mb-3 overflow-hidden rounded-xl bg-white border border-slate-200 shadow-sm">
              <AdminCardHead icon={Truck} title="Live Fleet" action={<AdminButton variant="ghost" size="sm" onClick={() => setActiveTab('drivers')}>View all</AdminButton>} />
              <div className="divide-y divide-slate-100">
                {sortedDrivers.slice(0, 6).map(driver => (
                  <MobileDriverCard key={driver.id || driver.email || driver.name} driver={driver} activeTrip={activeTripsByDriver.get(driver.id)} />
                ))}
                {sortedDrivers.length === 0 && <AdminEmpty icon={Truck} title="No drivers yet" />}
              </div>
            </AdminCard>

            <AdminCard pad={false} className="mx-3 mb-3 overflow-hidden rounded-xl bg-white border border-slate-200 shadow-sm">
              <AdminCardHead icon={Activity} title="Latest Activity" action={<AdminButton variant="ghost" size="sm" onClick={() => setActiveTab('activity')}>Timeline</AdminButton>} />
              <div className="divide-y divide-slate-100">
                {logs.slice(0, 5).map((log, index) => <MobileActivityItem key={log.id || index} log={log} />)}
                {logs.length === 0 && <AdminEmpty icon={Activity} title="No activity yet" />}
              </div>
            </AdminCard>
          </>
        )}

        {activeTab === 'drivers' && (
          <DriversVehiclesPage
            role={role} drivers={drivers} setDrivers={setDrivers}
            upsertDriverProfile={upsertDriverProfile} assignVehicleToDriver={assignVehicleToDriver}
            dispatchers={dispatchers} addAuditLog={addAuditLog} currentUser={currentUser}
            trips={trips} onAssignTrip={onAssignTrip} onUploadForDriver={onUploadForDriver}
            requestAuthAction={requestAuthAction} vehicles={vehicles} setVehicles={setVehicles}
            appSettings={appSettings} onUpdateAppSettings={onUpdateAppSettings || updateAppSettings} mode="drivers"
          />
        )}

        {activeTab === 'fleet' && (
          <DriversVehiclesPage
            role={role} drivers={drivers} setDrivers={setDrivers}
            upsertDriverProfile={upsertDriverProfile} assignVehicleToDriver={assignVehicleToDriver}
            dispatchers={dispatchers} addAuditLog={addAuditLog} currentUser={currentUser}
            trips={trips} onAssignTrip={onAssignTrip} onUploadForDriver={onUploadForDriver}
            requestAuthAction={requestAuthAction} vehicles={vehicles} setVehicles={setVehicles}
            appSettings={appSettings} onUpdateAppSettings={onUpdateAppSettings || updateAppSettings} mode="vehicles"
          />
        )}

        {activeTab === 'people' && (
          <>
            <AdminSearch icon={Search} value={peopleQuery} onChange={setPeopleQuery} placeholder="Search people, role, phone..." />
            <div className="space-y-3 px-3 py-3">
              {visibleUsers.map((user, index) => (
                <MobilePersonCard
                  key={`${user._source}-${user.id || user.email || index}`}
                  user={user}
                  role={role}
                  live={user._role === 'driver' ? getDriverLiveStatus(user) : null}
                  pwResetMsg={pwResetMsg}
                  onRoleChange={guardedRoleChange}
                  onResetPassword={handlePasswordReset}
                />
              ))}
              {filteredUsers.length === 0 && <AdminEmpty icon={Users} title="No matching people" hint="Try another name, role, phone, or email" />}
              {visibleUsers.length < filteredUsers.length && (
                <AdminButton variant="secondary" onClick={() => setPeopleLimit(limit => limit + MOBILE_ADMIN_LIST_PAGE_SIZE)}>Load more people</AdminButton>
              )}
            </div>
          </>
        )}

        {activeTab === 'activity' && (
          <AdminCard pad={false} className="mx-3 mt-3 overflow-hidden rounded-xl bg-white border border-slate-200 shadow-sm">
            <AdminCardHead icon={Activity} title="System Timeline" />
            <div className="divide-y divide-slate-100">
              {logs.slice(0, 50).map((log, index) => <MobileActivityItem key={log.id || index} log={log} />)}
              {logs.length === 0 && <AdminEmpty icon={Activity} title="No activity yet" />}
            </div>
          </AdminCard>
        )}
        {activeTab === 'system' && (
          <SystemControlCenter trips={trips} drivers={drivers} vehicles={vehicles} logs={logs} appSettings={appSettings} />
        )}
      </div>
    </AdminShell>
  );
};

export default React.memo(MobileAdminPage);
