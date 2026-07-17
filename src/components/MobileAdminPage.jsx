import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  Activity, BellRing, Briefcase, CheckCircle2, CircleDot, Clock3, KeyRound,
  LayoutDashboard, Loader2, Mail, Phone, RadioTower, Search, ShieldCheck,
  TrendingUp, Truck, Users,
} from 'lucide-react';
import { getDriverLiveStatus } from '../constants/statuses';
import { auth, sendPasswordResetEmail } from '../config/firebase';
import {
  AdminShell, AdminCard, AdminCardHead, AdminBadge, AdminButton,
  AdminIconButton, AdminAvatar, AdminSearch, AdminEmpty,
} from './admin/AdminKit';

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
  <div className={`mobile-admin-metric mobile-admin-metric--${tone}`}>
    <div className="mobile-admin-metric-icon">{Icon && <Icon size={17} />}</div>
    <div className="min-w-0">
      <p className="mobile-admin-metric-value">{value}</p>
      <p className="mobile-admin-metric-label">{label}</p>
      {hint && <p className="mobile-admin-metric-hint">{hint}</p>}
    </div>
  </div>
);

const MobileCommandSignals = ({ openTrips, activeTrips, unassignedTrips, offlineDrivers }) => (
  <AdminCard pad={false} className="mobile-admin-command-card">
    <div className="mobile-admin-command-head">
      <div>
        <p>Command signals</p>
        <h3>Operational health</h3>
      </div>
      <AdminBadge tone={unassignedTrips.length || offlineDrivers ? 'warning' : 'online'} dot>
        {unassignedTrips.length || offlineDrivers ? 'Watch' : 'Stable'}
      </AdminBadge>
    </div>
    <div className="mobile-admin-signal-grid">
      <div><TrendingUp size={16} /><strong>{openTrips.length}</strong><span>Open</span></div>
      <div><RadioTower size={16} /><strong>{activeTrips.length}</strong><span>Live</span></div>
      <div><BellRing size={16} /><strong>{unassignedTrips.length}</strong><span>Dispatch</span></div>
      <div><CircleDot size={16} /><strong>{offlineDrivers}</strong><span>Offline</span></div>
    </div>
  </AdminCard>
);

const MobilePriorityStack = ({ trips = [] }) => (
  <AdminCard pad={false} className="mobile-admin-command-card">
    <div className="mobile-admin-command-head">
      <div>
        <p>Priority stack</p>
        <h3>Trips to watch</h3>
      </div>
      <AdminBadge tone={trips.length ? 'danger' : 'success'}>{trips.length ? trips.length : 'Clear'}</AdminBadge>
    </div>
    <div className="mobile-admin-priority-list">
      {trips.slice(0, 4).map((trip, index) => (
        <div key={trip.id || trip.bookingId || index} className="mobile-admin-priority-row">
          <div className="mobile-admin-priority-rank">{index + 1}</div>
          <div className="min-w-0 flex-1">
            <div className="mobile-admin-priority-title">
              <strong>{tripLabel(trip)}</strong>
              <AdminBadge tone={!trip.driverId || trip.status === 'Unassigned' ? 'danger' : 'warning'}>{trip.status || 'Open'}</AdminBadge>
            </div>
            <span>{tripMeta(trip)}</span>
          </div>
        </div>
      ))}
      {trips.length === 0 && (
        <div className="mobile-admin-clear-state">
          <CheckCircle2 size={20} />
          <span>No urgent dispatch items</span>
        </div>
      )}
    </div>
  </AdminCard>
);

const MobileDriverCard = ({ driver, activeTrip }) => {
  const live = getDriverLiveStatus(driver);
  return (
    <AdminCard pad={false} className="mobile-admin-driver-card">
      <div className="mobile-admin-card-top">
        <AdminAvatar name={driver.name} brand size={46} />
        <div className="min-w-0 flex-1">
          <div className="mobile-admin-card-title-row">
            <h3>{driver.name || 'Unnamed driver'}</h3>
            <AdminBadge tone={liveTone(live.label)} dot>{live.label}</AdminBadge>
          </div>
          <p>{driver.vehicle || 'No vehicle assigned'}</p>
        </div>
      </div>
      <div className="mobile-admin-field-grid">
        <div>
          <span>Phone</span>
          <strong>{driver.phone || '--'}</strong>
        </div>
        <div>
          <span>Zone</span>
          <strong>{driver.currentZone || '--'}</strong>
        </div>
      </div>
      {activeTrip && (
        <div className="mobile-admin-trip-strip">
          <div>
            <span>{activeTrip.status || 'Active'}</span>
            <strong>{tripLabel(activeTrip)}</strong>
          </div>
          <Clock3 size={16} />
        </div>
      )}
    </AdminCard>
  );
};

const MobilePersonCard = ({ user, role, live, pwResetMsg, onRoleChange, onResetPassword }) => (
  <AdminCard pad={false} className="mobile-admin-person-card">
    <div className="mobile-admin-card-top">
      <AdminAvatar name={user.name} size={44} />
      <div className="min-w-0 flex-1">
        <div className="mobile-admin-card-title-row">
          <h3>{user.name || 'Unnamed user'}</h3>
          {user._role === 'driver' ? (
            <AdminBadge tone={liveTone(live?.label)} dot>{live?.label || 'Driver'}</AdminBadge>
          ) : (
            <AdminBadge tone="info" dot>Dispatcher</AdminBadge>
          )}
        </div>
        <p>{user.email || 'No email'}</p>
      </div>
    </div>
    <div className="mobile-admin-contact-lines">
      <span><Mail size={14} /> {user.email || 'No email'}</span>
      <span><Phone size={14} /> {user.phone || 'No phone'}</span>
    </div>
    <div className="mobile-admin-person-actions">
      <select
        value={user._role}
        onChange={(event) => onRoleChange(user, event.target.value)}
        className="adm-select"
      >
        {role === 'admin' && <option value="admin">Admin</option>}
        <option value="dispatcher">Dispatcher</option>
        <option value="driver">Driver</option>
      </select>
      <div className="flex items-center gap-2">
        {pwResetMsg[user.email] && <span className="mobile-admin-reset-note">{pwResetMsg[user.email]}</span>}
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
  <div className="mobile-admin-activity-item">
    <div className={`mobile-admin-activity-dot ${log.c === 'rose' ? 'is-danger' : log.c === 'amber' ? 'is-warning' : log.c === 'emerald' ? 'is-success' : ''}`} />
    <div className="min-w-0 flex-1">
      <div className="mobile-admin-activity-head">
        <strong>{log.t || 'Activity'}</strong>
        <span>{formatTime(log.time)}</span>
      </div>
      <p>{log.meta?.summary || log.d || 'System update'}</p>
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
}) => {
  const [pwResetMsg, setPwResetMsg] = useState({});
  const [activeTab, setActiveTab] = useState('overview');
  const [driverQuery, setDriverQuery] = useState('');
  const [peopleQuery, setPeopleQuery] = useState('');

  const allUsers = useMemo(() => (
    [
      ...dispatchers.map(d => ({ ...d, _role: 'dispatcher', _source: 'dispatchers' })),
      ...drivers.map(d => ({ ...d, _role: 'driver', _source: 'drivers' })),
    ].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  ), [dispatchers, drivers]);

  const openTrips = useMemo(() => trips.filter(t => !TERMINAL_TRIP_STATUSES.has(t.status)), [trips]);
  const activeTrips = useMemo(() => trips.filter(t => ACTIVE_TRIP_STATUSES.has(t.status)), [trips]);
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
    trips.forEach((trip) => {
      if (!ACTIVE_TRIP_STATUSES.has(trip.status)) return;
      const driver = drivers.find((entry) => (
        entry.id === trip.driverId ||
        entry.name === trip.driverName ||
        String(entry.email || '').trim().toLowerCase() === String(trip.driverEmail || '').trim().toLowerCase()
      ));
      if (driver && !map.has(driver.id)) map.set(driver.id, trip);
    });
    return map;
  }, [drivers, trips]);

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

  const filteredDrivers = useMemo(() => {
    const q = driverQuery.trim().toLowerCase();
    if (!q) return sortedDrivers;
    return sortedDrivers.filter((driver) => (
      String(driver.name || '').toLowerCase().includes(q) ||
      String(driver.email || '').toLowerCase().includes(q) ||
      String(driver.vehicle || '').toLowerCase().includes(q) ||
      String(driver.currentZone || '').toLowerCase().includes(q)
    ));
  }, [driverQuery, sortedDrivers]);

  const filteredUsers = useMemo(() => {
    const q = peopleQuery.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter((user) => (
      String(user.name || '').toLowerCase().includes(q) ||
      String(user.email || '').toLowerCase().includes(q) ||
      String(user.phone || '').toLowerCase().includes(q) ||
      String(user.vehicle || '').toLowerCase().includes(q) ||
      String(user._role || '').toLowerCase().includes(q)
    ));
  }, [allUsers, peopleQuery]);

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
    { id: 'people', title: 'People', label: 'People', icon: Users, subtitle: `${allUsers.length} profiles` },
    { id: 'activity', title: 'Activity', label: 'Activity', icon: Activity, subtitle: `${logs.length} events` },
  ];

  const activeSection = sections.find(section => section.id === activeTab) || sections[0];
  const nav = [{ label: 'Mobile Admin', items: sections.map(({ label: _label, ...section }) => ({ ...section, label: section.title })) }];
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
        <AdminBadge tone={unassignedTrips.length ? 'danger' : 'online'} dot>
          {unassignedTrips.length ? `${unassignedTrips.length} open` : 'Live'}
        </AdminBadge>
      }
    >
      <div className="mobile-admin-page">
        {activeTab === 'overview' && (
          <>
            <div className="mobile-admin-hero">
              <div className="mobile-admin-hero-icon"><ShieldCheck size={22} /></div>
              <div className="min-w-0">
                <p className="mobile-admin-eyebrow">Agape command</p>
                <p>Live team, trips, drivers, and access signals in one clean mobile workspace.</p>
              </div>
            </div>

            <div className="mobile-admin-metric-grid">
              <MobileMetric icon={Truck} value={drivers.length} label="Drivers" hint={`${driverStatusCounts.online} online`} />
              <MobileMetric icon={RadioTower} value={driverStatusCounts.busy} label="Busy" hint={`${activeTrips.length} trips`} tone="warning" />
              <MobileMetric icon={CircleDot} value={unassignedTrips.length} label="Open" hint="Need dispatch" tone={unassignedTrips.length ? 'danger' : 'success'} />
              <MobileMetric icon={Briefcase} value={dispatchers.length} label="Dispatchers" hint="Access desk" tone="info" />
            </div>

            <MobileCommandSignals
              openTrips={openTrips}
              activeTrips={activeTrips}
              unassignedTrips={unassignedTrips}
              offlineDrivers={driverStatusCounts.offline}
            />

            <MobilePriorityStack trips={attentionTrips} />

            <AdminCard pad={false} className="overflow-hidden">
              <AdminCardHead icon={Truck} title="Live Fleet" action={<AdminButton variant="ghost" size="sm" onClick={() => setActiveTab('drivers')}>View all</AdminButton>} />
              <div className="mobile-admin-list">
                {sortedDrivers.slice(0, 6).map(driver => (
                  <MobileDriverCard key={driver.id || driver.email || driver.name} driver={driver} activeTrip={activeTripsByDriver.get(driver.id)} />
                ))}
                {sortedDrivers.length === 0 && <AdminEmpty icon={Truck} title="No drivers yet" />}
              </div>
            </AdminCard>

            <AdminCard pad={false} className="overflow-hidden">
              <AdminCardHead icon={Activity} title="Latest Activity" action={<AdminButton variant="ghost" size="sm" onClick={() => setActiveTab('activity')}>Timeline</AdminButton>} />
              <div className="mobile-admin-activity-list">
                {logs.slice(0, 5).map((log, index) => <MobileActivityItem key={log.id || index} log={log} />)}
                {logs.length === 0 && <AdminEmpty icon={Activity} title="No activity yet" />}
              </div>
            </AdminCard>
          </>
        )}

        {activeTab === 'drivers' && (
          <>
            <AdminSearch icon={Search} value={driverQuery} onChange={setDriverQuery} placeholder="Search drivers, vehicle, zone..." />
            <div className="mobile-admin-list">
              {filteredDrivers.map(driver => (
                <MobileDriverCard key={driver.id || driver.email || driver.name} driver={driver} activeTrip={activeTripsByDriver.get(driver.id)} />
              ))}
              {filteredDrivers.length === 0 && <AdminEmpty icon={Truck} title="No matching drivers" hint="Try another name, vehicle, or zone" />}
            </div>
          </>
        )}

        {activeTab === 'people' && (
          <>
            <AdminSearch icon={Search} value={peopleQuery} onChange={setPeopleQuery} placeholder="Search people, role, phone..." />
            <div className="mobile-admin-list">
              {filteredUsers.map((user, index) => (
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
            </div>
          </>
        )}

        {activeTab === 'activity' && (
          <AdminCard pad={false} className="overflow-hidden">
            <AdminCardHead icon={Activity} title="System Timeline" />
            <div className="mobile-admin-activity-list">
              {logs.slice(0, 50).map((log, index) => <MobileActivityItem key={log.id || index} log={log} />)}
              {logs.length === 0 && <AdminEmpty icon={Activity} title="No activity yet" />}
            </div>
          </AdminCard>
        )}
      </div>
    </AdminShell>
  );
};

export default MobileAdminPage;
